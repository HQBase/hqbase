# Community to Pro upgrade

## Customer path

An authenticated Community workspace owner starts **Upgrade to Pro** in the existing workspace.
There is no second Pro deployment and no D1 or R2 picker.

The purchase is bound to the workspace installation ID, Worker name, origin, nonce, and PKCE
challenge. After Billing verifies the Polar checkout, the browser returns a single-use claim to the
original workspace. The customer approves a fixed, least-privilege Cloudflare OAuth grant once.
Billing and the OAuth relay never receive the resulting Cloudflare token.

The Community Worker then runs a persisted, retry-safe lifecycle:

1. find the exact signed Community Worker and verify its installation ID, account, active version,
   required bindings, secret names, routes, domains, and supported D1 schema;
2. acquire the installation lock, record the active Community version and complete non-secret
   inventory, create a D1 Time Travel bookmark, export SQL to `_hqbase/backups/` in the existing R2
   bucket, and verify the backup;
3. create or reuse owned Pro job and dead-letter queues;
4. download and verify the licensed, signed Pro deployment artifact;
5. disable Cloudflare Preview URLs without changing the workers.dev route, add only new Pro
   secrets, upload a Pro version of the same Worker with inherited bindings and assets, and stage
   it at zero percent while Community remains at 100 percent;
6. apply signed additive migrations idempotently, then use a storage-free disposable validator
   Worker to select that exact Pro version and run the application smoke gate;
7. after every smoke check passes, promote Pro to 100 percent of the same Worker service, verify
   the original origin and resources, delete the validator, revoke the OAuth grant, and remove
   temporary upgrade secrets.

The validator is needed only because Cloudflare does not let the target Worker recursively select
another version of itself through its production route. It exposes one temporary workers.dev
endpoint, has Preview URLs disabled, receives no D1, R2, queue, or secret bindings, and is never a
customer workspace. The smoke gate verifies release and installation identity, Pro bindings and
secrets, the migrated schema, preserved row counts and mail objects, static assets, and active
entitlement. It is an application gate, not a Cloudflare built-in health check.

The Worker name, routes, domains, D1 ID, R2 bucket, `BETTER_AUTH_SECRET`, users, sessions, messages,
attachments, settings, and primary-domain configuration remain unchanged. Pro settings are
available immediately at the original workspace origin.

## Recovery

Failures before mutation leave Community unchanged. Failures after backup and before promotion
leave the recorded Community version serving. The upgrade record retains the previous Worker
version, D1 bookmark, SQL backup key, resource inventory, and created-resource list.

Worker code can be rolled back independently. D1 is never restored automatically after Pro may
have accepted writes because Time Travel restoration can discard post-upgrade data. An operator
must make that recovery decision explicitly.

The private-source `hqbase-pro upgrade` command remains an operator-only data recovery tool. It is
not the customer installation path and must not deploy a second permanent Worker or rotate the
Community authentication secret.
