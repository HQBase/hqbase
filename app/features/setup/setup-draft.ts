import { ACCESS_STEP, MAILBOX_STEP } from "./setup-steps";
import type { MailboxDraft } from "./setup-validation";
import type { SetupCatchAllSelection } from "./types";

export function readSetupDraft(): {
  activeStep: number;
  catchAllByDomain: Record<string, SetupCatchAllSelection>;
  defaultFromMailboxAddress: string;
  mailboxes: MailboxDraft[];
  ownerEmail: string;
  ownerName: string;
} | null {
  try {
    const value = JSON.parse(localStorage.getItem("hqb_setup_draft_v1") ?? "null") as Record<
      string,
      unknown
    > | null;
    if (!value || !Array.isArray(value.mailboxes)) return null;
    return {
      activeStep: Math.min(MAILBOX_STEP, Math.max(ACCESS_STEP, Number(value.activeStep) || 0)),
      catchAllByDomain: readCatchAllDraft(value.catchAllByDomain),
      defaultFromMailboxAddress:
        typeof value.defaultFromMailboxAddress === "string"
          ? value.defaultFromMailboxAddress.slice(0, 254)
          : "",
      mailboxes: value.mailboxes
        .filter((item): item is MailboxDraft =>
          Boolean(item && typeof item === "object" && "address" in item && "displayName" in item)
        )
        .slice(0, 20),
      ownerEmail: typeof value.ownerEmail === "string" ? value.ownerEmail.slice(0, 320) : "",
      ownerName: typeof value.ownerName === "string" ? value.ownerName.slice(0, 120) : ""
    };
  } catch {
    return null;
  }
}

function readCatchAllDraft(value: unknown): Record<string, SetupCatchAllSelection> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, SetupCatchAllSelection> = {};
  for (const [domain, selection] of Object.entries(value)) {
    if (!selection || typeof selection !== "object") continue;
    const record = selection as Record<string, unknown>;
    if (
      !["reject", "unassigned", "mailbox"].includes(String(record.policy)) ||
      typeof record.mailboxAddress !== "string"
    )
      continue;
    result[domain] = {
      policy: record.policy as SetupCatchAllSelection["policy"],
      mailboxAddress: record.mailboxAddress.slice(0, 254)
    };
  }
  return result;
}
