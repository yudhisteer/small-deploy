# Rabbit Hole CLI: production infrastructure handoff

Status 2026-10-03, branch `feature/rabbit-hole-cli-migration` (from `main` e9d6dbe7). Nothing here is
published, deployed or created. Line numbers are `packages/control-plane/src/index.js` on this branch
unless another file is named.

The CLI is `@rabbit-hole/cli` (binary `rabbit-hole`, config `rabbit-hole.toml`). Its default API is the
bare origin `https://digrabbithole.com`; it appends `/api` itself (`packages/cli/lib/api.js`).
`RABBIT_HOLE_API` (legacy `SMALL_API`) selects another installation. Nothing falls back to localhost or a
`small-*` host.

**Release gate.** Do not publish until production answers `deploy`, `run`, `runs`, `logs` and `schedule`
end to end, or until the published README says those commands are unavailable there. The legacy
`small-cp` keeps serving installed `small-deploy` CLIs.

## How a CLI request reaches production

`https://digrabbithole.com` is `rabbit-hole-app` (`packages/web/wrangler.rabbit-hole-prod.jsonc`, custom
domain). `app-worker.js` hands every request to `dev-worker.js` with `ownControlPlane(env)`, which forwards
`/api/*` to `rabbit-hole-cp` through the `CONTROL_PLANE` service binding. There are two exceptions:

- `/a` and `/a/*` (the hosted-app proxy) get a plain-text 404 (`app-worker.js:17`).
- `GET /api/apps` is answered by `dev-worker.js:89-94` itself. It returns canvases and repositories, never hosted apps.

Read-only probe on 2026-10-03, without credentials:

- `GET /api/auth/config` returned `401 {"error":"run small login first"}`. That is the control plane's string (2361), so `rabbit-hole login` takes the hosted email-code path.
- `GET /api/apps` returned `401 {"error":"Sign in to this workspace first"}` (`dev-forwarding.js:52`).

Secrets and D1 migration state were not checked (no wrangler access in this task).
`rabbit-hole-production.md` still marks the production bootstrap "NOT RUN".

CLI auth is `cliAuth` (58-64): an HMAC token with `t:'cli'`, signed with `MASTER_KEY` (`token.js`). It never
expires. The 401 string `run small login first` (2361) must stay, because installed `small` CLIs match it
(`packages/cli/lib/cognito.js`). The new CLI accepts that string and `run rabbit-hole login first`.

## Per command

### login
- **Routes:**
  - `POST /api/cli/login` (2342), handled by `apiLogin` (183).
  - `POST /api/cli/verify` (2343), handled by `apiVerify` (217).
  - `GET /api/auth/config` has no route; it falls to the 401 at 2361.
- **Storage:** D1 `cli_login_challenges` (`migrations/0025-cli-login-challenges.sql`).
- **Secrets and vars:**
  - `MASTER_KEY`.
  - `RESEND_API_KEY`, with `EMAIL_FROM` (`sendEmail`, 42). The subject is now "Rabbit Hole CLI login code".
  - Without email delivery the route returns 503 (214).
- **Fly / runs / queue / Slack:** none.
- **Production has it:** yes, in config. The `rabbit-hole-cp` config declares `EMAIL_FROM`; `MASTER_KEY` and `RESEND_API_KEY` appear in its secrets comment.
- **New resource:** none.

### deploy
- **Routes:**
  - `POST /api/deploy` (2371), handled by `apiDeploy` (253).
  - `POST /api/review/run` (2459), handled at 393.
  - `POST /api/image` (2392, jobs), handled at 1970.
  - `POST /api/runbook` (2458, used by `init`), handled at 452.
- **Storage:**
  - D1 `apps` (`bootstrap.sql`) and `deploys` (`0003-provenance.sql`).
  - R2 `RUNS`, optional. It stores the review bundle at `bundles/<app>/<deploy>`.
- **Fly (required):**
  - `FLY_API_TOKEN` (mints the per-app deploy token) and `FLY_ORG_TOKEN` (app and machine operations).
  - `FLY_ORG_SLUG`, `FLY_ORG_ID`, and `FLY_VOLUME_REGION` (only for `[storage]`).
  - `fly.js` covers `ensureFlyApp`, `ensureVolume` and `deployTokenFor`.
  - The CLI then runs `flyctl deploy` with the minted token, or `flyctl deploy --build-only --push` to `registry.fly.io` for jobs.
