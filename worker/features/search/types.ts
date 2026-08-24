import type { ContactSummary } from "../contacts/queries";
import type { ConversationSummary } from "../messages/types";

export type SearchDraft = {
  from: string;
  id: string;
  subject: string;
  to: string[];
  updatedAt: string;
};

export type SearchDestination = {
  description: string;
  id: string;
  label: string;
  path: string;
};

export type WorkspaceSearchResults = {
  contacts: ContactSummary[];
  conversations: ConversationSummary[];
  destinations: SearchDestination[];
  drafts: SearchDraft[];
};
