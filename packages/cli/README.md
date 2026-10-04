# @rabbit-hole/cli

Deploy a Python app for your team, behind a work-email login, in one command.

```
npm i -g @rabbit-hole/cli

rabbit-hole login                 # email → 8-digit code
rabbit-hole init                  # scaffold rabbit-hole.toml + a first runbook
rabbit-hole deploy --env .env     # detect app, build remotely, print URL
```

The CLI talks to `https://digrabbithole.com` (REST API under `/api`). Set
`RABBIT_HOLE_API` to another installation origin, or pass `login --api <origin>`.

Working with an AI coding agent? Run `rabbit-hole skill` in the project to install
the instructions bundled with your CLI, including the private AWS workflow.

Your app is served at `https://<control-plane>/a/<org>/<app>/` behind a
magic-link login. Only people at your email domain (or explicitly shared
emails) get in. The container itself refuses any request that did not come
through the auth wall.

Every deploy also lands the app on a web dashboard: run form, live logs,
AI code review, an editable runbook (with a process-flow diagram), and a
chat agent that has read the code, the runs and the outputs. Connect Slack
and its slash command runs jobs from there too, with results posted back to the thread.

## Commands

```
start
  login [--api <origin>]   hosted email login or private AWS Cognito login
  init                     scaffold rabbit-hole.toml and a runbook in this project
  init --migrate           copy a legacy small.toml to rabbit-hole.toml
  deploy                   ship the current directory

everyday
  run <app>                start a job (prompts for its inputs, --download for results)
  runs <app>               recent runs: status, duration, who started them
  logs <app>               tail what an app printed
  list                     your apps and their URLs
  workspaces               list accessible workspace slugs
  watch [app]              what the nightly watch pass found

sharing & schedule
  share <email> [--edit]   give a teammate access (--app name to pick the app)
  schedule pause <app>     pause its cron (resume to restart)

more
  review                   AI code review of the current directory
  runbook                  the app's runbook (--write saves RUNBOOK.md, --diff)
  skill                    install the agent skill into .claude/skills
  help                     this list
```

Use `--workspace <slug>` on a command to select a workspace from
`rabbit-hole workspaces`, or set `RABBIT_HOLE_WORKSPACE` for the shell. The flag takes
precedence. With neither set, commands use the login's email workspace.
Selecting a workspace in the browser does not select it in the CLI. Unknown
slugs fail before app requests rather than falling back to a different workspace.
The CLI also verifies that the server activated the selection. A server without
the CLI workspace authentication update stops the command before app access.

## AWS hosting (dev preview)

Install `@rabbit-hole/cli` from npm and run `rabbit-hole skill` in your
app directory to refresh its agent instructions. The hosted AWS dashboard
remains a dev preview. For a customer-hosted Rabbit Hole installation, use the
private AWS instructions below and that installation's own URL.

