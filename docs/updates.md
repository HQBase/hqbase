# Updates

HQBase checks the signed Community stable manifest after an owner/admin signs in and every six
hours while the app remains open. A newer release produces an **Update available** banner outside
Settings.

The current Community release line pins migration and smoke testing to the exact signed Pro version.
The Pro version is attached at zero percent while Community continues to receive all normal traffic.
A no-secret disposable validator Worker selects that exact version for one authorized smoke test and
is removed after promotion. HQBase Preview URLs are explicitly disabled; the separate workers.dev
workspace route is preserved.

Open Settings -> Updates, review compatibility and release notes, then supply a temporary
user-scoped Cloudflare API token with Zone Read, Workers Scripts Read, and Workers Builds
Configuration Edit. HQBase discovers the production Workers Build and starts it; the token is not
stored. The build verifies Ed25519 and SHA-256, records the current Worker version and D1 Time
Travel bookmark, applies migrations, deploys, and records the installed version.

Existing installations created before this updater was introduced require one source update to
this version. After that, the generic updater can install later signed Community artifacts without
merging upstream changes into the customer repository.
