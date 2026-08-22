import type { MessageDirection, MessageFolder } from "./types";

export type MessageAction =
  | "read"
  | "unread"
  | "star"
  | "unstar"
  | "archive"
  | "unarchive"
  | "trash"
  | "restore";

export type MessageActionPatch = {
  folder?: MessageFolder;
  readAt?: string | null;
  starredAt?: string | null;
  archivedAt?: string | null;
  trashedAt?: string | null;
};

export function buildMessageActionPatch(
  action: MessageAction,
  timestamp: string,
  current: { direction: MessageDirection; isUnassigned: boolean }
): MessageActionPatch {
  switch (action) {
    case "read":
      return { readAt: timestamp };
    case "unread":
      return { readAt: null };
    case "star":
      return { starredAt: timestamp };
    case "unstar":
      return { starredAt: null };
    case "archive":
      return { archivedAt: timestamp, folder: "archived", trashedAt: null };
    case "trash":
      return { trashedAt: timestamp, folder: "trash" };
    case "unarchive":
    case "restore":
      return {
        archivedAt: null,
        folder: current.isUnassigned
          ? "catchall"
          : current.direction === "outbound"
            ? "sent"
            : "inbox",
        trashedAt: null
      };
  }
}
