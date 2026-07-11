# Contributing

HQBase Pro is private during initial development. Changes must keep both fresh installation and supported Community upgrades working.

```sh
pnpm install
pnpm check
pnpm deploy:dry-run
```

Use feature-oriented modules, strict boundary validation, versioned migrations, organized tests, and the 400-line implementation-file limit. Every authorization rule, migration, bridge contract change, and fixed bug requires tests.

