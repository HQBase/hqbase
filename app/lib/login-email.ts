export const LOGIN_EMAIL_HINT =
  "Use an email account you can always access, even when HQBase is unavailable. It cannot use a domain connected to this workspace.";

export function loginEmailUsesManagedDomain(email: string, domains: string[]): boolean {
  const normalized = email.trim().toLowerCase();
  const separator = normalized.lastIndexOf("@");
  if (separator <= 0 || separator === normalized.length - 1) return false;
  const domain = normalized.slice(separator + 1);
  return domains.some((candidate) => candidate.trim().toLowerCase() === domain);
}
