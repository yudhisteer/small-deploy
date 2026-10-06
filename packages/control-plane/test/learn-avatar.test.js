// Avatar Teacher V1 AV2-AV4 groundwork (docs/features/rabbit-hole-avatar-teacher-v1-spec.md): the planner off
// switch, the AvatarBrief, the Director contract against recorded replies, the HeyGen v3 adapter against a stub
// transport, the cache keys and the shared clip store. No model call, no HeyGen call, no key: everything is stubbed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ACTION_TYPES, AVATAR_ACTION, PLANNER_SYSTEM, TUTOR_TOOL, plannerRequest } from '../src/agents/learn-tutor.js';
import { planTurn } from '../src/learn-tutor-routes.js';
import { DIRECTOR_EXAMPLES, DIRECTOR_PROMPT_VERSION, DIRECTOR_REJECTED, DIRECTOR_SYSTEM, EXAMPLE_CONCEPTS, REVIEWER_EXAMPLES, REVIEWER_SYSTEM, REVIEW_CATEGORIES, assembleBrief, briefSlotId, directorInput, directorRequest, exampleLeaks, prepareScript, reviewRequest, runDirector, scriptProblems, validateBrief } from '../src/learn-avatar-brief.js';
import { AVATAR_ERRORS, HEYGEN_ADAPTER_VERSION, avatarGate, avatarProvider, renderInputFor } from '../src/learn-avatar-provider.js';
import { AVATAR_REGISTRY, COURSE_REGISTRIES, LearnAvatarClips, V1_COURSE, avatarClipFetch, avatarObjectKey, canonicalInput, canonicalRequest, renderKey, scopeName, scriptSlotKey, sniffVideoType, tutorRegistry } from '../src/learn-avatar-cache.js';
import { downloadClip } from '../src/learn-video.js';

const KEY = 'test-heygen-key-never-printed';
const PROFILES = { avatars: { 'rh-teacher-1': { avatar_id: 'look_stock_1', engine: 'avatar_iv', alpha: true } }, voices: { 'rh-voice-1': { voice_id: 'voice_native_1' } } };
const REG = { concepts: ['attention', 'causal-mask', 'score-scaling', 'softmax', 'attention-output'], cards: ['depth-attention-overview', 'c11-causal-mask'] };
const TEXT = 'Welcome to attention. Here, each character looks back at the earlier ones to decide what matters.';
const scriptOf = text => ({ text, words: text.trim().split(/\s+/).length, estimated_seconds: 6, source_ref_ids: ['S1'] });
const brief = (over = {}) => ({
  id: 'brief-1', brief_version: 'avatar-brief/1', prompt_spec_version: 'director/1', purpose: 'orientation', origin: 'product',
  scope: { kind: 'public_course', course: V1_COURSE },
  learner_context: { current_concept: 'attention', personalization: 'none' },
  teaching_goal: 'Frame the question attention answers.',
  source_refs: [{ id: 'S1', kind: 'card', card_id: 'depth-attention-overview' }],
  duration_seconds: 8,
  script_constraints: { max_words: 19, max_sentences: 2, plain_speech: true, no_code: true, no_equations: true, no_unverified_claims: true, no_internal_tutor_language: true, no_mastery_claims: true },
  must_say: [], must_not_claim: [],
  script: scriptOf(TEXT),
  render: { avatar_profile: 'rh-teacher-1', voice_profile: 'rh-voice-1', tone: 'warm', framing: 'head_shoulders', expressiveness: 'low', background_mode: 'transparent', presentation: 'card', output: { alpha: true, aspect_ratio: '16:9', resolution: '720p' }, captions: true },
  provenance: { created_at: '2026-10-04T00:00:00Z', director: { role: 'AVATAR_DIRECTOR_MODEL', resolved_model: 'claude-opus-5-5' } },
  ...over,
});
const sha = text => createHash('sha256').update(text).digest('hex');

// ---------- Tutor action off switch (§4.1) ----------

test('TUTOR_AVATAR off: the planner prefix and request are byte-identical to main 74d20468', () => {
  const context = { learner_intent: { kind: 'question', raw_user_message: 'why softmax?' }, route: { row: 'understood' }, allowed_actions: ['respond_text'] };
  // Hashes taken from main before this change: the cached prefix and a streamed, cached request.
  assert.equal(sha(JSON.stringify([TUTOR_TOOL, PLANNER_SYSTEM])), '6b3ba28db7f6d5c54e97bac07c27d607db78a77095dcc5ee95209231f783ee75');
  assert.equal(sha(JSON.stringify(plannerRequest(context, 2000, [], { cache: true, stream: true }))), '516c06007f1bd4fd4dc95e8c8778d8171f3e4a3f59a6657ca834ddb643bd3b96');
  assert.deepEqual(plannerRequest(context, 2000, [], { avatar: false }), plannerRequest(context, 2000));
  assert.ok(!ACTION_TYPES.includes(AVATAR_ACTION));
});

test('the planner route reads TUTOR_AVATAR: only "on" adds the action and its three policy lines; tool_choice stays auto', async () => {
  const bodies = [];
  const callModel = async (env, body) => { bodies.push(body); return Response.json({ model: 'm', usage: {}, content: [{ type: 'tool_use', name: 'tutor_response', input: { constraints_add: [], strategy: 'none', actions: [{ type: 'respond_text', text: 'Hi.' }] } }] }); };
  const context = { learner_intent: { kind: 'question' }, route: { row: 'understood' }, allowed_actions: ['respond_text'] };
  for (const knob of [undefined, 'yes', 'on']) await planTurn({ TUTOR_PLANNER_FAST_MODEL: 'off', ...(knob ? { TUTOR_AVATAR: knob } : {}) }, context, { callModel });
  assert.deepEqual(bodies[0], bodies[1]);
  assert.equal(JSON.stringify(bodies[0].tools), JSON.stringify([TUTOR_TOOL]));
  const items = bodies[2].tools[0].input_schema.properties.actions.items;
  assert.ok(items.properties.type.enum.includes(AVATAR_ACTION));
  assert.deepEqual(Object.keys(items.properties).slice(-5), ['moment', 'to_concept', 'learning_goal', 'visual_value', 'max_duration_seconds']);
  assert.equal(bodies[2].system[0].text.split('\n').length, PLANNER_SYSTEM.split('\n').length + 3);
  assert.deepEqual(bodies[2].tool_choice, { type: 'auto' });
});

// ---------- AvatarBrief (§6) ----------

