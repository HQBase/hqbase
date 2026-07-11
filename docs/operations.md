# Pro operations

## Daily checks

```sh
pnpm hqbase-pro doctor --name <deployment>
pnpm hqbase-pro backup --name <deployment>
```

`doctor` verifies the generated deployment, the Track 1 schema marker, broken IMAP
references, R2 availability, both queues, and the current Worker deployment. `backup` writes a
mode-`0600` JSON manifest with the D1 Time Travel bookmark, deployed Worker version, and R2 bucket
inventory. It does not download mail.

## Restore

```sh
pnpm hqbase-pro restore --name <deployment> --backup <manifest.json> --yes
```

Restore refuses a malformed or cross-deployment manifest. It first creates a new safety backup,
restores D1 by bookmark, and runs integrity and schema checks. The command prints the exact Worker
rollback command recorded by the target backup.

## Background work

The daily cron queues bounded maintenance and integrity scans. Maintenance removes expired rate
limits, sessions, and idempotency records, then applies configured message/trash retention in
batches of 100. Integrity scans count broken IMAP mappings and unreferenced R2 objects without
deleting them. Jobs are idempotent by ID, retry three times, then enter the deployment DLQ.

Authenticated operators can inspect content-free status at `GET /api/pro/operations/diagnostics`
and request a scan at `POST /api/pro/operations/integrity-scan`.

## Incident order

1. Stop destructive changes and record the request/correlation ID.
2. Run `doctor` and `backup`.
3. Inspect diagnostics, recent failed operation IDs, and the DLQ.
4. Restore only from a manifest for the same deployment.
5. Re-run `doctor`, authenticate a bridge session, and perform the headless IMAPS/SMTPS check.
