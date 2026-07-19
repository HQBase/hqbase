# HQBase Community release notes

Version-specific behavior belongs here rather than in current deployment or product contracts.

## 0.1.25

- Installs as a standalone webmail app on supported desktop and mobile browsers.
- Keeps the application shell and offline guidance available when the network is unavailable.
- Refreshes cached app assets safely after a new Community release is deployed.
- Keeps account, message, and API responses out of offline storage.

## 0.1.24

- Moves fixed OAuth, Billing, release, version, and trust configuration out of the Deploy to
  Cloudflare form. Customers configure only the Worker and resources they own.
- Remains compatible with supported Community releases from 0.1.3.

## 0.1.22

- Finishes an in-place Pro promotion through a bounded same-origin runtime handoff instead of
  repeatedly reloading the workspace.
- Navigates once to the Pro completion screen only after the active Pro runtime confirms final
  verification and cleanup.
- Shows a retry action if Cloudflare service propagation outlasts the automatic handoff window.

## 0.1.21

- Reloads the existing workspace as soon as the same Worker is promoted to Pro, allowing the active
  Pro application to own final verification and temporary-access cleanup.
- Prevents a still-loaded Community browser bundle from calling Community-only status or advance
  routes after the Pro cutover.

## 0.1.20

- Restores an explicit **Sign in again** action when the owner session expires during an in-place
  Pro upgrade.
- Prevents authentication expiry from appearing as a retry-only infrastructure failure while the
  persisted upgrade remains safely resumable.

## 0.1.19

- Fixes in-place Pro candidate validation against Cloudflare's paginated Worker versions response.
- Fails safely on malformed provider responses instead of exposing a raw runtime error.

## 0.1.18

- Fixes in-place Pro candidate uploads against Cloudflare's strict binding-inheritance API.
- Verifies that the latest uploaded version is still the recorded active signed Community version
  before inheriting bindings and secrets.
- Reserves reauthorization for expired grants; provider configuration failures remain retryable.

## 0.1.17

- Recognizes the empty Worker service shell created by Deploy to Cloudflare as a fresh installation.
- Rejects any other existing Worker without a valid installed Community version.
- Installs the signed Community artifact and generates the masked authentication secret normally.

## 0.1.16

- Keeps newly generated Pro secrets isolated to the candidate Worker version.
- Inherits Community bindings and secrets from the recorded active version.
- Resumes failed upgrade steps from persisted checkpoints.
- Tolerates normal Cloudflare version-propagation delay while Community remains active.

## 0.1.15

- Fresh Deploy to Cloudflare installations deploy the signed stable artifact and immutable release identity.
- Updates compare stable with the active production Worker rather than the cloned repository.
- Pro upgrades verify the active Worker against its exact signed manifest.
- The update banner appears only for directly compatible releases.

## 0.1.13

- Validates a zero-percent Pro candidate through a disposable Worker service binding.
- Gives the validator no storage, secrets, production routes, or general-purpose proxy surface.
- Records the validator as a disposable resource for terminal cleanup.
- Preserves workers.dev and Preview URL settings.
- Supports direct updates from Community 0.1.3 through 0.1.12.

## 0.1.12

- Stages the signed Pro candidate at zero percent while Community retains all traffic.
- Validates the exact candidate through a Cloudflare version override.
- Leaves workers.dev and Preview URL settings unchanged.
- Rejects unexpected active-version or traffic-allocation drift before migration continues.
- Supports direct updates from Community 0.1.3 through 0.1.11.

## 0.1.11

- Adds a bounded edge-propagation window for newly enabled candidate previews.
- Retries only transient preview and edge failures.
- Records only safe candidate HTTP status details.
- Supports direct updates from Community 0.1.3 through 0.1.10.

## 0.1.10

- Routes isolated candidate checks through Cloudflare's public Worker-to-Worker fetch path.
- Adds the required compatibility flag while preserving customer flags.
- Retains bounded preview propagation retries and settings restoration.
- Supports direct updates from Community 0.1.3 through 0.1.9.

## 0.1.9

- Enables Cloudflare Preview URLs only for isolated candidate validation.
- Restores the original Preview URL and workers.dev settings after every outcome.
- Supports direct updates from Community 0.1.3 through 0.1.8.

## 0.1.8

- Validates an immutable version-specific Pro preview instead of a mutable alias.
- Retries only transient preview-route and edge failures.
- Restores original Preview URL and workers.dev settings.
- Supports direct updates from Community 0.1.3 through 0.1.7.

## 0.1.7

- Temporarily enables Cloudflare Preview URLs when isolated candidate validation requires them.
- Restores original Preview URL and workers.dev settings before production promotion.
- Audits preview-setting transitions without sensitive data.
- Supports direct updates from Community 0.1.3 through 0.1.6.

## 0.1.6

- Binds each in-place Pro candidate to its signed release version and Worker digest.
- Stops before migration if the stable Pro release changes after candidate upload.
- Requires isolated validation to report the exact expected product and version.
- Preserves the existing Worker, resources, routes, domains, and secrets.
- Supports direct updates from Community 0.1.3 through 0.1.5.

## 0.1.5

- Persists only encrypted Pro continuation material in customer-controlled D1.
- Resumes after refresh, restart, or browser-profile change when identity and origin still match.
- Keeps Cloudflare codes, verifiers, and grants ephemeral.
- Verifies the signed entitled Pro release before backup or infrastructure mutation.
- Supports direct updates from Community 0.1.3 and 0.1.4.

## 0.1.4

- Adds a durable installation identity.
- Replaces a separate-Worker Pro journey with an owner-only purchase-bound in-place upgrade.
- Discovers and preserves the Worker, D1, R2, routes, domains, data, and secrets.
- Adds resumable progress, backup, migration, rollback records, and guarded legacy recovery.
- Supports direct updates from Community 0.1.3.

## 0.1.3

- Adds token-free Cloudflare OAuth setup.
- Adds signed updates and safer staging resource cleanup.
- Makes immutable release artifacts non-overwritable.
- Supports direct updates from Community 0.1.2.

