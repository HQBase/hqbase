export function formatDateTimeLocal(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function defaultPersonalAccessTokenExpiry(now = Date.now()): string {
  return formatDateTimeLocal(new Date(now + 90 * 24 * 60 * 60 * 1000));
}

export function personalAccessTokenExpiryToIso(value: string): string | null {
  if (value === "") return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("Expiry is invalid.");
  return parsed.toISOString();
}
