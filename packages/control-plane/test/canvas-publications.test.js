// Explore publication, persistence only (docs/features/explore-publish.md; migration 0007): a canvas is discoverable only
// while its owner's explicit Publish holds a canvas_publications row. Private by default; a share link stays unlisted;
// nothing but the owner's action publishes; Remove from Explore leaves share links alone. Through the routes the app
// worker serves, on LEARN_DB as node:sqlite built from repository-schema.sql; live storage records and throws.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { learnDb } from './learn-grade-fixture.js';
import { liveDb, liveRuns } from './live-storage-spy.js';
import { canvasesFetch, canvasRoute } from '../src/canvases.js';
import { learnBoardsRoute } from '../src/learn-boards.js';

const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../learn-migrations/0007-canvas-publications.sql', import.meta.url), 'utf8');
const PEOPLE = { ana: { email: 'ana@test', org: 'ana-ws' }, ben: { email: 'ben@test', org: 'ben-ws' }, cole: { email: 'cole@test', org: 'ana-ws' } };
const BOARD = { blocks: [{ id: 'b1', type: 'explanation', title: 'Why ice floats' }], shapes: [], strokes: [], items: [], links: [] };

function setup(t) {
  const { LEARN_DB, sqlite } = learnDb(t);
  const CONTROL_PLANE = {
    fetch: async request => {
      if (request.method !== 'GET') throw new Error('live small-cp write');
      const who = PEOPLE[(request.headers.get('cookie') || '').replace('small_session=', '')];
      if (!who) return new Response('sign in', { status: 401 });
      return new URL(request.url).pathname === '/api/me' ? Response.json({ ...who, orgName: null }) : new Response('no', { status: 404 });
    },
  };
  // The dev media bucket, empty: a fork copies a board's files from it.
  const LEARN_MEDIA = { put: async () => {}, get: async () => null, list: async () => ({ objects: [], truncated: false }) };
  const DB = liveDb(), RUNS = liveRuns();
  const env = { LEARN_DB, CONTROL_PLANE, LEARN_MEDIA, DB, RUNS };
  t.after(() => assert.deepEqual([DB.calls, RUNS.calls], [[], []], 'publication touched production storage'));
  const call = async (method, path, { as, body, headers = {} } = {}) => {
    const req = new Request(`https://app.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers, ...(as ? { cookie: `small_session=${as}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const response = canvasRoute(new URL(req.url)) ? await canvasesFetch(req, env) : await learnBoardsRoute(path, req, env);
    return { status: response.status, body: await response.json() };
  };
  const canvas = async (as, title) => (await call('POST', '/api/canvases', { as, body: { title } })).body;
  const publications = () => sqlite.prepare('SELECT org, canvas FROM canvas_publications ORDER BY org, canvas').all().map(r => `${r.org}/${r.canvas}`);
  const published = async (as, name) => (await call('GET', `/api/apps/${name}`, { as })).body.published;
  return { sqlite, call, canvas, publications, published };
}

test('0007 is additive, re-runnable and exactly what repository-schema.sql applies; it backfills nothing', t => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  // A database that already holds shares (every visibility the link model has) gets the table and no rows.
  sqlite.exec("CREATE TABLE learn_boards (id TEXT, org TEXT, app TEXT, shared INTEGER, view_token TEXT, public_view INTEGER); INSERT INTO learn_boards VALUES ('a', 'o', 'canvas-0000000a', 1, 'tok-a', 0), ('b', 'o', 'canvas-0000000b', 1, 'tok-b', 1);");
  sqlite.exec(migration); sqlite.exec(migration);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM canvas_publications').get().n, 0, 'existing shares stay unlisted');
  assert.ok(schema.replace(/\r/g, '').includes(migration.replace(/\r/g, '').trim()));
  assert.doesNotMatch(migration, /\b(DROP|ALTER|DELETE|UPDATE|INSERT)\b/i);
  assert.deepEqual(sqlite.prepare('PRAGMA table_info(canvas_publications)').all().map(c => c.name), ['org', 'canvas', 'published_at'], 'discoverability only: no content, Tutor, share or repository columns');
});

test('a new canvas is private; sharing by link, even signed-out public_view, never publishes', async t => {
  const f = setup(t);
  const a = await f.canvas('ana', 'Why ice floats');
  assert.equal(a.published, false);
  assert.equal(await f.published('ana', a.name), false);
  const links = (await f.call('POST', `/api/learn/boards/${a.name}/main/share`, { as: 'ana', body: { shared: true, view: true, public_view: true, state: BOARD } })).body.sharing;
  assert.ok(links.view && links.public_view, 'shared by link, viewable signed out');
  assert.deepEqual(f.publications(), []);
  assert.equal(await f.published('ana', a.name), false);
});

