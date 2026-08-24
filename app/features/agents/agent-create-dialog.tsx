import * as React from "react";
import { PiPlus, PiWarning } from "react-icons/pi";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { DropdownSelect } from "@/components/ui/dropdown-select";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Mailbox } from "@/features/mailboxes/types";
import { createAgent } from "./api";
import type {
  AgentCredentialResult,
  AgentMailboxAccess,
  AgentProfile,
  CreateAgentInput
} from "./types";

const newMailboxValue = "__new_mailbox__";

export type AgentDomainOption = { id: string; name: string; isEnabled: boolean };

export function AgentCreateDialog({
  domains,
  mailboxes,
  profile,
  onCreated
}: {
  domains: AgentDomainOption[];
  mailboxes: Mailbox[];
  profile?: AgentProfile;
  onCreated: (result: AgentCredentialResult) => void;
}): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const createLabel =
    profile === "mailbox"
      ? "Create mailbox agent"
      : profile === "provisioner"
        ? "Create provisioner agent"
        : "Create agent";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" type="button">
          <PiPlus data-icon="inline-start" />
          {createLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(94vw,600px)]">
        <AgentCreateForm
          domains={domains}
          mailboxes={mailboxes}
          {...(profile ? { profile } : {})}
          onCreated={(result) => {
            setOpen(false);
            onCreated(result);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function AgentCreateForm({
  domains,
  mailboxes,
  profile: fixedProfile,
  onCreated
}: {
  domains: AgentDomainOption[];
  mailboxes: Mailbox[];
  profile?: AgentProfile;
  onCreated: (result: AgentCredentialResult) => void;
}): React.ReactElement {
  const enabledDomains = domains.filter((domain) => domain.isEnabled);
  const activeMailboxes = mailboxes.filter((mailbox) => mailbox.isActive);
  const [profile, setProfile] = React.useState<AgentProfile>(fixedProfile ?? "mailbox");
  const [name, setName] = React.useState("");
  const [mailboxChoice, setMailboxChoice] = React.useState(newMailboxValue);
  const [address, setAddress] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [accessLevel, setAccessLevel] = React.useState<AgentMailboxAccess>("read");
  const [mailDomainId, setMailDomainId] = React.useState("");
  const [mailboxLimit, setMailboxLimit] = React.useState("10");
  const [pending, setPending] = React.useState(false);
  const selectedMailbox = activeMailboxes.find((mailbox) => mailbox.id === mailboxChoice);
  const selectedDomain = enabledDomains.find((domain) => domain.id === mailDomainId);

  function createInput(): CreateAgentInput | null {
    const normalizedName = name.trim();
    if (!normalizedName) return null;

    if (profile === "mailbox") {
      if (mailboxChoice !== newMailboxValue) {
        return {
          profile,
          name: normalizedName,
          accessLevel,
          mailbox: { id: mailboxChoice }
        };
      }
      if (!address.trim() || !displayName.trim()) return null;
      return {
        profile,
        name: normalizedName,
        accessLevel,
        mailbox: { address: address.trim().toLowerCase(), displayName: displayName.trim() }
      };
    }

    const limit = Number(mailboxLimit);
    if (!mailDomainId || !Number.isInteger(limit) || limit < 1) return null;
    return { profile, name: normalizedName, mailDomainId, mailboxLimit: limit };
  }

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const input = createInput();
    if (!input) return;
    setPending(true);
    try {
      const result = await createAgent(input);
      toast.success(`${result.agent.name} created.`);
      onCreated(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Agent could not be created.");
    } finally {
      setPending(false);
    }
  }

  const canSubmit =
    name.trim().length > 0 &&
    (profile === "mailbox"
      ? mailboxChoice !== newMailboxValue || (address.trim() !== "" && displayName.trim() !== "")
      : mailDomainId !== "" && Number.isInteger(Number(mailboxLimit)) && Number(mailboxLimit) >= 1);

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {fixedProfile === "mailbox"
            ? "Create mailbox agent"
            : fixedProfile === "provisioner"
              ? "Create provisioner agent"
              : "Create agent"}
        </DialogTitle>
        <DialogDescription>Give software restricted access to HQBase.</DialogDescription>
      </DialogHeader>
      <form className="flex flex-col gap-5" onSubmit={(event) => void submit(event)}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="new-agent-name">Name</FieldLabel>
            <Input
              autoComplete="off"
              id="new-agent-name"
              placeholder="Support assistant"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
        </FieldGroup>

        <Tabs value={profile} onValueChange={(value) => setProfile(value as AgentProfile)}>
          {fixedProfile ? null : (
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="mailbox">Mailbox agent</TabsTrigger>
              <TabsTrigger value="provisioner">Provisioner</TabsTrigger>
            </TabsList>
          )}

          <TabsContent className="mt-5" value="mailbox">
            <FieldGroup>
              <Field>
                <FieldLabel>Mailbox</FieldLabel>
                <DropdownSelect
                  ariaLabel="Mailbox"
                  options={[
                    { label: "Create a new mailbox", value: newMailboxValue },
                    ...activeMailboxes.map((mailbox) => ({
                      label: mailbox.address,
                      value: mailbox.id
                    }))
                  ]}
                  value={mailboxChoice}
                  onValueChange={setMailboxChoice}
                />
              </Field>
              {mailboxChoice === newMailboxValue ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="new-agent-mailbox-address">Email address</FieldLabel>
                    <Input
                      id="new-agent-mailbox-address"
                      placeholder="assistant@example.com"
                      required
                      type="email"
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="new-agent-mailbox-name">Display name</FieldLabel>
                    <Input
                      id="new-agent-mailbox-name"
                      placeholder="Support assistant"
                      required
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                    />
                  </Field>
                </>
              ) : null}
              <Field>
                <FieldLabel>Access</FieldLabel>
                <DropdownSelect
                  ariaLabel="Agent mailbox access"
                  options={[
                    { label: "Read only", value: "read" },
                    { label: "Handle mail", value: "agent" }
                  ]}
                  value={accessLevel}
                  onValueChange={(value) => setAccessLevel(value as AgentMailboxAccess)}
                />
                <FieldDescription>
                  Handle mail also lets the agent organize, draft, and send from this mailbox.
                </FieldDescription>
              </Field>
            </FieldGroup>
            <Alert className="mt-5">
              <PiWarning />
              <AlertTitle>Full mailbox access</AlertTitle>
              <AlertDescription>
                This agent can read all current and future mail in{" "}
                {selectedMailbox?.address ?? "this mailbox"}.
              </AlertDescription>
            </Alert>
          </TabsContent>

          <TabsContent className="mt-5" value="provisioner">
            <FieldGroup>
              <Field>
                <FieldLabel>Allowed domain</FieldLabel>
                <DropdownSelect
                  ariaLabel="Allowed domain"
                  options={enabledDomains.map((domain) => ({
                    label: domain.name,
                    value: domain.id
                  }))}
                  placeholder="Choose a domain"
                  value={mailDomainId}
                  onValueChange={setMailDomainId}
                />
                {enabledDomains.length === 0 ? (
                  <FieldDescription>
                    Enable an email domain before creating a provisioner.
                  </FieldDescription>
                ) : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="new-agent-mailbox-limit">Mailbox limit</FieldLabel>
                <Input
                  id="new-agent-mailbox-limit"
                  min={1}
                  required
                  step={1}
                  type="number"
                  value={mailboxLimit}
                  onChange={(event) => setMailboxLimit(event.target.value)}
                />
              </Field>
            </FieldGroup>
            <Alert className="mt-5">
              <PiWarning />
              <AlertTitle>Trusted provisioning</AlertTitle>
              <AlertDescription>
                This agent can create up to {mailboxLimit || "0"} mailboxes
                {selectedDomain ? ` on ${selectedDomain.name}` : " on the selected domain"}. It
                receives each new mailbox agent credential. Its own credential cannot call the Mail
                API. Keep it in a trusted control-plane service.
              </AlertDescription>
            </Alert>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button disabled={pending || !canSubmit} type="submit">
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {pending ? "Creating…" : fixedProfile ? "Create" : "Create agent"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
