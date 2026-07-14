# Updates

HQBase checks the signed Community stable manifest after an owner/admin signs in and every six
hours while the app remains open. A newer release produces an **Update available** banner outside
Settings.

The 0.1.4 release supports direct Community updates from 0.1.3. Older installations must first
reach 0.1.3; no direct update from an older artifact is claimed.

Open Settings -> Updates, review compatibility and release notes, then supply a temporary
user-scoped Cloudflare API token with Zone Read, Workers Scripts Read, and Workers Builds
Configuration Edit. HQBase discovers the production Workers Build and starts it; the token is not
stored. The build verifies Ed25519 and SHA-256, records the current Worker version and D1 Time
Travel bookmark, applies migrations, deploys, and records the installed version.

Existing installations created before this updater was introduced require one source update to
this version. After that, the generic updater can install later signed Community artifacts without
merging upstream changes into the customer repository.
