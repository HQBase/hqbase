export function isSafeInlineImage(contentType: string): boolean {
  return ["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"].includes(
    normalizedContentType(contentType)
  );
}

export function normalizedContentType(contentType: string): string {
  return contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "application/octet-stream";
}
