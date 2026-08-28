import { z } from "zod";

import { emailAddressSchema } from "../../lib/validation";

export const createMailboxSchema = z.object({
  address: emailAddressSchema,
  displayName: z.string().trim().min(1).max(80)
});

export const updateMailboxSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    isActive: z.boolean().optional()
  })
  .refine((value) => value.displayName !== undefined || value.isActive !== undefined, {
    message: "At least one mailbox field must be provided."
  });
