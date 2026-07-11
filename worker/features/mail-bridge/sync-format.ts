export type SourceFolder = "inbox" | "sent" | "drafts" | "archived" | "trash" | "catchall";

export type MailboxRow = {
  id: string;
  name: string;
  special_use: string | null;
  source_folder: SourceFolder | null;
  uid_validity: number;
  uid_next: number;
  backfill_created_at: string | null;
  backfill_message_id: string | null;
  backfill_complete: number;
};

export type MessageRow = {
  id: string;
  folder: SourceFolder;
  read_at: string | null;
  starred_at: string | null;
  created_at: string;
  received_at: string | null;
  sent_at: string | null;
  raw_r2_key: string | null;
  from_address: string;
  to_json: string;
  subject: string;
  text_body: string;
  message_id: string | null;
};

export const mailboxDefinitions: Array<{
  name: string;
  specialUse?: string;
  sourceFolder?: SourceFolder;
}> = [
  { name: "INBOX", sourceFolder: "inbox" },
  { name: "Sent", specialUse: "sent", sourceFolder: "sent" },
  { name: "Drafts", specialUse: "drafts", sourceFolder: "drafts" },
  { name: "Archive", specialUse: "archive", sourceFolder: "archived" },
  { name: "Trash", specialUse: "trash", sourceFolder: "trash" },
  { name: "Catch-all", sourceFolder: "catchall" }
];

const encoder = new TextEncoder();

export function flagsFor(message: Pick<MessageRow, "folder" | "read_at" | "starred_at">): string[] {
  return [
    message.read_at ? "\\Seen" : null,
    message.starred_at ? "\\Flagged" : null,
    message.folder === "drafts" ? "\\Draft" : null
  ].filter((value): value is string => value !== null);
}

export function fallbackRaw(message: MessageRow): Uint8Array {
  const recipients = (JSON.parse(message.to_json) as string[]).join(", ");
  return encoder.encode(
    `From: ${message.from_address}\r\nTo: ${recipients}\r\nSubject: ${message.subject}\r\n` +
      `Message-ID: ${message.message_id ?? `<${message.id}@hqbase.local>`}\r\n\r\n` +
      `${message.text_body}\r\n`
  );
}
