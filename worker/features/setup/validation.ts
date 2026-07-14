import { z } from "zod";

import { emailAddressSchema } from "../../lib/validation";
import { createMailboxSchema } from "../mailboxes/validation";

export const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/, {
    message: "Enter a valid primary domain."
  });

export const bootstrapSetupSchema = z
  .object({
    ownerName: z.string().trim().min(1).max(100),
    ownerEmail: emailAddressSchema,
    ownerPassword: z.string().min(8).max(128),
    primaryDomain: domainSchema,
    checklistAcknowledged: z.literal(true),
    mailboxes: z.array(createMailboxSchema).min(1).max(20)
  })
  .superRefine((input, context) => {
    const seen = new Set<string>();
    for (const [index, mailbox] of input.mailboxes.entries()) {
      if (mailbox.address.split("@")[1] !== input.primaryDomain) {
        context.addIssue({
          code: "custom",
          message: `Mailbox address must use ${input.primaryDomain}.`,
          path: ["mailboxes", index, "address"]
        });
      }
      if (seen.has(mailbox.address)) {
        context.addIssue({
          code: "custom",
          message: "Mailbox addresses must be unique.",
          path: ["mailboxes", index, "address"]
        });
      }
      seen.add(mailbox.address);
    }
  });

export const cloudflareApiTokenSchema = z.string().trim().min(20).max(500);

export const verifyCloudflareTokenSchema = z.object({
  apiToken: cloudflareApiTokenSchema
});

export const listCloudflareZonesSchema = z.object({
  apiToken: cloudflareApiTokenSchema.optional()
});

export const inspectCloudflareDomainSchema = z.object({
  apiToken: cloudflareApiTokenSchema.optional(),
  workerName: z.string().trim().min(1).max(63).optional(),
  zoneId: z.string().trim().min(1).max(64)
});

export const configureCloudflareDomainSchema = inspectCloudflareDomainSchema.extend({
  appHostname: domainSchema,
  attachCustomDomain: z.literal(true).default(true),
  enableSending: z.boolean().default(true)
});
