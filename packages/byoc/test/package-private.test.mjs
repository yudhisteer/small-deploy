import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, validateConfigTarget } from '../package-private.mjs';

test('private packaging requires an explicit matching target', () => {
  assert.throws(() => parseCommand(['installation.json']), /--target/);
  assert.throws(() => parseCommand(['--target', 'preview', 'installation.json']), /dev or live/);
  assert.equal(parseCommand(['--target', 'dev', 'installation.json']).target, 'dev');
  assert.throws(() => validateConfigTarget({ target: 'live' }, 'dev'), /must match/);
  assert.doesNotThrow(() => validateConfigTarget({ target: 'dev' }, 'dev'));
});

test('live packaging requires the exact confirmation phrase', () => {
  assert.throws(() => parseCommand(['--target', 'live', 'installation.json']), /--confirm.*DEPLOY LIVE/);
  assert.throws(() => parseCommand(['--target', 'live', '--confirm', 'deploy live', 'installation.json']), /--confirm.*DEPLOY LIVE/);
  assert.equal(parseCommand(['--target', 'live', '--confirm', 'DEPLOY LIVE', 'installation.json']).target, 'live');
});

test('a dev release ships the CLI archive the private dashboard names, plus the pre-rename copy', async (t) => {
  const { CLI_ARCHIVES } = await import('../package-private.mjs');
  const { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const sidebar = readFileSync(new URL('../../web/src/Sidebar.jsx', import.meta.url), 'utf8');
  assert.ok(sidebar.includes(`'npm i -g ./${CLI_ARCHIVES[0]}'`), 'the private dashboard installs the first archive name');
  const dir = mkdtempSync(join(tmpdir(), 'private-cli-'));
  const version = `0.0.0-clitest.${process.pid}`;
  const output = new URL(`../../../.small/byoc-private/releases/${version}/`, import.meta.url);
  t.after(() => { rmSync(dir, { recursive: true, force: true }); rmSync(output, { recursive: true, force: true }); });
  mkdirSync(join(dir, 'web'));
  writeFileSync(join(dir, 'web', 'index.html'), '<!doctype html>');
  writeFileSync(join(dir, 'cli.tgz'), 'cli archive bytes');
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ target: 'dev', accountId: '123456789012', region: 'us-east-1',
    stackName: 'cli-archive-test', ownerEmail: 'owner@example.test', workspaceName: 'Test', version, jobs: true,
    poolId: 'us-east-1_TestPool', clientId: 'client123', cognitoDomain: 'https://small-test.auth.us-east-1.amazoncognito.com',
    installationId: 'b'.repeat(32), jobName: 'proof' }));
  const script = new URL('../package-private.mjs', import.meta.url);
  const r = spawnSync(process.execPath, [script.pathname.replace(/^\/(\w:)/, '$1'), '--target', 'dev', join(dir, 'config.json'), join(dir, 'cli.tgz'), join(dir, 'web')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const manifest = JSON.parse(readFileSync(new URL('release.json', output), 'utf8'));
  for (const name of CLI_ARCHIVES) {
    assert.ok(existsSync(new URL(name, output)), name);
    assert.ok(manifest.sha256[name], `${name} in the SHA-256 manifest`);
  }
});
