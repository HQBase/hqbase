import { UserPlus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { ProUpgradeCard } from "@/components/pro-upgrade";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { createUser, updateUserRole } from "./api";
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

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createUser({ email, name, password, role });
      setName("");
      setEmail("");
      setPassword("");
      setRole("member");
      toast.success("User created.");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "User creation failed.");
    }
  }

  async function handleRoleChange(userId: string, nextRole: WorkspaceRole) {
    await updateUserRole(userId, nextRole);
    onChanged();
  }

  return (
    <Card className="bg-card/70 shadow-none">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-medium">Users</CardTitle>
        <CardDescription className="text-xs">Workspace access</CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-5">
        <ProUpgradeCard
          description="Give each person read, agent, or manager access per mailbox—for example, support access for everyone and private inboxes for a smaller team."
          dismissible
          placement="user-permissions"
          title="Need control below workspace roles?"
        />
        <form
          className="grid min-w-0 gap-3 rounded-md border bg-background/50 p-3 md:grid-cols-[0.8fr_1fr_0.8fr_150px_auto]"
          onSubmit={(event) => void handleCreate(event)}
        >
          <Input
            className="shadow-none focus-visible:ring-1"
            placeholder="Name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            className="shadow-none focus-visible:ring-1"
            placeholder="Email"
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Input
            className="shadow-none focus-visible:ring-1"
            minLength={8}
            placeholder="Password"
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <RoleSelect value={role} onChange={setRole} />
          <Button type="submit">
            <UserPlus />
            Add
          </Button>
        </form>
        <Table className="overflow-hidden rounded-md border">
          <TableHeader>
            <TableRow>
              <TableHead className="hidden sm:table-cell">Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow className="hover:bg-muted/35" key={user.id}>
                <TableCell className="hidden sm:table-cell">{user.name}</TableCell>
                <TableCell className="max-w-44 truncate">{user.email}</TableCell>
                <TableCell>
                  <RoleSelect
                    value={user.role}
                    onChange={(nextRole) => void handleRoleChange(user.id, nextRole)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function RoleSelect({
  value,
  onChange
}: {
  value: WorkspaceRole;
  onChange: (value: WorkspaceRole) => void;
}): React.ReactElement {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as WorkspaceRole)}>
      <SelectTrigger className="shadow-none focus:ring-1">
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
