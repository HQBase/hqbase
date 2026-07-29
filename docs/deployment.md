# Deployment

HQBase runs in the customer's Cloudflare account. Customer mail, application data, Cloudflare
credentials, and runtime secrets remain in customer-controlled infrastructure.

## Install

Use the public deploy button in the repository README or run:

```bash
pnpm install
pnpm run deploy
```

The installer creates a D1 database, R2 bucket, queue, Worker, and routes using public source and
signed public release artifacts from `HQBase/hqbase`. It generates the Better Auth secret if one is
not supplied and generates the installation's Web Push VAPID key pair.

## Runtime secret

The first Workers Build generates `BETTER_AUTH_SECRET`, `VAPID_PUBLIC_KEY`, and
`VAPID_PRIVATE_KEY` inside the customer account when they do not already exist. Existing
installations receive a VAPID pair during the first compatible signed update without rotating
their authentication secret. Operators may supply these values explicitly for controlled
automation.

The VAPID private key never leaves the customer's Worker secrets. Browser push subscription
endpoints and encryption keys stay in the customer's D1 database. Notification payloads are
encrypted and contain no sender, recipient, subject, snippet, body, or attachment metadata.

Cloudflare OAuth client configuration is compiled public product configuration. Temporary OAuth
grants used for setup or updates are encrypted, scoped to the operation, and revoked after use.

## Default resources

- Worker: `hqbase`
- D1 database: `hqbase`
- R2 bucket: `hqbase-mail`
- Queue: `hqbase-jobs`
- Dead-letter queue: `hqbase-jobs-dlq`

Resource names can be overridden through the installer configuration. Fresh installs create fresh
resources.

## Updates and rollback

See [updates.md](updates.md). Update safety includes signed manifests, digest and size checks,
schema compatibility, a D1 Time Travel bookmark, Worker version capture, verification, and Worker
and D1 recovery commands on failure.

## Removal

Run `pnpm run hqbase -- destroy` and choose the explicit scope. Destructive scopes require
confirmation. Back up D1 and R2 data before removing customer resources.
