// Independent progression acceptance recovered from Parallel's 2026-10-09 20:01 and 20:34 handoffs.
// Pure product helpers + real journey routes + the existing offline harness database; scripted planners only.
// TUTOR_CANDIDATE_ROOT selects an isolated exact-SHA checkout, never Learning's dirty working tree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root = process.env.TUTOR_CANDIDATE_ROOT || fileURLToPath(new URL('../../../', import.meta.url));
const moduleAt = path => import(pathToFileURL(resolve(root, path)).href);
const { freshLearnDb } = await moduleAt('tests/evals/tutor-session/harness.mjs');
const { journeyRoute } = await moduleAt('packages/control-plane/src/learn-journey.js');
const { fixtureModel } = await moduleAt('packages/control-plane/src/learn-journey-fixtures.js');
const journey = await moduleAt('packages/web/src/learn-journey.js');
const { journeyDomain } = await moduleAt('packages/web/src/learn-journey-domain.js');
const { deriveClaimStates } = await moduleAt('packages/web/src/learn-tutor-evidence.js');

async function world(t) {
  const db = await freshLearnDb(); t.after(db.close);
  const access = { org: 'eval-org', user_id: 'eval-owner', email: 'eval@example.invalid', app: 'eval-canvas', kind: 'canvas' };
  let failed = false, calls = 0;
  const callModel = async (...args) => {
    calls++;
    if (failed && args[1].tools?.[0]?.name === 'journey_section') return Response.json({ error: { message: 'scripted failure' } }, { status: 500 });
    return fixtureModel(...args);
  };
  const request = async (method, body) => {
    const url = `http://local/api/learn/journey${method === 'GET' ? '?app=eval-canvas&board=main' : ''}`;
    const response = await journeyRoute('/api/learn/journey', new Request(url, { method, headers: { 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify({ app: 'eval-canvas', board: 'main', ...body }) } : {}) }), { LEARN_DB: db.LEARN_DB }, { authorize: async () => access, callModel });
    return { status: response.status, body: await response.json() };
  };
  const post = body => request('POST', body), read = async () => (await request('GET')).body;
  const start = await post({ action: 'start', text: 'Teach me logistic regression, skip setup and just start' });
  assert.equal(start.status, 200);
  assert.equal(start.body.journey.state, 'active');
  return { post, read, calls: () => calls, fail: value => { failed = value; },
    coveredPath: async ({ evidence = true, contradict = false } = {}) => {
      const view = await read(), path = structuredClone(view.path);
      const claims = [...new Set(path.sections.flatMap(s => s.expected_evidence.map(e => e.claim)))];
      const events = evidence ? claims.flatMap(claim => view.journey.registry.claims[claim].ideas.map((_, idea) => ({
        claim, concept: claim.split('/')[0], idea, result: 'pass', kind: 'demonstrated_in_transfer', settled: true, evaluator: 'deterministic', source: 'probe',
      }))) : [];
      const contradicted = path.sections[0].expected_evidence[0].claim;
      if (contradict) events.push({ claim: contradicted, concept: contradicted.split('/')[0], idea: 0, result: 'fail', kind: null, settled: true, evaluator: 'deterministic', source: 'probe' });
      events.forEach((e, i) => { e.seq = i + 1; });
      path.sections.forEach(s => { s.status = 'already_understood'; s.generation_state = 'not_generated'; s.evidence_refs = [99999]; });
      path.current_section_id = null;
      db.sqlite.prepare("UPDATE learning_journeys SET state = 'path_review', active_section_id = NULL, evidence_json = ?").run(JSON.stringify({ seq: events.length, events }));
      db.sqlite.prepare('UPDATE learning_path_versions SET path_json = ? WHERE version = ?').run(JSON.stringify(path), path.version);
      return read();
    },
    evidence: async results => {
      const view = await read(), claim = view.journey.section_plan.completion_evidence[0].claim;
      const events = results.map((result, i) => ({ seq: i + 1, claim, concept: claim.split('/')[0], idea: 0,
        result, kind: result === 'pass' ? 'demonstrated_in_transfer' : null, settled: true, evaluator: 'deterministic', source: 'probe' }));
      // Fixture setup only. The assertions consume the stored events through the actual product route/helpers.
      db.sqlite.prepare('UPDATE learning_journeys SET evidence_json = ?').run(JSON.stringify({ seq: events.length, events }));
      return read();
    } };
}
const states = view => deriveClaimStates(view.journey.evidence.events, view.journey.registry.claims);
const move = (w, view, extra = {}) => w.post({ action: 'next_section', revision: view.journey.revision, ...extra });
const chip = view => { assert.equal(typeof journey.moveOnChip, 'function', 'Learning must implement the deterministic completion chip'); return journey.moveOnChip(view.journey, view.path); };