test('only the owner\'s explicit Publish publishes; opening, forking and Start Rabbit Hole never do', async t => {
  const f = setup(t);
  const a = await f.canvas('ana', 'Why ice floats');
  const link = (await f.call('POST', `/api/learn/boards/${a.name}/main/share`, { as: 'ana', body: { shared: true, view: true, state: BOARD } })).body.sharing.view;
  assert.equal((await f.call('GET', `/api/learn/boards/shared/${link}`, { as: 'ben' })).status, 200);
  assert.equal((await f.call('POST', '/api/learn/boards/fork', { as: 'ben', body: { source: { token: link }, key: 'publish-fork-0001' } })).status, 201);
  assert.equal((await f.call('POST', `/api/learn/boards/shared/${link}/rabbit-hole`, { as: 'ben', body: { origin: null } })).status, 201);
  assert.deepEqual(f.publications(), [], 'open, fork and hole publish nothing - not the source, not the fork, not the hole');
  // Nobody else may publish it: another workspace, a colleague in hers, someone signed out.
  assert.equal((await f.call('POST', `/api/apps/${a.name}/publish`, { as: 'ben' })).status, 404);
  assert.equal((await f.call('POST', `/api/apps/${a.name}/publish`, { as: 'cole' })).status, 403);
  assert.equal((await f.call('POST', `/api/apps/${a.name}/publish`)).status, 401);
  assert.equal((await f.call('GET', `/api/apps/${a.name}/publish`, { as: 'ana' })).status, 405, 'a read never publishes');
  assert.deepEqual(f.publications(), []);
  // The owner's action, twice, is one publication.
  const made = await f.call('POST', `/api/apps/${a.name}/publish`, { as: 'ana' });
  assert.deepEqual([made.status, made.body.published], [200, true]);
  await f.call('POST', `/api/apps/${a.name}/publish`, { as: 'ana' });
  assert.deepEqual(f.publications(), [`ana-ws/${a.name}`]);
  // A fork of a published canvas starts private.
  const fork = (await f.call('POST', '/api/learn/boards/fork', { as: 'ben', body: { source: { token: link }, key: 'publish-fork-0002' } })).body;
  assert.equal(await f.published('ben', fork.name), false);
  assert.deepEqual(f.publications(), [`ana-ws/${a.name}`]);
});

test('Remove from Explore ends discoverability only: the share link and its settings stay as they were', async t => {
  const f = setup(t);
  const a = await f.canvas('ana', 'Why ice floats');
  const before = (await f.call('POST', `/api/learn/boards/${a.name}/main/share`, { as: 'ana', body: { shared: true, view: true, public_view: true, state: BOARD } })).body.sharing;
  await f.call('POST', `/api/apps/${a.name}/publish`, { as: 'ana' });
  assert.equal((await f.call('POST', `/api/apps/${a.name}/unpublish`, { as: 'cole' })).status, 403, 'only the owner unpublishes');
  const removed = await f.call('POST', `/api/apps/${a.name}/unpublish`, { as: 'ana' });
  assert.deepEqual([removed.status, removed.body.published], [200, false]);
  assert.deepEqual(f.publications(), []);
  assert.deepEqual((await f.call('GET', `/api/learn/boards/${a.name}/main`, { as: 'ana' })).body.sharing, before, 'the link is untouched');
  assert.equal((await f.call('GET', `/api/learn/boards/shared/${before.view}`, { as: 'ben' })).status, 200, 'and still opens');
  // Unpublishing what is not published is a no-op, never an error.
  assert.equal((await f.call('POST', `/api/apps/${a.name}/unpublish`, { as: 'ana' })).status, 200);
});

test('unrelated canvases of different owners publish independently through the same route; a deleted canvas leaves no row', async t => {
  const f = setup(t);
  const a = await f.canvas('ana', 'Why ice floats');
  const z = await f.canvas('ben', 'Bridge loads');
  const y = await f.canvas('ben', 'Tide tables');
  await f.call('POST', `/api/apps/${z.name}/publish`, { as: 'ben' });
  await f.call('POST', `/api/apps/${a.name}/publish`, { as: 'ana' });
  assert.deepEqual(f.publications(), [`ana-ws/${a.name}`, `ben-ws/${z.name}`]);
  assert.deepEqual((await f.call('GET', '/api/canvases', { as: 'ben' })).body.canvases.map(c => [c.title, c.published]).sort(), [['Bridge loads', true], ['Tide tables', false]]);
  // An untouched canvas may be deleted; its publication goes with it.
  assert.equal((await f.call('DELETE', `/api/apps/${z.name}`, { as: 'ben' })).status, 200);
  assert.deepEqual(f.publications(), [`ana-ws/${a.name}`]);
  assert.equal(y.published, false);
});
