import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function PasswordFields({
  confirmPassword,
  newPassword,
  onConfirmPasswordChange,
  onNewPasswordChange
}: {
  confirmPassword: string;
  newPassword: string;
  onConfirmPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
}): React.ReactElement {
  return (
    <>
      <Field>
        <FieldLabel htmlFor="new-password">New password</FieldLabel>
        <Input
          autoComplete="new-password"
          id="new-password"
          maxLength={128}
          minLength={8}
          onChange={(event) => onNewPasswordChange(event.target.value)}
          required
          type="password"
          value={newPassword}
        />
        <FieldDescription>Use at least 8 characters.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel>
        <Input
          autoComplete="new-password"
          id="confirm-password"
          maxLength={128}
          minLength={8}
          onChange={(event) => onConfirmPasswordChange(event.target.value)}
          required
          type="password"
          value={confirmPassword}
        />
      </Field>
    </>
  );
}
