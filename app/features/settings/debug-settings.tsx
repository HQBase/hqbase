import type * as React from "react";

import { Textarea } from "@/components/ui/textarea";
import { SettingsSection } from "@/features/settings/settings-section";
import type { SetupStatus } from "@/features/setup/types";

type DebugSettingsProps = {
  setup: SetupStatus;
};

export function DebugSettings({ setup }: DebugSettingsProps): React.ReactElement {
  return (
    <SettingsSection description="Read-only deployment diagnostics" title="Debug">
      <Textarea
        aria-label="HQBase debug report"
        className="min-h-[30rem] resize-y bg-muted/30 font-mono text-xs leading-5 shadow-none"
        readOnly
        spellCheck={false}
        value={buildDebugReport(setup)}
      />
    </SettingsSection>
  );
}

export function buildDebugReport(setup: SetupStatus): string {
  return [
    "# workspace",
    'product = "hqbase"',
    `setup_complete = ${setup.isComplete}`,
    `primary_domain = ${quoted(setup.primaryDomain)}`,
    `portal_hostname = ${quoted(setup.portalHostname)}`,
    `domain_setup = ${quoted(setup.checklistAcknowledged ? "ready" : "pending")}`,
    `users = ${setup.userCount}`,
    `mailboxes = ${setup.mailboxCount}`,
    `domains = ${JSON.stringify(setup.domains.map((domain) => domain.name))}`
  ].join("\n");
}

function quoted(value: string | null): string {
  return value === null ? "null" : JSON.stringify(value);
}
