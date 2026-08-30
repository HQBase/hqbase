import { DropdownSelect } from "@/components/ui/dropdown-select";
import type { WorkspaceRole } from "./types";

const roles: WorkspaceRole[] = ["owner", "admin", "member"];

export function RoleSelect({
  ariaLabel,
  disabled = false,
  value,
  onChange
}: {
  ariaLabel: string;
  disabled?: boolean;
  value: WorkspaceRole;
  onChange: (value: WorkspaceRole) => void;
}): React.ReactElement {
  return (
    <DropdownSelect
      ariaLabel={ariaLabel}
      className="h-[30px] min-h-[30px] w-32 px-2.5 text-[13px] shadow-none focus-visible:ring-1"
      disabled={disabled}
      options={roles.map((role) => ({ label: role, value: role }))}
      value={value}
      onValueChange={(next) => onChange(next as WorkspaceRole)}
    />
  );
}
