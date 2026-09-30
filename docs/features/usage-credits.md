# Usage and credits (v1) — revision 2

Status: the product direction was approved (user, 2026-09-29). This revision adds the accounting and enforcement
contracts the user asked for, and it awaits review before implementation planning. Nothing here adds payments, team
billing, production changes, a paid video test or the Tutor Agent.

Branch: `feature/usage-credits` (worktree `smart-home-usage`, dev clone `small-cp-dev-smart-home-usage`). The WP7
acceptance build (tag `wp7-acceptance-build`, clone `small-cp-dev-smart-home`) stays frozen.

Facts below come from the integrated code (`feature/wp7-integration`), researched on 2026-09-29 and cited where they
drive a rule.

## 1. Product decisions (unchanged)

- Rabbit Hole isn't taking payments. Everyone is on **Early access**:
  - **50 credits per week**, renewing Monday 00:00 UTC;
  - **3 active projects and canvases**;
  - **250 MB** of source storage.
- Free, Plus and Pro are future packages. They are shown, but none can be chosen. **Buy credits** and every
  plan-purchase button are shown **disabled ("Coming soon")**, with the planned prices.
- One credit is one learner AI action (§3). Paid jobs cost their confirmed quote (§4).
- At the limit, new AI actions, projects, canvases and uploads stop. Existing material stays usable (§9).
- Metering lives in our database (D1). No analytics tool.
- v1 is solo. Hiding the multi-person features is a separate step.

| Plan | Period | Credits | Projects & canvases | Storage | Price | Available |
|---|---|---|---|---|---|---|
| `early_access` | week, Mon 00:00 UTC | 50 | 3 | 250 MB | free | yes, everyone |
| `free` | month | 20 | 3 | 250 MB | $0 | no |
| `plus` | month | 200 | 20 | 5 GB | $19 planned | no |
| `pro` | month | 500 | 100 | 25 GB | $39 planned | no |

Each package's taglines and "Learning & support" lines are shown exactly as the user supplied them.

## 2. Wallet identity and periods

- **One wallet per person across Rabbit Hole, keyed by normalised email** (trimmed, lower-cased):
  - A person can create any number of `w-*` workspaces (`cp/index.js:131-141`, server-side, no limit).
  - A home org is shared by an email domain (`orgOf`, `cp/index.js:29`).
  - So an (org, email) key would let one person multiply their allowance by creating workspaces.
  - Switching or creating a workspace never grants another 50 credits.
  - The org is recorded on events for context only.
- **Identity always comes from the authenticated server context**, via the same resolvers the endpoints use today
  (`repositoryIdentity`, `authorizedBoardApp`, `canvasAccess`). No request field names the chargeable person. Plus
  aliases are different emails, and so different wallets; each needs its own mailbox to sign in. This is accepted for v1.
- **Periods:**
  - Server time is UTC. A period includes its start and excludes its end.
  - Unused credits do not roll over.
  - Early access: each Monday 00:00 UTC to the next.
  - Monthly plans: from an anchor day to the same day next month. If a month is shorter, the day is clamped to its last
    day; the anchor itself never moves. So an anchor of Jan 31 gives Feb 28 (or 29), then Mar 31. This is a date rule
    only.
- **An action settles and refunds against the period in which it reserved.** A request reserved Sunday 23:59 and
  finished Monday touches only last week's row.

## 3. Learner actions, not provider calls

The unit of charge is a **learner action**:
- one row per thing the learner asked for;
- every provider call made for it is a **child call**, linked by `action_id`;
- the charge is counted once, on the action. Child costs are summed for reporting and never charged again.

Example:

```
Learner action: /graph sigmoid          1 credit
  artifact model call                   0 extra credits   (child call, cost recorded)
  schema repair, if needed              0 extra credits   (child call, cost recorded)
  local graph rendering                 0 credits         (no provider call)
```

**The server decides everything.**
- The dev worker maps each endpoint (and its authenticated context) to an action type, a credit amount and its
  authorised child calls.
- The browser never supplies a tool name, a credit amount, a price or the parent of a child call.
- A child call can only run under an action the server created and still holds as running. Otherwise it is refused.

### Charging matrix

