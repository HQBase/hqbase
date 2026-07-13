import { z } from "zod";

import { emailAddressSchema } from "../../lib/validation";

const recipientListSchema = z.array(emailAddressSchema).min(1).max(50);
const optionalRecipientListSchema = z.array(emailAddressSchema).max(50).default([]);
const maxTotalRecipients = 50;

export const sendMessageSchema = z
  .object({
    from: emailAddressSchema,
    to: recipientListSchema,
    cc: optionalRecipientListSchema,
    bcc: optionalRecipientListSchema,
    subject: z.string().trim().min(1).max(200),
    text: z.string().trim().min(1).max(100_000),
    html: z.string().trim().max(200_000).optional()
  })
  .superRefine((message, context) => {
    const recipientCount = message.to.length + message.cc.length + message.bcc.length;
    if (recipientCount > maxTotalRecipients) {
      context.addIssue({
        code: "custom",
        message: "Cloudflare Email Sending allows up to 50 total recipients.",
        path: ["to"]
      });
    }
  });

export const replyMessageSchema = z.object({
  messageId: z.string().min(1),
  from: emailAddressSchema,
  text: z.string().trim().min(1).max(100_000),
  html: z.string().trim().max(200_000).optional()
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ReplyMessageInput = z.infer<typeof replyMessageSchema>;
