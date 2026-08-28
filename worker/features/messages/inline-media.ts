export function isSafeInlineImage(contentType: string): boolean {
  return ["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"].includes(
    normalizedContentType(contentType)
  );
}

export function hasSafeInlineImageMagic(
  contentType: string,
  bytes: Uint8Array,
  totalByteLength = bytes.byteLength
): boolean {
  switch (normalizedContentType(contentType)) {
    case "image/png":
      return hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/jpeg":
      return hasBytes(bytes, 0, [0xff, 0xd8, 0xff]);
    case "image/gif":
      return hasAscii(bytes, 0, "GIF87a") || hasAscii(bytes, 0, "GIF89a");
    case "image/webp":
      return hasAscii(bytes, 0, "RIFF") && hasAscii(bytes, 8, "WEBP");
    case "image/avif":
      return hasAvifMagic(bytes, totalByteLength);
    default:
      return false;
  }
}

export function normalizedContentType(contentType: string): string {
  return contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "application/octet-stream";
}

function hasAvifMagic(bytes: Uint8Array, totalByteLength: number): boolean {
  if (!hasAscii(bytes, 4, "ftyp")) return false;
  const boxSize =
    (((bytes[0] ?? 0) << 24) |
      ((bytes[1] ?? 0) << 16) |
      ((bytes[2] ?? 0) << 8) |
      (bytes[3] ?? 0)) >>>
    0;
  if (boxSize < 16 || boxSize > totalByteLength) return false;
  const availableBoxBytes = Math.min(boxSize, bytes.byteLength);
  for (let offset = 8; offset + 4 <= availableBoxBytes; offset += offset === 8 ? 8 : 4) {
    if (hasAscii(bytes, offset, "avif") || hasAscii(bytes, offset, "avis")) return true;
  }
  return false;
}

function hasAscii(bytes: Uint8Array, offset: number, value: string): boolean {
  return hasBytes(
    bytes,
    offset,
    Array.from(value, (character) => character.charCodeAt(0))
  );
}

function hasBytes(bytes: Uint8Array, offset: number, values: number[]): boolean {
  return values.every((value, index) => bytes[offset + index] === value);
}
