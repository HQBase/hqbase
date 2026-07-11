import { AppError, errorBody } from "./errors";

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError("INVALID_JSON", "Request body must be valid JSON.", 400);
  }
}

export function jsonHeaders(headers?: HeadersInit): Headers {
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

export function jsonError(code: string, message: string, status = 400): Response {
  return jsonResponse(errorBody(code, message), { status });
}
