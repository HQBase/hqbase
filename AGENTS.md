# HQBase Workspace Guide

Public AGPL HQBase product for customer-owned Cloudflare infrastructure.

Always write in Simplified Technical English (ASD-STE100) and follow Zinsser's four principles of
quality writing: Simplicity, Brevity, Clarity, Humanity.

Read `../hqbase-site/src/content/docs/docs/maintainers/documentation.md` before changing product
behavior or working across HQBase repositories.

## Boundaries

- Keep one public product identity and signed Stable and opt-in Nightly release channels.
- Keep public distribution direct from the canonical `HQBase/hqbase` repository.
- Record every schema change as a migration with fresh-install and update tests.
- Keep customer mail and Cloudflare credentials in customer infrastructure.
- Never log credentials or mail content.
- Never mutate Cloudflare resources outside `.hqbase/deployments/<name>/manifest.json`.
- Update the relevant canonical specification in
  `../hqbase-site/src/content/docs/docs/specs/` before implementation.
- Identify every affected repository, run each local gate, and keep code, tests, specifications,
  and public documentation consistent.
- Run HQBase staging E2E when behavior crosses deployed systems.
- Do not declare completion while code, tests, specifications, or supported products disagree.

Repository-local `AGENTS.md` and `CONTRIBUTING.md` files define commands and safety rules for each
checkout.

## Quality gate

```sh
pnpm check
pnpm deploy:dry-run
```

Run `pnpm cf:typegen` after changing `wrangler.jsonc`. The documentation integrity gate belongs to
`hqbase-site`; HQBase owns its staging E2E gate.
