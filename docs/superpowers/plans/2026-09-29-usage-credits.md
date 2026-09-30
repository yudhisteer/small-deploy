# Usage and Credits v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Meter every learner AI action, project, canvas and stored file per person in dev D1, enforce the Early access limits at the dev worker, and show plan, credits, renewal, limits and activity in Settings → Usage. This is smart-home's half of the spec. The Learn owner wires their flows against the contract this plan ships.

**Architecture:**
- `meter.js` is the ledger: guarded statements and D1 batches over the spec's tables. Period and storage totals are recomputed from their rows inside the same batch, so a repeated settle, refund or reconcile can never move a balance twice.
- `metered.js` holds the routing table and the one action wrapper. The dev worker runs it in front of every AI route. The handler then sees `env.METER`, which the model transports in `ask.js` use to refuse unadmitted calls and to log each child call with its resolved model and its cost from `prices.js`.
- `usage.js` serves `GET /api/usage`, Stored files and the dev-only `/test/usage`.
- `UsagePanel.jsx` renders the data inside the existing Settings modal, on the preview build only.

**Tech Stack:**
- Cloudflare Workers with D1 `small-learn-dev` (binding `LEARN_DB`) and R2 `small-learn-media-dev` (binding `LEARN_MEDIA`).
- React 19, Vite, Tailwind v4.
- node:test with node:sqlite, plus Miniflare (installed with wrangler) for local D1.
- Playwright scripts for the browser checks.

**Spec:** `docs/features/usage-credits.md`, revision 3 (commit 3b02fcb). Read it before each task.

**Prerequisite:** `docs/superpowers/plans/2026-09-29-library-privacy-p0.md` is done. Its Task 1 merged the acceptance build into this branch and ran `npm ci`. Every path and line below refers to that merged tree.

## Global Constraints

Every task's requirements include these. Values are copied from the spec.

**Plans and limits**
- Early access: **50 credits per week**, renewing Monday 00:00 UTC; **3 active projects and canvases**; **250 MB** of source storage.
- Units are decimal: 1 MB = 1,000,000 bytes and 1 GB = 1,000,000,000 bytes. Values show one decimal: "120.4 MB of 250 MB".
- Free, Plus and Pro are shown but can't be chosen. Buy credits and every purchase button are disabled, "Coming soon". Package copy is the user's text, verbatim (Task 2 holds it).

**Charging**
- One credit per learner action. Child calls are never charged again.
- A paid job is charged `min(quoted, max(1, ceil(final_eligible_cost / 0.03)))`, never above the confirmed quote.
- Practice evaluation costs **0 credits**. It is limited to 100 per person per day plus 10 a minute. The limit message is exactly: "You've reached today's practice-evaluation limit. Your saved activities still work; try again tomorrow." It never says "out of credits".
- Voice transcription: 0 credits, 30 per day.
- Clarifications: 20 free per day, then 1 credit.
- Paid-proposal preparation: 10 per person per tool per day.
- Narration: at most 8,000 UTF-8 bytes.

**Bounds**
- An interactive action gets at most 5 minutes of wall clock, and each model call at most 120 s.
- At most 2 interactive AI actions run at once per person. Paid jobs don't count toward this.

**Money**
- Money is integer nano-dollars. Missing usage is NULL, never 0. `pricing_version` is `2026-09-29`.

**Security**
- Identity comes only from the session resolvers (`repositoryIdentity`, `authorizedBoardApp`, `canvasAccess`). The browser never supplies the person, tool, credit amount, price or parent of a child call.
- If metering is unavailable, new model or paid work fails closed with a useful error.
- D7: no live D1 or R2 mutation. `api()`'s preview guard stays strict: only exact dev-worker paths are added, each with a test.
- `/test/usage` lives in the dev worker only. It needs `TEST_BYPASS_SECRET`, is limited to the `USAGE_TEST_EMAILS` allowlist, and never touches a real user's balance.

**Preview-only UI**
- The Usage panel is lazy-loaded behind the literal `import.meta.env.VITE_COACHING_DEV === 'true' && learnPreview` and carries a live-bundle marker.

**Deploy and D1**
- Deploy only with `npx wrangler deploy --config wrangler.dev.jsonc --name small-cp-dev-smart-home-usage`. Never run bare `wrangler deploy`.
- Announce in chat before applying the schema to `small-learn-dev`.
- No production migration numbering and no production deploy.

**Commits**
- Plain messages: no co-author or session trailers, no double quotes. Commit with `git commit --only <paths>`.
- Run `make test-unit` before every commit. Never push without the user's word.

**Ownership**
- Learn-owned files are read-only here: `packages/web/src/LearnPage.jsx`, `ask.jsx`, `AdaptiveCanvas.jsx`, `CanvasMenubar.jsx`, and `packages/control-plane/src/learn-*`. Where a spec item needs a change inside one of them, it goes in the Learn contract (Task 16).

**UI**
- Every clickable gets press feedback (the global rule in `index.css`).
- Table headers carry a lucide icon; headers are `text-xs`, cells `text-sm`.
- Prefer button-local feedback to toasts, and never put a toast bottom-left.
- It works at phone width and in dark mode.

## Review Focus

Five inputs the spec implies that are easy to miss. Each one's test lives in the task named.

1. **The learner closes the tab mid-answer.** The answer still finishes, is saved to the chat and is charged exactly once: a disconnect is not a cancel. (Task 7, askStream test; Task 8, held settle.)
2. **Renewal is less than a day away.** The line reads "in 1 day", never "in 0 days", and a period that ended while the panel was open still shows the next Monday. (Task 13.)
3. **A learner with several workspaces.** Credits and the project and canvas count are one wallet per email across every workspace; creating `w-*` workspaces never multiplies them. (Task 3 wallet test; Task 10 count test.)
4. **Email case and spaces.** `Usage-A@usage-check.test ` and `usage-a@usage-check.test` are one wallet and one allowlist entry. (Task 3; Task 12.)
5. **A malformed body on a metered route** (invalid JSON, empty multipart). The wrapper doesn't crash; the handler's 400 is returned; nothing is charged. (Task 8.)

## Ownership split (spec §12)

Smart-home, this plan:
- the tables, `plans.js`, `prices.js` and `meter.js`;
- the action wrapper and its routing table;
- the Anthropic and OpenAI transports and the subscription bridge in `ask.js`;
- Map and Agent Bar answers;
- the project, canvas and restore limit statements, plus the fork helper;
- project archive and restore;
- `/api/usage`, the Settings panel, the Upgrade view and the Stored files list;
- `/test/usage`;
- the storage inventory;
- the rollout.

The image, narration and transcription calls are written inline in `dev-worker.js`, which is smart-home's file, so their child-call records land here too. §12 lists those transports under Learn; Task 16 tells the Learn owner they're done.

Learn owner, through the contract in Task 16:
- action context in the board, artifact and course flows;
- clarification in board plans;
- the Exa, fal, Jev, Workers AI and Fly call records;
- the evaluation ladder and `attempt_id`;
- the 60 s duration check;
- the paid quote and confirm UI;
- scene no-resubmit;
- the storage writers;
- "Stop sharing and delete cloud copy";
- the fork call site.

## Interpretations recorded for review

Where the spec leaves a choice, the plan picks the smallest reading that keeps every invariant. Each is also noted beside its code.

- **Totals are recomputed, not incremented.** Each transition runs in one D1 batch with a recompute of the person's period rows from `usage_actions`. The claim itself is an `INSERT … SELECT … WHERE <room>`, followed in the same batch by the recompute. This gives the spec's all-or-nothing and duplicate-proof settle without relying on `changes()` across batch statements. Task 6 proves it on local D1.
- **A reservation expires 10 minutes after it's made.** Every reservation takes a 5-minute lease. A `reserved` action whose lease ended more than 5 minutes ago is released.
- **Board continuations.** A continuation request (`body.continuation`, a server-signed token) is its own 0-credit `canvas_explanation` row. The first request carries the credit. The ≤ 3 continuations and ≤ 15 model calls stay enforced by Learn's loop.
- **Fixed-price and exact-price tools (image, narration) need no stored quote row.** Their price is a pure function of the confirmed parameters, recomputed at confirm time. An unconfirmed request returns the credit amount with the existing 428 `needsConfirm`. The stored quote with a fingerprint (`prepare`, `offer`, `confirmQuote`) is for bounded tools (maths animation, 3D), whose quote parameters are Learn's.
- **Image cost.** The spec's price table has no `gpt-image-1` token prices, so cost uses the published per-image price. Any reported token usage is kept in `units`.
- **Stored files references.** The server counts how many times a file's id appears in the owner's shared boards' JSON. The warning says "referenced N times on 'Title'" rather than claiming a card count.
- **`bar_answer`.** On the preview, the Agent Bar posts to the same `/api/learn/ask` endpoint as Learn chat, with the same context. So by §3's own rule ("the dev worker maps each endpoint and its authenticated context to an action type"), those answers are `learn_answer`, or `map_answer` when a Map node or range is selected. `bar_answer` stays in the enum, unused.
- **Storage enforcement is a var.** `USAGE_STORAGE_ENFORCED` stays `"false"` until Learn ships "Stop sharing and delete cloud copy" (§7). The bar is shown either way.

---

### Task 1: Usage tables

