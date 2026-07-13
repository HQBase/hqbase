# Cloudflare Email Setup

HQBase requires a Cloudflare-managed domain for the core product. The domain can
be registered anywhere, but its authoritative DNS must be on Cloudflare before
HQBase can receive mail through Cloudflare Email Routing / Email Service.

## Domain Requirements

- The primary domain must be active in the same Cloudflare account as the Worker.
- DNS must be managed by Cloudflare. If the domain is not on Cloudflare yet, add
  it to Cloudflare first, review the imported DNS records, update nameservers at
  the registrar, and wait until Cloudflare marks the domain Active.
- Email Routing or Email Service must be enabled for the domain.
- External-DNS-only domains are not supported by the core product.

After the domain is active on Cloudflare, HQBase can automate most email setup
from the in-app setup wizard or from the repeatable operator.

## In-App Setup Automation

Public Deploy Button installs use `/setup` after the Worker is deployed:

1. Click `Authorize Cloudflare` and approve the requested account and zone access.
2. HQBase returns to `/setup` and loads the domains available to that grant.
3. Select the primary domain and choose the editable workspace subdomain. The
   selected domain is the fixed suffix for the app address.
4. Click `Connect domain and continue`. HQBase configures Cloudflare and advances
   to the owner account only after every required check passes.

On the owner step, choose only the part before `@`. HQBase combines it with the
selected domain and uses the complete address as the owner login.

The customer-owned Worker exchanges the PKCE authorization code directly with
Cloudflare. The setup grant is encrypted in a short-lived HTTP-only cookie; it
is never exposed to browser JavaScript or stored in D1 or R2. HQBase uses it to
enable Email Routing DNS, point the catch-all route at the deployed Worker, and
enable Email Sending. Once every readiness check and the custom domain step
succeeds, HQBase revokes the grant and clears the cookie.

The consent screen requests:

- Account / Email Sending / Edit.
- Account / Workers Scripts / Edit.
- Zone / Zone / Read.
- Zone / Zone Settings / Edit.
- Zone / Email Routing Rules / Edit.

Cloudflare separates Email Routing rules from Email Routing zone settings. The
catch-all Worker route uses Email Routing permissions, while enabling Email
Routing DNS/settings requires Zone Settings access.

`Use an API token instead` is an advanced fallback for forks and accounts where
the public OAuth client is unavailable. The fallback token needs the same
permissions and is used only for the setup requests; HQBase never stores it.

## Inbound Checklist

- Enable Email Routing / Email Service.
- Create a catch-all route for the domain.
- Route catch-all inbound mail to the HQBase Worker.
- Confirm the Worker has the D1 and R2 bindings in `wrangler.jsonc`.

The repeatable operator can perform the same Cloudflare Email Routing/Sending
steps for a named development deployment:

```sh
pnpm hqbase:install --name dev-01 --domain example.com
```

Use `pnpm hqbase:reset --name dev-01 --scope domain` to disable the catch-all Worker route and disable Email Sending/Routing if this operator enabled them.

## Outbound Checklist

- Enable Cloudflare Email Sending for the domain.
- Configure the Worker `send_email` binding named `MAIL_SENDER`.
- Add required SPF records.
- Add required DKIM records.
- Add a DMARC policy.

## Troubleshooting

- If inbound mail does not appear, confirm the catch-all route targets the deployed Worker.
- If Email Routing DNS shows `Authentication error`, add Zone Settings / Edit to
  the manual fallback token, or authorize Cloudflare again and retry the domain connection.
- If sent mail fails, confirm Email Sending is enabled and the sender mailbox uses the primary domain.
- If attachments are missing, confirm the `MAIL_OBJECTS` R2 bucket exists and is bound.
