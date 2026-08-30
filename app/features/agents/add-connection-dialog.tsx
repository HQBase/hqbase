import * as React from "react";
import { PiArrowLeft, PiKey, PiMailbox, PiRobot } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import type { CurrentUser } from "@/features/auth/types";
import type { Mailbox } from "@/features/mailboxes/types";
import { McpConnectionDetails } from "@/features/mcp/connection-dialog";
import { AgentCreateForm, type AgentDomainOption } from "./agent-create-dialog";
import { AgentSkillDetails } from "./connection-dialog";
import type { AgentCredentialResult, AgentProfile } from "./types";

type AddConnectionStep = "choose" | "assistant" | AgentProfile;

export function AddConnectionDialog({
  canManage,
  domains,
  mailboxes,
  open,
  user,
  onCreated,
  onOpenChange
}: {
  canManage: boolean;
  domains: AgentDomainOption[];
  mailboxes: Mailbox[];
  open: boolean;
  user: CurrentUser;
  onCreated: (result: AgentCredentialResult) => void;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  const [step, setStep] = React.useState<AddConnectionStep>("choose");
  const readOnlyEndpointId = React.useId();
  const fullEndpointId = React.useId();
  const mailSkillUrlId = React.useId();
  const [readOnlyEndpoint, setReadOnlyEndpoint] = React.useState("/mcp");
  const [fullEndpoint, setFullEndpoint] = React.useState("/mcp/full");
  const [mailSkillUrl, setMailSkillUrl] = React.useState("/skills/hqbase-mail/SKILL.md");

  React.useEffect(() => {
    setReadOnlyEndpoint(new URL("/mcp", window.location.origin).toString());
    setFullEndpoint(new URL("/mcp/full", window.location.origin).toString());
    setMailSkillUrl(new URL("/skills/hqbase-mail/SKILL.md", window.location.origin).toString());
  }, []);

  function setOpen(nextOpen: boolean): void {
    if (!nextOpen) setStep("choose");
    onOpenChange(nextOpen);
  }

  function handleCreated(result: AgentCredentialResult): void {
    setOpen(false);
    onCreated(result);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[92dvh] w-[min(94vw,620px)] overflow-y-auto">
        {step === "choose" ? (
          <AddConnectionChoices canManage={canManage} onSelect={setStep} />
        ) : null}
        {step === "assistant" ? (
          <AssistantSetup
            fullEndpoint={fullEndpoint}
            fullEndpointId={fullEndpointId}
            mailSkillUrl={mailSkillUrl}
            mailSkillUrlId={mailSkillUrlId}
            readOnlyEndpoint={readOnlyEndpoint}
            readOnlyEndpointId={readOnlyEndpointId}
            user={user}
            onBack={() => setStep("choose")}
            onDone={() => setOpen(false)}
          />
        ) : null}
        {step === "mailbox" || step === "provisioner" ? (
          <AgentCreateForm
            domains={domains}
            mailboxes={mailboxes}
            profile={step}
            onBack={() => setStep("choose")}
            onCreated={handleCreated}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AddConnectionChoices({
  canManage,
  onSelect
}: {
  canManage: boolean;
  onSelect: (step: AddConnectionStep) => void;
}): React.ReactElement {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Add connection</DialogTitle>
        <DialogDescription>Choose how the software will access HQBase.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <ConnectionChoice
          description="Connect through MCP or the Mail API skill with your current access."
          icon={<PiRobot />}
          title="AI assistant"
          onClick={() => onSelect("assistant")}
        />
        {canManage ? (
          <ConnectionChoice
            description="Give software its own identity and access to one exact mailbox."
            icon={<PiMailbox />}
            title="Automation with its own mailbox"
            onClick={() => onSelect("mailbox")}
          />
        ) : null}
        {canManage ? (
          <ConnectionChoice
            description="Let trusted control-plane software create mailbox identities."
            icon={<PiKey />}
            title="Provisioning key"
            onClick={() => onSelect("provisioner")}
          />
        ) : null}
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
      </DialogFooter>
    </>
  );
}

function ConnectionChoice({
  description,
  icon,
  title,
  onClick
}: {
  description: string;
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      className="flex min-h-20 w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-ring [&_svg]:size-5"
      type="button"
      onClick={onClick}
    >
      <span className="inline-flex size-10 shrink-0 items-center justify-center text-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="mt-1 block text-xs leading-4 text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

function AssistantSetup({
  fullEndpoint,
  fullEndpointId,
  mailSkillUrl,
  mailSkillUrlId,
  readOnlyEndpoint,
  readOnlyEndpointId,
  user,
  onBack,
  onDone
}: {
  fullEndpoint: string;
  fullEndpointId: string;
  mailSkillUrl: string;
  mailSkillUrlId: string;
  readOnlyEndpoint: string;
  readOnlyEndpointId: string;
  user: CurrentUser;
  onBack: () => void;
  onDone: () => void;
}): React.ReactElement {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Connect an AI assistant</DialogTitle>
        <DialogDescription>
          Use MCP when your assistant supports it. You will authorize access in your browser.
        </DialogDescription>
      </DialogHeader>
      <McpConnectionDetails
        fullEndpoint={fullEndpoint}
        fullEndpointId={fullEndpointId}
        readOnlyEndpoint={readOnlyEndpoint}
        readOnlyEndpointId={readOnlyEndpointId}
        user={user}
      />
      <details className="rounded-lg border px-3 py-2.5">
        <summary className="cursor-pointer text-sm font-medium">
          Use the Mail API skill instead
        </summary>
        <div className="mt-4 border-t pt-4">
          <AgentSkillDetails
            flat
            skillUrl={mailSkillUrl}
            skillUrlId={mailSkillUrlId}
            title="Mail API skill"
          />
        </div>
      </details>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onBack}>
          <PiArrowLeft data-icon="inline-start" />
          Back
        </Button>
        <Button type="button" onClick={onDone}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}
