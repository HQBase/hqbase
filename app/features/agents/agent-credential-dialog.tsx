import * as React from "react";
import { PiCopy, PiKey } from "react-icons/pi";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AgentSkillDetails } from "./connection-dialog";
import type { AgentProfile } from "./types";

export type AgentCredentialReveal = {
  agentName: string;
  agentProfile: AgentProfile;
  credential: string;
};

export function AgentCredentialDialog({
  reveal,
  onDone
}: {
  reveal: AgentCredentialReveal | null;
  onDone: () => void;
}): React.ReactElement {
  return (
    <Dialog open={reveal !== null} onOpenChange={(open) => !open && onDone()}>
      <DialogContent className="w-[min(92vw,560px)]">
        {reveal ? (
          <AgentCredentialContent
            agentName={reveal.agentName}
            agentProfile={reveal.agentProfile}
            credential={reveal.credential}
            onDone={onDone}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function AgentCredentialContent({
  agentName,
  agentProfile,
  credential,
  onDone
}: AgentCredentialReveal & { onDone: () => void }): React.ReactElement {
  const skillPath =
    agentProfile === "mailbox"
      ? "/skills/hqbase-mailbox/SKILL.md"
      : "/skills/hqbase-provisioner/SKILL.md";
  const [skillUrl, setSkillUrl] = React.useState(skillPath);
  const skillUrlId = React.useId();

  React.useEffect(() => {
    setSkillUrl(new URL(skillPath, window.location.origin).toString());
  }, [skillPath]);

  async function copyCredential(): Promise<void> {
    try {
      await navigator.clipboard.writeText(credential);
      toast.success("Agent credential copied.");
    } catch {
      toast.error("Agent credential could not be copied.");
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Agent credential created</DialogTitle>
        <DialogDescription>Use this credential to connect {agentName} to HQBase.</DialogDescription>
      </DialogHeader>
      <Alert>
        <PiKey />
        <AlertTitle>Shown once</AlertTitle>
        <AlertDescription>
          HQBase stores only a hash. Copy this credential before you close this window.
        </AlertDescription>
      </Alert>
      <div className="flex items-center gap-2">
        <Input
          aria-label="Agent credential"
          className="font-mono text-base sm:text-xs"
          readOnly
          value={credential}
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button
          aria-label="Copy agent credential"
          onClick={() => void copyCredential()}
          size="icon"
        >
          <PiCopy />
        </Button>
      </div>
      <AgentSkillDetails
        description="Give this public skill URL to the same agent. It explains which API this credential can use."
        nextStep="Give the credential and skill URL to the agent through a secure channel. The skill is public; the credential is secret."
        skillUrl={skillUrl}
        skillUrlId={skillUrlId}
        title={agentProfile === "mailbox" ? "Mailbox agent skill" : "Provisioner skill"}
      />
      <DialogFooter>
        <Button onClick={onDone} type="button">
          Done
        </Button>
      </DialogFooter>
    </>
  );
}
