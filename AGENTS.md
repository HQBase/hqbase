# HQBase Community Guide

Cloudflare-native AGPL shared webmail. Community must remain independently useful.

## Boundaries

- Do not add Pro implementation, dormant Pro flags, license checks, or entitlement code. Contextual
  marketing links may describe Pro, but must not reduce or condition Community functionality.
- Prefer Web Platform and Cloudflare APIs in Worker code; do not add Node-only runtime dependencies.
- Add a versioned migration and migration tests for every schema change.
- Never mutate Cloudflare resources outside `.hqbase/deployments/<name>/manifest.json`.
- Never commit secrets or generated deployment manifests.

## Quality gate

```sh
pnpm check
pnpm deploy:dry-run
```

Run `pnpm cf:typegen` after changing `wrangler.jsonc`. See `CONTRIBUTING.md` for test placement and engineering conventions.
