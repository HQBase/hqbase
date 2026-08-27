import type * as React from "react";

import { CatchAllPolicyControl } from "@/features/domains/catch-all-policy-control";

import type { MailboxDraft } from "./setup-validation";
import type { SetupCatchAllSelection } from "./types";

export function SetupCatchAllSettings({
  catchAllByDomain,
  domains,
  mailboxes,
  onSetCatchAllMailbox,
  onSetCatchAllPolicy
}: {
  catchAllByDomain: Record<string, SetupCatchAllSelection>;
  domains: string[];
  mailboxes: MailboxDraft[];
  onSetCatchAllMailbox: (domain: string, address: string) => void;
  onSetCatchAllPolicy: (domain: string, policy: SetupCatchAllSelection["policy"]) => void;
}): React.ReactElement {
  return (
    <section className="space-y-3" aria-labelledby="setup-unknown-addresses">
      <div>
        <h3 className="text-sm font-medium" id="setup-unknown-addresses">
          Mail to unknown addresses
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Exact mailbox addresses always go to that mailbox. Choose the fallback for each domain.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {domains.map((domain) => {
          const selection = catchAllByDomain[domain] ?? {
            policy: "unassigned" as const,
            mailboxAddress: ""
          };
          const mailboxOptions = mailboxes
            .filter((mailbox) => mailbox.address.trim().toLowerCase().endsWith(`@${domain}`))
            .map((mailbox) => ({
              label: `${mailbox.displayName || "Mailbox"} — ${mailbox.address}`,
              value: mailbox.address.trim().toLowerCase()
            }));
          return (
            <div className="rounded-lg border p-3" key={domain}>
              <p className="mb-2 px-1 text-sm font-medium">{domain}</p>
              <CatchAllPolicyControl
                idPrefix={`setup-catch-all-${domain}`}
                mailboxOptions={mailboxOptions}
                mailboxValue={selection.mailboxAddress}
                policy={selection.policy}
                onMailboxChange={(address) => onSetCatchAllMailbox(domain, address)}
                onPolicyChange={(policy) => onSetCatchAllPolicy(domain, policy)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
