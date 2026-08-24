import { DropdownSelect } from "@/components/ui/dropdown-select";
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
    <DropdownSelect
      ariaLabel={ariaLabel}
      className="w-32 shadow-none focus-visible:ring-1"
      options={roles.map((role) => ({ label: role, value: role }))}
      value={value}
      onValueChange={(next) => onChange(next as WorkspaceRole)}
    />
  );
}
