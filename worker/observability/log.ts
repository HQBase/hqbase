const forbiddenKeys = new Set([
  "address",
  "attachment",
  "body",
  "content",
  "credential",
  "email",
  "filename",
  "password",
  "raw",
  "recipient",
  "secret",
  "subject",
  "token",
  "tokenhash",
  "accesstoken",
  "refreshtoken",
  "authorization",
  "authorizationheader",
  "requestbody",
  "responsebody"
]);

export type LogFields = Record<string, boolean | number | string | null>;

export function operationalLog(
  level: "error" | "info" | "warn",
  event: string,
  fields: LogFields = {}
): void {
  for (const key of Object.keys(fields)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/gu, "");
    if (forbiddenKeys.has(normalizedKey)) {
      throw new Error(`Sensitive operational log field rejected: ${key}`);
    }
  }
  console[level](JSON.stringify({ level, event, ...fields }));
}
