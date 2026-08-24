import {
  PiAddressBook,
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
  PiRobot,
  PiSignature,
  PiStar,
  PiTag,
  PiTrash,
  PiTray,
  PiUsers,
  PiWarning
} from "react-icons/pi";
import type { SettingsTabId } from "@/lib/routes";

export const icons = {
  inbox: PiTray,
  sent: PiPaperPlaneTilt,
  drafts: PiNotePencil,
  starred: PiStar,
  archived: PiArchive,
  trash: PiTrash,
  catchall: PiWarning
} as const;

export const quickAccess: Array<{
  folder: "inbox" | "contacts" | "settings";
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}> = [
  { folder: "inbox", icon: PiTray, label: "Mail" },
  { folder: "contacts", icon: PiAddressBook, label: "Contacts" },
  { folder: "settings", icon: PiGear, label: "Settings" }
];

export const settingsTabIcons: Record<
  SettingsTabId,
  React.ComponentType<{ className?: string }>
> = {
  mailboxes: PiEnvelopeSimple,
  agents: PiRobot,
  users: PiUsers,
  domains: PiGlobe,
  notifications: PiBell,
  interface: PiPalette,
  labels: PiTag,
  signatures: PiSignature,
  mcp: PiPlug,
  updates: PiArrowsClockwise,
  debug: PiBug
};

export const settingsTabLabels: Record<SettingsTabId, string> = {
  mailboxes: "Mailboxes",
  agents: "Agents",
  users: "Users",
  domains: "Domains",
  notifications: "Notifications",
  interface: "Interface",
  labels: "Labels",
  signatures: "Signatures",
  mcp: "Connect AI agents",
  updates: "Updates",
  debug: "Debug"
};

export { PiAddressBook, PiNotePencil };
