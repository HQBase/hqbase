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

1. Approve the requested accounts, zones, and permissions in the Cloudflare OAuth screen during
   Pro installation.
2. Open `/setup`. HQBase verifies the delegated installation grant automatically.
3. Select the primary domain and choose the editable workspace subdomain. The
   selected domain is the fixed suffix for the app address.
4. Click `Connect domain and continue`. HQBase configures Cloudflare and advances
   to the owner account only after every required check passes.

On the owner step, choose only the part before `@`. HQBase combines it with the
selected domain and uses the complete address as the owner login.

The setup wizard uses the delegated grant to enable Email Routing DNS, point the catch-all route at
the deployed Worker, and enable Email Sending when permitted by the account. The access token is a
masked Worker secret, is never stored in D1, and is deleted and revoked after setup.

OAuth permissions:

- Account / Email Sending / Edit.
- Account / Workers Scripts / Edit.
- Zone / Zone / Read.
- Zone / Zone Settings / Edit.
- Zone / Email Routing Rules / Edit.

Cloudflare separates Email Routing rules from Email Routing zone settings. The
catch-all Worker route uses Email Routing permissions, while enabling Email
Routing DNS/settings requires Zone Settings access.

## Inbound Checklist

- Enable Email Routing / Email Service.
- Create a catch-all route for the domain.
- Route catch-all inbound mail to the HQBase Worker.
- Confirm the Worker has the D1 and R2 bindings in `wrangler.jsonc`.

The repeatable operator can perform the same Cloudflare Email Routing/Sending
steps for a named development deployment:

```sh
pnpm hqbase-pro:install --name dev-01 --domain example.com
```

Use `pnpm hqbase-pro:reset --name dev-01 --scope domain` to disable the catch-all Worker route and disable Email Sending/Routing if this operator enabled them.

## Outbound Checklist

- Enable Cloudflare Email Sending for the domain.
- Configure the Worker `send_email` binding named `MAIL_SENDER`.
- Add required SPF records.
- Add required DKIM records.
- Add a DMARC policy.

## Troubleshooting

- If inbound mail does not appear, confirm the catch-all route targets the deployed Worker.
- If Email Routing DNS shows `Authentication error`, confirm Zone Settings / Edit was approved and
  restart authorization.
- If sent mail fails, confirm Email Sending is enabled and the sender mailbox uses the primary domain.
- If attachments are missing, confirm the `MAIL_OBJECTS` R2 bucket exists and is bound.
