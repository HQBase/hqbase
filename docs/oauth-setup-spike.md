# Cloudflare OAuth Setup

HQBase Pro uses Cloudflare OAuth Authorization Code with PKCE so an admin can grant scoped access
without creating or pasting an API token. The canonical cross-repository contract is
`hqbase-internal/decisions/007-cloudflare-oauth-onboarding.md`.

## Flow

1. The customer-owned installer generates a verifier, challenge, and state.
2. `auth.hqbase.io` signs the allowed return route and redirects to Cloudflare. It never exchanges
   the code or receives access and refresh tokens.
3. Cloudflare displays the selected accounts, zones, and requested permissions.
4. The installer exchanges the returned code directly with Cloudflare and uses the access token to
   configure masked build/runtime secrets and start the licensed Pro build.
5. The token continues into Pro as a masked setup secret. Initial setup uses it for domain, Email
   Routing, Email Sending, and Worker custom-domain configuration.
6. After workspace creation, Pro deletes the setup secret and revokes the grant. No refresh token
   is stored.

## Permissions

- Account / Workers Scripts / Edit.
- Account / Workers CI / Edit.
- Account / Email Sending / Edit.
- Zone / Zone / Read.
- Zone / Zone Settings / Edit.
- Zone / Email Routing Rules / Edit.

Cloudflare may still require dashboard-only product enrollment, Git provider authorization, domain
ownership, or email policy confirmation. Workers Builds OAuth compatibility is a production release
gate because its current documentation names user-scoped API tokens explicitly.
