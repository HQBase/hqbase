const supportedBasePaths = new Set(["/api", "/api/v2"]);

export function stagingMailApiPath(
  path: string,
  basePath = process.env.HQBASE_STAGING_MAIL_API_BASE_PATH ?? "/api/v2"
): string {
  if (!supportedBasePaths.has(basePath)) {
    throw new Error("HQBASE_STAGING_MAIL_API_BASE_PATH must be /api or /api/v2.");
  }
  if (!path.startsWith("/")) throw new Error("Staging Mail API paths must start with /.");
  return `${basePath}${path}`;
}
