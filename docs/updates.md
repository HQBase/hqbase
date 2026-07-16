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

The 0.1.6 release supports direct Pro updates from 0.1.3. Its supported in-place Community-to-Pro
sources use recognized Community schema 5 and preserve attachment references across the Pro
messages-table migration. The temporary recovery snapshot remains available until promoted-service
verification succeeds. Older Community or Pro installations must first reach 0.1.3.
