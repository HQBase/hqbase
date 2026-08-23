import { sql } from "drizzle-orm";

import { getRow } from "../db/drizzle";
import { AppError } from "../lib/errors";

export const LOGIN_EMAIL_DOMAIN_MESSAGE =
  "Use an email account you can always access, even when HQBase is unavailable. It cannot use a domain connected to this workspace.";

function loginEmailDomain(email: string): string | null {
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
  const managed = await getRow<{ matched: number }>(
    db,
    sql`SELECT 1 AS matched FROM mail_domains WHERE name = ${domain} LIMIT 1`
  );
  if (managed) {
    throw new AppError("LOGIN_EMAIL_DOMAIN_MANAGED", LOGIN_EMAIL_DOMAIN_MESSAGE, 409);
  }
}

export async function assertDomainUnusedByLoginEmails(
  db: D1Database,
  domain: string
): Promise<void> {
  const normalized = domain.trim().toLowerCase();
  const user = await getRow<{ email: string }>(
    db,
    sql`SELECT email FROM "user" WHERE lower(email) LIKE ${`%@${normalized}`} LIMIT 1`
  );
  if (user) {
    throw new AppError(
      "DOMAIN_USED_BY_LOGIN_EMAIL",
      "This domain is used by a workspace Login email. Change that Login email before connecting the domain.",
      409
    );
  }
}
