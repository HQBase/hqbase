import { AppError } from "../../lib/errors";

const changeCursorVersion = "c1";
const maximumSqliteSequence = 9_223_372_036_854_775_807n;

export type ChangeCursor = {
  after: string;
  highWater: string | null;
};

export function encodeChangeCursor(cursor: ChangeCursor): string {
  return btoa(JSON.stringify([changeCursorVersion, cursor.after, cursor.highWater]))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

export function decodeChangeCursor(value: string): ChangeCursor {
  try {
    if (value.length === 0 || value.length > 512) throw new Error("Invalid cursor length.");
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const padding = "=".repeat((4 - (base64.length % 4)) % 4);
    const decoded: unknown = JSON.parse(atob(`${base64}${padding}`));
    if (
      !Array.isArray(decoded) ||
      decoded.length !== 3 ||
      decoded[0] !== changeCursorVersion ||
      !isChangeSequence(decoded[1]) ||
      !(decoded[2] === null || isChangeSequence(decoded[2])) ||
      (decoded[2] !== null && BigInt(decoded[1]) > BigInt(decoded[2]))
    ) {
      throw new Error("Invalid cursor payload.");
    }
    return { after: decoded[1], highWater: decoded[2] };
  } catch {
    throw new AppError("INVALID_CHANGE_CURSOR", "Change cursor is invalid.", 400);
  }
}

export function compareChangeSequences(left: string, right: string): number {
  const a = BigInt(left);
  const b = BigInt(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function isChangeSequence(value: unknown): value is string {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,18})$/u.test(value)) return false;
  return BigInt(value) <= maximumSqliteSequence;
}