- **Model:** `ANTHROPIC_API_KEY` for review and runbook. Production has it.
- **Optional `[aws]` role apps:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_PRINCIPAL_ARN`. Without them, 503 at 271.
- **Slack:** none.
- **Production has it:** no.
  - There is no Fly token and no `RUNS`.
  - The 503 guard now runs before any D1 write (295). Before this branch, a production deploy wrote an `apps` row, then failed (`test/cli-rename.test.js`).
  - Server apps also need a URL. The deploy response points at `${BASE_URL}/a/<org>/<app>/`, which production blocks.
- **New resources needed:**
  1. Fly tokens for the existing Rabbit Hole Fly org `rabbit-hole`: `FLY_API_TOKEN`, `FLY_ORG_TOKEN`, `FLY_ORG_SLUG=rabbit-hole`, `FLY_ORG_ID`.
  2. R2 bucket `rabbit-hole-prod-runs` bound as `RUNS` on `rabbit-hole-cp`.
  3. Jobs need nothing more. Server apps need a hosted-apps origin on a separate site, never `*.digrabbithole.com` (`rabbit-hole-production.md`, "Untrusted content"). Example: a `rabbit-hole-apps` Worker on `*.workers.dev` running `proxyApp` (2287), plus a change to `BASE_URL` / the deploy response URL.

### run
- **Routes:**
  - `POST /api/runs` (2393), handled by `apiRunStart` (2028), which calls `startRun` (1983).
  - `GET /api/runs/:id` (2397), handled at 2195.
  - `GET /api/runs/:id/outputs` (2399), handled at 2068.
  - `GET /api/runs/:id/outputs/:name` (2401), handled at 2077.
  - `GET /api/apps/:name` (2416), handled at 589.
  - Runner callbacks:
    - `POST /api/runs/:id/log` (2347), handled at 2232.
    - `GET /api/runs/:id/inputs/:name` (2349).
    - `POST /api/runs/:id/outputs/:name` (2351), handled at 2121.
- **Storage:**
  - D1 `runs` and `run_logs` (`0001-jobs.sql`, `0023-run-log-ts.sql`).
  - R2 `RUNS` holds `runs/<id>/inputs/*` and `runs/<id>/outputs/*`:
    - multipart file inputs get 503 without it (2039);
    - the output upload gets 503 (2123);
    - the output list returns `[]` (2071).
- **Fly:** `FLY_ORG_TOKEN` or `FLY_API_TOKEN` starts one machine per run; 503 without either (2049). The machine calls back to `BASE_URL` with a `MASTER_KEY`-signed run token.
- **Slack:** notification only. `notifySlackRun` runs in `waitUntil`; it returns early without a Slack install row and reads no `SLACK_*` env.
- **Production has it:** D1 and `MASTER_KEY` only.
- **New resources needed:** the Fly tokens and `rabbit-hole-prod-runs` from deploy.

### runs
- **Route:** `GET /api/runs?app=` (2394), handled at 2183.
- **Storage:** D1 `runs` only; it sweeps stale runs first.
- **Fly / R2 / Slack:** none.
- **Production has it:** yes, once migrations are applied. It returns empty until runs exist.
- **New resource:** none.

### logs
- **Routes:**
  - `GET /api/request-logs` (2456), handled at 1928. Reads D1 `request_logs` (`0002-request-logs.sql`).
  - `GET /api/logs` (2455, `--machine`), handled at 1898. 503 without `FLY_API_TOKEN` (1903).
  - A run ID reads `GET /api/runs/:id`.
  - Request-log ingest is the guard's `POST /api/apps/:name/request-log` (2353), handled at 1912. It authenticates with the app's proxy secret.
- **Production has it:** D1 reads only. Request logs need deployed server apps, and `--machine` needs Fly.
- **New resources needed:** the Fly tokens and the hosted-apps origin from deploy.

### schedule
- **Routes:**
  - `POST /api/schedule` (2402), handled at 2136. Uses D1 columns `apps.schedule`, `schedule_paused` and `last_scheduled_at` (`0002-cron.sql`).
  - Firing happens in `scheduled()` (2505): the every-minute tick runs `startRun` for due jobs.
- **Production has it:** saving yes; firing no. `rabbit-hole-cp` has no `triggers` (its config comment says so); legacy `small-cp` has `* * * * *`.
- **New resources needed:** a cron trigger `* * * * *` on `rabbit-hole-cp`, plus the Fly tokens and `RUNS` from run. Cron delivery was unreliable on Cloudflare in 2026-09 (an open platform issue); verify a tick before relying on it.

### list (brief)
- **Route:** `GET /api/apps`. In production it is answered by `dev-worker.js:89-94` (canvases and repositories, signed in through `CONTROL_PLANE` `/api/me`). The control-plane `apiApps` (2406, handled at 493) is never reached.
- **Production has it:** yes. It lists Learn items.
- **New need:** when hosted apps ship, merge the control-plane apps into that response (code change, `dev-worker.js`).

### watch (brief)
- **Route:** `GET /api/watch` (2382), handled at 1278. Reads D1 `observations` (`0015-watch.sql`).
- **Producers:**
  - The nightly pass `runWatchPass` (`watch.js:224`) runs from the `0 3 * * *` cron.
  - The weekly email runs from `0 8 * * 1` and needs Resend.
  - Slack is notification only.
- **Production has it:** reads yes; it stays empty because there are no crons.
- **New resources needed:** the `0 3 * * *` cron (it also purges request logs and the Trash, and Trash purge deletes Fly apps). The `0 8 * * 1` cron is needed only if the weekly email stays.

## Summary

| Command | Server route | Needs | Production today | New rabbit-hole resource |
|---|---|---|---|---|
| login | `/api/cli/login`, `/api/cli/verify` | D1, `MASTER_KEY`, Resend | Yes | None |
| deploy | `/api/deploy`, `/api/image`, `/api/review/run` | Fly, D1, optional `RUNS`, Anthropic | No (503 before writes) | Fly tokens (org `rabbit-hole`), `rabbit-hole-prod-runs`, a hosted-apps site for servers |
| run | `/api/runs` (+ runner callbacks) | Fly, D1, `RUNS` | No (503) | Fly tokens, `rabbit-hole-prod-runs` |
| runs | `GET /api/runs` | D1 | Yes (empty) | None |
| logs | `/api/request-logs`, `/api/logs`, `/api/runs/:id` | D1; Fly for `--machine` | Reads only | Fly tokens, hosted-apps site |
| schedule | `/api/schedule` + `scheduled()` | D1, cron, Fly, `RUNS` | Saves, never fires | Cron `* * * * *` on `rabbit-hole-cp` |
| list | `GET /api/apps` (app worker) | D1 | Yes (Learn items) | Merge hosted apps when they ship |
| watch | `/api/watch` + nightly pass | D1, cron | Reads (empty) | Cron `0 3 * * *` |

**What the legacy setup has that Rabbit Hole does not need:**

- Slack (`/slack/*`, `SLACK_*`): no CLI command depends on it.
- The same-origin `/a/*` proxy on the main domain: forbidden by the production security model.
- The weekly Watch email cron.
- `AWS_PRINCIPAL_ARN` and AWS keys: needed only if hosted apps keep `[aws]` roles.
- Fly volumes: needed only if `[storage]` stays.
- The `small-runs` bucket: its old data stays with `small-cp`.

Fly app names are still created as `small-<app>-<hex>` (306, 553), and deploy tokens are named `small-<fly app>` (`fly.js:125`). Rename the prefix before production creates any.

## Legacy retirement

| Legacy | Kept as | Retire when |
|---|---|---|
| `small` binary | Deprecation shim in `@rabbit-hole/cli` (`bin/small.js`); prints a notice and forwards | First `@rabbit-hole/cli` minor release at least 90 days after its first publish, and only after the notice has shipped in every release in between. |
| `small-deploy` npm package | Untouched (0.0.14, default `small-cp`) | At the same point: `npm deprecate small-deploy "renamed to @rabbit-hole/cli"`. Never unpublish. |
| `small-skill` npm package | Untouched | With `small-deploy`. |
| `small.toml` | Loads with a migrate notice; `rabbit-hole init --migrate` copies it | Never silently. Remove read support only in a major release, after the notice has shipped for the same 90 days. |
| `~/.small/config.json`, `SMALL_API`, `SMALL_TOKEN`, `SMALL_WORKSPACE` | Read-only fallbacks; `RABBIT_HOLE_*` wins | Same major release as `small.toml`. |
| `run small login first` (401), `X-Small-Workspace`, `files['small.toml']` on the server | Kept for installed CLIs | When `small-cp` is retired and no `small-deploy` CLI can reach a Rabbit Hole server. |
| Runtime env (`SMALL_INPUT_*`, `SMALL_DATA`, `SMALL_OUTPUTS`, `SMALL_CP_URL`, `SMALL_LOG_URL`, `SMALL_PROXY_SECRET`) | Unchanged app contract | Not part of this rename. |

The npm `small` bin collides with `small-deploy`'s: `npm i -g @rabbit-hole/cli` fails with `EEXIST` while
`small-deploy` is installed (verified with npm 11.17). The upgrade line is
`npm rm -g small-deploy && npm i -g @rabbit-hole/cli`.

## Publish prerequisites

1. **Create the npm org `rabbit-hole`.** The scope is unclaimed (E404 on 2026-10-03). Its owner should be the Rabbit Hole account.
2. **Get a token that can publish to `@rabbit-hole`.** Use an automation token if 2FA is on. Put it in `.env` as `NPM_TOKEN`; `run.sh publish:cli` builds a throwaway npmrc from it.
3. **Bump `packages/cli/package.json`.** Suggested version: `0.1.0`. `publishConfig.access` is already `public`.
4. **Deploy `rabbit-hole-cp` from this branch first.** That ships the dual config-name runbook support and the deploy guard.
5. **Pass the release gate above.**
6. **Run `make publish-cli`.** It runs the CLI tests, then publishes.
