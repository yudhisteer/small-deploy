# Rabbit Hole

Deploy a Python app for your team, behind a work-email login, in one command.
You write the tool; `rabbit-hole` gives it a URL only your colleagues can open. No
Dockerfile, no cloud console, no auth code.

## The fastest path: let your agent do it

If you use Claude Code or Codex, install the skill once and then just ask:

```
npm i -g @rabbit-hole/cli
rabbit-hole skill          # into this project's .claude/skills/rabbit-hole
```

Then, after the agent builds your tool, say **"deploy this"** or **"share
this with my team"**. The skill teaches the agent the whole flow:

- run `rabbit-hole init`, review the generated `rabbit-hole.toml`, fix anything marked
  `# fill in`
- run `rabbit-hole deploy --env .env` and hand you back the URL
- read the generated runbook back to you so you can confirm what was built
- if the tool calls AWS: create and maintain a least-privilege IAM role for
  it (never AWS keys in `.env`) — the failed deploy prints the exact trust
  policy to use
- if the tool is an on-demand script: declare its inputs so anyone can run it
  from the dashboard or CLI with validated arguments

You never need to learn the CLI yourself — but everything the agent does is
plain `rabbit-hole` commands you can also run by hand, below.

## By hand

```
npm i -g @rabbit-hole/cli
rabbit-hole login                     # emails you an 8-digit code
cd my-tool/
rabbit-hole init                      # writes rabbit-hole.toml from what it detects
rabbit-hole deploy --env .env         # preflight, build, deploy — prints the URL
```

The CLI talks to `https://digrabbithole.com` (REST API under `/api`);
`RABBIT_HOLE_API` or `rabbit-hole login --api <origin>` selects another installation.

Every step prints what it decided (`✓ entry: app.py (flask)`) so a wrong
guess is visible in one line. Deploy pre-flights before building — Python
syntax, requirement names on PyPI, env vars the code reads, secrets, the AWS
role — and stops with a one-line fix instead of failing at runtime.

Give people access and operate the app:

```
rabbit-hole share alice@company.com          # view access
rabbit-hole share bob@company.com --edit     # can redeploy
rabbit-hole logs                             # recent container logs
rabbit-hole runbook                          # the generated manual for this app
```

If the tool is a script rather than a server (`type = "job"` in
`rabbit-hole.toml`), it runs on demand instead of serving requests:

```
rabbit-hole run my-tool --image photo.jpg --threshold 0.5   # validated inputs
rabbit-hole runs my-tool                                    # past runs + outputs
rabbit-hole schedule pause my-tool                          # pause/resume its cron
```

(Schedules themselves are declared in `rabbit-hole.toml` — `schedule = "0 9 * * *"` —
and registered on deploy.)

Colleagues use the web dashboard for all of this too — every app, its runs,
its runbook, one login for the team.

Moving from the old CLI: see the migration notes at the end of
`packages/cli/README.md`. Existing `small.toml` files keep working.

## Where to read more

- `docs/SCOPE.md` — what the product is and deliberately is not
- `docs/PRODUCT.md` — product direction, dashboard scope
- `docs/RUNBOOK.example.md` — the canonical template every generated runbook follows
- `docs/features/` — one spec per shipped feature
- `docs/features/rabbit-hole-cli-production-infra.md` — what production needs before the CLI's deploy and run commands work there
- `skills/small/` — the agent skill (`rabbit-hole skill` installs it; the directory keeps its old name)
