# Community to Pro upgrade

## Customer path

Use the **Deploy HQBase Pro to Cloudflare** button in the README. In Cloudflare, select the existing
Community `DB` and `MAIL_OBJECTS` resources instead of creating replacements. Use a distinct Pro
Worker name during the verified blue-green cutover.

The repository deploy command then performs the guarded lifecycle automatically:

1. classify the remote D1 schema;
2. reject unknown non-empty databases before mutation;
3. record a D1 Time Travel bookmark;
4. export SQL to `_hqbase/backups/` in the selected mail R2 bucket;
5. apply only pending migrations;
6. verify the complete Pro schema;
7. record the upgrade checkpoint in D1;
8. deploy Pro and mark the deployment stage complete.

The Community Worker and its routes are not deleted. The purchase-bound license activates
automatically. During Pro setup, the delegated installation grant may reassign only hostnames
recorded on the Community Worker, then verifies portal, inbound, and outbound routing before it is
revoked. Keep Community until that explicit cutover stage passes.

## Operator path

The operator path migrates D1 in place and preserves Community rows and R2 references. Domain
cutover remains explicit and runs only after Pro has deployed and verification succeeds.

Run preflight without mutations:

```sh
pnpm hqbase-pro upgrade --from-community --database <d1-name-or-id> --remote --dry-run
```

After reviewing the target, run the migration:

```sh
pnpm hqbase-pro upgrade --from-community --database <d1-name-or-id> --remote --yes
```

Remote mutation always exports a timestamped SQL backup first. `--backup <path>` overrides its location. Unknown schemas fail before backup or migration. Verification requires every Pro table after Wrangler applies the migrations.

After the migration succeeds, deploy Pro against the existing Community data plane. Preserving the
Community auth secret also preserves active sessions; using a new secret safely requires users to
sign in again:

```sh
HQBASE_AUTH_SECRET=<existing-better-auth-secret> pnpm hqbase-pro install \
  --name upgraded-workspace \
  --worker-name <community-worker> \
  --d1-name <community-database> \
  --reuse-d1-id <community-database-id> \
  --reuse-r2-bucket <community-mail-bucket> \
  --domain <email-domain>
```

This is an in-place data upgrade with a blue-green Worker cutover: users, mail metadata, and objects
stay in the same D1 and R2 resources while Community remains available until routing moves. The Pro
installer adds its queues, secrets, migrations, and Worker code. Automated D1 rollback remains
intentionally unsupported because it could discard mail received after cutover.
