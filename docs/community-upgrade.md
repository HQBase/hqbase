# Community to Pro upgrade

The first upgrade milestone migrates D1 in place and preserves Community rows and R2 references. It does not yet automate the complete Worker/R2 cutover.

Run preflight without mutations:

```sh
pnpm hqbase-pro upgrade --from-community --database <d1-name-or-id> --remote --dry-run
```

After reviewing the target, run the migration:

```sh
pnpm hqbase-pro upgrade --from-community --database <d1-name-or-id> --remote --yes
```

Remote mutation always exports a timestamped SQL backup first. `--backup <path>` overrides its location. Unknown schemas fail before backup or migration. Verification requires every Pro table after Wrangler applies the migrations.

Current limitation: deployment config generation, R2 binding cutover, and automated rollback are not implemented. Do not use this command as a production edition cutover yet.
