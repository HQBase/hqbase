import { KeyRound, Mail } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
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
import type { WorkspaceUser } from "./types";
import { TemporaryPasswordReveal, UserOnboardingDialog } from "./user-onboarding-dialog";

type UserSettingsProps = {
  managedDomains: string[];
  users: WorkspaceUser[];
  onChanged: () => void;
};

type TemporaryCredential = {
  email: string;
  password: string;
};

export function UserSettings({
  managedDomains,
  users,
  onChanged
}: UserSettingsProps): React.ReactElement {
  const [pendingAction, setPendingAction] = React.useState<string | null>(null);
  const [credential, setCredential] = React.useState<TemporaryCredential | null>(null);

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
            <TableRow className="hover:bg-transparent">
              <TableHead className="hidden sm:table-cell">Name</TableHead>
              <TableHead>Login email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-40">
                <span className="flex items-center gap-1">
                  Role
                  <RoleGuidance />
                </span>
              </TableHead>
              <TableHead className="w-32 text-right">Action</TableHead>
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
                    value={user.role}
                    onChange={(role) => void handleRoleChange(user.id, role)}
                  />
                </TableCell>
                <TableCell className="text-right">
                  {user.passwordSetupRequired ? (
                    <Button
                      disabled={pendingAction === user.id}
                      onClick={() => void handlePendingAction(user)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {pendingAction === user.id ? (
                        <Spinner data-icon="inline-start" />
                      ) : user.onboardingMethod === "email_invite" ? (
                        <Mail data-icon="inline-start" />
                      ) : (
                        <KeyRound data-icon="inline-start" />
                      )}
                      {user.onboardingMethod === "email_invite" ? "Resend" : "New password"}
                    </Button>
                  ) : null}
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
    </>
  );
}

function UserStatus({ user }: { user: WorkspaceUser }): React.ReactElement {
  if (!user.passwordSetupRequired) {
    return <Badge variant="secondary">Active</Badge>;
  }
  if (user.onboardingMethod === "email_invite") {
    return (
      <Badge variant="outline">{user.invitationSentAt ? "Invite sent" : "Invite not sent"}</Badge>
    );
  }
  return <Badge variant="outline">Password reset required</Badge>;
}
