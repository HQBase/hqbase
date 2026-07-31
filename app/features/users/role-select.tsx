import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import type { WorkspaceRole } from "./types";

const roles: WorkspaceRole[] = ["owner", "admin", "member"];

export function RoleSelect({
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
