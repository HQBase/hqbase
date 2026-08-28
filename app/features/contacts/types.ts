import type { ConversationSummary } from "@/features/messages/types";

export type ContactSource = "saved" | "recent" | "mailbox";

export type ContactSummary = {
  id: string;
  email: string;
  name: string | null;
  source: ContactSource;
  saved: boolean;
  lastContactAt: string | null;
};

export type ContactDetail = ContactSummary & {
  notes: string;
  savedName: string | null;
};

export type ContactDetailResponse = {
  contact: ContactDetail;
  conversations: ConversationSummary[];
  nextCursor: string | null;
};
