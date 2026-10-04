'use strict';
// small -> rabbit-hole migration: new names work, legacy names keep working, and
// nothing defaults to localhost or a retired small-* control plane.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { detect } = require('../lib/detect');
const { migrate } = require('../lib/init');
const { buildBundle } = require('../lib/bundle');
const cognito = require('../lib/cognito');

const root = path.join(__dirname, '..');
const bin = (name) => path.join(root, 'bin', name);

function tmp(t, files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rabbit-hole-migration-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

// Run a bin with an isolated HOME and a recording fetch: no real service is reached.
// RESPONSES maps "METHOD pathname" to a JSON body; anything else throws.
function cli(t, binName, args, { home = {}, project = {}, env = {}, responses = {} } = {}) {
  const homeDir = tmp(t, home);
  const cwd = tmp(t, project);
  const log = path.join(homeDir, 'calls.jsonl');
  const preload = path.join(homeDir, 'fetch.cjs');
  fs.writeFileSync(preload, `
const fs = require('node:fs');
const responses = ${JSON.stringify(responses)};
globalThis.fetch = async (url, options = {}) => {
  const method = options.method || 'GET';
  fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ url, method, auth: options.headers?.Authorization }) + '\\n');
  const hit = responses[method + ' ' + new URL(url).pathname];
  if (!hit) throw new Error('unexpected request ' + method + ' ' + url);
  return Response.json(hit.body, { status: hit.status || 200 });
};
`);
  const clean = { ...process.env };
  for (const k of ['RABBIT_HOLE_API', 'RABBIT_HOLE_TOKEN', 'RABBIT_HOLE_WORKSPACE', 'SMALL_API', 'SMALL_TOKEN', 'SMALL_WORKSPACE']) delete clean[k];
  const r = spawnSync(process.execPath, ['--require', preload, bin(binName), ...args], {
    cwd, encoding: 'utf8', timeout: 15000, env: { ...clean, HOME: homeDir, USERPROFILE: homeDir, ...env },
  });
  const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse) : [];
  return { ...r, calls, homeDir, cwd };
}

const apps = { 'GET /api/apps': { body: { apps: [{ name: 'counter', visibility: 'domain', owner_email: 'a@example.com' }] } } };

const LEGACY = ['deploy', 'run', 'runs', 'logs', 'schedule', 'watch', 'share', 'review', 'runbook', 'skill'];

test('package ships @rabbit-hole/cli with only the rabbit-hole bin, publicly', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.name, '@rabbit-hole/cli');
  assert.deepEqual(pkg.bin, { 'rabbit-hole': 'bin/rabbit-hole.js' }); // small stays with the small-deploy package
  assert.ok(!fs.existsSync(bin('small.js')));
  assert.equal(pkg.publishConfig.access, 'public'); // a scoped package defaults to restricted
});

