# Library Privacy (P0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person's dev Library lists and opens only the projects their signed-in email owns, so Gmail users (who all share the `gmail-com` home org) can no longer see or open each other's connected repositories.

**Architecture:** Every `repository_apps` lookup that today filters by org alone also filters by `owner_email`. The Library query moves out of `dev-worker.js` (which node cannot import) into `repositories.js` as `ownerRepositories`, beside `ownerCanvases`, so a node test can reach it. Nothing is explicitly shared with another person today, so "owned" is the whole personal Library. No Teams or workspace change.

**Tech Stack:** Cloudflare Worker (`packages/web/dev-worker.js`), D1 `small-learn-dev` (`LEARN_DB`), node:test with node:sqlite.

**Spec:** `docs/features/usage-credits.md` §14, "Separate finding: privacy, priority zero". This plan must be done before any multi-account usage testing, and before `docs/superpowers/plans/2026-09-29-usage-credits.md` starts.

## Global Constraints

- Separate commits from the Usage work (spec §14: "Fixed outside this spec, with its own commits").
- The principle, verbatim: "organisation membership is not email-domain membership. For solo v1, a person's Library is the resources their authenticated email owns plus the resources explicitly shared with them."
- The regression test, verbatim: "Gmail user A connects repo A; Gmail user B signs in; B can neither list nor open repo A."
- Commit messages are plain: no Co-Authored-By or session trailers, no double quotes. Commit with `git commit --only <paths>`.
- Run `make test-unit` before every commit. Never push without the user's explicit word.
- Never run bare `wrangler deploy`. This plan deploys nothing.
- Do not edit Learn-owned files: `packages/web/src/LearnPage.jsx`, `ask.jsx`, `AdaptiveCanvas.jsx`, `CanvasMenubar.jsx`, and `packages/control-plane/src/learn-*`.
- The WP7 acceptance build (tag `wp7-acceptance-build`, clone `small-cp-dev-smart-home`) stays frozen. Carrying this fix onto it is the user's call.

## Review Focus

1. A colleague who is sent a project URL (`/apps/repo-…`) gets "not found", never the map, chats, snapshot, file source or course.
2. `@`-mentioning another person's project in an ask does not pull its overview into the answer.
3. A canvas cannot be created "inside" another person's project by naming it.
4. The owner's own Library, project page, map, Learn chat and course still load exactly as before.
5. After switching to another workspace, a person still sees only their own projects in that workspace (the org filter stays).

Each line has a test in Task 2.

---

### Task 1: Bring the usage branch up to the acceptance build

The branch `feature/usage-credits` was cut from `feature/smart-home` (0b2d3f2) and holds only the three spec commits. The spec's facts, and every Learn file this work touches (`learn-boards.js`, `learn-media.js`, `learn-artifact.js`, the `learn_boards` table), live in the WP7 acceptance build. Merge it; never rewrite the branch.

**Files:** none edited by hand.

- [ ] **Step 1: Confirm the worktree and branch**

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage && git status --short && git branch --show-current && git log --oneline -3
```
Expected: branch `feature/usage-credits`, clean tree (untracked files allowed), top commit `3b02fcb docs(usage): revision 3 …`.

- [ ] **Step 2: Merge the acceptance build**

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage && git rev-parse --short "wp7-acceptance-build^{commit}" && git merge --no-edit "wp7-acceptance-build^{commit}"
```
Expected: the first command prints `8fbc6fb`; the merge completes without conflicts (the branch only added `docs/features/usage-credits.md`).

- [ ] **Step 3: Install dependencies (the worktree has no node_modules)**

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage && npm ci
```
Expected: exits 0. `node_modules/miniflare` exists afterwards.

- [ ] **Step 4: Baseline the unit suite**

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage && make test-unit
```
Expected: all green (the acceptance evidence recorded 656 web / 481 control-plane). If anything fails here, stop and report it: it predates this work.

---

### Task 2: Owner-only project access

**Files:**
- Modify: `packages/control-plane/src/repositories.js` (`repositoryAccess`, the `repositoriesFetch` row lookup, the `@`-mention lookup in `repositoryAsk`; add `ownerRepositories`)
- Modify: `packages/control-plane/src/canvases.js` (the `project` check in `canvasesFetch` POST)
- Modify: `packages/web/dev-worker.js` (the `GET /api/apps` Library query)
- Test: `packages/control-plane/test/repositories.test.js`, `packages/control-plane/test/canvases.test.js`

