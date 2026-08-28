export const mailFolders = [
  { id: "inbox", label: "Inbox", path: "inbox" },
  { id: "sent", label: "Sent", path: "sent" },
  { id: "starred", label: "Starred", path: "starred" },
  { id: "archived", label: "Archived", path: "archived" },
  { id: "trash", label: "Trash", path: "trash" },
  { id: "catchall", label: "Catch-all", path: "catch-all" }
] as const;

export const draftFolder = { id: "drafts", label: "Drafts", path: "drafts" } as const;

const folders = [
  ...mailFolders,
  draftFolder,
  { id: "contacts", label: "Contacts" },
  { id: "agents", label: "Agents" },
  { id: "settings", label: "Settings" }
] as const;

export const settingsTabs = [
  "mailboxes",
  "users",
  "domains",
  "notifications",
  "interface",
  "labels",
  "signatures",
  "updates",
  "debug"
] as const;

export type MailFolderId = (typeof mailFolders)[number]["id"];
export type FolderId = (typeof folders)[number]["id"];
export type SettingsTabId = (typeof settingsTabs)[number];

export type AppRoute =
  | { kind: "mail"; folder: MailFolderId; messageId: string | null }
  | { kind: "drafts"; draftId: string | null }
  | { kind: "contacts"; contactId: string | null }
  | { kind: "agents" }
  | { kind: "settings"; tab: SettingsTabId };

const publicAuthenticationPaths = new Set(["/forgot-password", "/reset-password", "/set-password"]);

export function isPublicAuthenticationPath(pathname: string): boolean {
  return publicAuthenticationPaths.has(pathname);
}

const legacySettingsTabs: Record<string, SettingsTabId> = {
  access: "mailboxes",
  domains: "domains",
  general: "debug",
  updates: "updates"
};

export function readAppRoute(input: string | URL): AppRoute {
  const url = input instanceof URL ? input : new URL(input, "https://hqbase.local");
  const legacySettings = url.searchParams.get("settings");
  if (legacySettings) {
    if (legacySettings === "mcp" || legacySettings === "agents") return { kind: "agents" };
    const tab = readSettingsTab(legacySettings) ?? legacySettingsTabs[legacySettings];
    if (tab) return { kind: "settings", tab };
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments[0] === "settings") {
    if (segments[1] === "mcp" || segments[1] === "agents") return { kind: "agents" };
    const tab = readSettingsTab(segments[1]) ?? legacySettingsTabs[segments[1] ?? ""];
    return { kind: "settings", tab: tab ?? "mailboxes" };
  }

  if (segments[0] === "agents") {
    return { kind: "agents" };
  }

  if (segments[0] === "contacts") {
    return {
      kind: "contacts",
      contactId: segments[1] ? decodePathSegment(segments[1]) : null
    };
  }

  // Drafts canonical: /mail/drafts[/draftId], legacy: /drafts[/draftId]
  if (segments[0] === draftFolder.path) {
    return {
      kind: "drafts",
      draftId: segments[1] ? decodePathSegment(segments[1]) : null
    };
  }

  // New canonical: /mail/<folder>[/messageId], legacy: /<folder>[/messageId] (redirect handled via appRoutePath)
  if (segments[0] === "mail") {
    if (segments[1] === draftFolder.path) {
      return {
        kind: "drafts",
        draftId: segments[2] ? decodePathSegment(segments[2]) : null
      };
    }
    const folder = readMailFolder(segments[1]);
    if (!folder) return { kind: "mail", folder: "inbox", messageId: null };
    return {
      kind: "mail",
      folder,
      messageId: segments[2] ? decodePathSegment(segments[2]) : null
    };
  }

  const folder = readMailFolder(segments[0]);
  if (!folder) return { kind: "mail", folder: "inbox", messageId: null };

  return {
    kind: "mail",
    folder,
    messageId: segments[1] ? decodePathSegment(segments[1]) : null
  };
}

export function appRoutePath(route: AppRoute): string {
  if (route.kind === "settings") return `/settings/${route.tab}`;
  if (route.kind === "agents") return "/agents";
  if (route.kind === "contacts") {
    return route.contactId ? `/contacts/${encodeURIComponent(route.contactId)}` : "/contacts";
  }
  if (route.kind === "drafts") {
    const base = `/mail/${draftFolder.path}`;
    return route.draftId ? `${base}/${encodeURIComponent(route.draftId)}` : base;
  }
  const folder = mailFolders.find((item) => item.id === route.folder);
  const base = `/mail/${folder?.path ?? "inbox"}`;
  return route.messageId ? `${base}/${encodeURIComponent(route.messageId)}` : base;
}

function isSettingsTabId(value: string): value is SettingsTabId {
  return settingsTabs.includes(value as SettingsTabId);
}

function readMailFolder(segment: string | undefined): MailFolderId | null {
  if (!segment) return null;
  if (segment === "catchall" || segment === "catch-all") return "catchall";
  return mailFolders.find((folder) => folder.path === segment)?.id ?? null;
}

function readSettingsTab(segment: string | undefined): SettingsTabId | null {
  return segment && isSettingsTabId(segment) ? segment : null;
}

function decodePathSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment) || null;
  } catch {
    return null;
  }
}
