import { z } from "zod";

import { emailAddressSchema } from "../../lib/validation";

const nameSchema = z.string().trim().min(1).max(80);
const idSchema = z.string().trim().min(1).max(100);

const mailboxAgentSchema = z.object({
  profile: z.literal("mailbox"),
  name: nameSchema,
  accessLevel: z.enum(["read", "agent"]),
  mailbox: z.union([
    z.object({ id: idSchema }).strict(),
    z
      .object({
        address: emailAddressSchema,
        displayName: nameSchema
      })
      .strict()
  ])
});

const provisionerSchema = z.object({
  profile: z.literal("provisioner"),
  name: nameSchema,
  mailDomainId: idSchema,
  mailboxLimit: z.number().int().min(1).max(1_000)
});

export const createAgentSchema = z.discriminatedUnion("profile", [
  mailboxAgentSchema,
  provisionerSchema
]);

export const updateAgentSchema = z.object({
  isActive: z.boolean()
});
