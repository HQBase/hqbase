import { AppError } from "./errors";
import { maxJsonBytes, readBoundedBody, requireMediaType } from "./request-body";

export async function readJson(request: Request): Promise<unknown> {
  requireMediaType(request, "application/json");
  const body = await readBoundedBody(request, maxJsonBytes);
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new AppError("INVALID_JSON", "Request body must be valid JSON.", 400);
  }
}

function jsonHeaders(headers?: HeadersInit): Headers {
  const next = new Headers(headers);
  next.set("content-type", "application/json; charset=utf-8");
  return next;
}

export function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: jsonHeaders(init?.headers)
  });
}
