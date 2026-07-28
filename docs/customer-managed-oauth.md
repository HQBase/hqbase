# Customer-managed Cloudflare OAuth

HQBase uses the verified public HQBase OAuth client by default. If a Cloudflare administrator
blocks public OAuth applications, the administrator can register a private OAuth client in the
same Cloudflare account as the HQBase deployment. HQBase still uses Authorization Code with PKCE
and never receives a client secret or API token.

## Register the client

In Cloudflare, create an OAuth client with:

- Grant type: `authorization_code`.
- Response type: `code`.
- Token endpoint authentication method: `none`.
- PKCE method: `S256`.
- Visibility: private.

Register these three exact redirect URLs, replacing `https://mail.example.com` with the canonical
HTTPS origin used to open HQBase:

```text
https://mail.example.com/api/setup/cloudflare/oauth/callback
https://mail.example.com/api/domains/cloudflare/oauth/callback
https://mail.example.com/api/updates/cloudflare/oauth/callback
```

Allow this union of HQBase operation scopes:

```text
workers-scripts.write
workers-ci.write
zone.read
zone-settings.write
email-routing-rule.write
email-sending.write
```

HQBase requests only the subset required by the current setup, domain, or update operation.

## Configure a new deployment

The client ID is public configuration. Do not create or provide a client secret.

```sh
pnpm hqbase install \
  --name production \
  --app-domain mail.example.com \
  --auth-url https://mail.example.com \
  --oauth-mode customer \
  --oauth-client-id YOUR_CLIENT_ID
```

The generated deployment manifest records the client ID and mode for recovery. The generated
Wrangler configuration stores them as non-secret variables in the customer account.

## Switch an existing deployment

Use the named deployment operator so the manifest, generated Wrangler configuration, and deployed
Worker remain aligned:

```sh
pnpm hqbase oauth \
  --name production \
  --mode customer \
  --auth-url https://mail.example.com \
  --client-id YOUR_CLIENT_ID
```

Validate without writing or deploying:

```sh
pnpm hqbase oauth \
  --name production \
  --mode customer \
  --auth-url https://mail.example.com \
  --client-id YOUR_CLIENT_ID \
  --dry-run
```

Return to the verified public HQBase client:

```sh
pnpm hqbase oauth --name production --mode official
```

## Security properties

- The configured canonical origin, not the incoming request Host header, determines every direct
  callback.
- The customer Worker generates the PKCE verifier, exchanges the code, encrypts the temporary
  grant in an HTTP-only cookie, and revokes it after the operation.
- OAuth callback invocation URLs are not persisted in Workers Logs.
- HQBase never stores the Cloudflare access grant in D1 or R2.
