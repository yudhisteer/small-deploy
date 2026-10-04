# Rabbit Hole CLI: v1 surface, production facts and legacy record

Status 2026-10-03, branch `feature/rabbit-hole-cli-migration` (from `main` e9d6dbe7). Nothing here is
published, deployed or created. Line numbers are `packages/control-plane/src/index.js` on this branch
unless another file is named.

**Owner decisions (2026-10-03):**
- The CLI is `@rabbit-hole/cli`, binary `rabbit-hole` only, config `rabbit-hole.toml`.
- Its default API is the bare origin `https://digrabbithole.com`; the CLI appends `/api` itself (`packages/cli/lib/api.js`).
- `RABBIT_HOLE_API` (legacy `SMALL_API`) selects another installation explicitly. Nothing falls back to localhost or a `small-*` host.
- Rabbit Hole does **not** rebuild the old Small hosting product for v1.
- New infrastructure is named `rabbit-hole-*`. Existing `small-*` resources stay until their retirement checkpoint and are never renamed in place.

## v1 surface

| Command | What it does | Production today |
|---|---|---|
| `rabbit-hole login` | Hosted email-code login: `POST /api/cli/login` (2342), handled by `apiLogin` (183); then `POST /api/cli/verify` (2343), handled at 217. | Yes in code and config: D1 `cli_login_challenges` (`migrations/0025`), `MASTER_KEY`, `RESEND_API_KEY` with `EMAIL_FROM`. The email subject is "Rabbit Hole CLI login code". |
| `rabbit-hole init` | Writes `rabbit-hole.toml` from local detection; `--migrate` copies a `small.toml`. It then tries `POST /api/runbook` (2458, handled at 452) to write `RUNBOOK.md`; failure never fails init. | Config: local, yes. The runbook call runs a model on production (`ANTHROPIC_API_KEY` is set there) over the uploaded project source. This is a legacy hosting feature riding on init; see Open decisions. |
| `rabbit-hole capture` | Reserved for Knowledge Capture (Sessions, Questions, Decisions), built on `feature/rabbit-hole-knowledge-capture`. Prints `✗ Knowledge Capture is not available yet` and exits 1, with no login and no network. | Not available. |
| `rabbit-hole list` | `GET /api/apps`. | Yes. See below. |
| `rabbit-hole workspaces`, `--workspace` | `GET /api/workspaces` (2367); D1 `workspaces`, `workspace_members` (`0019`). | Yes. |

**What `list` returns on production.** `https://digrabbithole.com` is `rabbit-hole-app`. Its `app-worker.js`
hands requests to `dev-worker.js`, and `dev-worker.js:89-94` answers `GET /api/apps` itself; the
control-plane `apiApps` (493) is never reached. The response is
`{ email, org, orgName, folders: [], apps: [...repositories, ...canvases] }`:
- `ownerRepositories` (`repositories.js:52`) reads `LEARN_DB.repository_apps`, owner and org only, and maps each row to `kind: 'repository'` with `repo` (e.g. `karpathy/nanoGPT`).
- `ownerCanvases` (`canvases.js:36`) reads `LEARN_DB.canvases`, not archived and not a dive child, and maps each row to `kind: 'canvas'` with `title`.
- Identity comes from `devIdentity` (`dev-forwarding.js:40`), which calls the control plane's `GET /api/me` with the caller's own `Authorization` header, so a CLI token works. A `X-Small-Workspace` other than the caller's resolved org returns 403 (`repositories.js:42-43`).

The CLI prints `name  canvas  title` and `name  repository  owner/repo`. Hosted-app rows from a legacy
installation keep the old `name  visibility  owner:email` line.

**Read-only probe, 2026-10-03, no credentials:**
- `GET /api/auth/config` returned `401 {"error":"run small login first"}`, the control plane's string (2361). The CLI therefore takes the hosted email-code path.
- `GET /api/apps` returned `401 {"error":"Sign in to this workspace first"}` (`dev-forwarding.js:52`).

