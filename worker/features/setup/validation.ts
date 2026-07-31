import { z } from "zod";

import { emailAddressSchema } from "../../lib/validation";
import {
  LOGIN_EMAIL_DOMAIN_MESSAGE,
  loginEmailUsesManagedDomain
} from "../../security/login-email";
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
    primaryDomain: domainSchema.optional(),
    portalHostname: domainSchema.optional(),
    emailDomains: z
      .array(
        z.object({
          name: domainSchema,
          zoneId: z.string().trim().min(1).max(64).nullable().optional(),
          accountId: z.string().trim().min(1).max(64).nullable().optional()
        })
      )
      .min(1)
      .max(50)
      .optional(),
    checklistAcknowledged: z.literal(true),
    defaultFromMailboxAddress: emailAddressSchema,
    mailboxes: z.array(createMailboxSchema).min(1).max(20)
  })
  .superRefine((input, context) => {
    const domains =
      input.emailDomains?.map((domain) => domain.name) ??
      (input.primaryDomain ? [input.primaryDomain] : []);
    if (domains.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Choose at least one email domain.",
        path: ["emailDomains"]
      });
    }
    if (loginEmailUsesManagedDomain(input.ownerEmail, domains)) {
      context.addIssue({
        code: "custom",
        message: LOGIN_EMAIL_DOMAIN_MESSAGE,
        path: ["ownerEmail"]
      });
    }

    const seen = new Set<string>();
    for (const [index, mailbox] of input.mailboxes.entries()) {
      if (seen.has(mailbox.address)) {
        context.addIssue({
          code: "custom",
          message: "Mailbox addresses must be unique.",
          path: ["mailboxes", index, "address"]
        });
      }
      const mailboxDomain = mailbox.address.split("@")[1];
      if (!mailboxDomain || !domains.includes(mailboxDomain)) {
        context.addIssue({
          code: "custom",
          message: "Mailbox address must use one of the selected email domains.",
          path: ["mailboxes", index, "address"]
        });
      }
      seen.add(mailbox.address);
    }
    if (!input.mailboxes.some((mailbox) => mailbox.address === input.defaultFromMailboxAddress)) {
      context.addIssue({
        code: "custom",
        message: "Choose one of the setup mailboxes as the default From mailbox.",
        path: ["defaultFromMailboxAddress"]
      });
    }
  });

export const verifyCloudflareAccessSchema = z.object({}).strict();

export const listCloudflareZonesSchema = z.object({}).strict();

export const inspectCloudflareDomainSchema = z.object({
  workerName: z.string().trim().min(1).max(63).optional(),
  zoneId: z.string().trim().min(1).max(64)
});

export const configureCloudflareDomainSchema = inspectCloudflareDomainSchema
  .extend({
    appHostname: domainSchema.optional(),
    attachCustomDomain: z.boolean().default(true),
    enableSending: z.boolean().default(true)
  })
  .refine((input) => !input.attachCustomDomain || Boolean(input.appHostname), {
    message: "Choose the workspace hostname.",
    path: ["appHostname"]
  });
