# Usage and credits (v1)

Status: design approved in conversation (user, 2026-09-29); this spec awaits the user's review before planning.
Branch: `feature/usage-credits` (worktree `smart-home-usage`, dev clone `small-cp-dev-smart-home-usage`). The WP7
acceptance build (tag `wp7-acceptance-build`, clone `small-cp-dev-smart-home`) stays frozen.

## Purpose

Rabbit Hole is not taking payments yet, so everyone joins free on one **Early access** plan with a weekly credit
allowance, a board limit and a storage limit. Every AI generation and paid tool job is metered per person in our own
database: who used how much, what is left, which board, app or canvas used it, which tools ran and what they really
cost. At the limit, the action stops. Settings shows the plan, the three limits, a weekly breakdown, an Upgrade view of
the future packages, and a disabled Buy credits button.

v1 is a solo app: balances are per person, never pooled per workspace. (Hiding Members, teams and other multi-person
features is a separate follow-up, not part of this spec.)

## Decisions (user, 2026-09-29)

- Real metering now; purchases later. Buy credits and plan upgrades are shown but disabled ("Coming soon").
- 1 credit = one AI generation (one model answer to a learner request). Paid tools cost credits from their real cost.
- Balances are per person (keyed by org + email).
- The plan decides the renewal period. Early access: **50 credits per week** (renews Monday 00:00 UTC), **3 active
  boards**, **250 MB** of source storage.
- At zero credits, AI actions stop. The board and storage limits stop new boards and uploads the same way.
- Usage is stored in a database (D1), not an analytics tool. No PostHog.

## Plans (`packages/web/src/plans.js`, shared with the control plane)

| Plan | Period | Credits | Active boards | Storage | Price | Available |
|---|---|---|---|---|---|---|
| `early_access` | week (Mon 00:00 UTC) | 50 | 3 | 250 MB | free | yes, everyone's plan |
| `free` | month | 20 | 3 | 250 MB | $0 | no |
| `plus` | month | 200 | 20 | 5 GB | $19 planned | no ("Start free trial" disabled) |
| `pro` | month | 500 | 100 | 25 GB | $39 planned | no |

Each package also lists its "Learning & support" lines exactly as given by the user (Free: learn from repositories,
papers and documents; adaptive explanations; interactive learning canvases; saved notes and source citations; revisit
completed learning; self-serve help guides. Plus: everything in Free; adaptive quizzes and review; saved learning paths
and history; export your learning materials; email support. Pro: everything in Plus; larger multi-source projects; more
capacity for deep analysis; more generations running at once; priority email support). Taglines: Free "Find your first
rabbit hole.", Plus "Make curiosity a regular practice.", Pro "More room for your deepest questions."

