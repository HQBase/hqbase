import { accessibleMessageScope } from "../../auth/mailbox-access";
import type { WorkerEnv } from "../../lib/env";
import type { WorkspaceRole } from "../../lib/validation";
import { listContacts } from "../contacts/queries";
import { listAccessibleDraftPage } from "../drafts/access";
import type { Draft } from "../drafts/types";
import { listConversationPage } from "../messages/conversation-queries";

import type { SearchDestination, SearchDraft, WorkspaceSearchResults } from "./types";

export async function searchWorkspace(
  env: WorkerEnv,
  input: { limit: number; query: string; role: WorkspaceRole; userId: string }
): Promise<WorkspaceSearchResults> {
  const scope = await accessibleMessageScope(env.DB, input.userId, input.role, "read");
  const [conversationPage, contacts, drafts] = await Promise.all([
    listConversationPage(env.DB, {
      limit: input.limit,
      scope,
      search: input.query
    }),
    listContacts(env.DB, {
      limit: input.limit,
      scope,
      search: input.query,
      userId: input.userId
    }),
    searchDrafts(env, input)
  ]);

  return {
    contacts,
    conversations: conversationPage.conversations,
    destinations: searchDestinations(input.query, input.role, input.limit),
    drafts: drafts
      .filter((draft) => draftMatches(draft, input.query))
      .slice(0, input.limit)
      .map(searchDraft)
  };
}

const destinations: ReadonlyArray<
  SearchDestination & { managementOnly?: boolean; ownerOnly?: boolean; terms?: string }
> = [
  { id: "inbox", label: "Inbox", description: "Mail", path: "/mail/inbox" },
  { id: "sent", label: "Sent", description: "Mail", path: "/mail/sent" },
  { id: "drafts", label: "Drafts", description: "Mail", path: "/mail/drafts" },
  { id: "starred", label: "Starred", description: "Mail", path: "/mail/starred" },
  { id: "archived", label: "Archived", description: "Mail", path: "/mail/archived" },
  { id: "trash", label: "Trash", description: "Mail", path: "/mail/trash" },
  {
    id: "catch-all",
    label: "Catch-all",
    description: "Mail",
    ownerOnly: true,
    path: "/mail/catch-all"
  },
  { id: "contacts", label: "Contacts", description: "People", path: "/contacts" },
  {
    id: "mailboxes",
    label: "Mailboxes",
    description: "Settings",
    path: "/settings/mailboxes"
  },
  {
    id: "labels",
    label: "Labels",
    description: "Settings",
    path: "/settings/labels"
  },
  {
    id: "signatures",
    label: "Signatures",
    description: "Settings",
    path: "/settings/signatures"
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Settings",
    path: "/settings/notifications"
  },
  {
    id: "interface",
    label: "Interface",
    description: "Settings",
    terms: "appearance theme",
    path: "/settings/interface"
  },
  {
    id: "connected-apps",
    label: "Connected apps",
    description: "Agents",
    terms: "mcp api skill oauth",
    path: "/agents/connections"
  },
  {
    id: "users",
    label: "Users",
    description: "Settings",
    managementOnly: true,
    terms: "people members",
    path: "/settings/users"
  },
  {
    id: "mailbox-agents",
    label: "Mailbox agents",
    description: "Agents",
    managementOnly: true,
    path: "/agents/mailboxes"
  },
  {
    id: "provisioning-keys",
    label: "Provisioning keys",
    description: "Agents",
    managementOnly: true,
    terms: "provisioner management api",
    path: "/agents/provisioning"
  },
  {
    id: "domains",
    label: "Domains",
    description: "Settings",
    managementOnly: true,
    path: "/settings/domains"
  },
  {
    id: "updates",
    label: "Updates",
    description: "Settings",
    managementOnly: true,
    terms: "release changelog",
    path: "/settings/updates"
  },
  { id: "debug", label: "Debug", description: "Settings", path: "/settings/debug" }
];

export function searchDestinations(
  query: string,
  role: WorkspaceRole,
  limit: number
): SearchDestination[] {
  const needle = query.trim().toLowerCase();
  const canManage = role === "owner" || role === "admin";
  return destinations
    .filter((destination) => {
      if (destination.ownerOnly && role !== "owner") return false;
      if (destination.managementOnly && !canManage) return false;
      return `${destination.label} ${destination.description} ${destination.terms ?? ""}`
        .toLowerCase()
        .includes(needle);
    })
    .sort((left, right) => {
      const leftPrefix = left.label.toLowerCase().startsWith(needle) ? 0 : 1;
      const rightPrefix = right.label.toLowerCase().startsWith(needle) ? 0 : 1;
      return leftPrefix - rightPrefix;
    })
    .slice(0, limit)
    .map(({ description, id, label, path }) => ({ description, id, label, path }));
}

function draftMatches(draft: Draft, query: string): boolean {
  const needle = query.toLowerCase();
  return [draft.subject, draft.from, ...draft.to, ...draft.cc, ...draft.bcc, draft.text].some(
    (value) => value.toLowerCase().includes(needle)
  );
}

function searchDraft(draft: Draft): SearchDraft {
  return {
    from: draft.from,
    id: draft.id,
    subject: draft.subject,
    to: draft.to,
    updatedAt: draft.updatedAt
  };
}

async function searchDrafts(
  env: WorkerEnv,
  input: { limit: number; query: string; role: WorkspaceRole; userId: string }
): Promise<Draft[]> {
  const drafts: Draft[] = [];
  let cursor: string | undefined;
  do {
    const page = await listAccessibleDraftPage(
      env,
      { id: input.userId, role: input.role },
      { cursor, limit: input.limit, search: input.query }
    );
    drafts.push(...page.drafts);
    cursor = page.nextCursor ?? undefined;
  } while (cursor && drafts.length < input.limit);
  return drafts;
}
