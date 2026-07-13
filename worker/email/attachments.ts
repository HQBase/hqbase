export function attachmentSize(content: ArrayBuffer | Uint8Array | string): number {
  if (typeof content === "string") {
    return new TextEncoder().encode(content).byteLength;
  }
  return content.byteLength;
}

export function attachmentBody(
  content: ArrayBuffer | Uint8Array | string
): ArrayBuffer | Uint8Array {
  if (typeof content === "string") {
    return new TextEncoder().encode(content);
  }
  return content;
}
