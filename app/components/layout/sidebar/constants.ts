import {
  PiArchive,
  PiArrowsClockwise,
  PiBell,
  PiBug,
  PiEnvelopeSimple,
  PiGear,
  PiGlobe,
  PiNotePencil,
  PiPalette,
  PiPaperPlaneTilt,
  PiPlug,
  PiSidebar,
  PiSidebarSimple,
  PiStar,
  PiTrash,
  PiTray,
  PiUsers,
  PiWarning
} from "react-icons/pi";
import type { mailFolders, SettingsTabId } from "@/lib/routes";

export const icons = {
  inbox: PiTray,
  sent: PiPaperPlaneTilt,
  drafts: PiNotePencil,
  starred: PiStar,
  archived: PiArchive,
  trash: PiTrash,
  catchall: PiWarning
} as const;

export const quickAccess: Array<
  | {
      folder: (typeof mailFolders)[number]["id"];
      icon: React.ComponentType<{ className?: string }>;
      label: string;
    }
  | { folder: "settings"; icon: React.ComponentType<{ className?: string }>; label: string }
> = [
  { folder: "inbox", icon: PiTray, label: "Inbox" },
  { folder: "settings", icon: PiGear, label: "Settings" }
];

export const settingsTabIcons: Record<
  SettingsTabId,
  React.ComponentType<{ className?: string }>
> = {
  mailboxes: PiEnvelopeSimple,
  users: PiUsers,
  domains: PiGlobe,
  notifications: PiBell,
  interface: PiPalette,
  mcp: PiPlug,
  updates: PiArrowsClockwise,
  debug: PiBug
};

export const settingsTabLabels: Record<SettingsTabId, string> = {
  mailboxes: "Mailboxes",
  users: "Users",
  domains: "Domains",
  notifications: "Notifications",
  interface: "Interface",
  mcp: "MCP",
  updates: "Updates",
  debug: "Debug"
};

export { PiGear, PiNotePencil, PiSidebar, PiSidebarSimple, PiTray };
