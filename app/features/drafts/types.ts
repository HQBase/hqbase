import type { MailLabel } from "@/features/labels/types";
import type { SignatureSelection, SignatureSnapshot } from "@/features/signatures/types";

export type DraftAttachment = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  inline: boolean;
};

export type Draft = {
  id: string;
  mailboxId: string | null;
  replyToMessageId: string | null;
  forwardOfMessageId: string | null;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text: string;
  html: string;
  signature: SignatureSnapshot;
  version: number;
  updatedAt: string;
  attachments: DraftAttachment[];
  labels: MailLabel[];
};

export type DraftInput = Omit<
  Draft,
  "id" | "version" | "updatedAt" | "attachments" | "labels" | "signature"
> & {
  id?: string;
  signature?: SignatureSelection;
  version?: number;
};

export type DraftLabelMutationResult = {
  affected: number;
  assigned: boolean;
  draftId: string;
  labelId: string;
  labels: MailLabel[];
};
