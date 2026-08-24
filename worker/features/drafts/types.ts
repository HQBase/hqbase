import type { SignatureSnapshot } from "../signatures/types";

export type DraftAttachment = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
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
};
