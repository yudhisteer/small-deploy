// Avatar Teacher AV5 playback check (docs/features/rabbit-hole-avatar-teacher-v1-spec.md §11, §19, §4.3, §33.5)
// against the LOCAL stack only, with the two existing HeyGen prototype renders. Nothing paid runs here:
// - ?voice=fake: scripted STT and TTS (window.__voiceFake); the Tutor's plan and evaluate routes are scripted;
// - every model, voice or generation route is aborted and counted, and the run asserts none was made;
// - the clip files are local dev assets (/static/dev-avatar, copied into dist-dev, never committed or deployed).
// Browsers: Chrome (proprietary codecs, so both the alpha WebM and the MP4 play), Chrome posing as Safari (the
// WebKit fallback path), Playwright's Firefox (alpha WebM) and WebKit (the real fallback detection).
//   node e2e/avatar-check.mjs [outDir]
// Env: AVATAR_BASE (the app, default http://127.0.0.1:8858), SMALL_CP (the control plane, default http://127.0.0.1:8859),
// AVATAR_SESSION (a session minted earlier; skips SMALL_CP), AVATAR_DPR (screenshot density, default 1; 2 for review shots)
// and AVATAR_RUNS (a comma list of runs to do, default all: chrome, placement, region, dark, safari, firefox, webkit).
import { chromium, firefox, webkit } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { TUTOR_BOARD } from '../src/learn-tutor-claims.js';

const BASE = process.env.AVATAR_BASE || 'http://127.0.0.1:8858';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) throw Error('avatar-check runs against the local stack only');
const OUT = process.argv[2] || 'avatar-shots';
mkdirSync(OUT, { recursive: true });
// AVATAR_SESSION: a test session minted earlier, for a stack that serves the app and the control plane from one
// wrangler process (the control plane then has no port of its own to mint one on).
async function mint() {
  const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
  const CP = process.env.SMALL_CP || 'http://127.0.0.1:8859';
  return (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) })).json()).session;
}
const session = process.env.AVATAR_SESSION || await mint();
const cookie = `small_session=${session}`;
const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const report = { runs: {} };
const RUNS = process.env.AVATAR_RUNS?.split(',');
const want = run => !RUNS || RUNS.includes(run);
const BLOCKED = /\/api\/learn\/(voice\/|ask|assess|artifact|board$|home-ask|grade|video|scene|avatar)/;

