# Updates

HQBase has one public stable release channel. The canonical repository publishes a signed
`stable.json` release asset at:

`https://github.com/HQBase/hqbase/releases/latest/download/stable.json`

The updater downloads that stable URL directly rather than polling the GitHub API. It verifies the
Ed25519 signature, confirms `product: "hqbase"`, verifies the archive SHA-256 digest and size, and
checks the installed version and schema compatibility before changing customer resources.

An update records the active Worker version and a D1 Time Travel bookmark, applies migrations,
deploys the verified public artifact, checks Cloudflare deployment status, and records the installed
release. If a failure occurs after the checkpoint, the updater prints exact Worker and D1 recovery
commands. Both rollbacks remain deliberate operator actions because a database restore can discard
writes made after the bookmark.

Starting an update from the app requires a short-lived Cloudflare OAuth grant. HQBase revokes the
grant after use. The verified public client uses the public HQBase relay; customer-managed clients
redirect directly between the customer Worker and Cloudflare. In both modes the customer Worker
performs the token exchange, and the verified release comes directly from the canonical public
repository.

Release artifacts, manifests, checksums, and release notes are public GitHub Release assets owned
by the canonical repository.

For publication, GitHub Actions signs and uploads one draft candidate, installs the previous stable
release in disposable staging, applies that exact candidate through the normal updater, and runs the
deployed lifecycle and backup/restore checks. The workflow publishes the draft only after those
checks pass.