test('AvatarBrief: a canonical brief validates; every harness rule refuses by name, never with the text', () => {
  assert.equal(validateBrief(brief(), REG).id, 'brief-1');
  const long = Array.from({ length: 25 }, () => 'word').join(' ') + '.';
  const bad = [
    [b => { b.script = scriptOf("You've mastered attention now."); }, /mastery claim/],
    [b => { b.script = scriptOf('The tutor thinks the scores matter.'); }, /internal language/],
    [b => { b.script = scriptOf('Use softmax(x) on the scores.'); }, /code/],
    [b => { b.script = scriptOf(long); }, /over length/],
    [b => { b.learner_context.current_concept = 'made-up'; }, /unknown concept/],
    [b => { b.learning_goal = 'Frame it.'; }, /canonical brief takes no learning_goal/],
    [b => { b.learner_context.session_concepts = ['softmax']; }, /personalization none/],
    [b => { b.purpose = 'transition'; }, /next_concept/],
    [b => { b.purpose = 'rabbit_hole_return'; }, /from_concept/],
    [b => { b.source_refs[0].card_id = 'c99-made-up'; }, /unknown card/],
    [b => { b.script.source_ref_ids = ['S9']; }, /unknown source/],
    [b => { b.render.avatar_profile = 'heygen_look_123'; }, /profile ids/],
    [b => { b.provenance.learner_turn_id = 'ada@example.com'; }, /credential or email/],
    [b => { b.scope.course = 'karpathy/nanoGPT@master'; }, /full commit/],
    [b => { b.duration_seconds = 31; }, /maximum 30/],
    [b => { b.script_constraints.max_words = 50; }, /do not match/],
    [b => { b.visual_value = 'why a presenter helps'; }, /unexpected field/],
  ];
  for (const [mutate, pattern] of bad) {
    const b = structuredClone(brief());
    mutate(b);
    assert.throws(() => validateBrief(b, REG), error => pattern.test(error.message) && !error.message.includes('mastered') && !error.message.includes('ada@'), String(pattern));
  }
  assert.equal(briefSlotId(brief({ purpose: 'transition', learner_context: { current_concept: 'attention', next_concept: 'causal-mask', personalization: 'none' } })), 'transition:attention:causal-mask');
  assert.equal(briefSlotId(brief({ purpose: 'rabbit_hole_return', learner_context: { current_concept: 'attention', from_concept: 'softmax', personalization: 'none' } })), 'rabbit_hole_return:softmax:attention');
});

// ---------- Avatar Director contract (§5.1) ----------

const authored = { attention: { label: 'Attention', title: 'Overview', learning_question: 'Which earlier characters does one character read?', claims: ['Attention looks back, never ahead.'], sources: [{ id: 'S1', note: 'The Overview card.' }] } };
const reply = input => ({ content: [{ type: 'tool_use', id: 'tu_1', name: 'avatar_script', input }] });
const good = { teaching_goal: 'Frame attention.', text: TEXT, source_ref_ids: ['S1'] };

test('Director boundary: a forbidden input never reaches the prompt; learning_goal only on a clean learner-scope request', () => {
  const polluted = {
    purpose: 'orientation', scope: { kind: 'public_course', course: V1_COURSE }, duration_seconds: 8, concepts: { current: 'attention' },
    authored: { attention: { ...authored.attention, hidden_field: 'HIDDEN-FIELD' } },
    raw_user_message: 'RAW-LEARNER-WORDS', transcript: 'VOICE-TRANSCRIPT', visual_value: 'VISUAL-VALUE', learning_goal: 'Frame attention plainly.',
    evidence: [{ claim: 'EVIDENCE-EVENT' }], canvas: { blocks: ['CANVAS-DUMP'] }, email: 'ada@example.com', tutor_text: 'TUTOR-TEXT', source: 'PRIVATE-SOURCE',
  };
  const prompt = JSON.stringify(directorRequest(directorInput(polluted)));
  for (const leak of ['RAW-LEARNER-WORDS', 'VOICE-TRANSCRIPT', 'VISUAL-VALUE', 'Frame attention plainly.', 'EVIDENCE-EVENT', 'CANVAS-DUMP', 'ada@example.com', 'TUTOR-TEXT', 'PRIVATE-SOURCE', 'HIDDEN-FIELD']) assert.ok(!prompt.includes(leak), leak);
  assert.equal(directorInput({ ...polluted, scope: { kind: 'learner' } }).learning_goal, 'Frame attention plainly.');
  assert.equal(directorInput({ ...polluted, scope: { kind: 'learner' }, learning_goal: 'Mail ada@example.com' }).learning_goal, undefined);
  assert.deepEqual(directorRequest(directorInput(polluted)).tool_choice, { type: 'auto' });
  assert.deepEqual(directorInput(polluted).limits, { duration_seconds: 8, max_words: 19, max_sentences: 2 });
});

test('runDirector against recorded replies: one schema re-ask, a mastery claim is blocked, an unknown source fails', async () => {
  const input = directorInput({ purpose: 'orientation', scope: { kind: 'public_course' }, concepts: { current: 'attention' }, authored });
  const ok = await runDirector(async () => reply(good), input);
  assert.deepEqual(ok.script, { text: TEXT, words: 16, estimated_seconds: 6.4, source_ref_ids: ['S1'] });
  const requests = [], replies = [reply({ text: 'missing fields' }), reply(good)];
  const fixed = await runDirector(async request => { requests.push(request); return replies.shift(); }, input);
  assert.equal(fixed.status, 'ok');
  assert.equal(fixed.format_retries.length, 1);
  assert.deepEqual(requests[1].messages.at(-1).content[0].type, 'tool_result');
  const twice = await runDirector(async () => ({ content: [{ type: 'text', text: 'no tool' }] }), input);
  assert.deepEqual([twice.status, twice.stage], ['failed', 'format']);
  const mastery = await runDirector(async () => reply({ ...good, text: "You've mastered attention." }), input);
  assert.deepEqual([mastery.status, mastery.stage, mastery.errors], ['failed', 'script_rules', ['mastery claim']]);
  const unsourced = await runDirector(async () => reply({ ...good, source_ref_ids: ['S7'] }), input);
  assert.deepEqual(unsourced.errors, ['unknown source S7']);
  for (const code of ['Then att @ v mixes them.', 'It calls masked_fill first.', 'Look at att[0] here.']) {
    assert.ok((await runDirector(async () => reply({ ...good, text: code }), input)).errors.includes('code'), code);
  }
});

// ---------- Canonical slots from the registry, the reviewer and the one repair (§5.1, §14) ----------

test('canonical slots come from the registry; a Rabbit Hole return keys on both the child and the parent concept', async () => {
  const back = canonicalRequest({ moment: 'rabbit_hole_return', concept: 'softmax', to_concept: 'attention' });
  assert.deepEqual(back.slot.learner_context, { current_concept: 'attention', from_concept: 'softmax', personalization: 'none' });
  assert.equal(briefSlotId(back.slot), 'rabbit_hole_return:softmax:attention');
  const otherParent = canonicalRequest({ moment: 'rabbit_hole_return', concept: 'softmax', to_concept: 'causal-mask' });
  assert.notEqual(briefSlotId(otherParent.slot), briefSlotId(back.slot));
  assert.notEqual(await scriptSlotKey(otherParent.slot), await scriptSlotKey(back.slot), 'never keyed by the child concept alone');
  const input = canonicalInput(back);
  assert.deepEqual(input.concepts, { current: 'attention', from: 'softmax' });
  assert.deepEqual([input.authored.softmax.ref, input.authored.attention.ref], ['C1', 'C2']);
  assert.deepEqual(back.slot.source_refs.filter(ref => ref.kind === 'card').map(ref => ref.card_id), ['c21-temperature', 'depth-attention-overview']);
  const commit = V1_COURSE.split('@')[1];
  assert.ok(back.slot.source_refs.filter(ref => ref.kind === 'code').every(ref => ref.commit === commit && ref.repository === 'karpathy/nanoGPT' && ref.end_line >= ref.start_line));
  assert.ok(input.authored.softmax.sources.length <= 3 && input.authored.softmax.claims.length === 2);
  assert.deepEqual(canonicalRequest({ moment: 'transition', concept: 'causal-mask', to_concept: 'softmax' }).slot.learner_context, { current_concept: 'causal-mask', next_concept: 'softmax', personalization: 'none' });
  assert.throws(() => canonicalRequest({ moment: 'transition', concept: 'causal-mask' }), /missing concept/);
  assert.throws(() => canonicalRequest({ moment: 'orientation', concept: 'made-up' }), /Unknown/);
  const assembled = assembleBrief(back.slot, { script: scriptOf(TEXT), teaching_goal: 'Connect softmax back to attention.' }, { render: brief().render, resolved_model: 'claude-opus-5-5', created_at: '2026-10-04T00:00:00Z' });
  assert.equal(validateBrief(assembled, AVATAR_REGISTRY), assembled);
  assert.equal(await scriptSlotKey(assembled), await scriptSlotKey(back.slot), 'the full brief keeps its slot key');
});

