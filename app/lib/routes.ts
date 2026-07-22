export const mailFolders = [
  { id: "inbox", label: "Inbox", path: "inbox" },
  { id: "sent", label: "Sent", path: "sent" },
  { id: "starred", label: "Starred", path: "starred" },
  { id: "archived", label: "Archived", path: "archived" },
  { id: "trash", label: "Trash", path: "trash" },
  { id: "catchall", label: "Catch-all", path: "catch-all" }
] as const;

export const folders = [...mailFolders, { id: "settings", label: "Settings" }] as const;

export const settingsTabs = [
  "mailboxes",
  "users",
  "domains",
  "billing",
  "updates",
  "debug"
] as const;

export type MailFolderId = (typeof mailFolders)[number]["id"];
export type FolderId = (typeof folders)[number]["id"];
export type SettingsTabId = (typeof settingsTabs)[number];

export type AppRoute =
  | { kind: "mail"; folder: MailFolderId; messageId: string | null }
  | { kind: "settings"; tab: SettingsTabId };

const legacySettingsTabs: Record<string, SettingsTabId> = {
  access: "mailboxes",
  domains: "domains",
  general: "debug",
  "mail-clients": "mailboxes",
  updates: "updates",
  upgrade: "debug"
};

export function readAppRoute(input: string | URL): AppRoute {
  const url = input instanceof URL ? input : new URL(input, "https://hqbase.local");
  const legacySettings = url.searchParams.get("settings");
  if (legacySettings) {
    const tab = readSettingsTab(legacySettings) ?? legacySettingsTabs[legacySettings];
    if (tab) return { kind: "settings", tab };
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments[0] === "settings") {
    const tab = readSettingsTab(segments[1]) ?? legacySettingsTabs[segments[1] ?? ""];
    return { kind: "settings", tab: tab ?? "mailboxes" };
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
  const folder = mailFolders.find((item) => item.id === route.folder);
  const base = `/${folder?.path ?? "inbox"}`;
  return route.messageId ? `${base}/${encodeURIComponent(route.messageId)}` : base;
}

export function isMailFolderId(value: string): value is MailFolderId {
  return mailFolders.some((folder) => folder.id === value);
}

export function isSettingsTabId(value: string): value is SettingsTabId {
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
