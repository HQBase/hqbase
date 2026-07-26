# HQBase operations

HQBase exposes authenticated workspace diagnostics for owners and administrators. Operational
checks cover the installed product version, schema version, Worker and storage readiness, queue
configuration, mail-domain setup, and the public signed release channel.

Customer content and credentials must not be sent to HQBase-operated services. Debug reports omit
message bodies, attachment bytes, passwords, tokens, and Cloudflare grants.

Use Cloudflare's Worker logs, D1 Time Travel, R2 inventory, queue metrics, and version history for
incident response. Capture the current Worker version and D1 bookmark before a manual deployment or
migration. Restore code and database state as separate, explicit actions.