test('rabbit-hole help lists only the canonical commands; help legacy lists the rest', (t) => {
  const r = cli(t, 'rabbit-hole.js', ['--help']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  assert.match(r.stdout, /^usage: rabbit-hole <command>$/m);
  for (const c of ['login', 'init', 'init --migrate', 'capture', 'list']) assert.match(r.stdout, new RegExp(`^  ${c} `, 'm'), c);
  for (const c of LEGACY) assert.doesNotMatch(r.stdout, new RegExp(`^  ${c}\\b`, 'm'), `${c} is advertised`);
  assert.doesNotMatch(r.stdout, /small-deploy|\bsmall (deploy|login|run)\b|deploy|localhost/);
  const legacy = cli(t, 'rabbit-hole.js', ['help', 'legacy']);
  assert.equal(legacy.status, 0, legacy.stderr);
  assert.match(legacy.stdout, /not part of Rabbit Hole/);
  for (const c of LEGACY) assert.match(legacy.stdout, new RegExp(`^  ${c}\\b`, 'm'), c);
});

test('a legacy command still runs, with a one-line notice on stderr only', (t) => {
  const r = cli(t, 'rabbit-hole.js', ['runs', 'counter'], { env: { RABBIT_HOLE_TOKEN: 'fixture' }, responses: {
    'GET /api/byoc/connection': { status: 404, body: { error: 'no connection' } }, 'GET /api/runs': { body: { runs: [] } } } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr.trim(), '⚠ rabbit-hole runs: legacy Small command; not part of Rabbit Hole (rabbit-hole help legacy)');
  assert.equal(r.stdout.trim(), 'no runs yet - rabbit-hole run counter');
  assert.deepEqual(r.calls.map((c) => c.url), ['https://digrabbithole.com/api/byoc/connection', 'https://digrabbithole.com/api/runs?app=counter']);
  const canonical = cli(t, 'rabbit-hole.js', ['list'], { env: { RABBIT_HOLE_TOKEN: 'fixture' }, responses: apps });
  assert.equal(canonical.stderr, ''); // canonical commands carry no notice
});

test('capture is reserved: it says Knowledge Capture is not available and exits non-zero, offline', (t) => {
  const r = cli(t, 'rabbit-hole.js', ['capture', 'anything', '--workspace', 'w-team'], { env: { RABBIT_HOLE_TOKEN: 'fixture' } });
  assert.equal(r.status, 1);
  assert.equal(r.stderr.trim(), '✗ Knowledge Capture is not available yet');
  assert.equal(r.stdout, '');
  assert.deepEqual(r.calls, []);
});

test('list prints what Rabbit Hole production returns: canvases and repositories', (t) => {
  // web/dev-worker.js answers GET /api/apps with control-plane canvasApp and repositoryApp rows
  const production = { 'GET /api/apps': { body: { org: 'example-com', email: 'a@example.com', folders: [], apps: [
    { name: 'repo-nanogpt', kind: 'repository', repo: 'karpathy/nanoGPT', visibility: 'domain', owner_email: 'a@example.com' },
    { name: 'canvas-0a1b2c3d', kind: 'canvas', title: 'Attention, step by step', visibility: 'private', owner_email: 'a@example.com' },
  ] } } };
  const r = cli(t, 'rabbit-hole.js', ['list'], { env: { RABBIT_HOLE_TOKEN: 'fixture' }, responses: production });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'repo-nanogpt  repository  karpathy/nanoGPT\ncanvas-0a1b2c3d  canvas  Attention, step by step\n');
  const empty = cli(t, 'rabbit-hole.js', ['list'], { env: { RABBIT_HOLE_TOKEN: 'fixture' }, responses: { 'GET /api/apps': { body: { apps: [] } } } });
  assert.equal(empty.stdout, 'nothing in this workspace yet\n');
});

test('production default is the bare digrabbithole.com origin with /api appended', (t) => {
  const r = cli(t, 'rabbit-hole.js', ['list'], { env: { RABBIT_HOLE_TOKEN: 'fixture' }, responses: apps });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.calls, [{ url: 'https://digrabbithole.com/api/apps', method: 'GET', auth: 'Bearer fixture' }]);
});

