import type { ContactSummary } from "@/features/contacts/types";
import type { ConversationSummary } from "@/features/messages/types";

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

export type GlobalSearchResult =
  | ({ kind: "contact" } & ContactSummary)
  | ({ kind: "conversation" } & ConversationSummary)
  | ({ kind: "destination" } & SearchDestination)
  | ({ kind: "draft" } & SearchDraft);

export type GlobalSearchGroup = {
  id: GlobalSearchResult["kind"];
  label: string;
  results: GlobalSearchResult[];
};

export function groupSearchResults(results: WorkspaceSearchResults): GlobalSearchGroup[] {
  const groups: GlobalSearchGroup[] = [
    {
      id: "conversation",
      label: "Conversations",
      results: results.conversations.map((result) => ({ ...result, kind: "conversation" }))
    },
    {
      id: "contact",
      label: "Contacts",
      results: results.contacts.map((result) => ({ ...result, kind: "contact" }))
    },
    {
      id: "draft",
      label: "Drafts",
      results: results.drafts.map((result) => ({ ...result, kind: "draft" }))
    },
    {
      id: "destination",
      label: "Go to",
      results: results.destinations.map((result) => ({ ...result, kind: "destination" }))
    }
  ];
  return groups.filter((group) => group.results.length > 0);
}
