# Updates

Owners and admins see **Update available** in the normal application shell when a newer signed Pro
stable release exists. Settings -> Updates contains compatibility, release notes, and the guarded
Workers Builds action.

The public `HQBase/hqbase-pro-deploy` repository contains the persistent generic updater, not Pro
product source. A build uses its masked license secret to request a ten-minute artifact token from
the HQBase billing service. Inactive licenses cannot download new releases; the already-installed
mail service continues under the billing safety policy.

Before a Pro-to-Pro migration the updater records D1 Time Travel and the active Worker version.
The artifact signature and SHA-256 digest are verified before extraction. Migrations run before the
Worker replacement, and exact D1 and Worker recovery commands are printed on failure.

Each signed release declares its minimum supported source version and schema. Version-specific
compatibility and migration details live in that release's notes rather than this current-state
guide. Unsupported installations stop before mutation with an explicit update path.

Public version-specific history lives in
[`HQBase/hqbase-pro-deploy/RELEASE_NOTES.md`](https://github.com/HQBase/hqbase-pro-deploy/blob/main/RELEASE_NOTES.md).