Secrets and D1 migration state were not checked.

**Server compatibility kept:**
- The 401 string `run small login first` (2361) stays verbatim, because installed `small` CLIs match it. The new CLI accepts it or `run rabbit-hole login first`.
- The runbook reads either `rabbit-hole.toml` or `small.toml` from a bundle (`runbook-schema.js` `configName`).
- `apiDeploy` returns its Fly 503 before any D1 write (295), so a deploy attempt against production leaves no orphan `apps` row.

## Legacy Small hosting commands: out of v1 scope

`deploy`, `run`, `runs`, `logs`, `schedule` and `watch` (plus `share`, `review`, `runbook` and `skill`)
stay in the `rabbit-hole` binary for compatibility:
- they are hidden from `rabbit-hole --help` and listed by `rabbit-hole help legacy`;
- each prints `⚠ rabbit-hole <cmd>: legacy Small command; not part of Rabbit Hole` on stderr, so stdout stays parseable;
- they still run unchanged.

**Why not remove them:** private AWS installations and anyone pointing `RABBIT_HOLE_API` at a hosting installation can still use them. Removing them would break those users silently. Existing Small users run the separately published `small-deploy`, which this branch does not change.

**No production support is promised.** No new infrastructure will be built for them: no hosted-app site, no Fly infrastructure for user apps, no run storage, no cron, no logs infrastructure. They are never pointed at legacy `small-*` resources. The facts below are a record of what each command depends on, not a plan.

| Command | Server route (handler) | Depends on | On production today |
|---|---|---|---|
| deploy | `POST /api/deploy` 2371 (253), `/api/image` 2392 (1970), `/api/review/run` 2459 (393) | Fly: `FLY_API_TOKEN`/`FLY_ORG_TOKEN`, `FLY_ORG_SLUG`/`ID`, `fly.js`; D1 `apps`, `deploys`; optional R2 `RUNS`; served apps need the `/a/*` proxy (`proxyApp` 2287) | 503 before any write; `/a/*` is a 404 by design (`app-worker.js:17`) |
| run | `POST /api/runs` 2393 (2028 → `startRun` 1983); runner callbacks 2347/2349/2351 | Fly machines (503 at 2049); R2 `RUNS` for inputs and outputs (2039, 2123, 2071); D1 `runs`, `run_logs` | 503 |
| runs | `GET /api/runs` 2394 (2183) | D1 `runs` | Answers, always empty |
| logs | `/api/request-logs` 2456 (1928), `/api/logs` 2455 (1898), `/api/runs/:id` 2397 (2195); guard ingest 2353 (1912) | D1 `request_logs`; Fly for `--machine` (503 at 1903); deployed apps | Empty, or 503 |
| schedule | `POST /api/schedule` 2402 (2136); firing in `scheduled()` 2505 | D1 `apps.schedule*` (`0002-cron.sql`); a `* * * * *` cron, Fly and `RUNS` | Saves; never fires (no `triggers` on `rabbit-hole-cp`) |
| watch | `GET /api/watch` 2382 (1278); producer `runWatchPass` (`watch.js:224`) | D1 `observations` (`0015`); the `0 3 * * *` cron | Answers, always empty |

**Slack** is notification-only for all of them. `notifySlackRun` runs best-effort in `waitUntil`; `SLACK_*` is read only by the `/slack/*` routes (1244).

## Legacy retirement