**Files:**
- Modify: `packages/control-plane/repository-schema.sql` (append the spec §5 tables; add `archived_at` to `repository_apps` for fresh databases)
- Create: `packages/control-plane/learn-db-usage-1.sql` (the one-shot `ALTER` for the existing dev database)
- Create: `packages/control-plane/test/d1-memory.js` (a D1-shaped test database with D1's batch semantics)
- Test: `packages/control-plane/test/usage-schema.test.js`

**Interfaces:**
- Produces: tables `user_plans`, `usage_periods`, `usage_actions`, `usage_calls`, `usage_storage`, `source_files` and the column `repository_apps.archived_at`.
- Produces: `memoryD1(schema?) → { sqlite, prepare(sql), batch(statements) }`. `prepare(sql).bind(...).first()|all()|run()` behaves like D1: `run()` returns `{ meta: { changes } }`, and `batch` runs in one transaction, all or nothing.

- [ ] **Step 1: Write the failing test**

Create `packages/control-plane/test/usage-schema.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { memoryD1 } from './d1-memory.js';

const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
const columns = (sqlite, table) => sqlite.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);

// small-learn-dev already holds the older tables and the whole file is applied to it again,
// so the usage tables must be additive and re-runnable (usage-credits.md §5).
test('the usage tables apply twice and hold the spec columns', t => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(schema); sqlite.exec(schema);
  assert.deepEqual(columns(sqlite, 'usage_periods'), ['email', 'period_start', 'period_end', 'plan', 'credits_limit', 'credits_purchased', 'credits_used', 'credits_reserved']);
  assert.deepEqual(columns(sqlite, 'usage_calls'), ['id', 'action_id', 'at', 'provider', 'transport', 'requested_model', 'resolved_model', 'service_tier', 'units', 'pricing_version', 'cost_nanousd', 'cost_source', 'cost_status', 'status']);
  assert.ok(columns(sqlite, 'usage_actions').includes('lease_expires_at'));
  assert.ok(columns(sqlite, 'repository_apps').includes('archived_at'));
  sqlite.exec("INSERT INTO usage_periods (email, period_start, period_end, plan, credits_limit) VALUES ('a@test', 'p', 'q', 'early_access', 50)");
  assert.throws(() => sqlite.exec("UPDATE usage_periods SET credits_used = 51"), /CHECK/);
});

test('the one-shot migration adds archived_at to an existing repository_apps', t => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec("CREATE TABLE repository_apps (id INTEGER PRIMARY KEY, org TEXT NOT NULL, name TEXT NOT NULL, owner_email TEXT NOT NULL, repo TEXT NOT NULL, branch TEXT NOT NULL, commit_sha TEXT, status TEXT NOT NULL DEFAULT 'queued', error TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(org,name))");
  sqlite.exec(readFileSync(new URL('../learn-db-usage-1.sql', import.meta.url), 'utf8'));
  assert.ok(columns(sqlite, 'repository_apps').includes('archived_at'));
});

test('memoryD1 batches are all or nothing, like D1', async t => {
  const db = memoryD1(); t.after(() => db.sqlite.close());
  await assert.rejects(db.batch([
    db.prepare("INSERT INTO user_plans (email) VALUES ('a@test')"),
    db.prepare("INSERT INTO user_plans (email) VALUES ('a@test')"),
  ]), /UNIQUE/);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM user_plans').first()).n, 0);
  const { meta } = await db.prepare("INSERT INTO user_plans (email) VALUES ('b@test')").run();
  assert.equal(meta.changes, 1);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/control-plane && node --test test/usage-schema.test.js`
Expected: FAIL (no `usage_periods` table; `./d1-memory.js` not found).

- [ ] **Step 3: Write the schema**

In `packages/control-plane/repository-schema.sql`, change the first `CREATE TABLE IF NOT EXISTS repository_apps` so that its column list ends `… created_at TEXT NOT NULL DEFAULT (datetime('now')), archived_at TEXT, UNIQUE(org,name)`. This only affects fresh databases; `learn-db-usage-1.sql` adds the column to the existing dev database.

Append to the end of `packages/control-plane/repository-schema.sql`:

```sql
-- Usage and credits (docs/features/usage-credits.md §5). One wallet per person, keyed by
-- normalised email across every workspace; org is recorded for context only.
CREATE TABLE IF NOT EXISTS user_plans (          -- one row per person; no row = early_access
  email TEXT PRIMARY KEY, plan TEXT NOT NULL DEFAULT 'early_access',
  anchor TEXT NOT NULL DEFAULT (datetime('now')), updated_by TEXT);
CREATE TABLE IF NOT EXISTS usage_periods (       -- the wallet for one period
  email TEXT NOT NULL, period_start TEXT NOT NULL, period_end TEXT NOT NULL, plan TEXT NOT NULL,
  credits_limit INTEGER NOT NULL, credits_purchased INTEGER NOT NULL DEFAULT 0,
  credits_used INTEGER NOT NULL DEFAULT 0,       -- settled charges
  credits_reserved INTEGER NOT NULL DEFAULT 0,   -- in flight ("processing")
  PRIMARY KEY (email, period_start),
  CHECK (credits_used + credits_reserved <= credits_limit + credits_purchased));
CREATE TABLE IF NOT EXISTS usage_actions (       -- one row per learner action
  id TEXT PRIMARY KEY, email TEXT NOT NULL, org TEXT, request_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
  action_type TEXT NOT NULL,                     -- learn_answer | map_answer | bar_answer | canvas_explanation | artifact
                                                 -- | lesson | evaluation | voice_input | source_search | paid_job | system
  tool TEXT, resource_kind TEXT, resource TEXT, board TEXT, period_start TEXT NOT NULL,
  status TEXT NOT NULL,                          -- quoted | reserved | running | settled | released | cancelled
                                                 -- | clarification | unknown | unknown_released | expired
  quote_credits INTEGER, quote_expires_at TEXT, pricing_version TEXT,
  reserved_credits INTEGER NOT NULL DEFAULT 0, charged_credits INTEGER NOT NULL DEFAULT 0,
  released_credits INTEGER NOT NULL DEFAULT 0,   -- invariant: charged + released = reserved once finished
  provider_job_id TEXT, lease_expires_at TEXT, created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT,
  outcome TEXT, error TEXT, flagged INTEGER NOT NULL DEFAULT 0,
  UNIQUE (email, request_id));
CREATE INDEX IF NOT EXISTS usage_actions_period ON usage_actions (email, period_start, created_at);
CREATE INDEX IF NOT EXISTS usage_actions_resource ON usage_actions (email, resource, created_at);
CREATE INDEX IF NOT EXISTS usage_actions_open ON usage_actions (status, lease_expires_at);
CREATE TABLE IF NOT EXISTS usage_calls (         -- one row per provider call, child of an action
  id INTEGER PRIMARY KEY, action_id TEXT NOT NULL REFERENCES usage_actions(id), at TEXT NOT NULL,
  provider TEXT NOT NULL, transport TEXT NOT NULL, requested_model TEXT, resolved_model TEXT, service_tier TEXT,
  units TEXT,                                    -- JSON, named units (input_tokens, output_tokens, images, bytes, …)
  pricing_version TEXT, cost_nanousd INTEGER,    -- NULL when unknown
  cost_source TEXT, cost_status TEXT NOT NULL,   -- final | estimated | unknown
  status TEXT NOT NULL);                         -- ok | error | unknown
CREATE INDEX IF NOT EXISTS usage_calls_action ON usage_calls (action_id);
CREATE TABLE IF NOT EXISTS usage_storage (       -- one row per person; the sums of source_files
  email TEXT PRIMARY KEY, bytes_used INTEGER NOT NULL DEFAULT 0, bytes_reserved INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS source_files (        -- the storage ledger; status reserved rows are the reservations
  id INTEGER PRIMARY KEY, email TEXT NOT NULL, org TEXT, resource TEXT,
  kind TEXT NOT NULL,                            -- paper | image | board_file | board_json | fork_copy
  storage_key TEXT NOT NULL UNIQUE, bytes INTEGER NOT NULL,
  status TEXT NOT NULL,                          -- reserved | stored | failed | deleted
  created_at TEXT NOT NULL, deleted_at TEXT);
CREATE INDEX IF NOT EXISTS source_files_owner ON source_files (email, status);
```

Create `packages/control-plane/learn-db-usage-1.sql`:

```sql
-- One-shot for the existing small-learn-dev database (usage-credits.md §6: project archive).
-- Fresh databases get the column from repository-schema.sql. Apply once, before that file.
ALTER TABLE repository_apps ADD COLUMN archived_at TEXT;
```

- [ ] **Step 4: Write the test database helper**

Create `packages/control-plane/test/d1-memory.js`:

```js
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

// A D1-shaped database over node:sqlite for ledger tests. Unlike the older fixtures, batch()
// is one transaction, all or nothing, as D1 runs it; foreign keys are on, as in D1.
const SCHEMA = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
export function memoryD1(schema = SCHEMA) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(schema);
  const exec = (sql, args) => {
    const stmt = sqlite.prepare(sql);
    if (stmt.columns().length) return { results: stmt.all(...args), meta: { changes: Number(sqlite.prepare('SELECT changes() AS n').get().n) } };
    return { results: [], meta: { changes: Number(stmt.run(...args).changes) } };
  };
  const prepare = sql => {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      first: async () => sqlite.prepare(sql).get(...args) ?? null,
      all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
      run: async () => exec(sql, args),
      exec: () => exec(sql, args),
    };
  };
  const batch = async statements => {
    sqlite.exec('BEGIN');
    try { const out = statements.map(s => s.exec()); sqlite.exec('COMMIT'); return out; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  };
  return { sqlite, prepare, batch };
}
```

Rows from node:sqlite have a null prototype. Tests compare fields, or spread a row (`{ ...row }`) before `deepEqual`.

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/control-plane && node --test test/usage-schema.test.js test/canvases.test.js`
Expected: PASS. `canvases.test.js` still re-applies the whole file twice.

- [ ] **Step 6: Commit**

Run `make test-unit` (all green), then:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage && git add packages/control-plane/repository-schema.sql packages/control-plane/learn-db-usage-1.sql packages/control-plane/test/d1-memory.js packages/control-plane/test/usage-schema.test.js && git commit --only packages/control-plane/repository-schema.sql packages/control-plane/learn-db-usage-1.sql packages/control-plane/test/d1-memory.js packages/control-plane/test/usage-schema.test.js -m "feat(usage): usage tables in the Learn database - plans, periods, learner actions, child calls, storage ledger; project archived_at with a one-shot for the existing dev database"
```

---

### Task 2: Plans, periods and prices

**Files:**
- Create: `packages/control-plane/src/plans.js`
- Create: `packages/control-plane/src/prices.js`
- Test: `packages/control-plane/test/plans.test.js`, `packages/control-plane/test/prices.test.js`

**Interfaces:**
- Produces, in `plans.js`:
  - `PLANS`, keyed `early_access | free | plus | pro`, each `{ name, period: 'week'|'month', credits, resources, storage, price, available, tagline, priceNote?, resourceLines?, support? }`;
  - `periodFor(plan, now) → { start, end }`, as ISO strings. `plan` is `{ period, anchor: Date|null }`.
- Produces, in `prices.js`:
  - `PRICING_VERSION` and `CREDIT_NANO`;
  - `anthropicCost(model, usage)`, `openaiCost(model, usage)`, `imageCost(images)`, `narrationCost(bytes)` and `transcriptionCost(usage)`, each returning `{ cost_nanousd, cost_source, cost_status }`;
  - `narrationBytes(text)`, `NARRATION_MAX_BYTES`, `narrationCredits(text) → number|null`, `creditsFor(nano) → number` and `usdToNano(usd)`.

- [ ] **Step 1: Write the failing tests**

Create `packages/control-plane/test/plans.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PLANS, periodFor } from '../src/plans.js';

const week = PLANS.early_access;
const month = anchor => ({ ...PLANS.free, anchor: new Date(anchor) });

test('Early access weeks run Monday 00:00 UTC to the next Monday, start included, end excluded', () => {
  assert.deepEqual(periodFor(week, new Date('2026-09-29T12:00:00Z')), { start: '2026-09-28T00:00:00.000Z', end: '2026-10-05T00:00:00.000Z' });
  assert.equal(periodFor(week, new Date('2026-10-04T23:59:59Z')).start, '2026-09-28T00:00:00.000Z'); // Sunday night
  assert.equal(periodFor(week, new Date('2026-10-05T00:00:00Z')).start, '2026-10-05T00:00:00.000Z'); // Monday 00:00
  assert.equal(periodFor(week, new Date('2026-09-28T00:00:00Z')).start, '2026-09-28T00:00:00.000Z');
});

test('monthly periods clamp a Jan 31 anchor to short months without moving the anchor', () => {
  const plan = month('2026-01-31T09:30:00Z');
  assert.deepEqual(periodFor(plan, new Date('2026-02-15T00:00:00Z')), { start: '2026-01-31T00:00:00.000Z', end: '2026-02-28T00:00:00.000Z' });
  assert.deepEqual(periodFor(plan, new Date('2026-03-05T00:00:00Z')), { start: '2026-02-28T00:00:00.000Z', end: '2026-03-31T00:00:00.000Z' });
  assert.deepEqual(periodFor(plan, new Date('2026-03-31T00:00:00Z')), { start: '2026-03-31T00:00:00.000Z', end: '2026-04-30T00:00:00.000Z' });
  assert.equal(periodFor(plan, new Date('2028-02-20T00:00:00Z')).end, '2028-02-29T00:00:00.000Z'); // leap year
  assert.deepEqual(periodFor(month('2026-12-15T00:00:00Z'), new Date('2027-01-10T00:00:00Z')), { start: '2026-12-15T00:00:00.000Z', end: '2027-01-15T00:00:00.000Z' });
});

test('the plans are the approved ones; only Early access can be chosen', () => {
  assert.deepEqual(Object.entries(PLANS).map(([id, p]) => [id, p.period, p.credits, p.resources, p.storage, p.available]), [
    ['early_access', 'week', 50, 3, 250_000_000, true],
    ['free', 'month', 20, 3, 250_000_000, false],
    ['plus', 'month', 200, 20, 5_000_000_000, false],
    ['pro', 'month', 500, 100, 25_000_000_000, false],
  ]);
  assert.equal(PLANS.plus.tagline, 'Make curiosity a regular practice.');
});
```

Create `packages/control-plane/test/prices.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { anthropicCost, openaiCost, imageCost, narrationBytes, narrationCredits, creditsFor, transcriptionCost, usdToNano, PRICING_VERSION } from '../src/prices.js';

test('token costs are exact integer nano-dollars from the 2026-09-29 table', () => {
  assert.equal(PRICING_VERSION, '2026-09-29');
  assert.deepEqual(anthropicCost('claude-opus-5', { input_tokens: 1000, output_tokens: 200 }), { cost_nanousd: 10_000_000, cost_source: 'price_table', cost_status: 'final' });
  assert.equal(anthropicCost('claude-haiku-4-5-20251001', { input_tokens: 1_000_000, output_tokens: 0 }).cost_nanousd, 1_000_000_000);
  assert.equal(openaiCost('gpt-4.1-mini-2025-04-14', { prompt_tokens: 1000, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 400 } }).cost_nanousd, 600 * 400 + 400 * 100 + 100 * 1600);
  assert.equal(transcriptionCost({ input_tokens: 100, output_tokens: 10 }).cost_nanousd, 100 * 2500 + 10 * 10000);
});

test('unknown models, missing usage and cache tokens are unknown, never zero', () => {
  const unknown = { cost_nanousd: null, cost_source: null, cost_status: 'unknown' };
  assert.deepEqual(anthropicCost('claude-opus-5-5', { input_tokens: 1, output_tokens: 1 }), unknown); // not claude-opus-5
  assert.deepEqual(anthropicCost('claude-opus-5', undefined), unknown);
  assert.deepEqual(anthropicCost('claude-opus-5', { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 5 }), unknown);
  assert.deepEqual(openaiCost('gpt-4.1-mini', {}), unknown);
  assert.deepEqual(transcriptionCost(null), unknown);
});

test('credits come from exact sums: max(1, ceil(cost / $0.03))', () => {
  assert.equal(creditsFor(0), 1);
  assert.equal(creditsFor(usdToNano(0.03)), 1);
  assert.equal(creditsFor(usdToNano(0.045)), 2);
  assert.equal(creditsFor(usdToNano(0.0000126)), 1); // a Jev grade
  assert.equal(imageCost(1).cost_nanousd, 11_000_000);
});

test('narration is quoted from UTF-8 bytes, never characters, and refused past 8,000 bytes', () => {
  assert.equal(narrationBytes('あ'), 3);
  assert.equal(narrationCredits('a'.repeat(4000)), 2);          // 4,000 bytes = $0.06
  assert.equal(narrationCredits('あ'.repeat(2666)), 4);         // 7,998 bytes = $0.11997
  assert.equal(narrationCredits('あ'.repeat(2667)), null);      // 8,001 bytes
  assert.equal(narrationCredits('a'.repeat(8000)), 4);          // the $0.12 cap
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/control-plane && node --test test/plans.test.js test/prices.test.js`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write `plans.js`**

Create `packages/control-plane/src/plans.js`:

```js
// Plans and billing periods (docs/features/usage-credits.md §1-§2). Server time is UTC; a period
// includes its start and excludes its end. Package copy is the user's text, verbatim.
export const PLANS = {
  early_access: { name: 'Early access', period: 'week', credits: 50, resources: 3, storage: 250_000_000, price: 'free', available: true,
    tagline: "Everyone is on early access while we're not taking payments." },
  free: { name: 'Free', period: 'month', credits: 20, resources: 3, storage: 250_000_000, price: '$0', priceNote: 'free to explore', available: false,
    tagline: 'Find your first rabbit hole.',
    resourceLines: ['3 active learning projects', '20 AI generation credits per month', '250 MB of source storage'],
    support: ['Learn from repositories, papers and documents', 'Adaptive explanations', 'Interactive learning canvases', 'Saved notes and source citations', 'Revisit completed learning', 'Self-serve help guides'] },
  plus: { name: 'Plus', period: 'month', credits: 200, resources: 20, storage: 5_000_000_000, price: '$19', priceNote: 'Planned price · USD per month', available: false,
    tagline: 'Make curiosity a regular practice.',
    resourceLines: ['20 active learning projects', '200 AI generation credits per month', '5 GB of source storage'],
    support: ['Everything in Free', 'Adaptive quizzes and review', 'Saved learning paths and history', 'Export your learning materials', 'Email support'] },
  pro: { name: 'Pro', period: 'month', credits: 500, resources: 100, storage: 25_000_000_000, price: '$39', priceNote: 'Planned price · USD per month', available: false,
    tagline: 'More room for your deepest questions.',
    resourceLines: ['100 active learning projects', '500 AI generation credits per month', '25 GB of source storage'],
    support: ['Everything in Plus', 'Larger multi-source projects', 'More capacity for deep analysis', 'More generations running at once', 'Priority email support'] },
};

const DAY = 86_400_000;
// A monthly period runs from the anchor's day to the same day next month, clamped to a short
// month's last day; the anchor itself never moves (Jan 31 gives Feb 28, then Mar 31).
export function periodFor(plan, now) {
  if (plan.period === 'week') {
    const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (now.getUTCDay() + 6) % 7);
    return { start: new Date(start).toISOString(), end: new Date(start + 7 * DAY).toISOString() };
  }
  const day = (plan.anchor || now).getUTCDate();
  const on = (y, m) => new Date(Date.UTC(y, m, Math.min(day, new Date(Date.UTC(y, m + 1, 0)).getUTCDate())));
  const y = now.getUTCFullYear();
  let m = now.getUTCMonth();
  if (on(y, m) > now) m -= 1;
  return { start: on(y, m).toISOString(), end: on(y, m + 1).toISOString() };
}
```

- [ ] **Step 4: Write `prices.js`**

Create `packages/control-plane/src/prices.js`:

```js
// Provider prices, checked 2026-09-29 (docs/features/usage-credits.md §8). Money is integer
// nano-dollars; missing usage is null, never 0.
export const PRICING_VERSION = '2026-09-29';
export const CREDIT_NANO = 30_000_000; // the $0.03 conversion reference (§4)
export const NARRATION_MAX_BYTES = 8000;

const TOKENS = { // nano-dollars per token; $1 per MTok = 1,000
  'claude-opus-5': { input: 5000, output: 25000 },
  'claude-sonnet-5': { input: 2000, output: 10000 },
  'claude-haiku-4-5': { input: 1000, output: 5000 },
  'gpt-4.1-mini': { input: 400, cached: 100, output: 1600 },
  'gpt-4o-transcribe': { input: 2500, output: 10000 },
};
// An exact id or a dated snapshot of it: claude-opus-5-5 is a different model from claude-opus-5.
const rate = model => TOKENS[Object.keys(TOKENS).find(k => model === k || String(model).startsWith(`${k}-20`))];
const UNKNOWN = { cost_nanousd: null, cost_source: null, cost_status: 'unknown' };
const table = nano => ({ cost_nanousd: Math.round(nano), cost_source: 'price_table', cost_status: 'final' });

export function anthropicCost(model, usage) {
  const r = rate(model);
  if (!r || usage?.input_tokens == null || usage?.output_tokens == null) return { ...UNKNOWN };
  // No request sends cache_control today; cache tokens would need TTL prices this table does not hold.
  if (usage.cache_read_input_tokens || usage.cache_creation_input_tokens) return { ...UNKNOWN };
  return table(usage.input_tokens * r.input + usage.output_tokens * r.output);
}
export function openaiCost(model, usage) {
  const r = rate(model);
  if (!r || usage?.prompt_tokens == null || usage?.completion_tokens == null) return { ...UNKNOWN };
  const cached = usage.prompt_tokens_details?.cached_tokens || 0;
  if (cached && r.cached == null) return { ...UNKNOWN };
  return table((usage.prompt_tokens - cached) * r.input + cached * (r.cached ?? 0) + usage.completion_tokens * r.output);
}
export function transcriptionCost(usage) {
  const r = TOKENS['gpt-4o-transcribe'];
  if (usage?.input_tokens == null || usage?.output_tokens == null) return { ...UNKNOWN };
  return table(usage.input_tokens * r.input + usage.output_tokens * r.output);
}
export const imageCost = images => table(images * 11_000_000);     // gpt-image-1 low 1024², $0.011 each
export const narrationBytes = text => new TextEncoder().encode(text).length;
export const narrationCost = bytes => table(bytes * 15_000);        // Fish s1, $15 per 1M UTF-8 bytes
export const creditsFor = nano => Math.max(1, Math.ceil(nano / CREDIT_NANO));
export const usdToNano = usd => Math.round(usd * 1e9);
// Exact narration quote from the final text's UTF-8 bytes; null past the 8,000-byte cap.
export function narrationCredits(text) {
  const bytes = narrationBytes(text);
  return bytes > NARRATION_MAX_BYTES ? null : creditsFor(narrationCost(bytes).cost_nanousd);
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/control-plane && node --test test/plans.test.js test/prices.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

`make test-unit`, then:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage && git add packages/control-plane/src/plans.js packages/control-plane/src/prices.js packages/control-plane/test/plans.test.js packages/control-plane/test/prices.test.js && git commit --only packages/control-plane/src/plans.js packages/control-plane/src/prices.js packages/control-plane/test/plans.test.js packages/control-plane/test/prices.test.js -m "feat(usage): plans with UTC week and clamped monthly periods, and the 2026-09-29 price table in integer nano-dollars"
```

---

### Task 3: The ledger - admit, run, settle, reconcile

**Files:**
- Create: `packages/control-plane/src/meter.js`
- Create: `packages/control-plane/test/meter-suite.js` (the transaction tests, shared with Task 6)
- Create: `packages/control-plane/test/meter.test.js` (runs the suite on `memoryD1`)

**Interfaces:**
- Consumes: `PLANS`, `periodFor` (Task 2); `PRICING_VERSION` (Task 2).
- Produces, from `meter.js`:
  - `UNMETERED`, `METER_DOWN`, `PRACTICE_LIMIT`: the message strings.
  - `planFor(db, email) → { id, ...PLANS[id], anchor }`.
  - `renewalText(end) → 'Mon 5 Oct, 00:00 UTC'`.
  - `admit(db, who, spec, now) → { action } | { duplicate } | { refused: { status, error } }`. `who` is `{ email, org }`. `spec` is `{ requestId, fingerprint, type, tool?, credits, resourceKind?, resource?, board?, leaseMs, daily?, perMinute?, dailyMessage? }`.
  - `begin(db, id, now, leaseMs?) → boolean`.
  - `finish(db, id, { status, charge?, outcome?, error?, flagged? }, now) → boolean`. `status` is one of `settled | released | cancelled | clarification | unknown | unknown_released`.
  - `recordCall(db, actionId, call, now)`. It throws `UNMETERED` unless the action is `running`. `call` is `{ provider, transport, requested_model?, resolved_model?, service_tier?, units?, cost_nanousd?, cost_source?, cost_status, status }`.
  - `setProviderJob(db, id, jobId) → boolean`.
  - `reconcile(db, email, now)`.
  - `setTestUsage(db, email, used, now)`.

- [ ] **Step 1: Write the failing suite**

Create `packages/control-plane/test/meter-suite.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { admit, begin, finish, recordCall, reconcile, setProviderJob, setTestUsage, PRACTICE_LIMIT } from '../src/meter.js';
import { creditsFor, usdToNano } from '../src/prices.js';

// The ledger's transaction tests (usage-credits.md §11). meter.test.js runs them on in-memory
// SQLite and meter.d1.test.js on local D1 in the Workers runtime. Every test uses its own person,
// so one database can serve the whole suite.
let people = 0;
export const person = (org = 'team') => ({ email: `learner-${++people}@test`, org });
export const T = new Date('2026-09-29T12:00:00Z'); // a Tuesday: the week is Mon 28 Sep to Mon 5 Oct
export const at = (base, ms) => new Date(base.getTime() + ms);
export const spec = (over = {}) => ({ requestId: crypto.randomUUID(), fingerprint: 'f', type: 'learn_answer', credits: 1, leaseMs: 300_000, ...over });
export const call = (over = {}) => ({ provider: 'anthropic', transport: 'anthropic_api', resolved_model: 'claude-opus-5', cost_nanousd: 1000, cost_source: 'price_table', cost_status: 'final', status: 'ok', ...over });
export const wallet = async (db, email) => ({ ...(await db.prepare('SELECT credits_used AS used, credits_reserved AS reserved FROM usage_periods WHERE email=?1 ORDER BY period_start DESC').bind(email).first()) });
export const statusOf = async (db, id) => (await db.prepare('SELECT status FROM usage_actions WHERE id=?1').bind(id).first()).status;
export async function run(db, who, s = spec(), when = T, charge = s.credits) {
  const { action } = await admit(db, who, s, when);
  await begin(db, action.id, when);
  await finish(db, action.id, { status: 'settled', charge }, when);
  return action;
}

export function meterSuite(label, open) {
  const it = (name, fn) => test(`${label}: ${name}`, async t => fn(await open(t)));

  it('two requests race for the last credit - exactly one is admitted', async db => {
    const who = person(); await setTestUsage(db, who.email, 49, T);
    const results = await Promise.all([admit(db, who, spec(), T), admit(db, who, spec(), T)]);
    assert.equal(results.filter(r => r.action).length, 1);
    assert.equal(results.find(r => r.refused).refused.status, 402);
    assert.deepEqual(await wallet(db, who.email), { used: 49, reserved: 1 });
  });

  it('the same request twice is one charge and one execution; a changed body is 409', async db => {
    const who = person(), s = spec();
    const first = await admit(db, who, s, T);
    assert.equal((await admit(db, who, s, T)).duplicate.id, first.action.id);
    assert.equal((await admit(db, who, { ...s, fingerprint: 'other' }, T)).refused.status, 409);
    assert.deepEqual(await wallet(db, who.email), { used: 0, reserved: 1 });
  });

  it('a duplicate settle or refund changes nothing', async db => {
    const who = person(), { action } = await admit(db, who, spec(), T);
    await begin(db, action.id, T);
    assert.equal(await finish(db, action.id, { status: 'settled', charge: 1 }, T), true);
    assert.equal(await finish(db, action.id, { status: 'settled', charge: 1 }, T), false);
    assert.equal(await finish(db, action.id, { status: 'released' }, T), false);
    assert.deepEqual(await wallet(db, who.email), { used: 1, reserved: 0 });
    const row = await db.prepare('SELECT charged_credits AS c, released_credits AS r, reserved_credits AS v FROM usage_actions WHERE id=?1').bind(action.id).first();
    assert.equal(row.c + row.r, row.v);
  });

  it('a request that crosses the Monday renewal settles in the week it reserved', async db => {
    const who = person(), sunday = new Date('2026-10-04T23:59:00Z'), monday = new Date('2026-10-05T00:01:00Z');
    const { action } = await admit(db, who, spec(), sunday);
    await begin(db, action.id, sunday);
    await finish(db, action.id, { status: 'settled', charge: 1 }, monday);
    const rows = (await db.prepare('SELECT period_start AS p, credits_used AS u FROM usage_periods WHERE email=?1').bind(who.email).all()).results.map(r => [r.p, r.u]);
    assert.deepEqual(rows, [['2026-09-28T00:00:00.000Z', 1]]);
    assert.equal((await admit(db, who, spec(), monday)).action.period_start, '2026-10-05T00:00:00.000Z');
  });

  it('one wallet per email across workspaces and letter case', async db => {
    const who = person(); await setTestUsage(db, who.email, 50, T);
    assert.equal((await admit(db, { email: who.email, org: 'w-another' }, spec(), T)).refused.status, 402);
    assert.equal((await admit(db, { email: ` ${who.email.toUpperCase()} `, org: 'team' }, spec(), T)).refused.status, 402);
  });

  it('the worker dying after reserving or after starting leaves a recoverable state', async db => {
    const who = person();
    const reserved = (await admit(db, who, spec(), T)).action;                  // died before any provider call
    const running = (await admit(db, who, spec(), T)).action; await begin(db, running.id, T); // a stream with no job id
    const job = (await admit(db, who, spec({ type: 'paid_job', tool: 'scene', credits: 3 }), T)).action;
    await begin(db, job.id, T); await setProviderJob(db, job.id, 'provider-123');
    await reconcile(db, who.email, at(T, 11 * 60_000));
    assert.equal(await statusOf(db, reserved.id), 'released');
    assert.equal(await statusOf(db, running.id), 'running');
    await reconcile(db, who.email, at(T, 16 * 60_000));
    assert.equal(await statusOf(db, running.id), 'unknown_released');
    assert.equal(await statusOf(db, job.id), 'running');                        // the provider may still finish it
    await reconcile(db, who.email, at(T, 25 * 3_600_000));
    assert.equal(await statusOf(db, job.id), 'unknown_released');
    assert.deepEqual(await wallet(db, who.email), { used: 0, reserved: 0 });
    assert.equal((await admit(db, who, { ...spec(), requestId: reserved.request_id }, T)).duplicate.id, reserved.id); // never a blind resubmit
    await reconcile(db, who.email, at(T, 25 * 3_600_000));                      // twice changes nothing
    assert.deepEqual(await wallet(db, who.email), { used: 0, reserved: 0 });
  });

  it('a child call without a running parent is refused', async db => {
    const who = person(), { action } = await admit(db, who, spec(), T);
    await assert.rejects(recordCall(db, action.id, call(), T), /not admitted/);  // still only reserved
    await begin(db, action.id, T);
    await recordCall(db, action.id, call(), T);
    await finish(db, action.id, { status: 'settled', charge: 1 }, T);
    await assert.rejects(recordCall(db, action.id, call(), T), /not admitted/);
    await assert.rejects(recordCall(db, 'no-such-action', call(), T), /not admitted/);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM usage_calls WHERE action_id=?1').bind(action.id).first()).n, 1);
  });

  it('a service failure costs no credit and keeps its recorded cost', async db => {
    const who = person(), { action } = await admit(db, who, spec(), T);
    await begin(db, action.id, T); await recordCall(db, action.id, call({ status: 'error', cost_nanousd: null, cost_status: 'unknown' }), T);
    await finish(db, action.id, { status: 'released', outcome: 'error' }, T);
    assert.deepEqual(await wallet(db, who.email), { used: 0, reserved: 0 });
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM usage_calls WHERE action_id=?1').bind(action.id).first()).n, 1);
  });

  it('zero credits refuses a new answer with the renewal line and still admits practice', async db => {
    const who = person(); await setTestUsage(db, who.email, 50, T);
    const refused = await admit(db, who, spec(), T);
    assert.equal(refused.refused.status, 402);
    assert.match(refused.refused.error, /Credits renew Mon 5 Oct, 00:00 UTC\./);
    const practice = await admit(db, who, spec({ type: 'evaluation', credits: 0, daily: 100, perMinute: 10, dailyMessage: PRACTICE_LIMIT }), T);
    assert.ok(practice.action);
    await begin(db, practice.action.id, T);
    await finish(db, practice.action.id, { status: 'settled', charge: 0 }, T);
    assert.deepEqual(await wallet(db, who.email), { used: 50, reserved: 0 });
  });

  it('the 101st practice evaluation in a day is refused with the practice message', async db => {
    const who = person(), ev = () => spec({ type: 'evaluation', credits: 0, daily: 100, perMinute: 10, dailyMessage: PRACTICE_LIMIT });
    for (let i = 0; i < 100; i++) await run(db, who, ev(), at(T, i * 7_000), 0);
    const last = await admit(db, who, ev(), at(T, 100 * 7_000));
    assert.equal(last.refused.error, PRACTICE_LIMIT);
    assert.doesNotMatch(last.refused.error, /credit/i);
  });

  it('practice has a limit of 10 a minute', async db => {
    const who = person(), ev = () => spec({ type: 'evaluation', credits: 0, daily: 100, perMinute: 10, dailyMessage: PRACTICE_LIMIT });
    for (let i = 0; i < 10; i++) await run(db, who, ev(), at(T, i * 1_000), 0);
    const eleventh = await admit(db, who, ev(), at(T, 10_000));
    assert.equal(eleventh.refused.status, 429);
    assert.ok((await admit(db, who, ev(), at(T, 61_000))).action);
  });

  it('two interactive actions run at once, a third waits, and a paid render never blocks a question', async db => {
    const who = person();
    const job = (await admit(db, who, spec({ type: 'paid_job', tool: 'scene', credits: 3 }), T)).action; await begin(db, job.id, T);
    const a = await admit(db, who, spec(), T), b = await admit(db, who, spec(), T), c = await admit(db, who, spec(), T);
    assert.ok(a.action && b.action);
    assert.equal(c.refused.status, 429);
    assert.ok((await admit(db, who, spec(), at(T, 5 * 60_000 + 1))).action);   // leases end at 5 minutes
  });

  it('a paid job settles below its reservation, releases the rest, and never charges above it', async db => {
    const who = person();
    const low = (await admit(db, who, spec({ type: 'paid_job', tool: 'scene', credits: 3 }), T)).action; await begin(db, low.id, T);
    await finish(db, low.id, { status: 'settled', charge: creditsFor(usdToNano(0.045)) }, T);
    const high = (await admit(db, who, spec({ type: 'paid_job', tool: 'scene', credits: 3 }), T)).action; await begin(db, high.id, T);
    await finish(db, high.id, { status: 'settled', charge: 7 }, T);
    const rows = (await db.prepare('SELECT charged_credits AS c, released_credits AS r FROM usage_actions WHERE email=?1 ORDER BY created_at, id').bind(who.email).all()).results.map(r => [r.c, r.r]);
    assert.deepEqual(rows.sort(), [[2, 1], [3, 0]]);
    assert.deepEqual(await wallet(db, who.email), { used: 5, reserved: 0 });
  });
}
```

Create `packages/control-plane/test/meter.test.js`:

```js
import { meterSuite } from './meter-suite.js';
import { memoryD1 } from './d1-memory.js';

meterSuite('memory', t => { const db = memoryD1(); t.after(() => db.sqlite.close()); return db; });
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/control-plane && node --test test/meter.test.js`
Expected: FAIL (`../src/meter.js` not found).

- [ ] **Step 3: Write `meter.js`**

Create `packages/control-plane/src/meter.js`:

```js
// Usage metering ledger (docs/features/usage-credits.md §2-§5). Every write is one guarded
// statement or one D1 batch, and a batch that changes actions recomputes the person's period
// totals from those rows. Totals are derived, never incremented, so a repeated settle, refund or
// reconcile can never move a balance twice, and a refused claim changes nothing at all.
// ponytail: the recompute scans a person's actions per period (hundreds a week); switch to deltas
// guarded by changes() if periods grow to thousands of rows.
import { PLANS, periodFor } from './plans.js';
import { PRICING_VERSION } from './prices.js';

export const UNMETERED = 'This AI request was not admitted by usage metering.';
export const METER_DOWN = 'Usage metering is unavailable, so new AI requests are paused. Try again in a minute.';
export const PRACTICE_LIMIT = "You've reached today's practice-evaluation limit. Your saved activities still work; try again tomorrow.";
const INTERACTIVE = ['learn_answer', 'map_answer', 'bar_answer', 'canvas_explanation', 'artifact', 'lesson', 'evaluation', 'source_search'];
const INTERACTIVE_SQL = `(${INTERACTIVE.map(t => `'${t}'`).join(',')})`;
const OPEN = "('reserved','running','unknown')";
const MINUTE = 60_000;
const iso = t => new Date(t).toISOString();
const dayStart = now => iso(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const normal = email => String(email).trim().toLowerCase();

export async function planFor(db, email) {
  const row = await db.prepare('SELECT plan, anchor FROM user_plans WHERE email=?1').bind(normal(email)).first();
  const id = row && PLANS[row.plan] ? row.plan : 'early_access';
  // datetime('now') stores "YYYY-MM-DD HH:MM:SS" in UTC; ISO strings pass through.
  const anchor = row ? new Date(row.anchor.includes('T') ? row.anchor : `${row.anchor.replace(' ', 'T')}Z`) : null;
  return { id, ...PLANS[id], anchor };
}

export const renewalText = end => `${new Date(end).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}, 00:00 UTC`;
function outOfCredits(plan, left, credits, end) {
  const renew = `Credits renew ${renewalText(end)}.`;
  if (left > 0) return `This needs ${credits} credits and you have ${left} left. ${renew}`;
  return `You've used ${plan.period === 'week' ? "this week's" : "this month's"} ${plan.credits} credits. ${renew} Saved material and practice still work.`;
}

const periodRow = (db, email, plan, period) => db.prepare('INSERT OR IGNORE INTO usage_periods (email, period_start, period_end, plan, credits_limit) VALUES (?1, ?2, ?3, ?4, ?5)')
  .bind(email, period.start, period.end, plan.id, plan.credits);
const recompute = (db, email) => db.prepare(`UPDATE usage_periods SET
  credits_used = (SELECT COALESCE(SUM(a.charged_credits), 0) FROM usage_actions a WHERE a.email = usage_periods.email AND a.period_start = usage_periods.period_start),
  credits_reserved = (SELECT COALESCE(SUM(a.reserved_credits), 0) FROM usage_actions a WHERE a.email = usage_periods.email AND a.period_start = usage_periods.period_start AND a.status IN ${OPEN})
  WHERE email = ?1`).bind(email);
const left = async (db, email, start) => (await db.prepare('SELECT credits_limit + credits_purchased - credits_used - credits_reserved AS n FROM usage_periods WHERE email=?1 AND period_start=?2').bind(email, start).first())?.n ?? 0;