| What the learner does | Credits |
|---|---|
| A new AI answer: Agent Bar, Map, Learn chat | 1 |
| Explain on canvas: one board, ≤ 8 blocks; its up-to-3 continuation requests are the same action | 1 |
| A `/` artifact: exactly one block | 1 |
| Lesson generation: ≤ 6 pages × ≤ 3 blocks; a course draft (2 model calls) | 1 |
| Internal planning, research, tool calls, schema repair, a continuation request, an automatic retry | 0, as child calls of the parent |
| Explicitly asking again or regenerating | a new action: 1 |
| The model replies with a clarifying question instead of an output | 0: the action ends as `clarification` and its reservation is released. The learner's reply is a new action (1) |
| Submitting a Challenge answer (the AI verdict) | 1. Its Jev shadow grade is a 0-credit child call. Resubmitting the same `attempt_id` returns the same action, with no second charge |
| Voice transcription before Send | 0. See the admission rule below |
| Standalone source search (search bar, `/paper <topic>`, `/research` handoff) | 1 when it calls Exa, 0 when served from the 1-hour cache. The UI says "up to 1 credit" |
| Starting a paid job | its confirmed quote (§4) |
| Preparing a paid proposal the learner then cancels | 0. The preparation call is recorded as a child call of the cancelled action |
| Opening saved cards, replaying animations, local graph edits, notebooks, navigation and filter commands, Keep on a video moment | 0 |
| Refused before any model runs: invalid, unavailable (`ready:false` primitives), out of credits, over a limit | 0 |

**Admission rules for actions with no paid parent:**
- **Voice transcription** (Challenge and Explain-back cards, when recording stops) is its own 0-credit action. It is
  admitted only when the person has at least 1 credit available, because the answer it feeds will need one.
  - Audio is capped at 60 s, enforced on the server by duration and by a 1 MB size cap. Today there is only a 20 MB
    cap and no duration check.
  - At most 30 transcriptions per person per day. Its cost is recorded.
- **Jev grading** runs only as a child of a Challenge action, with the same `attempt_id`. A grade request without a
  running parent action is refused.
- **Keep on a video moment** runs one Workers AI embedding. It is recorded as a 0-credit system action and needs no
  balance.

