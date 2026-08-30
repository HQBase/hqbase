import * as React from "react";
import { PiArrowCounterClockwise, PiPlus } from "react-icons/pi";
import { toast } from "sonner";
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
import { DomainSuffixInput, hasCompleteDomainSuffix } from "@/features/domains/domain-suffix-input";
import type { MailDomain } from "@/features/domains/types";
import { BulkMailboxAccessDialog } from "@/features/mailbox-access/bulk-mailbox-access-dialog";
import { useMailboxAccessPolicies } from "@/features/mailbox-access/mailbox-access-policies";
import { MailboxAccessPolicyDialog } from "@/features/mailbox-access/mailbox-access-policy";
import { SettingsSection } from "@/features/settings/settings-section";
import type { WorkspaceUser } from "@/features/users/types";
import { createMailbox, deleteMailbox, restoreMailbox, updateMailbox } from "./api";
import { DefaultFromMailboxControl } from "./default-from-mailbox-control";
import { MailboxDetailsSheet } from "./mailbox-details-sheet";
import { mailboxDomains, mailboxMatchesDomain } from "./mailbox-filtering";
import { MailboxSelectionBar, MailboxTable } from "./mailbox-table";
import type { Mailbox } from "./types";

type MailboxSettingsProps = {
  canManage: boolean;
  defaultFromMailboxId: string | null;
  deletedMailboxes: Mailbox[];
  domains?: MailDomain[];
  mailboxes: Mailbox[];
  users: WorkspaceUser[];
  onDefaultFromMailboxChange: (mailboxId: string) => void;
  onChanged: () => Promise<void>;
};