// One browser context on a fresh canvas app with the Tutor board, the fake voice and the demo teacher clip.
async function open(browserType, label, { channel, userAgent, colorScheme = 'light', query = '' } = {}) {
  const root = await (await fetch(`${BASE}/api/canvases`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ title: `Attention (avatar ${label})` }) })).json();
  const browser = await browserType.launch(channel ? { channel } : {});
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: Number(process.env.AVATAR_DPR) || 1, colorScheme, ...(userAgent ? { userAgent } : {}) });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  // The audio timeline: voice telemetry, Voice Mode state changes and the clip's media events, on one clock.
  await context.addInitScript(() => {
    const log = window.__avatarTimeline = [];
    const at = () => Math.round(performance.now());
    window.addEventListener('small:tutor-voice', event => log.push({ at: at(), voice: event.detail.name }));
    for (const type of ['playing', 'pause', 'ended']) document.addEventListener(type, event => { if (event.target.closest?.('[data-avatar-pip]')) log.push({ at: at(), clip: type }); }, true);
    // A closed window takes its video out of the page, so its pause never reaches the document: log the close itself.
    let open = false;
    new MutationObserver(() => {
      const shown = !!document.querySelector('[data-avatar-pip]');
      if (open && !shown) log.push({ at: at(), clip: 'closed' });
      open = shown;
      const state = document.querySelector('[data-voice-state]')?.getAttribute('data-voice-state') ?? 'off';
      if (log.filter(entry => entry.state).at(-1)?.state !== state) log.push({ at: at(), state });
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-voice-state'], childList: true });
  });
  const page = await context.newPage();
  const errors = [], blocked = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(url => BLOCKED.test(new URL(url).pathname), route => { blocked.push(new URL(route.request().url()).pathname); return route.abort(); });
  const tutor = { plans: [], next: () => ({ strategy: 'none', move: 'none', reason: '', actions: [] }) };
  await page.route('**/api/learn/tutor/evaluate', route => route.fulfill({ json: { status: 'settled', evaluator: 'jev', events: [] } }));
  await page.route('**/api/learn/tutor/plan', async route => {
    const { context: sent, stream } = route.request().postDataJSON();
    tutor.plans.push(sent);
    const plan = tutor.next(sent);
    if (stream) await route.fulfill({ contentType: 'application/x-ndjson', body: `${JSON.stringify({ type: 'plan', ...plan })}\n` });
    else await route.fulfill({ json: plan });
  });
  await page.goto(`${BASE}/apps/${root.name}?board=${TUTOR_BOARD}&voice=fake&avatar=demo${query}`);
  await page.waitForSelector('[data-avatar-clip]', { timeout: 40000 });
  await page.waitForTimeout(1500);
  const shot = async (name, target = page) => { await page.waitForTimeout(250); await target.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
  return { browser, page, errors, blocked, tutor, shot, root };
}

const pip = page => page.locator('[data-avatar-pip]');
const clipState = page => page.evaluate(() => {
  const video = document.querySelector('[data-avatar-pip] video');
  return video && { paused: video.paused, ended: video.ended, muted: video.muted, time: video.currentTime, src: video.currentSrc.split('/').pop(), readyState: video.readyState, error: video.error?.code ?? null };
});
// The decoded frame's alpha, read back through a canvas: the teacher's corner and her face.
const alphaAt = page => page.evaluate(() => {
  const video = document.querySelector('[data-avatar-pip] video');
  const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  const context = canvas.getContext('2d'); context.drawImage(video, 0, 0);
  const alpha = (x, y) => context.getImageData(x, y, 1, 1).data[3];
  return { corner: alpha(20, 20), background_right: alpha(1200, 400), face: alpha(684, 200), size: [video.videoWidth, video.videoHeight] };
});
const box = async locator => { const b = await locator.boundingBox(); return b && { w: Math.round(b.width), h: Math.round(b.height) }; };
const waitFor = async (page, test, label, tries = 120) => { for (let i = 0; i < tries; i++) { if (await test()) return; await page.waitForTimeout(100); } assert.fail(label); };
const waitPlaying = page => waitFor(page, async () => { const s = await clipState(page); return s && !s.paused && s.time > 0.3; }, 'the clip plays');
const caption = page => page.locator('[data-avatar-caption]');
// What the learner sees of a card: its box clipped to the canvas surface; and every visible part of the window,
// the region beneath the teacher included.
const shown = (page, id) => page.evaluate(id => {
  const card = document.querySelector(`[data-block-id="${id}"]`).getBoundingClientRect(), area = document.querySelector('[data-canvas-surface]').getBoundingClientRect();
  const x = Math.max(card.left, area.left), y = Math.max(card.top, area.top);
  return { x, y, w: Math.max(0, Math.min(card.right, area.right) - x), h: Math.max(0, Math.min(card.bottom, area.bottom) - y) };
}, id);
const parts = page => page.evaluate(() => [...document.querySelectorAll('[data-avatar-pip] > *')].filter(part => part.offsetParent !== null)
  .map(part => { const box = part.getBoundingClientRect(); return { x: box.left, y: box.top, w: box.width, h: box.height }; }));
const overlap = (a, b) => a.w > 0 && b.w > 0 && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// ---------------- Chrome: the transparent WebM, captions, controls, Voice, reload ----------------
if (want('chrome')) {
  const { browser, page, errors, blocked, tutor, shot } = await open(chromium, 'chrome', { channel: 'chrome' });
  const run = report.runs.chrome = {};
  await shot('01-card-light');
  // Never autoplay: nothing open, every video on the page paused.
  assert.equal(await pip(page).count(), 0, 'no clip window before Play');
  run.autoplay = await page.evaluate(() => [...document.querySelectorAll('video')].map(video => ({ paused: video.paused, muted: video.muted })));
  assert.ok(run.autoplay.every(video => video.paused), 'nothing autoplays');

  await page.getByRole('button', { name: /^Play the teacher clip: / }).click();
  await pip(page).waitFor();
  await waitPlaying(page);
  run.presentation = await pip(page).getAttribute('data-presentation');
  run.playing = await clipState(page);
  assert.equal(run.presentation, 'overlay');
  assert.match(run.playing.src, /\.webm$/);
  assert.equal(run.playing.muted, false, 'it plays with sound after the learner pressed Play');
  run.alpha = await alphaAt(page);
  assert.equal(run.alpha.corner, 0, 'the WebM keeps its alpha in the browser');
  assert.equal(run.alpha.face, 255);
  await caption(page).getByText('Welcome to attention.').waitFor();
  run.size = { video: await box(pip(page).locator('video').locator('..')), window: await box(pip(page)) };
  await shot('02-playing-overlay-light');
  await shot('03-pip-overlay-light-zoom', pip(page));

  // Captions follow the speech and toggle off and on.
  await caption(page).getByText('Here, each character looks back at the').waitFor({ timeout: 6000 });
  await page.getByRole('button', { name: 'Hide captions' }).click();
  assert.equal(await caption(page).count(), 0, 'captions hide');
  await page.getByRole('button', { name: 'Show captions' }).click();
  await caption(page).waitFor();
  // Pause and resume.
  await page.getByRole('button', { name: 'Pause the teacher clip', exact: true }).click();
  await waitFor(page, async () => (await clipState(page)).paused, 'paused');
  await shot('04-paused');
  await page.getByRole('button', { name: 'Play the teacher clip', exact: true }).click();
  await waitPlaying(page);
  // The end: stops on its last frame, the window stays for a replay.
  await waitFor(page, async () => (await clipState(page)).ended, 'the clip ends', 120);
  run.ended = await clipState(page);
  await shot('05-ended');
  await page.getByRole('button', { name: 'Close the teacher clip', exact: true }).click();
  assert.equal(await pip(page).count(), 0, 'close removes the window');

  // ---- Voice: Tutor speaking -> Play holds TTS and the mic -> pause / end / close restore listening ----
  await page.getByRole('button', { name: 'Voice mode', exact: true }).click();
  const voiceState = () => page.locator('[data-voice-state]').first().getAttribute('data-voice-state');
  const waitVoice = want => waitFor(page, async () => (await page.locator('[data-voice-state]').count()) && await voiceState() === want, `voice ${want}`);
  await waitVoice('listening');
  tutor.next = () => ({ strategy: 'none', move: 'none', reason: '', actions: [{ type: 'respond_text', text: 'Attention lets each character look back at the earlier ones.' }] });
  await page.evaluate(() => window.__voiceFake.setTtsMs(8000));
  await page.evaluate(() => window.__voiceFake.say('What is attention?'));
  await waitVoice('speaking');
  await shot('06-voice-tutor-speaking');
  const mark = await page.evaluate(() => window.__avatarTimeline.length);
  await page.getByRole('button', { name: /^Play the teacher clip: / }).click();
  await waitPlaying(page);
  await waitVoice('held');
  run.heldLabel = await page.locator('[data-voice-field]').innerText();
  assert.match(run.heldLabel, /Paused for the teacher clip/);
  await shot('07-voice-held-clip-playing');
  // The mic is held: speech now is never heard, so no Tutor turn starts.
  const plansBefore = tutor.plans.length;
  await page.evaluate(() => window.__voiceFake.say('This should not be heard.'));
  await page.waitForTimeout(600);
  assert.equal(tutor.plans.length, plansBefore, 'no Tutor turn while the clip holds the mic');
  await page.getByRole('button', { name: 'Pause the teacher clip', exact: true }).click();
  await waitVoice('listening');
  await page.getByRole('button', { name: 'Play the teacher clip', exact: true }).click();
  await waitVoice('held');
  await waitFor(page, async () => (await clipState(page)).ended, 'ends while held', 120);
  await waitVoice('listening');
  await page.getByRole('button', { name: 'Play the teacher clip', exact: true }).click();
  await waitVoice('held');
  await page.getByRole('button', { name: 'Close the teacher clip', exact: true }).click();
  await waitVoice('listening');
  await shot('08-voice-restored');
  // No overlap: from the first clip frame to its pause/end, Voice is held and never speaking.
  const timeline = (await page.evaluate(() => window.__avatarTimeline)).slice(mark);
  run.timeline = timeline;
  let playing = false, voice = 'speaking';
  for (const entry of timeline) {
    if (entry.state) voice = entry.state;
    if (entry.clip === 'playing') { playing = true; assert.notEqual(voice, 'speaking', 'the clip never starts over the Tutor'); }
    if (['pause', 'ended', 'closed'].includes(entry.clip)) playing = false;
    if (playing && entry.state) assert.equal(entry.state, 'held', `while the clip plays Voice stays held, saw ${entry.state} in ${JSON.stringify(timeline)}`);
  }
  assert.ok(timeline.some(entry => entry.voice === 'voice_interrupted'), 'the Tutor was cut off, not talked over');
  assert.equal(timeline.filter(entry => entry.voice === 'voice_held').length, 3);
  assert.equal(timeline.filter(entry => entry.voice === 'voice_listening_resumed').length, 3);

  // ---- Reload mid-clip: the card survives, nothing plays, nothing reopens, Voice is off ----
  await page.getByRole('button', { name: /^Play the teacher clip: / }).click();
  await waitPlaying(page);
  await page.reload();
  await page.waitForSelector('[data-avatar-clip]', { timeout: 40000 });
  await page.waitForTimeout(1500);
  run.reload = { cards: await page.locator('[data-avatar-clip]').count(), pip: await pip(page).count(), voice: await page.locator('[data-voice-state]').count(), playing: await page.evaluate(() => [...document.querySelectorAll('video')].some(video => !video.paused)) };
  assert.deepEqual(run.reload, { cards: 1, pip: 0, voice: 0, playing: false });
  await shot('09-after-reload');
  run.errors = errors; run.blocked = blocked;
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, [], 'no model, voice or generation route was called');
  await browser.close();
}

// ---------------- Placement: the window never covers the focused or selected card (§11) ----------------
if (want('placement')) {
  const { browser, page, errors, blocked, shot } = await open(chromium, 'placement', { channel: 'chrome' });
  const run = report.runs.placement = { steps: [] };
  const check = async (label, id) => {
    await page.waitForTimeout(300);
    const card = await shown(page, id), visible = await parts(page), place = await pip(page).getAttribute('data-place');
    run.steps.push({ label, place, card, visible });
    assert.ok(visible.length, `${label}: the window still shows something`);
    assert.ok(visible.every(part => !overlap(part, card)), `${label}: the window covers the card ${JSON.stringify({ place, card, visible })}`);
    return place;
  };
  const surface = await page.locator('[data-canvas-surface]').boundingBox();
  const empty = { x: surface.x + 120, y: surface.y + surface.height / 2 };
  await page.getByRole('button', { name: /^Play the teacher clip: / }).click();
  await waitPlaying(page);
  const idOf = locator => locator.evaluate(element => element.closest('[data-block-id]').dataset.blockId);
  // The click on the card's Play selected the teacher card itself.
  await check('the teacher card, selected by Play', await idOf(page.locator('[data-avatar-clip]')));
  // The card the window sat over by default: select it, and the window moves off it.
  const lesson = page.locator('[data-block-id]:not([data-chat-block])', { hasText: 'Overview: looking back while reading' }).first();
  const lessonId = await lesson.getAttribute('data-block-id');
  await lesson.getByText('Overview: looking back while reading').first().click();
  run.moved = await check('the lesson card, selected', lessonId);
  await shot('17-placement-selected-card');
  // Pan the selected card through every corner of the canvas: at no step does the window cover it.
  await page.mouse.move(empty.x, empty.y);
  for (const [dx, dy] of [[-400, 0], [0, 300], [800, 0], [0, -600], [-800, 0], [0, 300], [400, 0]]) {
    for (let step = 0; step < 4; step++) { await page.mouse.wheel(dx / 4, dy / 4); await check(`pan ${dx},${dy} step ${step}`, lessonId); }
  }
  // Zoom the selected card past the canvas: nowhere is clear, so the window folds to its controls (or docks below).
  // The 6.8 s clip ended during the pans: replay it, so the fold is checked while it plays.
  if ((await clipState(page)).paused) await page.getByRole('button', { name: 'Play the teacher clip', exact: true }).click();
  await waitPlaying(page);
  const center = await lesson.boundingBox();
  // Around the card's middle (kept inside the canvas), so at the 3x zoom limit the card spills past every edge.
  await page.mouse.move(center.x + center.width / 2, Math.min(center.y + center.height / 2, surface.y + surface.height - 60));
  await page.keyboard.down('Control');
  for (let step = 0; step < 12; step++) await page.mouse.wheel(0, -120);
  await page.keyboard.up('Control');
  run.zoomed = await check('the selected card zoomed past the canvas', lessonId);
  assert.ok(['tucked', 'docked'].includes(run.zoomed), `zoomed: ${run.zoomed}`);
  assert.ok(!(await clipState(page)).paused, 'the clip keeps playing while folded away');
  await shot('18-placement-zoomed-folded');
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Shift+Digit0');
  await page.waitForTimeout(600);
  // A card holding keyboard focus counts too, selected or not: clear the selection, focus a control inside the card.
  await page.keyboard.press('Escape');
  await lesson.evaluate(card => card.querySelector('button, [tabindex="0"], input')?.focus());
  run.focus = await page.evaluate(() => !!document.activeElement?.closest('[data-block-id]'));
  if (run.focus) await check('the lesson card, focused', lessonId);
  await shot('19-placement-after-zoom-reset');
  Object.assign(run, { errors, blocked });
  assert.deepEqual([errors, blocked], [[], []]);
  await browser.close();
}

// ---------------- The region beneath the teacher (owner, 2026-10-06) ----------------
// A review-only stand-in (?below=probe) for the card that sits there (Professor Next Steps, owned by Tutor/Learning):
// under the teacher while she is on screen and it fits, in its own place (the canvas's lower left) otherwise; always
// usable, never remounted (its click counter keeps counting), never over a protected card.
if (want('region')) {
  const { browser, page, errors, blocked, shot } = await open(chromium, 'region', { channel: 'chrome', query: '&below=probe' });
  const run = report.runs.region = { steps: [] };
  const probe = page.locator('[data-below-probe]'), counter = page.locator('[data-below-probe-count]');
  const where = () => probe.evaluate(node => (node.closest('[data-avatar-below]') ? 'teacher' : node.closest('[data-below-teacher-home]') ? 'home' : 'lost'));
  let clicks = 0;
  const use = async label => {
    await counter.click();
    clicks += 1;
    assert.equal(await counter.innerText(), `Clicked ${clicks}`, `${label}: the stand-in answers its click and kept its count`);
  };
  const settle = want => waitFor(page, async () => (await where()) === want, `the stand-in ${want}`, 40);
  // No teacher: its own place.
  assert.equal(await where(), 'home');
  await use('before Play');
  await shot('20-region-home');
  // The teacher on screen: the stand-in sits right under her control bar, inside the canvas, and still works.
  await page.getByRole('button', { name: /^Play the teacher clip: / }).click();
  await waitPlaying(page);
  await settle('teacher');
  const bar = await pip(page).getByRole('button', { name: 'Close the teacher clip' }).locator('..').boundingBox();
  const under = await probe.boundingBox(), area = await page.locator('[data-canvas-surface]').boundingBox();
  run.open = { bar, under, area };
  assert.ok(under.y >= bar.y + bar.height && under.y - (bar.y + bar.height) <= 12, `right under the bar ${JSON.stringify(run.open)}`);
  assert.ok(under.x >= area.x && under.x + under.width <= area.x + area.width && under.y + under.height <= area.y + area.height, 'inside the canvas');
  await use('under the playing teacher');
  await caption(page).getByText('Welcome to attention.').waitFor();
  await shot('21-region-under-teacher');
  // Pause and the end keep the teacher on screen, and the stand-in with her.
  await page.getByRole('button', { name: 'Pause the teacher clip', exact: true }).click();
  assert.equal(await where(), 'teacher');
  await use('teacher paused');
  await page.getByRole('button', { name: 'Play the teacher clip', exact: true }).click();
  await waitFor(page, async () => (await clipState(page)).ended, 'the clip ends', 120);
  assert.equal(await where(), 'teacher');
  // A selected card the window must leave clear: the teacher moves, the stand-in follows or goes home, and no part of
  // the window - the region included - ever covers the card.
  const lesson = page.locator('[data-block-id]:not([data-chat-block])', { hasText: 'Overview: looking back while reading' }).first();
  const lessonId = await lesson.getAttribute('data-block-id');
  await lesson.getByText('Overview: looking back while reading').first().click();
  await page.mouse.move(area.x + 120, area.y + area.height / 2);
  for (const [dx, dy] of [[0, 0], [-400, 0], [0, 300], [800, 0], [0, -600], [-800, 0], [0, 300], [400, 0]]) {
    for (let step = 0; step < (dx || dy ? 4 : 1); step++) {
      if (dx || dy) await page.mouse.wheel(dx / 4, dy / 4);
      await page.waitForTimeout(300);
      const card = await shown(page, lessonId), visible = await parts(page), at = await where(), place = await pip(page).getAttribute('data-place');
      const region = await pip(page).locator('[data-avatar-below]').getAttribute('data-avatar-below');
      run.steps.push({ pan: [dx, dy, step], place, region, at });
      assert.notEqual(at, 'lost');
      assert.equal(at === 'teacher', region === 'open', `under the teacher exactly while the region is offered (${place}, ${region}, ${at})`);
      assert.ok(visible.every(part => !overlap(part, card)), `pan ${dx},${dy}: the window covers the card ${JSON.stringify({ place, at, card, visible })}`);
    }
  }
  run.seen = [...new Set(run.steps.map(step => step.at))];
  await shot('22-region-after-pans');
  // Zoomed past the canvas: the teacher folds away, the region is withheld, the stand-in is home and works.
  const center = await lesson.boundingBox();
  await page.mouse.move(center.x + center.width / 2, Math.min(center.y + center.height / 2, area.y + area.height - 60));
  await page.keyboard.down('Control');
  for (let step = 0; step < 12; step++) await page.mouse.wheel(0, -120);
  await page.keyboard.up('Control');
  await page.waitForTimeout(400);
  run.folded = await pip(page).getAttribute('data-place');
  assert.ok(['tucked', 'docked'].includes(run.folded), `folded: ${run.folded}`);
  await settle('home');
  await use('teacher folded away');
  await shot('23-region-withheld-folded');
  // Back to the default zoom with nothing selected: the stand-in returns under the teacher.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Shift+Digit0');
  await page.keyboard.press('Escape');
  await settle('teacher');
  // Closed: home again, the same stand-in (its count carried through every move), usable.
  await page.getByRole('button', { name: 'Close the teacher clip', exact: true }).click();
  await settle('home');
  await use('teacher closed');
  await shot('24-region-closed');
  // A short canvas: the teacher still fits, the teacher with the region does not. The region is withheld and the
  // stand-in stays home while the teacher stays open; it never squeezes in.
  await page.getByRole('button', { name: /^Play the teacher clip: / }).click();
  await waitPlaying(page);
  run.short = [];
  for (const height of [760, 700, 660, 620, 580]) {
    await page.setViewportSize({ width: 1440, height });
    await page.waitForTimeout(500);
    const place = await pip(page).getAttribute('data-place'), region = await pip(page).locator('[data-avatar-below]').getAttribute('data-avatar-below'), at = await where();
    run.short.push({ height, place, region, at });
    assert.equal(at === 'teacher', region === 'open', `short canvas ${height}: under the teacher exactly while the region is offered`);
    if (place === 'open' && region === 'withheld') { await use('teacher open, region withheld'); await shot('25-region-withheld-teacher-open'); break; }
  }
  assert.ok(run.short.some(step => step.place === 'open' && step.region === 'withheld' && step.at === 'home'), `the teacher alone fits: ${JSON.stringify(run.short)}`);
  await page.getByRole('button', { name: 'Close the teacher clip', exact: true }).click();
  // A phone-width canvas: the teacher is an in-flow strip, no region; the stand-in stays home.
  await page.setViewportSize({ width: 560, height: 900 });
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^Play the teacher clip: / }).click();
  await waitPlaying(page);
  await page.waitForTimeout(400);
  run.phone = { place: await pip(page).getAttribute('data-place'), at: await where() };
  assert.deepEqual(run.phone, { place: 'default', at: 'home' });
  await use('phone width');
  run.clicks = clicks;
  Object.assign(run, { errors, blocked });
  assert.deepEqual([errors, blocked], [[], []]);
  await browser.close();
}

