import { Globe2, Inbox, UserRound } from "lucide-react";
import type * as React from "react";

import { Spinner } from "@/components/ui/spinner";

import { AccessStep } from "./setup-access-screen";
import { DomainStep } from "./setup-domain-screen";
import { ACCESS_STEP, DOMAIN_STEP, MAILBOX_STEP, OWNER_STEP } from "./setup-steps";
import type { MailboxDraft } from "./setup-validation";
import type { SetupPhase, WizardStep } from "./setup-wizard-parts";
import { MailboxStep, OwnerStep } from "./setup-workspace-screens";
import type { CloudflareZone } from "./types";
import type { ConfiguredDomain } from "./use-setup-cloudflare";

export const previewStates = [
  ["deploying", "Deployment"],
  ["loading", "Access loading"],
  ["failure", "Access failure"],
  ["domain", "Domain selection"],
  ["domain-error", "Domain readiness error"],
  ["owner", "Owner account"],
  ["validation", "Validation errors"],
  ["mailboxes", "Mailboxes"],
  ["submitting", "Submitting workspace"]
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
    icon: Globe2,
    title: "Domain"
  },
  {
    icon: UserRound,
    title: "Owner account"
  },
  {
    icon: Inbox,
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
  setAppSubdomain: (value: string) => void;
  setMailboxes: React.Dispatch<React.SetStateAction<MailboxDraft[]>>;
  setOwnerEmail: (value: string) => void;
  setOwnerName: (value: string) => void;
  setOwnerPassword: (value: string) => void;
  setPortalZoneId: (value: string) => void;
  setSelectedZoneIds: React.Dispatch<React.SetStateAction<string[]>>;
  state: PreviewState;
};

export function renderPreviewFixture(input: FixtureInput): React.ReactNode {
  if (input.state === "deploying") {
    return (
      <div
        className="flex items-center gap-2.5 py-1 text-sm text-muted-foreground"
        aria-live="polite"
      >
        <Spinner className="text-foreground" />
        <span>Deploying HQBase resources to Cloudflare…</span>
      </div>
    );
  }
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
    const readinessError = input.state === "domain-error";
    return (
      <DomainStep
        appHostname={`${input.appSubdomain}.${input.portalZone?.name}`}
        appSubdomain={input.appSubdomain}
        connectionError={
          readinessError ? "Cloudflare needs attention on one or more checks below." : null
        }
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
        results={readinessError ? readinessFailureFixture() : []}
        selectedZoneIds={input.selectedZoneIds}
        selectedZones={input.selectedZones}
        setAppSubdomain={input.setAppSubdomain}
        setPortalZoneId={input.setPortalZoneId}
        zones={zones}
      />
    );
  }
  if (input.activeStep === OWNER_STEP) {
    const errors =
      input.state === "validation"
        ? {
            email: "Enter a valid Login email.",
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
      defaultFromMailboxAddress={input.mailboxes[0]?.address ?? ""}
      errors={{ rows: input.mailboxes.map(() => ({})) }}
      isPending={input.state === "submitting"}
      mailboxes={input.mailboxes}
      onAdd={() => input.setMailboxes((current) => [...current, { address: "", displayName: "" }])}
      onBack={() => undefined}
      onComplete={() => undefined}
      onRemove={(index) =>
        input.setMailboxes((current) => current.filter((_, itemIndex) => itemIndex !== index))
      }
      onSetDefaultFromMailboxAddress={() => undefined}
      onUpdate={(index, patch) =>
        input.setMailboxes((current) =>
          current.map((mailbox, itemIndex) =>
            itemIndex === index ? { ...mailbox, ...patch } : mailbox
          )
        )
      }
      submitError={null}
    />
  );
}

export function stepForPreviewState(state: PreviewState): number {
  if (["deploying", "loading", "failure"].includes(state)) return ACCESS_STEP;
  if (["domain", "domain-error"].includes(state)) return DOMAIN_STEP;
  if (["owner", "validation"].includes(state)) return OWNER_STEP;
  return MAILBOX_STEP;
}

function readinessFailureFixture(): ConfiguredDomain[] {
  const zone = zones[0];
  if (!zone) return [];

  return [
    {
      zone,
      result: {
        steps: [
          {
            id: "custom-domain",
            label: "Attach app URL",
            message: "hqbase.northstar.example routes to the HQBase Worker.",
            status: "success"
          },
          {
            id: "routing",
            label: "Enable Email Routing DNS",
            message: "Cloudflare accepted the Email Routing DNS configuration.",
            status: "success"
          },
          {
            id: "catch-all",
            label: "Route catch-all to Worker",
            message: "Catch-all routes to the HQBase Worker.",
            status: "success"
          },
          {
            id: "sending",
            label: "Enable Email Sending",
            message: "Email Sending is enabled for this domain.",
            status: "success"
          }
        ],
        status: {
          zone,
          workerName: "hqbase-preview",
          routing: {
            enabled: true,
            status: "active",
            dnsReady: false,
            missingRecords: 2,
            error: null
          },
          catchAll: {
            enabled: true,
            configuredForWorker: true,
            workerNames: ["hqbase-preview"],
            error: null
          },
          sending: {
            enabled: true,
            subdomains: [zone.name],
            error: null
          },
          ready: false
        }
      }
    }
  ];
}

export function phaseForPreviewState(state: PreviewState): SetupPhase {
  if (state === "deploying") return 1;
  if (["loading", "failure"].includes(state)) return 2;
  return 3;
}