// §5.1-§5.2. The claim is the insert: it lands only when every limit holds, and the recompute in
// the same batch moves the credits into "reserved". Refused means no row and no change.
export async function admit(db, who, spec, now = new Date()) {
  const email = normal(who.email);
  const same = row => (row.fingerprint === spec.fingerprint ? { duplicate: row } : { refused: { status: 409, error: 'This request id was already used for a different request.' } });
  const prior = await db.prepare('SELECT * FROM usage_actions WHERE email=?1 AND request_id=?2').bind(email, spec.requestId).first();
  if (prior) return same(prior);
  const plan = await planFor(db, email), period = periodFor(plan, now), id = crypto.randomUUID();
  const interactive = INTERACTIVE.includes(spec.type) ? 1 : 0;
  await db.batch([
    periodRow(db, email, plan, period),
    db.prepare(`INSERT OR IGNORE INTO usage_actions (id, email, org, request_id, fingerprint, action_type, tool, resource_kind, resource, board, period_start, status, reserved_credits, lease_expires_at, created_at, pricing_version)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'reserved', ?12, ?13, ?14, ?15
      WHERE (?12 = 0 OR (SELECT credits_limit + credits_purchased - credits_used - credits_reserved FROM usage_periods WHERE email = ?2 AND period_start = ?11) >= ?12)
        AND (?16 = 0 OR (SELECT COUNT(*) FROM usage_actions WHERE email = ?2 AND status IN ('reserved','running') AND lease_expires_at > ?14 AND action_type IN ${INTERACTIVE_SQL}) < 2)
        AND (SELECT COUNT(*) FROM usage_actions WHERE email = ?2 AND action_type = ?6 AND COALESCE(tool, '') = COALESCE(?7, '') AND created_at >= ?17) < ?18
        AND (SELECT COUNT(*) FROM usage_actions WHERE email = ?2 AND action_type = ?6 AND created_at >= ?19) < ?20`)
      .bind(id, email, who.org ?? null, spec.requestId, spec.fingerprint, spec.type, spec.tool ?? null, spec.resourceKind ?? null, spec.resource ?? null, spec.board ?? null,
        period.start, spec.credits, iso(now.getTime() + spec.leaseMs), iso(now), PRICING_VERSION, interactive, dayStart(now), spec.daily ?? 1e9, iso(now.getTime() - MINUTE), spec.perMinute ?? 1e9),
    recompute(db, email),
  ]);
  const action = await db.prepare('SELECT * FROM usage_actions WHERE id=?1').bind(id).first();
  if (action) return { action };
  const raced = await db.prepare('SELECT * FROM usage_actions WHERE email=?1 AND request_id=?2').bind(email, spec.requestId).first();
  if (raced) return same(raced);
  return { refused: await refusal(db, email, spec, plan, period, now, interactive) };
}
// Which limit refused it, checked in the order the claim checks them. Wording only.
async function refusal(db, email, spec, plan, period, now, interactive) {
  const count = async (sql, ...args) => (await db.prepare(sql).bind(...args).first()).n;
  if (spec.credits > 0) {
    const n = await left(db, email, period.start);
    if (n < spec.credits) return { status: 402, error: outOfCredits(plan, n, spec.credits, period.end) };
  }
  if (interactive && await count(`SELECT COUNT(*) AS n FROM usage_actions WHERE email=?1 AND status IN ('reserved','running') AND lease_expires_at > ?2 AND action_type IN ${INTERACTIVE_SQL}`, email, iso(now)) >= 2) {
    return { status: 429, error: 'Two AI requests are already running. Wait for one to finish, then try again.' };
  }
  if (spec.daily && await count("SELECT COUNT(*) AS n FROM usage_actions WHERE email=?1 AND action_type=?2 AND COALESCE(tool,'')=COALESCE(?3,'') AND created_at >= ?4", email, spec.type, spec.tool ?? null, dayStart(now)) >= spec.daily) {
    return { status: 429, error: spec.dailyMessage };
  }
  return { status: 429, error: 'Too many requests this minute. Try again in a moment.' };
}

export async function begin(db, id, now = new Date(), leaseMs = null) {
  const { meta } = await db.prepare("UPDATE usage_actions SET status='running', started_at=?2, lease_expires_at=COALESCE(?3, lease_expires_at) WHERE id=?1 AND status='reserved'")
    .bind(id, iso(now), leaseMs == null ? null : iso(now.getTime() + leaseMs)).run();
  return meta.changes === 1;
}

// §5.3: every end is a guarded transition, so a repeat or a late duplicate changes nothing.
// The charge is clamped to the reservation; unknown keeps the credits reserved (§5.4).
const FROM = { settled: "('running')", clarification: "('running')", unknown: "('running')", released: "('reserved','running')", cancelled: "('quoted','reserved','running')", unknown_released: "('reserved','running','unknown')" };
export async function finish(db, id, { status, charge = 0, outcome = null, error = null, flagged = 0 }, now = new Date()) {
  const row = await db.prepare('SELECT email FROM usage_actions WHERE id=?1').bind(id).first();
  if (!row || !FROM[status]) return false;
  const [moved] = await db.batch([
    db.prepare(`UPDATE usage_actions SET status=?2,
        charged_credits = CASE WHEN ?2 IN ('settled') THEN MIN(?3, reserved_credits) ELSE 0 END,
        released_credits = CASE WHEN ?2 = 'unknown' THEN 0 WHEN ?2 = 'settled' THEN reserved_credits - MIN(?3, reserved_credits) ELSE reserved_credits END,
        outcome=?4, error=?5, flagged=MAX(flagged, ?6), finished_at = CASE WHEN ?2 = 'unknown' THEN NULL ELSE ?7 END
      WHERE id=?1 AND status IN ${FROM[status]}`).bind(id, status, charge, outcome, error, flagged, iso(now)),
    recompute(db, row.email),
  ]);
  return moved.meta.changes === 1;
}

export async function recordCall(db, actionId, c, now = new Date()) {
  const { meta } = await db.prepare(`INSERT INTO usage_calls (action_id, at, provider, transport, requested_model, resolved_model, service_tier, units, pricing_version, cost_nanousd, cost_source, cost_status, status)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13 WHERE EXISTS (SELECT 1 FROM usage_actions WHERE id = ?1 AND status = 'running')`)
    .bind(actionId, iso(now), c.provider, c.transport, c.requested_model ?? null, c.resolved_model ?? null, c.service_tier ?? null, c.units == null ? null : JSON.stringify(c.units),
      PRICING_VERSION, c.cost_nanousd ?? null, c.cost_source ?? null, c.cost_status ?? 'unknown', c.status ?? 'ok').run();
  if (!meta.changes) throw new Error(UNMETERED);
}

export async function setProviderJob(db, id, jobId) {
  const { meta } = await db.prepare("UPDATE usage_actions SET provider_job_id=?2 WHERE id=?1 AND status='running'").bind(id, String(jobId)).run();
  return meta.changes === 1;
}

// §5.5: runs before each reservation and each usage read (no cron). Guarded transitions plus a
// recompute, so running it twice changes nothing. A job with a provider id waits 24 hours.
export async function reconcile(db, email, now = new Date()) {
  email = normal(email);
  const at = iso(now), ago = ms => iso(now.getTime() - ms);
  await db.batch([
    db.prepare("UPDATE usage_actions SET status='released', released_credits=reserved_credits, finished_at=?2, outcome='reservation_expired' WHERE email=?1 AND status='reserved' AND lease_expires_at < ?3").bind(email, at, ago(5 * MINUTE)),
    db.prepare("UPDATE usage_actions SET status='unknown_released', released_credits=reserved_credits, flagged=1, finished_at=?2 WHERE email=?1 AND status='running' AND provider_job_id IS NULL AND started_at < ?3").bind(email, at, ago(15 * MINUTE)),
    db.prepare("UPDATE usage_actions SET status='unknown_released', released_credits=reserved_credits, flagged=1, finished_at=?2 WHERE email=?1 AND status IN ('running','unknown') AND provider_job_id IS NOT NULL AND started_at < ?3").bind(email, at, ago(24 * 60 * MINUTE)),
    db.prepare("UPDATE usage_actions SET status='expired', finished_at=?2 WHERE email=?1 AND status='quoted' AND quote_expires_at < ?2").bind(email, at),
    recompute(db, email),
  ]);
}

// /test/usage only (designated test accounts): one settled system action holding `used` credits.
export async function setTestUsage(db, email, used, now = new Date()) {
  email = normal(email);
  const plan = await planFor(db, email), period = periodFor(plan, now), at = iso(now);
  await db.batch([
    periodRow(db, email, plan, period),
    db.prepare("DELETE FROM usage_actions WHERE email=?1 AND period_start=?2 AND outcome='test'").bind(email, period.start),
    db.prepare("INSERT INTO usage_actions (id, email, request_id, fingerprint, action_type, period_start, status, reserved_credits, charged_credits, created_at, finished_at, outcome) VALUES (?1, ?2, ?1, 'test', 'system', ?3, 'settled', ?4, ?4, ?5, ?5, 'test')")
      .bind(crypto.randomUUID(), email, period.start, used, at),
    recompute(db, email),
  ]);
}
```

- [ ] **Step 4: Run the suite to see it pass**

Run: `cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/control-plane && node --test test/meter.test.js`
Expected: PASS, 13 tests. If "the worker dying" fails on the reserved case, check that `admit` stored `lease_expires_at = now + leaseMs`: the reserved action must still be open at T+5 min and released at T+11 min.

- [ ] **Step 5: Commit**

`make test-unit`, then:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage && git add packages/control-plane/src/meter.js packages/control-plane/test/meter-suite.js packages/control-plane/test/meter.test.js && git commit --only packages/control-plane/src/meter.js packages/control-plane/test/meter-suite.js packages/control-plane/test/meter.test.js -m "feat(usage): the metering ledger - all-or-nothing claims, request-id idempotency, guarded settle and refund with derived totals, two interactive at once, daily and per-minute limits, reconcile of abandoned and unknown actions"
```

---

### Task 4: Paid quotes and clarifications

**Files:**
- Modify: `packages/control-plane/src/meter.js` (append)
- Modify: `packages/control-plane/test/meter-suite.js` (append tests inside `meterSuite`)

**Interfaces:**
- Consumes: `admit`, `begin`, `recordCall`, `finish` (Task 3).
- Produces:
  - `findQuote(db, email, tool, fingerprint, now)`.
  - `prepare(db, who, { requestId, fingerprint, tool, label, resourceKind?, resource? }, now) → { quote } | { action } | { refused }`. `action` is running, so preparation calls can be recorded under it.
  - `offer(db, id, credits, now) → boolean`: running becomes quoted, with a 10-minute expiry.
  - `confirmQuote(db, who, { quoteId, fingerprint }, now) → { action } | { refused }`: quoted becomes reserved.
  - `freeClarification(db, email, now) → { free }` and `CLARIFICATION_CHARGED`.

- [ ] **Step 1: Write the failing tests**

In `packages/control-plane/test/meter-suite.js`, add `prepare, offer, confirmQuote, freeClarification` to the `meter.js` import, and append inside `meterSuite` (before its closing brace):

```js
  it('a clarification releases its credit; the 21st that day settles at 1', async db => {
    const who = person();
    for (let i = 0; i < 20; i++) {
      const { action } = await admit(db, who, spec(), T); await begin(db, action.id, T);
      assert.equal((await freeClarification(db, who.email, T)).free, true);
      await finish(db, action.id, { status: 'clarification', outcome: 'clarification' }, T);
    }
    assert.deepEqual(await wallet(db, who.email), { used: 0, reserved: 0 });
    const { action } = await admit(db, who, spec(), T); await begin(db, action.id, T);
    assert.equal((await freeClarification(db, who.email, T)).free, false);
    await finish(db, action.id, { status: 'settled', charge: 1, outcome: 'clarification' }, T);
    assert.deepEqual(await wallet(db, who.email), { used: 1, reserved: 0 });
  });

  it('the same paid configuration reuses its quote; the 11th preparation that day is refused', async db => {
    const who = person(), job = over => ({ requestId: crypto.randomUUID(), fingerprint: 'cfg-1', tool: 'math', label: 'maths animations', ...over });
    const first = await prepare(db, who, job(), T);
    await recordCall(db, first.action.id, call(), T);                           // the authoring call is a child of the proposal
    assert.equal(await offer(db, first.action.id, 3, T), true);
    assert.equal((await prepare(db, who, job(), at(T, 60_000))).quote.id, first.action.id); // reused: no new authoring call
    for (let i = 2; i <= 10; i++) { const p = await prepare(db, who, job({ fingerprint: `cfg-${i}` }), T); await offer(db, p.action.id, 3, T); }
    const eleventh = await prepare(db, who, job({ fingerprint: 'cfg-11' }), T);
    assert.equal(eleventh.refused.error, "You've prepared 10 maths animations today. Confirm one of them, or try again tomorrow.");
    assert.deepEqual(await wallet(db, who.email), { used: 0, reserved: 0 });
  });

  it('a changed parameter invalidates a quote, confirming reserves it, and an expired quote is refused', async db => {
    const who = person(), job = fingerprint => ({ requestId: crypto.randomUUID(), fingerprint, tool: 'math', label: 'maths animations' });
    const p = await prepare(db, who, job('cfg-a'), T); await offer(db, p.action.id, 3, T);
    assert.match((await confirmQuote(db, who, { quoteId: p.action.id, fingerprint: 'cfg-b' }, T)).refused.error, /settings changed/);
    const ok = await confirmQuote(db, who, { quoteId: p.action.id, fingerprint: 'cfg-a' }, at(T, 60_000));
    assert.equal(ok.action.reserved_credits, 3);
    assert.deepEqual(await wallet(db, who.email), { used: 0, reserved: 3 });
    const late = await prepare(db, who, job('cfg-c'), T); await offer(db, late.action.id, 2, T);
    assert.match((await confirmQuote(db, who, { quoteId: late.action.id, fingerprint: 'cfg-c' }, at(T, 11 * 60_000))).refused.error, /expired/);
  });

  it('a cancelled proposal costs nothing and keeps the cost of preparing it', async db => {
    const who = person(), p = await prepare(db, who, { requestId: crypto.randomUUID(), fingerprint: 'cfg', tool: 'scene', label: '3D scenes' }, T);
    await recordCall(db, p.action.id, call(), T); await offer(db, p.action.id, 2, T);
    assert.equal(await finish(db, p.action.id, { status: 'cancelled', outcome: 'cancelled' }, T), true);
    assert.deepEqual(await wallet(db, who.email), { used: 0, reserved: 0 });
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM usage_calls WHERE action_id=?1').bind(p.action.id).first()).n, 1);
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/control-plane && node --test test/meter.test.js`
Expected: FAIL (`prepare` is not exported).

- [ ] **Step 3: Append to `meter.js`**

```js
// §3 clarifications: the first 20 each day are free; the learner is told when one costs a credit.
export const CLARIFICATION_CHARGED = 'This clarifying question used 1 credit: the first 20 each day are free.';
export async function freeClarification(db, email, now = new Date()) {
  const { n } = await db.prepare("SELECT COUNT(*) AS n FROM usage_actions WHERE email=?1 AND status='clarification' AND created_at >= ?2").bind(normal(email), dayStart(now)).first();
  return { free: n < 20 };
}

// §4 paid jobs: prepare (child calls author the proposal) → offer → confirm → begin → finish.
// The fingerprint is the resolved configuration, including the quoted execution deadline.
export async function findQuote(db, email, tool, fingerprint, now = new Date()) {
  return db.prepare("SELECT * FROM usage_actions WHERE email=?1 AND action_type='paid_job' AND tool=?2 AND fingerprint=?3 AND status='quoted' AND quote_expires_at > ?4 ORDER BY created_at DESC LIMIT 1")
    .bind(normal(email), tool, fingerprint, iso(now)).first();
}
export async function prepare(db, who, { requestId, fingerprint, tool, label, resourceKind = null, resource = null }, now = new Date()) {
  const quote = await findQuote(db, who.email, tool, fingerprint, now);
  if (quote) return { quote };
  const admitted = await admit(db, who, { requestId, fingerprint, type: 'paid_job', tool, credits: 0, resourceKind, resource, leaseMs: 5 * MINUTE, daily: 10,
    dailyMessage: `You've prepared 10 ${label} today. Confirm one of them, or try again tomorrow.` }, now);
  if (admitted.action) await begin(db, admitted.action.id, now);
  return admitted.action ? { action: { ...admitted.action, status: 'running' } } : admitted;
}
export async function offer(db, id, credits, now = new Date()) {
  const { meta } = await db.prepare("UPDATE usage_actions SET status='quoted', quote_credits=?2, quote_expires_at=?3 WHERE id=?1 AND status='running' AND action_type='paid_job'")
    .bind(id, credits, iso(now.getTime() + 10 * MINUTE)).run();
  return meta.changes === 1;
}
export async function confirmQuote(db, who, { quoteId, fingerprint }, now = new Date()) {
  const email = normal(who.email);
  const q = await db.prepare("SELECT * FROM usage_actions WHERE id=?1 AND email=?2 AND action_type='paid_job'").bind(quoteId, email).first();
  if (!q || q.status !== 'quoted' || q.quote_expires_at <= iso(now)) return { refused: { status: 409, error: 'This quote has expired. Get a new quote.' } };
  if (q.fingerprint !== fingerprint) return { refused: { status: 409, error: 'The settings changed since this quote. Get a new quote.' } };
  const plan = await planFor(db, email), period = periodFor(plan, now);
  await db.batch([
    periodRow(db, email, plan, period),
    db.prepare(`UPDATE usage_actions SET status='reserved', period_start=?3, reserved_credits=quote_credits, lease_expires_at=?4
      WHERE id=?1 AND email=?2 AND status='quoted' AND quote_expires_at > ?5
        AND (SELECT credits_limit + credits_purchased - credits_used - credits_reserved FROM usage_periods WHERE email=?2 AND period_start=?3) >= quote_credits`)
      .bind(quoteId, email, period.start, iso(now.getTime() + 5 * MINUTE), iso(now)),
    recompute(db, email),
  ]);
  const action = await db.prepare('SELECT * FROM usage_actions WHERE id=?1').bind(quoteId).first();
  if (action.status === 'reserved') return { action };
  return { refused: { status: 402, error: outOfCredits(plan, await left(db, email, period.start), q.quote_credits, period.end) } };
}
```

A confirmed job must `begin(db, id, now, deadlineMs)` promptly. Otherwise `reconcile` releases it 10 minutes after the confirmation, which is what §5.5 asks for.

- [ ] **Step 4: Run it to see it pass**

Run: `cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/control-plane && node --test test/meter.test.js`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

`make test-unit`, then:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage && git add packages/control-plane/src/meter.js packages/control-plane/test/meter-suite.js && git commit --only packages/control-plane/src/meter.js packages/control-plane/test/meter-suite.js -m "feat(usage): paid quotes - reuse by configuration fingerprint, 10 preparations per tool a day, confirm reserves the quote, cancel keeps the preparation cost; 20 free clarifications a day"
```

---

### Task 5: Project and canvas count, and the storage ledger

**Files:**
- Modify: `packages/control-plane/src/meter.js` (append the storage functions and the resource SQL; extend `reconcile`)
- Modify: `packages/control-plane/src/canvases.js` (add `insertCanvas`)
- Modify: `packages/control-plane/test/meter-suite.js` (append tests)

**Interfaces:**
- Consumes: `planFor` (Task 3).
- Produces, from `meter.js`:
  - `ACTIVE_RESOURCES`: an SQL expression in which `?1` is the email;
  - `resourceLimit(plan) → string`;
  - `reserveBytes(db, who, { storageKey, bytes, kind, resource? }, { limit, enforced }, now) → { id } | { refused }`;
  - `commitBytes(db, email, id)` and `releaseBytes(db, email, id)`;
  - `resizeBytes(db, who, storageKey, bytes, { limit, enforced }) → boolean`;
  - `deleteFile(db, email, id, now) → { storage_key } | null`.
- Produces, from `canvases.js`: `insertCanvas(db, user, { title, project?, device?, name? }) → row | { refused }`. The Learn owner's fork uses it (Task 16).

- [ ] **Step 1: Write the failing tests**

In `packages/control-plane/test/meter-suite.js`, add `reserveBytes, commitBytes, resizeBytes, deleteFile` to the `meter.js` import, add `import { insertCanvas } from '../src/canvases.js';`, and append inside `meterSuite`:

```js
  it('two creates race for the third slot - the limit holds, across workspaces', async db => {
    const who = person();
    await insertCanvas(db, who, { title: 'One' });
    await insertCanvas(db, { ...who, org: 'w-another' }, { title: 'Two' });  // another workspace, same person
    const results = await Promise.all([insertCanvas(db, who, { title: 'A' }), insertCanvas(db, who, { title: 'B' })]);
    assert.equal(results.filter(r => !r.refused).length, 1);
    assert.equal(results.find(r => r.refused).refused, 'You have 3 active projects and canvases, the Early access limit. Archive one in the Library to start another.');
  });

  it('two uploads race for the remaining bytes - the storage limit holds', async db => {
    const who = person(), limits = { limit: 1000, enforced: true };
    const results = await Promise.all(['a', 'b'].map(k => reserveBytes(db, who, { storageKey: `learn-media/${who.email}/${k}`, bytes: 600, kind: 'image' }, limits, T)));
    assert.equal(results.filter(r => r.id).length, 1);
    assert.match(results.find(r => r.refused).refused, /1\.0 kB|storage/);
  });

  it('an overwrite commits only the difference, and a stale reservation is released', async db => {
    const who = person(), limits = { limit: 1000, enforced: true }, key = `learn-boards/${who.email}/notebook`;
    const r = await reserveBytes(db, who, { storageKey: key, bytes: 400, kind: 'board_file' }, limits, T);
    await commitBytes(db, who.email, r.id);
    assert.equal(await resizeBytes(db, who, key, 900, limits), true);
    assert.equal(await resizeBytes(db, who, key, 1100, limits), false);
    await reserveBytes(db, who, { storageKey: `${key}-stale`, bytes: 50, kind: 'image' }, limits, T);
    await reconcile(db, who.email, at(T, 16 * 60_000));
    const s = await db.prepare('SELECT bytes_used AS used, bytes_reserved AS reserved FROM usage_storage WHERE email=?1').bind(who.email).first();
    assert.deepEqual({ ...s }, { used: 900, reserved: 0 });
  });

  it('a stored upload is deleted exactly once; board files are not deletable here', async db => {
    const who = person(), limits = { limit: 1000, enforced: false };
    const paper = await reserveBytes(db, who, { storageKey: `learn-papers/${who.email}/p1`, bytes: 300, kind: 'paper' }, limits, T); await commitBytes(db, who.email, paper.id);
    const board = await reserveBytes(db, who, { storageKey: `learn-boards/${who.email}/b1`, bytes: 100, kind: 'board_file' }, limits, T); await commitBytes(db, who.email, board.id);
    assert.equal((await deleteFile(db, who.email, paper.id, T)).storage_key, `learn-papers/${who.email}/p1`);
    assert.equal(await deleteFile(db, who.email, paper.id, T), null);
    assert.equal(await deleteFile(db, who.email, board.id, T), null);
    assert.equal(await deleteFile(db, 'someone-else@test', board.id, T), null);
    const s = await db.prepare('SELECT bytes_used AS used FROM usage_storage WHERE email=?1').bind(who.email).first();
    assert.equal(s.used, 100);
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/control-plane && node --test test/meter.test.js`
Expected: FAIL (`insertCanvas` and `reserveBytes` are missing).

- [ ] **Step 3: Append the resource and storage functions to `meter.js`**