// ---------------- Chrome, dark canvas ----------------
if (want('dark')) {
  const { browser, page, errors, blocked, shot } = await open(chromium, 'chrome-dark', { channel: 'chrome', colorScheme: 'dark' });
  await shot('10-card-dark');
  await page.getByRole('button', { name: /^Play the teacher clip: / }).click();
  await waitPlaying(page);
  await caption(page).getByText('Welcome to attention.').waitFor();
  await page.waitForTimeout(700);
  await shot('11-playing-overlay-dark');
  await shot('12-pip-overlay-dark-zoom', pip(page));
  report.runs.chromeDark = { presentation: await pip(page).getAttribute('data-presentation'), errors, blocked };
  assert.deepEqual([errors, blocked], [[], []]);
  await browser.close();
}

// ---------------- Chrome posing as Safari: the MP4 card, never a black-background WebM ----------------
for (const colorScheme of want('safari') ? ['light', 'dark'] : []) {
  const { browser, page, errors, blocked, shot } = await open(chromium, `safari-ua-${colorScheme}`, { channel: 'chrome', userAgent: SAFARI, colorScheme });
  await page.getByRole('button', { name: /^Play the teacher clip: / }).click();
  await waitPlaying(page);
  const run = report.runs[`safariUa_${colorScheme}`] = { presentation: await pip(page).getAttribute('data-presentation'), clip: await clipState(page), size: await box(pip(page).locator('video').locator('..')) };
  assert.equal(run.presentation, 'card');
  assert.match(run.clip.src, /\.mp4$/);
  await caption(page).getByText('Welcome to attention.').waitFor();
  await page.waitForTimeout(600);
  await shot(`13-fallback-card-${colorScheme}`);
  await shot(`14-fallback-card-${colorScheme}-zoom`, pip(page));
  Object.assign(run, { errors, blocked });
  assert.deepEqual([errors, blocked], [[], []]);
  await browser.close();
}