**Interfaces:**
- Produces: `ownerRepositories(env, user) → Promise<object[]>` in `repositories.js`: the caller's own `repository_apps` rows in `user.org`, newest first, each shaped by `repositoryApp(row, user)`. The Usage plan (Task 11) adds an `archived` parameter.

- [ ] **Step 1: Write the failing tests**

In `packages/control-plane/test/repositories.test.js`, add `ownerRepositories` to the import from `../src/repositories.js`, then append (this file uses the compact style):

```js
// usage-credits.md §14 (privacy P0): a shared email domain is not a shared Library.
test('a colleague on the same email domain can neither list nor open another person\'s project',async t=>{
  const f=fixture(t),colleague={'x-email':'viewer@test'};
  assert.deepEqual((await ownerRepositories(f.env,{org:'team',email:'viewer@test'})).map(a=>a.name),[]);
  assert.deepEqual((await ownerRepositories(f.env,{org:'team',email:'owner@test'})).map(a=>a.name),['repo-example']);
  for(const path of['snapshot','threads'])assert.equal((await f.send(path,null,colleague)).status,404,path);
  assert.equal((await f.send('file',{path:'model.py'},colleague)).status,404);
  assert.equal((await f.send('ask',{message:'Hi'},colleague)).status,404);
  assert.equal((await f.send('learn-course',{action:'approve',revision:1},colleague)).status,404);
  const access=await repositoryAccess(new Request('https://dev.test',{headers:colleague}),f.env,'repo-example');assert.equal(access.status,404);
  assert.equal((await f.send('snapshot')).status,200); // the owner is unaffected
});
test('an @-mention of another person\'s project adds nothing to the answer',async t=>{
  const f=fixture(t),original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  f.sqlite.exec(`INSERT INTO repository_apps(id,org,name,owner_email,repo,branch,commit_sha,status) VALUES(2,'team','repo-mine','viewer@test','example/mine','main','${sha}','ready'); INSERT INTO repository_versions VALUES(2,'${sha}','snapshot',datetime('now'));`);
  let sent;globalThis.fetch=async(url,init)=>{sent=JSON.parse(init.body);return new Response('event: message_stop\ndata: {}\n\n',{headers:{'content-type':'text/event-stream'}});};
  const response=await repositoriesFetch(new Request('https://dev.test/api/repositories/repo-mine/ask',{method:'POST',headers:{'x-email':'viewer@test'},body:JSON.stringify({message:'Compare',mentions:['repo-example']})}),f.env,{});
  await response.text();
  assert.doesNotMatch(JSON.stringify(sent.messages),/repo-example/);
});
```

In `packages/control-plane/test/canvases.test.js`, append:

```js
test('a canvas cannot be created inside another person\'s project', async t => {
  const f = fixture(t);
  const refused = await f.send('POST', '/api/canvases', { title: 'Theirs', project: 'repo-example' }, colleague);
  assert.equal(refused.status, 404);
  assert.equal((await f.send('POST', '/api/canvases', { title: 'Mine', project: 'repo-example' })).status, 201);
});
```

Before running, read `repositoryAsk` in `repositories.js` and confirm how the mention overview reaches the model: the test above assumes the mentioned overviews are serialised into the request body that `askStream` sends through `globalThis.fetch` (the Anthropic call). If the ask path in this build answers through `researchAnswer` with a different body shape, adapt only the assertion's target (`sent`), keeping the claim: the text `repo-example` never reaches the model.

- [ ] **Step 2: Run them to see them fail**

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/control-plane && node --test test/repositories.test.js test/canvases.test.js
```
Expected: FAIL. `ownerRepositories` is not exported; the colleague gets 200 on `snapshot`; the mention test finds `repo-example`; the canvas test gets 201 for the colleague.

- [ ] **Step 3: Make every lookup owner-only**

In `packages/control-plane/src/repositories.js`:

`repositoryAccess` — replace the query:
```js
  const row=await d1(()=>env.LEARN_DB.prepare('SELECT * FROM repository_apps WHERE org=? AND name=? AND owner_email=?').bind(user.org,name,user.email).first());
