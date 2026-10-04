# @rabbit-hole/cli

The Rabbit Hole command line: sign in, start a project and see what you have in your
Rabbit Hole workspace.

```
npm i -g @rabbit-hole/cli          # Node 18+

rabbit-hole login                  # email → one-time code
rabbit-hole init                   # scaffold rabbit-hole.toml in this project
rabbit-hole list                   # your canvases and repositories
```

## Commands

```
login [--api <origin>]   sign in with a one-time code to your email
init                     scaffold rabbit-hole.toml in this project
init --migrate           copy a legacy small.toml to rabbit-hole.toml (small.toml is kept)
capture                  Knowledge Capture: sessions, questions, decisions (not available yet)
list                     your canvases and repositories
help                     the command list
```

`rabbit-hole capture` is reserved for Knowledge Capture. Until it ships it prints
`Knowledge Capture is not available yet` and exits with an error.

Use `--workspace <slug>` on a command to select a workspace from
`rabbit-hole workspaces`, or set `RABBIT_HOLE_WORKSPACE` for the shell. The flag takes
precedence. Unknown slugs fail before any request rather than falling back to a
different workspace.

## API

The CLI talks to `https://digrabbithole.com`; the REST API is under `/api`. Set
`RABBIT_HOLE_API` to another installation's origin, or pass `login --api <origin>`
with the bare origin (no `/api`). Nothing falls back to localhost.

## Moving from small-deploy

`small` and `small-deploy` are the old names. This package provides only the
`rabbit-hole` command. Because both packages are global CLIs, replace one with the
other:

```
npm rm -g small-deploy && npm i -g @rabbit-hole/cli
```

- A project's `small.toml` still loads. `rabbit-hole init --migrate` copies it to
  `rabbit-hole.toml` and leaves `small.toml` untouched. When both exist,
  `rabbit-hole.toml` wins.
- A login in `~/.small/config.json` is still read until you run `rabbit-hole login`,
  which writes `~/.rabbit-hole/config.json`. A login saved for a retired `small-cp`
  host is not reused. `SMALL_API`, `SMALL_TOKEN` and `SMALL_WORKSPACE` still work;
  `RABBIT_HOLE_*` takes precedence.
- Commands from the older Small hosting product are not part of Rabbit Hole. They
  remain for compatibility, print a legacy notice and are not supported on
  `https://digrabbithole.com`. `rabbit-hole help legacy` lists them.
