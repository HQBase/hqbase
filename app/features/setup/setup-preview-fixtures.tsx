import { CheckCircle2, Globe2, Inbox, KeyRound, UserRound } from "lucide-react";
import type * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { AccessStep } from "./setup-access-screen";
import { DomainStep } from "./setup-domain-screen";
import { ACCESS_STEP, DOMAIN_STEP, MAILBOX_STEP, OWNER_STEP } from "./setup-steps";
import type { MailboxDraft } from "./setup-validation";
import { WizardPanel, type WizardStep } from "./setup-wizard-parts";
import { MailboxStep, OwnerStep } from "./setup-workspace-screens";
import type { CloudflareZone } from "./types";

export const previewStates = [
  ["access", "Access ready"],
  ["loading", "Access loading"],
  ["failure", "Access failure"],
  ["domain", "Domain selection"],
  ["owner", "Owner account"],
  ["validation", "Validation errors"],
  ["mailboxes", "Shared addresses"],
  ["submitting", "Submitting workspace"],
  ["completed", "Setup complete"]
] as const;

export type PreviewState = (typeof previewStates)[number][0];

export const zones: CloudflareZone[] = [
  {
    id: "zone-primary",
    name: "northstar.example",
    status: "active",
    type: "full",
    accountId: "account-1",
    accountName: "Northstar Studio"
  },
  {
    id: "zone-secondary",
    name: "fieldnotes.example",
    status: "active",
    type: "full",
    accountId: "account-1",
    accountName: "Northstar Studio"
  }
];

export const steps: WizardStep[] = [
  {
    canOpen: true,
    description: "Installation grant",
    icon: KeyRound,
    id: "access",
    isComplete: true,
    title: "Cloudflare access"
  },
  {
    canOpen: true,
    description: zones[0]?.name ?? "northstar.example",
    icon: Globe2,
    id: "domain",
    isComplete: true,
    title: "Domain"
  },
  {
    canOpen: true,
    description: "alex@northstar.example",
    icon: UserRound,
    id: "owner",
    isComplete: true,
    title: "Owner account"
  },
  {
    canOpen: true,
    description: "2 shared addresses",
    icon: Inbox,
    id: "mailboxes",
    isComplete: true,
    title: "Mailboxes"
  }
];

type FixtureInput = {
  activeStep: number;
  appSubdomain: string;
  mailboxes: MailboxDraft[];
  ownerEmail: string;
  ownerName: string;
  ownerPassword: string;
  portalZone: CloudflareZone | null;
  portalZoneId: string;
  selectedZoneIds: string[];
  selectedZones: CloudflareZone[];
  serviceSubdomain: string;
  setAppSubdomain: (value: string) => void;
  setMailboxes: React.Dispatch<React.SetStateAction<MailboxDraft[]>>;
  setOwnerEmail: (value: string) => void;
  setOwnerName: (value: string) => void;
  setOwnerPassword: (value: string) => void;
  setPortalZoneId: (value: string) => void;
  setSelectedZoneIds: React.Dispatch<React.SetStateAction<string[]>>;
  setServiceSubdomain: (value: string) => void;
  state: PreviewState;
};

export function renderPreviewFixture(input: FixtureInput): React.ReactNode {
  if (input.state === "completed") return <CompletedStep />;
  if (input.activeStep === ACCESS_STEP) {
    return (
      <AccessStep
        error={
          input.state === "failure"
            ? "The delegated Cloudflare grant expired before setup finished."
            : null
        }
        isLoading={input.state === "loading"}
        onNext={() => undefined}
      />
    );
  }
  if (input.activeStep === DOMAIN_STEP) {
    return (
      <DomainStep
        appHostname={`${input.appSubdomain}.${input.portalZone?.name}`}
        appSubdomain={input.appSubdomain}
        connectionError={null}
        errors={{}}
        isLoading={false}
        onBack={() => undefined}
        onConnect={() => undefined}
        onToggleZone={(zoneId, selected) =>
          input.setSelectedZoneIds((current) =>
            selected ? [...current, zoneId] : current.filter((id) => id !== zoneId)
          )
        }
        portalZone={input.portalZone}
        portalZoneId={input.portalZoneId}
        results={[]}
        selectedZoneIds={input.selectedZoneIds}
        selectedZones={input.selectedZones}
        serviceHostname={`${input.serviceSubdomain}.${input.portalZone?.name}`}
        serviceSubdomain={input.serviceSubdomain}
        setAppSubdomain={input.setAppSubdomain}
        setPortalZoneId={input.setPortalZoneId}
        setServiceSubdomain={input.setServiceSubdomain}
        zones={zones}
      />
    );
  }
  if (input.activeStep === OWNER_STEP) {
    const errors =
      input.state === "validation"
        ? {
            email: "Enter a valid login email.",
            name: "Enter your name.",
            password: "Use at least 8 characters."
          }
        : {};
    return (
      <OwnerStep
        errors={errors}
        onBack={() => undefined}
        onNext={() => undefined}
        ownerEmail={input.state === "validation" ? "not-an-email" : input.ownerEmail}
        ownerName={input.state === "validation" ? "" : input.ownerName}
        ownerPassword={input.state === "validation" ? "short" : input.ownerPassword}
        setOwnerEmail={input.setOwnerEmail}
        setOwnerName={input.setOwnerName}
        setOwnerPassword={input.setOwnerPassword}
      />
    );
  }
  return (
    <MailboxStep
      errors={{ rows: input.mailboxes.map(() => ({})) }}
      isPending={input.state === "submitting"}
      mailboxes={input.mailboxes}
      onAdd={() => input.setMailboxes((current) => [...current, { address: "", displayName: "" }])}
      onBack={() => undefined}
      onComplete={() => undefined}
      onEditDomain={() => undefined}
      onEditOwner={() => undefined}
      onRemove={(index) =>
        input.setMailboxes((current) => current.filter((_, itemIndex) => itemIndex !== index))
      }
      onUpdate={(index, patch) =>
        input.setMailboxes((current) =>
          current.map((mailbox, itemIndex) =>
            itemIndex === index ? { ...mailbox, ...patch } : mailbox
          )
        )
      }
      ownerEmail={input.ownerEmail}
      primaryDomain={input.portalZone?.name ?? "northstar.example"}
      submitError={null}
    />
  );
}

export function stepForPreviewState(state: PreviewState): number {
  if (["access", "loading", "failure"].includes(state)) return ACCESS_STEP;
  if (state === "domain") return DOMAIN_STEP;
  if (["owner", "validation"].includes(state)) return OWNER_STEP;
  return MAILBOX_STEP;
}

function CompletedStep(): React.ReactElement {
  return (
    <WizardPanel
      actions={null}
      description="The workspace is configured and ready for its first sign-in."
      title="Workspace ready"
    >
      <Alert>
        <CheckCircle2 />
        <AlertTitle>HQBase Pro is ready</AlertTitle>
        <AlertDescription>
          Your domains, owner account, and shared addresses are configured.
        </AlertDescription>
      </Alert>
      <Button type="button">Open workspace</Button>
    </WizardPanel>
  );
}
