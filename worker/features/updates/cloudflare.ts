import { AppError } from "../../lib/errors";

const cloudflareRequestTimeoutMs = 30_000;

export async function cloudflare<T>(
  url: string,
  init: RequestInit,
  fetcher: typeof fetch
): Promise<T> {
  const signal = init.signal ?? AbortSignal.timeout(cloudflareRequestTimeoutMs);
  let response: Response;
  try {
    response = await fetcher(url, { ...init, signal });
  } catch (error) {
    if (signal.aborted) {
      throw new AppError(
        "UPDATE_CLOUDFLARE_TIMEOUT",
        "Cloudflare did not respond before the update request timed out.",
        504
      );
    }
    throw error;
  }
  const body = (await response.json()) as {
    success?: boolean;
    errors?: Array<{ message?: string }>;
  };
  if (!response.ok || body.success === false)
    throw new AppError(
      "UPDATE_CLOUDFLARE_ERROR",
      body.errors?.[0]?.message ?? "Cloudflare rejected the update request.",
      response.status === 401 || response.status === 403 ? 403 : 502
    );
  return body as T;
}
