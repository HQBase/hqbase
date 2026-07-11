# Cloudflare OAuth Setup Spike

Cloudflare Self-Managed OAuth could later improve HQBase onboarding by letting an admin grant scoped access without pasting a temporary API token. The current OSS setup wizard uses a scoped Cloudflare API token only during `/setup` to list zones and configure email.

## Product Positioning

The OSS setup path can keep the temporary Cloudflare API token flow because it is
self-contained and does not require HQBase to operate a hosted service. This is
functional, but it is also a high-friction step: the admin must create a custom
token, choose the right scopes, paste it into `/setup`, and delete it after
setup if they want a one-time grant.

A future commercial onboarding path should turn this into a Pro upsell:

- OSS: create and paste a temporary scoped Cloudflare API token manually.
- Pro: click `Authorize Cloudflare`, approve the HQBase OAuth app, and let HQBase
  complete domain/app/email setup from the delegated grant.

The commercial value is reduced setup risk and fewer Cloudflare dashboard steps,
not a different email core. The Pro path would likely require an HQBase-hosted
setup broker or verified OAuth client so each self-hosted install does not need
to create its own Cloudflare OAuth application.

## Can Be Automated Later

- Domain lookup through Cloudflare APIs.
- D1 database creation if the OAuth app receives account-level database permissions.
- R2 bucket creation with account-level R2 permissions.
- Worker deployment if the app can write Workers scripts and bindings.
- Some DNS record creation for SPF, DKIM, and DMARC if the zone grants DNS edit scope.

## Likely Partially Automatable

- Email Routing setup depends on available Cloudflare Email Routing APIs and account feature availability.
- Email Sending setup may still require sender/domain verification steps.
- Worker email route configuration may require zone-level routing permissions.
- Catch-all routing can only be automated if Cloudflare exposes the needed Email Routing rule APIs for the account.

## Cannot Reliably Be Automated

- User confirmation that DNS and email policies are correct for their company.
- External recipient deliverability validation.
- Any Cloudflare product enrollment step that requires dashboard-only acceptance or billing confirmation.

## Likely Scopes

- Account read.
- Zone read.
- DNS edit.
- Workers scripts edit.
- D1 edit.
- R2 edit.
- Email Routing / Email Service edit if available as OAuth scopes.

## Manual Actions Remaining

- Confirm domain ownership and active nameservers.
- Review SPF/DKIM/DMARC policy.
- Confirm Email Sending eligibility.
- Confirm catch-all behavior before production use.

## Deferred Until Post-MVP

- OAuth onboarding UI.
- Automatic resource provisioning.
- Automatic DNS mutation.
- Automatic Worker redeploy from the app.
