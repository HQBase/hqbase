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
  "token"
]);

export type LogFields = Record<string, boolean | number | string | null>;

export function operationalLog(
  level: "error" | "info" | "warn",
  event: string,
  fields: LogFields = {}
): void {
  for (const key of Object.keys(fields)) {
    if (forbiddenKeys.has(key.toLowerCase())) {
      throw new Error(`Sensitive operational log field rejected: ${key}`);
    }
  }
  console[level](JSON.stringify({ level, event, ...fields }));
}
