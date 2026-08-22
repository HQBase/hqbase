import type { MessageFolder } from "../features/messages/types";

import type { ParsedEmail } from "./parse-email";

export type InboundStoragePlan = {
  folder: MessageFolder;
  isUnassigned: boolean;
  mailboxId: string | null;
  to: string[];
  dedupeKey: string | null;
};

export function planInboundStorage(input: {
  envelopeRecipient: string;
  mailboxId: string | null;
  parsed: ParsedEmail;
}): InboundStoragePlan {
  const recipient = input.envelopeRecipient.toLowerCase();
  return {
    folder: input.mailboxId ? "inbox" : "catchall",
    isUnassigned: input.mailboxId === null,
    mailboxId: input.mailboxId,
    to: input.parsed.to.length ? input.parsed.to : [recipient],
    dedupeKey: input.parsed.messageId ? `${input.parsed.messageId}:${recipient}` : null
  };
}
