import { AppError } from "./errors";

export const maxJsonBytes = 2 * 1024 * 1024;
export const maxUploadBytes = 26 * 1024 * 1024;

export async function readBoundedBody(
  request: Request,
  limit: number
): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(request.headers.get("content-length"));
  if (declared > limit) throw tooLarge();
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel().catch(() => undefined);
        throw tooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export function requireMediaType(request: Request, expected: string): void {
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== expected) {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", `Content-Type must be ${expected}.`, 415);
  }
}

export async function readUpload(request: Request): Promise<FormData> {
  requireMediaType(request, "multipart/form-data");
  const body = await readBoundedBody(request, maxUploadBytes);
  try {
    return await new Response(body, {
      headers: { "content-type": request.headers.get("content-type") ?? "" }
    }).formData();
  } catch {
    throw new AppError("INVALID_UPLOAD", "Upload must be valid multipart data.", 400);
  }
}

function tooLarge(): AppError {
  return new AppError("REQUEST_TOO_LARGE", "Request body is too large.", 413);
}
