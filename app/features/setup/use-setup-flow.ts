import { Globe2, Inbox, UserRound } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { bootstrapSetup } from "./api";
import { buildOwnerMailboxDraft, emptyMailboxErrors, retargetMailboxes } from "./setup-helpers";
import type { MailboxDraft } from "./setup-validation";
import { hasErrors, hasMailboxErrors, validateMailboxes, validateOwner } from "./setup-validation";
import type { BootstrapSetupInput } from "./types";
import { useSetupCloudflare } from "./use-setup-cloudflare";

export const ACCESS_STEP = 0;
export const DOMAIN_STEP = 1;
export const OWNER_STEP = 2;
export const MAILBOX_STEP = 3;

export function useSetupFlow(onComplete: () => void) {
  const [activeStep, setActiveStep] = React.useState(ACCESS_STEP);
  const [ownerName, setOwnerName] = React.useState("");
  const [ownerEmail, setOwnerEmail] = React.useState("");
  const [ownerPassword, setOwnerPassword] = React.useState("");
  const [ownerAttempted, setOwnerAttempted] = React.useState(false);
  const [createOwnerMailbox, setCreateOwnerMailbox] = React.useState(false);
  const [mailboxes, setMailboxes] = React.useState<MailboxDraft[]>([
    { address: "", displayName: "Support" },
    { address: "", displayName: "Privacy" }
  ]);
  const [mailboxAttempted, setMailboxAttempted] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [isPending, setIsPending] = React.useState(false);

  React.useEffect(() => {
    const saved = readSetupDraft();
    if (!saved) return;
    setActiveStep(saved.activeStep);
    setOwnerName(saved.ownerName);
    setOwnerEmail(saved.ownerEmail);
    setCreateOwnerMailbox(saved.createOwnerMailbox);
    setMailboxes(saved.mailboxes);
  }, []);

  React.useEffect(() => {
    localStorage.setItem(
      "hqb_community_setup_draft_v1",
      JSON.stringify({
        activeStep,
        createOwnerMailbox,
        mailboxes,
        ownerEmail,
        ownerName
      })
    );
  }, [activeStep, createOwnerMailbox, mailboxes, ownerEmail, ownerName]);

  const cloudflare = useSetupCloudflare({
    onConnectionInvalidated: () => setActiveStep((current) => Math.min(current, DOMAIN_STEP)),
    onDomainChanged: (previousDomain, domain) =>
      setMailboxes((current) => retargetMailboxes(current, previousDomain, domain)),
    onDomainConnected: () => advanceTo(OWNER_STEP),
    onTokenChanged: () => setActiveStep(ACCESS_STEP),
    onTokenVerified: () => setActiveStep(DOMAIN_STEP)
  });
  const ownerDraft = { email: ownerEmail, name: ownerName, password: ownerPassword };
  const ownerMailboxDraft = buildOwnerMailboxDraft(ownerEmail, ownerName, cloudflare.primaryDomain);
  const submittedMailboxes =
    createOwnerMailbox && ownerMailboxDraft ? [...mailboxes, ownerMailboxDraft] : mailboxes;
  const currentOwnerErrors = validateOwner(ownerDraft);
  const currentMailboxErrors = validateMailboxes(submittedMailboxes, cloudflare.primaryDomain);
  const ownerErrors = ownerAttempted ? currentOwnerErrors : {};
  const mailboxErrors = mailboxAttempted
    ? currentMailboxErrors
    : emptyMailboxErrors(submittedMailboxes.length);

  const steps = [
    { icon: Globe2, title: "Domain" },
    { icon: UserRound, title: "Owner account" },
    { icon: Inbox, title: "Mailboxes" }
  ];

  function advanceTo(step: number) {
    setActiveStep(step);
  }

  function handleOwnerNext() {
    setOwnerAttempted(true);
    if (hasErrors(validateOwner(ownerDraft))) return;
    setSubmitError(null);
    advanceTo(MAILBOX_STEP);
  }

  async function handleComplete() {
    setSubmitError(null);
    if (!cloudflare.domainConnected) {
      cloudflare.requireConnection("Reconnect the domain before creating the workspace.");
      setActiveStep(DOMAIN_STEP);
      return;
    }
    setOwnerAttempted(true);
    if (hasErrors(validateOwner(ownerDraft))) {
      setActiveStep(OWNER_STEP);
      return;
    }
    setMailboxAttempted(true);
    if (hasMailboxErrors(validateMailboxes(submittedMailboxes, cloudflare.primaryDomain))) return;

    const input: BootstrapSetupInput = {
      checklistAcknowledged: true,
      mailboxes: submittedMailboxes,
      ownerEmail,
      ownerName,
      ownerPassword,
      primaryDomain: cloudflare.primaryDomain
    };
    setIsPending(true);
    try {
      await bootstrapSetup(input);
      localStorage.removeItem("hqb_community_setup_draft_v1");
      toast.success("HQBase is ready.");
      onComplete();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Workspace setup failed.");
    } finally {
      setIsPending(false);
    }
  }

  function updateOwner(update: () => void) {
    update();
    setSubmitError(null);
  }

  function addMailbox() {
    if (submittedMailboxes.length < 20) {
      setMailboxes((current) => [...current, { address: "", displayName: "" }]);
    }
    setSubmitError(null);
  }

  function removeMailbox(index: number) {
    setMailboxes((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setSubmitError(null);
  }

  function updateMailbox(index: number, patch: Partial<MailboxDraft>) {
    setMailboxes((current) =>
      current.map((mailbox, itemIndex) =>
        itemIndex === index ? { ...mailbox, ...patch } : mailbox
      )
    );
    setSubmitError(null);
  }

  return {
    access: cloudflare.access,
    accessFailed: Boolean(cloudflare.access.error),
    accessReady: cloudflare.tokenReady,
    activeStep,
    domain: { ...cloudflare.domain, onBack: null },
    mailboxes: {
      createOwnerMailbox,
      errors: mailboxErrors,
      isPending,
      mailboxes,
      ownerMailboxDraft,
      submitError,
      onAdd: addMailbox,
      onBack: () => setActiveStep(OWNER_STEP),
      onComplete: () => void handleComplete(),
      onRemove: removeMailbox,
      onSetCreateOwnerMailbox: (checked: boolean) => {
        setCreateOwnerMailbox(checked);
        setSubmitError(null);
      },
      onUpdate: updateMailbox
    },
    owner: {
      errors: ownerErrors,
      ownerEmail,
      ownerName,
      ownerPassword,
      setOwnerEmail: (value: string) => updateOwner(() => setOwnerEmail(value)),
      setOwnerName: (value: string) => updateOwner(() => setOwnerName(value)),
      setOwnerPassword: (value: string) => updateOwner(() => setOwnerPassword(value)),
      onBack: () => setActiveStep(DOMAIN_STEP),
      onNext: handleOwnerNext
    },
    steps
  };
}

function readSetupDraft(): {
  activeStep: number;
  createOwnerMailbox: boolean;
  mailboxes: MailboxDraft[];
  ownerEmail: string;
  ownerName: string;
} | null {
  try {
    const value = JSON.parse(
      localStorage.getItem("hqb_community_setup_draft_v1") ?? "null"
    ) as Record<string, unknown> | null;
    if (!value || !Array.isArray(value.mailboxes)) return null;
    return {
      activeStep: Math.min(MAILBOX_STEP, Math.max(ACCESS_STEP, Number(value.activeStep) || 0)),
      createOwnerMailbox: value.createOwnerMailbox === true,
      mailboxes: value.mailboxes
        .filter((item): item is MailboxDraft =>
          Boolean(item && typeof item === "object" && "address" in item && "displayName" in item)
        )
        .slice(0, 20),
      ownerEmail: typeof value.ownerEmail === "string" ? value.ownerEmail.slice(0, 320) : "",
      ownerName: typeof value.ownerName === "string" ? value.ownerName.slice(0, 120) : ""
    };
  } catch {
    return null;
  }
}