const review = blocking => ({ content: [{ type: 'tool_use', id: 'tu_r', name: 'script_review', input: { blocking } }] });
test('prepareScript: the rules first, then the fresh blind reviewer, at most one repair; a malformed review fails closed', async () => {
  const input = canonicalInput(canonicalRequest({ moment: 'orientation', concept: 'attention' }));
  const run = async (directorReplies, reviewReplies) => {
    const requests = { director: [], reviewer: [] };
    const out = await prepareScript({
      director: async request => { requests.director.push(request); return directorReplies.shift(); },
      reviewer: async request => { requests.reviewer.push(request); return reviewReplies.shift(); },
    }, input);
    return { out, requests };
  };
  const clean = await run([reply(good)], [review([])]);
  assert.deepEqual([clean.out.status, clean.out.script.text, clean.out.trace.map(step => step.step)], ['ok', TEXT, ['director', 'review']]);
  const ruled = await run([reply({ ...good, text: "You've mastered attention, so use softmax(x)." }), reply(good)], [review([])]);
  assert.deepEqual([ruled.out.status, ruled.out.trace.map(step => step.step), ruled.requests.reviewer.length], ['ok', ['director', 'repair', 'review'], 1]);
  assert.match(ruled.requests.director[1].messages[0].content, /Blocking findings: spoken_suitability: code; tone: mastery claim/);
  const reviewed = await run([reply(good), reply({ ...good, text: 'Welcome to attention. Each character looks back at earlier ones.' })], [review([{ category: 'grounding', reason: 'decide what matters is not in the card' }]), review([])]);
  assert.deepEqual([reviewed.out.status, reviewed.out.script.text], ['ok', 'Welcome to attention. Each character looks back at earlier ones.']);
  assert.match(reviewed.requests.director[1].messages[0].content, /Earlier script: "Welcome to attention\. Here/);
  const stuck = await run([reply(good), reply(good)], [review([{ category: 'grounding', reason: 'x' }]), review([{ category: 'grounding', reason: 'x' }])]);
  assert.deepEqual([stuck.out.status, stuck.out.stage, stuck.out.blocking.map(finding => finding.category)], ['failed', 'review', ['grounding']]);
  assert.equal(stuck.requests.director.length, 2, 'one repair, never a second');
  const garbled = await run([reply(good)], [{ content: [{ type: 'text', text: 'looks fine' }] }, review([{ category: 'not_a_category', reason: 'x' }])]);
  assert.deepEqual([garbled.out.status, garbled.out.stage], ['failed', 'review_format']);
  // Blind and text-only: no Director prompt, teaching goal or model id reaches the reviewer.
  const blind = JSON.stringify(reviewRequest(TEXT, input));
  assert.ok(!blind.includes('Frame attention.') && !blind.includes(DIRECTOR_SYSTEM.slice(0, 40)) && !blind.includes('claude-') && blind.includes(TEXT));
});

// ---------- Prompt discipline (§33.6): static sectioned prompts, illustrative examples, no example drift ----------

const SECTIONS = ['role', 'objective', 'non_negotiable_rules', 'privacy_boundary', 'examples', 'output_contract'];
const SLICE = /attention|softmax|mask|score|query|queries|weight/i;
test('both prompts: the six sections in order, static and cached; only the grounded brief or the script varies per call', () => {
  for (const system of [DIRECTOR_SYSTEM, REVIEWER_SYSTEM]) {
    const at = SECTIONS.map(name => system.indexOf(`<${name}>`));
    assert.ok(at.every((index, i) => index >= 0 && system.includes(`</${SECTIONS[i]}>`) && (i === 0 || index > at[i - 1])), JSON.stringify(at));
  }
  // A changed prompt changes these pins: bump DIRECTOR_PROMPT_VERSION with it (it keys the cached scripts, §14).
  assert.deepEqual([sha(DIRECTOR_SYSTEM).slice(0, 16), sha(REVIEWER_SYSTEM).slice(0, 16), DIRECTOR_PROMPT_VERSION], ['9f7ef2d7d07b7e4f', '5681f5517f1a472b', 'avatar-director/2']);
  const one = directorRequest(canonicalInput(canonicalRequest({ moment: 'orientation', concept: 'attention' })));
  const two = directorRequest(canonicalInput(canonicalRequest({ moment: 'transition', concept: 'causal-mask', to_concept: 'softmax', duration_seconds: 12 })));
  assert.deepEqual([one.tools, one.system], [two.tools, two.system], 'one static prefix for every clip');
  assert.deepEqual(one.system, [{ type: 'text', text: DIRECTOR_SYSTEM, cache_control: { type: 'ephemeral' } }]);
  assert.match(one.messages[0].content, /^<brief>\n\{"purpose":"orientation".*\n<\/brief>\n\nWrite this clip's script\.$/s);
  const input = canonicalInput(canonicalRequest({ moment: 'orientation', concept: 'softmax' }));
  assert.deepEqual([reviewRequest('First script.', input).system, reviewRequest('Other script.', input).tools], [[{ type: 'text', text: REVIEWER_SYSTEM, cache_control: { type: 'ephemeral' } }], reviewRequest('First script.', input).tools]);
  // The Director never sees how the clip is made: no provider, API or render setting.
  const director = JSON.stringify([one, two]);
  for (const detail of [/heygen/i, /render/i, /resolution/i, /aspect/i, /voice_id/i, /avatar_id/i, /webm/i, /mp4/i, /720p|1080p/, /avatar_iv/i, /engine/i, /api.?key/i]) assert.ok(!detail.test(director), String(detail));
});

test('the examples are illustrative: one per named moment, each within the rules, off the Attention slice, plus a rejected one', () => {
  assert.deepEqual(DIRECTOR_EXAMPLES.map(example => example.brief.purpose), ['orientation', 'transition', 'rabbit_hole_return', 'human_explanation', 'demonstration']);
  for (const { brief: example, output } of DIRECTOR_EXAMPLES) {
    assert.deepEqual([scriptProblems(output.text, example.limits.duration_seconds), exampleLeaks(output.text, example)], [[], []], output.text);
    const known = new Set(Object.values(example.authored).flatMap(entry => [entry.ref, ...(entry.sources || []).map(source => source.id)]));
    assert.ok(output.source_ref_ids.every(id => known.has(id)), 'each example cites its own sources');
  }
  assert.deepEqual(scriptProblems(DIRECTOR_REJECTED.text, 8), ['mastery claim'], 'the rejected example shows mastery wording');
  assert.match(DIRECTOR_REJECTED.why, /mastery/);
  assert.match(DIRECTOR_SYSTEM, /They are not rules, and their topics are never this clip's topic/);
  // Why they cannot pull clips toward Attention/softmax: no example names a registry concept or the slice's words.
  const examples = [DIRECTOR_SYSTEM.slice(DIRECTOR_SYSTEM.indexOf('<examples>')), REVIEWER_SYSTEM.slice(REVIEWER_SYSTEM.indexOf('<examples>'))].join('');
  assert.ok(!SLICE.test(examples) && AVATAR_REGISTRY.concepts.every(concept => !examples.includes(`"${concept}"`)));
  assert.deepEqual([...new Set(REVIEWER_EXAMPLES.flatMap(example => example.blocking.map(finding => finding.category)))].sort(), ['grounding', 'pedagogical_correctness', 'spoken_suitability', 'tone']);
  assert.ok(REVIEWER_EXAMPLES.some(example => !example.blocking.length) && REVIEWER_EXAMPLES.flatMap(example => example.blocking).every(finding => REVIEW_CATEGORIES.includes(finding.category)));
});

test('the example-leak guard is narrow: an example topic in an unrelated clip is caught; paraphrase and ordinary words never are', async () => {
  // Every concept an example uses has the words that name it, so a new example cannot slip past the guard.
  const used = [...DIRECTOR_EXAMPLES.map(example => example.brief), DIRECTOR_REJECTED.brief, ...REVIEWER_EXAMPLES.map(example => example.review)].flatMap(entry => Object.keys(entry.authored));
  assert.deepEqual([...new Set(used)].sort(), Object.keys(EXAMPLE_CONCEPTS).sort());
  // A leak: an example's topic named in a clip whose brief never names it - on every canonical slice brief.
  const drifts = { tokenization: 'Welcome to tokenization of the text.', 'token-embedding': 'Each token embedding row comes first.', 'positional-embedding': 'A positional embedding marks the place.',
    'layer-norm': 'Layer normalization rescales it first.', 'residual-stream': 'Back on the residual stream now.', 'cross-entropy-loss': 'The cross-entropy loss climbs fast.', 'train-val-split': 'Keep a validation set aside.' };
  for (const concept of AVATAR_REGISTRY.concepts) {
    const input = canonicalInput(canonicalRequest({ moment: 'orientation', concept }));
    for (const [leak, drift] of Object.entries(drifts)) assert.deepEqual(exampleLeaks(drift, input), [leak], `${concept}: ${drift}`);
  }
  // Explained, not leaked: a clip whose brief is about that topic may name it.
  for (const { brief: example, output } of DIRECTOR_EXAMPLES) assert.deepEqual(exampleLeaks(output.text, example), []);
  // Not a closed vocabulary: grounded paraphrase, analogy and ordinary explanatory words the brief never uses all pass.
  const attention = canonicalInput(canonicalRequest({ moment: 'orientation', concept: 'attention' }));
  const ordinary = [
    'Each character weighs the ones before it, then blends what it finds.',
    'During training, the network learns which earlier characters matter most.',
    "Every character's embedding is compared with the ones before it.",
    'Think of it as a spotlight that only shines backward along the text.',
    'The loss goes down as these weights get better.',
  ];
  const authored = JSON.stringify(attention.authored).toLowerCase();
  assert.ok(['weighs', 'blends', 'network', 'embedding', 'spotlight', 'loss'].every(word => !authored.includes(word)), 'these words are really absent from the brief');
  for (const text of ordinary) assert.deepEqual(exampleLeaks(text, attention), [], text);
  const layerNorm = directorInput({ purpose: 'orientation', scope: { kind: 'public_course' }, concepts: { current: 'layer-norm' },
    authored: { 'layer-norm': { ref: 'C1', claims: ["Layer normalization rescales each token's vector to a steady size before a block reads it."] } } });
  assert.deepEqual(exampleLeaks('Each block reads a steadier copy of every vector, so attention and softmax see sensible numbers.', layerNorm), [], 'slice words are not example concepts');
  // End to end: such a paraphrase goes straight to the reviewer, with no repair; a real leak gets the one repair.
  const paraphrase = { teaching_goal: 'Frame attention.', text: ordinary[0], source_ref_ids: [attention.authored.attention.ref] };
  const straight = await prepareScript({ director: async () => reply(paraphrase), reviewer: async () => review([]) }, attention);
  assert.deepEqual([straight.status, straight.script.text, straight.trace.map(step => step.step)], ['ok', ordinary[0], ['director', 'review']]);
  const replies = [reply({ ...paraphrase, text: 'Welcome to attention, a kind of tokenization for meaning.' }), reply(paraphrase)], repairs = [];
  const repaired = await prepareScript({ director: async request => { repairs.push(request); return replies.shift(); }, reviewer: async () => review([]) }, attention);
  assert.deepEqual([repaired.status, repaired.trace.map(step => step.step)], ['ok', ['director', 'repair', 'review']]);
  assert.match(repairs[1].messages[0].content, /Blocking findings: grounding: example leak tokenization/);
  // No false alarm on the four scripts the live run produced and the owner accepted (§33.1).
  const live = JSON.parse(readFileSync(new URL('../../../tests/evals/results/avatar-director-2026-10-04.json', import.meta.url), 'utf8'));
  for (const accepted of live.cases) {
    const input = canonicalInput(canonicalRequest({ moment: accepted.moment, concept: accepted.concept, to_concept: accepted.to_concept ?? undefined, duration_seconds: accepted.limits.duration_seconds }));
    assert.deepEqual(exampleLeaks(accepted.script.text, input), [], accepted.id);
  }
});

test('the reviewer is fresh on every call: no Director reasoning, teaching goal or earlier finding reaches it', async () => {
  const input = canonicalInput(canonicalRequest({ moment: 'orientation', concept: 'attention' }));
  const thinking = { type: 'thinking', thinking: 'DIRECTOR-REASONING', signature: 'sig' };
  const withReasoning = text => ({ content: [thinking, { type: 'tool_use', id: 'tu_1', name: 'avatar_script', input: { ...good, teaching_goal: 'DIRECTOR-GOAL', text } }] });
  const reviews = [], reviewReplies = [review([{ category: 'grounding', reason: 'FIRST-FINDING' }]), review([])];
  const directorReplies = [withReasoning(TEXT), withReasoning('Welcome to attention. Each character looks back at earlier ones.')];
  const out = await prepareScript({ director: async () => directorReplies.shift(), reviewer: async request => { reviews.push(request); return reviewReplies.shift(); } }, input);
  assert.deepEqual([out.status, reviews.length], ['ok', 2]);
  for (const request of reviews) {
    const sent = JSON.stringify(request);
    for (const hidden of ['DIRECTOR-REASONING', 'DIRECTOR-GOAL', 'FIRST-FINDING', DIRECTOR_SYSTEM.slice(0, 60), 'claude-']) assert.ok(!sent.includes(hidden), hidden);
    assert.equal(request.messages.length, 1, 'one fresh user turn');
  }
});

// ---------- HeyGen v3 adapter against a stub transport (§8, §9) ----------

function heygen(answer) {
  const calls = [];
  const transport = async function (url, init = {}) {
    assert.equal(this, undefined, 'Worker fetch must not receive the adapter as this');
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    return answer(new URL(url).pathname, init.method || 'GET');
  };
  return { calls, transport };
}
const heygenEnv = { LEARN_AVATAR_PROVIDER: 'heygen', HEYGEN_API_KEY: KEY };

test('provider gate: off without LEARN_AVATAR_PROVIDER=heygen and HEYGEN_API_KEY; presence only, never the value', () => {
  assert.equal(avatarGate({}), 'provider_off');
  assert.equal(avatarGate({ LEARN_AVATAR_PROVIDER: 'heygen' }), 'no_key');
  assert.equal(avatarGate(heygenEnv), null);
  assert.throws(() => avatarProvider({ HEYGEN_API_KEY: KEY }), error => error.category === 'not_configured' && !error.message.includes(KEY));
  assert.throws(() => renderInputFor(brief({ render: { ...brief().render, voice_profile: 'rh-unknown' } }), PROFILES), error => error.category === 'unsupported_config');
  const matte = { ...PROFILES, avatars: { 'rh-teacher-1': { ...PROFILES.avatars['rh-teacher-1'], alpha: false } } };
  assert.deepEqual([renderInputFor(brief(), matte).alpha, renderInputFor(brief(), matte).downgrades], [false, ['alpha']]);
});

test('acceptance 10 / §16: HeyGen receives the final script and the render config only; the render key is the Idempotency-Key; the key is only a header', async () => {
  const stub = heygen(() => Response.json({ data: { video_id: 'v_1', status: 'waiting', output_format: 'webm' } }));
  const provider = avatarProvider(heygenEnv, { transport: stub.transport, profiles: PROFILES });
  const input = renderInputFor({ ...brief(), learning_goal: 'LEARNING-GOAL', visual_value: 'VISUAL-VALUE' }, PROFILES);
  const key = await renderKey(input, provider.version);
  const ticket = await provider.submit(input, key);
  assert.deepEqual(stub.calls[0].body, { type: 'avatar', avatar_id: 'look_stock_1', script: TEXT, voice_id: 'voice_native_1', engine: { type: 'avatar_iv' }, output_format: 'webm', resolution: '720p', aspect_ratio: '16:9', title: `rh-avatar-${key.slice(0, 12)}`, caption: { file_format: 'srt' } });
  assert.deepEqual([stub.calls[0].url, stub.calls[0].init.method, stub.calls[0].init.redirect], ['https://api.heygen.com/v3/videos', 'POST', 'manual']);
  assert.equal(stub.calls[0].init.headers['Idempotency-Key'], key);
  assert.equal(stub.calls[0].init.headers['X-Api-Key'], KEY);
  assert.ok(!JSON.stringify(stub.calls[0].body).match(/LEARNING-GOAL|VISUAL-VALUE|callback/));
  assert.deepEqual({ ...ticket, submitted_at: 0 }, { id: 'v_1', provider: 'heygen', engine: 'avatar_iv', alpha: true, submitted_at: 0 });
  assert.ok(!JSON.stringify([ticket, provider]).includes(KEY));
});

test('every HeyGen answer maps to one normalized category; no provider body reaches a message', async () => {
  const input = renderInputFor(brief(), PROFILES), key = await renderKey(input, HEYGEN_ADAPTER_VERSION);
  const fail = (status, code) => () => Response.json({ error: { code, message: 'PROVIDER-BODY-TEXT' } }, { status });
  const submits = [
    [() => { throw new TypeError('connection reset'); }, 'submission_uncertain'],
    [() => Response.json({ data: {} }), 'submission_uncertain'],
    [fail(401, 'unauthorized'), 'not_configured'],
    [fail(402, 'insufficient_credit'), 'provider_credits'],
    [fail(429, 'quota_exceeded'), 'provider_credits'],
    [fail(429, 'rate_limit_exceeded'), 'rate_limited'],
    [fail(409, 'request_in_progress'), 'submission_uncertain'],
    [fail(400, 'content_policy_violation'), 'rejected_content'],
    [fail(403, 'voice_not_usable'), 'unsupported_config'],
    [fail(400, 'invalid_parameter'), 'unsupported_config'],
    [fail(500, 'internal_error'), 'submission_uncertain'],
  ];
  for (const [answer, category] of submits) {
    const provider = avatarProvider(heygenEnv, { transport: heygen(answer).transport, profiles: PROFILES });
    await assert.rejects(provider.submit(input, key), error => error.category === category && AVATAR_ERRORS.includes(category) && !error.message.includes('PROVIDER-BODY-TEXT'), category);
  }
  const poll = answer => avatarProvider(heygenEnv, { transport: heygen(answer).transport, profiles: PROFILES }).poll({ id: 'v_1', engine: 'avatar_iv', alpha: true });
  assert.equal(await poll(() => Response.json({ data: { status: 'processing' } })), null);
  assert.equal(await poll(() => Response.json({ data: { status: 'waiting' } })), null);
  assert.deepEqual(await poll(() => Response.json({ data: { status: 'completed', video_url: 'https://files2.heygen.ai/a.webm', subtitle_url: 'https://files2.heygen.ai/a.srt', duration: 8.4 } })),
    { videoUrl: 'https://files2.heygen.ai/a.webm', contentType: 'video/webm', durationSeconds: 8.4, captionsUrl: 'https://files2.heygen.ai/a.srt', provider: 'heygen', generationId: 'v_1', engine: 'avatar_iv' });
  // The real WebM render's split: the video on resource2.heygen.ai, the SRT sidecar on files2.heygen.ai.
  assert.deepEqual((await poll(() => Response.json({ data: { status: 'completed', video_url: 'https://resource2.heygen.ai/a.webm', subtitle_url: 'https://files2.heygen.ai/a.srt' } }))).videoUrl, 'https://resource2.heygen.ai/a.webm');
  await assert.rejects(poll(() => Response.json({ data: { status: 'completed', video_url: 'https://evil.example/a.webm?sig=SECRET' } })), error => error.category === 'download_failed' && error.final && error.code === 'unlisted_host:evil.example');
  await assert.rejects(poll(() => Response.json({ data: { status: 'completed', video_url: 'https://files2.heygen.ai:8443/a.webm' } })), error => error.code === 'unlisted_host:files2.heygen.ai');
  await assert.rejects(poll(() => Response.json({ data: { status: 'completed', video_url: 'http://files2.heygen.ai/a.webm' } })), error => error.category === 'download_failed');
  // The docs' example host was never observed on a real render, so it fails closed too.
  await assert.rejects(poll(() => Response.json({ data: { status: 'completed', video_url: 'https://files.heygen.ai/a.mp4' } })), error => error.code === 'unlisted_host:files.heygen.ai');
  await assert.rejects(poll(() => Response.json({ data: { status: 'failed', failure_code: 'MODERATION_REJECTED', failure_message: 'PROVIDER-BODY-TEXT' } })), error => error.category === 'provider_failed' && error.final && error.code === 'MODERATION_REJECTED' && !error.message.includes('PROVIDER'));
  await assert.rejects(poll(fail(503, 'service_unavailable')), error => error.category === 'provider_failed' && !error.final);
  await assert.rejects(poll(() => { throw new TypeError('reset'); }), error => error.category === 'provider_failed' && !error.final);
  const gone = heygen(fail(404, 'video_not_found'));
  assert.equal(await avatarProvider(heygenEnv, { transport: gone.transport }).remove({ id: 'v_1' }), true);
  assert.equal(gone.calls[0].init.method, 'DELETE');
});

// ---------- Cache keys and media (§13, §14) ----------

test('script-slot key: the slot only - never learning_goal, visual_value, provenance or the script; render key: every provider-facing setting', async () => {
  const base = await scriptSlotKey(brief());
  assert.equal(await scriptSlotKey({ ...brief(), id: 'brief-2', learning_goal: 'x', visual_value: 'y', provenance: { created_at: 'later' }, script: scriptOf('Other words.') }), base);
  const changes = [b => { b.learner_context.current_concept = 'softmax'; }, b => { b.duration_seconds = 9; }, b => { b.prompt_spec_version = 'director/2'; },
    b => { b.scope.course = `karpathy/nanoGPT@${'a'.repeat(40)}`; }, b => { b.purpose = 'takeaway'; }, b => { b.source_refs[0].commit = 'b'.repeat(40); }];
  for (const change of changes) { const b = structuredClone(brief()); change(b); assert.notEqual(await scriptSlotKey(b), base); }
  const input = renderInputFor(brief(), PROFILES), key = await renderKey(input, HEYGEN_ADAPTER_VERSION);
  assert.match(key, /^[0-9a-f]{64}$/);
  for (const change of [{ script_text: 'Other words.' }, { provider_voice_id: 'v2' }, { provider_avatar_id: 'l2' }, { engine: 'avatar_iii' }, { alpha: false }, { resolution: '1080p' }, { framing: 'half_body' }]) {
    assert.notEqual(await renderKey({ ...input, ...change }, HEYGEN_ADAPTER_VERSION), key, JSON.stringify(change));
  }
  assert.notEqual(await renderKey(input, 'heygen-v3:adapter-1'), key);
});

const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4, 5]);
const MP4 = new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode('ftypisom')]);
test('download: HeyGen serves MP4 as binary/octet-stream, accepted only by a caller that sniffs the bytes', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(MP4, { headers: { 'Content-Type': 'binary/octet-stream' } });
  try {
    await assert.rejects(downloadClip('https://files2.heygen.ai/a.mp4'), /Video download unavailable/);
    assert.deepEqual(await downloadClip('https://files2.heygen.ai/a.mp4', { sniffed: true }), MP4);
    globalThis.fetch = async () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } });
    await assert.rejects(downloadClip('https://files2.heygen.ai/a.mp4', { sniffed: true }), /Video download unavailable/);
  } finally { globalThis.fetch = realFetch; }
});
test('media contract: the real type from the bytes, learn-avatar/<scope hash>/<render key>.<webm|mp4>, the V1 course pin', async () => {
  assert.deepEqual([sniffVideoType(WEBM), sniffVideoType(MP4), sniffVideoType(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))], ['video/webm', 'video/mp4', null]);
  const key = 'c'.repeat(64), scope = { kind: 'public_course', course: V1_COURSE };
  assert.match(await avatarObjectKey(scope, key, 'video/webm'), new RegExp(`^learn-avatar/[0-9a-f]{64}/${key}\\.webm$`));
  assert.match(await avatarObjectKey(scope, key, 'video/mp4'), /\.mp4$/);
  await assert.rejects(avatarObjectKey(scope, key, 'video/quicktime'), error => error.category === 'download_failed');
  await assert.rejects(avatarObjectKey({ kind: 'learner' }, key, 'video/webm'), /not available yet/);
  const lesson = readFileSync(new URL('../../web/src/nanogpt-lesson.js', import.meta.url), 'utf8');
  assert.equal(V1_COURSE, `karpathy/nanoGPT@${lesson.match(/nanoSourceVersion = '([0-9a-f]{40})'/)[1]}`, 'the course pin follows nanoSourceVersion');
});

