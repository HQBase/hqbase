import { PiGlobe, PiTray, PiUserCircle } from "react-icons/pi";
import * as React from "react";
import { toast } from "sonner";

import { bootstrapSetup } from "./api";
import { readSetupDraft } from "./setup-draft";
import {
  emptyMailboxErrors,
  syncCatchAllSelections,
  syncMailboxesForDomains
} from "./setup-helpers";
import { ACCESS_STEP, DOMAIN_STEP, MAILBOX_STEP, OWNER_STEP } from "./setup-steps";
import type { MailboxDraft } from "./setup-validation";
import { hasErrors, hasMailboxErrors, validateMailboxes, validateOwner } from "./setup-validation";
import type { BootstrapSetupInput, SetupCatchAllSelection } from "./types";
import { useSetupCloudflare } from "./use-setup-cloudflare";

export function useSetupFlow(onComplete: () => void) {
  const [activeStep, setActiveStep] = React.useState(ACCESS_STEP);
  const [ownerName, setOwnerName] = React.useState("");
  const [ownerEmail, setOwnerEmail] = React.useState("");
  const [ownerPassword, setOwnerPassword] = React.useState("");
  const [ownerAttempted, setOwnerAttempted] = React.useState(false);
  const [mailboxes, setMailboxes] = React.useState<MailboxDraft[]>([]);
  const [catchAllDraft, setCatchAllDraft] = React.useState<Record<string, SetupCatchAllSelection>>(
    {}
  );
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
    setCatchAllDraft(saved.catchAllByDomain);
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
        catchAllByDomain: catchAllDraft,
        defaultFromMailboxAddress,
        mailboxes,
        ownerEmail,
        ownerName
      })
    );
  }, [activeStep, catchAllDraft, defaultFromMailboxAddress, mailboxes, ownerEmail, ownerName]);

  const cloudflare = useSetupCloudflare({
    onConnectionInvalidated: () => setActiveStep((current) => Math.min(current, DOMAIN_STEP)),
    onDomainsChanged: (previousDomains, domains) =>
      setMailboxes((current) => syncMailboxesForDomains(current, previousDomains, domains)),
    onDomainConnected: () => advanceTo(OWNER_STEP),
    onTokenVerified: () => advanceTo(DOMAIN_STEP)
  });
  const ownerDraft = { email: ownerEmail, name: ownerName, password: ownerPassword };
  const managedDomains = React.useMemo(
    () => cloudflare.emailDomains.map((domain) => domain.name),
    [cloudflare.emailDomains]
  );
  const catchAllByDomain = React.useMemo(
    () => syncCatchAllSelections(catchAllDraft, managedDomains, mailboxes),
    [catchAllDraft, mailboxes, managedDomains]
  );
  const currentOwnerErrors = validateOwner(ownerDraft, managedDomains);
  const currentMailboxErrors = validateMailboxes(mailboxes, managedDomains);
  const ownerErrors = ownerAttempted ? currentOwnerErrors : {};
  const mailboxErrors = mailboxAttempted
    ? currentMailboxErrors
    : emptyMailboxErrors(mailboxes.length);

  const steps = [
    {
      icon: PiGlobe,
      title: "Domain"
    },
    {
      icon: PiUserCircle,
      title: "Owner account"
    },
    {
      icon: PiTray,
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
      emailDomains: cloudflare.emailDomains.map((domain) => {
        const selection = catchAllByDomain[domain.name] ?? {
          policy: "unassigned" as const,
          mailboxAddress: ""
        };
        return {
          ...domain,
          catchAllPolicy: selection.policy,
          catchAllMailboxAddress: selection.policy === "mailbox" ? selection.mailboxAddress : null
        };
      }),
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

  function updateCatchAllPolicy(domain: string, policy: SetupCatchAllSelection["policy"]): void {
    const current = catchAllByDomain[domain];
    if (!current || (policy === "mailbox" && !current.mailboxAddress)) return;
    setCatchAllDraft({ ...catchAllByDomain, [domain]: { ...current, policy } });
    setSubmitError(null);
  }

  function updateCatchAllMailbox(domain: string, mailboxAddress: string): void {
    const current = catchAllByDomain[domain];
    if (!current) return;
    setCatchAllDraft({
      ...catchAllByDomain,
      [domain]: { policy: "mailbox", mailboxAddress }
    });
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
      domains: managedDomains,
      catchAllByDomain,
      submitError,
      onAdd: addMailbox,
      onBack: () => setActiveStep(OWNER_STEP),
      onComplete: () => void handleComplete(),
      onRemove: removeMailbox,
      onSetDefaultFromMailboxAddress: setSelectedDefaultFromAddress,
      onSetCatchAllMailbox: updateCatchAllMailbox,
      onSetCatchAllPolicy: updateCatchAllPolicy,
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
