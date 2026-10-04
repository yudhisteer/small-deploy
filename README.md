# Rabbit Hole

The Rabbit Hole monorepo: the web app at `https://digrabbithole.com`, its control
plane, and the `rabbit-hole` CLI.

## The CLI

The CLI is `@rabbit-hole/cli`. It is not published yet; see the release gate in
`docs/features/rabbit-hole-cli-production-infra.md`.

```
npm i -g @rabbit-hole/cli
rabbit-hole login                     # emails you a one-time code
cd my-project/
rabbit-hole init                      # writes rabbit-hole.toml from what it detects
rabbit-hole list                      # your canvases and repositories
```

`rabbit-hole capture` (Knowledge Capture: sessions, questions, decisions) is
reserved and reports that it is not available yet.

The CLI talks to `https://digrabbithole.com` (REST API under `/api`);
`RABBIT_HOLE_API` or `rabbit-hole login --api <origin>` selects another installation.
Every step prints what it decided, so a wrong guess is visible in one line.

Moving from the old CLI: see the migration notes at the end of
`packages/cli/README.md`. Existing `small.toml` files keep working.

## Where to read more

- `docs/SCOPE.md` — what the original hosting product is and deliberately is not
- `docs/PRODUCT.md` — product direction, dashboard scope
- `docs/features/` — one spec per shipped feature
- `docs/features/rabbit-hole-cli-production-infra.md` — the CLI's v1 surface, what production serves, legacy retirement and publish prerequisites
- `skills/rabbit-hole/` — the agent skill for the legacy hosting workflow (`@rabbit-hole/skill`, private)
