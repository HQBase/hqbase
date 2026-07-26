# HQBase Guide

Public AGPL HQBase product for customer-owned Cloudflare infrastructure.

## Boundaries

- Keep one public product identity and one signed public release channel.
- Record every schema change as a migration with fresh-install and update tests.
- Keep customer mail and Cloudflare credentials in customer infrastructure.
- Keep dormant mail-client compatibility out of launch routes, bindings, migrations, UI, and
  release acceptance.
- Never log credentials or mail content.
- Never mutate Cloudflare resources outside `.hqbase/deployments/<name>/manifest.json`.

## Quality gate

```sh
pnpm check
pnpm deploy:dry-run
```

Run `pnpm cf:typegen` after changing `wrangler.jsonc`. HQBase owns its staging E2E gate.
