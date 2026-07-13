# Contributing

HQBase Community is AGPL-3.0-or-later and must remain a complete, useful, self-hosted shared inbox.

## Setup and checks

```sh
pnpm install
pnpm db:migrate:local
pnpm check
pnpm deploy:dry-run
```

`pnpm check` runs Biome, strict TypeScript, unit and Worker integration tests, coverage, architecture checks, and the production build.

## Change rules

- Keep changes small and feature-oriented.
- Keep business rules separate from React, transport, and Cloudflare bindings where practical.
- Validate every external input and never log secrets or mail content.
- Treat 300 lines as a review signal and 400 lines as the default implementation-file limit.
- Add a versioned migration and empty/populated/retry/failure tests for schema changes.
- Add a regression test for every fixed bug.

Tests live under `test/unit`, `test/integration`, `test/migrations`, and `test/e2e`. Unit tests cover pure logic. Worker integration tests run in `workerd`. Only deployed staging tests are called E2E.

Do not add per-mailbox permissions, private inboxes, assignments, internal notes, audit/compliance features, advanced automations, bridge APIs, or other reserved Pro implementation to this repository. Foundational tests, security, accessibility, performance, and deployment improvements remain welcome.

See `docs/open-core-boundary.md` and `TRADEMARKS.md` for the public edition and brand policies.
