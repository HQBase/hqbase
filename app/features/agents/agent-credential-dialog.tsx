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
import type { AgentProfile, ManagedAgent } from "./types";

const setupGuideUrl = "https://hqbase.io/docs/mcp/#connect-a-machine-identity";

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
      <DialogContent className="max-h-[92dvh] w-[min(92vw,560px)] overflow-y-auto">
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
  const skillPath = skillPathForProfile(agentProfile);
  const [skillUrl, setSkillUrl] = React.useState(skillPath);
  const skillUrlId = React.useId();

  React.useEffect(() => {
    setSkillUrl(new URL(skillPath, window.location.origin).toString());
  }, [skillPath]);

  async function copyCredential(): Promise<void> {
    try {
      await navigator.clipboard.writeText(credential);
      toast.success("Credential copied.");
    } catch {
      toast.error("Agent credential could not be copied.");
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {agentProfile === "mailbox" ? "Agent credential created" : "Provisioning key created"}
        </DialogTitle>
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
          size="fieldIcon"
        >
          <PiCopy />
        </Button>
      </div>
      <AgentSkillDetails
        description="Give this public skill URL to the same agent. It explains which API this credential can use."
        nextStep="Give the credential and skill URL to the agent through a secure channel. The skill is public; the credential is secret."
        skillUrl={skillUrl}
        skillUrlId={skillUrlId}
        title={agentProfile === "mailbox" ? "Mailbox agent skill" : "Provisioning skill"}
      />
      <DialogFooter>
        <Button onClick={onDone} type="button">
          Done
        </Button>
      </DialogFooter>
    </>
  );
}

export function AgentSetupDialog({
  agent,
  onClose
}: {
  agent: ManagedAgent | null;
  onClose: () => void;
}): React.ReactElement {
  return (
    <Dialog open={agent !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] w-[min(92vw,560px)] overflow-y-auto">
        {agent ? <AgentSetupContent agent={agent} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function AgentSetupContent({
  agent,
  onClose
}: {
  agent: ManagedAgent;
  onClose: () => void;
}): React.ReactElement {
  const skillPath = skillPathForProfile(agent.profile);
  const [skillUrl, setSkillUrl] = React.useState(skillPath);
  const skillUrlId = React.useId();

  React.useEffect(() => {
    setSkillUrl(new URL(skillPath, window.location.origin).toString());
  }, [skillPath]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Setup instructions</DialogTitle>
        <DialogDescription>Reconnect {agent.name} to HQBase.</DialogDescription>
      </DialogHeader>
      <Alert>
        <PiKey />
        <AlertTitle>Use the saved credential</AlertTitle>
        <AlertDescription>
          Use the one-time credential that you saved when this identity was created. HQBase stores
          only a hash and cannot show the credential again.
        </AlertDescription>
      </Alert>
      <AgentSkillDetails
        description="Give this public skill URL to the same software. It explains which API the credential can use."
        nextStep="Give the saved credential and skill URL to the software through a secure channel. The skill is public; the credential is secret."
        skillUrl={skillUrl}
        skillUrlId={skillUrlId}
        title={agent.profile === "mailbox" ? "Mailbox agent skill" : "Provisioning skill"}
      />
      <p className="text-xs text-muted-foreground">
        Need the full recap? Read the{" "}
        <a
          className="font-medium text-foreground underline underline-offset-4"
          href={setupGuideUrl}
          rel="noreferrer"
          target="_blank"
        >
          machine identity setup guide
        </a>
        .
      </p>
      <DialogFooter>
        <Button type="button" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}

function skillPathForProfile(profile: AgentProfile): string {
  return profile === "mailbox"
    ? "/skills/hqbase-mailbox/SKILL.md"
    : "/skills/hqbase-provisioner/SKILL.md";
}
