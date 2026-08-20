import type {
  CreatePersonalAccessTokenInput,
  CreatePersonalAccessTokenResponse,
  PersonalAccessTokenList,
  PersonalAccessTokenMetadata
} from "./types";

const ambiguousCreateMessage =
  "Token creation might have completed. Refresh the list and revoke any token whose value you did not receive.";

const createErrors = {
  UNAUTHENTICATED: { status: 401, message: "Sign in again." },
  RECENT_AUTH_REQUIRED: { status: 403, message: "Confirm your password and try again." },
  INVALID_PERSONAL_ACCESS_TOKEN: {
    status: 400,
    message: "Check the token name and expiry."
  },
  PERSONAL_ACCESS_TOKEN_LIMIT_REACHED: {
    status: 409,
    message: "Revoke an active personal access token before creating another."
  },
  RATE_LIMITED: {
    status: 429,
    message: "Too many token creation attempts. Wait and try again."
  }
} as const;

export class AmbiguousPersonalAccessTokenCreateError extends Error {
  constructor() {
    super(ambiguousCreateMessage);
    this.name = "AmbiguousPersonalAccessTokenCreateError";
  }
}

export class PersonalAccessTokenApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "PersonalAccessTokenApiError";
  }
}

export async function listPersonalAccessTokens(): Promise<PersonalAccessTokenList> {
  const response = await fetch("/api/personal-access-tokens", {
    cache: "no-store",
    credentials: "include",
    method: "GET"
  });
  if (!response.ok) throw new Error("Personal access tokens could not be loaded.");
  return response.json<PersonalAccessTokenList>();
}

export async function revokePersonalAccessToken(id: string): Promise<void> {
  const response = await fetch(`/api/personal-access-tokens/${encodeURIComponent(id)}`, {
    cache: "no-store",
    credentials: "include",
    method: "DELETE"
  });
  if (response.status !== 204) throw new Error("The personal access token could not be revoked.");
}

export async function createPersonalAccessToken(
  input: CreatePersonalAccessTokenInput
): Promise<CreatePersonalAccessTokenResponse> {
  let response: Response;
  try {
    response = await fetch("/api/personal-access-tokens", {
      body: JSON.stringify(input),
      cache: "no-store",
      credentials: "include",
      headers: { "content-type": "application/json" },
      method: "POST"
    });
  } catch {
    throw new AmbiguousPersonalAccessTokenCreateError();
  }

  if (response.status >= 500 && response.status <= 599) {
    throw new AmbiguousPersonalAccessTokenCreateError();
  }
  if (response.status >= 200 && response.status <= 299) {
    let value: unknown;
    try {
      value = await response.json();
      return readCreateResponse(value);
    } catch {
      throw new AmbiguousPersonalAccessTokenCreateError();
    }
  }
  if (response.status >= 400 && response.status <= 499) {
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new AmbiguousPersonalAccessTokenCreateError();
    }
    const code = readErrorCode(value);
    if (code && code in createErrors) {
      const knownError = createErrors[code as keyof typeof createErrors];
      if (knownError.status === response.status) {
        throw new PersonalAccessTokenApiError(code, knownError.status, knownError.message);
      }
    }
  }
  throw new AmbiguousPersonalAccessTokenCreateError();
}

function readCreateResponse(value: unknown): CreatePersonalAccessTokenResponse {
  if (!isRecord(value) || typeof value.token !== "string") throw new Error("Invalid response.");
  return {
    personalAccessToken: readMetadata(value.personalAccessToken),
    token: value.token
  };
}

function readMetadata(value: unknown): PersonalAccessTokenMetadata {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.userId !== "string" ||
    typeof value.ownerName !== "string" ||
    typeof value.name !== "string" ||
    typeof value.tokenSuffix !== "string" ||
    typeof value.createdAt !== "string" ||
    (typeof value.expiresAt !== "string" && value.expiresAt !== null)
  ) {
    throw new Error("Invalid response.");
  }
  return {
    id: value.id,
    userId: value.userId,
    ownerName: value.ownerName,
    name: value.name,
    tokenSuffix: value.tokenSuffix,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt
  };
}

function readErrorCode(value: unknown): string | null {
  return isRecord(value) && isRecord(value.error) && typeof value.error.code === "string"
    ? value.error.code
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
