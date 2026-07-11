import { z } from "zod";

import { emailAddressSchema, workspaceRoleSchema } from "../../lib/validation";

export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailAddressSchema,
  password: z.string().min(8).max(128),
  role: workspaceRoleSchema.default("member")
});

export const updateUserSchema = z.object({
  role: workspaceRoleSchema
});
