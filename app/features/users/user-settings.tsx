import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { SettingsSection } from "@/features/settings/settings-section";
import { regenerateTemporaryPassword, resendInvitation, updateUserRole } from "./api";
import { RoleGuidance } from "./role-guidance";
import { RoleSelect } from "./role-select";
import type { WorkspaceRole, WorkspaceUser } from "./types";
import { UserActions, type UserLifecycleAction, UserLifecycleDialog } from "./user-actions";
import { TemporaryPasswordReveal, UserOnboardingDialog } from "./user-onboarding-dialog";

type UserSettingsProps = {
  currentUser: { id: string; role: WorkspaceRole };
  managedDomains: string[];
  users: WorkspaceUser[];
  onChanged: () => void;
};

type TemporaryCredential = {
  email: string;
  password: string;
};

export function UserSettings({
  currentUser,
  managedDomains,
  users,
  onChanged
}: UserSettingsProps): React.ReactElement {
  const [pendingAction, setPendingAction] = React.useState<string | null>(null);
  const [credential, setCredential] = React.useState<TemporaryCredential | null>(null);
  const [lifecycleAction, setLifecycleAction] = React.useState<UserLifecycleAction | null>(null);

  async function handleRoleChange(userId: string, role: WorkspaceUser["role"]) {
    await updateUserRole(userId, role);
    onChanged();
  }

  async function handlePendingAction(user: WorkspaceUser) {
    setPendingAction(user.id);
    try {
      if (user.onboardingMethod === "email_invite") {
        await resendInvitation(user.id);
        toast.success(`Invitation resent to ${user.email}.`);
      } else {
        const result = await regenerateTemporaryPassword(user.id);
        if (!result.temporaryPassword) throw new Error("Temporary password was not returned.");
        setCredential({ email: user.email, password: result.temporaryPassword });
      }
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "User onboarding action failed.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <>
      <SettingsSection
        action={<UserOnboardingDialog managedDomains={managedDomains} onCreated={onChanged} />}
        description="Workspace identities and sign-in access"
        title="Users"
      >
        <Table containerClassName="rounded-lg border">
          <TableHeader className="bg-muted/40">
            <TableRow className="[@media(hover:hover)]:hover:bg-transparent">
              <TableHead className="hidden sm:table-cell">Name</TableHead>
              <TableHead>Login email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-40">
                <span className="flex items-center gap-1">
                  Role
                  <RoleGuidance />
                </span>
              </TableHead>
              <TableHead className="w-16 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell className="h-24 text-center text-muted-foreground" colSpan={5}>
                  No users yet.
                </TableCell>
              </TableRow>
            ) : null}
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="hidden sm:table-cell">{user.name}</TableCell>
                <TableCell className="max-w-52 truncate">{user.email}</TableCell>
                <TableCell>
                  <UserStatus user={user} />
                </TableCell>
                <TableCell>
                  <RoleSelect
                    ariaLabel={`Role for ${user.name}`}
                    disabled={user.banned}
                    value={user.role}
                    onChange={(role) => void handleRoleChange(user.id, role)}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <UserActions
                    currentUser={currentUser}
                    disabled={pendingAction === user.id}
                    user={user}
                    onLifecycleAction={(kind) => setLifecycleAction({ kind, user })}
                    onPendingAction={() => void handlePendingAction(user)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SettingsSection>
      <Dialog open={credential !== null} onOpenChange={(open) => !open && setCredential(null)}>
        <DialogContent className="w-[min(92vw,520px)]">
          {credential ? (
            <TemporaryPasswordReveal credential={credential} onDone={() => setCredential(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
      <UserLifecycleDialog
        action={lifecycleAction}
        key={lifecycleAction ? `${lifecycleAction.kind}:${lifecycleAction.user.id}` : "closed"}
        pending={lifecycleAction !== null && pendingAction === lifecycleAction.user.id}
        onChanged={onChanged}
        onClose={() => setLifecycleAction(null)}
        onPendingChange={(pending) =>
          setPendingAction(pending && lifecycleAction ? lifecycleAction.user.id : null)
        }
      />
    </>
  );
}

function UserStatus({ user }: { user: WorkspaceUser }): React.ReactElement {
  if (user.banned) return <Badge variant="outline">Removed</Badge>;
  if (!user.passwordSetupRequired) return <Badge variant="secondary">Active</Badge>;
  if (user.onboardingMethod === "email_invite") {
    return (
      <Badge variant="outline">{user.invitationSentAt ? "Invite sent" : "Invite not sent"}</Badge>
    );
  }
  return <Badge variant="outline">Password reset required</Badge>;
}
