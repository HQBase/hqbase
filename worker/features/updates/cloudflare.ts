import { AppError } from "../../lib/errors";
import { operationalLog } from "../../observability/log";

const cloudflareRequestTimeoutMs = 30_000;
const operationLabels = {
  read_zones: "read the Cloudflare zones",
  read_workers: "read the Worker list",
  read_build_triggers: "read the Workers Builds triggers",
  read_build_trigger: "read the Workers Builds trigger",
  read_build_variables: "read the Workers Builds variables",
  read_latest_build: "read the latest Workers Build",
  set_build_command: "set the Workers Builds deploy command",
  set_build_variables: "set the updater variables",
  delete_build_variable: "remove a signed updater variable",
  start_build: "start the Workers Build"
} as const;

export type CloudflareUpdateOperation = keyof typeof operationLabels;

class CloudflareUpdateError extends AppError {
  readonly ambiguous: boolean;
  readonly operation: CloudflareUpdateOperation;

  constructor(
    code: string,
    message: string,
    status: number,
    operation: CloudflareUpdateOperation,
    ambiguous: boolean
  ) {
    super(code, message, status);
    this.name = "CloudflareUpdateError";
    this.ambiguous = ambiguous;
    this.operation = operation;
  }
}

export function isAmbiguousCloudflareOperation(
  error: unknown,
  operation: CloudflareUpdateOperation
): boolean {
  return error instanceof CloudflareUpdateError && error.operation === operation && error.ambiguous;
}

export async function cloudflare<T>(
  url: string,
  init: RequestInit,
  fetcher: typeof fetch,
  operation: CloudflareUpdateOperation
): Promise<T> {
  const signal = init.signal ?? AbortSignal.timeout(cloudflareRequestTimeoutMs);
  let response: Response;
  try {
    response = await fetcher(url, { ...init, signal });
  } catch {
    logFailure(operation, null, null, null);
    if (signal.aborted) {
      throw new CloudflareUpdateError(
        "UPDATE_CLOUDFLARE_TIMEOUT",
        `Cloudflare did not respond while HQBase tried to ${operationLabels[operation]}.`,
        504,
        operation,
        true
      );
    }
    throw new CloudflareUpdateError(
      "UPDATE_CLOUDFLARE_UNAVAILABLE",
      `HQBase could not ${operationLabels[operation]} because the Cloudflare request failed.`,
      502,
      operation,
      true
    );
  }

  let body: {
    success?: boolean;
    errors?: Array<{ code?: number | string }>;
  };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    const requestId = safeRequestId(response.headers.get("cf-ray"));
    logFailure(operation, response.status, null, requestId);
    throw new CloudflareUpdateError(
      "UPDATE_CLOUDFLARE_INVALID_RESPONSE",
      diagnosticMessage(operation, response.status, null, requestId),
      502,
      operation,
      true
    );
  }

  if (!response.ok || body.success === false) {
    const providerCode = safeProviderCode(body.errors?.[0]?.code);
    const requestId = safeRequestId(response.headers.get("cf-ray"));
    logFailure(operation, response.status, providerCode, requestId);
    throw new CloudflareUpdateError(
      "UPDATE_CLOUDFLARE_ERROR",
      diagnosticMessage(operation, response.status, providerCode, requestId),
      response.status === 401 || response.status === 403 ? 403 : 502,
      operation,
      response.status >= 500
    );
  }
  return body as T;
}

function diagnosticMessage(
  operation: CloudflareUpdateOperation,
  status: number,
  providerCode: string | null,
  requestId: string | null
): string {
  const details = [
    `HTTP ${status}`,
    ...(providerCode ? [`code ${providerCode}`] : []),
    ...(requestId ? [`request ${requestId}`] : [])
  ];
  return `Cloudflare rejected the request to ${operationLabels[operation]} (${details.join(", ")}).`;
}

function logFailure(
  operation: CloudflareUpdateOperation,
  status: number | null,
  providerCode: string | null,
  requestId: string | null
): void {
  operationalLog("warn", "cloudflare_update_request_failed", {
    operation,
    providerCode,
    requestId,
    status
  });
}

function safeProviderCode(value: number | string | undefined): string | null {
  const code = String(value ?? "");
  return /^[0-9A-Za-z_.:-]{1,64}$/.test(code) ? code : null;
}

function safeRequestId(value: string | null): string | null {
  return value && /^[0-9A-Za-z-]{1,128}$/.test(value) ? value : null;
}
