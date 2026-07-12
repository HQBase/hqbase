# HQBase Pro Guide

Complete, independently evolving HQBase Pro product. Source-available under the HQBase Commercial Source License 1.0.

## Boundaries

- Support fresh Pro installation and explicitly supported Community upgrades.
- Do not configure Community as an upstream or depend on routine cross-edition merges.
- Record every schema change as a migration with fresh-install and upgrade tests.
- Keep app-password verification, entitlement, authorization, and persistent IMAP identity in Pro.
- Never log credentials or mail content.
- Never mutate Cloudflare resources outside `.hqbase-pro/deployments/<name>/manifest.json`.

## Quality gate

```sh
pnpm check
pnpm deploy:dry-run
```

Run `pnpm cf:typegen` after changing `wrangler.jsonc`. Pro owns its staging E2E gate.
