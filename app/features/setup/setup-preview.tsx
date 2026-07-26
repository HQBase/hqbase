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

import { SetupFrame } from "./setup-frame";
import { defaultMailboxesForDomains } from "./setup-helpers";
import {
  type PreviewState,
  phaseForPreviewState,
  previewStates,
  renderPreviewFixture,
  stepForPreviewState,
  steps,
  zones
} from "./setup-preview-fixtures";
import type { MailboxDraft } from "./setup-validation";
import { WizardLayout } from "./setup-wizard-parts";

export function SetupPreview(): React.ReactElement {
  const initialState = readPreviewState();
  const [state, setState] = React.useState<PreviewState>(initialState);
  const [controls, setControls] = React.useState(readControls());
  const [ownerName, setOwnerName] = React.useState("Alex Morgan");
  const [ownerEmail, setOwnerEmail] = React.useState("alex@northstar.example");
  const [ownerPassword, setOwnerPassword] = React.useState("preview-password");
  const [appSubdomain, setAppSubdomain] = React.useState("hqbase");
  const [portalZoneId, setPortalZoneId] = React.useState(zones[0]?.id ?? "zone-primary");
  const [selectedZoneIds, setSelectedZoneIds] = React.useState(zones.map((zone) => zone.id));
  const [mailboxes, setMailboxes] = React.useState<MailboxDraft[]>(() =>
    defaultMailboxesForDomains(zones.map((zone) => zone.name))
  );
  const activeStep = stepForPreviewState(state);
  const activePhase = phaseForPreviewState(state);
  const selectedZones = zones.filter((zone) => selectedZoneIds.includes(zone.id));
  const portalZone = zones.find((zone) => zone.id === portalZoneId) ?? null;

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
          className="border-b bg-card px-4 py-3 text-foreground sm:px-6"
          aria-label="Setup preview controls"
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
                Development fixtures only. No APIs or Cloudflare resources.
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
          activePhase === 3
            ? "Add your domain, owner account, and mailboxes."
            : "Complete installation before configuring your workspace."
        }
        title={activePhase === 3 ? "Configure workspace" : "Set up HQBase"}
      >
        <WizardLayout
          activePhase={activePhase}
          activeStep={activeStep}
          failed={state === "failure" || state === "validation"}
          steps={steps}
        >
          {renderPreviewFixture({
            activeStep,
            appSubdomain,
            mailboxes,
            ownerEmail,
            ownerName,
            ownerPassword,
            portalZone,
            portalZoneId,
            selectedZoneIds,
            selectedZones,
            setAppSubdomain,
            setMailboxes,
            setOwnerEmail,
            setOwnerName,
            setOwnerPassword,
            setPortalZoneId,
            setSelectedZoneIds,
            state
          })}
        </WizardLayout>
      </SetupFrame>
    </div>
  );
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
