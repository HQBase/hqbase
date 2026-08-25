import { z } from "zod";

export const MAX_SIGNATURE_HTML_INPUT_LENGTH = 400_000;

export const signatureSelectionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("automatic") }),
  z.object({ mode: z.literal("selected"), id: z.string().min(1).max(100) }),
  z.object({ mode: z.literal("none") })
]);

export const signatureScopeTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user"), id: z.string().min(1).max(100) }),
  z.object({ type: z.literal("mailbox"), id: z.string().min(1).max(100) }),
  z.object({ type: z.literal("domain"), id: z.string().min(1).max(100) })
]);

export const createSignatureSchema = z.object({
  name: z.string().min(1).max(200),
  html: z.string().max(MAX_SIGNATURE_HTML_INPUT_LENGTH),
  scope: signatureScopeTargetSchema,
  isDefault: z.boolean().default(false)
});

export const updateSignatureSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    html: z.string().max(MAX_SIGNATURE_HTML_INPUT_LENGTH).optional(),
    isDefault: z.boolean().optional()
  })
  .refine((input) => Object.keys(input).length > 0, "Provide a signature change.");
