import { z } from "zod";

import { emailAddressSchema, workspaceRoleSchema } from "../../lib/validation";

const userIdentitySchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailAddressSchema,
  role: workspaceRoleSchema.default("member")
});

export const createUserSchema = z.discriminatedUnion("method", [
  userIdentitySchema.extend({ method: z.literal("email_invite") }),
  userIdentitySchema.extend({ method: z.literal("temporary_password") })
]);

export const updateUserSchema = z.object({
  role: workspaceRoleSchema
});

export const completePasswordSetupSchema = z
  .object({
    currentPassword: z.string().min(8).max(128),
    newPassword: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128)
  })
  .refine((input) => input.newPassword === input.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"]
  })
  .refine((input) => input.currentPassword !== input.newPassword, {
    message: "Choose a new password that differs from the temporary password.",
    path: ["newPassword"]
  });
