import { z } from "zod";
import { emailAddressSchema } from "../../lib/validation";

const recipients = z.array(emailAddressSchema).max(50).default([]);
export const draftSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  mailboxId: z.string().min(1).max(100).nullable().default(null),
  replyToMessageId: z.string().min(1).max(100).nullable().default(null),
  forwardOfMessageId: z.string().min(1).max(100).nullable().default(null),
  from: z.union([z.literal(""), emailAddressSchema]).default(""),
  to: recipients,
  cc: recipients,
  bcc: recipients,
  subject: z.string().max(200).default(""),
  text: z.string().max(100_000).default(""),
  html: z.string().max(200_000).default(""),
  version: z.number().int().positive().optional()
});