// ---------------- Firefox: alpha WebM ----------------
if (want('firefox')) {
  const { browser, page, errors, blocked, shot } = await open(firefox, 'firefox');
  await page.getByRole('button', { name: /^Play the teacher clip: / }).click();
  const run = report.runs.firefox = {};
  try {
    await waitPlaying(page);
    run.presentation = await pip(page).getAttribute('data-presentation');
    run.clip = await clipState(page);
    run.alpha = await alphaAt(page);
    await caption(page).getByText('Welcome to attention.').waitFor();
    await page.waitForTimeout(600);
  } catch (error) { run.failure = error.message; run.clip = await clipState(page); }
  await shot('15-firefox-overlay');
  Object.assign(run, { errors, blocked });
  await browser.close();
}

// ---------------- WebKit: the real detection; whether this Windows build can play the MP4 at all ----------------
if (want('webkit')) {
  const { browser, page, errors, blocked, shot } = await open(webkit, 'webkit');
  const run = report.runs.webkit = { canPlay: await page.evaluate(() => { const video = document.createElement('video'); return { webm_vp9: video.canPlayType('video/webm; codecs="vp9"'), mp4: video.canPlayType('video/mp4; codecs="avc1.42E01E"') }; }), userAgent: await page.evaluate(() => navigator.userAgent) };
  await page.getByRole('button', { name: /^Play the teacher clip: / }).click();
  await pip(page).waitFor();
  run.presentation = await pip(page).getAttribute('data-presentation');
  try { await waitPlaying(page); run.played = true; } catch { run.played = false; }
  run.clip = await clipState(page);
  await page.waitForTimeout(600);
  await shot('16-webkit-fallback');
  Object.assign(run, { errors, blocked });
  await browser.close();
}

writeFileSync(`${OUT}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, (key, value) => (key === 'timeline' ? `${value.length} entries` : value), 2));