// ---------- The shared public_course clip store (§14, §15) ----------

function clipStore(deps = {}) {
  const data = new Map(); let lock = Promise.resolve();
  const state = {
    id: 'avatar-scope',
    storage: { get: async k => structuredClone(data.get(k)), put: async (k, v) => data.set(k, structuredClone(v)), list: async ({ prefix }) => new Map([...data].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)])), setAlarm: async () => {} },
    blockConcurrencyWhile: fn => { const result = lock.then(fn); lock = result.catch(() => {}); return result; },
  };
  const assets = new Map();
  const env = { ...heygenEnv, LEARN_MEDIA: { put: async (k, v, options) => assets.set(k, { bytes: v, options }), get: async k => ({ body: assets.get(k).bytes, size: assets.get(k).bytes.byteLength }) } };
  return { data, assets, env, actor: new LearnAvatarClips(state, env, { profiles: PROFILES, ...deps }) };
}
const post = body => new Request('https://dev.test/api/learn/avatar', { method: 'POST', body: JSON.stringify(body) });
const jobOf = s => [...s.data].find(([k]) => k.startsWith('job:'))?.[1];
const approved = async s => s.data.set(`slot:${await scriptSlotKey(brief())}`, { script: brief().script, teaching_goal: 'Frame attention.', approved: true });

