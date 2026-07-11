import { Globe2, Inbox, KeyRound, UserRound } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { bootstrapSetup } from "./api";
import { emptyMailboxErrors, retargetMailboxes } from "./setup-helpers";
import { ACCESS_STEP, DOMAIN_STEP, MAILBOX_STEP, OWNER_STEP } from "./setup-steps";
import type { MailboxDraft } from "./setup-validation";
import { hasErrors, hasMailboxErrors, validateMailboxes, validateOwner } from "./setup-validation";
import type { BootstrapSetupInput } from "./types";
import { useSetupCloudflare } from "./use-setup-cloudflare";

export function useSetupFlow(onComplete: () => void) {
  const [activeStep, setActiveStep] = React.useState(ACCESS_STEP);
  const [furthestStep, setFurthestStep] = React.useState(ACCESS_STEP);
  const [ownerName, setOwnerName] = React.useState("");
  const [ownerEmail, setOwnerEmail] = React.useState("");
  const [ownerPassword, setOwnerPassword] = React.useState("");
  const [ownerAttempted, setOwnerAttempted] = React.useState(false);
  const [mailboxes, setMailboxes] = React.useState<MailboxDraft[]>([
    { address: "", displayName: "Support" },
    { address: "", displayName: "Privacy" }
  ]);
  const [mailboxAttempted, setMailboxAttempted] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [isPending, setIsPending] = React.useState(false);

  const cloudflare = useSetupCloudflare({
    onConnectionInvalidated: () => setFurthestStep((current) => Math.min(current, DOMAIN_STEP)),
    onDomainChanged: (previousDomain, domain) =>
      setMailboxes((current) => retargetMailboxes(current, previousDomain, domain)),
    onDomainConnected: () => advanceTo(OWNER_STEP),
    onTokenChanged: () => setFurthestStep(ACCESS_STEP),
    onTokenVerified: () => advanceTo(DOMAIN_STEP)
  });
  const ownerDraft = { email: ownerEmail, name: ownerName, password: ownerPassword };
  const currentOwnerErrors = validateOwner(ownerDraft);
  const currentMailboxErrors = validateMailboxes(
    mailboxes,
    cloudflare.emailDomains.map((domain) => domain.name)
  );
  const ownerReady = !hasErrors(currentOwnerErrors);
  const mailboxesReady = !hasMailboxErrors(currentMailboxErrors);
  const ownerErrors = ownerAttempted ? currentOwnerErrors : {};
  const mailboxErrors = mailboxAttempted
    ? currentMailboxErrors
    : emptyMailboxErrors(mailboxes.length);

  const steps = [
    {
      canOpen: furthestStep >= ACCESS_STEP,
      description: cloudflare.tokenReady ? "Access verified" : "Temporary setup token",
      icon: KeyRound,
      id: "access",
      isComplete: cloudflare.tokenReady,
      title: "Cloudflare access"
    },
    {
      canOpen: furthestStep >= DOMAIN_STEP,
      description: cloudflare.domainConnected
        ? cloudflare.primaryDomain
        : "Choose and connect a domain",
      icon: Globe2,
      id: "domain",
      isComplete: cloudflare.domainConnected,
      title: "Domain"
    },
    {
      canOpen: furthestStep >= OWNER_STEP,
      description: ownerReady ? ownerEmail : "Create your sign-in",
      icon: UserRound,
      id: "owner",
      isComplete: ownerReady,
      title: "Owner account"
    },
    {
      canOpen: furthestStep >= MAILBOX_STEP,
      description: mailboxesReady ? `${mailboxes.length} shared addresses` : "Add shared addresses",
      icon: Inbox,
      id: "mailboxes",
      isComplete: mailboxesReady,
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
    if (
      hasMailboxErrors(
        validateMailboxes(
          mailboxes,
          cloudflare.emailDomains.map((domain) => domain.name)
        )
      )
    )
      return;

    const input: BootstrapSetupInput = {
      checklistAcknowledged: true,
      mailboxes,
      ownerEmail,
      ownerName,
      ownerPassword,
      primaryDomain: cloudflare.primaryDomain,
      emailDomains: cloudflare.emailDomains,
      portalHostname: cloudflare.portalHostname,
      serviceHostname: cloudflare.serviceHostname
    };
    setIsPending(true);
    try {
      await bootstrapSetup(input);
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
    if (mailboxes.length < 20) {
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
      errors: mailboxErrors,
      isPending,
      mailboxes,
      ownerEmail,
      primaryDomain: cloudflare.primaryDomain,
      submitError,
      onAdd: addMailbox,
      onBack: () => setActiveStep(OWNER_STEP),
      onComplete: () => void handleComplete(),
      onEditDomain: () => setActiveStep(DOMAIN_STEP),
      onEditOwner: () => setActiveStep(OWNER_STEP),
      onRemove: removeMailbox,
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
