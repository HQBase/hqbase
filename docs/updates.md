# Updates

HQBase checks the signed Community stable manifest after an owner/admin signs in and every six
hours while the app remains open. A newer directly compatible release produces an **Update
available** banner outside Settings. An incompatible release is shown as recovery-required instead
of advertising an action the installation cannot perform.

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

The Workers Build reads `HQBASE_APP_VERSION` from the active production Worker. It does not use the
generated repository's package version as a substitute for what is installed. Fresh installations
and equal-version identity repairs deploy the verified signed stable artifact with its immutable
release tag. `HQBASE_FORCE_SOURCE_DEPLOY=1` is reserved for deliberately unsigned development
deployments, which are not eligible for in-place Pro upgrades.

Existing unsigned installations created by the obsolete source-deploy path must apply the current
signed Community release before starting a Pro upgrade. After that, the generic updater can install
later signed Community artifacts without merging upstream changes into the customer repository.
