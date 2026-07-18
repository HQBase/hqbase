import { Globe2, Inbox, UserRound } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

import { AccessStep } from "./setup-access-screen";
import { DomainStep } from "./setup-domain-screen";
import { SetupFrame } from "./setup-frame";
import type { MailboxDraft } from "./setup-validation";
import { WizardLayout } from "./setup-wizard-parts";
import { MailboxStep, OwnerStep } from "./setup-workspace-screens";
import type { CloudflareConfigureResult, CloudflareZone } from "./types";

const previewStates = [
  ["loading", "Access loading"],
  ["access", "Access action"],
  ["failure", "Access failure"],
  ["domain", "Domain selection"],
  ["domain-error", "Domain readiness error"],
  ["owner", "Owner account"],
  ["validation", "Validation errors"],
  ["mailboxes", "Mailboxes"],
  ["submitting", "Submitting workspace"]
] as const;

type PreviewState = (typeof previewStates)[number][0];

const zones: CloudflareZone[] = [
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

const steps = [
  { icon: Globe2, title: "Domain" },
  { icon: UserRound, title: "Owner account" },
  { icon: Inbox, title: "Mailboxes" }
];

export function SetupPreview(): React.ReactElement {
  const [state, setState] = React.useState<PreviewState>(readPreviewState());
  const [controls, setControls] = React.useState(readControls());
  const [selectedZoneId, setSelectedZoneId] = React.useState(zones[0]?.id ?? "");
  const [appSubdomain, setAppSubdomain] = React.useState("hqbase");
  const [ownerName, setOwnerName] = React.useState("Alex Morgan");
  const [ownerEmail, setOwnerEmail] = React.useState("alex@northstar.example");
  const [ownerPassword, setOwnerPassword] = React.useState("preview-password");
  const [createOwnerMailbox, setCreateOwnerMailbox] = React.useState(false);
  const [mailboxes, setMailboxes] = React.useState<MailboxDraft[]>([
    { address: "support@northstar.example", displayName: "Support" },
    { address: "privacy@northstar.example", displayName: "Privacy" }
  ]);
  const accessReady = !["loading", "access", "failure"].includes(state);
  const activeStep = !accessReady
    ? 0
    : state === "domain" || state === "domain-error"
      ? 1
      : state === "owner" || state === "validation"
        ? 2
        : 3;
  const selectedZone = zones.find((zone) => zone.id === selectedZoneId) ?? null;
  const result = state === "domain-error" ? readinessFailureFixture() : null;

  function selectState(next: PreviewState) {
    setState(next);
    const url = new URL(window.location.href);
    url.searchParams.set("state", next);
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="min-h-screen bg-background">
      {controls ? (
        <aside
          aria-label="Setup preview controls"
          className="border-b bg-card px-4 py-3 text-foreground sm:px-6"
        >
          <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <Field className="w-full sm:max-w-xs">
              <FieldLabel htmlFor="preview-state">Setup UI lab</FieldLabel>
              <Select value={state} onValueChange={(value) => selectState(value as PreviewState)}>
                <SelectTrigger id="preview-state">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {previewStates.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                Development fixtures only. No Cloudflare resources.
              </FieldDescription>
            </Field>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setControls(false);
                setControlsQuery(false);
              }}
            >
              Hide controls
            </Button>
          </div>
        </aside>
      ) : (
        <Button
          className="fixed bottom-4 right-4 z-50"
          size="sm"
          type="button"
          variant="outline"
          onClick={() => {
            setControls(true);
            setControlsQuery(true);
          }}
        >
          Show UI lab
        </Button>
      )}
      <SetupFrame
        description={
          accessReady
            ? "Add your domain, owner account, and mailboxes."
            : "Complete installation before configuring your workspace."
        }
        title={accessReady ? "Configure workspace" : "Set up HQBase Community"}
      >
        <WizardLayout
          accessFailed={state === "failure"}
          accessReady={accessReady}
          activeStep={activeStep}
          steps={steps}
        >
          {renderFixture({
            activeStep,
            appSubdomain,
            createOwnerMailbox,
            mailboxes,
            ownerEmail,
            ownerName,
            ownerPassword,
            result,
            selectedZone,
            selectedZoneId,
            setAppSubdomain,
            setCreateOwnerMailbox,
            setMailboxes,
            setOwnerEmail,
            setOwnerName,
            setOwnerPassword,
            setSelectedZoneId,
            state
          })}
        </WizardLayout>
      </SetupFrame>
    </div>
  );
}

