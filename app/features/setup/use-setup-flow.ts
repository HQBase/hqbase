import { Globe2, Inbox, UserRound } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { bootstrapSetup } from "./api";
import { emptyMailboxErrors, syncMailboxesForDomains } from "./setup-helpers";
import { ACCESS_STEP, DOMAIN_STEP, MAILBOX_STEP, OWNER_STEP } from "./setup-steps";
import type { MailboxDraft } from "./setup-validation";
import { hasErrors, hasMailboxErrors, validateMailboxes, validateOwner } from "./setup-validation";
import type { BootstrapSetupInput } from "./types";
import { useSetupCloudflare } from "./use-setup-cloudflare";

export function useSetupFlow(onComplete: () => void) {
  const [activeStep, setActiveStep] = React.useState(ACCESS_STEP);
  const [ownerName, setOwnerName] = React.useState("");
  const [ownerEmail, setOwnerEmail] = React.useState("");
  const [ownerPassword, setOwnerPassword] = React.useState("");
  const [ownerAttempted, setOwnerAttempted] = React.useState(false);
  const [mailboxes, setMailboxes] = React.useState<MailboxDraft[]>([]);
  const [selectedDefaultFromAddress, setSelectedDefaultFromAddress] = React.useState("");
  const [mailboxAttempted, setMailboxAttempted] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [isPending, setIsPending] = React.useState(false);

  React.useEffect(() => {
    const saved = readSetupDraft();
    if (!saved) return;
    setActiveStep(saved.activeStep);
    setOwnerName(saved.ownerName);
    setOwnerEmail(saved.ownerEmail);
    setMailboxes(saved.mailboxes);
    setSelectedDefaultFromAddress(saved.defaultFromMailboxAddress);
  }, []);

  const defaultFromMailboxAddress = mailboxes.some(
    (mailbox) => mailbox.address === selectedDefaultFromAddress
  )
    ? selectedDefaultFromAddress
    : (mailboxes[0]?.address ?? "");

  React.useEffect(() => {
    setSelectedDefaultFromAddress((current) =>
      mailboxes.some((mailbox) => mailbox.address === current)
        ? current
        : (mailboxes[0]?.address ?? "")
    );
  }, [mailboxes]);

  React.useEffect(() => {
    localStorage.setItem(
      "hqb_setup_draft_v1",
      JSON.stringify({
        activeStep,
        defaultFromMailboxAddress,
        mailboxes,
        ownerEmail,
        ownerName
      })
    );
  }, [activeStep, defaultFromMailboxAddress, mailboxes, ownerEmail, ownerName]);

  const cloudflare = useSetupCloudflare({
    onConnectionInvalidated: () => setActiveStep((current) => Math.min(current, DOMAIN_STEP)),
    onDomainsChanged: (previousDomains, domains) =>
      setMailboxes((current) => syncMailboxesForDomains(current, previousDomains, domains)),
    onDomainConnected: () => advanceTo(OWNER_STEP),
    onTokenVerified: () => advanceTo(DOMAIN_STEP)
  });
  const ownerDraft = { email: ownerEmail, name: ownerName, password: ownerPassword };
  const managedDomains = cloudflare.emailDomains.map((domain) => domain.name);
  const currentOwnerErrors = validateOwner(ownerDraft, managedDomains);
  const currentMailboxErrors = validateMailboxes(mailboxes, managedDomains);
  const ownerErrors = ownerAttempted ? currentOwnerErrors : {};
  const mailboxErrors = mailboxAttempted
    ? currentMailboxErrors
    : emptyMailboxErrors(mailboxes.length);

  const steps = [
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

  function advanceTo(step: number) {
    setActiveStep(step);
  }

  function handleOwnerNext() {
    setOwnerAttempted(true);
    if (hasErrors(validateOwner(ownerDraft, managedDomains))) return;
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
    if (hasErrors(validateOwner(ownerDraft, managedDomains))) {
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
      defaultFromMailboxAddress,
      mailboxes,
      ownerEmail,
      ownerName,
      ownerPassword,
      primaryDomain: cloudflare.primaryDomain,
      emailDomains: cloudflare.emailDomains,
      portalHostname: cloudflare.portalHostname
    };
    setIsPending(true);
    try {
      await bootstrapSetup(input);
      localStorage.removeItem("hqb_setup_draft_v1");
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
    if (mailboxes.length < 20) {
      setMailboxes((current) => [...current, { address: "", displayName: "" }]);
    }
    setSubmitError(null);
  }

  function removeMailbox(index: number) {
    const removedAddress = mailboxes[index]?.address;
    const nextMailboxes = mailboxes.filter((_, itemIndex) => itemIndex !== index);
    setMailboxes(nextMailboxes);
    if (removedAddress === defaultFromMailboxAddress) {
      setSelectedDefaultFromAddress(nextMailboxes[0]?.address ?? "");
    }
    setSubmitError(null);
  }

  function updateMailbox(index: number, patch: Partial<MailboxDraft>) {
    const previousAddress = mailboxes[index]?.address;
    if (patch.address !== undefined && previousAddress === defaultFromMailboxAddress) {
      setSelectedDefaultFromAddress(patch.address);
    }
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
      defaultFromMailboxAddress,
      errors: mailboxErrors,
      isPending,
      mailboxes,
      submitError,
      onAdd: addMailbox,
      onBack: () => setActiveStep(OWNER_STEP),
      onComplete: () => void handleComplete(),
      onRemove: removeMailbox,
      onSetDefaultFromMailboxAddress: setSelectedDefaultFromAddress,
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
  defaultFromMailboxAddress: string;
  mailboxes: MailboxDraft[];
  ownerEmail: string;
  ownerName: string;
} | null {
  try {
    const value = JSON.parse(localStorage.getItem("hqb_setup_draft_v1") ?? "null") as Record<
      string,
      unknown
    > | null;
    if (!value || !Array.isArray(value.mailboxes)) return null;
    return {
      activeStep: Math.min(MAILBOX_STEP, Math.max(ACCESS_STEP, Number(value.activeStep) || 0)),
      defaultFromMailboxAddress:
        typeof value.defaultFromMailboxAddress === "string"
          ? value.defaultFromMailboxAddress.slice(0, 254)
          : "",
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
