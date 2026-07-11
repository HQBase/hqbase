export const folders = [
  { id: "inbox", label: "Inbox" },
  { id: "sent", label: "Sent" },
  { id: "starred", label: "Starred" },
  { id: "archived", label: "Archived" },
  { id: "trash", label: "Trash" },
  { id: "catchall", label: "Catch-all" },
  { id: "settings", label: "Settings" }
] as const;

export type FolderId = (typeof folders)[number]["id"];