test('the clip store: a cached slot makes no model call; render needs Generate and an approved script; two concurrent misses submit once; a ready key never calls the provider', async t => {
  const logs = t.mock.method(console, 'log', () => {});
  let modelCalls = 0, submits = 0, deletes = 0;
  const director = async () => { modelCalls++; return reply(good); };
  const transport = async (url, init = {}) => {
    if (init.method === 'POST') { submits++; return Response.json({ data: { video_id: 'v_1', status: 'waiting' } }); }
    if (init.method === 'DELETE') { deletes++; return Response.json({ data: {} }); }
    return Response.json({ data: { status: 'completed', video_url: 'https://files2.heygen.ai/v_1.webm', subtitle_url: 'https://files2.heygen.ai/v_1.srt', duration: 8.4 } });
  };
  const s = clipStore({ director, reviewer: async () => review([]), transport });
  const orientation = { action: 'script', course: V1_COURSE, moment: 'orientation', concept: 'attention' };
  const first = await (await s.actor.fetch(post(orientation))).json();
  assert.deepEqual([first.cached, first.approved, first.script.text], [false, false, TEXT]);
  const second = await (await s.actor.fetch(post(orientation))).json();
  // The canonical brief: the registry's slot plus the approved script (what the owner-run render sends).
  const canonical = assembleBrief(canonicalRequest(orientation).slot, first, { render: brief().render, resolved_model: 'claude-opus-5-5', created_at: '2026-10-04T00:00:00Z' });
  assert.equal(second.cached, true);
  assert.equal(modelCalls, 1, 'the second request for a slot makes no model call');
  const unconfirmed = await s.actor.fetch(post({ action: 'render', brief: canonical }));
  assert.equal(unconfirmed.status, 428);
  const unapproved = await s.actor.fetch(post({ action: 'render', brief: canonical, confirmed: true }));
  assert.match((await unapproved.json()).error, /Approve this slot/);
  assert.equal(submits, 0, 'no provider call before Generate and approval');
  await s.actor.fetch(post({ action: 'approve', script_key: first.script_key }));
  const pair = await Promise.all([1, 2].map(() => s.actor.fetch(post({ action: 'render', brief: canonical, confirmed: true }))));
  assert.deepEqual(pair.map(r => r.status), [202, 202]);
  assert.equal(submits, 1, 'two concurrent misses submit once');
  assert.equal(jobOf(s).status, 'generating');
  const original = globalThis.fetch;
  globalThis.fetch = async url => { assert.equal(url, 'https://files2.heygen.ai/v_1.webm'); return new Response(WEBM, { headers: { 'Content-Type': 'video/webm' } }); };
  try { await s.actor.alarm(); } finally { globalThis.fetch = original; }
  const job = jobOf(s);
  assert.deepEqual([job.status, job.contentType], ['ready', 'video/webm']);
  assert.match(job.storageKey, /^learn-avatar\/[0-9a-f]{64}\/[0-9a-f]{64}\.webm$/);
  assert.equal(s.assets.get(job.storageKey).options.httpMetadata.contentType, 'video/webm');
  assert.equal(deletes, 1, 'the provider copy is deleted once ours is stored');
  assert.ok(!JSON.stringify(job).includes('files2.heygen.ai'), 'no expiring provider URL is kept');
  const list = await (await s.actor.fetch(new Request('https://dev.test/api/learn/avatar'))).json();
  assert.deepEqual(list.clips, [{ slot: 'orientation:attention:', render_key: job.key, purpose: 'orientation', duration_seconds: 8, content_type: 'video/webm', alpha: true }]);
  const asset = await s.actor.fetch(new Request(`https://dev.test/api/learn/avatar?asset=${job.key}`));
  assert.equal(asset.headers.get('content-type'), 'video/webm');
  const again = await (await s.actor.fetch(post({ action: 'render', brief: canonical, confirmed: true }))).json();
  assert.deepEqual([again.status, again.cache_hit], ['ready', true]);
  assert.equal(submits, 1, 'a ready key makes no provider call');
  const lines = logs.mock.calls.map(call => call.arguments[0]).join('\n');
  assert.match(lines, /"event":"learn_avatar"/);
  assert.ok(!lines.includes('Welcome to attention') && !lines.includes(KEY), 'logs carry no script and no key');
});