function renderFixture(input: {
  activeStep: number;
  appSubdomain: string;
  createOwnerMailbox: boolean;
  mailboxes: MailboxDraft[];
  ownerEmail: string;
  ownerName: string;
  ownerPassword: string;
  result: CloudflareConfigureResult | null;
  selectedZone: CloudflareZone | null;
  selectedZoneId: string;
  setAppSubdomain: (value: string) => void;
  setCreateOwnerMailbox: (value: boolean) => void;
  setMailboxes: React.Dispatch<React.SetStateAction<MailboxDraft[]>>;
  setOwnerEmail: (value: string) => void;
  setOwnerName: (value: string) => void;
  setOwnerPassword: (value: string) => void;
  setSelectedZoneId: (value: string) => void;
  state: PreviewState;
}): React.ReactNode {
  if (input.activeStep === 0) {
    return (
      <AccessStep
        apiToken=""
        error={
          input.state === "failure" ? "Cloudflare authorization expired. Please try again." : null
        }
        isLoading={input.state === "loading"}
        onApiTokenChange={() => undefined}
        onNext={() => undefined}
      />
    );
  }
  if (input.activeStep === 1) {
    return (
      <DomainStep
        appHostname={`${input.appSubdomain}.${input.selectedZone?.name ?? "yourdomain.com"}`}
        appSubdomain={input.appSubdomain}
        connectionError={
          input.result ? "Cloudflare needs attention on one or more checks below." : null
        }
        errors={{}}
        isLoading={false}
        onBack={null}
        onConnect={() => undefined}
        onSelect={input.setSelectedZoneId}
        result={input.result}
        selectedZone={input.selectedZone}
        selectedZoneId={input.selectedZoneId}
        setAppSubdomain={input.setAppSubdomain}
        zones={zones}
      />
    );
  }
  if (input.activeStep === 2) {
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
      createOwnerMailbox={input.createOwnerMailbox}
      errors={{ rows: input.mailboxes.map(() => ({})) }}
      isPending={input.state === "submitting"}
      mailboxes={input.mailboxes}
      ownerMailboxDraft={{ address: "alex@northstar.example", displayName: "Alex Morgan" }}
      submitError={null}
      onAdd={() => input.setMailboxes((current) => [...current, { address: "", displayName: "" }])}
      onBack={() => undefined}
      onComplete={() => undefined}
      onRemove={(index) =>
        input.setMailboxes((current) => current.filter((_, itemIndex) => itemIndex !== index))
      }
      onSetCreateOwnerMailbox={input.setCreateOwnerMailbox}
      onUpdate={(index, patch) =>
        input.setMailboxes((current) =>
          current.map((mailbox, itemIndex) =>
            itemIndex === index ? { ...mailbox, ...patch } : mailbox
          )
        )
      }
    />
  );
}

function readinessFailureFixture(): CloudflareConfigureResult {
  const zone = zones[0] as CloudflareZone;
  return {
    steps: [
      { id: "custom-domain", label: "Attach app URL", message: "Ready", status: "success" },
      { id: "routing", label: "Enable Email Routing DNS", message: "Ready", status: "success" },
      { id: "catch-all", label: "Route catch-all to Worker", message: "Ready", status: "success" },
      { id: "sending", label: "Enable Email Sending", message: "Ready", status: "success" }
    ],
    status: {
      catchAll: {
        configuredForWorker: true,
        enabled: true,
        error: null,
        workerNames: ["hqbase-preview"]
      },
      ready: false,
      routing: { dnsReady: false, enabled: true, error: null, missingRecords: 2, status: "active" },
      sending: { enabled: true, error: null, subdomains: [zone.name] },
      workerName: "hqbase-preview",
      zone
    }
  };
}

function readPreviewState(): PreviewState {
  const value = new URLSearchParams(window.location.search).get("state");
  return previewStates.some(([state]) => state === value) ? (value as PreviewState) : "loading";
}

function readControls(): boolean {
  return new URLSearchParams(window.location.search).get("controls") !== "0";
}

function setControlsQuery(visible: boolean) {
  const url = new URL(window.location.href);
  url.searchParams.set("controls", visible ? "1" : "0");
  window.history.replaceState(null, "", url);
}
