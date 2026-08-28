import * as React from "react";
import { toast } from "sonner";
import type { WorkspaceUser } from "@/features/users/types";
import { listMailboxGrants, revokeMailboxGrant, setMailboxGrant } from "./api";
import type { MailboxAccessLevel, MailboxGrant } from "./types";

export type AccessChoice = MailboxAccessLevel | "none";

export type MailboxAccessPolicies = {
  grants: MailboxGrant[];
  busy: string | null;
  loading: boolean;
  applyMany: (input: {
    mailboxIds: string[];
    userId: string;
    accessLevel: AccessChoice;
  }) => Promise<boolean>;
  change: (mailboxId: string, userId: string, value: AccessChoice) => Promise<void>;
};

export type MailboxAccessEntry = {
  id: string;
  name: string;
  email?: string;
  accessLevel: MailboxAccessLevel;
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
      toast.success("Mailbox access updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update mailbox access.");
    } finally {
      setBusy(null);
    }
  }

  async function applyMany({
    mailboxIds,
    userId,
    accessLevel
  }: {
    mailboxIds: string[];
    userId: string;
    accessLevel: AccessChoice;
  }): Promise<boolean> {
    const targets = Array.from(new Set(mailboxIds));
    if (!userId || targets.length === 0) return false;
    setBusy("bulk");
    try {
      await Promise.all(
        targets.map((mailboxId) =>
          accessLevel === "none"
            ? revokeMailboxGrant(mailboxId, userId)
            : setMailboxGrant({ mailboxId, userId, accessLevel })
        )
      );
      await reload();
      toast.success(
        accessLevel === "none"
          ? `Access removed from ${targets.length} ${targets.length === 1 ? "mailbox" : "mailboxes"}.`
          : `Access updated for ${targets.length} ${targets.length === 1 ? "mailbox" : "mailboxes"}.`
      );
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update mailbox access.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  return { grants, busy, loading, applyMany, change };
}

export function formatMailboxAccessSummary(
  mailboxId: string,
  grants: MailboxGrant[],
  users: WorkspaceUser[],
  loading: boolean
): string {
  if (loading) return "Loading access…";
  const entries = getMailboxAccessEntries(mailboxId, grants, users);
  const visible = entries.slice(0, 2);
  const remaining = entries.length - visible.length;
  const summary = visible
    .map((entry) => `${entry.name} · ${formatAccessLevel(entry.accessLevel)}`)
    .join(", ");
  return remaining > 0 ? `${summary} +${remaining}` : summary;
}

export function getMailboxAccessEntries(
  mailboxId: string,
  grants: MailboxGrant[],
  users: WorkspaceUser[]
): MailboxAccessEntry[] {
  const userById = new Map(users.map((user) => [user.id, user]));
  const owners = users
    .filter((user) => user.role === "owner")
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      accessLevel: "manager" as const
    }));
  const explicit = grants
    .filter((grant) => grant.mailboxId === mailboxId)
    .flatMap((grant) => {
      const user = userById.get(grant.userId);
      if (!user || user.role === "owner") return [];
      return [
        {
          id: user.id,
          name: user.name,
          email: user.email,
          accessLevel: grant.accessLevel
        }
      ];
    });

  return [
    ...(owners.length
      ? owners
      : [{ id: "workspace-owners", name: "Owners", accessLevel: "manager" as const }]),
    ...explicit
  ];
}

export function formatAccessLevel(accessLevel: MailboxAccessLevel): string {
  if (accessLevel === "agent") return "Handle mail";
  return `${accessLevel.slice(0, 1).toUpperCase()}${accessLevel.slice(1)}`;
}
