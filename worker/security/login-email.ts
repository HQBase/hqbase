import { AppError } from "../lib/errors";

export const LOGIN_EMAIL_DOMAIN_MESSAGE =
  "Use an email account you can always access, even when HQBase is unavailable. It cannot use a domain connected to this workspace.";

export function loginEmailDomain(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  const separator = normalized.lastIndexOf("@");
  return separator > 0 && separator < normalized.length - 1
    ? normalized.slice(separator + 1)
    : null;
}

export function loginEmailUsesManagedDomain(email: string, domains: string[]): boolean {
  const domain = loginEmailDomain(email);
  if (!domain) return false;
  return domains.some((candidate) => candidate.trim().toLowerCase() === domain);
}

export function assertLoginEmailOutsideDomains(email: string, domains: string[]): void {
  if (loginEmailUsesManagedDomain(email, domains)) {
    throw new AppError("LOGIN_EMAIL_DOMAIN_MANAGED", LOGIN_EMAIL_DOMAIN_MESSAGE, 409);
  }
}

export async function assertLoginEmailOutsideWorkspace(
  db: D1Database,
  email: string
): Promise<void> {
  const domain = loginEmailDomain(email);
  if (!domain) return;
  const managed = await db
    .prepare("SELECT 1 AS matched FROM mail_domains WHERE name = ? LIMIT 1")
    .bind(domain)
    .first<{ matched: number }>();
  if (managed) {
    throw new AppError("LOGIN_EMAIL_DOMAIN_MANAGED", LOGIN_EMAIL_DOMAIN_MESSAGE, 409);
  }
}

export async function assertDomainUnusedByLoginEmails(
  db: D1Database,
  domain: string
): Promise<void> {
  const normalized = domain.trim().toLowerCase();
  const user = await db
    .prepare(`SELECT email FROM "user" WHERE lower(email) LIKE ? LIMIT 1`)
    .bind(`%@${normalized}`)
    .first<{ email: string }>();
  if (user) {
    throw new AppError(
      "DOMAIN_USED_BY_LOGIN_EMAIL",
      "This domain is used by a workspace Login email. Change that Login email before connecting the domain.",
      409
    );
  }
}
