import { UserPlus } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { SettingsSection } from "@/features/settings/settings-section";
import { createUser, updateUserRole } from "./api";
import { RoleGuidance } from "./role-guidance";
import type { WorkspaceRole, WorkspaceUser } from "./types";

type UserSettingsProps = {
  users: WorkspaceUser[];
  onChanged: () => void;
};

const roles: WorkspaceRole[] = ["owner", "admin", "member"];

export function UserSettings({ users, onChanged }: UserSettingsProps): React.ReactElement {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState<WorkspaceRole>("member");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      await createUser({ email, name, password, role });
      setName("");
      setEmail("");
      setPassword("");
      setRole("member");
      setCreateOpen(false);
      toast.success("User created.");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "User creation failed.");
    } finally {
      setPending(false);
    }
  }

  async function handleRoleChange(userId: string, nextRole: WorkspaceRole) {
    await updateUserRole(userId, nextRole);
    onChanged();
  }

  return (
    <SettingsSection
      action={
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button type="button">
              <UserPlus data-icon="inline-start" />
              Add user
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[min(92vw,520px)]">
            <DialogHeader>
              <DialogTitle>Add user</DialogTitle>
              <DialogDescription>Create sign-in access for a workspace member.</DialogDescription>
            </DialogHeader>
            <form className="flex flex-col gap-5" onSubmit={(event) => void handleCreate(event)}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="new-user-name">Name</FieldLabel>
                  <Input
                    id="new-user-name"
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-user-email">Email</FieldLabel>
                  <Input
                    id="new-user-email"
                    required
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-user-password">Temporary password</FieldLabel>
                  <Input
                    id="new-user-password"
                    minLength={8}
                    required
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>Workspace role</FieldLabel>
                  <RoleSelect ariaLabel="Workspace role" value={role} onChange={setRole} />
                </Field>
              </FieldGroup>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </DialogClose>
                <Button disabled={pending} type="submit">
                  {pending ? "Adding user…" : "Add user"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
      description="Workspace access"
      title="Users"
    >
      <Table containerClassName="rounded-lg border">
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <TableHead className="hidden sm:table-cell">Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="w-40">
              <span className="flex items-center gap-1">
                Role
                <RoleGuidance />
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.length === 0 ? (
            <TableRow>
              <TableCell className="h-24 text-center text-muted-foreground" colSpan={3}>
                No users yet.
              </TableCell>
            </TableRow>
          ) : null}
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="hidden sm:table-cell">{user.name}</TableCell>
              <TableCell className="max-w-44 truncate">{user.email}</TableCell>
              <TableCell>
                <RoleSelect
                  ariaLabel={`Role for ${user.name}`}
                  value={user.role}
                  onChange={(nextRole) => void handleRoleChange(user.id, nextRole)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SettingsSection>
  );
}

function RoleSelect({
  ariaLabel,
  value,
  onChange
}: {
  ariaLabel: string;
  value: WorkspaceRole;
  onChange: (value: WorkspaceRole) => void;
}): React.ReactElement {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as WorkspaceRole)}>
      <SelectTrigger aria-label={ariaLabel} className="w-32 shadow-none focus:ring-1">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {roles.map((role) => (
            <SelectItem key={role} value={role}>
              {role}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
