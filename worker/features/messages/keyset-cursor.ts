/**
 * Opaque keyset cursors for activity-ordered lists.
 *
 * A cursor holds the version tag, the activity timestamp, and the row id of the last row on the
 * page. The version tag is part of the payload, so a cursor from one list never decodes as a
 * cursor for a different list. Clients must treat the encoded value as opaque.
 */

export type KeysetCursor = {
  activityAt: string;
  id: string;
};

export function encodeKeysetCursor(version: string | number, cursor: KeysetCursor): string {
  return btoa(JSON.stringify([version, cursor.activityAt, cursor.id]))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

/** Returns the cursor, or null when the value is malformed or holds a different version. */
export function decodeKeysetCursor(version: string | number, value: string): KeysetCursor | null {
  try {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const padding = "=".repeat((4 - (base64.length % 4)) % 4);
    const decoded: unknown = JSON.parse(atob(`${base64}${padding}`));
    if (
      !Array.isArray(decoded) ||
      decoded.length !== 3 ||
      decoded[0] !== version ||
      typeof decoded[1] !== "string" ||
      decoded[1].length === 0 ||
      typeof decoded[2] !== "string" ||
      decoded[2].length === 0
    ) {
      return null;
    }
    return { activityAt: decoded[1], id: decoded[2] };
  } catch {
    return null;
  }
}
