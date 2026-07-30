import { Plus } from "lucide-react";
import * as React from "react";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { BulkMailboxAccessDialog } from "@/features/mailbox-access/bulk-mailbox-access-dialog";
import { useMailboxAccessPolicies } from "@/features/mailbox-access/mailbox-access-policies";
import { MailboxAccessPolicyDialog } from "@/features/mailbox-access/mailbox-access-policy";
import { SettingsSection } from "@/features/settings/settings-section";
import type { WorkspaceUser } from "@/features/users/types";
import { addMailboxAddress, createMailbox, removeMailboxAddress, updateMailbox } from "./api";
import { DefaultFromMailboxControl } from "./default-from-mailbox-control";
import { MailboxAliasDialog } from "./mailbox-alias-dialog";
import { MailboxDetailsSheet } from "./mailbox-details-sheet";
import { mailboxDomains, mailboxMatchesDomain } from "./mailbox-filtering";
import { MailboxSelectionBar, MailboxTable } from "./mailbox-table";
import type { Mailbox } from "./types";

type MailboxSettingsProps = {
  canManage: boolean;
  defaultFromMailboxId: string | null;
  mailboxes: Mailbox[];
  users: WorkspaceUser[];
  onDefaultFromMailboxChange: (mailboxId: string) => void;
  onChanged: () => void;
};

export function MailboxSettings({
  canManage,
  defaultFromMailboxId,
  mailboxes,
  users,
  onDefaultFromMailboxChange,
  onChanged
}: MailboxSettingsProps): React.ReactElement {
  const [address, setAddress] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [aliasMailbox, setAliasMailbox] = React.useState<Mailbox | null>(null);
  const [detailsMailboxId, setDetailsMailboxId] = React.useState<string | null>(null);
  const [accessMailboxId, setAccessMailboxId] = React.useState<string | null>(null);
  const [bulkAccessOpen, setBulkAccessOpen] = React.useState(false);
  const [domainFilter, setDomainFilter] = React.useState("all");
  const [selectedMailboxIds, setSelectedMailboxIds] = React.useState<string[]>([]);
  const [aliasAddress, setAliasAddress] = React.useState("");
  const [pendingAction, setPendingAction] = React.useState<"mailbox" | "alias" | null>(null);
  const accessPolicies = useMailboxAccessPolicies(canManage);
  const domains = mailboxDomains(mailboxes);
  const activeDomain = domains.includes(domainFilter) ? domainFilter : "all";
  const visibleMailboxes =
    activeDomain === "all"
      ? mailboxes
      : mailboxes.filter((mailbox) => mailboxMatchesDomain(mailbox, activeDomain));
  const selectedMailboxIdSet = new Set(selectedMailboxIds);
  const selectedMailboxes = mailboxes.filter((mailbox) => selectedMailboxIdSet.has(mailbox.id));
  const detailsMailbox = mailboxes.find((mailbox) => mailbox.id === detailsMailboxId) ?? null;
  const accessMailbox = mailboxes.find((mailbox) => mailbox.id === accessMailboxId) ?? null;

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingAction("mailbox");
    try {
      await createMailbox({ address, displayName });
      setAddress("");
      setDisplayName("");
      setCreateOpen(false);
      toast.success("Mailbox created.");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mailbox creation failed.");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleToggle(mailbox: Mailbox) {
    await updateMailbox(mailbox.id, { isActive: !mailbox.isActive });
    onChanged();
  }

  async function handleAlias(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!aliasMailbox) return;
    setPendingAction("alias");
    try {
      await addMailboxAddress(aliasMailbox.id, {
        address: aliasAddress,
        displayName: aliasMailbox.displayName
      });
      setAliasAddress("");
      setAliasMailbox(null);
      toast.success("Email address added.");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Address creation failed.");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleRemoveAlias(mailbox: Mailbox, addressId: string) {
    await removeMailboxAddress(mailbox.id, addressId);
    onChanged();
  }

  return (
    <SettingsSection
      action={
        canManage ? (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button type="button">
                <Plus data-icon="inline-start" />
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
                  <Field>
                    <FieldLabel htmlFor="new-mailbox-address">Email address</FieldLabel>
                    <Input
                      id="new-mailbox-address"
                      placeholder="support@example.com"
                      required
                      type="email"
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="new-mailbox-name">Display name</FieldLabel>
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
                  <Button disabled={pendingAction !== null} type="submit">
                    {pendingAction === "mailbox" ? "Adding mailbox…" : "Add mailbox"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        ) : null
      }
      description="Shared addresses across your connected domains"
      title="Mailboxes"
    >
      <DefaultFromMailboxControl
        defaultFromMailboxId={defaultFromMailboxId}
        mailboxes={mailboxes}
        onChanged={onDefaultFromMailboxChange}
      />

      {canManage && mailboxes.length > 0 && domains.length > 1 ? (
        <div>
          <Select
            value={activeDomain}
            onValueChange={(value) => {
              setDomainFilter(value);
              setSelectedMailboxIds([]);
            }}
          >
            <SelectTrigger aria-label="Filter mailboxes by domain" className="w-56 shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All domains</SelectItem>
                {domains.map((domain) => (
                  <SelectItem key={domain} value={domain}>
                    {domain}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <MailboxSelectionBar
        selectedCount={selectedMailboxes.length}
        onManage={() => setBulkAccessOpen(true)}
      />

      <MailboxTable
        canManage={canManage}
        mailboxes={visibleMailboxes}
        policies={accessPolicies}
        selectedIds={selectedMailboxIds}
        users={users}
        onOpenDetails={(mailbox) => setDetailsMailboxId(mailbox.id)}
        onSelectionChange={setSelectedMailboxIds}
      />

      <MailboxDetailsSheet
        canManage={canManage}
        mailbox={detailsMailbox}
        policies={accessPolicies}
        users={users}
        onAddAddress={(mailbox) => {
          setDetailsMailboxId(null);
          setAliasMailbox(mailbox);
        }}
        onManageAccess={(mailbox) => {
          setDetailsMailboxId(null);
          setAccessMailboxId(mailbox.id);
        }}
        onOpenChange={(open) => {
          if (!open) setDetailsMailboxId(null);
        }}
        onRemoveAddress={(mailbox, addressId) => void handleRemoveAlias(mailbox, addressId)}
        onToggle={(mailbox) => void handleToggle(mailbox)}
      />

      <MailboxAliasDialog
        address={aliasAddress}
        mailbox={aliasMailbox}
        pending={pendingAction === "alias"}
        onAddressChange={setAliasAddress}
        onClose={() => {
          setAliasMailbox(null);
          setAliasAddress("");
        }}
        onSubmit={(event) => void handleAlias(event)}
      />

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