```js
// §6: the person's own projects and canvases in every workspace, archived ones excluded.
// ?1 is the email in every statement that embeds it.
export const ACTIVE_RESOURCES = '((SELECT COUNT(*) FROM repository_apps WHERE owner_email = ?1 AND archived_at IS NULL) + (SELECT COUNT(*) FROM canvases WHERE owner_email = ?1 AND archived_at IS NULL))';
export const resourceLimit = plan => `You have ${plan.resources} active projects and canvases, the ${plan.name} limit. Archive one in the Library to start another.`;

// §7 storage. source_files rows are the ledger and, while status is reserved, the reservations;
// usage_storage is their sum, recomputed in the same batch.
const size = bytes => (bytes >= 1e9 ? `${bytes / 1e9} GB` : bytes >= 1e6 ? `${bytes / 1e6} MB` : `${(bytes / 1e3).toFixed(1)} kB`);
const storageRow = (db, email) => db.prepare('INSERT OR IGNORE INTO usage_storage (email) VALUES (?1)').bind(email);
const recomputeStorage = (db, email) => db.prepare(`UPDATE usage_storage SET
  bytes_used = (SELECT COALESCE(SUM(bytes), 0) FROM source_files WHERE email = ?1 AND status = 'stored'),
  bytes_reserved = (SELECT COALESCE(SUM(bytes), 0) FROM source_files WHERE email = ?1 AND status = 'reserved')
  WHERE email = ?1`).bind(email);

// Bytes are the server-measured size of what it received, reserved before the R2 write.
export async function reserveBytes(db, who, { storageKey, bytes, kind, resource = null }, { limit, enforced }, now = new Date()) {
  const email = normal(who.email);
  const [, inserted] = await db.batch([
    storageRow(db, email),
    db.prepare(`INSERT OR IGNORE INTO source_files (email, org, resource, kind, storage_key, bytes, status, created_at)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, 'reserved', ?7
      WHERE ?8 = 0 OR (SELECT bytes_used + bytes_reserved FROM usage_storage WHERE email = ?1) + ?6 <= ?9`)
      .bind(email, who.org ?? null, resource, kind, storageKey, bytes, iso(now), enforced ? 1 : 0, limit),
    recomputeStorage(db, email),
  ]);
  if (inserted.meta.changes) return { id: (await db.prepare('SELECT id FROM source_files WHERE storage_key=?1').bind(storageKey).first()).id };
  if (await db.prepare('SELECT 1 FROM source_files WHERE storage_key=?1').bind(storageKey).first()) return { refused: 'This file is already stored. Replace it instead.' };
  return { refused: `This upload would go past your ${size(limit)} of source storage. Delete stored files in Settings → Usage to make room.` };
}
const moveFile = (from, to) => async (db, email, id) => {
  email = normal(email);
  const [moved] = await db.batch([db.prepare(`UPDATE source_files SET status='${to}' WHERE id=?2 AND email=?1 AND status='${from}'`).bind(email, id), recomputeStorage(db, email)]);
  return moved.meta.changes === 1;
};
export const commitBytes = moveFile('reserved', 'stored');   // after the R2 write succeeded
export const releaseBytes = moveFile('reserved', 'failed');  // the R2 write failed
// An overwrite of the same key (a notebook snapshot) commits only the difference. The caller
// claims first, writes R2, and on a failed write resizes back to the old size.
export async function resizeBytes(db, who, storageKey, bytes, { limit, enforced }) {
  const email = normal(who.email);
  const [, moved] = await db.batch([
    storageRow(db, email),
    db.prepare(`UPDATE source_files SET bytes = ?3 WHERE email = ?1 AND storage_key = ?2 AND status = 'stored'
      AND (?4 = 0 OR (SELECT bytes_used + bytes_reserved FROM usage_storage WHERE email = ?1) - bytes + ?3 <= ?5)`).bind(email, storageKey, bytes, enforced ? 1 : 0, limit),
    recomputeStorage(db, email),
  ]);
  return moved.meta.changes === 1;
}
// Stored files in Settings → Usage: uploaded papers and images only, each deleted exactly once.
// Returns the R2 key to delete after the ledger moved, or null when nothing moved.
export async function deleteFile(db, email, id, now = new Date()) {
  email = normal(email);
  const row = await db.prepare("SELECT storage_key FROM source_files WHERE id=?1 AND email=?2 AND status='stored' AND kind IN ('paper','image')").bind(id, email).first();
  if (!row) return null;
  const [moved] = await db.batch([
    db.prepare("UPDATE source_files SET status='deleted', deleted_at=?3 WHERE id=?1 AND email=?2 AND status='stored'").bind(id, email, iso(now)),
    recomputeStorage(db, email),
  ]);
  return moved.meta.changes === 1 ? { storage_key: row.storage_key } : null;
}
```

In `reconcile`, add two statements to the batch, just before `recompute(db, email)`:

```js
    db.prepare("UPDATE source_files SET status='failed' WHERE email=?1 AND status='reserved' AND created_at < ?2").bind(email, ago(15 * MINUTE)),
    recomputeStorage(db, email),
```

`recomputeStorage` is declared after `reconcile` in the file. Both are module-level, so `reconcile` can reach it; move the storage block above `reconcile` if you prefer reading order.

- [ ] **Step 4: Add `insertCanvas` to `canvases.js`**

Add `import { ACTIVE_RESOURCES, planFor, resourceLimit } from './meter.js';` at the top of `packages/control-plane/src/canvases.js`, and add after `ownerCanvases`:

```js
// usage-credits.md §6: the count and the insert are one statement, so two creates racing for
// the last slot cannot both land. The Learn fork (learn-boards.js) inserts through this too.
export async function insertCanvas(db, user, { title, project = null, device = null, name = `canvas-${crypto.randomUUID().slice(0, 8)}` }) {
  const plan = await planFor(db, user.email);
  const row = await db.prepare(`INSERT INTO canvases(org,name,owner_email,title,project,device_id) SELECT ?2,?3,?1,?4,?5,?6 WHERE ${ACTIVE_RESOURCES} < ?7 RETURNING *`)
    .bind(user.email, user.org, name, title, project, device, plan.resources).first();
  return row || { refused: resourceLimit(plan) };
}
```

Task 10 switches the create route over to it.

- [ ] **Step 5: Run it to see it pass**

Run: `cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/control-plane && node --test test/meter.test.js test/canvases.test.js`
Expected: PASS, 21 meter tests plus the unchanged canvas tests.

- [ ] **Step 6: Commit**

`make test-unit`, then:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage && git add packages/control-plane/src/meter.js packages/control-plane/src/canvases.js packages/control-plane/test/meter-suite.js && git commit --only packages/control-plane/src/meter.js packages/control-plane/src/canvases.js packages/control-plane/test/meter-suite.js -m "feat(usage): per-person project and canvas count in the insert statement, and the storage ledger - reserve, commit, release, resize by difference, delete once, stale reservations released"
```

---

### Task 6: The same transaction tests on local D1

**Files:**
- Create: `packages/control-plane/test/meter.d1.test.js`

**Interfaces:**
- Consumes: `meterSuite` (Tasks 3-5); `Miniflare` from `miniflare` (hoisted with wrangler; `getD1Database` verified in its `dist/src/index.d.ts`).

- [ ] **Step 1: Write the test file**

```js
import { after } from 'node:test';
import { readFileSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import { meterSuite } from './meter-suite.js';

// usage-credits.md §5.1, §11: the ledger's transaction tests on local D1 in the Workers runtime,
// proving that a refused claim leaves no action row and that a batch is all or nothing on D1 itself.
const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
const mf = new Miniflare({ modules: true, script: 'export default { fetch: () => new Response("") }', d1Databases: ['DB'] });
after(() => mf.dispose());
const db = await mf.getD1Database('DB');
// Comments go first: some contain semicolons ("one row per person; no row = early_access").
for (const statement of schema.replace(/--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run();

meterSuite('local D1', () => db);
```

- [ ] **Step 2: Run it**

Run: `cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/control-plane && node --test test/meter.d1.test.js`
Expected: PASS, 21 tests.
- If workerd can't start on this machine, stop and report the exact error. Don't skip the file.
- If "two requests race for the last credit" fails on D1 only, the batch or claim semantics differ from SQLite. Report the failing assertion. It is the spec's §5.1 proof, and it is not to be weakened.

- [ ] **Step 3: Confirm `npm test` picks it up**

Run: `cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage && make test-unit`
Expected: all green. The control-plane count grows by the new files. `node --test` also runs `d1-memory.js` and `meter-suite.js` as test files, finding no top-level tests in either; that is expected.

- [ ] **Step 4: Commit**

```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage && git add packages/control-plane/test/meter.d1.test.js && git commit --only packages/control-plane/test/meter.d1.test.js -m "test(usage): the ledger transaction suite also runs on local D1 in the Workers runtime"
```


---

### Task 7: Model transports record child calls and refuse unadmitted ones

**Files:**
- Modify: `packages/control-plane/src/ask.js`: `anthropic`, `planModel`, `askStream`, plus two helpers.
- Test: `packages/control-plane/test/usage-transports.test.js`

**Interfaces:**
- Consumes: `anthropicCost` and `openaiCost` (Task 2); `UNMETERED` (Task 3).
- Produces: the `env.METER` contract that the transports use. The wrapper builds it in Task 8, and Learn's transports use it too (Task 16):
  - `env.METER === false`: this dev-worker request was not admitted, so every model call throws `UNMETERED` before it is sent;
  - `env.METER === undefined`: live small-cp, unchanged;
  - otherwise `env.METER` is `{ action, guard(), call(record) → Promise, later(promise), hold(promise), clarification() → Promise<{ free, note }> }`.
- `askStream` now calls `env.METER?.hold(work)`, where `work` resolves to `'ok'` or `'error'`. A closed browser tab no longer stops the answer.

- [ ] **Step 1: Write the failing tests**

Create `packages/control-plane/test/usage-transports.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { anthropic, planModel, askStream } from '../src/ask.js';
import { UNMETERED } from '../src/meter.js';

// A stand-in for the wrapper's env.METER (metered.js): records calls, holds work.
function meter() {
  const calls = [], pending = [], state = { running: true, held: null };
  const api = { guard() { if (!state.running) throw new Error(UNMETERED); }, call: async c => { calls.push(c); }, later: p => pending.push(p), hold: p => { state.held = p; } };
  return { calls, pending, state, api };
}
const original = globalThis.fetch;
function serve(t, respond) {
  const seen = [];
  globalThis.fetch = async (url, init) => { seen.push({ url: String(url), init }); return respond(url, init); };
  t.after(() => { globalThis.fetch = original; });
  return seen;
}
const message = { model: 'claude-opus-5', content: [{ type: 'text', text: 'Hi' }], usage: { input_tokens: 1000, output_tokens: 200 } };
const sse = events => new Response(events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
const STREAM = [
  { type: 'message_start', message: { model: 'claude-opus-5', usage: { input_tokens: 1000, output_tokens: 1 } } },
  { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } },
  { type: 'content_block_delta', delta: { type: 'text_delta', text: 'world' } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 200 } },
];
const body = { max_tokens: 10, messages: [{ role: 'user', content: 'Hi' }] };

test('a model call outside an admitted action is refused before it is sent', async t => {
  const seen = serve(t, () => Response.json(message));
  await assert.rejects(anthropic({ ANTHROPIC_API_KEY: 'k', METER: false }, body), /not admitted/);
  await assert.rejects(planModel({ OPENAI_API_KEY: 'k', METER: false }, body), /not admitted/);
  const m = meter(); m.state.running = false;
  await assert.rejects(anthropic({ ANTHROPIC_API_KEY: 'k', METER: m.api }, body), /not admitted/);
  assert.equal(seen.length, 0);
  await anthropic({ ANTHROPIC_API_KEY: 'k' }, body);                 // live small-cp: no METER, unchanged
  assert.equal(seen.length, 1);
});

test('each Anthropic call records its resolved model, units and cost, and has a 120 s limit', async t => {
  const seen = serve(t, () => Response.json(message));
  const m = meter();
  await anthropic({ ANTHROPIC_API_KEY: 'k', METER: m.api }, body);
  await Promise.all(m.pending);
  assert.deepEqual(m.calls.map(c => [c.provider, c.transport, c.requested_model, c.resolved_model, c.cost_nanousd, c.cost_status, c.status]),
    [['anthropic', 'anthropic_api', 'claude-opus-5', 'claude-opus-5', 10_000_000, 'final', 'ok']]);
  assert.ok(seen[0].init.signal instanceof AbortSignal);
});

test('a provider error is recorded with an unknown cost, never a zero one', async t => {
  serve(t, () => new Response('{"error":{}}', { status: 529 }));
  const m = meter();
  await anthropic({ ANTHROPIC_API_KEY: 'k', METER: m.api }, body);
  await Promise.all(m.pending);
  assert.deepEqual([m.calls[0].status, m.calls[0].cost_status, m.calls[0].cost_nanousd], ['error', 'unknown', undefined]);
});

test('a board plan on gpt-4.1-mini records the OpenAI model and cost', async t => {
  const seen = serve(t, () => Response.json({ model: 'gpt-4.1-mini-2025-04-14', choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 100 } }));
  const m = meter();
  await planModel({ OPENAI_API_KEY: 'k', METER: m.api }, body);
  await Promise.all(m.pending);
  assert.deepEqual([m.calls[0].provider, m.calls[0].transport, m.calls[0].resolved_model, m.calls[0].cost_nanousd], ['openai', 'openai_api', 'gpt-4.1-mini-2025-04-14', 1000 * 400 + 100 * 1600]);
  assert.ok(seen[0].init.signal instanceof AbortSignal);
});

test('subscription bridge calls are recorded at list price under their own transport', async t => {
  serve(t, () => Response.json({ billing: 'claude-subscription', ...message }));
  const m = meter();
  await anthropic({ SUBSCRIPTION_ONLY: 'true', SUBSCRIPTION_BRIDGE_URL: 'https://bridge.example', SUBSCRIPTION_BRIDGE_TOKEN: 't', METER: m.api }, body);
  await Promise.all(m.pending);
  assert.deepEqual([m.calls[0].transport, m.calls[0].cost_nanousd], ['claude_subscription_bridge', 10_000_000]);
});

// Review focus 1: a closed tab is not a cancel. The answer finishes, is saved and is held for settling.
test('closing the tab mid-answer still saves the answer and holds the work until it ends', async t => {
  serve(t, () => sse(STREAM));
  const m = meter(); let saved = null;
  const response = askStream({ ANTHROPIC_API_KEY: 'k', METER: m.api }, 'context', [], 'Question', async full => { saved = full; });
  const reader = response.body.getReader();
  await reader.read();        // the first frame reaches the browser
  await reader.cancel();      // the learner closes the tab
  assert.equal(await m.state.held, 'ok');
  assert.equal(saved, 'Hello world');
  await Promise.all(m.pending);
  assert.deepEqual([m.calls[0].resolved_model, m.calls[0].units.input_tokens, m.calls[0].units.output_tokens], ['claude-opus-5', 1000, 200]);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/control-plane && node --test test/usage-transports.test.js`
Expected: FAIL. The refusals don't happen, no calls are recorded, and the held work is `null`.

- [ ] **Step 3: Edit `ask.js`**

Add the imports at the top of `packages/control-plane/src/ask.js`:

```js
import { anthropicCost, openaiCost } from './prices.js';
import { UNMETERED } from './meter.js';
```

Add these helpers directly above `export const PLAN_MODEL`:

```js
// Usage metering (docs/features/usage-credits.md §3, §8, §12). The dev worker sets env.METER to
// false, or to the running learner action; live small-cp leaves it undefined, so nothing changes
// there. A model call outside an admitted action is refused before it is sent.
function meterGuard(env) {
  if (env.METER === false) throw new Error(UNMETERED);
  env.METER?.guard();
}
// A streamed Messages response: message_start carries the model and input tokens,
// message_delta the final output tokens.
async function streamedMessage(response) {
  let model = null, usage = null;
  for (const line of (await response.text()).split('\n')) {
    if (!line.startsWith('data: ')) continue;
    let event; try { event = JSON.parse(line.slice(6)); } catch { continue; }
    if (event.type === 'message_start') { model = event.message?.model ?? null; usage = event.message?.usage ?? null; }
    if (event.type === 'message_delta' && event.usage) usage = { ...usage, ...event.usage };
  }
  return { model, usage };
}
// One child-call record per provider call, read from a clone so the caller is never delayed.
function logAnthropic(env, response, requested, transport, streamed) {
  if (!env.METER) return;
  const base = { provider: 'anthropic', transport, requested_model: requested };
  if (!response.ok) return env.METER.later(env.METER.call({ ...base, cost_status: 'unknown', status: 'error' }));
  env.METER.later((streamed ? streamedMessage(response.clone()) : response.clone().json()).then(m => env.METER.call({
    ...base, resolved_model: m.model ?? null, service_tier: m.usage?.service_tier ?? null, units: m.usage ?? null, ...anthropicCost(m.model, m.usage), status: 'ok' })));
}
```

Replace `planModel` with:

```js
export async function planModel(env, body, model, org) {
  if (!env.OPENAI_API_KEY) return anthropic(env, body, model, org);
  meterGuard(env);
  const { stream, ...rest } = body;
  const chosen = env.LEARN_PLAN_MODEL || PLAN_MODEL;
  const base = { provider: 'openai', transport: 'openai_api', requested_model: chosen };
  let response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(120000), // usage-credits.md §3: every model call ≤ 120 s
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify(toOpenAI(rest, chosen)),
    });
  } catch (error) {
    env.METER?.later(env.METER.call({ ...base, cost_status: 'unknown', status: 'unknown' })); // §5.4: submitted, outcome unknown
    throw error;
  }
  if (!response.ok) {
    env.METER?.later(env.METER.call({ ...base, cost_status: 'unknown', status: 'error' }));
    console.warn('openai API error', response.status, (await response.clone().text().catch(() => '')).slice(0, 300),
      JSON.stringify({ model: chosen, tools: (body.tools || []).map(t => t.name) }));
    return response;
  }
  const raw = await response.json();
  env.METER?.later(env.METER.call({ ...base, resolved_model: raw.model ?? null, service_tier: raw.service_tier ?? null, units: raw.usage ?? null, ...openaiCost(raw.model, raw.usage), status: 'ok' }));
  return Response.json(fromOpenAI(raw));
}
```

In `anthropic(env, body, model, org)`, make these four changes:

1. Make `meterGuard(env);` the first statement.
2. In the `SUBSCRIPTION_ONLY` branch, add `logAnthropic(env, response, model || MODEL, 'claude_subscription_bridge', false);` right after `const response = await subscriptionTransport(...)`.
3. Above the `bedrock` branch, add the comment `// ponytail: org-configured providers (bedrock, OpenAI-compatible) never run under METER - Learn and Map asks pass org null; record them here if that changes.`
4. Replace `const resp = await fetch('https://api.anthropic.com/v1/messages', {` and its closing `});` with the block below, keeping the existing `headers` and `body` properties unchanged inside it:

```js
  let resp;
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(120000), // usage-credits.md §3: every model call ≤ 120 s
      headers: { /* unchanged */ },
      body: /* unchanged */,
    });
  } catch (error) {
    env.METER?.later(env.METER.call({ provider: 'anthropic', transport: 'anthropic_api', requested_model: chosen || MODEL, cost_status: 'unknown', status: 'unknown' }));
    throw error;
  }
  logAnthropic(env, resp, chosen || MODEL, 'anthropic_api', Boolean(body.stream));
```

In `askStream`, make these five changes:

1. Replace the `send` line with:
```js
  // A closed tab must not stop the answer: the server finishes, saves and settles it (usage-credits.md §5.6).
  const send = (event, data) => writer.write(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)).catch(() => {});
```
2. Change `(async () => {` to `const work = (async () => {`.
3. After `await send('done', { ok: true, ...meta });`, add `return 'ok';`.
4. In the `catch (e)` block, after the `send('error', …)` line, add `return 'error';`.
5. After the closing `})();` of that function, add `env.METER?.hold(work);`.

- [ ] **Step 4: Run the tests to see them pass, and run the existing ask tests**

Run: `cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/control-plane && node --test test/usage-transports.test.js test/learn-chat.test.js test/subscription.test.js test/openai-shape.test.js test/learn-research.test.js`
Expected: PASS. The existing tests don't set `METER`, so their behaviour is unchanged.

- [ ] **Step 5: Commit**

`make test-unit`, then:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage && git add packages/control-plane/src/ask.js packages/control-plane/test/usage-transports.test.js && git commit --only packages/control-plane/src/ask.js packages/control-plane/test/usage-transports.test.js -m "feat(usage): model transports refuse calls outside an admitted action and record each call with its resolved model, units and cost; 120 s per call; a closed tab no longer stops an answer"
```

---

### Task 8: The action wrapper and its routing table

**Files:**
- Create: `packages/control-plane/src/metered.js`
- Modify: `packages/control-plane/src/meter.js`: the daily count ignores `released` actions (see Step 3).
- Test: `packages/control-plane/test/metered.test.js`

**Interfaces:**
- Consumes: `admit`, `begin`, `finish`, `recordCall`, `reconcile`, `freeClarification`, `CLARIFICATION_CHARGED`, `METER_DOWN`, `PRACTICE_LIMIT`, `UNMETERED` (Tasks 3-4); `narrationCredits` (Task 2); `authorizedBoardApp` (`learn-board.js`, imported, not edited).
- Produces:
  - `ROUTES`;
  - `meterRoute(req) → { route, match, url } | null`;
  - `metered(req, env, ctx, found, serve, { now?, wallMs? }) → Promise<Response>`. `serve(meteredEnv)` is the dev worker's normal handler.

- [ ] **Step 1: Write the failing tests**

Create `packages/control-plane/test/metered.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { meterRoute, metered } from '../src/metered.js';
import { setTestUsage, CLARIFICATION_CHARGED, METER_DOWN, PRACTICE_LIMIT, UNMETERED } from '../src/meter.js';
import { memoryD1 } from './d1-memory.js';