**Card-batch maximums** (so that one action can't mean an unlimited amount of generation):
- board: 8 blocks, with the existing per-kind caps;
- artifact: 1 block;
- lesson: 6 pages × 3 blocks;
- flashcards: 12 per block.

**Child calls are bounded by their parent.** One credit authorises at most:

| Parent | Bound |
|---|---|
| Learn or Map answer | ≤ 9 model calls × 2,400 max tokens; ≤ 2 arXiv reads; ≤ 3 Wikipedia reads; ≤ **1** video-moment search per answer (a new cap; uncapped today) |
| Explain on canvas | ≤ 15 model calls (plan, drafts, reviews, revision, one format repair) across ≤ 3 continuation requests |
| Artifact | ≤ 2 model calls (call plus one repair) |
| Every model call | a 120 s timeout (the Anthropic fetch has none today) |
| Every action | a 5-minute wall clock |
| Per person | ≤ 2 actions running at once |

Once an action has reserved its credit, its children finish within these bounds, even if that was the last credit.
The balance is not re-checked before each child.

## 4. Paid jobs: quote → confirm → reserve → run → settle

**Lifecycle:**
1. **Prepare and quote.**
   - The learner's request resolves the exact job configuration: tool, provider, resolved model, duration, resolution,
     quality, the content hashes of any input or reference assets, and the pricing version.
   - Any model call that prepares the proposal is a child call of this action. It is included in the job and never
     billed separately.
   - The server computes a **quote**: a fixed credit amount, or a bounded maximum, `max(1, ceil(max_cost_usd / 0.03))`.
   - The quote is stored with a fingerprint of that configuration and a 10-minute expiry.
2. **Show and confirm.**
   - The confirmation shows the credit amount, for example "Uses up to 3 credits".
   - Confirming sends the quote id. Changing any bound parameter makes a new quote, and the old one can't be used.
3. **Reserve.** The quote's credits are reserved atomically (§5). If there isn't enough, the job doesn't start.
4. **Run.** The job starts only after the reservation succeeds.
5. **Settle.**
   - Final charge = `min(quoted, max(1, ceil(final_eligible_cost / 0.03)))`. Whatever is left of the reservation is
     released. The learner is never charged more than the confirmed quote.
   - Example: 3 reserved; final cost $0.045; charge ceil(0.045/0.03) = 2; 1 released.

The $0.03 figure is a chosen conversion reference, not a claim about what any answer costs.

**If a tool's cost can't be bounded before it runs, the tool stays unavailable for metered use.**

| Tool | Quote | Status |
|---|---|---|
| Image, `gpt-image-1` 1024² low | fixed: $0.011 plus prompt input (≤ 1000 chars) = 1 credit | available |
| Narration, Fish Audio `s1` | exact from the text's UTF-8 bytes (≤ 4000 chars, ≤ $0.06) = 1–2 credits | available once the narration primitive ships (`ready:false` today) |
| Maths animation, 3D scene | bounded: the authoring model calls' max tokens plus the render time-out × the machine rate, labelled **estimated** | available only after the deployed machine sizes are verified (§7) |
| Video | not boundable yet (§8) | **disabled** |

- **Proposal preparation today:** the artifact call returns `paid_proposal` before any confirmation
  (`cp/learn-artifact.js:72`), and the confirm dialog shows no amount. The new flow replaces that with the quote above.
- **No automatic resubmission of a paid job.** The 3D scene worker's automatic resubmit on a 404
  (`cp/learn-scene.js:92`) must stop for metered jobs.

## 5. Reservation, idempotency, retries, refunds and interrupted jobs

**Invariants** (each has a test in §11):

1. **All or nothing.**
   - A reservation is either fully accepted (action row plus the period's reserved credits) or fully refused (no
     change at all).
   - The claim and the action insert are made in one D1 batch, where the insert depends on the claim having changed a
     row. The implementation must prove with a D1 test that a refused claim leaves no action row.
   - No provider starts unless the server holds a funded action in `reserved` or `running`.
2. **Idempotency.**
   - A `request_id` is bound to the authenticated person and a fingerprint of the request.
   - The same id and fingerprint returns the existing action and its result, and never launches the provider again.
   - The same id with a different fingerprint fails with 409.
3. **Repeatable settle and refund.**
   - Each is a guarded state transition (`running → settled`, `running|reserved → released`), so a repeat or a
     duplicate callback changes nothing.
   - `charged + released = reserved`, always.
   - A refund can't raise the balance above the period's allowance plus purchases.
4. **Unknown outcomes.**
   - A timeout after a provider submission is not a failure. The action becomes `unknown`: credits stay reserved, and
     the stored provider job id is used to reconcile.
   - Video and scene jobs already keep a provider ticket in their Durable Object.
   - A running action is never refunded and resubmitted automatically.
5. **Abandoned reservations.**
   - A `reserved` action whose provider call never started expires after 10 minutes and is released.
   - A `running` action with no provider job id (streamed answers, synchronous image or narration) that hasn't
     settled after 15 minutes ends as `unknown_released`: its credits are released, its cost stays unknown, and it is
     flagged.
   - An async paid job with a job id is reconciled against the provider. It is released only once the provider
     confirms failure, or after 24 hours unresolved, when it is flagged for review.
   - Expiry never touches a job the provider can still complete.
   - Reconciliation runs when usage is read and before a new reservation for that person (no cron).
6. **Cancelling is not failing.**
   - A browser disconnect changes nothing: the server keeps running and settles. Streams must settle through
     `ctx.waitUntil`, which they don't today (`cp/ask.js:364`, `cp/learn-board.js:344`).
   - An explicit **Stop** of an answer after the model has started is charged its 1 credit, because the work ran.
   - Cancelling a paid job before submission releases it. After submission it is charged, unless the provider confirms
     the cancel before billing.
   - A **service failure** (a provider error, or our own error) costs 0 credits, as approved, and its cost is still
     recorded.

**States:**
- actions: `quoted`, `reserved`, `running`, `settled`, `released`, `cancelled`, `clarification`, `unknown`,
  `unknown_released`, `expired`;
- child calls: `ok`, `error`, `unknown`.

### Tables (D1 `small-learn-dev`, added to `repository-schema.sql`; production numbering waits for approval)

```sql
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
                                                 -- | lesson | challenge_verdict | voice_input | source_search | paid_job | system
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
  units TEXT,                                    -- JSON, named units (input_tokens, output_tokens, cache_write_5m, …)
  pricing_version TEXT, cost_nanousd INTEGER,    -- NULL when unknown
  cost_source TEXT, cost_status TEXT NOT NULL,   -- final | estimated | unknown
  status TEXT NOT NULL);                         -- ok | error | unknown
CREATE INDEX IF NOT EXISTS usage_calls_action ON usage_calls (action_id);

CREATE TABLE IF NOT EXISTS usage_storage (       -- one row per person
  email TEXT PRIMARY KEY, bytes_used INTEGER NOT NULL DEFAULT 0, bytes_reserved INTEGER NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS source_files (        -- the storage ledger
  id INTEGER PRIMARY KEY, email TEXT NOT NULL, org TEXT, resource TEXT,
  kind TEXT NOT NULL,                            -- paper | image | board_file | board_json | fork_copy
  storage_key TEXT NOT NULL UNIQUE, bytes INTEGER NOT NULL,
  status TEXT NOT NULL,                          -- reserved | stored | failed | deleted
  created_at TEXT NOT NULL, deleted_at TEXT);
```

Totals come from these rows. Credits are summed once per action, never from child calls. Cost is summed from child
calls only.

## 6. Active projects and canvases

**Counted: each distinct catalog resource the person owns, once.** In Settings this reads "Active projects and
canvases".

| Resource | Counts |
|---|---|
| One connected project (`repository_apps` row, any status: queued, ready or failed) | 1 |
| That project's built-in Learn canvas (it is the project itself; no canvas row) | 0 |
| A canvas created inside that project (`canvases` row with `project`) | 1 |
| A standalone canvas | 1 |
| A fork of a shared board (`cp/learn-boards.js:156` inserts a canvas row) | 1 |
| A duplicate | 0: no canvas duplicate exists |
| An archived canvas or project | 0, until restored |

- **The count uses server catalog rows** (`repository_apps.owner_email` and `canvases.owner_email`, across all orgs),
  never `learn_boards`. Boards that exist only in a browser have a catalog row whenever they're a canvas, because
  creating a canvas always writes one.
- **Enforced inside the single write statement**, with a conditional insert or update against the count. That covers:
  - project connect (`POST /api/repositories`);
  - canvas create (`POST /api/canvases`; every UI path goes through `commands.js`);
  - fork (`learn-boards.js`);
  - canvas restore (`POST …/restore`);
  - project restore (new).
  - Today the project cap is a separate COUNT then INSERT, 25 per org (`cp/repositories.js:125-127`), and it becomes
    per person.
- **"Archive one to start another" has to be true for every counted type.**
  - Projects can't be archived today (DELETE returns 405, `cp/repositories.js:135`; the Library menu has no archive).
  - v1 adds **project archive and restore**: an owner-only `archived_at` column, the Library menu item, and exclusion
    from the Library and the count.
- **Accounts already over the limit** keep everything. Reading, editing and archiving all still work. Creating and
  restoring are refused until the count is below the limit. Nothing is deleted or locked.

## 7. Source storage (250 MB)

**Counted: server-stored source files attributed to the person, as physical bytes.**
- uploaded papers (`learn-papers/…`, `cp/learn-paper.js:50`);
- uploaded images (`learn-media/…`, `cp/learn-media.js:53`);
- shared-board files, including notebook snapshots and board images (`learn-boards/<id>/…`, `cp/learn-boards.js:35`);
- the board JSON in `learn_boards.state_json`;
- fork copies.

**Not counted, and never labelled as source:**
- anything browser-only: notebook workspaces in JupyterLite storage, generated images, GIFs and clips until the board
  is shared;
- generated outputs: video, 3D, maths animations and narration audio;
- repository snapshots and their retained versions, which are indexes of public repositories and capped separately;
- ask attachments, which are single-use inputs with no owner recorded today (`cp/index.js:950`);
- legacy dev objects in the live `small-runs` bucket.

**Rules:**
- **Every stored copy counts.** A file stored once on a board counts once, however many cards reference it. Sharing a
  board stores a second copy, and a fork a third; each counts.
- **Archiving a canvas or project does not free bytes.** Canvases and projects have no Trash.
- **Freeing space is required before storage is enforced:**
  - Settings → Usage gets a "Stored files" list, largest first, where uploaded papers and images can be deleted. Each
    delete removes the R2 object and its ledger row exactly once.
  - Shared boards get "Stop sharing and delete cloud copy", which removes that board's stored files and JSON.
  - Until both exist, the storage bar is shown but not enforced.
- **Units are decimal:** 1 MB = 1,000,000 bytes and 1 GB = 1,000,000,000 bytes, matching the package copy. Values show
  with one decimal: "120.4 MB of 250 MB".
- **Concurrent uploads.** Each person has a storage row (`bytes_used`, `bytes_reserved`).
  1. The server measures the actual bytes it received; every writer already does (`arrayBuffer` / `byteLength`), and
     client sizes are never trusted.
  2. It reserves those bytes atomically against the limit, then writes to R2.
  3. It commits the ledger row and moves the bytes from reserved to used, in one batch.
  4. If R2 fails, the reservation is released.
  5. If R2 succeeds but the commit fails, the object is orphaned: a reservation older than 15 minutes with no ledger
     row is released, and a read-only reconcile script reports the orphan objects.
  6. An overwrite of the same key (a notebook snapshot) commits only the size difference.
- **Inventory before rollout, dev only and read-only:**
  - D1 reads of `learn_boards`, `canvases` and `repository_versions`;
  - an S3-API object listing of `small-learn-media-dev`, using a read-only R2 token.
  - The dev buckets held 29 objects (2.14 MB) and 2 objects (90.8 kB) on 2026-09-29.
  - Attributable objects are seeded into the ledger, so the counter doesn't start at zero.
  - No production bucket scan, copy or delete.

## 8. Costs: rates, calculations and what was actually billed

**Each child call records:**
- the provider and **transport** (`anthropic_api`, `claude_subscription_bridge`, `openai_api`, `fal_queue`,
  `fish_api`, `exa_api`, `typesafe_api`, `workers_ai`, `fly_worker`);
- the **requested model** and the **resolved model** from the provider's response, never the picker label. A Learn ask
  uses the server-side fallback, so the answering model can differ (`cp/ask.js:308-319`);
- the service tier where one exists;
- usage units with their meaning: input, output, cache-read, and cache-write tokens split by 5-minute and 1-hour TTL;
  images; UTF-8 bytes; audio seconds; searches and summarised pages; video tokens or seconds; compute seconds;
- `pricing_version` (`prices.js`, first version 2026-09-29);
- `cost_source`: `provider_reported`, `price_table` or `estimate`;
- `cost_status`: `final`, `estimated` or `unknown`.

**Rules:**
- **Missing usage is NULL, never 0.** Zero means a known zero.
- **Money is stored as integer nano-dollars.** Credits are computed from the exact sums, so rounding tiny child costs
  (a Jev grade is about $0.0000126) can't move a job across a credit threshold.
- **Caching.** No `cache_control` is used anywhere today. If it's added, cache-write tokens are priced by their TTL
  ($6.25 per MTok for 5 minutes vs $10 per MTok for 1 hour on Opus 5).
- **Board plans and artifacts** use `gpt-4.1-mini` only when an OpenAI key is bound, and Anthropic otherwise
  (`cp/ask.js:259-275`). Metering records whichever actually ran.
- **Images.** If the response reports image token usage, cost comes from those tokens. Otherwise it's the published
  per-image price. Never both for the same output.
- **Exa.** Record the response's `costDollars.total` (`provider_reported`). The $0.015 figure applies only to the code's
  Auto search with 8 summaries; Instant and Deep search are priced differently.
- **Fly rendering.** Cost is estimated as runtime × the rate for the machine's configured size, labelled `estimate`.
  The deployed sizes must be read from the running machines before these tools go live; today's figures come from
  `fly.dev.toml`. Fly bills provisioned time, so the estimate leaves out idle time and storage.
- **Subscription bridge.** Its calls are recorded at list price with `transport = claude_subscription_bridge`, so they
  can be told apart from API-billed cost.
- **Prices**, checked 2026-09-29:

  | Provider | Price |
  |---|---|
  | Claude Opus 5 | $5 / $25 per MTok |
  | Claude Sonnet 5 | $2 / $10 |
  | Claude Haiku 4.5 | $1 / $5 |
  | `gpt-4.1-mini` | $0.40 / $0.10 cached / $1.60 |
  | `gpt-image-1` low 1024² | $0.011 per image |
  | Fish `s1` | $15 per 1M UTF-8 bytes |
  | `gpt-4o-transcribe` | $2.50 / $10 per MTok of audio |
  | Exa | $7 per 1k requests + $1 per 1k summaries |
  | TypeSafe Jev 1.13 | $0.042 per MTok input |
  | Fly shared-cpu-1x 2 GB | $0.0000041275/s |
  | Fly shared-cpu-2x 4 GB | $0.000008255/s |

  Sources are the providers' official pricing pages, as listed in revision 1.

## 9. With zero credits

Still allowed:
- reading saved material;
- replaying existing animations;
- editing notes;
- manipulating local graphs;
- running browser-local notebook code;
- existing exports;
- archiving and restoring within the limits;
- deleting stored files;
- viewing Usage.

Refused, with the renewal line, before any provider call: new AI actions, source search, transcription and paid jobs.

## 10. Settings → Usage

Shown on the preview build only, until production metering ships. It is lazy-loaded behind the literal preview guard,
with a live-bundle marker.

**Current plan.** An **Early access** card sits on its own: "Early access · free", "Everyone is on early access while
we're not taking payments." **Upgrade** opens the Free, Plus and Pro comparison, which shows planned prices. None of them
is marked as current, and every purchase button is disabled "Coming soon".

**Credits.**
- Bar text: "50 weekly credits · 12 used · 2 processing · 36 available". Reservations in flight are never shown as
  charges.
- Beside the bar: "A new AI answer or card-generation request uses 1 credit. Some generation tools use more; you'll
  see the amount before starting. Internal steps don't use extra credits."
- The renewal line is computed ("Renews Mon 6 Oct, 00:00 UTC · in 3 days"). Monday 00:00 UTC stays authoritative.
- **Buy credits** is shown and disabled "Coming soon".

**Active projects and canvases:** "2 of 3", with a link to archive in the Library. **Storage:** "120.4 MB of 250 MB",
with the Stored files list (§7).

**State in words, not colour alone:** "Nearly used up" at 80% or more, "Limit reached" at 100%, as well as amber and red.

**This week:**
- learner-level activity, one row per action (time, where, what, credits); an action with six internal steps shows as
  one row, and expanding it shows its child calls and their cost;
- by tool;
- by project or canvas.

Headers carry icons. It works at phone width and in dark mode.

**Data:** `GET /api/usage`, for the signed-in person only. It returns `plan`, `plans`, `period`
`{start, end, limit, purchased, used, processing, available}`, `resources {active, limit}`,
`storage {bytes_used, bytes_reserved, limit, files[]}`, `actions` (recent, learner-level) and `byTool`, `byResource`.
It never takes a person, a tool or an amount as a parameter.

## 11. Tests

**Unit tests** on in-memory SQLite, **plus the same transaction tests run against local D1** (the Workers runtime),
using fake providers only.

| Test | Required outcome |
|---|---|
| Two requests race for the last credit | exactly one admitted |
| The same request arrives twice | one charge, one provider execution |
| Same `request_id`, different parameters | 409; no reservation reused |
| Duplicate settle or refund | no second balance change |
| A paid job finishes below its reservation | the unused credits are released |
| A request crosses the Monday renewal | settles or refunds in its original period |
| The worker dies after reserving, or after submitting | a recoverable state; no blind duplicate job |
| A refused claim | leaves no action row (proved on local D1) |
| Two creates race for the third slot | the limit holds |
| Two uploads race for the remaining bytes | the storage limit holds |
| The metering database is unavailable | new model or paid work fails closed with a useful error |
| A child call without an authorising running parent | refused |
| Zero credits | saved and local learning still works |
| A forged identity, tool, credit amount or usage query | can't affect another person or skip a charge |
| The period boundaries | Monday before and after; the Jan 31 → Feb → Mar anchor |
| The quote fingerprint | any changed parameter invalidates the quote |
| The clarification outcome | the reservation is released |

**Browser checks run on the usage clone**:
- **Usage panel:** the Early access card; Upgrade opens with every button disabled; Buy credits is disabled; the
  processing and available split; the computed renewal; the states in words.
- **Refusals:** an ask refused at zero; a 4th project or canvas refused; an over-limit upload refused.
- **No live writes:** no request reaches live storage. Checks that press write controls abort every non-GET request
  themselves.

**`/test/usage`:**
- exists in the dev worker only, never in the control plane's production code;
- requires the test bypass secret;
- is restricted to designated test emails (an allowlist variable);
- sets only those accounts' usage or plan;
- never touches a real user's balance.

## 12. Ownership

The rule is **one logical-action wrapper and one provider-cost logging path**. Wrappers are never stacked at several
layers.
- **The action wrapper** lives at the dev worker's entry points. It resolves the action type, admits, reserves, runs,
  and settles through `ctx.waitUntil`.
- **Child-call logging** happens in the provider transports themselves: the Anthropic, OpenAI, subscription-bridge,
  Exa, fal, Fish, Jev, Workers AI and Fly calls. Each uses the action context the wrapper passes down.

**Smart-home:**
- the tables and `plans.js`, `prices.js`, `meter.js`;
- `/api/usage`, the Settings panel, the Upgrade view and the Stored files list;
- the dev-worker action wrapper and its routing table;
- the Anthropic and OpenAI transports in `ask.js` and the subscription bridge;
- Map and Agent Bar answers;
- the project, canvas, fork and restore limit statements;
- project archive and restore.

**Learn owner:**
- Learn answer, board, artifact and course flows passing the action context;
- the one-video-search cap and the 120 s call time-outs;
- idempotent Challenge verdicts by `attempt_id`;
- transcription limits;
- the paid quote and confirm UI and the quote parameters;
- scene worker no-resubmit;
- the Exa, fal, Fish, image, transcription and Jev transports;
- storage writers committing through the storage ledger;
- "Stop sharing and delete cloud copy".

The contract (`meter.js`) lands first, then goes to the Learn owner.

## 13. Rollout

1. Announce before applying the schema to the shared dev database `small-learn-dev`.
2. Run the storage inventory and seed the ledger, read-only against dev only.
3. Deploy to `small-cp-dev-smart-home-usage`.
4. The Usage panel, Upgrade view, quote confirm and stop messages go to Figma for the user's review.
5. Production migration numbering and deployment wait for a separate production approval.

## 14. Out of scope, and separate findings

**Out of scope:**
- payments and Stripe;
- team billing;
- production metering;
- the Tutor Agent;
- analytics tools;
- an admin dashboard;
- hiding multi-person features (a separate step);
- the paid video test.

**Video stays disabled.**
- The old `seedance/v1/lite` endpoints reroute: text-to-video to Seedance 1.0 Pro Fast, reference-to-video to Grok
  Imagine.
- A price test verifies only the exact endpoint, resolved model, duration, resolution and reference configuration it
  ran.
- Before asking to approve one, we report the exact request, confirm from the new endpoint's schema that the duration
  is accepted, and state the maximum spend.
- One receipt never enables other configurations, and metering never switches models.

**Separate finding: privacy, pre-existing, not part of this spec.**
- Every Gmail user's home org is `gmail-com`, and the dev Library lists every `repository_apps` row in the org, not
  just the viewer's (`dev-worker.js:43`; `cp/repositories.js:37,45,133`).
- So Gmail users can see and open each other's connected projects.
- This needs its own fix and its own approval. It meets the WP reopen criterion for privacy.

**Documentation fixes found along the way:**
- `docs/features/canvas-sharing.md:53` still says board files go to `small-runs`.
- `wrangler.parallel.jsonc` has no REPOSITORY_SNAPSHOTS binding.
