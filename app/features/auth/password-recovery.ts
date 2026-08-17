const fallbackOrigin = "https://hqbase.local";
const recoveryPaths = new Set(["/forgot-password", "/reset-password", "/set-password"]);

export function safeAuthenticationReturnPath(
  value: string | null,
  origin = fallbackOrigin
): string {
  if (!value) return "/";
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || recoveryPaths.has(url.pathname)) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export function authenticationPath(pathname: string, returnTo: string): string {
  const url = new URL(pathname, fallbackOrigin);
  if (returnTo !== "/") url.searchParams.set("returnTo", returnTo);
  return `${url.pathname}${url.search}`;
}