test('the clip store never repeats a paid POST: a lost submit is uncertain; a stated refusal may be retried; no provider, no job', async () => {
  let submits = 0;
  const lost = clipStore({ transport: async () => { submits++; throw new TypeError('connection reset'); } });
  await approved(lost);
  const once = await (await lost.actor.fetch(post({ action: 'render', brief: brief(), confirmed: true }))).json();
  assert.deepEqual([once.status, once.category, once.retryable], ['failed', 'submission_uncertain', false]);
  assert.equal((await lost.actor.fetch(post({ action: 'render', brief: brief(), confirmed: true, retry: true }))).status, 409);
  assert.equal(submits, 1, 'never resubmitted');
  let busyCalls = 0;
  const busy = clipStore({ transport: async () => { busyCalls++; return Response.json({ error: { code: 'rate_limit_exceeded' } }, { status: 429 }); } });
  await approved(busy);
  const limited = await (await busy.actor.fetch(post({ action: 'render', brief: brief(), confirmed: true }))).json();
  assert.deepEqual([limited.category, limited.retryable], ['rate_limited', true]);
  await busy.actor.fetch(post({ action: 'render', brief: brief(), confirmed: true }));
  assert.equal(busyCalls, 1, 'not retried without the retry confirmation');
  await busy.actor.fetch(post({ action: 'render', brief: brief(), confirmed: true, retry: true }));
  assert.equal(busyCalls, 2);
  const off = clipStore({ transport: async () => assert.fail('no provider call') });
  delete off.env.HEYGEN_API_KEY;
  await approved(off);
  const refused = await off.actor.fetch(post({ action: 'render', brief: brief(), confirmed: true }));
  assert.equal(refused.status, 422);
  assert.equal((await refused.json()).category, 'not_configured');
  assert.equal(jobOf(off), undefined);
  const learner = brief({ scope: { kind: 'learner' }, origin: 'learner_request' });
  assert.match((await (await off.actor.fetch(post({ action: 'render', brief: learner, confirmed: true }))).json()).error, /not available yet/);
  const director = clipStore();
  assert.match((await (await director.actor.fetch(post({ action: 'script', course: V1_COURSE, moment: 'orientation', concept: 'attention' }))).json()).error, /Director is not enabled/);
});