export function MailboxSettings({
  canManage,
  defaultFromMailboxId,
  deletedMailboxes,
  domains = [],
  mailboxes,
  users,
  onDefaultFromMailboxChange,
  onChanged
}: MailboxSettingsProps): React.ReactElement {
  const [address, setAddress] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = React.useState<Mailbox | null>(null);
  const [detailsMailboxId, setDetailsMailboxId] = React.useState<string | null>(null);
  const [accessMailboxId, setAccessMailboxId] = React.useState<string | null>(null);
  const [bulkAccessOpen, setBulkAccessOpen] = React.useState(false);
  const [domainFilter, setDomainFilter] = React.useState("all");
  const [selectedMailboxIds, setSelectedMailboxIds] = React.useState<string[]>([]);
  const [createPending, setCreatePending] = React.useState(false);
  const [pendingMailboxId, setPendingMailboxId] = React.useState<string | null>(null);
  const accessPolicies = useMailboxAccessPolicies(canManage);
  const mailboxDomainNames = mailboxDomains(mailboxes);
  const availableDomains = domains.filter(
    (domain) => domain.isEnabled && domain.disconnectedAt === null
  );
  const activeDomain = mailboxDomainNames.includes(domainFilter) ? domainFilter : "all";
  const visibleMailboxes =
    activeDomain === "all"
      ? mailboxes
      : mailboxes.filter((mailbox) => mailboxMatchesDomain(mailbox, activeDomain));
  const selectedMailboxIdSet = new Set(selectedMailboxIds);
  const selectedMailboxes = mailboxes.filter((mailbox) => selectedMailboxIdSet.has(mailbox.id));
  const detailsMailbox = mailboxes.find((mailbox) => mailbox.id === detailsMailboxId) ?? null;
  const accessMailbox = mailboxes.find((mailbox) => mailbox.id === accessMailboxId) ?? null;
  const catchAllDomainByMailbox = Object.fromEntries(
    domains
      .filter((domain) => domain.catchAllPolicy === "mailbox" && domain.catchAllMailboxId)
      .map((domain) => [domain.catchAllMailboxId as string, domain.name])
  );

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasCompleteDomainSuffix(address, availableDomains, "@") || !displayName.trim()) return;
    setCreatePending(true);
    try {
      await createMailbox({ address, displayName });
      setAddress("");
      setDisplayName("");
      setCreateOpen(false);
      toast.success("Mailbox created.");
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mailbox creation failed.");
    } finally {
      setCreatePending(false);
    }
  }

  async function handleToggle(mailbox: Mailbox, isActive: boolean) {
    setPendingMailboxId(mailbox.id);
    try {
      await updateMailbox(mailbox.id, { isActive });
      toast.success(`${mailbox.address} ${isActive ? "enabled" : "disabled"}.`);
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mailbox could not be updated.");
    } finally {
      setPendingMailboxId(null);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!deleteConfirmation) return;
    setPendingMailboxId(deleteConfirmation.id);
    try {
      await deleteMailbox(deleteConfirmation.id);
      toast.success(`${deleteConfirmation.address} deleted. Mail history was kept.`);
      setDeleteConfirmation(null);
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mailbox could not be deleted.");
    } finally {
      setPendingMailboxId(null);
    }
  }

  async function handleRestore(mailbox: Mailbox): Promise<void> {
    setPendingMailboxId(mailbox.id);
    try {
      await restoreMailbox(mailbox.id);
      toast.success(`${mailbox.address} restored.`);
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mailbox could not be restored.");
    } finally {
      setPendingMailboxId(null);
    }
  }

  return (
    <SettingsSection
      action={
        canManage ? (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" type="button">
                <PiPlus data-icon="inline-start" />
                Add mailbox
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[min(92vw,480px)]">
              <DialogHeader>
                <DialogTitle>Add mailbox</DialogTitle>
                <DialogDescription>Create a shared address for this workspace.</DialogDescription>
              </DialogHeader>
              <form className="flex flex-col gap-5" onSubmit={(event) => void handleCreate(event)}>
                <FieldGroup>
                  <Field data-disabled={availableDomains.length === 0}>
                    <FieldLabel htmlFor="new-mailbox-address">Email address</FieldLabel>
                    <DomainSuffixInput
                      domains={availableDomains}
                      id="new-mailbox-address"
                      placeholder="support"
                      required
                      separator="@"
                      value={address}
                      onValueChange={setAddress}
                    />
                    {availableDomains.length === 0 ? (
                      <FieldDescription>
                        Enable an email domain before adding a mailbox.
                      </FieldDescription>
                    ) : null}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="new-mailbox-name">Sender name</FieldLabel>
                    <Input
                      id="new-mailbox-name"
                      placeholder="Support"
                      required
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                    />
                  </Field>
                </FieldGroup>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button
                    disabled={
                      createPending ||
                      !hasCompleteDomainSuffix(address, availableDomains, "@") ||
                      !displayName.trim()
                    }
                    type="submit"
                  >
                    {createPending ? "Adding mailbox…" : "Add mailbox"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        ) : null
      }
      description="Shared mailboxes across your connected domains"
      title="Mailboxes"
    >
      <DefaultFromMailboxControl
        defaultFromMailboxId={defaultFromMailboxId}
        mailboxes={mailboxes}
        onChanged={onDefaultFromMailboxChange}
      />

      {canManage && mailboxes.length > 0 && mailboxDomainNames.length > 1 ? (
        <div>
          <DropdownSelect
            ariaLabel="Filter mailboxes by domain"
            className="w-56 shadow-none"
            options={[
              { label: "All domains", value: "all" },
              ...mailboxDomainNames.map((domain) => ({ label: domain, value: domain }))
            ]}
            size="sm"
            value={activeDomain}
            onValueChange={(value) => {
              setDomainFilter(value);
              setSelectedMailboxIds([]);
            }}
          />
        </div>
      ) : null}

      <MailboxSelectionBar
        selectedCount={selectedMailboxes.length}
        onManage={() => setBulkAccessOpen(true)}
      />

      <MailboxTable
        canManage={canManage}
        catchAllDomainByMailbox={catchAllDomainByMailbox}
        mailboxes={visibleMailboxes}
        pendingMailboxId={pendingMailboxId}
        policies={accessPolicies}
        selectedIds={selectedMailboxIds}
        users={users}
        onOpenDetails={(mailbox) => setDetailsMailboxId(mailbox.id)}
        onSelectionChange={setSelectedMailboxIds}
        onToggle={(mailbox, isActive) => void handleToggle(mailbox, isActive)}
      />

      {canManage && deletedMailboxes.length > 0 ? (
        <section className="space-y-3" aria-labelledby="deleted-mailboxes-heading">
          <div>
            <h3 className="font-medium" id="deleted-mailboxes-heading">
              Deleted mailboxes
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Restore a mailbox to make its stored mail available again. Retention rules still
              apply.
            </p>
          </div>
          <div className="divide-y rounded-lg border">
            {deletedMailboxes.map((mailbox) => (
              <div className="flex items-center justify-between gap-4 px-3 py-3" key={mailbox.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{mailbox.address}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {mailbox.displayName}
                  </p>
                </div>
                <Button
                  disabled={pendingMailboxId !== null}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => void handleRestore(mailbox)}
                >
                  <PiArrowCounterClockwise data-icon="inline-start" />
                  {pendingMailboxId === mailbox.id ? "Restoring…" : "Restore"}
                </Button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <MailboxDetailsSheet
        canManage={canManage}
        mailbox={detailsMailbox}
        policies={accessPolicies}
        users={users}
        onChanged={onChanged}
        onDelete={(mailbox) => {
          setDetailsMailboxId(null);
          setDeleteConfirmation(mailbox);
        }}
        onManageAccess={(mailbox) => {
          setDetailsMailboxId(null);
          setAccessMailboxId(mailbox.id);
        }}
        onOpenChange={(open) => {
          if (!open) setDetailsMailboxId(null);
        }}
      />

      <Dialog
        open={deleteConfirmation !== null}
        onOpenChange={(open) => !open && setDeleteConfirmation(null)}
      >
        <DialogContent className="w-[min(92vw,480px)]">
          <DialogHeader>
            <DialogTitle>Delete mailbox?</DialogTitle>
            <DialogDescription>
              {deleteConfirmation?.address} will leave the inbox and stop receiving and sending. Its
              mail stays stored. Linked agents will be disabled and their credentials will stop
              working.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              disabled={pendingMailboxId !== null}
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
            >
              {pendingMailboxId === deleteConfirmation?.id ? "Deleting…" : "Delete mailbox"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MailboxAccessPolicyDialog
        mailbox={accessMailbox}
        policies={accessPolicies}
        users={users}
        onOpenChange={(open) => {
          if (!open) setAccessMailboxId(null);
        }}
      />

      <BulkMailboxAccessDialog
        mailboxes={selectedMailboxes}
        open={bulkAccessOpen}
        policies={accessPolicies}
        users={users}
        onApplied={() => setSelectedMailboxIds([])}
        onOpenChange={setBulkAccessOpen}
      />
    </SettingsSection>
  );
}
