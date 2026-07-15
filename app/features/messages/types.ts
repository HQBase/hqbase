export type MessageFolder = "inbox" | "sent" | "archived" | "trash" | "catchall";

export type MessageSummary = {
  id: string;
  threadId: string;
  mailboxId: string | null;
  direction: "inbound" | "outbound";
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
  attachments: Array<{
    id: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    contentId: string | null;
  }>;
};

export type MessageHtml = {
  hasRemoteImages: boolean;
  html: string;
  remoteMediaTrusted: boolean;
};
