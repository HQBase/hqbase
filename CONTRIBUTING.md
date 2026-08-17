# Contributing

HQBase is licensed under AGPL-3.0-only.

Submission does not guarantee acceptance. Maintainers retain sole discretion over which
contributions are merged into the official HQBase project.

## Contributor License Agreement

Every human-authored contribution requires CLA acceptance before it can be merged, including
documentation, typo fixes, and other small changes. Maintainers may exempt contributions created
by automated bots. CLA Assistant will prompt the contributor to review and accept the [HQBase
Individual Contributor License
Agreement](https://gist.github.com/bermanto/6a6d2ea2d93119229f871bb186a4168c) through the pull
request.

Contributors retain copyright in their contributions. Accepted contributions remain available in
the community project under AGPL-3.0-only. The CLA also permits Berman Digital Ltd. to use and
license contributions under alternative terms, including commercial terms.

Read the public [Contributing to
HQBase](https://hqbase.io/docs/maintainers/contributing/) guide for repository ownership,
documentation changes, pull requests, optional Cloudflare testing, and the official staging and
release handoff.

For a local checkout of the main application:

```sh
pnpm install
pnpm db:migrate:local
pnpm db:seed:local
pnpm check
pnpm deploy:dry-run
```

The optional seed command uses `HQBASE_LOCAL_SEED_PASSWORD` from `.dev.vars` and writes directly to
local D1. See the public [contributing guide](https://hqbase.io/docs/maintainers/contributing/) for
the demo login and destructive local reset workflow.
