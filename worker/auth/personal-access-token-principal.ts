import { z } from "zod";

import type { WorkspaceRole } from "../lib/validation";
import { workspaceRoleSchema } from "../lib/validation";

import { hashPersonalAccessToken, parsePersonalAccessToken } from "./personal-access-token-secret";

export type PersonalAccessTokenPrincipal = {
  tokenId: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: WorkspaceRole;
  };
};

export type PersonalAccessTokenPrincipalRow = {
  tokenId: unknown;
  userId: unknown;
  email: unknown;
  name: unknown;
  role: unknown;
  banned: unknown;
  banExpires: unknown;
  onboardingStatus: unknown;
  expiresAt: unknown;
  revokedAt: unknown;
};

export class PersonalAccessTokenError extends Error {
  constructor() {
    super("Personal access token is invalid or inactive.");
    this.name = "PersonalAccessTokenError";
  }
}

const identitySchema = z.object({
  tokenId: z.string().regex(/^pat_[A-Za-z0-9_-]+$/u),
  userId: z.string().min(1),
  email: z.email(),
  name: z.string(),
  role: workspaceRoleSchema
});

export function validatePersonalAccessTokenPrincipalRow(
  row: PersonalAccessTokenPrincipalRow,
  now = Date.now()
): PersonalAccessTokenPrincipal {
  const identity = identitySchema.safeParse(row);
  if (!identity.success) throw new PersonalAccessTokenError();

  if (row.revokedAt !== null) throw new PersonalAccessTokenError();
  if (row.expiresAt !== null) {
    if (typeof row.expiresAt !== "string") throw new PersonalAccessTokenError();
    const expiresAt = Date.parse(row.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now) throw new PersonalAccessTokenError();
  }

  if (row.banned !== null && row.banned !== 0 && row.banned !== 1) {
    throw new PersonalAccessTokenError();
  }
  if (row.banned === 1) {
    if (typeof row.banExpires !== "string") throw new PersonalAccessTokenError();
    const banExpires = Date.parse(row.banExpires);
    if (!Number.isFinite(banExpires) || banExpires > now) {
      throw new PersonalAccessTokenError();
    }
  }

  if (row.onboardingStatus !== null && row.onboardingStatus !== "complete") {
    throw new PersonalAccessTokenError();
  }

  return {
    tokenId: identity.data.tokenId,
    user: {
      id: identity.data.userId,
      email: identity.data.email,
      name: identity.data.name,
      role: identity.data.role
    }
  };
}

export async function authenticatePersonalAccessToken(
  db: D1Database,
  bearer: string,
  now = Date.now()
): Promise<PersonalAccessTokenPrincipal> {
  let parsedBearer: string;
  try {
    parsedBearer = parsePersonalAccessToken(bearer);
  } catch {
    throw new PersonalAccessTokenError();
  }

  const row = await db
    .prepare(
      `SELECT pat.id AS tokenId, pat.user_id AS userId,
              owner.email AS email, owner.name AS name, owner.role AS role,
              owner.banned AS banned, owner.banExpires AS banExpires,
              onboarding.status AS onboardingStatus,
              pat.expires_at AS expiresAt, pat.revoked_at AS revokedAt
       FROM personal_access_tokens pat
       JOIN "user" owner ON owner.id = pat.user_id
       LEFT JOIN user_onboarding onboarding ON onboarding.user_id = owner.id
       WHERE pat.token_hash = ?
       LIMIT 1`
    )
    .bind(await hashPersonalAccessToken(parsedBearer))
    .first<PersonalAccessTokenPrincipalRow>();

  if (!row) throw new PersonalAccessTokenError();
  return validatePersonalAccessTokenPrincipalRow(row, now);
}
