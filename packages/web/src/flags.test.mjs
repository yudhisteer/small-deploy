import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiFindAllowed, aiReadsOnPreview, askLiveOnPreview, learnHandoff, learnPreview, PRODUCT } from './flags.js';

// Node has no Vite env, which is the live build's view: no preview, and still the Rabbit Hole name.
test('outside the dev build the preview is off and the product is Rabbit Hole', () => {
  assert.equal(learnPreview, false);
  assert.equal(PRODUCT, 'Rabbit Hole');
});

test('the Learn handoff stays off until the PR that merges it flips it (T02 §9)', () => {
  assert.equal(learnHandoff, false);
});

test('preview asks never write live chat history until the user chooses otherwise', () => {
  assert.equal(askLiveOnPreview, false);
});

test('model-backed live reads stay off on the preview until the user approves them (G5)', () => {
  assert.equal(aiReadsOnPreview, false);
  assert.equal(aiFindAllowed(false), true); // the live build keeps today's AI find
  assert.equal(aiFindAllowed(true), false); // the preview never calls the live model
});

// The CLI install guide stays hidden until @rabbit-hole/cli is published; then it lists only the canonical commands.
test('the dashboard CLI guide is hidden before publish and canonical-only after it', async () => {
  const { CLI_PUBLISHED, cliGuide } = await import('./flags.js');
  assert.equal(CLI_PUBLISHED, false);
  assert.equal(cliGuide({ origin: 'https://digrabbithole.com' }), null);
  const guide = cliGuide({ origin: 'https://digrabbithole.com', published: true });
  const cmds = [...guide.steps.map((s) => s.cmd), ...guide.commands.map((c) => c[2])];
  assert.deepEqual(cmds, ['npm i -g @rabbit-hole/cli', 'rabbit-hole login', 'rabbit-hole init', 'rabbit-hole capture', 'rabbit-hole list']);
  assert.equal(guide.api.url, 'https://digrabbithole.com/api');
  assert.equal(guide.dialog, null);
  assert.doesNotMatch(JSON.stringify(guide), /small|deploy|\brun\b|localhost/);
});

test('a private AWS installation keeps its supplied legacy CLI guide either way', async () => {
  const { cliGuide } = await import('./flags.js');
  for (const published of [false, true]) {
    const guide = cliGuide({ privateByoc: true, origin: 'https://private.example', published });
    assert.equal(guide.steps[0].cmd, 'npm i -g ./small-deploy.tgz');
    assert.equal(guide.steps[1].cmd, 'small login --api https://private.example');
    assert.equal(guide.api.url, 'https://private.example/api');
  }
});