```

In `repositoriesFetch`, the row lookup after the route match:
```js
    const row=await db.prepare('SELECT * FROM repository_apps WHERE org=? AND name=? AND owner_email=?').bind(user.org,match[1],user.email).first();if(!row)return json({error:'Repository not found in this workspace'},404);
```

In `repositoryAsk`, the `@`-mention loop:
```js
    const row=await db.prepare('SELECT * FROM repository_apps WHERE org=? AND name=? AND owner_email=?').bind(user.org,name,user.email).first();
```

Add, after `repositoryApp`:
```js
// The caller's own projects (usage-credits.md §14, privacy P0): a shared email domain is not a
// shared Library. Nothing is shared explicitly yet, so owned is the whole personal Library.
export async function ownerRepositories(env,user){
  const {results}=await env.LEARN_DB.prepare('SELECT * FROM repository_apps WHERE org=? AND owner_email=? ORDER BY created_at DESC').bind(user.org,user.email).all();
  return results.map(row=>repositoryApp(row,user));
}
```

In `packages/control-plane/src/canvases.js`, the `project` check in the POST branch:
```js
      if (project !== null && !(typeof project === 'string' && await db.prepare('SELECT 1 FROM repository_apps WHERE org=? AND name=? AND owner_email=?').bind(user.org, project, user.email).first())) return json({ error: 'Project not found in this workspace' }, 404);
```

In `packages/web/dev-worker.js`, add `ownerRepositories` to the `repositories.js` import and replace the Library query in the `GET /api/apps` branch:
```js
    if (path === '/api/apps' && req.method === 'GET') {
      const catalog = await repositoryIdentity(req, env);
      if (catalog instanceof Response) return catalog;
      return Response.json({ ...catalog, apps: [...catalog.apps, ...(await ownerRepositories(env, catalog)), ...(await ownerCanvases(env, catalog))] }, { headers: { 'Cache-Control': 'no-store' } });
    }
```
If `repositoryApp` is now unused in `dev-worker.js`, remove it from that import.

- [ ] **Step 4: Update the assertions that expected a colleague to reach a project**

Run the two files again. The earlier tests that sent `{'x-email':'viewer@test'}` to an existing project and expected `403` (refresh is owner-only; curriculum approval is owner-only) now get `404`, because the colleague no longer reaches the project at all. Change exactly those expected statuses from `403` to `404`, and nothing else. Known site: `repositories.test.js`, "workspace and session authorization precede source access; refresh is owner-only", the `refresh` assertion. Search the file for every other `viewer@test` expectation and apply the same rule.

- [ ] **Step 5: Run the tests to see them pass**

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/control-plane && node --test test/repositories.test.js test/canvases.test.js
```
Expected: PASS.

- [ ] **Step 6: Search for any other org-only project lookup**

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage && git grep -n "FROM repository_apps WHERE org=?" -- packages
```
Expected: no output. Any remaining hit that reads a project for a request gets `AND owner_email=?` in the same way. `UPDATE … WHERE id=?` statements inside `RepositoryImports` are keyed by an id the owner already reached, so they stay.

- [ ] **Step 7: Full unit suite, then commit**

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage && make test-unit
```
Expected: all green.

```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage && git add packages/control-plane/src/repositories.js packages/control-plane/src/canvases.js packages/web/dev-worker.js packages/control-plane/test/repositories.test.js packages/control-plane/test/canvases.test.js && git commit --only packages/control-plane/src/repositories.js packages/control-plane/src/canvases.js packages/web/dev-worker.js packages/control-plane/test/repositories.test.js packages/control-plane/test/canvases.test.js -m "fix(privacy): the dev Library lists and opens only projects the signed-in email owns - Gmail users share the gmail-com org and could see and open each other's repositories; mentions and canvas-in-project checks are owner-only too"
```

- [ ] **Step 8: Record the fix in the spec**

In `docs/features/usage-credits.md` §14, under "Separate finding: privacy, priority zero", add one line: `- **Fixed** on feature/usage-credits (commit <sha from step 7>): owner-only lookups in repositories.js, canvases.js and dev-worker.js, with the regression tests in repositories.test.js and canvases.test.js. Not yet on the frozen acceptance clone.` Commit it with `git commit --only docs/features/usage-credits.md -m "docs(usage): record the Library privacy fix"`.