| Legacy | Status | Checkpoint |
|---|---|---|
| `small` binary | Not in `@rabbit-hole/cli`; `small-deploy` keeps providing it during the compatibility period | 90 days after the first `@rabbit-hole/cli` publish |
| `small-deploy` npm package (0.0.14, default `small-cp`) | Untouched. Do not deprecate or unpublish now | Same checkpoint: `npm deprecate`, never unpublish. Possible follow-up: a last legacy `small-deploy` release that prints a migration notice |
| `small-skill` npm package | Untouched | Same checkpoint |
| `small.toml`, `~/.small/config.json`, `SMALL_API`/`SMALL_TOKEN`/`SMALL_WORKSPACE` | Read-only fallbacks; the `RABBIT_HOLE_*` names win | A later major release, after a notice has shipped for the same 90 days |
| 401 `run small login first`, `X-Small-Workspace`, `files['small.toml']` | Kept on the server for installed CLIs | When `small-cp` retires and no `small-deploy` CLI can reach a Rabbit Hole server |
| Fly app prefix `small-<app>-<hex>` (306, 553), token name `small-<fly app>` (`fly.js:125`), STS session `small-*` | Unchanged; v1 hosts no apps, so no code change now | Rename to `rabbit-hole-*` at this checkpoint if hosting ever returns |
| Private AWS releases (`small-deploy.tgz`, `small` commands in the private dashboard) | Unchanged; they pack the published `small-deploy` tarball | With the private installation's own retirement |
| Runtime env (`SMALL_INPUT_*`, `SMALL_DATA`, `SMALL_OUTPUTS`, `SMALL_CP_URL`, `SMALL_LOG_URL`, `SMALL_PROXY_SECRET`) | App contract, unchanged | Not part of the rename |

**Upgrade:** `npm rm -g small-deploy && npm i -g @rabbit-hole/cli`. The packages no longer share a bin, so this is
cleanup, not a collision fix.

## Release gate

Publish only when all of these hold, and only on the owner's go:
1. **Production backend.** `rabbit-hole-cp` is deployed from a commit that includes this branch: the both-config-name runbook and the deploy guard.
2. **Smoke test.** `rabbit-hole login` and `list` pass on `https://digrabbithole.com` with a real account.
3. **Docs match the release.** The README and docs describe `capture` truthfully for the published version.
4. **Dashboard flag.** `CLI_PUBLISHED` in `packages/web/src/flags.js` flips to `true` in the same release that deploys the dashboard.

## Publish prerequisites

**npm.**
- The org `rabbit-hole` exists. Checked anonymously on 2026-10-03: `GET registry.npmjs.org/-/org/rabbit-hole/package` returns `200 {}`.
- `@rabbit-hole/cli` and `@rabbit-hole/skill` both return 404 (unpublished).

**Still needed:**
- A publish-capable token for the `@rabbit-hole` scope, put in the repo-root `.env` as `NPM_TOKEN`. The owner account or an org member with write access must create a granular access token with read and write to the `@rabbit-hole` scope. If the account enforces 2FA for writes, enable the token's bypass-2FA option.
- The release gate above.

**Package** (`npm pack --dry-run`, then `npm pack` into a temp dir, listed and deleted on 2026-10-03):
- `@rabbit-hole/cli@0.0.14`: 35 files, 62.4 kB packed, 187.4 kB unpacked.
- **bin:** `rabbit-hole` → `bin/rabbit-hole.js` only.
- **lib:** 18 modules.
- **assets** (synced at prepack): the runtime `guard.py`, `runner.py` and `aws_runner.py`, used by the legacy hosting commands, and the skill snapshot from `skills/rabbit-hole`.
- `publishConfig.access: public`.

**Version:** set `0.1.0` for the first publish under the new name.

**Publish command:** `make publish-cli`. It is `run.sh publish:cli`: it builds a throwaway npmrc from `NPM_TOKEN`, then runs `cd packages/cli && npm test && npm publish` and deletes the npmrc.

`@rabbit-hole/skill` is `"private": true`: npm refuses to publish it. It still teaches the legacy hosting workflow; the capture branch owns the v1 skill.

## Open decisions

1. **What `init` does in v1.** It still uploads the project source to `POST /api/runbook`, a legacy hosting feature that runs a production model. The capture branch should decide whether init keeps it.
2. **The v1 skill.** `skills/rabbit-hole` teaches the legacy hosting workflow. The capture branch should replace it before `@rabbit-hole/skill` is made public.
