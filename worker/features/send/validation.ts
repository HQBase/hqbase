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
    html: z.string().trim().max(200_000).optional(),
    attachmentIds: z.array(z.string().min(1).max(100)).max(20).default([]),
    draftId: z.string().min(1).max(100).optional()
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

export const replyMessageSchema = z
  .object({
    messageId: z.string().min(1),
    from: emailAddressSchema,
    to: z.array(emailAddressSchema).max(50).optional(),
    cc: optionalRecipientListSchema,
    bcc: optionalRecipientListSchema,
    text: z.string().trim().min(1).max(100_000),
    html: z.string().trim().max(200_000).optional(),
    attachmentIds: z.array(z.string().min(1).max(100)).max(20).default([]),
    draftId: z.string().min(1).max(100).optional()
  })
  .superRefine((message, context) => {
    const recipientCount = (message.to?.length || 1) + message.cc.length + message.bcc.length;
    if (recipientCount > maxTotalRecipients) {
      context.addIssue({
        code: "custom",
        message: "Cloudflare Email Sending allows up to 50 total recipients.",
        path: ["to"]
      });
    }
  });

export const forwardMessageSchema = z
  .object({
    messageId: z.string().min(1).max(100),
    from: emailAddressSchema,
    to: recipientListSchema,
    cc: optionalRecipientListSchema,
    bcc: optionalRecipientListSchema,
    subject: z.string().trim().min(1).max(200).optional(),
    text: z.string().trim().max(100_000).default(""),
    html: z.string().trim().max(200_000).optional(),
    attachmentIds: z.array(z.string().min(1).max(100)).max(20).default([]),
    includeOriginalAttachments: z.boolean().default(true)
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

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ReplyMessageInput = z.infer<typeof replyMessageSchema>;
export type ForwardMessageInput = z.infer<typeof forwardMessageSchema>;
