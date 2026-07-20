import { z } from "zod";
import { domainSchema } from "../setup/validation";

const domainStatus = z.enum(["pending", "ready", "degraded", "disabled"]);

export const createMailDomainSchema = z.object({
  name: domainSchema,
  zoneId: z.string().trim().min(1).max(64).nullable().optional(),
  accountId: z.string().trim().min(1).max(64).nullable().optional(),
  receivingStatus: domainStatus.optional(),
  sendingStatus: domainStatus.optional(),
  dnsStatus: z.enum(["pending", "ready", "degraded"]).optional()
});

export const updateMailDomainSchema = z
  .object({
    catchAllPolicy: z.enum(["reject", "mailbox", "unassigned"]).optional(),
    catchAllMailboxId: z.string().trim().min(1).max(100).nullable().optional(),
    isEnabled: z.boolean().optional()
  })
  .refine((input) => input.catchAllPolicy !== "mailbox" || Boolean(input.catchAllMailboxId), {
    message: "Choose a catch-all mailbox.",
    path: ["catchAllMailboxId"]
  });

export const provisionMailDomainSchema = z.object({
  name: domainSchema,
  zoneId: z.string().trim().min(1).max(64),
  workerName: z.string().trim().min(1).max(63).optional(),
  enableSending: z.boolean().default(true)
});

export const changePortalHostnameSchema = z.object({
  hostname: domainSchema,
  zoneId: z.string().trim().min(1).max(64),
  workerName: z.string().trim().min(1).max(63).optional()
});

export const changeServiceHostnameSchema = changePortalHostnameSchema;
