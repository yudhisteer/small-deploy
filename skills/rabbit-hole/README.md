# Rabbit Hole agent skill

The agent skill for [@rabbit-hole/cli](https://www.npmjs.com/package/@rabbit-hole/cli):
teaches Claude Code / Codex to deploy the Python tool it just built behind a
work-email login in one command — and, when the tool needs AWS, to create and
maintain the IAM role itself with least privilege.

## Install

The [@rabbit-hole/cli](https://www.npmjs.com/package/@rabbit-hole/cli) CLI does
the deploying and ships this skill; the skill teaches your agent to drive it.

```
npm i -g @rabbit-hole/cli   # the CLI (the agent runs `rabbit-hole ...` through it)
rabbit-hole skill           # the skill, into this project's .claude/skills/rabbit-hole
```

The older standalone `small-skill` npm package is legacy and is not updated.

## What the agent learns

- Workspace selection through `rabbit-hole workspaces`, `--workspace`, and
  `RABBIT_HOLE_WORKSPACE`; browser selection is independent of the CLI.
- `references/aws-hosting.md` — private AWS installation login, workspace
  selection, CPU jobs, configurable app grants and file inputs, plus the hosted
  dashboard's S3 folder approval. Run `rabbit-hole skill` in the project to use the
  installed CLI's matching bundled copy.
- `rabbit-hole init` → review rabbit-hole.toml → `rabbit-hole deploy` → hand back the URL. Never
  a Dockerfile, never hand-rolled hosting, never bolted-on auth.
- `references/jobs.md` — on-demand scripts: declare every env read under
  `[inputs]`, write results to `$SMALL_OUTPUTS`, cron schedules.
- `references/aws-role.md` — the `[aws]` role: created from the trust policy
  the failed deploy prints, scoped to exactly what the code touches, never
  AWS keys in `.env`.
- `references/aws-compute.md` — when the heavy part truly needs AWS: pick
  Lambda/Fargate/SageMaker/Batch from three plain questions, with the role
  map for each.
- `references/aws-production.md` — one CDK stack per tool when the MVP grows up.

This skill is generated from the Rabbit Hole monorepo (`skills/small/`),
where it is linted against the source and behaviorally evaluated with a
headless agent before publishing.
