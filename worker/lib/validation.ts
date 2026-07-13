import { z } from "zod";

import { AppError } from "./errors";

export const workspaceRoleSchema = z.enum(["owner", "admin", "member"]);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

export const emailAddressSchema = z.string().email().max(254).transform(normalizeEmail);

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function parseWith<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }

  const firstIssue = result.error.issues[0];
  const message = firstIssue?.message ?? "Invalid input.";
  throw new AppError("VALIDATION_ERROR", message, 400);
}

export function requireMailboxDomain(address: string, primaryDomain: string): void {
  const domain = address.split("@")[1];
  if (!domain || domain !== primaryDomain.toLowerCase()) {
    throw new AppError(
      "MAILBOX_DOMAIN_MISMATCH",
      `Mailbox address must use ${primaryDomain}.`,
      400
    );
  }
}

export function cleanStringList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}
