const canonicalPersonalAccessToken = /hqb_pat_[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/u;

export function assertPatArtifactSecretSafe(value: unknown): void {
  inspectValue(value);
}

function inspectValue(value: unknown): void {
  if (typeof value === "string") {
    rejectCanonicalToken(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) inspectValue(item);
    return;
  }
  if (typeof value !== "object" || value === null) return;

  const record = value as Record<string, unknown>;
  if (
    normalize(record.key) === "accesstoken" &&
    typeof record.value === "string" &&
    record.value.length > 0
  ) {
    reject();
  }
  for (const [key, fieldValue] of Object.entries(record)) {
    rejectCanonicalToken(key);
    const normalizedKey = normalize(key);
    if (
      (normalizedKey === "tokenhash" || normalizedKey === "accesstoken") &&
      isPopulated(fieldValue)
    ) {
      reject();
    }
    inspectValue(fieldValue);
  }
}

function rejectCanonicalToken(value: string): void {
  if (canonicalPersonalAccessToken.test(value)) reject();
}

function normalize(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase().replace(/[^a-z0-9]/gu, "") : "";
}

function isPopulated(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function reject(): never {
  throw new Error("PAT artifact contains sensitive credential material.");
}
