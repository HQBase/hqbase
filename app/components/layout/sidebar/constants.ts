import {
  PiAddressBook,
  PiArchive,
  PiArrowsClockwise,
  PiEnvelopeSimple,
  PiGear,
  PiGlobe,
  PiNotePencil,
  PiPaperPlaneTilt,
  PiPlug,
  PiRobot,
  PiSignature,
  PiSlidersHorizontal,
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
  folder: "inbox" | "contacts" | "agents" | "settings";
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}> = [
  { folder: "inbox", icon: PiTray, label: "Mail" },
  { folder: "contacts", icon: PiAddressBook, label: "Contacts" },
  { folder: "agents", icon: PiRobot, label: "Agents" },
  { folder: "settings", icon: PiGear, label: "Settings" }
];

export const settingsTabIcons: Record<
  SettingsTabId,
  React.ComponentType<{ className?: string }>
> = {
  mailboxes: PiEnvelopeSimple,
  domains: PiGlobe,
  users: PiUsers,
  labels: PiTag,
  signatures: PiSignature,
  preferences: PiSlidersHorizontal,
  updates: PiArrowsClockwise
};

export const settingsTabLabels: Record<SettingsTabId, string> = {
  mailboxes: "Mailboxes",
  domains: "Domains",
  users: "People",
  labels: "Labels",
  signatures: "Signatures",
  preferences: "Preferences",
  updates: "Updates"
};

export { PiAddressBook, PiNotePencil, PiPlug };