test('P01 satisfied evidence immediately enables completion, without an explicit skip or planner call', async t => {
  const w = await world(t), view = await w.evidence(['pass']), calls = w.calls();
  assert.ok(chip(view)); assert.equal(w.calls(), calls);
  const out = await move(w, view, { require: 'completed' });
  assert.equal(out.status, 200); assert.equal(out.body.path.sections[0].status, 'completed');
});
test('P02 incomplete evidence does not enable the completion chip', async t => {
  const w = await world(t);
  assert.equal(chip(await w.read()), null);
  assert.equal(chip(await w.evidence(['fail'])), null);
});
test('P03 explicit move-on before completion records skipped and preserves all evidence and claim states', async t => {
  const w = await world(t), before = await w.evidence(['fail']), out = await move(w, before);
  assert.equal(out.status, 200); assert.equal(out.body.path.sections[0].status, 'skipped');
  assert.equal(out.body.path.change.cause, 'learner_skip');
  assert.deepEqual(out.body.journey.evidence, before.journey.evidence); assert.deepEqual(states(out.body), states(before));
});
test('P04 skipping never creates understanding', async t => {
  const w = await world(t), before = await w.read(), out = await move(w, before);
  assert.equal(out.status, 200); assert.equal(out.body.path.sections[0].status, 'skipped');
  assert.ok(!Object.values(states(out.body)).some(c => c.state === 'understood'));
});
test('P05 a later contradiction defeats the earlier pass for completion', async t => {
  const w = await world(t), view = await w.evidence(['pass', 'fail']);
  assert.equal(journey.sectionCompletion(view.journey).met, false);
  const out = await move(w, view); assert.equal(out.body.path.sections[0].status, 'skipped');
});
test('P06 final section produces an honest outcome and gaps, then refuses further moves', async t => {
  const w = await world(t); let current = await w.read();
  const count = current.path.sections.length;
  for (let i = 0; i < count; i++) {
    const out = await move(w, current); assert.equal(out.status, 200); current = out.body;
  }
  assert.equal(current.journey.state, 'completed'); assert.equal(current.path.current_section_id, null);
  assert.equal(current.path.change.outcome.result, 'incomplete');
  assert.equal(current.path.change.outcome.sections.skipped.length, count);
  assert.ok(current.path.change.outcome.gaps.length > 0);
  assert.equal((await move(w, current)).status, 409);
  assert.deepEqual(await w.read(), current);
});
test('P07 duplicate requests do not move a second time', async t => {
  const w = await world(t), before = await w.read(), first = await move(w, before), again = await move(w, before);
  assert.equal(first.status, 200); assert.equal(again.status, 409);
  assert.equal(again.body.path.version, first.body.path.version); assert.deepEqual(await w.read(), first.body);
});
test('P08 stale revision is refused without a planner call or state mutation', async t => {
  const w = await world(t), before = await w.read(), calls = w.calls();
  const out = await move(w, before, { revision: before.journey.revision - 1 });
  assert.equal(out.status, 409); assert.equal(w.calls(), calls); assert.deepEqual(await w.read(), before);
});
test('P09 reload agrees with saved path, rail entries and Tutor context after progression', async t => {
  const w = await world(t), out = await move(w, await w.read()), reload = await w.read();
  assert.equal(out.status, 200); assert.deepEqual(reload, out.body);
  assert.deepEqual(journey.pathEntries(reload.path), journey.pathEntries(out.body.path));
  const domain = v => journeyDomain({ journey: v.journey, path: v.path, blocks: [] }).context;
  assert.deepEqual(domain(reload), domain(out.body));
});
test('P10 planning failure preserves the move; reload and retry recover without another advance', async t => {
  const w = await world(t), before = await w.read(); w.fail(true);
  const out = await move(w, before); assert.equal(out.status, 502);
  const reload = await w.read();
  assert.equal(reload.journey.active_section_id, out.body.journey.active_section_id);
  assert.equal(reload.path.version, before.path.version + 1); assert.equal(reload.journey.error.retryable, true);
  w.fail(false);
  const retry = await w.post({ action: 'retry', revision: reload.journey.revision });
  assert.equal(retry.status, 200); assert.equal(retry.body.path.version, reload.path.version);
  assert.equal(retry.body.journey.active_section_id, reload.journey.active_section_id);
});
test('P11 server rechecks current evidence even when the client claims completion', async t => {
  const w = await world(t), before = await w.evidence(['pass', 'fail']), calls = w.calls();
  const out = await move(w, before, { require: 'completed', completed: true, section_complete: true });
  assert.equal(out.status, 409); assert.equal(out.body.error, 'completion_not_met');
  assert.deepEqual(await w.read(), before); assert.equal(w.calls(), calls);
});

