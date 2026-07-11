# Mail bridge preview

The Pro Worker owns `/api/pro/mail-bridge/v1`. The Fly bridge receives only its deployment token and the Pro HTTPS URL.

Implemented:

- separately revocable app passwords, shown once and stored as peppered HMACs;
- short-lived mail sessions revoked with their app password;
- standard-folder snapshots with persistent UIDs;
- bounded raw MIME retrieval;
- idempotent SMTP submission with raw MIME retention;
- idempotent flag replacement by UID.

Preview limitations:

- the snapshot response must become cursor-based and stream raw MIME before large mailboxes;
- append, copy, move, archive, trash, expunge, folder changes, and `IDLE` propagation are not persisted yet;
- the bridge must identify sequence-number versus UID targets before general flag/copy support;
- entitlement enforcement is not implemented.

These limitations are explicit API errors. This build is for contract and staging validation, not production mail-client use.