test('the clip store polls without resubmitting: a provider failure is retryable, a timeout or a lost ticket is uncertain', async t => {
  t.mock.method(console, 'log', () => {});
  const failed = clipStore({ transport: async (url, init = {}) => (init.method === 'POST' ? Response.json({ data: { video_id: 'v_2' } }) : Response.json({ data: { status: 'failed', failure_code: 'X' } })) });
  await approved(failed);
  await failed.actor.fetch(post({ action: 'render', brief: brief(), confirmed: true }));
  await failed.actor.alarm();
  assert.deepEqual([jobOf(failed).status, jobOf(failed).category, jobOf(failed).uncertain], ['failed', 'provider_failed', false]);
  const slow = clipStore({ transport: async (url, init = {}) => (init.method === 'POST' ? Response.json({ data: { video_id: 'v_3' } }) : Response.json({ data: { status: 'processing' } })) });
  await approved(slow);
  await slow.actor.fetch(post({ action: 'render', brief: brief(), confirmed: true }));
  await slow.actor.alarm();
  assert.equal(jobOf(slow).status, 'generating');
  const [name, job] = [...slow.data].find(([k]) => k.startsWith('job:'));
  slow.data.set(name, { ...job, startedAt: Date.now() - 31 * 60 * 1000 });
  await slow.actor.alarm();
  assert.deepEqual([jobOf(slow).category, jobOf(slow).uncertain], ['timeout', true]);
  slow.data.set(name, { ...job, ticket: undefined });
  await slow.actor.alarm();
  assert.deepEqual([jobOf(slow).category, jobOf(slow).uncertain], ['submission_uncertain', true]);
});

test('the read route: GET only, the V1 course only, signed in, always the one public_course instance', async () => {
  const env = { LEARN_AVATAR_CLIPS: { idFromName: name => name, get: id => ({ fetch: async req => Response.json({ id, method: req.method }) }) } };
  const signedIn = async () => ({ email: 'ada@example.com', org: 'o', name: 'a' });
  const url = `https://dev.test/api/learn/avatar?app=a&course=${encodeURIComponent(V1_COURSE)}`;
  assert.equal((await avatarClipFetch(new Request(url, { method: 'POST', body: '{}' }), env, { authorize: signedIn })).status, 405);
  assert.equal((await avatarClipFetch(new Request(url.replace('3adf61e1', '00000000')), env, { authorize: signedIn })).status, 404);
  assert.equal((await avatarClipFetch(new Request(url), env, { authorize: async () => ({}) })).status, 401);
  assert.equal((await avatarClipFetch(new Request(url), {}, { authorize: signedIn })).status, 503);
  const routed = await (await avatarClipFetch(new Request(url), env, { authorize: signedIn })).json();
  assert.deepEqual(JSON.parse(routed.id), ['avatar', 'public_course', V1_COURSE]);
  assert.equal(routed.id, scopeName({ kind: 'public_course', course: V1_COURSE }));
});

