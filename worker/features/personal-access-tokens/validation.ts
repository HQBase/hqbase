import { z } from "zod";

import { AppError } from "../../lib/errors";

import type {
  CreatePersonalAccessTokenInput,
  PersonalAccessTokenMetadata,
  PersonalAccessTokenMetadataRow
} from "./types";

const createInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    expiresAt: z.string().nullable()
  })
  .strict();

const canonicalTimestampSchema = z.string().refine((value) => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
});

const metadataSchema = z.object({
  id: z.string().regex(/^pat_[A-Za-z0-9_-]+$/u),
  userId: z.string().min(1),
  ownerName: z.string(),
  name: z
    .string()
    .min(1)
    .max(80)
    .refine((value) => value.trim() === value),
  tokenSuffix: z.string().regex(/^[A-Za-z0-9_-]{4}$/u),
  createdAt: canonicalTimestampSchema,
  expiresAt: canonicalTimestampSchema.nullable()
});

export function readCreatePersonalAccessTokenInput(
  value: unknown,
  now = Date.now()
): CreatePersonalAccessTokenInput {
  const parsed = createInputSchema.safeParse(value);
  if (!parsed.success) throw invalidCreateInput();
  if (parsed.data.expiresAt === null) return parsed.data;

  const expiry = new Date(parsed.data.expiresAt);
  if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= now) {
    throw invalidCreateInput();
  }
  return { name: parsed.data.name, expiresAt: expiry.toISOString() };
}

export function readPersonalAccessTokenMetadata(
  row: PersonalAccessTokenMetadataRow
): PersonalAccessTokenMetadata {
  const parsed = metadataSchema.safeParse(row);
  if (!parsed.success) {
    throw new AppError("INTERNAL_ERROR", "Stored personal access token metadata is invalid.", 500);
  }
  return parsed.data;
}

function invalidCreateInput(): AppError {
  return new AppError(
    "INVALID_PERSONAL_ACCESS_TOKEN",
    "Personal access token input is invalid.",
    400
  );
}