test('P12 accepting a fully understood path preserves a distinct outcome and reload without planning', async t => {
  const w = await world(t), before = await w.coveredPath(), calls = w.calls();
  const out = await w.post({ action: 'accept', revision: before.journey.revision });
  assert.equal(out.status, 200); assert.equal(w.calls(), calls);
  assert.equal(out.body.journey.state, 'completed');
  const outcome = out.body.path.change.outcome;
  assert.deepEqual(outcome.sections.already_understood, before.path.sections.map(s => s.id));
  assert.deepEqual(outcome.sections.completed, []); assert.deepEqual(outcome.sections.skipped, []);
  assert.deepEqual(outcome.gaps, []);
  assert.deepEqual(out.body.journey.evidence, before.journey.evidence);
  assert.ok(out.body.path.sections.every(s => s.evidence_refs.length && s.evidence_refs.every(seq => before.journey.evidence.events.some(e => e.seq === seq))));
  assert.match(journey.outcomeLine(outcome, out.body.path, out.body.journey.registry), /Already understood:/);
  assert.deepEqual(await w.read(), out.body);
});

test('P13 fresh contradictory evidence defeats a stale already-understood path and receipt', async t => {
  const w = await world(t), before = await w.coveredPath({ contradict: true });
  const out = await w.post({ action: 'accept', revision: before.journey.revision });
  assert.equal(out.status, 200); assert.equal(out.body.journey.state, 'active');
  assert.equal(out.body.journey.active_section_id, before.path.sections[0].id);
  assert.notEqual(out.body.path.sections[0].status, 'already_understood');
  assert.deepEqual(out.body.journey.evidence, before.journey.evidence);
  assert.deepEqual(await w.read(), out.body);
});

test('P14 an already-understood label and claimed receipt without evidence never bypass teaching', async t => {
  const w = await world(t), before = await w.coveredPath({ evidence: false });
  const out = await w.post({ action: 'accept', revision: before.journey.revision });
  assert.equal(out.status, 200); assert.equal(out.body.journey.state, 'active');
  assert.ok(out.body.path.sections.every(s => s.status !== 'already_understood'));
  assert.ok(!Object.values(states(out.body)).some(s => s.state === 'understood'));
  assert.deepEqual(out.body.journey.evidence, before.journey.evidence);
});
