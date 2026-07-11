import { AppError } from "../../lib/errors";

export function decodeBase64(value: string, maxBytes = 25 * 1024 * 1024): ArrayBuffer {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new AppError("INVALID_BASE64", "Raw message must be valid base64.", 400);
  }
  if (Math.floor((value.length * 3) / 4) > maxBytes) {
    throw new AppError("MESSAGE_TOO_LARGE", "Raw message exceeds 25 MB.", 413);
  }
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes.buffer;
  } catch {
    throw new AppError("INVALID_BASE64", "Raw message must be valid base64.", 400);
  }
}

export function encodeBase64(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}