test('no production code path defaults to localhost or a small-* control plane', () => {
  const files = [...fs.readdirSync(path.join(root, 'lib')).map((f) => path.join('lib', f)), 'bin/rabbit-hole.js'];
  // allowed: the private-AWS Cognito loopback callback (a redirect target, not an API
  // base), and config.js naming retired hosts only to refuse a legacy login saved for them
  const allowed = [/\.test\(value\.cliRedirectUri\)|server\.listen\(Number\(callback\.port\), '127\.0\.0\.1'/, /LEGACY_DEFAULT = |isLegacyHost = /];
  for (const file of files) {
    for (const line of fs.readFileSync(path.join(root, file), 'utf8').split('\n')) {
      if (!/localhost|127\.0\.0\.1|small-cp|zeroshothq|workers\.dev/.test(line) || /^\s*\/\//.test(line)) continue;
      assert.ok(allowed.some((rx) => rx.test(line)), `${file}: ${line.trim()}`);
    }
  }
});

test('RABBIT_HOLE_API overrides, the legacy SMALL_API still works, and RABBIT_HOLE_API wins', (t) => {
  const dev = { env: { RABBIT_HOLE_TOKEN: 'fixture', SMALL_API: 'https://legacy-dev.example' }, responses: apps };
  assert.equal(cli(t, 'rabbit-hole.js', ['list'], dev).calls[0].url, 'https://legacy-dev.example/api/apps');
  dev.env.RABBIT_HOLE_API = 'https://dev.example';
  assert.equal(cli(t, 'rabbit-hole.js', ['list'], dev).calls[0].url, 'https://dev.example/api/apps');
});

test('login rejects an API base with a path before any request', (t) => {
  for (const opts of [{ args: ['login', '--api', 'https://digrabbithole.com/api'] }, { args: ['login'], env: { RABBIT_HOLE_API: 'https://digrabbithole.com/api' } }]) {
    const r = cli(t, 'rabbit-hole.js', [...opts.args, '--email', 'a@example.com', '--code', '1'], { env: opts.env });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--api needs an installation origin without a path/);
    assert.deepEqual(r.calls, []);
  }
});

test('login writes ~/.rabbit-hole/config.json and leaves the legacy file untouched', (t) => {
  const legacy = JSON.stringify({ apiBase: 'https://customer.example', token: 'legacy' });
  const r = cli(t, 'rabbit-hole.js', ['login', '--email', 'a@example.com', '--code', '12345678'], {
    home: { '.small/config.json': legacy },
    responses: {
      'GET /api/auth/config': { status: 401, body: { error: 'run small login first' } },
      'POST /api/cli/login': { body: { challenge: 'c1' } },
      'POST /api/cli/verify': { body: { token: 'new-token', email: 'a@example.com', org: 'example-com' } },
    },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.calls.every((c) => c.url.startsWith('https://customer.example/api/')), 'login uses the saved legacy origin');
  const saved = JSON.parse(fs.readFileSync(path.join(r.homeDir, '.rabbit-hole', 'config.json'), 'utf8'));
  assert.equal(saved.token, 'new-token');
  assert.equal(saved.apiBase, 'https://customer.example');
  assert.equal(fs.readFileSync(path.join(r.homeDir, '.small', 'config.json'), 'utf8'), legacy);
});

test('a legacy ~/.small/config.json login is still read; ~/.rabbit-hole wins when both exist', (t) => {
  const legacy = { '.small/config.json': JSON.stringify({ apiBase: 'https://customer.example', token: 'legacy' }) };
  const r = cli(t, 'rabbit-hole.js', ['list'], { home: legacy, responses: apps });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.calls, [{ url: 'https://customer.example/api/apps', method: 'GET', auth: 'Bearer legacy' }]);
  const both = { ...legacy, '.rabbit-hole/config.json': JSON.stringify({ apiBase: 'https://digrabbithole.com', token: 'new' }) };
  assert.deepEqual(cli(t, 'rabbit-hole.js', ['list'], { home: both, responses: apps }).calls[0].auth, 'Bearer new');
});

test('a legacy login saved for a retired small-cp host is never used silently', (t) => {
  const home = { '.small/config.json': JSON.stringify({ apiBase: 'https://small-cp.zeroshothq.workers.dev', token: 'old' }) };
  const r = cli(t, 'rabbit-hole.js', ['list'], { home, responses: apps });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not using the small login for https:\/\/small-cp\.zeroshothq\.workers\.dev/);
  assert.match(r.stderr, /not logged in - run: rabbit-hole login/);
  assert.deepEqual(r.calls, []); // the small-cp token never reaches digrabbithole.com
  // naming that host explicitly is a choice, not a fallback
  const explicit = cli(t, 'rabbit-hole.js', ['list'], { home, env: { SMALL_API: 'https://small-cp.zeroshothq.workers.dev' }, responses: apps });
  assert.equal(explicit.status, 0, explicit.stderr);
  assert.deepEqual(explicit.calls[0], { url: 'https://small-cp.zeroshothq.workers.dev/api/apps', method: 'GET', auth: 'Bearer old' });
});

test('hosted login discovery accepts the legacy and the new 401 wording', async (t) => {
  for (const error of ['run small login first', 'run rabbit-hole login first']) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ error }, { status: 401 }));
    assert.equal(await cognito.discover('https://digrabbithole.com'), null);
  }
});

