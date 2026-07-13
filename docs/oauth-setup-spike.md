# Cloudflare OAuth Setup

Community setup uses Cloudflare Self-Managed OAuth Authorization Code with PKCE.
The normal `/setup` path does not require the administrator to create, paste, or
delete an API token.

## Architecture

1. The customer-owned Worker creates the PKCE verifier and state, stores both in
   secure HTTP-only cookies, and sends only the challenge to `auth.hqbase.io`.
2. The stateless relay signs the customer callback and redirects to the fixed
   HQBase Community OAuth client. It never receives a token or calls customer APIs.
3. Cloudflare returns the authorization code through the relay to the customer Worker.
4. The customer Worker exchanges the code directly with Cloudflare and stores
   only the access token in an encrypted, short-lived HTTP-only cookie.
5. The Worker lists zones and configures the selected custom domain, Email
   Routing DNS, catch-all Worker rule, and Email Sending.
6. When all readiness checks pass, the Worker revokes the OAuth grant and clears
   the encrypted cookie.

The OAuth token is never exposed to browser JavaScript and is never written to
D1, R2, logs, billing, or the redirect relay. No refresh token is stored.

## Scopes

Community uses its own OAuth client and requests only:

- Account / Email Sending / Edit.
- Account / Workers Scripts / Edit.
- Zone / Zone / Read.
- Zone / Zone Settings / Edit.
- Zone / Email Routing Rules / Edit.

Pro uses a separate client because its fresh-install flow also needs Workers CI
Edit. Community contains no Pro installer, licensing, billing, or entitlement code.

## Fallback and Remaining Manual Work

`Use an API token instead` keeps setup usable for forks, custom OAuth clients,
and accounts where the public OAuth client is unavailable. The token is sent
only with setup requests and is never stored.

OAuth does not bypass Cloudflare product eligibility or company policy review.
Administrators still need an active Cloudflare-managed domain and may need to
confirm Email Sending enrollment, SPF/DKIM/DMARC policy, catch-all behavior, and
external deliverability.
