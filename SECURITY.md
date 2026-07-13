# Security

Please report security issues privately to the project maintainers. Do not open a public issue with exploit details.

HQBase stores auth data in D1 and raw email/attachments in R2. Never commit secrets. Use `wrangler secret put` for deployment secrets.
