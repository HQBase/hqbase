import * as React from "react";
import { toast } from "sonner";
import type { Mailbox } from "@/features/mailboxes/types";
import type { WorkspaceUser } from "@/features/users/types";
import { listMailboxGrants, revokeMailboxGrant, setMailboxGrant } from "./api";
import type { MailboxAccessLevel, MailboxGrant } from "./types";

export type AccessChoice = MailboxAccessLevel | "none";

export type MailboxAccessPolicies = {
  grants: MailboxGrant[];
  busy: string | null;
  loading: boolean;
  applyDomain: (input: {
    mailboxes: Mailbox[];
    userId: string;
    domain: string;
    accessLevel: MailboxAccessLevel;
  }) => Promise<boolean>;
  change: (mailboxId: string, userId: string, value: AccessChoice) => Promise<void>;
};

export function useMailboxAccessPolicies(enabled: boolean): MailboxAccessPolicies {
  const [grants, setGrants] = React.useState<MailboxGrant[]>([]);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(enabled);

  const reload = React.useCallback(async () => setGrants(await listMailboxGrants()), []);

  React.useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void reload()
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : "Could not load mailbox access.")
      )
      .finally(() => setLoading(false));
  }, [enabled, reload]);

  async function change(mailboxId: string, userId: string, value: AccessChoice) {
    const key = `${mailboxId}:${userId}`;
    setBusy(key);
    try {
      if (value === "none") await revokeMailboxGrant(mailboxId, userId);
      else await setMailboxGrant({ mailboxId, userId, accessLevel: value });
      await reload();
      toast.success("Mailbox access updated. Active mail-client sessions were revoked.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update mailbox access.");
    } finally {
      setBusy(null);
    }
  }

  async function applyDomain({
    mailboxes,
    userId,
    domain,
    accessLevel
  }: {
    mailboxes: Mailbox[];
    userId: string;
    domain: string;
    accessLevel: MailboxAccessLevel;
  }): Promise<boolean> {
    const targets = mailboxes.filter((mailbox) =>
      (mailbox.addresses.length ? mailbox.addresses : [{ address: mailbox.address }]).some(
        (identity) => identity.address.endsWith(`@${domain}`)
      )
    );
    if (!userId || !domain || targets.length === 0) return false;
    setBusy("bulk");
    try {
      await Promise.all(
        targets.map((mailbox) => setMailboxGrant({ mailboxId: mailbox.id, userId, accessLevel }))
      );
      await reload();
      toast.success(`Explicit grants written for ${targets.length} mailboxes.`);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not apply domain access.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  return { grants, busy, loading, applyDomain, change };
}

export function formatMailboxAccessSummary(
  mailboxId: string,
  grants: MailboxGrant[],
  users: WorkspaceUser[],
  loading: boolean
): string {
  if (loading) return "Loading…";
  const eligibleUsers = new Set(
    users.filter((user) => user.role !== "owner").map((user) => user.id)
  );
  const explicitUsers = new Set(
    grants
      .filter((grant) => grant.mailboxId === mailboxId && eligibleUsers.has(grant.userId))
      .map((grant) => grant.userId)
  );
  if (explicitUsers.size === 0) return "Owner only";
  return `Owner + ${explicitUsers.size} ${explicitUsers.size === 1 ? "user" : "users"}`;
}
