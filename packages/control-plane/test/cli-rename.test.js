// small -> rabbit-hole CLI rename: installed small CLIs and new rabbit-hole CLIs both keep working.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register, createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sign } from '../src/token.js';
import { buildRunbook } from '../src/runbook-schema.js';

register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(s, c, n) { return s.endsWith('.html') ? { url: 'stub:html', shortCircuit: true } : n(s, c); }
  export async function load(u, c, n) { return u === 'stub:html' ? { format: 'module', source: 'export default ""', shortCircuit: true } : n(u, c); }
`));
const worker = (await import('../src/index.js')).default;
const { buildBundle } = createRequire(import.meta.url)('../../cli/lib/bundle.js');

// D1 stub that records every statement and finds nothing.
function recordingDb() {
  const sql = [];
  return { sql, prepare: (q) => (sql.push(q), { bind: () => ({ first: async () => null, all: async () => ({ results: [] }), run: async () => ({ meta: { changes: 0 } }) }) }) };
}

test('unauthenticated API calls keep the exact 401 that installed small CLIs match', async () => {
  const res = await worker.fetch(new Request('https://cp.example.test/api/auth/config'), { MASTER_KEY: 'k', DB: recordingDb() }, { waitUntil() {} });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'run small login first' });
});

test('deploy without Fly stops before any D1 write', async () => {
  const env = { MASTER_KEY: 'k', DB: recordingDb() };
  const token = await sign({ t: 'cli', email: 'a@example.com', org: 'example-com' }, env.MASTER_KEY);
  const res = await worker.fetch(new Request('https://cp.example.test/api/deploy', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'counter', framework: 'flask', kind: 'server', inputs: null, agentMd: 'notes' }),
  }), env, { waitUntil() {} });
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /FLY_API_TOKEN/);
  assert.deepEqual(env.DB.sql.filter((q) => /^\s*(INSERT|UPDATE|DELETE)/i.test(q)), []);
});

test('the runbook reads the app config from a rabbit-hole.toml or a legacy small.toml bundle', async (t) => {
  t.mock.method(console, 'log', () => {}); // the CLI's legacy-config notice must not reach the runner's stdout
  const real = globalThis.fetch;
  t.after(() => { globalThis.fetch = real; });
  globalThis.fetch = async (url) => {
    assert.match(String(url), /api\.anthropic\.com/); // mocked model, no paid call
    return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'submit_runbook', input: { what_it_does: 'Greets.' } }] });
  };
  for (const config of ['rabbit-hole.toml', 'small.toml']) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-rename-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(dir, config), 'name = "hello"\nentry = "job.py"\ntype = "job"\n\n[storage]\npath = "/data"\n');
    fs.writeFileSync(path.join(dir, 'job.py'), 'print("hi")\n');
    const { bundle } = buildBundle(dir, 'job.py', {});
    assert.ok(bundle.includes(`=== ${config} ===`));
    const app = { id: 1, name: 'hello', org: 'example-com', kind: 'job', visibility: 'domain', owner_email: 'a@example.com',
      inputs: JSON.stringify({ name: { type: 'text' } }), outputs: null, review: null };
    const { runbook: rb, warnings } = await buildRunbook({ ANTHROPIC_API_KEY: 'k', DB: recordingDb() }, app, null, { bundle }, 'https://digrabbithole.com');
    assert.equal(rb.run_locally.start, 'python job.py', config);
    assert.deepEqual(rb.commands.map((c) => c.from), [config]);
    assert.deepEqual(rb.data_flow.inputs_from.map((e) => e.at), [config]);
    assert.equal(rb.data_flow.persists.length, 1, config);
    assert.equal(rb.example_run.command, 'rabbit-hole run hello');
    assert.deepEqual(warnings.filter((w) => /data_flow|command dropped/.test(w)), [], config);
  }
});
