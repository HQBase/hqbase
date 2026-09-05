import { AppError } from "../../lib/errors";

export const maxSearchTextBytes = 256 * 1024;

export function searchTextProjection(value: string): { text: string; truncated: boolean } {
  const encoded = new TextEncoder().encode(value);
  if (encoded.byteLength <= maxSearchTextBytes) return { text: value, truncated: false };
  // Drop an incomplete final code point instead of inserting a replacement character.
  let end = maxSearchTextBytes;
  while (end > 0 && ((encoded[end] ?? 0) & 0xc0) === 0x80) end -= 1;
  return { text: new TextDecoder().decode(encoded.subarray(0, end)), truncated: true };
}

export async function loadMessageText(
  bucket: R2Bucket | undefined,
  key: string | null | undefined,
  projection: string
): Promise<string> {
  if (!key) return projection;
  if (!bucket)
    throw new AppError("MESSAGE_BODY_UNAVAILABLE", "Message storage is unavailable.", 503);
  const object = await bucket.get(key);
  if (!object)
    throw new AppError("MESSAGE_BODY_UNAVAILABLE", "The full message body is unavailable.", 503);
  return object.text();
}

export async function storeMessageBody(
  bucket: R2Bucket,
  text: string,
  html: string | undefined,
  base: string
) {
  const projection = searchTextProjection(text);
  const textR2Key = projection.truncated ? `${base}/body.txt` : null;
  const htmlR2Key = html ? `${base}/body.html` : null;
  if (textR2Key)
    await bucket.put(textR2Key, text, {
      httpMetadata: { contentType: "text/plain; charset=utf-8" }
    });
  if (htmlR2Key)
    await bucket.put(htmlR2Key, html ?? "", {
      httpMetadata: { contentType: "text/html; charset=utf-8" }
    });
  return { textBody: projection.text, textR2Key, htmlR2Key };
}