test('rabbit-hole init creates rabbit-hole.toml, never small.toml', (t) => {
  const r = cli(t, 'rabbit-hole.js', ['init'], { env: { RABBIT_HOLE_TOKEN: 'fixture' }, project: { 'app.py': 'from flask import Flask\napp = Flask(__name__)\n' } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /✓ wrote rabbit-hole\.toml/);
  assert.match(fs.readFileSync(path.join(r.cwd, 'rabbit-hole.toml'), 'utf8'), /^entry = "app.py"$/m);
  assert.ok(!fs.existsSync(path.join(r.cwd, 'small.toml')));
  assert.doesNotMatch(fs.readFileSync(path.join(r.cwd, 'AGENT.md'), 'utf8'), /small|rabbit-hole deploy/);
});

test('rabbit-hole.toml configures detection; it wins over small.toml with a notice', (t) => {
  const dir = tmp(t, { 'rabbit-hole.toml': 'name = "new"\nentry = "web.py"\n', 'web.py': 'print(1)', 'old.py': 'print(2)' });
  assert.deepEqual([detect(dir).name, detect(dir).entry, detect(dir).via], ['new', 'web.py', 'rabbit-hole.toml']);
  fs.writeFileSync(path.join(dir, 'small.toml'), 'name = "old"\nentry = "old.py"\n');
  const log = t.mock.method(console, 'log', () => {});
  const app = detect(dir);
  assert.deepEqual([app.name, app.entry], ['new', 'web.py']);
  assert.match(log.mock.calls[0].arguments[0], /rabbit-hole\.toml and small\.toml both exist - using rabbit-hole\.toml/);
  log.mock.restore();
  const { bundle } = buildBundle(dir, 'web.py', {});
  assert.ok(bundle.includes('=== rabbit-hole.toml ===') && !bundle.includes('=== small.toml ==='));
});

test('legacy small.toml still loads, ships under its own name, and init leaves it alone', (t) => {
  const legacy = 'name = "old"\nentry = "job.py"\ntype = "job"\n';
  const r = cli(t, 'rabbit-hole.js', ['init'], { env: { RABBIT_HOLE_TOKEN: 'fixture' }, project: { 'small.toml': legacy, 'job.py': 'print(1)' } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /using legacy small\.toml - copy it to rabbit-hole\.toml with: rabbit-hole init --migrate/);
  assert.ok(!fs.existsSync(path.join(r.cwd, 'rabbit-hole.toml')));
  assert.equal(fs.readFileSync(path.join(r.cwd, 'small.toml'), 'utf8'), legacy);
  const log = t.mock.method(console, 'log', () => {});
  assert.deepEqual([detect(r.cwd).name, detect(r.cwd).via], ['old', 'small.toml']);
  assert.ok(buildBundle(r.cwd, 'job.py', {}).bundle.includes('=== small.toml ==='));
  log.mock.restore();
});

test('init --migrate copies small.toml byte for byte and never touches it', (t) => {
  const legacy = '# mine\nname = "old"\nentry = "job.py"\n\n[secrets]\nrequired = ["KEY"]\n';
  const r = cli(t, 'rabbit-hole.js', ['init', '--migrate'], { project: { 'small.toml': legacy, 'job.py': 'print(1)' } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /✓ copied small\.toml to rabbit-hole\.toml - small\.toml is untouched/);
  assert.equal(fs.readFileSync(path.join(r.cwd, 'rabbit-hole.toml'), 'utf8'), legacy);
  assert.equal(fs.readFileSync(path.join(r.cwd, 'small.toml'), 'utf8'), legacy);
  assert.deepEqual(r.calls, []); // a local copy, no network

  const log = t.mock.method(console, 'log', () => {});
  fs.writeFileSync(path.join(r.cwd, 'rabbit-hole.toml'), 'name = "edited"\n');
  assert.equal(migrate(r.cwd), true); // an existing rabbit-hole.toml is never overwritten without --force
  assert.equal(fs.readFileSync(path.join(r.cwd, 'rabbit-hole.toml'), 'utf8'), 'name = "edited"\n');
  fs.rmSync(path.join(r.cwd, 'small.toml'));
  assert.equal(migrate(r.cwd), false);
  log.mock.restore();
});

test('user-facing docs never name small-deploy or the bare small command, nor advertise legacy commands', () => {
  const repo = path.join(root, '..', '..');
  const commands = 'login|init|deploy|run|runs|logs|list|watch|schedule|share|workspaces|review|runbook|skill|help';
  // `\n` inside a JS string literal counts as a line start
  const small = new RegExp(`small-deploy|(?:^|\\\\n|[^\\w/.-])small (${commands})\\b`);
  const advertised = new RegExp(`rabbit-hole (${LEGACY.join('|')})\\b`);
  const files = {
    'packages/cli/README.md': (s) => s.split('## Moving from small-deploy')[0], // the migration note names the old package on purpose
    'packages/web/src/Sidebar.jsx': (s) => s, // the guide itself is tested in web flags.test.mjs (both CLI_PUBLISHED states)
    'packages/web/src/landing/docs-content.js': (s) => s,
    'packages/web/index.html': (s) => s,
    'README.md': (s) => s,
  };
  for (const [file, scope] of Object.entries(files)) {
    const text = scope(fs.readFileSync(path.join(repo, file), 'utf8'));
    for (const rx of [small, advertised]) {
      const hit = text.split('\n').find((line) => rx.test(line));
      assert.equal(hit, undefined, `${file} still says: ${hit && hit.trim()}`);
    }
  }
});