const CANVAS = 'canvas-0a1b2c3d';
function fixture(t) {
  const db = memoryD1(); t.after(() => db.sqlite.close());
  db.sqlite.exec(`INSERT INTO canvases(org,name,owner_email,title) VALUES('team','${CANVAS}','learner@test','Attention')`);
  const waits = [];
  // The session resolves the person (here x-email stands in for the cookie); the body never does.
  const env = { LEARN_DB: db, METER: false, CONTROL_PLANE: { fetch: async req => Response.json({ org: 'team', email: req.headers.get('x-email') || 'learner@test', orgName: 'Team', apps: [] }) } };
  const ctx = { waitUntil: p => waits.push(p) };
  const request = (path, body, headers = {}, method = 'POST') => new Request(`https://dev.test${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, ...(method === 'GET' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
  const send = async (req, serve, options) => ({ res: await metered(req, env, ctx, meterRoute(req), serve, options), settled: () => Promise.all(waits.splice(0)) });
  const rows = () => db.sqlite.prepare('SELECT action_type, tool, status, charged_credits, email, resource FROM usage_actions ORDER BY created_at, rowid').all().map(r => ({ ...r }));
  const calls = () => db.sqlite.prepare('SELECT COUNT(*) AS n FROM usage_calls').get().n;
  return { db, env, request, send, rows, calls };
}
const ask = (over = {}) => ({ scope: { app: CANVAS }, message: 'Why softmax?', ...over });
const opus = { provider: 'anthropic', transport: 'anthropic_api', resolved_model: 'claude-opus-5', cost_nanousd: 10_000_000, cost_source: 'price_table', cost_status: 'final', status: 'ok' };
const answered = async env => { env.METER.guard(); env.METER.later(env.METER.call(opus)); env.METER.hold(Promise.resolve('ok')); return new Response('event: done\ndata: {}\n\n', { headers: { 'content-type': 'text/event-stream' } }); };

test('an answer is one credit, records its child calls, and settles when its work ends', async t => {
  const f = fixture(t);
  const { res, settled } = await f.send(f.request('/api/learn/ask', ask()), answered);
  assert.equal(res.status, 200); await res.text(); await settled();
  assert.deepEqual(f.rows().map(r => [r.action_type, r.status, r.charged_credits, r.resource]), [['learn_answer', 'settled', 1, CANVAS]]);
  assert.equal(f.calls(), 1);
});

test('a question about a selected Map node is a map answer', async t => {
  const f = fixture(t);
  await (await f.send(f.request('/api/learn/ask', ask({ repository_context: { nodeId: 'model', commit: 'a' } })), answered)).settled();
  assert.equal(f.rows()[0].action_type, 'map_answer');
});

test('the browser cannot name the chargeable person, the tool or the amount', async t => {
  const f = fixture(t);
  await (await f.send(f.request('/api/learn/ask', ask({ email: 'other@test', tool: 'free', credits: 0, parent: 'x' })), answered)).settled();
  assert.deepEqual(f.rows().map(r => [r.email, r.tool, r.charged_credits]), [['learner@test', null, 1]]);
});

test('at zero credits a new answer is refused with the renewal line before the handler runs', async t => {
  const f = fixture(t); await setTestUsage(f.db, 'learner@test', 50);
  const { res } = await f.send(f.request('/api/learn/ask', ask()), () => { throw Error('handler ran'); });
  assert.equal(res.status, 402);
  assert.match((await res.json()).error, /Credits renew \w{3} \d{1,2} \w{3}, 00:00 UTC\./);
});

test('practice is still evaluated at zero credits and costs nothing', async t => {
  const f = fixture(t); await setTestUsage(f.db, 'learner@test', 50);
  const { res, settled } = await f.send(f.request('/api/learn/grade', { app: CANVAS, attempt_id: 'a1' }), () => Response.json({ ok: true }));
  assert.equal(res.status, 200); await settled();
  assert.deepEqual(f.rows().filter(r => r.action_type === 'evaluation').map(r => [r.status, r.charged_credits]), [['settled', 0]]);
});

test('the same request id twice runs the handler once; a changed body is refused', async t => {
  const f = fixture(t); let runs = 0;
  const serve = env => { runs++; return answered(env); }, id = { 'x-request-id': 'r-1' };
  await (await f.send(f.request('/api/learn/ask', ask(), id), serve)).settled();
  const again = await f.send(f.request('/api/learn/ask', ask(), id), serve);
  assert.equal(runs, 1);
  assert.equal((await again.res.json()).duplicate, true);
  assert.equal((await f.send(f.request('/api/learn/ask', ask({ message: 'Other' }), id), serve)).res.status, 409);
});

// Review focus 5: a malformed body is answered, never charged, never a crash.
test('a service failure or a malformed body is not charged', async t => {
  const f = fixture(t);
  const failed = await f.send(f.request('/api/learn/ask', ask()), env => { env.METER.later(env.METER.call({ ...opus, status: 'error', cost_nanousd: null, cost_status: 'unknown' })); return Response.json({ error: 'upstream' }, { status: 502 }); });
  assert.equal(failed.res.status, 502); await failed.settled();
  assert.deepEqual(f.rows().map(r => [r.status, r.charged_credits]), [['released', 0]]);
  assert.equal(f.calls(), 1);
  const bad = await f.send(f.request('/api/learn/ask', '{not json'), () => { throw Error('handler ran'); });
  assert.equal(bad.res.status, 400);
  assert.equal(f.rows().length, 1);
});

test('metering being unavailable fails closed before any provider', async t => {
  const f = fixture(t);
  f.env.LEARN_DB = { prepare() { throw Error('D1 down'); }, batch() { throw Error('D1 down'); } };
  const { res } = await f.send(f.request('/api/learn/ask', ask()), () => { throw Error('handler ran'); });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, METER_DOWN);
});

test('a clarification releases its credit, and the 21st that day says it used one', async t => {
  const f = fixture(t), clarify = () => Response.json({ result: 'clarification', question: 'Which layer?' });
  await (await f.send(f.request('/api/learn/artifact', { app: CANVAS, command: 'graph' }), clarify)).settled();
  assert.deepEqual(f.rows().map(r => [r.status, r.charged_credits]), [['clarification', 0]]);
  for (let i = 0; i < 19; i++) await (await f.send(f.request('/api/learn/artifact', { app: CANVAS, command: 'graph', i }), clarify)).settled();
  const charged = await f.send(f.request('/api/learn/artifact', { app: CANVAS, command: 'graph', i: 'last' }), clarify);
  assert.equal((await charged.res.json()).usage.note, CLARIFICATION_CHARGED); await charged.settled();
  assert.deepEqual(f.rows().at(-1).charged_credits, 1);
});

test('preparing a paid proposal is not charged', async t => {
  const f = fixture(t);
  await (await f.send(f.request('/api/learn/artifact', { app: CANVAS, command: 'math' }), () => Response.json({ result: 'paid_proposal', primitive: 'math' }))).settled();
  assert.deepEqual(f.rows().map(r => [r.status, r.charged_credits]), [['released', 0]]);
});

test('unconfirmed paid work returns its quote; narration is quoted from UTF-8 bytes', async t => {
  const f = fixture(t), never = () => { throw Error('handler ran'); };
  const image = await f.send(f.request('/api/learn/image', { app: CANVAS, prompt: 'a cat' }), never);
  assert.equal(image.res.status, 428);
  assert.deepEqual((await image.res.json()).quote, { credits: 1, label: 'Uses 1 credit' });
  const narration = await f.send(f.request('/api/learn/tts', { app: CANVAS, text: 'あ'.repeat(1000) }), never);
  assert.equal((await narration.res.json()).quote.credits, 2);                       // 3,000 bytes, not 1,000 characters
  assert.equal((await f.send(f.request('/api/learn/tts', { app: CANVAS, text: 'あ'.repeat(2667), confirmed: true }), never)).res.status, 400);
  await (await f.send(f.request('/api/learn/image', { app: CANVAS, prompt: 'a cat', confirmed: true }), () => Response.json({ image: 'data:' }))).settled();
  assert.deepEqual(f.rows().map(r => [r.action_type, r.tool, r.charged_credits]), [['paid_job', 'image', 1]]);
});

test('paused tools refuse confirmed work and pass unconfirmed requests through', async t => {
  const f = fixture(t);
  assert.equal((await f.send(f.request('/api/learn/scene', { app: CANVAS, confirmed: true }), () => { throw Error('ran'); })).res.status, 503);
  assert.equal((await f.send(f.request('/api/learn/video', { app: CANVAS, confirmed: true }), () => { throw Error('ran'); })).res.status, 503);
  assert.equal((await f.send(f.request('/api/learn/scene', { app: CANVAS }), () => Response.json({ needsConfirm: true }, { status: 428 }))).res.status, 428);
  assert.equal(f.rows().length, 0);
});

test('a source search is charged only when Exa ran', async t => {
  const f = fixture(t), path = `/api/learn/search?app=${CANVAS}&source=papers&q=attention`;
  await (await f.send(f.request(path, null, {}, 'GET'), env => { env.METER.later(env.METER.call({ provider: 'exa', transport: 'exa_api', cost_status: 'final', cost_nanousd: 15_000_000, status: 'ok' })); return Response.json({ results: [] }); })).settled();
  await (await f.send(f.request(`${path}&again=1`, null, {}, 'GET'), () => Response.json({ results: [] }))).settled(); // served from the 1-hour cache
  assert.deepEqual(f.rows().map(r => [r.action_type, r.charged_credits]), [['source_search', 1], ['source_search', 0]]);
});

test('a handler past the wall clock is stopped, not charged, and its later calls are refused', async t => {
  const f = fixture(t); let late = null;
  const serve = env => new Promise(resolve => setTimeout(() => { try { env.METER.guard(); late = 'ran'; } catch (e) { late = e.message; } resolve(Response.json({})); }, 60));
  const { res, settled } = await f.send(f.request('/api/learn/ask', ask()), serve, { wallMs: 20 });
  assert.equal(res.status, 504); await settled();
  assert.deepEqual(f.rows().map(r => [r.status, r.charged_credits]), [['unknown_released', 0]]);
  await new Promise(r => setTimeout(r, 80));
  assert.equal(late, UNMETERED);
});

test('a streamed Learn flow that never calls hold settles when its body ends', async t => {
  const f = fixture(t);
  const serve = env => new Response(new ReadableStream({ async start(c) {
    await new Promise(r => setTimeout(r, 10));
    env.METER.guard(); await env.METER.call(opus);        // a model call after the handler returned
    c.enqueue(new TextEncoder().encode('{"step":1}\n')); c.close();
  } }), { headers: { 'content-type': 'application/x-ndjson' } });
  const { res, settled } = await f.send(f.request('/api/learn/board', { app: CANVAS, question: 'Why?' }), serve);
  assert.equal(await res.text(), '{"step":1}\n'); await settled();
  assert.deepEqual(f.rows().map(r => [r.action_type, r.status, r.charged_credits]), [['canvas_explanation', 'settled', 1]]);
  assert.equal(f.calls(), 1);
});

test('saved material, local work and navigation are never metered', () => {
  for (const [method, path] of [['GET', '/api/learn/wiki'], ['GET', '/api/learn/paper'], ['POST', '/api/learn/boards/b1/save'], ['GET', '/api/usage'], ['POST', '/api/learn/grade/bench'], ['GET', '/api/learn/grade/report'], ['POST', '/api/canvases'], ['GET', '/api/learn/search/x'], ['GET', '/api/learn/ask']])
    assert.equal(meterRoute(new Request(`https://dev.test${path}`, { method })), null, `${method} ${path}`);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/control-plane && node --test test/metered.test.js`
Expected: FAIL (`../src/metered.js` not found).

- [ ] **Step 3: Stop refused work counting toward a daily allowance**

A clip the handler rejects, or an evaluation our own service failed, should not use up one of the learner's 30 or 100 for the day. In `meter.js`, add `AND status <> 'released'` to the daily count in two places:
- the `admit` claim: the subquery that ends `created_at >= ?17) < ?18`;
- `refusal`: the query that ends `created_at >= ?4`.

Cancelled and expired paid proposals still count, because they were prepared. Re-run `node --test test/meter.test.js` and expect PASS.

- [ ] **Step 4: Write `metered.js`**

Create `packages/control-plane/src/metered.js`:

```js
// The one logical-action wrapper (docs/features/usage-credits.md §3, §5, §12). The dev worker sends
// every AI route through metered(); the handler then sees env.METER, which the model transports use
// to refuse unadmitted calls and to record each child call. The browser chooses only the route and
// a request id: never the person, tool, amount, price or parent.
import { admit, begin, finish, freeClarification, recordCall, reconcile, CLARIFICATION_CHARGED, METER_DOWN, PRACTICE_LIMIT, UNMETERED } from './meter.js';
import { narrationCredits } from './prices.js';
import { authorizedBoardApp } from './learn-board.js';

const MINUTE = 60_000;
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const answer = f => (f.body.repository_context?.nodeId || f.body.repository_context?.range ? 'map_answer' : 'learn_answer');
const KIND = { repository: 'project', canvas: 'canvas' };

// Every dev-worker route that can reach a model or a paid provider (§3 charging matrix). app says
// where the route names its resource; identity resolves from it exactly as the handler does.
// On the preview the Agent Bar posts to /api/learn/ask like Learn chat, so both are learn_answer.
export const ROUTES = [
  { method: 'POST', path: /^\/api\/learn\/(?:ask|selection)$/, type: answer, credits: 1, app: f => f.body.scope?.app },
  { method: 'POST', path: /^\/api\/repositories\/(repo-[a-z0-9-]+)\/ask$/, type: answer, credits: 1, app: (f, m) => m[1] },
  { method: 'POST', path: /^\/api\/(?:apps|repositories)\/(repo-[a-z0-9-]+)\/learn-course$/, when: f => ['draft', 'generate'].includes(f.body.action), type: 'lesson', credits: 1, app: (f, m) => m[1] },
  // A continuation carries a server-signed token from the first request, which holds the credit.
  { method: 'POST', path: /^\/api\/learn\/board$/, type: 'canvas_explanation', credits: f => (f.body.continuation ? 0 : 1), app: f => f.body.app },
  { method: 'POST', path: /^\/api\/learn\/artifact$/, type: 'artifact', credits: 1, inspect: true, app: f => f.body.app },
  { method: 'POST', path: /^\/api\/learn\/image$/, type: 'paid_job', tool: 'image', paid: true, credits: 1, app: f => f.body.app },
  { method: 'POST', path: /^\/api\/learn\/tts$/, type: 'paid_job', tool: 'narration', paid: true, credits: f => narrationCredits(String(f.body.text ?? '')), app: f => f.body.app },
  { method: 'POST', path: /^\/api\/learn\/transcribe$/, type: 'voice_input', credits: 0, daily: 30, dailyMessage: "You've used today's 30 voice transcriptions. Type your answer, or try again tomorrow.", app: f => f.form?.get('app') },
  { method: 'POST', path: /^\/api\/learn\/grade$/, type: 'evaluation', credits: 0, daily: 100, perMinute: 10, dailyMessage: PRACTICE_LIMIT, app: f => f.body.app },
  { method: 'GET', path: /^\/api\/learn\/search$/, type: 'source_search', credits: 1, chargeIf: 'exa', app: (f, m, url) => url.searchParams.get('app') },
  { method: 'POST', path: /^\/api\/learn\/moment-feedback$/, type: 'system', tool: 'keep_moment', credits: 0, app: f => f.body.app },
  // §4, §8: no quote until the deployed machine sizes are verified; video is not boundable yet.
  { method: 'POST', path: /^\/api\/learn\/scene$/, paused: 'Maths animations and 3D scenes are paused on this preview until their cost can be quoted.' },
  { method: 'POST', path: /^\/api\/learn\/video$/, paused: 'Video generation is off until its cost can be quoted.' },
];

export function meterRoute(req) {
  const url = new URL(req.url);
  for (const route of ROUTES) {
    const match = route.method === req.method && url.pathname.match(route.path);
    if (match) return { route, match, url };
  }
  return null;
}

// The route's inputs, read from clones so the handler still gets the untouched request.
async function fieldsOf(req) {
  if (req.method === 'GET') return { body: {}, bytes: new Uint8Array() };
  const bytes = new Uint8Array(await req.clone().arrayBuffer());
  if ((req.headers.get('content-type') || '').includes('multipart/form-data')) {
    const form = await req.clone().formData().catch(() => null);
    let body = {}; try { body = JSON.parse(form?.get('body') || '{}'); } catch { /* the handler answers a bad body */ }
    return { body, form, bytes };
  }
  let body = null; try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { /* the handler answers a bad body */ }
  return { body: body && typeof body === 'object' ? body : {}, bytes };
}
// ponytail: a multipart body carries a random boundary, so its retries are not recognised as the
// same request; only JSON asks carry a request id today.
async function fingerprintOf(req, url, bytes) {
  const head = new TextEncoder().encode(`${req.method} ${url.pathname}${url.search}\n`), all = new Uint8Array(head.length + bytes.length);
  all.set(head); all.set(bytes, head.length);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', all))].map(b => b.toString(16).padStart(2, '0')).join('');
}
const valueOf = (v, f) => (typeof v === 'function' ? v(f) : v);

export async function metered(req, env, ctx, found, serve, { now = () => new Date(), wallMs = 5 * MINUTE } = {}) {
  const { route, match, url } = found, db = env.LEARN_DB;
  const f = await fieldsOf(req);
  if (route.when && !route.when(f)) return serve(env);
  if (route.paused) return f.body.confirmed === true ? json({ error: route.paused }, 503) : serve(env);
  const credits = valueOf(route.credits, f);
  if (credits == null) return json({ error: 'Narration is limited to 8,000 bytes of text. Shorten it and try again.' }, 400);
  let access, action;
  try {
    access = await authorizedBoardApp(req, env, route.app(f, match, url));
    if (access instanceof Response) return access;
    if (route.paid && f.body.confirmed !== true) {
      return json({ error: 'This uses paid generation. Confirm it first.', needsConfirm: true, quote: { credits, label: `Uses ${credits} credit${credits === 1 ? '' : 's'}` } }, 428);
    }
    const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
    if (requestId.length > 100) return json({ error: 'Request id is too long.' }, 400);
    await reconcile(db, access.email, now());
    const admitted = await admit(db, { email: access.email, org: access.org }, {
      requestId, fingerprint: await fingerprintOf(req, url, f.bytes), type: valueOf(route.type, f), tool: route.tool, credits,
      daily: route.daily, perMinute: route.perMinute, dailyMessage: route.dailyMessage, resourceKind: KIND[access.kind] || 'app', resource: access.name,
      board: typeof f.body.board === 'string' ? f.body.board.slice(0, 100) : null, leaseMs: wallMs,
    }, now());
    if (admitted.refused) return json({ error: admitted.refused.error }, admitted.refused.status);
    if (admitted.duplicate) return json({ duplicate: true, action: { id: admitted.duplicate.id, status: admitted.duplicate.status, credits: admitted.duplicate.charged_credits } });
    action = admitted.action;
    await begin(db, action.id, now());
  } catch (error) {
    console.warn('usage metering unavailable', error.message);
    return json({ error: METER_DOWN }, 503);
  }

  const calls = [], pending = [];
  let running = true, held = null, clarified = null, timer;
  const meter = {
    action,
    guard() { if (!running) throw new Error(UNMETERED); },
    call(c) { calls.push(c); return recordCall(db, action.id, c, now()); },
    later(p) { pending.push(Promise.resolve(p).catch(error => console.warn('usage call not recorded', error.message))); },
    hold(p) { held = p; },
    async clarification() { clarified = await freeClarification(db, access.email, now()); return { ...clarified, note: clarified.free ? null : CLARIFICATION_CHARGED }; },
  };
  const deadline = new Promise(resolve => { timer = setTimeout(() => resolve('timeout'), wallMs); });
  let response = await Promise.race([Promise.resolve().then(() => serve({ ...env, METER: meter })).catch(error => json({ error: error.message }, 500)), deadline]);
  let outcome = 'ok';
  if (response === 'timeout') { outcome = 'timeout'; response = json({ error: 'This took longer than 5 minutes and was stopped. No credit was used.' }, 504); }
  else if (!response.ok) outcome = 'error';
  else if (route.inspect && (response.headers.get('content-type') || '').includes('json')) {
    const data = await response.clone().json().catch(() => null);
    if (data?.result === 'paid_proposal') outcome = 'paid_proposal';
    if (data?.result === 'validation_error') outcome = 'error';
    if (data?.result === 'clarification' && !(await meter.clarification()).free) response = json({ ...data, usage: { credits: 1, note: CLARIFICATION_CHARGED } }, response.status);
  } else if (!held && response.body && !(response.headers.get('content-type') || '').includes('json')) {
    // A streamed flow that has not adopted hold() (the Learn contract): its body ending is the end
    // of its work, and a closed tab ends it too.
    let end; held = new Promise(resolve => { end = resolve; });
    const reader = response.body.getReader();
    response = new Response(new ReadableStream({
      async pull(c) { const { done, value } = await reader.read(); if (done) { c.close(); end('ok'); } else c.enqueue(value); },
      cancel(reason) { end('ok'); return reader.cancel(reason); },
    }), response);
  }
  const work = held && outcome === 'ok' ? Promise.race([Promise.resolve(held).catch(() => 'error'), deadline]) : Promise.resolve(outcome);
  ctx.waitUntil(work.then(async end => {
    clearTimeout(timer); running = false;
    await Promise.all(pending);
    await finish(db, action.id, settlement(route, end, credits, calls, clarified), now());
  }).catch(error => console.warn('usage not settled', error.message)));
  return response;
}

// §3, §5.6: a service failure or a timeout costs nothing; a clarification is free up to 20 a day;
// a search that never reached Exa (the 1-hour cache) is free.
function settlement(route, end, credits, calls, clarified) {
  if (end === 'timeout') return { status: 'unknown_released', outcome: 'timeout', flagged: 1 };
  if (end === 'error') return { status: 'released', outcome: 'error' };
  if (end === 'paid_proposal') return { status: 'released', outcome: 'paid_proposal' };
  if (clarified) return clarified.free ? { status: 'clarification', outcome: 'clarification' } : { status: 'settled', charge: 1, outcome: 'clarification' };
  return { status: 'settled', charge: route.chargeIf && !calls.some(c => c.provider === route.chargeIf) ? 0 : credits, outcome: 'ok' };
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/control-plane && node --test test/metered.test.js test/meter.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

`make test-unit`, then:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage && git add packages/control-plane/src/metered.js packages/control-plane/src/meter.js packages/control-plane/test/metered.test.js && git commit --only packages/control-plane/src/metered.js packages/control-plane/src/meter.js packages/control-plane/test/metered.test.js -m "feat(usage): one action wrapper and routing table for every AI route - server-decided type and credits, request-id idempotency, fail closed, 5-minute wall clock, clarification and proposal rules, paused paid tools, quotes before paid work"
```

---

### Task 9: Wire the dev worker and the Agent Bar

**Files:**
- Modify: `packages/web/dev-worker.js`
- Modify: `packages/web/src/agent/ask-stream.js` (send `X-Request-Id`)
- Test: `packages/web/src/agent/ask-stream.test.mjs`

**Interfaces:**
- Consumes: `meterRoute`, `metered` (Task 8); `imageCost`, `narrationBytes`, `narrationCost`, `transcriptionCost` (Task 2).
- Produces: every dev-worker request gets `env.METER`. Routed AI requests get the running action; everything else gets `false`.

- [ ] **Step 1: Write the failing web test**

In `packages/web/src/agent/ask-stream.test.mjs`, append:

```js
// usage-credits.md §5.2: every Agent Bar send carries its own request id, so a retry is recognised.
test('each ask carries a fresh request id', async () => {
  serve(stream('event: done\ndata: {}\n\n'));
  await collect({ path: '/api/learn/ask', body: askBody({ scope: NANOGPT, message: 'Hi' }) });
  const first = request.init.headers['X-Request-Id'];
  assert.match(first, /^[0-9a-f-]{36}$/);
  await collect({ path: '/api/learn/ask', body: askBody({ scope: NANOGPT, message: 'Hi' }) });
  assert.notEqual(request.init.headers['X-Request-Id'], first);
});
```

Run: `cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/web && node --test src/agent/ask-stream.test.mjs`
Expected: FAIL (the header is undefined).

- [ ] **Step 2: Send the request id**

In `packages/web/src/agent/ask-stream.js` `streamAsk`, give both request shapes the header:

```js
  const id = { 'X-Request-Id': crypto.randomUUID() }; // usage-credits.md §5.2
  if (file) {
    const form = new FormData();
    form.append('body', JSON.stringify(body));
    form.append('file', file);
    request = { headers: { ...wsHeaders(), ...id }, body: form };
  } else {
    request = { headers: { 'Content-Type': 'application/json', ...wsHeaders(), ...id }, body: JSON.stringify(body) };
  }
```

Run the test again. Expected: PASS.

- [ ] **Step 3: Put the wrapper in front of the dev worker**

In `packages/web/dev-worker.js`:

1. Add the imports:
```js
import { meterRoute, metered } from '../control-plane/src/metered.js';
import { imageCost, narrationBytes, narrationCost, transcriptionCost } from '../control-plane/src/prices.js';
```
2. Change `export default {` to `const worker = {`. At the end of the file, after the object's closing `};`, add `export default worker;`.
3. Rename the existing `async fetch(req, env, ctx) {` to `async serve(req, env, ctx) {`, and insert this method before it (after `queue`):
```js
  // Usage metering (docs/features/usage-credits.md §3, §12): one wrapper in front of every AI
  // route. Anything else runs with METER false, so a model call outside an admitted action is refused.
  async fetch(req, env, ctx) {
    env = { ...env, METER: false };
    const found = meterRoute(req);
    return found ? metered(req, env, ctx, found, meteredEnv => worker.serve(req, meteredEnv, ctx)) : worker.serve(req, env, ctx);
  },
```

- [ ] **Step 4: Record the three provider calls written inline in the dev worker**

In the `/api/learn/image` branch, add `env.METER.guard();` just before `const upstream = await fetch('https://api.openai.com/v1/images/generations', {`. Then replace the two lines after the fetch:
```js
      if (!upstream.ok) {
        env.METER.later(env.METER.call({ provider: 'openai', transport: 'openai_api', requested_model: 'gpt-image-1', cost_status: 'unknown', status: 'error' }));
        return Response.json({ error: `Image generation unavailable (${upstream.status})` }, { status: 502 });
      }
      const result = await upstream.json();
      env.METER.later(env.METER.call({ provider: 'openai', transport: 'openai_api', requested_model: 'gpt-image-1', resolved_model: 'gpt-image-1', units: { images: 1, ...(result.usage ? { usage: result.usage } : {}) }, ...imageCost(1), status: 'ok' }));
```

In the `/api/learn/tts` branch, add `env.METER.guard();` before the Fish fetch. Replace `if (!upstream.ok) return Response.json({ error: 'Narration audio unavailable.' }, { status: 502 });` with:
```js
      const bytes = narrationBytes(body.text);
      if (!upstream.ok) {
        env.METER.later(env.METER.call({ provider: 'fish', transport: 'fish_api', requested_model: 's1', cost_status: 'unknown', status: 'error' }));
        return Response.json({ error: 'Narration audio unavailable.' }, { status: 502 });
      }
      env.METER.later(env.METER.call({ provider: 'fish', transport: 'fish_api', requested_model: 's1', resolved_model: 's1', units: { utf8_bytes: bytes }, ...narrationCost(bytes), status: 'ok' }));
```

In the `/api/learn/transcribe` branch, make three changes:
1. Change the size check to `if (clip.size > 1_000_000)` and put this comment above it: `// §3: at most 60 s of audio, capped here at 1 MB; the duration check is the Learn owner's.` Keep the message.
2. Add `env.METER.guard();` before the OpenAI fetch.
3. After `const heard = await upstream.json();`, add:
```js
      env.METER.later(env.METER.call({ provider: 'openai', transport: 'openai_api', requested_model: 'gpt-4o-transcribe', resolved_model: 'gpt-4o-transcribe', units: heard.usage ?? null, ...transcriptionCost(heard.usage), status: 'ok' }));
```
Before `return Response.json({ error: 'Could not transcribe that recording.' }, { status: 502 });`, add the error record: `env.METER.later(env.METER.call({ provider: 'openai', transport: 'openai_api', requested_model: 'gpt-4o-transcribe', cost_status: 'unknown', status: 'error' }));`.

These three branches only run as routed POSTs, so `env.METER` is always the running action there.

- [ ] **Step 5: Build the dev bundle and dry-run the worker**

Run (bash; the license key is read from the root `.env` and never printed):
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/web && export VITE_COACHING_DEV=true VITE_BYOC_DEV=true && export VITE_TLDRAW_LICENSE_KEY="$(grep '^TLDRAW_LICENSE_KEY=' C:/Users/cyudhist/Desktop/workspace/small-deploy/.env | cut -d= -f2- | tr -d '\r"')" && npm run build -- --outDir dist-dev >/dev/null && npx wrangler deploy --dry-run --config wrangler.dev.jsonc --name small-cp-dev-smart-home-usage 2>&1 | tail -5
```
Expected: the build succeeds and the dry run prints the bundle size with no errors. Nothing is deployed.

- [ ] **Step 6: Commit**

`make test-unit`, then:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage && git add packages/web/dev-worker.js packages/web/src/agent/ask-stream.js packages/web/src/agent/ask-stream.test.mjs && git commit --only packages/web/dev-worker.js packages/web/src/agent/ask-stream.js packages/web/src/agent/ask-stream.test.mjs -m "feat(usage): the dev worker meters every AI route through one wrapper and refuses model calls outside it; image, narration and transcription record their provider calls; Agent Bar asks carry a request id"
```

---

### Task 10: Enforce the count on create and restore

**Files:**
- Modify: `packages/control-plane/src/canvases.js`: the POST create uses `insertCanvas`, and restore is conditional.
- Modify: `packages/control-plane/src/repositories.js`: project connect becomes a conditional insert, replacing the 25-per-workspace cap.
- Test: `packages/control-plane/test/canvases.test.js`, `packages/control-plane/test/repositories.test.js`

**Interfaces:**
- Consumes: `insertCanvas` (Task 5); `ACTIVE_RESOURCES`, `planFor`, `resourceLimit` (Tasks 3, 5).

- [ ] **Step 1: Write the failing tests**

Append to `packages/control-plane/test/canvases.test.js`:

```js
// usage-credits.md §6 (review focus 3): one count per person across every workspace; over the
// limit, reading, editing and archiving still work, and creating or restoring waits.
test('a fourth active project or canvas is refused until one is archived', async t => {
  const f = fixture(t), learner = { 'x-email': 'learner@test' };
  f.sqlite.exec("INSERT INTO repository_apps(org,name,owner_email,repo,branch) VALUES('w-other','repo-mine','learner@test','example/mine','main')");
  const first = await (await f.send('POST', '/api/canvases', { title: 'One' }, learner)).json();
  assert.equal((await f.send('POST', '/api/canvases', { title: 'Two' }, learner)).status, 201);
  const refused = await f.send('POST', '/api/canvases', { title: 'Three' }, learner);
  assert.equal(refused.status, 403);
  assert.equal((await refused.json()).error, 'You have 3 active projects and canvases, the Early access limit. Archive one in the Library to start another.');
  assert.equal((await f.send('POST', `/api/apps/${first.name}/archive`, null, learner)).status, 200);
  const third = await (await f.send('POST', '/api/canvases', { title: 'Three' }, learner)).json();
  assert.equal((await f.send('POST', `/api/apps/${first.name}/restore`, null, learner)).status, 403);
  assert.equal((await f.send('PATCH', `/api/apps/${third.name}`, { title: 'Still editable' }, learner)).status, 200);
});
```

Append to `packages/control-plane/test/repositories.test.js` (compact style):

```js
test('connecting a project counts toward the per-person limit in every workspace (usage-credits §6)',async t=>{
  const f=fixture(t),original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  globalThis.fetch=async url=>Response.json(new URL(url).pathname==='/repository-metadata'?{commit:newer}:{});
  f.sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('w-other','canvas-0a1b2c3d','owner@test','A'),('team','canvas-1a1b2c3d','owner@test','B')");
  const connect=()=>repositoriesFetch(new Request('https://dev.test/api/repositories',{method:'POST',body:JSON.stringify({url:'https://github.com/example/second',branch:'main'})}),f.env,{});
  const refused=await connect();assert.equal(refused.status,403);
  assert.match((await refused.json()).error,/3 active projects and canvases/);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM repository_apps WHERE owner_email='owner@test'").get().n,1);
  f.sqlite.exec("UPDATE canvases SET archived_at=datetime('now') WHERE name='canvas-1a1b2c3d'");
  assert.equal((await connect()).status,202);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/control-plane && node --test test/canvases.test.js test/repositories.test.js`
Expected: FAIL. The third canvas is created (201), and the project is created (202).

- [ ] **Step 3: Switch the routes to the one-statement limits**

In `canvases.js`, replace the POST insert. That's the `ponytail: no per-owner canvas cap` comment and the `INSERT … RETURNING *` statement:
```js
      const row = await insertCanvas(db, user, { title, project, device });
      if (row.refused) return json({ error: row.refused }, 403);
      return json(canvasApp(row, user), 201);
```

Replace the archive and restore block:
```js
    if (action) {
      if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
      if (action === 'archive') await db.prepare("UPDATE canvases SET archived_at=datetime('now') WHERE id=?").bind(app.id).run();
      else if (app.archived_at) {
        // §6: restoring counts like creating; archiving always works.
        const plan = await planFor(db, user.email);
        const { meta } = await db.prepare(`UPDATE canvases SET archived_at=NULL WHERE id=?2 AND archived_at IS NOT NULL AND ${ACTIVE_RESOURCES} < ?3`).bind(user.email, app.id, plan.resources).run();
        if (!meta.changes) return json({ error: resourceLimit(plan) }, 403);
      }
      return json(await ownedCanvas(env, user, name));
    }
```

In `repositories.js`, add `import { ACTIVE_RESOURCES, planFor, resourceLimit } from './meter.js';`. Then replace the COUNT line and the INSERT line in the POST branch (`const count=… 25 repository preview limit');` and `const row=await db.prepare('INSERT INTO repository_apps…`) with:
```js
      // usage-credits.md §6: one count per person across workspaces, checked inside the insert.
      const plan=await planFor(db,user.email);
      const row=await db.prepare(`INSERT INTO repository_apps(org,name,owner_email,repo,branch) SELECT ?2,?3,?1,?4,?5 WHERE ${ACTIVE_RESOURCES} < ?6 RETURNING *`).bind(user.email,user.org,name,repo,body.branch,plan.resources).first();
      if(!row)return json({error:resourceLimit(plan)},403);
```

- [ ] **Step 4: Give tests that exercise canvas semantics a plan with room**

Run the whole control-plane suite: `cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/control-plane && npm test`.
- Tests that create more than 3 projects and canvases for one person now get 403. They test canvas behaviour, not limits.
- For each such fixture, give that person a plan with room, with this comment: `// These tests are about canvas records, not the §6 limit (tested separately): a plan with room.`
- In `canvases.test.js` `fixture()`, that means adding after the existing `INSERT INTO repository_apps` line:
```js
  sqlite.exec("INSERT INTO user_plans(email, plan) VALUES ('owner@test','pro'), ('colleague@test','pro')");
```
- Apply the same line to any other fixture the run names, with the emails it uses.
- Don't touch `learn-*` test files. If a Learn test fails here, stop and report it: the fork still inserts directly until the Learn owner switches it (Task 16).

Expected after that: PASS.

- [ ] **Step 5: Commit**

`make test-unit`, then:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage && git add packages/control-plane/src/canvases.js packages/control-plane/src/repositories.js packages/control-plane/test/canvases.test.js packages/control-plane/test/repositories.test.js && git commit --only packages/control-plane/src/canvases.js packages/control-plane/src/repositories.js packages/control-plane/test/canvases.test.js packages/control-plane/test/repositories.test.js -m "feat(usage): 3 active projects and canvases per person, enforced inside the create, connect and restore statements; archiving and editing still work over the limit"
```

If Step 4 changed other fixtures, add them to both path lists.

---

### Task 11: Project archive and restore

**Files:**
- Modify: `packages/control-plane/src/repositories.js`: the `archive`/`restore` actions, `GET /api/repositories?archived=1`, and an `archived` parameter on `ownerRepositories`.
- Modify: `packages/web/dev-worker.js`: `repositoryRoute` also forwards `/archive` and `/restore`.
- Modify: `packages/web/src/routes.js`: `previewWriteAllowed` allows exactly those two paths.
- Modify: `packages/web/src/LibraryViews.jsx`: Archive in the project menu; the label becomes "Archived".
- Modify: `packages/web/src/App.jsx`: the archived list includes projects; the confirm copy depends on kind.
- Test: `packages/control-plane/test/repositories.test.js`, `packages/web/src/routes.test.mjs`

**Interfaces:**
- Consumes: `ownerRepositories` (P0 plan); `ACTIVE_RESOURCES`, `planFor`, `resourceLimit` (Task 10).
- Produces:
  - `POST /api/repositories/<name>/archive|restore`, also reachable as `/api/apps/<name>/archive|restore`;
  - `GET /api/repositories?archived=1 → { repositories }`;
  - `ownerRepositories(env, user, archived = false)`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/control-plane/test/repositories.test.js`:

```js
test('a project can be archived and restored by its owner; archived projects leave the Library and the count',async t=>{
  const f=fixture(t),owner={org:'team',email:'owner@test'};
  assert.equal((await f.send('archive',{})).status,200);
  assert.deepEqual((await ownerRepositories(f.env,owner)).map(a=>a.name),[]);
  assert.deepEqual((await ownerRepositories(f.env,owner,true)).map(a=>a.name),['repo-example']);
  const listed=await repositoriesFetch(new Request('https://dev.test/api/repositories?archived=1'),f.env,{});
  assert.deepEqual((await listed.json()).repositories.map(a=>a.name),['repo-example']);
  f.sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('team','canvas-0a1b2c3d','owner@test','A'),('team','canvas-1a1b2c3d','owner@test','B'),('team','canvas-2a1b2c3d','owner@test','C')");
  assert.equal((await f.send('restore',{})).status,403);
  f.sqlite.exec("UPDATE canvases SET archived_at=datetime('now') WHERE name='canvas-2a1b2c3d'");
  assert.equal((await f.send('restore',{})).status,200);
  assert.equal((await f.send('archive',{},{'x-email':'viewer@test'})).status,404);
});
```

In `packages/web/src/routes.test.mjs`, find the list that ends `'/api/apps/repo-1a2b3c4d-nanogpt', '/api/apps/repo-1a2b3c4d-nanogpt/learn-course']) assert.equal(previewWriteAllowed(url), true, url);`. Add `'/api/apps/repo-1a2b3c4d-nanogpt/archive', '/api/apps/repo-1a2b3c4d-nanogpt/restore'` to that list. Add `'/api/apps/repo-1a2b3c4d-nanogpt/delete'` to the refused list, the one ending `assert.equal(previewWriteAllowed(url), false, url);`.

- [ ] **Step 2: Run them to see them fail**

Run: `cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/control-plane && node --test test/repositories.test.js` and `cd ../web && node --test src/routes.test.mjs`
Expected: FAIL. `archive` is not a route (404), and `/archive` is refused by the guard.

- [ ] **Step 3: Server**

In `repositories.js`, make four changes:

1. Replace `ownerRepositories` with:
```js
export async function ownerRepositories(env,user,archived=false){
  const {results}=await env.LEARN_DB.prepare(`SELECT * FROM repository_apps WHERE org=? AND owner_email=? AND archived_at IS ${archived?'NOT ':''}NULL ORDER BY created_at DESC`).bind(user.org,user.email).all();
  return results.map(row=>repositoryApp(row,user));
}
```
2. In `repositoriesFetch`, before `if(path==='/api/repositories'&&req.method==='POST'){`, add:
```js
    if(path==='/api/repositories'&&req.method==='GET')return json({repositories:await ownerRepositories(env,user,url.searchParams.get('archived')==='1')});
```
3. Add `|archive|restore` to the action group of the route regex: `(snapshot|refresh|learn-course|file|ask|threads|archive|restore)`.
4. After the line `if(!action)return req.method==='GET'?json(app):…;`, add:
```js
    if(action==='archive'||action==='restore'){
      if(req.method!=='POST')return json({error:'POST required'},405);
      // usage-credits.md §6: projects leave the Library and the count; restoring counts like connecting.
      if(action==='archive')await db.prepare("UPDATE repository_apps SET archived_at=datetime('now') WHERE id=?").bind(row.id).run();
      else if(row.archived_at){
        const plan=await planFor(db,user.email);
        const {meta}=await db.prepare(`UPDATE repository_apps SET archived_at=NULL WHERE id=?2 AND archived_at IS NOT NULL AND ${ACTIVE_RESOURCES} < ?3`).bind(user.email,row.id,plan.resources).run();
        if(!meta.changes)return json({error:resourceLimit(plan)},403);
      }
      return json(repositoryApp(await db.prepare('SELECT * FROM repository_apps WHERE id=?').bind(row.id).first(),user));
    }
```

The P0 lookups are owner-only, so only the owner reaches this.

In `packages/web/dev-worker.js`, change the `repositoryRoute` regex to `/^\/api\/apps\/(repo-[a-z0-9-]+)(\/learn-course|\/archive|\/restore)?$/`.

In `packages/web/src/routes.js` `previewWriteAllowed`, change the repo line to:
```js
    || /^\/api\/apps\/repo-[a-z0-9-]+(\/learn-course|\/archive|\/restore)?$/.test(p) // dev-worker.js repositoryRoute: served as /api/repositories/...
```

- [ ] **Step 4: Library UI**

In `packages/web/src/LibraryViews.jsx`, inside the `menu?.a.kind === 'repository'` fragment, add after the Map item:
```jsx
            <MenuItem icon={Archive} onClick={() => pick(onArchive)}>Archive…</MenuItem>
```
In the same file, change the two `'Archived canvases'` labels (the sidebar item and the filter chip) to `'Archived'`.

In `packages/web/src/App.jsx`, make three changes:

1. Replace the archived-list effect body:
```js
    setArchivedList(null);
    // T02 §8.4 and usage-credits.md §6: archived canvases and projects, both from LEARN_DB.
    Promise.all([api('/api/canvases?archived=1'), api('/api/repositories?archived=1')])
      .then(([c, r]) => setArchivedList([...r.repositories, ...c.canvases]))
      .catch((e) => setArchivedList({ error: e.message }));
```
2. Change the empty state `No archived canvases.` to `Nothing archived.`, and `aria-label="Archived canvases"` to `aria-label="Archived"`.
3. Make the archive confirm body depend on kind:
```jsx
        <ConfirmDialog title={`Archive ${titleOf(confirmArchive)}?`} body={confirmArchive.kind === 'repository' ? 'It leaves the Library and stops counting toward your active projects and canvases. Its map and chats are kept, and Restore brings it back.' : 'It leaves the Library. Its content stays in this browser, and Restore brings it back.'} confirmLabel="Archive" confirmVariant="primary" onConfirm={archive} onCancel={() => setConfirmArchive(null)} />
```

Then run `cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage && git grep -n "Archived canvases" -- packages/web`. Update any e2e check that looks for that text so it looks for `Archived`.

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage && make test-unit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage && git add packages/control-plane/src/repositories.js packages/control-plane/test/repositories.test.js packages/web/dev-worker.js packages/web/src/routes.js packages/web/src/routes.test.mjs packages/web/src/LibraryViews.jsx packages/web/src/App.jsx && git commit --only packages/control-plane/src/repositories.js packages/control-plane/test/repositories.test.js packages/web/dev-worker.js packages/web/src/routes.js packages/web/src/routes.test.mjs packages/web/src/LibraryViews.jsx packages/web/src/App.jsx -m "feat(usage): projects can be archived and restored from the Library, leaving the Library and the active count; restore respects the limit"
```

If Step 4 changed an e2e check, add it to both path lists.

---

### Task 12: `GET /api/usage`, Stored files, and `/test/usage`

**Files:**
- Create: `packages/control-plane/src/usage.js`
- Modify: `packages/web/dev-worker.js` (two routes)
- Modify: `packages/web/src/routes.js` (`previewWriteAllowed` allows `DELETE /api/usage/files/<id>`)
- Modify: `packages/web/wrangler.dev.jsonc` (`vars`: `USAGE_TEST_EMAILS`, `USAGE_STORAGE_ENFORCED`)
- Test: `packages/control-plane/test/usage.test.js`, `packages/web/src/routes.test.mjs`

**Interfaces:**
- Consumes: `planFor`, `reconcile`, `deleteFile`, `setTestUsage`, `ACTIVE_RESOURCES` (Tasks 3-5); `PLANS`, `periodFor` (Task 2); `repositoryIdentity` (`repositories.js`).
- Produces:
  - `usageFetch(req, env, now?)`, serving:
    - `GET /api/usage` → `{ plan, plans, period {start,end,kind,limit,purchased,used,processing,available}, split {generations,practice}, resources {active,limit}, storage {bytes_used,bytes_reserved,limit,enforced,files[]}, actions[], byTool[], byResource[] }`;
    - `GET /api/usage/files/<id>/references` → `{ boards: [{ title, resource, uses }], note }`;
    - `DELETE /api/usage/files/<id>`.
  - `testUsage(req, env, now?)` for `POST /test/usage` with `{ secret, email, reset?, plan?, used? }`.
  - `BROWSER_NOTE`.

- [ ] **Step 1: Write the failing tests**

Create `packages/control-plane/test/usage.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { usageFetch, testUsage, BROWSER_NOTE } from '../src/usage.js';
import { admit, begin, finish, recordCall, reserveBytes, commitBytes } from '../src/meter.js';
import { memoryD1 } from './d1-memory.js';

const T = new Date('2026-09-29T12:00:00Z');
function fixture(t) {
  const db = memoryD1(); t.after(() => db.sqlite.close());
  const deleted = [];
  const env = {
    LEARN_DB: db, TEST_BYPASS_SECRET: 's3cret', USAGE_TEST_EMAILS: 'usage-a@usage-check.test, usage-b@usage-check.test', USAGE_STORAGE_ENFORCED: 'false',
    LEARN_MEDIA: { head: async key => ({ customMetadata: { title: `${key.split('/').pop()}.pdf` } }), delete: async key => { deleted.push(key); } },
    CONTROL_PLANE: { fetch: async req => Response.json({ org: 'team', email: req.headers.get('x-email') || 'learner@test', orgName: 'Team', apps: [] }) },
  };
  const send = (path, { method = 'GET', headers = {}, body } = {}) => usageFetch(new Request(`https://dev.test${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }), env, T);
  const test_ = body => testUsage(new Request('https://dev.test/test/usage', { method: 'POST', body: JSON.stringify(body) }), env, T);
  return { db, env, deleted, send, testUsage: test_ };
}
const who = { email: 'learner@test', org: 'team' };
const call = over => ({ provider: 'anthropic', transport: 'anthropic_api', resolved_model: 'claude-opus-5', cost_nanousd: 1000, cost_source: 'price_table', cost_status: 'final', status: 'ok', ...over });
async function seed(db) {
  const answer = (await admit(db, who, { requestId: 'a', fingerprint: 'f', type: 'learn_answer', credits: 1, resourceKind: 'canvas', resource: 'canvas-0a1b2c3d', leaseMs: 300_000 }, T)).action;
  await begin(db, answer.id, T); await recordCall(db, answer.id, call(), T); await recordCall(db, answer.id, call({ cost_nanousd: 2000 }), T);
  await finish(db, answer.id, { status: 'settled', charge: 1 }, T);
  const grade = (await admit(db, who, { requestId: 'g', fingerprint: 'f', type: 'evaluation', credits: 0, leaseMs: 300_000 }, T)).action;
  await begin(db, grade.id, T); await finish(db, grade.id, { status: 'settled', charge: 0 }, T);
  const open = (await admit(db, who, { requestId: 'o', fingerprint: 'f', type: 'learn_answer', credits: 1, leaseMs: 300_000 }, T)).action; await begin(db, open.id, T);
  db.sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('team','canvas-0a1b2c3d','learner@test','Attention')");
  const paper = await reserveBytes(db, who, { storageKey: 'learn-papers/d1/p1', bytes: 300, kind: 'paper', resource: 'canvas-0a1b2c3d' }, { limit: 250_000_000, enforced: false }, T);
  await commitBytes(db, who.email, paper.id);
  return { paper };
}

test('Usage reports the person\'s plan, period, split, count, storage and learner-level activity', async t => {
  const f = fixture(t); await seed(f.db);
  const u = await (await f.send('/api/usage')).json();
  assert.deepEqual([u.plan.name, u.plan.price, u.plan.tagline], ['Early access', 'free', "Everyone is on early access while we're not taking payments."]);
  assert.deepEqual(u.plans.map(p => [p.id, p.available]), [['free', false], ['plus', false], ['pro', false]]);
  assert.deepEqual(u.period, { start: '2026-09-28T00:00:00.000Z', end: '2026-10-05T00:00:00.000Z', kind: 'week', limit: 50, purchased: 0, used: 1, processing: 1, available: 48 });
  assert.deepEqual(u.split, { generations: 1, practice: 1 });
  assert.deepEqual(u.resources, { active: 1, limit: 3 });
  assert.deepEqual([u.storage.bytes_used, u.storage.limit, u.storage.enforced, u.storage.files[0].title, u.storage.files[0].deletable], [300, 250_000_000, false, 'p1.pdf', true]);
  const answer = u.actions.find(a => a.status === 'settled' && a.type === 'learn_answer');
  assert.deepEqual([answer.credits, answer.calls.length, answer.resource], [1, 2, 'canvas-0a1b2c3d']);   // six steps would still be one row
  assert.equal(u.actions.find(a => a.status === 'running').credits, 1);
  assert.ok(u.byTool.some(r => r.tool === 'learn_answer' && r.credits === 1));
  assert.ok(u.byResource.some(r => r.resource === 'canvas-0a1b2c3d' && r.credits === 1));
});

test('Usage never shows another person, whatever the query says', async t => {
  const f = fixture(t); await seed(f.db);
  const other = await (await f.send('/api/usage?email=learner@test&tool=x', { headers: { 'x-email': 'other@test' } })).json();
  assert.deepEqual([other.actions.length, other.period.used, other.storage.bytes_used, other.resources.active], [0, 0, 0, 0]);
});

test('deleting an upload warns about shared boards, deletes the object once, and refuses board files', async t => {
  const f = fixture(t), { paper } = await seed(f.db);
  f.db.sqlite.prepare("INSERT INTO learn_boards (id, org, owner_email, app, board, state_json, updated_at, shared, title) VALUES ('b1','team','learner@test','canvas-0a1b2c3d','main',?, '2026-09-29', 1, 'Attention, step by step')")
    .run(JSON.stringify({ blocks: [{ paper: 'p1' }, { paper: 'p1' }] }));
  const refs = await (await f.send(`/api/usage/files/${paper.id}/references`)).json();
  assert.deepEqual(refs, { boards: [{ title: 'Attention, step by step', resource: 'canvas-0a1b2c3d', uses: 2 }], note: BROWSER_NOTE });
  assert.equal((await f.send(`/api/usage/files/${paper.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await f.send(`/api/usage/files/${paper.id}`, { method: 'DELETE' })).status, 404);
  assert.deepEqual(f.deleted, ['learn-papers/d1/p1']);
  assert.equal((await f.send(`/api/usage/files/${paper.id}`, { method: 'DELETE', headers: { 'x-email': 'other@test' } })).status, 404);
});

// Review focus 4: one allowlist entry whatever the case or spaces.
test('/test/usage needs the secret and changes only designated test accounts', async t => {
  const f = fixture(t);
  assert.equal((await f.testUsage({ secret: 'wrong', email: 'usage-a@usage-check.test', used: 1 })).status, 401);
  assert.equal((await f.testUsage({ secret: 's3cret', email: 'learner@test', used: 50 })).status, 403);
  assert.equal((await f.testUsage({ secret: 's3cret', email: ' Usage-A@usage-check.test ', used: 50 })).status, 200);
  const refused = await admit(f.db, { email: 'usage-a@usage-check.test' }, { requestId: 'x', fingerprint: 'f', type: 'learn_answer', credits: 1, leaseMs: 300_000 }, T);
  assert.equal(refused.refused.status, 402);
  assert.equal((await f.testUsage({ secret: 's3cret', email: 'usage-a@usage-check.test', used: 51 })).status, 400);   // never above the limit
  assert.equal((await f.testUsage({ secret: 's3cret', email: 'usage-a@usage-check.test', plan: 'plus' })).status, 200);
  assert.equal(f.db.sqlite.prepare("SELECT plan FROM user_plans WHERE email='usage-a@usage-check.test'").get().plan, 'plus');
  assert.equal((await f.testUsage({ secret: 's3cret', email: 'usage-a@usage-check.test', reset: true })).status, 200);
  assert.equal(f.db.sqlite.prepare("SELECT COUNT(*) AS n FROM usage_actions WHERE email='usage-a@usage-check.test'").get().n, 0);
  delete f.env.TEST_BYPASS_SECRET;
  assert.equal((await f.testUsage({ secret: 's3cret', email: 'usage-a@usage-check.test', used: 1 })).status, 404);
});
```

In `packages/web/src/routes.test.mjs`, add `'/api/usage/files/12'` to the allowed list, and `'/api/usage/files/x'` and `'/api/usage'` to the refused list. `previewWriteAllowed` only judges non-GET requests.

- [ ] **Step 2: Run them to see them fail**

Run: `cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/control-plane && node --test test/usage.test.js`
Expected: FAIL (`../src/usage.js` not found).

- [ ] **Step 3: Write `usage.js`**

Create `packages/control-plane/src/usage.js`:

```js
// Settings → Usage data, Stored files, and the dev-only /test/usage (docs/features/usage-credits.md
// §7, §10, §11). Every answer is for the signed-in person only; no parameter names a person, tool or amount.
import { repositoryIdentity } from './repositories.js';
import { ACTIVE_RESOURCES, deleteFile, planFor, reconcile, setTestUsage } from './meter.js';
import { PLANS, periodFor } from './plans.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const OPEN = ['reserved', 'running', 'unknown'];
export const BROWSER_NOTE = "Canvases kept only in a browser may also use this file; they'll show it as unavailable.";

export async function usageFetch(req, env, now = new Date()) {
  const user = await repositoryIdentity(req, env); if (user instanceof Response) return user;
  const url = new URL(req.url), db = env.LEARN_DB, email = user.email.trim().toLowerCase();
  try {
    await reconcile(db, email, now);
    if (url.pathname === '/api/usage' && req.method === 'GET') return json(await summary(db, env, email, now));
    const file = url.pathname.match(/^\/api\/usage\/files\/(\d+)(\/references)?$/);
    if (file?.[2] && req.method === 'GET') return json(await references(db, email, Number(file[1])));
    if (file && !file[2] && req.method === 'DELETE') {
      // The ledger moves first and only once; then the object goes. An R2 failure leaves an
      // uncounted orphan that the inventory script reports.
      const gone = await deleteFile(db, email, Number(file[1]), now);
      if (!gone) return json({ error: 'That file is already gone.' }, 404);
      await env.LEARN_MEDIA.delete(gone.storage_key);
      return json({ ok: true });
    }
    return json({ error: 'Not found' }, 404);
  } catch (error) {
    console.warn('usage unavailable', error.message);
    return json({ error: 'Usage is unavailable right now. Try again in a minute.' }, 503);
  }
}

async function summary(db, env, email, now) {
  const plan = await planFor(db, email), period = periodFor(plan, now);
  const one = (sql, ...a) => db.prepare(sql).bind(...a).first();
  const all = (sql, ...a) => db.prepare(sql).bind(...a).all().then(r => r.results.map(row => ({ ...row })));
  const [wallet, resources, storage, files, actions, calls, byTool, byResource, practice] = await Promise.all([
    one('SELECT credits_limit, credits_purchased, credits_used, credits_reserved FROM usage_periods WHERE email=?1 AND period_start=?2', email, period.start),
    one(`SELECT ${ACTIVE_RESOURCES} AS n`, email),
    one('SELECT bytes_used, bytes_reserved FROM usage_storage WHERE email=?1', email),
    all("SELECT id, kind, resource, storage_key, bytes, created_at FROM source_files WHERE email=?1 AND status='stored' ORDER BY bytes DESC LIMIT 50", email),
    all("SELECT * FROM usage_actions WHERE email=?1 AND period_start=?2 AND outcome IS NOT 'test' ORDER BY created_at DESC LIMIT 50", email, period.start),
    all('SELECT c.action_id, c.provider, c.transport, c.resolved_model, c.cost_nanousd, c.cost_status, c.status FROM usage_calls c JOIN usage_actions a ON a.id = c.action_id WHERE a.email=?1 AND a.period_start=?2 ORDER BY c.id', email, period.start),
    all("SELECT COALESCE(tool, action_type) AS tool, COUNT(*) AS actions, SUM(charged_credits) AS credits FROM usage_actions WHERE email=?1 AND period_start=?2 AND status NOT IN ('quoted','expired') AND outcome IS NOT 'test' GROUP BY 1 ORDER BY credits DESC, actions DESC", email, period.start),
    all('SELECT resource_kind, resource, COUNT(*) AS actions, SUM(charged_credits) AS credits FROM usage_actions WHERE email=?1 AND period_start=?2 AND resource IS NOT NULL GROUP BY resource_kind, resource ORDER BY credits DESC, actions DESC', email, period.start),
    one("SELECT COUNT(*) AS n FROM usage_actions WHERE email=?1 AND period_start=?2 AND action_type='evaluation' AND status='settled'", email, period.start),
  ]);
  const limit = wallet?.credits_limit ?? plan.credits, purchased = wallet?.credits_purchased ?? 0, used = wallet?.credits_used ?? 0, processing = wallet?.credits_reserved ?? 0;
  // The ledger has no file names; uploads keep theirs in R2 metadata (learn-media.js, learn-paper.js).
  const titles = await Promise.all(files.map(f => (['paper', 'image'].includes(f.kind) ? env.LEARN_MEDIA.head(f.storage_key).then(o => o?.customMetadata?.title || null, () => null) : null)));
  return {
    plan: { id: plan.id, name: plan.name, price: plan.price, tagline: plan.tagline, period: plan.period },
    plans: ['free', 'plus', 'pro'].map(id => ({ id, ...PLANS[id] })),
    period: { start: period.start, end: period.end, kind: plan.period, limit, purchased, used, processing, available: Math.max(0, limit + purchased - used - processing) },
    split: { generations: used, practice: practice.n },
    resources: { active: resources.n, limit: plan.resources },
    storage: { bytes_used: storage?.bytes_used ?? 0, bytes_reserved: storage?.bytes_reserved ?? 0, limit: plan.storage, enforced: env.USAGE_STORAGE_ENFORCED === 'true',
      files: files.map((f, i) => ({ id: f.id, kind: f.kind, resource: f.resource, bytes: f.bytes, created_at: f.created_at, title: titles[i], deletable: ['paper', 'image'].includes(f.kind) })) },
    // One row per learner action; its provider calls travel with it and are never rows of their own.
    actions: actions.map(a => ({ id: a.id, at: a.created_at, type: a.action_type, tool: a.tool, resource_kind: a.resource_kind, resource: a.resource, status: a.status,
      credits: OPEN.includes(a.status) ? a.reserved_credits : a.charged_credits, calls: calls.filter(c => c.action_id === a.id).map(({ action_id, ...c }) => c) })),
    byTool, byResource,
  };
}

// §7: the references the server knows about are the owner's shared boards' saved JSON. Cards name
// an upload by its id, the storage key's last segment (learn-media.js, learn-paper.js).
async function references(db, email, id) {
  const file = await db.prepare("SELECT storage_key FROM source_files WHERE id=?1 AND email=?2 AND status='stored'").bind(id, email).first();
  if (!file) return { boards: [], note: BROWSER_NOTE };
  const token = file.storage_key.split('/').pop();
  const { results } = await db.prepare("SELECT title, app, (length(state_json) - length(replace(state_json, ?2, ''))) / length(?2) AS uses FROM learn_boards WHERE owner_email=?1 AND shared=1 AND instr(state_json, ?2) > 0")
    .bind(email, token).all();
  return { boards: results.map(r => ({ title: r.title ?? null, resource: r.app, uses: r.uses })), note: BROWSER_NOTE };
}

// §11: dev worker only, the test bypass secret, and only the designated test accounts.
export async function testUsage(req, env, now = new Date()) {
  if (!env.TEST_BYPASS_SECRET || req.method !== 'POST') return json({ error: 'not enabled' }, 404);
  let body; try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (body.secret !== env.TEST_BYPASS_SECRET) return json({ error: 'bad secret' }, 401);
  const email = String(body.email ?? '').trim().toLowerCase();
  const allowed = String(env.USAGE_TEST_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(email)) return json({ error: 'Only designated test accounts can be changed here.' }, 403);
  const db = env.LEARN_DB;
  try {
    if (body.reset === true) await db.batch([
      db.prepare('DELETE FROM usage_calls WHERE action_id IN (SELECT id FROM usage_actions WHERE email=?1)').bind(email),
      ...['usage_actions', 'usage_periods', 'user_plans', 'usage_storage', 'source_files'].map(table => db.prepare(`DELETE FROM ${table} WHERE email=?1`).bind(email)),
      db.prepare('DELETE FROM canvases WHERE owner_email=?1').bind(email),
      db.prepare('DELETE FROM repository_apps WHERE owner_email=?1').bind(email),
    ]);
    if (body.plan !== undefined) {
      if (!PLANS[body.plan]) return json({ error: 'Unknown plan' }, 400);
      await db.prepare("INSERT INTO user_plans (email, plan, anchor, updated_by) VALUES (?1, ?2, ?3, 'test/usage') ON CONFLICT(email) DO UPDATE SET plan=excluded.plan, anchor=excluded.anchor, updated_by=excluded.updated_by")
        .bind(email, body.plan, now.toISOString()).run();
    }
    if (body.used !== undefined) {
      if (!Number.isInteger(body.used) || body.used < 0) return json({ error: 'used must be a whole number' }, 400);
      await setTestUsage(db, email, body.used, now);
    }
  } catch (error) { return json({ error: error.message }, 400); }
  return json({ ok: true });
}
```

- [ ] **Step 4: Route them in the dev worker, allow the one delete in the preview guard, and add the vars**

In `packages/web/dev-worker.js`, import `{ usageFetch, testUsage }` from `'../control-plane/src/usage.js'`. Right after the `canvasRoute` line in `serve`, add:
```js
    if (path === '/api/usage' || path.startsWith('/api/usage/')) return usageFetch(req, env);
    if (path === '/test/usage') return testUsage(req, env);
```

In `packages/web/src/routes.js` `previewWriteAllowed`, add the alternative `|| /^\/api\/usage\/files\/\d+$/.test(p) // dev-worker.js usageFetch: Stored files delete` to the returned expression.

In `packages/web/wrangler.dev.jsonc` `vars`, add:
```jsonc
    // usage-credits.md §7, §11: storage stays unenforced until both delete paths exist; the
    // designated /test/usage accounts (never real people).
    "USAGE_STORAGE_ENFORCED": "false",
    "USAGE_TEST_EMAILS": "usage-a@usage-check.test,usage-b@usage-check.test",
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage && make test-unit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage && git add packages/control-plane/src/usage.js packages/control-plane/test/usage.test.js packages/web/dev-worker.js packages/web/src/routes.js packages/web/src/routes.test.mjs packages/web/wrangler.dev.jsonc && git commit --only packages/control-plane/src/usage.js packages/control-plane/test/usage.test.js packages/web/dev-worker.js packages/web/src/routes.js packages/web/src/routes.test.mjs packages/web/wrangler.dev.jsonc -m "feat(usage): GET /api/usage for the signed-in person, Stored files with reference warnings and a once-only delete, and the dev-only /test/usage for designated test accounts"
```

---

### Task 13: Usage wording helpers

**Files:**
- Create: `packages/web/src/usage.js`
- Test: `packages/web/src/usage.test.mjs`

**Interfaces:**
- Produces: `renewalLine(end, now?)`, `creditLine(period)`, `stateWord(used, limit)`, `storageLine(storage)`, `sizeText(bytes)`, `chargeLabel(action)`, `actionLabel(action)`, `toolLabel(tool)`, `costText(call)`, `splitLines(split)` and `deleteWarning(refs, titleFor)`. Task 14 uses all of them.

- [ ] **Step 1: Write the failing tests**

Create `packages/web/src/usage.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionLabel, chargeLabel, costText, creditLine, deleteWarning, renewalLine, splitLines, stateWord, storageLine } from './usage.js';

// Review focus 2: never "in 0 days"; a period that just ended still reads sensibly until the reload.
test('the renewal line is computed from the period end', () => {
  assert.equal(renewalLine('2026-10-05T00:00:00.000Z', new Date('2026-10-02T00:00:00Z')), 'Renews Mon 5 Oct, 00:00 UTC · in 3 days');
  assert.equal(renewalLine('2026-10-05T00:00:00.000Z', new Date('2026-10-04T23:30:00Z')), 'Renews Mon 5 Oct, 00:00 UTC · in 1 day');
  assert.equal(renewalLine('2026-10-05T00:00:00.000Z', new Date('2026-10-05T00:00:01Z')), 'Renews Mon 5 Oct, 00:00 UTC · in 1 day');
});
test('processing is never shown as used', () => {
  assert.equal(creditLine({ kind: 'week', limit: 50, used: 12, processing: 2, available: 36 }), '50 weekly credits · 12 used · 2 processing · 36 available');
});
test('states are words as well as colours', () => {
  assert.deepEqual([stateWord(39, 50), stateWord(40, 50), stateWord(50, 50), stateWord(3, 3)], [null, 'Nearly used up', 'Limit reached', 'Limit reached']);
});
test('storage is decimal, with one decimal place', () => {
  assert.equal(storageLine({ bytes_used: 120_400_000, limit: 250_000_000 }), '120.4 MB of 250 MB');
  assert.equal(storageLine({ bytes_used: 1_240_000_000, limit: 5_000_000_000 }), '1.2 GB of 5 GB');
});
test('each activity row says processing, not charged, free or its credits', () => {
  assert.deepEqual([{ status: 'running', credits: 1 }, { status: 'released', credits: 0 }, { status: 'settled', credits: 0 }, { status: 'clarification', credits: 0 }, { status: 'settled', credits: 2 }].map(chargeLabel),
    ['processing', 'not charged', 'free', 'free', '2 credits']);
  assert.deepEqual(splitLines({ generations: 12, practice: 38 }), [['Generations', '12 credits'], ['Practice evaluations', '38 · free']]);
  assert.deepEqual([costText({ cost_nanousd: null }), costText({ cost_nanousd: 10_000_000 })], ['cost unknown', '$0.0100']);
  assert.equal(actionLabel({ type: 'paid_job', tool: 'image' }), 'Image');
});
test('a delete warning names what the server found and always admits browser-only copies', () => {
  const note = "Canvases kept only in a browser may also use this file; they'll show it as unavailable.";
  assert.equal(deleteWarning({ boards: [{ title: 'Attention, step by step', uses: 3 }], note }),
    `This file is referenced 3 times on 'Attention, step by step'. Deleting it will make those references unavailable. ${note}`);
  assert.equal(deleteWarning({ boards: [], note }), note);
});
```

Run: `cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/web && node --test src/usage.test.mjs`
Expected: FAIL (module not found).

- [ ] **Step 2: Write `usage.js`**

Create `packages/web/src/usage.js`:

```js
// Settings → Usage wording (docs/features/usage-credits.md §7, §10). Pure, so it is unit-tested.
const DAY = 86_400_000;
export function renewalLine(end, now = new Date()) {
  const at = new Date(end), days = Math.max(1, Math.ceil((at - now) / DAY));
  return `Renews ${at.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}, 00:00 UTC · in ${days} day${days === 1 ? '' : 's'}`;
}
export const creditLine = p => `${p.limit} ${p.kind === 'week' ? 'weekly' : 'monthly'} credits · ${p.used} used · ${p.processing} processing · ${p.available} available`;
export const stateWord = (used, limit) => (!limit ? null : used >= limit ? 'Limit reached' : used / limit >= 0.8 ? 'Nearly used up' : null);
// Decimal units, matching the package copy: 1 MB = 1,000,000 bytes.
export const sizeText = bytes => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${(bytes / 1e6).toFixed(1)} MB`);
const limitText = bytes => (bytes >= 1e9 ? `${bytes / 1e9} GB` : `${bytes / 1e6} MB`);
export const storageLine = s => `${sizeText(s.bytes_used)} of ${limitText(s.limit)}`;
const TYPES = { learn_answer: 'Answer', map_answer: 'Map answer', bar_answer: 'Agent Bar answer', canvas_explanation: 'Explain on canvas', artifact: 'Card', lesson: 'Lesson', evaluation: 'Practice evaluation', voice_input: 'Voice answer', source_search: 'Source search', paid_job: 'Paid generation', system: 'System' };
const TOOLS = { image: 'Image', narration: 'Narration', math: 'Maths animation', scene: '3D scene', keep_moment: 'Keep video moment' };
export const toolLabel = t => TOOLS[t] || TYPES[t] || t;
export const actionLabel = a => TOOLS[a.tool] || TYPES[a.type] || a.type;
export function chargeLabel(a) {
  if (['reserved', 'running', 'unknown'].includes(a.status)) return 'processing';
  if (['released', 'cancelled', 'expired', 'unknown_released'].includes(a.status)) return 'not charged';
  return a.credits ? `${a.credits} credit${a.credits === 1 ? '' : 's'}` : 'free';
}
export const costText = c => (c.cost_nanousd == null ? 'cost unknown' : `$${(c.cost_nanousd / 1e9).toFixed(4)}`);
export const splitLines = s => [['Generations', `${s.generations} credit${s.generations === 1 ? '' : 's'}`], ['Practice evaluations', `${s.practice} · free`]];
// §7: what the server found on shared boards, and always the browser-only caveat.
export function deleteWarning(refs, titleFor = b => b.title) {
  const found = refs.boards.map(b => `This file is referenced ${b.uses} time${b.uses === 1 ? '' : 's'} on '${titleFor(b)}'.`);
  return [...found, found.length ? 'Deleting it will make those references unavailable.' : null, refs.note].filter(Boolean).join(' ');
}
```

Run the test. Expected: PASS.

- [ ] **Step 3: Commit**

`make test-unit`, then `git add packages/web/src/usage.js packages/web/src/usage.test.mjs && git commit --only packages/web/src/usage.js packages/web/src/usage.test.mjs -m "feat(usage): Settings Usage wording - renewal line, credit line with processing, states in words, decimal storage, activity labels, delete warnings"`.

---

### Task 14: Settings → Usage panel and Upgrade view

**Files:**
- Create: `packages/web/src/UsagePanel.jsx`
- Modify: `packages/web/src/Sidebar.jsx` (the Usage nav item and pane, lazy, preview only)
- Modify: `packages/web/e2e/live-bundle-check.mjs` (`PREVIEW_CHUNKS` and `MARKERS`)

**Interfaces:**
- Consumes: `GET /api/usage`, `GET /api/usage/files/<id>/references`, `DELETE /api/usage/files/<id>` (Task 12); the helpers from Task 13; `titleOf` (`agent/catalog.js`: `row.kind === 'repository' ? row.repo : row.title || row.name`); `libraryHref` (`library-filter.js`); `api`, `navigate` (`api.js`); `Button`, `ConfirmDialog`, `EmptyState`, `Pill`, `SkeletonRows`, `cn` (`ui.jsx`).

- [ ] **Step 1: Write the panel**

Create `packages/web/src/UsagePanel.jsx`:

```jsx
import { Fragment, useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, ChevronRight, Clock, Coins, FolderOpen, HardDrive, MapPin, Sparkles, Trash2, Wrench } from 'lucide-react';
import { api, navigate } from './api.js';
import { titleOf } from './agent/catalog.js';
import { libraryHref } from './library-filter.js';
import { Button, cn, ConfirmDialog, EmptyState, Pill, SkeletonRows } from './ui.jsx';
import { actionLabel, chargeLabel, costText, creditLine, deleteWarning, renewalLine, sizeText, splitLines, stateWord, storageLine, toolLabel } from './usage.js';

// Settings → Usage (docs/features/usage-credits.md §10). Preview only: Sidebar.jsx loads this chunk
// behind the literal VITE_COACHING_DEV guard, so the live bundle never carries it.
const CREDIT_NOTE = "A new AI answer or card-generation request uses 1 credit. Some generation tools use more; you'll see the amount before starting. Internal steps don't use extra credits.";
const STATE_COLOR = { 'Nearly used up': 'yellow', 'Limit reached': 'red' };
const Th = ({ icon: Icon, children, className }) => <th scope="col" className={cn('px-2 py-1.5 text-left text-xs font-medium text-ink-2', className)}><span className="inline-flex items-center gap-1"><Icon size={12} strokeWidth={1.5} aria-hidden="true" />{children}</span></th>;
const Td = ({ children, className }) => <td className={cn('px-2 py-1.5 text-sm', className)}>{children}</td>;
const Section = ({ title, children }) => <section className="mt-6 border-t border-line pt-6"><h3 className="text-base font-semibold">{title}</h3>{children}</section>;
const Header = () => <><div className="text-2xl font-semibold">Usage</div><div className="pt-2 text-base text-ink-2">Your plan, credits and limits.</div></>;
const when = at => new Date(at).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });

function Meter({ used, limit, label }) {
  const word = stateWord(used, limit);
  return (
    <div className="pt-2">
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)} className="h-2 max-w-md overflow-hidden rounded-full bg-hover">
        <div className={cn('h-full rounded-full', word === 'Limit reached' ? 'bg-danger' : word ? 'bg-warn' : 'bg-accent')} style={{ width: `${Math.min(100, limit ? (used / limit) * 100 : 0)}%` }} />
      </div>
      {word && <Pill className="mt-2" color={STATE_COLOR[word]}>{word}</Pill>}
    </div>
  );
}

function Table({ label, head, children }) {
  return <div className="overflow-x-auto pt-4"><table className="w-full min-w-[480px]" aria-label={label}><thead><tr className="border-b border-line">{head}</tr></thead><tbody>{children}</tbody></table></div>;
}

export default function UsagePanel({ apps = [], onClose }) {
  const [data, setData] = useState(null);       // null loading | usage | { error }
  const [view, setView] = useState('usage');    // usage | plans
  const [open, setOpen] = useState(null);       // expanded activity row
  const [confirm, setConfirm] = useState(null); // { file, refs }
  const [busy, setBusy] = useState(null);       // the file being checked or deleted
  const load = useCallback(() => api('/api/usage').then(setData).catch((e) => setData({ error: e.message })), []);
  useEffect(() => { load(); }, [load]);
  // The period can end while Settings is open: read again at renewal.
  useEffect(() => {
    const ms = data?.period ? new Date(data.period.end) - Date.now() : Infinity;
    if (ms > 2 ** 31 - 1) return undefined;
    const timer = setTimeout(load, Math.max(0, ms) + 1000);
    return () => clearTimeout(timer);
  }, [data, load]);
  const where = (slug) => (slug ? titleOf(apps.find((a) => a.name === slug) || { name: slug }) : '—');
  const ask = async (file) => {
    setBusy(file.id);
    try { setConfirm({ file, refs: await api(`/api/usage/files/${file.id}/references`) }); } catch (e) { setData((d) => ({ ...d, fileError: e.message })); }
    setBusy(null);
  };
  const remove = async () => {
    const { file } = confirm; setConfirm(null); setBusy(file.id);
    try { await api(`/api/usage/files/${file.id}`, { method: 'DELETE' }); await load(); } catch (e) { setData((d) => ({ ...d, fileError: e.message })); }
    setBusy(null);
  };

  if (data === null) return <div data-usage-panel><Header /><SkeletonRows rows={6} className="pt-6" /></div>;
  if (data.error) return <div data-usage-panel><Header /><p className="pt-6 text-sm text-ink-2">{data.error}</p><Button className="mt-2" onClick={() => { setData(null); load(); }}>Try again</Button></div>;
  if (view === 'plans') return <Plans data={data} onBack={() => setView('usage')} />;
  const p = data.period;
  return (
    <div data-usage-panel>
      <Header />
      <section aria-label="Current plan" className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line p-4">
        <div>
          <div className="text-base font-semibold">{data.plan.name} · {data.plan.price}</div>
          <div className="pt-0.5 text-sm text-ink-2">{data.plan.tagline}</div>
        </div>
        <Button variant="primary" onClick={() => setView('plans')}>Upgrade</Button>
      </section>

      <Section title="Credits">
        <p className="pt-2 text-sm">{creditLine(p)}</p>
        <Meter used={p.used + p.processing} limit={p.limit + p.purchased} label="Credits" />
        <p className="max-w-xl pt-2 text-xs text-ink-2">{CREDIT_NOTE}</p>
        <p className="pt-1 text-xs text-ink-2">{renewalLine(p.end)}</p>
        <div className="flex items-center gap-2 pt-3"><Button disabled>Buy credits</Button><Pill>Coming soon</Pill></div>
      </Section>

      <Section title="Active projects and canvases">
        <p className="pt-2 text-sm">{data.resources.active} of {data.resources.limit}</p>
        <Meter used={data.resources.active} limit={data.resources.limit} label="Active projects and canvases" />
        <Button size="sm" className="mt-2" onClick={() => { onClose?.(); navigate(libraryHref({})); }}>Archive in the Library</Button>
      </Section>

      <Section title="Source storage">
        <p className="pt-2 text-sm">{storageLine(data.storage)}</p>
        <Meter used={data.storage.bytes_used} limit={data.storage.limit} label="Source storage" />
        {data.fileError && <p role="alert" className="pt-2 text-sm text-danger">{data.fileError}</p>}
        {!data.storage.files.length ? <EmptyState icon={HardDrive}>No stored files.</EmptyState> : (
          <Table label="Stored files" head={<><Th icon={HardDrive}>File</Th><Th icon={MapPin}>Where</Th><Th icon={Coins} className="text-right">Size</Th><th className="w-20" /></>}>
            {data.storage.files.map((f) => (
              <tr key={f.id} className="border-b border-line">
                <Td>{f.title || (f.kind === 'paper' ? 'Uploaded paper' : f.kind === 'image' ? 'Uploaded image' : 'Shared board file')}</Td>
                <Td className="text-ink-2">{where(f.resource)}</Td>
                <Td className="text-right">{sizeText(f.bytes)}</Td>
                <Td className="text-right">{f.deletable && <Button size="sm" disabled={busy === f.id} onClick={() => ask(f)} aria-label={`Delete ${f.title || 'file'}`}><Trash2 size={13} strokeWidth={1.5} />{busy === f.id ? 'Checking…' : 'Delete'}</Button>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title={p.kind === 'week' ? 'This week' : 'This month'}>
        <dl className="grid max-w-sm grid-cols-[1fr_auto] gap-y-1 pt-3 text-sm">
          {splitLines(data.split).map(([k, v]) => <Fragment key={k}><dt className="text-ink-2">{k}</dt><dd className="text-right">{v}</dd></Fragment>)}
        </dl>
        {!data.actions.length ? <EmptyState icon={Sparkles}>No AI activity yet.</EmptyState> : (
          <Table label="Activity" head={<><Th icon={Clock}>Time</Th><Th icon={MapPin}>Where</Th><Th icon={Sparkles}>What</Th><Th icon={Coins} className="text-right">Credits</Th></>}>
            {data.actions.map((a) => (
              <Fragment key={a.id}>
                <tr className="border-b border-line">
                  <Td className="text-ink-2">{when(a.at)}</Td>
                  <Td>{where(a.resource)}</Td>
                  <Td>
                    <button type="button" aria-expanded={open === a.id} disabled={!a.calls.length} onClick={() => setOpen(open === a.id ? null : a.id)} className="inline-flex cursor-pointer items-center gap-1 rounded-sm hover:text-ink disabled:cursor-default">
                      {a.calls.length > 0 && (open === a.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}{actionLabel(a)}
                    </button>
                  </Td>
                  <Td className="text-right">{chargeLabel(a)}</Td>
                </tr>
                {open === a.id && a.calls.map((c, i) => (
                  <tr key={i} className="border-b border-line bg-side text-ink-2">
                    <Td /><Td>{c.transport}</Td><Td>{c.resolved_model || c.provider}{c.status !== 'ok' ? ` · ${c.status}` : ''}</Td><Td className="text-right">{costText(c)}</Td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </Table>
        )}
        {data.byTool.length > 0 && (
          <Table label="By tool" head={<><Th icon={Wrench}>Tool</Th><Th icon={Sparkles} className="text-right">Actions</Th><Th icon={Coins} className="text-right">Credits</Th></>}>
            {data.byTool.map((r) => <tr key={r.tool} className="border-b border-line"><Td>{toolLabel(r.tool)}</Td><Td className="text-right">{r.actions}</Td><Td className="text-right">{r.credits}</Td></tr>)}
          </Table>
        )}
        {data.byResource.length > 0 && (
          <Table label="By project or canvas" head={<><Th icon={FolderOpen}>Project or canvas</Th><Th icon={Sparkles} className="text-right">Actions</Th><Th icon={Coins} className="text-right">Credits</Th></>}>
            {data.byResource.map((r) => <tr key={r.resource} className="border-b border-line"><Td>{where(r.resource)}</Td><Td className="text-right">{r.actions}</Td><Td className="text-right">{r.credits}</Td></tr>)}
          </Table>
        )}
      </Section>

      {confirm && (
        <ConfirmDialog title={`Delete ${confirm.file.title || 'this file'}?`} body={deleteWarning(confirm.refs, (b) => b.title || where(b.resource))}
          confirmLabel="Delete" onConfirm={remove} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}

// §10: Free, Plus and Pro with planned prices; none is current and none can be chosen yet.
function Plans({ data, onBack }) {
  const list = (items) => <ul className="pt-1 text-sm">{items.map((l) => <li key={l} className="flex gap-2 py-0.5"><Check size={14} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-2" aria-hidden="true" />{l}</li>)}</ul>;
  return (
    <div data-usage-panel>
      <Button size="sm" onClick={onBack}><ArrowLeft size={14} strokeWidth={1.5} />Usage</Button>
      <div className="pt-4 text-2xl font-semibold">Plans</div>
      <p className="pt-2 text-sm text-ink-2">{data.plan.tagline}</p>
      <div className="grid gap-4 pt-6 md:grid-cols-3">
        {data.plans.map((p) => (
          <section key={p.id} aria-label={p.name} className="flex flex-col rounded-xl border border-line p-4">
            <h3 className="text-base font-semibold">{p.name}</h3>
            <p className="pt-1 text-sm text-ink-2">{p.tagline}</p>
            <div className="pt-4 text-2xl font-semibold">{p.price}</div>
            <div className="text-xs text-ink-2">{p.priceNote}</div>
            <h4 className="pt-4 text-xs font-medium text-ink-3">Resources</h4>{list(p.resourceLines)}
            <h4 className="pt-4 text-xs font-medium text-ink-3">Learning &amp; support</h4>{list(p.support)}
            <Button className="mt-auto self-start" disabled>Coming soon</Button>
          </section>
        ))}
      </div>
    </div>
  );
}
```

The cards need a gap above the button: if `mt-auto` leaves the button flush against the list on short cards, wrap the lists in a `flex-1 pb-4` div. Check this in Step 4's screenshot.

- [ ] **Step 2: Mount it in Settings, preview only**

In `packages/web/src/Sidebar.jsx`, make four changes:

1. Change `import { useEffect, useRef, useState } from 'react';` to `import { lazy, Suspense, useEffect, useRef, useState } from 'react';`.
2. Add `Gauge` to the `lucide-react` import.
3. Below the `AVAILABILITY_COLOR` line, add:
```js
// Settings → Usage (usage-credits.md §10): preview only. The literal guard lets Rollup drop the chunk
// from the live build (e2e/live-bundle-check.mjs).
const UsagePanel = import.meta.env.VITE_COACHING_DEV === 'true' && learnPreview ? lazy(() => import('./UsagePanel.jsx')) : null;
```
4. After `<NavBtn id="preferences" icon={SlidersHorizontal}>Preferences</NavBtn>`, add `{UsagePanel && <NavBtn id="usage" icon={Gauge}>Usage</NavBtn>}`. Just before `{tab === 'preferences' && (`, add:
```jsx
          {UsagePanel && tab === 'usage' && <Suspense fallback={null}><UsagePanel apps={apps} onClose={onClose} /></Suspense>}
```

In `packages/web/e2e/live-bundle-check.mjs`, add `UsagePanel` to the `PREVIEW_CHUNKS` alternation and `'data-usage-panel'` to `MARKERS`.

- [ ] **Step 3: Prove the live bundle is clean and the marker is real**

Run (bash):
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/web && unset VITE_COACHING_DEV VITE_BYOC_DEV && npm run build >/dev/null && node e2e/live-bundle-check.mjs; echo "live exit $?"
```
Expected: `live exit 0`.

Then build the preview bundle (Task 9 Step 5's build command) and run `DIST=dist-dev node e2e/live-bundle-check.mjs; echo "dev exit $?"`.
Expected: non-zero, with the failures naming `UsagePanel-…js` and `data-usage-panel` among the others. That proves the marker isn't vacuous.

- [ ] **Step 4: Commit**

`make test-unit`, then:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage && git add packages/web/src/UsagePanel.jsx packages/web/src/Sidebar.jsx packages/web/e2e/live-bundle-check.mjs && git commit --only packages/web/src/UsagePanel.jsx packages/web/src/Sidebar.jsx packages/web/e2e/live-bundle-check.mjs -m "feat(usage): Settings Usage on the preview - Early access plan, Upgrade comparison with every purchase disabled, credits with processing and renewal, active projects and canvases, storage with Stored files, generations versus free practice, activity with child calls, by tool and by project"
```

The panel is reviewed deployed, in Task 18.

---

### Task 15: Storage inventory (read-only) and the ledger seed

**Files:**
- Create: `packages/control-plane/scripts/storage-inventory.mjs`

**Interfaces:**
- Reads `small-learn-dev` through `wrangler d1 execute --remote --json` (SELECTs only), and lists `small-learn-media-dev` with the S3 API using a **read-only** R2 token.
- Writes one local file: the seed SQL path given as the first argument. It never writes to D1 or R2.

- [ ] **Step 1: Write the script**

Create `packages/control-plane/scripts/storage-inventory.mjs`:

```js
// usage-credits.md §7 inventory, dev only and read-only: attribute each small-learn-media-dev object
// and each shared board's JSON to its owner, and write INSERT OR IGNORE rows for the storage ledger.
// It never writes D1 or R2; applying the seed is a separate, announced step.
// usage: node scripts/storage-inventory.mjs <seed.sql>
// needs in small-deploy/.env: CF_ACCOUNT_ID, R2_READONLY_ACCESS_KEY_ID, R2_READONLY_SECRET_ACCESS_KEY (never printed)
import { execFileSync } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '')]));
const out = process.argv[2]; if (!out) throw new Error('usage: node scripts/storage-inventory.mjs <seed.sql>');
const web = new URL('../../web/', import.meta.url);
const d1 = sql => JSON.parse(execFileSync('npx', ['wrangler', 'd1', 'execute', 'small-learn-dev', '--remote', '--config', 'wrangler.dev.jsonc', '--json', '--command', sql], { cwd: web, encoding: 'utf8', shell: true }))[0].results;
const sha = s => createHash('sha256').update(s).digest('hex');
const hmac = (k, s) => createHmac('sha256', k).update(s).digest();

async function listObjects(bucket) {
  const host = `${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`, objects = [];
  let token = null;
  do {
    const qs = [['continuation-token', token], ['list-type', '2']].filter(([, v]) => v).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''), date = amzDate.slice(0, 8), payload = sha('');
    const canonical = `GET\n/${bucket}\n${qs}\nhost:${host}\nx-amz-content-sha256:${payload}\nx-amz-date:${amzDate}\n\nhost;x-amz-content-sha256;x-amz-date\n${payload}`;
    const scope = `${date}/auto/s3/aws4_request`;
    let key = `AWS4${env.R2_READONLY_SECRET_ACCESS_KEY}`;
    for (const part of [date, 'auto', 's3', 'aws4_request']) key = hmac(key, part);
    const signature = createHmac('sha256', key).update(`AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha(canonical)}`).digest('hex');
    const res = await fetch(`https://${host}/${bucket}?${qs}`, { headers: { 'x-amz-date': amzDate, 'x-amz-content-sha256': payload, Authorization: `AWS4-HMAC-SHA256 Credential=${env.R2_READONLY_ACCESS_KEY_ID}/${scope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${signature}` } });
    const xml = await res.text(); if (!res.ok) throw new Error(`R2 list failed (${res.status})`);
    for (const [, c] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) objects.push({ key: c.match(/<Key>([^<]*)<\/Key>/)[1], size: Number(c.match(/<Size>(\d+)<\/Size>/)[1]) });
    token = xml.match(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/)?.[1] || null;
  } while (token);
  return objects;
}

// Uploads are keyed by sha256([org, name, email]) (learn-media.js, learn-paper.js); boards by id (learn-boards.js).
const owners = new Map();
for (const r of [...d1('SELECT org, name, owner_email FROM canvases'), ...d1('SELECT org, name, owner_email FROM repository_apps')]) owners.set(sha(JSON.stringify([r.org, r.name, r.owner_email])), r);
const boards = new Map(d1('SELECT id, org, owner_email, app, shared, length(CAST(state_json AS BLOB)) AS bytes FROM learn_boards').map(b => [b.id, b]));
const q = v => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`), rows = [], orphans = [], now = new Date().toISOString();
for (const o of await listObjects('small-learn-media-dev')) {
  const [prefix, id] = o.key.split('/'), kind = { 'learn-media': 'image', 'learn-papers': 'paper', 'learn-boards': 'board_file' }[prefix];
  const owner = kind === 'board_file' ? boards.get(id) && { org: boards.get(id).org, name: boards.get(id).app, owner_email: boards.get(id).owner_email } : kind && owners.get(id);
  if (owner) rows.push([owner.owner_email, owner.org, owner.name, kind, o.key, o.size]); else orphans.push(o.key);
}
for (const b of boards.values()) if (b.shared) rows.push([b.owner_email, b.org, b.app, 'board_json', `learn_boards:${b.id}`, b.bytes]);
writeFileSync(out, [
  ...rows.map(r => `INSERT OR IGNORE INTO source_files (email, org, resource, kind, storage_key, bytes, status, created_at) VALUES (${r.map(q).join(', ')}, 'stored', ${q(now)});`),
  'INSERT OR IGNORE INTO usage_storage (email) SELECT DISTINCT email FROM source_files;',
  "UPDATE usage_storage SET bytes_used = (SELECT COALESCE(SUM(bytes), 0) FROM source_files f WHERE f.email = usage_storage.email AND f.status = 'stored'), bytes_reserved = 0;",
].join('\n'));
console.log(`${rows.length} attributed (${rows.reduce((n, r) => n + r[5], 0)} bytes), ${orphans.length} unattributed objects, seed written to ${out}`);
for (const key of orphans) console.log(`unattributed: ${key}`);
```

The keys that count are the ones in spec §7. Anything the script can't attribute (legacy dev objects, generated outputs) is listed as unattributed and is not counted. Keys are paths, not personal data. Emails appear only inside the seed file, never on the console.

- [ ] **Step 2: Check it offline**

Run: `cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/control-plane && node --check scripts/storage-inventory.mjs`
Expected: no output. The real run is Task 18, after the user has created the read-only token.

- [ ] **Step 3: Commit**

`git add packages/control-plane/scripts/storage-inventory.mjs && git commit --only packages/control-plane/scripts/storage-inventory.mjs -m "feat(usage): read-only storage inventory for the dev bucket and shared boards, writing the ledger seed"`.

---

### Task 16: The Learn owner's contract

**Files:**
- Create: `docs/features/usage-credits-learn-contract.md`

- [ ] **Step 1: Write the contract**

Create `docs/features/usage-credits-learn-contract.md`. Base the content on the list below, and cite file and function names as they are in the merged tree.

- **What already works with no Learn change.** The wrapper admits and settles every AI route (`metered.js` `ROUTES`). Every model call through `anthropic()` or `planModel()` is recorded, and refused outside an admitted action. A streamed response that never calls `hold` settles when its body ends.
- **`env.METER` API.** `guard()`, `call(record) → Promise`, `later(promise)`, `hold(promise resolving 'ok' | 'error')` and `clarification() → { free, note }`. Show the record fields and the transports (`fal_queue`, `exa_api`, `typesafe_api`, `workers_ai`, `fly_worker`), and require `cost_status` to be `unknown` whenever usage is missing.
- **Learn's items, each tied to its spec section:**
  1. `boardFetch` calls `env.METER.hold(work)`, with disconnect-safe writes like `askStream` (§5.6).
  2. A board plan with `needsClarification` calls `env.METER.clarification()` and shows its `note` (§3).
  3. The Exa call in `searchCanvasSource` records `{ provider: 'exa', transport: 'exa_api', cost_nanousd: usdToNano(costDollars.total), cost_source: 'provider_reported' }`. A search is charged only when this record exists.
  4. Jev and the stronger grader record their calls. The evaluation ladder (deterministic, then Jev, then one stronger call only if ambiguous, at most 2 evaluator calls) moves off `/api/learn/ask`. `attempt_id` is sent as `X-Request-Id`, which gives idempotency; a concurrent duplicate returns 200 `{ duplicate }`. Until the ladder lands, a Challenge verdict that goes through `/api/learn/ask` is charged 1 credit on the usage clone. Say so plainly.
  5. The Workers AI embedding in `momentFeedback` records its call.
  6. The 60 s duration check on transcription (the 1 MB cap is done).
  7. The paid confirm UI shows `quote.label` from the 428 `needsConfirm` response.
  8. Maths and 3D quotes use `prepare`, `offer`, `confirmQuote` and `begin(…, deadlineMs)` from `meter.js`. Their fingerprint includes the resolved configuration and the render deadline, and authoring is bounded at the most expensive model the fallback path can resolve to. The `paused` route in `ROUTES` lifts only when the deployed machine sizes are verified.
  9. The artifact `paid_proposal` path gets a quote with 10 preparations per tool per day. Today the wrapper already releases its credit.
  10. The scene worker does not resubmit on 404 for metered jobs (`learn-scene.js`).
  11. Uploads and board saves use `reserveBytes`, then the R2 write, then `commitBytes` or `releaseBytes`, with `resizeBytes` for overwrites.
  12. The fork inserts through `insertCanvas(db, user, { title, name })` instead of its own `INSERT INTO canvases`.
  13. "Stop sharing and delete cloud copy", with the §7 wording. Once it ships, `USAGE_STORAGE_ENFORCED` goes to `"true"`.
  14. Learn chat sends `X-Request-Id` per send (`ask.jsx`).
- **Done by smart-home, although §12 lists them under Learn.** The image, narration and transcription call records and the 1 MB audio cap, because those calls are written in `dev-worker.js`.
- **Tests Learn owns (§11):** Challenge and Explain-back submits leave the balance unchanged; the same `attempt_id` twice makes one evaluator call; the grading ladder; an over-limit upload is refused.

- [ ] **Step 2: Commit, and hold the hand-off**

`git add docs/features/usage-credits-learn-contract.md && git commit --only docs/features/usage-credits-learn-contract.md -m "docs(usage): the contract the Learn owner wires their flows against"`.

Sending it to the Learn owner's session waits for the user's word, as with earlier hand-offs.

---

### Task 17: Browser check on the usage clone

**Files:**
- Create: `packages/web/e2e/usage-check.mjs`

- [ ] **Step 1: Write the check**

Model its shape on `packages/web/e2e/canvas-chrome.mjs`, which uses the `.env` read, `/test/session`, the `small_session` cookie and a custom `User-Agent`. Before choosing selectors, find how an existing check opens Settings: `git grep -n "Settings" packages/web/e2e`. Reuse that way in, then click the `Usage` nav item.

Constants:
- `BASE = 'https://small-cp-dev-smart-home-usage.zeroshothq.workers.dev'`.
- Accounts `usage-a@usage-check.test` and `usage-b@usage-check.test`, both designated test accounts. Never a real person.
- The secret is `SMALL_TEST_BYPASS`, read from `C:/Users/cyudhist/Desktop/workspace/small-deploy/.env` and never printed.

Setup, as Node `fetch` calls rather than page actions:
1. `POST /test/usage { reset: true }` for both accounts.
2. Create 3 canvases for A with `POST /api/canvases`. These write dev LEARN_DB only.
3. `POST /test/usage { used: 50 }` for A.

In the page, first add the no-live-writes guard (memory `red-checks-abort-live-writes`):
```js
const aborted = [];
await context.route('**/*', route => {
  const r = route.request(), path = new URL(r.url()).pathname;
  if (r.method() === 'GET' || ['/api/learn/ask', '/api/canvases'].includes(path)) return route.continue();
  aborted.push(`${r.method()} ${path}`); return route.abort();
});
```

Checks, each printed `✓` or `✗` with a short reason, exiting non-zero on any `✗`:
1. The Early access card reads `Early access · free`, plus the tagline.
2. **Upgrade** opens three cards (Free, Plus, Pro) with `$0`, `$19` and `$39`. Every button in them is disabled and reads `Coming soon`, and none is marked current.
3. **Buy credits** is disabled, with `Coming soon` beside it.
4. The credit line reads `50 weekly credits · 50 used · 0 processing · 0 available`.
5. `Limit reached` is shown as text.
6. The renewal line matches `/^Renews \w{3} \d{1,2} \w{3}, 00:00 UTC · in \d+ days?$/`.
7. `3 of 3` and `Limit reached` appear under Active projects and canvases.
8. Refusals, as Node fetches with A's session:
   - `POST /api/learn/ask` on A's first canvas is 402 with `Credits renew`;
   - a 4th `POST /api/canvases` is 403 with `Archive one in the Library`.
9. **Privacy:** B's `GET /api/apps` lists none of A's canvases, and B's `GET /api/usage` shows `used 0`.
10. **Phone and dark mode:** the panel at 390×844, and again with the dark theme, has no horizontal page scroll (`document.documentElement.scrollWidth <= innerWidth`).
11. `aborted` is printed, so any control that tried a write is visible.

Screenshots (desktop light, desktop dark, phone, Upgrade view) go to the directory given as the first argument, for Figma.

Cleanup: `POST /test/usage { reset: true }` for both accounts.

The over-limit upload check waits for the Learn storage writers (contract item 11). Print it as `– over-limit upload: waits for Learn storage writers`, never as a pass.

- [ ] **Step 2: Commit**

`git add packages/web/e2e/usage-check.mjs && git commit --only packages/web/e2e/usage-check.mjs -m "test(usage): browser check for Settings Usage, refusals, privacy between accounts, phone and dark, with non-GET writes aborted"`.

It runs in Task 18, after deploy.

---

### Task 18: Rollout to the usage clone

Nothing here touches production. Each step reports what it did.

- [ ] **Step 1: Announce the dev schema change, then apply it**

Post in chat first: "Applying the usage schema to shared dev D1 small-learn-dev: one ALTER adding repository_apps.archived_at, then repository-schema.sql again (additive: six usage tables and their indexes). No existing row changes." Then run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/web && npx wrangler d1 execute small-learn-dev --remote --config wrangler.dev.jsonc --file ../control-plane/learn-db-usage-1.sql && npx wrangler d1 execute small-learn-dev --remote --config wrangler.dev.jsonc --file ../control-plane/repository-schema.sql && npx wrangler d1 execute small-learn-dev --remote --config wrangler.dev.jsonc --command "SELECT name FROM sqlite_master WHERE name IN ('user_plans','usage_periods','usage_actions','usage_calls','usage_storage','source_files')"
```
Expected: six names. If the ALTER reports `duplicate column name: archived_at`, another session already applied it. Continue.

- [ ] **Step 2: Deploy the clone**

Run the Task 9 Step 5 build (`VITE_COACHING_DEV=true VITE_BYOC_DEV=true`, the license key read from `.env`, `--outDir dist-dev`), then:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/web && npx wrangler deploy --config wrangler.dev.jsonc --name small-cp-dev-smart-home-usage
```
Then give the clone its own copy of the test bypass secret, piped from `.env` and never printed:
```bash
grep '^SMALL_TEST_BYPASS=' C:/Users/cyudhist/Desktop/workspace/small-deploy/.env | cut -d= -f2- | tr -d '\r"' | npx wrangler secret put TEST_BYPASS_SECRET --name small-cp-dev-smart-home-usage --config wrangler.dev.jsonc
```
Wait about 20 s before probing (memory `wrangler-deploy-rollout-lag`).

Model keys are not copied to the clone. The checks need none, because every refusal happens before a provider call. A live metered answer on the clone would spend real money, so it waits for the user's go.

- [ ] **Step 3: Run the checks**

```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/web && node e2e/usage-check.mjs C:/Users/cyudhist/.claude/jobs/33565778/tmp/usage-shots
```
Expected: every line `✓`, the upload line `–`, and `aborted` either empty or listing only controls that were meant to be blocked. Inspect every screenshot from a clean browser state before handing anything off (memory `verify-pixels-before-handoff`).

- [ ] **Step 4: Inventory and seed, only after the user creates a read-only R2 token**

Ask the user to create an R2 API token with Object Read only on `small-learn-media-dev`, and to add `CF_ACCOUNT_ID`, `R2_READONLY_ACCESS_KEY_ID` and `R2_READONLY_SECRET_ACCESS_KEY` to `small-deploy/.env`. Then run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/control-plane && node scripts/storage-inventory.mjs C:/Users/cyudhist/.claude/jobs/33565778/tmp/usage-seed.sql
```
Report the printed counts. Then announce and apply the seed:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home-usage/packages/web && npx wrangler d1 execute small-learn-dev --remote --config wrangler.dev.jsonc --file C:/Users/cyudhist/.claude/jobs/33565778/tmp/usage-seed.sql
```

- [ ] **Step 5: Figma review**

Put the deployed screenshots on the review file `ef9SfiemEsPQF2bd8B1os3`, named `Usage v1`:
- Usage in desktop light, desktop dark and phone;
- the Upgrade view;
- an Agent Bar refusal at zero credits;
- a 4th-canvas refusal.

Starter plan allows 3 pages. List the pages first; if a new one can't be added, use a named section on the existing review page. Send the node URL along with the clone link `https://small-cp-dev-smart-home-usage.zeroshothq.workers.dev`. The user approves.

- [ ] **Step 6: Record the status in the spec**

Add a short "Implementation status (dev)" section at the end of `docs/features/usage-credits.md`:
- the commits;
- the clone and its version id;
- the schema applied on the date;
- the check results;
- the Figma node;
- what waits on Learn (the contract items);
- what waits on the user (the R2 token, the paid answer test, production).

Commit it with `git commit --only docs/features/usage-credits.md -m "docs(usage): dev implementation status"`. Don't push. Don't delete the clone until the user has reviewed it; afterwards, the command is `npx wrangler delete --name small-cp-dev-smart-home-usage --config wrangler.dev.jsonc`.