A monthly period runs from the plan's `since` date to the same day next month. "Active boards" means projects plus
canvases the person owns that are not archived or in Trash (the packages' "active learning projects").

## What costs credits

- **One generation = 1 credit**: an Agent Bar answer, a Map answer, a Learn answer or card batch. Tool calls and model
  calls inside that answer (board plans, grading, in-answer search, transcription of the learner's voice input) are
  **helpers**: logged with their real cost, 0 credits.
- **A paid tool job** the learner starts costs `max(1, ceil(real cost / reference))` credits, with reference =
  **$0.03** (about one Opus 5 answer). A learner-started source search costs 1.
- **Failed jobs** cost 0 credits; their provider cost is still recorded.

## Real cost (`packages/control-plane/src/prices.js`; checked 2026-09-29, USD)

| Tool | Provider / model | Price | Source |
|---|---|---|---|
| Answers | Claude `claude-opus-5` | $5 in / $25 out per MTok; cache write $6.25, cache read $0.50 | platform.claude.com/docs/en/about-claude/pricing |
| Answers | Claude `claude-sonnet-5` | $2 / $10; cache write $2.50, read $0.20 | same |
| Answers | Claude `claude-haiku-4-5-20251001` | $1 / $5; cache write $1.25, read $0.10 | same |
| Board plans, artifacts | OpenAI `gpt-4.1-mini` | $0.40 in / $0.10 cached / $1.60 out per MTok | developers.openai.com/api/docs/models/gpt-4.1-mini |
| Image | OpenAI `gpt-image-1`, 1024², low | $0.011 per image (+ prompt text $5/MTok) | developers.openai.com/api/docs/models/gpt-image-1 |
| Narration | Fish Audio `s1` | $15 per 1M UTF-8 bytes | docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits |
| Transcription | OpenAI `gpt-4o-transcribe` | $2.50 / 1M audio tokens in, $10 / 1M out (~$0.006/min) | developers.openai.com/api/docs/pricing |
| Search | Exa `/search`, 8 results + summaries | $7 / 1k requests + $1 / 1k summaries (= $0.015); response carries `costDollars.total` | exa.ai/pricing |
| YouTube search | Exa `/search`, no contents | $7 / 1k requests | exa.ai/pricing |
| Grading | TypeSafe Jev | $0.042 per MTok input, output free | docs.typesafe.ai/models |
| 3D scene render | Fly shared-cpu-1x, 2 GB | $0.0000041275/s | docs.fly.io/about/pricing |
| Maths animation render | Fly shared-cpu-2x, 4 GB | $0.000008255/s | docs.fly.io/about/pricing |
| Video | fal `seedance/v1/lite` (deprecated; rerouted) | **unverified** | see below |

Rules: never guess a price. Where a provider reports its own cost (Exa `costDollars.total`, Jev via gateway), log that
with `cost_source = provider_reported`; otherwise compute from the table with `cost_source = price_table`. A tool with
no verified price is **disabled for metered users** until it has one.

Video: fal reroutes `seedance/v1/lite` text-to-video to Seedance 1.0 Pro Fast ($1 per 1M video tokens, 480p pixel size
unverified) and reference-to-video to Grok Imagine ($0.05/s at 480p + $0.002 per reference). Its price is set after one
real 2-second job (about $0.02–0.10), run only with the user's OK. Until then video is disabled for metered users.
The Fly machine sizes come from `packages/{lesson,math}-renderer/fly.dev.toml`, not the running machines.

## Data (Cloudflare D1)

v1 runs on the dev Learn database `small-learn-dev` (binding `LEARN_DB`), added to `packages/control-plane/repository-schema.sql`.
That database is shared by every dev clone, so the change is announced before it is applied. Production (`small`,
migration `0025-usage.sql`) needs the user's explicit approval.

```sql
CREATE TABLE IF NOT EXISTS user_plans (
  org TEXT NOT NULL, email TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'early_access',
  since TEXT NOT NULL DEFAULT (datetime('now')), updated_by TEXT,
  PRIMARY KEY (org, email));

CREATE TABLE IF NOT EXISTS usage_periods (
  org TEXT NOT NULL, email TEXT NOT NULL,
  period_start TEXT NOT NULL, period_end TEXT NOT NULL,
  plan TEXT NOT NULL,
  credits_limit INTEGER NOT NULL,
  credits_used INTEGER NOT NULL DEFAULT 0,      -- includes credits reserved for calls in flight
  credits_purchased INTEGER NOT NULL DEFAULT 0, -- 0 until buying is live
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org, email, period_start));

CREATE TABLE IF NOT EXISTS usage_events (
  id INTEGER PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  org TEXT NOT NULL, email TEXT NOT NULL, plan TEXT NOT NULL, period_start TEXT NOT NULL,
  resource_kind TEXT NOT NULL,      -- project | canvas | app | workspace
  resource TEXT, board TEXT,
  tool TEXT NOT NULL,               -- bar_answer | map_answer | learn_answer | board_plan | image | video | narration
                                    -- | transcription | search | youtube_search | grading | math_animation | scene_3d
  provider TEXT NOT NULL, model TEXT,
  status TEXT NOT NULL,             -- reserved | ok | failed
  input_tokens INTEGER, output_tokens INTEGER, cache_read_tokens INTEGER, cache_write_tokens INTEGER,
  units REAL, unit TEXT,            -- seconds | images | bytes | minutes | searches
  cost_usd_micros INTEGER, cost_source TEXT,
  credits INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS usage_events_person ON usage_events (org, email, at);
CREATE INDEX IF NOT EXISTS usage_events_resource ON usage_events (org, resource, at);
CREATE INDEX IF NOT EXISTS usage_events_tool ON usage_events (org, email, tool, at);

CREATE TABLE IF NOT EXISTS source_files (
  id INTEGER PRIMARY KEY, org TEXT NOT NULL, email TEXT NOT NULL,
  resource TEXT, kind TEXT NOT NULL,  -- paper | upload | notebook_file | repo_snapshot
  storage_key TEXT NOT NULL UNIQUE, bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT);
```

Credits left = `credits_limit + credits_purchased - credits_used` for the current period's row. A new period starts a
new row, so no scheduled job is needed.

## Metering (`packages/control-plane/src/meter.js`)

The one contract every metered entry point uses:

- `reserve(env, who, { requestId, resourceKind, resource, board, tool, credits })` creates the period row if missing,
  then runs `UPDATE usage_periods SET credits_used = credits_used + ? WHERE org=? AND email=? AND period_start=?
  AND credits_used + ? <= credits_limit + credits_purchased`. If no row changes, it returns
  `{ ok: false, code: 'credits_exhausted', left, renewsAt }` and the provider is never called. Otherwise it inserts the
  event with `status = 'reserved'` in the same D1 batch. A repeated `requestId` returns the existing reservation.
- `settle(env, reservation, { provider, model, tokens, units, unit, costUsdMicros, costSource })` sets the event to `ok`
  with its real cost.
- `refund(env, reservation, details)` sets the event to `failed`, credits 0, and gives the credits back.
- `helper(env, who, {...})` logs a 0-credit event with its real cost.

A refusal is HTTP 402 with `{ error, code, left, renewsAt }`.

## Limits and what the learner sees

- **Credits at zero**: "You're out of this week's credits. They renew Monday 00:00 UTC (in 2 days). See usage →"
- **A paid tool needing more than is left**: "Video needs 10 credits; you have 4 left this week."
- **An answer already streaming** finishes.
- **Low credits** (5 or fewer left): the Agent Bar and Learn composer show "4 credits left this week" under the input.
- **A 4th active board** (connect a project, a new canvas, the bar's create-canvas command): "You have 3 active boards,
  the early-access limit. Archive one to start another."
- **Storage** (a paper, file or notebook upload, or a repository import past the limit): "This would use 12 MB; you have
  8 MB left of 250 MB."

All checks run on the server, at the dev worker's own entry points, before any cost. The preview's no-live-write rule
(`previewWriteAllowed`) is unchanged: everything here writes the dev database.

## Settings → Usage

A new "Usage" section near the top of Settings, preview build only (lazy, behind the literal `VITE_COACHING_DEV` guard,
with a live-bundle marker) until production metering ships.

- **Plan**: "Early access · free" and "Everyone is on early access while we're not taking payments." An **Upgrade**
  button opens the plan comparison: the Free, Plus and Pro cards with the package details above and the current plan
  marked; every purchase button is disabled "Coming soon".
- **Credits**: "34 of 50 credits left this week" (bar), "Renews Monday 00:00 UTC · in 2 days", and **Buy credits**,
  shown and disabled "Coming soon".
- **Boards**: "2 of 3 active boards", with a link to the Library.
- **Storage**: "120 MB of 250 MB".
- Bars turn amber at 80% used and red at the limit.
- **This week**: by tool (uses · credits), by board (credits), and the last 20 events (time, board, tool, credits;
  "0 · failed" for failures). Table headers carry icons.
- Works at phone width and in dark mode.

Data: `GET /api/usage` returns `{ plan, plans, period: { start, end, limit, used, purchased }, boards: { active, limit },
storage: { bytes, limit }, byTool, byBoard, recent }` for the signed-in person.

## Ownership

- **Smart-home**: the tables, `plans.js`, `prices.js`, `meter.js`, `/api/usage`, the Settings panel and Upgrade view,
  metering the Agent Bar and Map answers (`repositories.js` ask), and the board and storage checks on project and
  canvas creation.
- **Learn owner**: wrapping Learn answers and each paid tool (video, image, narration, transcription, search, maths,
  3D) with `meter`, and recording upload sizes in `source_files`. They receive the `meter` contract as soon as it lands.

## Testing

- **Unit tests**:
  - the week boundary (Mon 00:00 UTC, just before and after);
  - monthly periods;
  - `max(1, ceil(cost / reference))`;
  - each tool's cost formula with the researched examples;
  - reserve, settle and refund against in-memory SQLite (two racing calls for the last credit; a repeated request id);
  - the board count and the storage sum;
  - the default plan.
- **Browser checks on the dev clone**:
  - the Usage panel (plan, bars, renewal line, Buy credits disabled, Upgrade opens the plans with every button
    disabled);
  - at zero, the next ask is refused with the renewal line and no model call. A dev-only `/test/usage` hook (same
    bypass secret as `/test/session`) sets a test person's credits used or plan;
  - a 4th board is refused;
  - an upload over the storage limit is refused;
  - no request reaches live storage.

## Rollout

1. Announce, then add the tables to the shared dev database.
2. Deploy to `small-cp-dev-smart-home-usage`.
3. The Usage panel, the Upgrade view and the stop messages go to Figma for the user's review.
4. Production (migration 0025 on `small`, metering live traffic) waits for the user's explicit go-ahead.

## Out of scope

- Payments (Stripe Checkout and its webhook come later, writing `credits_purchased` and `user_plans`).
- Production metering.
- PostHog or other product analytics.
- An admin dashboard.
- Hiding multi-person features (the separate solo-v1 step).
- Setting the video price (needs one approved paid test).