// ---------- Anti-hardcoding (Rabbit Hole global requirement, 2026-10-06; spec §33.7) ----------
// A course nothing in the code knows - a biology unit - through the same runtime with no source change: other ids,
// labels, card ids and course pin, other claim and source counts, and reordered registry data.
const BIO_COURSE = `example-org/biology-101@${'b'.repeat(40)}`;
const bioRegistry = (order = ['chlorophyll', 'light-reactions', 'calvin-cycle']) => {
  const teach = {
    chlorophyll: { card: 'bio-card-7', label: 'Chlorophyll', title: 'What makes leaves green', learning_question: 'Which light does a leaf keep?', claims: ['Chlorophyll absorbs red and blue light and reflects green.'], sources: [] },
    'light-reactions': { card: 'bio-card-2', label: 'Light reactions', title: 'Turning light into stored energy', learning_question: 'Where does the energy go first?',
      claims: ['The light reactions split water and release oxygen.', 'They store energy in two carrier molecules.', 'They happen in the thylakoid membranes.'],
      sources: [{ kind: 'code', repo: 'example-org/biology-101', revision: 'b'.repeat(40), path: 'notebooks/rates.py', lines: [10, 14], note: 'rate = light * efficiency' }, { kind: 'paper', note: 'not code: never a source note' }] },
    'calvin-cycle': { card: 'bio-card-9', label: 'Calvin cycle', title: 'Building sugar', learning_question: 'What does the stored energy build?', claims: ['The Calvin cycle uses the stored energy to build sugar from carbon dioxide.', 'It runs in the stroma.'], sources: [] },
  };
  return { course: BIO_COURSE, concepts: order, cards: order.map(id => teach[id].card).reverse(), teach: id => teach[id] ?? null };
};

test('anti-hardcoding: another course runs through the same slots, Director, reviewer, brief checks and store, with no code change', async () => {
  const registry = bioRegistry();
  // Slots: ids, labels, the course pin and the claim and source counts all come from the registry, never from code.
  const transition = canonicalRequest({ moment: 'transition', concept: 'light-reactions', to_concept: 'calvin-cycle', duration_seconds: 12 }, registry);
  assert.equal(transition.slot.scope.course, BIO_COURSE);
  assert.deepEqual(transition.slot.source_refs.map(ref => [ref.id, ref.kind, ref.card_id ?? ref.path]), [['C1', 'card', 'bio-card-2'], ['S1', 'code', 'notebooks/rates.py'], ['C2', 'card', 'bio-card-9']]);
  assert.deepEqual([transition.authored['light-reactions'].claims.length, transition.authored['calvin-cycle'].claims.length], [3, 2], 'every claim, however many');
  const back = canonicalRequest({ moment: 'rabbit_hole_return', concept: 'chlorophyll', to_concept: 'light-reactions' }, registry);
  assert.equal(briefSlotId(back.slot), 'rabbit_hole_return:chlorophyll:light-reactions');
  assert.throws(() => canonicalRequest({ moment: 'orientation', concept: 'attention' }, registry), /Unknown/, 'another course does not know nanoGPT');
  assert.throws(() => canonicalRequest({ moment: 'orientation', concept: 'chlorophyll' }), /Unknown/, 'and nanoGPT does not know biology');
  // Reordered registry data is the same course: the same slot and key.
  const reordered = canonicalRequest({ moment: 'transition', concept: 'light-reactions', to_concept: 'calvin-cycle', duration_seconds: 12 }, bioRegistry(['calvin-cycle', 'chlorophyll', 'light-reactions']));
  assert.equal(await scriptSlotKey(reordered.slot), await scriptSlotKey(transition.slot));
  // The Director: the same static prompt; only the brief differs. Example leaks are caught, biology words pass.
  const input = canonicalInput(transition);
  assert.deepEqual(directorRequest(input).system, directorRequest(canonicalInput(canonicalRequest({ moment: 'orientation', concept: 'attention' }))).system);
  assert.deepEqual([exampleLeaks('The light reactions store energy, like tokenization stores text.', input), exampleLeaks('Light splits water; next, that energy builds sugar.', input)], [['tokenization'], []]);
  // Director -> rules -> reviewer -> a full brief, checked against this course's registry.
  const script = { teaching_goal: 'Move from the light reactions to the Calvin cycle.', text: 'The light reactions split water and store energy. Next: how that energy builds sugar.', source_ref_ids: ['C1', 'C2'] };
  const prepared = await prepareScript({ director: async () => reply(script), reviewer: async () => review([]) }, input);
  assert.equal(prepared.status, 'ok');
  const assembled = assembleBrief(transition.slot, prepared, { render: brief().render, resolved_model: 'claude-opus-5-5', created_at: '2026-10-06T00:00:00Z' });
  assert.equal(validateBrief(assembled, registry), assembled);
  assert.throws(() => validateBrief(assembled, AVATAR_REGISTRY), /unknown concept/, 'the brief is checked against its own course');
  // The store: a second course is a second registry entry; both courses are served side by side.
  const s = clipStore({ registries: { ...COURSE_REGISTRIES, [BIO_COURSE]: registry }, director: async request => reply(JSON.stringify(request).includes('light-reactions') ? script : good), reviewer: async () => review([]) });
  const bio = await (await s.actor.fetch(post({ action: 'script', course: BIO_COURSE, moment: 'transition', concept: 'light-reactions', to_concept: 'calvin-cycle', duration_seconds: 12 }))).json();
  const nano = await (await s.actor.fetch(post({ action: 'script', course: V1_COURSE, moment: 'orientation', concept: 'attention' }))).json();
  assert.deepEqual([bio.script.text, nano.script.text, bio.script_key === await scriptSlotKey(transition.slot)], [script.text, TEXT, true]);
  assert.match((await (await s.actor.fetch(post({ action: 'script', course: `${BIO_COURSE}x`, moment: 'orientation', concept: 'chlorophyll' }))).json()).error, /Unknown course/);
});

test('anti-hardcoding: the Tutor registry adapter has no fixed shape - renamed ids, other counts, reordered cards', () => {
  // A Tutor-shaped registry (learn-tutor-claims.js) that shares no id, label or count with the nanoGPT slice.
  const CONCEPTS = { 'osmosis-x': { label: 'Osmosis' }, 'diffusion-y': { label: 'Diffusion' } };
  const CLAIMS = { k9: { concept: 'osmosis-x', statement: 'Water crosses a membrane toward the saltier side.' }, k2: { concept: 'diffusion-y', statement: 'Particles spread from crowded to sparse.' }, k5: { concept: 'osmosis-x', statement: 'The membrane lets water through but not salt.' } };
  const MODULES = { 'card-b': { scene: { title: 'Spreading out' }, evidence: { learningQuestion: 'Why does a drop of dye spread?' }, targets: ['k2'] },
    'card-a': { scene: { title: 'Thirsty cells' }, evidence: { learningQuestion: 'Where does the water go?' }, targets: ['k9', 'k5'], sources: [] } };
  const registry = tutorRegistry(BIO_COURSE, { CONCEPTS, CLAIMS, SLICE_CARDS: ['card-b', 'card-a'], cardModule: id => MODULES[id],
    claimsOfConcept: id => Object.keys(CLAIMS).filter(claim => CLAIMS[claim].concept === id), targetClaims: ({ card_id }) => MODULES[card_id].targets });
  const slot = canonicalRequest({ moment: 'orientation', concept: 'osmosis-x' }, registry);
  assert.deepEqual([slot.slot.source_refs[0].card_id, slot.authored['osmosis-x'].claims.length, slot.authored['osmosis-x'].learning_question], ['card-a', 2, 'Where does the water go?']);
  assert.equal(registry.teach('photosynthesis'), null);
});
