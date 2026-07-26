# Contributing

HQBase is licensed under AGPL-3.0-or-later.

```sh
pnpm install
pnpm db:migrate:local
pnpm check
pnpm deploy:dry-run
```

Use feature-oriented modules, strict boundary validation, versioned migrations, organized tests,
and the 400-line implementation-file limit. Every authorization rule, migration, and fixed bug
requires tests. Never log credentials or mail content.
