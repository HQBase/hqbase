# Mail bridge

> **Launch status:** dormant. The production product is web-first. HQBase does not advertise,
> enroll, or expose this compatibility infrastructure, and it is not part of normal release
> acceptance.

The Pro Worker owns the versioned `/api/pro/mail-bridge/v2` HTTPS contract. The separately deployed
Fly bridge translates IMAPS and SMTPS and receives only the Pro HTTPS URL, a deployment-scoped
bridge token, and—when staging is protected—a Cloudflare Access service token. It never receives a
Cloudflare API token or direct D1/R2 credentials.

Implemented in v2:

- separately revocable app passwords, shown once and stored as peppered HMAC verifiers;
- short-lived sessions that fail closed after password, user, mailbox, grant, or entitlement
  revocation;
- paginated mailbox synchronization with persistent `UIDVALIDITY`, `UIDNEXT`, stable UIDs, and an
  opaque replayable change cursor;
- on-demand raw MIME streaming with HTTP byte-range support;
- idempotent SMTP submission with allowed-sender enforcement;
- idempotent flag, append, copy, and expunge mutations using explicit UIDs;
- `NOOP` and polling `IDLE` synchronization for cross-session message, flag, and expunge changes;
- deep authenticated readiness for schema, entitlement, D1, and R2 dependencies.

Local contract and protocol tests cover pagination, cursor replay, range reads, mutations,
revocation, search, partial fetches, and reconnect behavior. Cross-service protocol, readiness,
continuity, and real-client checks are disabled while the feature is dormant.

Current limits:

- mailbox create, rename, and delete are unsupported; HQBase exposes the standard Pro mailbox set;
- `IDLE` polls the change feed rather than using server push;
- the retained acceptance client is not run by the normal staging or release workflow;
- there is no shared production bridge, production hostname, or general customer onboarding path;
  the checked-in Fly app is staging-only and binds to one Pro backend with one deployment token.

The staging app and credentials must never be reused for customers. Any future launch requires a
new product decision plus production routing or per-workspace isolation, customer credential
rotation, redundant capacity, monitoring, rollback, and production deployment automation.

The canonical cross-repository contract is `hqbase-internal/contracts/mail-bridge-v2.md`. The
bridge repository's endpoint reference is `docs/hqbase-api-contract.md` there.
