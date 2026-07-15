import { z } from "zod";

import { AppError } from "../../lib/errors";

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";

const cloudflareEnvelopeSchema = z.object({
  errors: z
    .array(
      z.object({
        code: z.number().optional(),
        message: z.string()
      })
    )
    .nullish()
    .transform((value) => value ?? []),
  messages: z
    .array(z.unknown())
    .nullish()
    .transform((value) => value ?? []),
  result: z.unknown().nullable().optional(),
  result_info: z
    .object({
      page: z.number().optional(),
      total_pages: z.number().optional()
    })
    .optional(),
  success: z.boolean()
});

export async function safeCloudflareRequest<T extends z.ZodType>(
  apiToken: string,
  path: string,
  schema: T,
  init?: RequestInit
): Promise<{ ok: true; result: z.infer<T> } | { error: string; ok: false }> {
  try {
    return {
      ok: true,
      result: await cloudflareRequestResult(apiToken, path, schema, init)
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Cloudflare request failed.",
      ok: false
    };
  }
}

export async function cloudflareRequestResult<T extends z.ZodType>(
  apiToken: string,
  path: string,
  schema: T,
  init?: RequestInit
): Promise<z.infer<T>> {
  return (await cloudflareRequest(apiToken, path, schema, init)).result;
}

export async function cloudflareRequest<T extends z.ZodType>(
  apiToken: string,
  path: string,
  schema: T,
  init?: RequestInit
): Promise<{ result: z.infer<T>; resultInfo?: { totalPages: number } }> {
  const response = await fetch(`${CLOUDFLARE_API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      authorization: `Bearer ${apiToken}`,
      ...init?.headers
    }
  });

  const data = cloudflareEnvelopeSchema.parse(await response.json());
  if (!response.ok || !data.success) {
    const message = cloudflareErrorMessage(path, data.errors[0]?.message);
    throw new AppError("CLOUDFLARE_API_ERROR", message, response.ok ? 400 : response.status);
  }

  const result = schema.safeParse(data.result);
  if (!result.success) {
    throw new AppError(
      "CLOUDFLARE_API_RESPONSE_INVALID",
      `Cloudflare API returned an unexpected response for ${path}.`,
      502
    );
  }

  const totalPages = data.result_info?.total_pages;
  return {
    result: result.data,
    ...(totalPages === undefined ? {} : { resultInfo: { totalPages } })
  };
}

function cloudflareErrorMessage(path: string, message?: string): string {
  if (!message) return "Cloudflare API request failed.";
  if (
    path.includes("/email/sending/") &&
    /plan|subscription|entitl|workers paid|not available/i.test(message)
  ) {
    return "Outbound Email Sending requires Workers Paid in this Cloudflare account. Enable Workers Paid, then retry this resumable step.";
  }
  if (isEmailRoutingSettingsPath(path) && isAuthenticationError(message)) {
    return [
      "Cloudflare rejected the Email Routing DNS/settings request.",
      "Add Zone Settings Edit to the setup token, then retry the domain connection."
    ].join(" ");
  }
  if (message.toLowerCase().includes("invalid api token")) {
    return [
      "Cloudflare rejected this API token.",
      "Click Create Token, then paste the token value shown once after creation.",
      "Do not paste the token name, token ID, JSON payload, Terraform output, or a Global API Key."
    ].join(" ");
  }
  return message;
}

function isEmailRoutingSettingsPath(path: string): boolean {
  return /\/zones\/[^/]+\/email\/routing(?:\/dns)?$/.test(path);
}

function isAuthenticationError(message: string): boolean {
  return message.toLowerCase().includes("authentication error");
}
