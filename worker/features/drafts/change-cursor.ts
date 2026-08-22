import { AppError } from "../../lib/errors";

const draftChangeCursorVersion = "dc1";
const maximumSqliteSequence = 9_223_372_036_854_775_807n;

export type DraftChangeCursor = {
  after: string;
  highWater: string | null;
  userId: string;
};

export function encodeDraftChangeCursor(cursor: DraftChangeCursor): string {
  return btoa(
    JSON.stringify([draftChangeCursorVersion, cursor.userId, cursor.after, cursor.highWater])
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

export function decodeDraftChangeCursor(value: string, userId: string): DraftChangeCursor {
  try {
    if (value.length === 0 || value.length > 512) throw new Error("Invalid cursor length.");
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const padding = "=".repeat((4 - (base64.length % 4)) % 4);
    const decoded: unknown = JSON.parse(atob(`${base64}${padding}`));
    if (
      !Array.isArray(decoded) ||
      decoded.length !== 4 ||
      decoded[0] !== draftChangeCursorVersion ||
      decoded[1] !== userId ||
      !isDraftChangeSequence(decoded[2]) ||
      !(decoded[3] === null || isDraftChangeSequence(decoded[3])) ||
      (decoded[3] !== null && BigInt(decoded[2]) > BigInt(decoded[3]))
    ) {
      throw new Error("Invalid cursor payload.");
    }
    return { after: decoded[2], highWater: decoded[3], userId };
  } catch {
    throw new AppError("INVALID_DRAFT_CHANGE_CURSOR", "Draft change cursor is invalid.", 400);
  }
}

export function compareDraftChangeSequences(left: string, right: string): number {
  const a = BigInt(left);
  const b = BigInt(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function isDraftChangeSequence(value: unknown): value is string {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,18})$/u.test(value)) return false;
  return BigInt(value) <= maximumSqliteSequence;
}
