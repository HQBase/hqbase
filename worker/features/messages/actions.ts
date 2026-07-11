import type { MessageFolder } from "./types";

export type MessageAction = "read" | "unread" | "star" | "unstar" | "archive" | "trash";

export type MessageActionPatch = {
  folder?: MessageFolder;
  readAt?: string | null;
  starredAt?: string | null;
  archivedAt?: string | null;
  trashedAt?: string | null;
};

export function buildMessageActionPatch(
  action: MessageAction,
  timestamp: string
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
      return { archivedAt: timestamp, folder: "archived" };
    case "trash":
      return { trashedAt: timestamp, folder: "trash" };
  }
}
