export const messageFolders = ["inbox", "sent", "archived", "trash", "catchall"] as const;
export const messageDirections = ["inbound", "outbound"] as const;

export type MessageFolder = (typeof messageFolders)[number];
export type MessageDirection = (typeof messageDirections)[number];

export type StoredAttachment = {
  id: string;
  messageId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  contentId: string | null;
  r2Key: string;
  createdAt: string;
};

export type MessageSummary = {
  id: string;
  threadId: string;
  mailboxId: string | null;
  direction: MessageDirection;
  folder: MessageFolder;
  fromAddress: string;
  to: string[];
  subject: string;
  snippet: string;
  receivedAt: string | null;
  sentAt: string | null;
  readAt: string | null;
  starredAt: string | null;
  hasAttachments: boolean;
  createdAt: string;
};

export type MessageDetail = MessageSummary & {
  cc: string[];
  bcc: string[];
  textBody: string;
  htmlAvailable: boolean;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  attachments: StoredAttachment[];
};

export type MessageRow = {
  id: string;
  thread_id: string;
  mailbox_id: string | null;
  direction: MessageDirection;
  folder: MessageFolder;
  from_address: string;
  to_json: string;
  cc_json: string;
  bcc_json: string;
  subject: string;
  snippet: string;
  text_body: string;
  html_r2_key: string | null;
  raw_r2_key: string | null;
  message_id: string | null;
  dedupe_key: string | null;
  in_reply_to: string | null;
  references_json: string;
  received_at: string | null;
  sent_at: string | null;
  read_at: string | null;
  starred_at: string | null;
  archived_at: string | null;
  trashed_at: string | null;
  has_attachments: number;
  created_at: string;
  updated_at: string;
};

export type AttachmentRow = {
  id: string;
  message_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  content_id: string | null;
  r2_key: string;
  created_at: string;
};

export type InsertMessageInput = {
  threadId: string;
  mailboxId: string | null;
  direction: MessageDirection;
  folder: MessageFolder;
  fromAddress: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  snippet: string;
  textBody: string;
  htmlR2Key: string | null;
  rawR2Key: string | null;
  messageId: string | null;
  dedupeKey: string | null;
  inReplyTo: string | null;
  references: string[];
  receivedAt: string | null;
  sentAt: string | null;
  readAt: string | null;
  hasAttachments: boolean;
};

export type InsertAttachmentInput = {
  messageId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  contentId: string | null;
  r2Key: string;
};