In the [dev dashboard](https://small-cp-dev.tryrabbithole.workers.dev/apps), open
the desired workspace's **Settings → Connections → AWS**. Enter the customer's
account ID and first app name, approve the installation in their AWS console,
and return to **Finish connecting**. Additional apps reuse that connection.

In the app's `rabbit-hole.toml`, set `type = "job"` and `[deploy] target = "aws"`
before running `rabbit-hole init`. Then, in PowerShell:

```powershell
$env:RABBIT_HOLE_API = 'https://small-cp-dev.tryrabbithole.workers.dev'
rabbit-hole workspaces
# Replace <slug> with an accessible slug returned above.
rabbit-hole deploy --workspace <slug>
rabbit-hole run aws-test-job --workspace <slug>
```

The CLI prints the workspace, AWS account, and region before source upload.
Source, inputs, logs, and outputs go directly between the client and customer
AWS. The normal app sidebar, Run form, and Logs panels show the job.

This preview supports multiple CPU jobs on one connection per workspace in
`us-east-1`, with text, number, bool, and select inputs. App secrets, extra AWS
roles, system packages, persistent storage, schedules, file/date inputs, GPU
jobs, web servers, and hosted review/runbook/Coaching are not supported yet.
The connection installer can deploy; workspace members can run and inspect.

## App detection

In order: `rabbit-hole.toml` (`entry`; a legacy `small.toml` still loads),
`--entry` flag, framework hint
(`Flask(`, `FastAPI(`, `import streamlit`, `import gradio`), filename
convention (`app.py`/`main.py`/`server.py`), only `.py` file. Every deploy
prints what was chosen.

## Private AWS installation

Use the Rabbit Hole URL supplied by your company's administrator. The existing
customer AWS installation must have CPU jobs enabled; release `0.1.0-pilot.5.1`
adds configurable app grants and file uploads. Installing this CLI does not
install or update that stack. Existing single-folder S3 configurations remain compatible.

```sh
npm install -g @rabbit-hole/cli
rabbit-hole login --api https://rabbit-hole.example.com
rabbit-hole workspaces
rabbit-hole skill
```

Replace the example URL with your installation's HTTPS origin. Set `RABBIT_HOLE_API`
to that same origin if the shell already overrides it. In each app's `rabbit-hole.toml`,
use `type = "job"` and `[deploy] target = "aws"`. Preserve its name and Python
entry, then run `rabbit-hole deploy --workspace <slug-from-workspaces>`.

Source uploads, builds, runs, logs, and outputs use customer AWS. Private login
uses Cognito and a temporary callback at `http://127.0.0.1:8766/auth/callback`.
Keep the login command running and open its link on the same computer. When the
CLI runs over SSH, forward port `8766` to that host before signing in;
`--no-browser` prints the login link but does not set up forwarding.

The private AWS pilot supports CPU jobs, scalar inputs, files (up to five,
10 MiB each), fixed `[constants]`, input and constant tooltips, and exact per-app AWS grants.
Constants reach the job as typed `SMALL_CONSTANTS` JSON and appear read-only in
Run. Declare `[aws] grants` as a single-line
array of `{ action = "...", resource = "..." }` entries. Deployment waits for
approval in Settings > Connections > AWS. The customer administrator controls
available actions through the stack's `AppGrantActions` parameter; adding an
action never broadens an app's existing approval. Additional services may need
customer-configured VPC endpoints. The hosted dev preview retains its existing
single-folder S3 permission flow.

App secrets, system packages, schedules, persistent volumes, and sharing changes
are outside this pilot. `rabbit-hole skill` installs the complete
`references/aws-hosting.md` guide, including file flags, grant syntax, and limits.

## rabbit-hole.toml

```toml
name = "detect"
entry = "job.py"
type = "job"              # omit for web apps: flask | fastapi | streamlit | gradio
schedule = "0 9 * * 1-5"  # optional cron, UTC

[deps]
file = "requirements.txt"
system = []               # apt packages

[inputs]                  # jobs: the run form, CLI flags and Slack all feed these
source    = { type = "text", required = true, help = "s3://bucket/key" }
threshold = { type = "number", default = 0.5 }

[outputs]
annotated = { path = "annotated.jpg", label = "Annotated image" }

[secrets]
required = []             # deploy fails if any are missing from .env

[aws]
role_arn = ""             # per-run STS credentials; never put AWS keys in .env

[storage]
path = "/data"            # persistent volume, survives redeploys ($SMALL_DATA)

[access]
visibility = "domain"     # domain | private
```

Only `entry` is required.

## Notes

- Builds run on Fly.io remote builders — no Docker. `rabbit-hole deploy` installs
  `flyctl` itself on first use if it is missing.
- Apps live under a path prefix: use relative URLs in your HTML.
- `.env` values are sent to the runtime as secrets, never baked into the image.
- Job inputs arrive as env vars, files written to the outputs folder become
  downloadable run outputs — same contract for every trigger (form, CLI,
  Slack, cron, chat agent).

## Moving from small-deploy

`small` and `small-deploy` are the old names. Remove the old package first, since
both packages provide a `small` command: `npm rm -g small-deploy && npm i -g @rabbit-hole/cli`.

- `small <command>` still works and prints a notice; use `rabbit-hole <command>`.
- A project's `small.toml` still loads. `rabbit-hole init --migrate` copies it to
  `rabbit-hole.toml` and leaves `small.toml` untouched. When both exist,
  `rabbit-hole.toml` wins.
- A login in `~/.small/config.json` is still read until you run `rabbit-hole login`,
  which writes `~/.rabbit-hole/config.json`. A login saved for a retired `small-cp`
  host is not reused. `SMALL_API`, `SMALL_TOKEN` and `SMALL_WORKSPACE` still work;
  `RABBIT_HOLE_*` takes precedence.
- App runtime variables (`SMALL_INPUT_*`, `SMALL_DATA`, `SMALL_OUTPUTS`) are unchanged.
