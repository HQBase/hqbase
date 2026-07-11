import type { Address, Attachment, Email } from "postal-mime";
import PostalMime from "postal-mime";

import { parseReferences } from "../features/messages/headers";

export type ParsedAttachment = {
  filename: string;
  contentType: string;
  contentId: string | null;
  content: ArrayBuffer | Uint8Array | string;
};

export type ParsedEmail = {
  fromAddress: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  date: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  textBody: string;
  htmlBody: string | null;
  snippet: string;
  attachments: ParsedAttachment[];
};

export async function parseRawEmail(raw: ArrayBuffer): Promise<ParsedEmail> {
  const email = await PostalMime.parse(raw, {
    attachmentEncoding: "arraybuffer"
  });

  const textBody = email.text ?? "";
  const htmlBody = email.html ?? null;

  return {
    fromAddress: firstAddress(email.from),
    to: flattenAddresses(email.to),
    cc: flattenAddresses(email.cc),
    bcc: flattenAddresses(email.bcc),
    subject: email.subject?.trim() || "(no subject)",
    date: parseDate(email.date),
    messageId: email.messageId ?? null,
    inReplyTo: email.inReplyTo ?? null,
    references: parseReferences(email.references),
    textBody,
    htmlBody,
    snippet: buildSnippet(textBody, htmlBody),
    attachments: email.attachments.map(mapAttachment)
  };
}

function firstAddress(address: Email["from"]): string {
  if (!address) {
    return "unknown";
  }
  if ("group" in address && Array.isArray(address.group)) {
    return address.group[0]?.address ?? "unknown";
  }
  return address.address ?? "unknown";
}

function flattenAddresses(addresses: Address[] | undefined): string[] {
  if (!addresses) {
    return [];
  }

  return addresses.flatMap((address) => {
    if ("group" in address && Array.isArray(address.group)) {
      return address.group.map((mailbox) => mailbox.address).filter(isString);
    }
    return address.address ? [address.address] : [];
  });
}

function isString(value: string | undefined): value is string {
  return typeof value === "string";
}

function parseDate(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function buildSnippet(textBody: string, htmlBody: string | null): string {
  const source = textBody || stripHtml(htmlBody ?? "");
  return source.replace(/\s+/g, " ").trim().slice(0, 180);
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}

function mapAttachment(attachment: Attachment): ParsedAttachment {
  return {
    filename: attachment.filename ?? "attachment",
    contentType: attachment.mimeType,
    contentId: attachment.contentId ?? null,
    content: attachment.content
  };
}
