import { Globe2, Inbox, KeyRound, UserRound } from "lucide-react";
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
  const [furthestStep, setFurthestStep] = React.useState(ACCESS_STEP);
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
    setFurthestStep(saved.furthestStep);
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
        furthestStep,
        mailboxes,
        ownerEmail,
        ownerName
      })
    );
  }, [activeStep, createOwnerMailbox, furthestStep, mailboxes, ownerEmail, ownerName]);

  const cloudflare = useSetupCloudflare({
    onConnectionInvalidated: () => setFurthestStep((current) => Math.min(current, DOMAIN_STEP)),
    onDomainChanged: (previousDomain, domain) =>
      setMailboxes((current) => retargetMailboxes(current, previousDomain, domain)),
    onDomainConnected: () => advanceTo(OWNER_STEP),
    onTokenChanged: () => setFurthestStep(ACCESS_STEP),
    onTokenVerified: () => advanceTo(DOMAIN_STEP)
  });
  const ownerDraft = { email: ownerEmail, name: ownerName, password: ownerPassword };
  const ownerMailboxDraft = buildOwnerMailboxDraft(ownerEmail, ownerName, cloudflare.primaryDomain);
  const submittedMailboxes =
    createOwnerMailbox && ownerMailboxDraft ? [...mailboxes, ownerMailboxDraft] : mailboxes;
  const currentOwnerErrors = validateOwner(ownerDraft);
  const currentMailboxErrors = validateMailboxes(submittedMailboxes, cloudflare.primaryDomain);
  const ownerReady = !hasErrors(currentOwnerErrors);
  const mailboxesReady = !hasMailboxErrors(currentMailboxErrors);
  const ownerErrors = ownerAttempted ? currentOwnerErrors : {};
  const mailboxErrors = mailboxAttempted
    ? currentMailboxErrors
    : emptyMailboxErrors(submittedMailboxes.length);

  const steps = [
    {
      canOpen: furthestStep >= ACCESS_STEP,
      description: cloudflare.tokenReady ? "Access verified" : "Authorize once",
      icon: KeyRound,
      id: "access",
      isComplete: isWizardStepComplete(ACCESS_STEP, furthestStep, cloudflare.tokenReady),
      title: "Cloudflare access"
    },
    {
      canOpen: furthestStep >= DOMAIN_STEP,
      description: cloudflare.domainConnected
        ? cloudflare.primaryDomain
        : "Choose and connect a domain",
      icon: Globe2,
      id: "domain",
      isComplete: isWizardStepComplete(DOMAIN_STEP, furthestStep, cloudflare.domainConnected),
      title: "Domain"
    },
    {
      canOpen: furthestStep >= OWNER_STEP,
      description: ownerReady ? ownerEmail : "Create your sign-in",
      icon: UserRound,
      id: "owner",
      isComplete: isWizardStepComplete(OWNER_STEP, furthestStep, ownerReady),
      title: "Owner account"
    },
    {
      canOpen: furthestStep >= MAILBOX_STEP,
      description:
        furthestStep >= MAILBOX_STEP && mailboxesReady
          ? `${submittedMailboxes.length} shared addresses`
          : "Add shared addresses",
      icon: Inbox,
      id: "mailboxes",
      isComplete: isWizardStepComplete(MAILBOX_STEP, furthestStep, mailboxesReady),
      title: "Mailboxes"
    }
  ];

  function advanceTo(step: number) {
    setActiveStep(step);
    setFurthestStep((current) => Math.max(current, step));
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

  function handleStepSelect(step: number) {
    if (step > furthestStep) return;
    if (step >= DOMAIN_STEP && !cloudflare.tokenReady) {
      setActiveStep(ACCESS_STEP);
      return;
    }
    if (step >= OWNER_STEP && !cloudflare.domainConnected) {
      cloudflare.requireConnection();
      setActiveStep(DOMAIN_STEP);
      return;
    }
    if (step >= MAILBOX_STEP && hasErrors(validateOwner(ownerDraft))) {
      setOwnerAttempted(true);
      setActiveStep(OWNER_STEP);
      return;
    }
    setActiveStep(step);
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
    activeStep,
    domain: { ...cloudflare.domain, onBack: () => setActiveStep(ACCESS_STEP) },
    mailboxes: {
      createOwnerMailbox,
      errors: mailboxErrors,
      isPending,
      mailboxes,
      ownerMailboxDraft,
      ownerEmail,
      primaryDomain: cloudflare.primaryDomain,
      submitError,
      onAdd: addMailbox,
      onBack: () => setActiveStep(OWNER_STEP),
      onComplete: () => void handleComplete(),
      onEditDomain: () => setActiveStep(DOMAIN_STEP),
      onEditOwner: () => setActiveStep(OWNER_STEP),
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
    steps,
    onStepSelect: handleStepSelect
  };
}

function readSetupDraft(): {
  activeStep: number;
  createOwnerMailbox: boolean;
  furthestStep: number;
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
      furthestStep: Math.min(MAILBOX_STEP, Math.max(ACCESS_STEP, Number(value.furthestStep) || 0)),
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

export function isWizardStepComplete(
  step: number,
  furthestStep: number,
  isReady: boolean
): boolean {
  return isReady && furthestStep > step;
}
