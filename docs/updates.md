# Updates

HQBase has one public stable release channel. The canonical repository publishes a signed
`stable.json` release asset at:

`https://github.com/HQBase/hqbase/releases/latest/download/stable.json`

The updater downloads that stable URL directly rather than polling the GitHub API. It verifies the
Ed25519 signature, confirms `product: "hqbase"`, verifies the archive SHA-256 digest and size, and
checks the installed version and schema compatibility before changing customer resources.

An update records the active Worker version and a D1 Time Travel bookmark, applies migrations,
deploys the verified public artifact, and verifies the result. A failed deployment restores the
previous Worker version. Database rollback remains a deliberate operator action because it can
discard writes made after the bookmark.

Starting an update from the app requires a short-lived Cloudflare OAuth grant. HQBase revokes the
grant after use. The browser talks directly to Cloudflare, and the verified release comes directly
from the canonical public repository.

Release artifacts, manifests, checksums, and release notes are public GitHub Release assets owned
by the canonical repository.
