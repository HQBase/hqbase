import * as React from "react";
import { PiEye, PiEyeSlash, PiPlus, PiTrash, PiWarningCircle } from "react-icons/pi";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DropdownSelect } from "@/components/ui/dropdown-select";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLabelRow
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { LOGIN_EMAIL_HINT } from "@/lib/login-email";
import type { MailboxDraft, MailboxErrors, OwnerErrors } from "./setup-validation";
import { WizardActions, WizardPanel } from "./setup-wizard-parts";

export type { MailboxDraft } from "./setup-validation";

export function OwnerStep({
  errors,
  onBack,
  onNext,
  ownerEmail,
  ownerName,
  ownerPassword,
  setOwnerEmail,
  setOwnerName,
  setOwnerPassword
}: {
  errors: OwnerErrors;
  onBack: () => void;
  onNext: () => void;
  ownerEmail: string;
  ownerName: string;
  ownerPassword: string;
  setOwnerEmail: (value: string) => void;
  setOwnerName: (value: string) => void;
  setOwnerPassword: (value: string) => void;
}): React.ReactElement {
  const [passwordVisible, setPasswordVisible] = React.useState(false);

  return (
    <WizardPanel
      actions={<WizardActions nextLabel="Continue" onBack={onBack} onNext={onNext} />}
      ariaLabel="Owner account"
      description=""
      showHeader={false}
      title=""
    >
      <FieldGroup>
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabelRow>
            <FieldLabel htmlFor="owner-name">Name</FieldLabel>
            {errors.name ? <FieldError>{errors.name}</FieldError> : null}
          </FieldLabelRow>
          <Input
            aria-invalid={Boolean(errors.name)}
            autoComplete="name"
            id="owner-name"
            placeholder="Jane Smith"
            value={ownerName}
            onChange={(event) => setOwnerName(event.target.value)}
          />
        </Field>

        <Field data-invalid={Boolean(errors.email)}>
          <FieldLabelRow>
            <FieldLabel htmlFor="owner-email">Login email</FieldLabel>
            {errors.email ? <FieldError>{errors.email}</FieldError> : null}
          </FieldLabelRow>
          <Input
            aria-invalid={Boolean(errors.email)}
            autoCapitalize="none"
            autoComplete="email"
            id="owner-email"
            placeholder="you@example.com"
            type="email"
            value={ownerEmail}
            onChange={(event) => setOwnerEmail(event.target.value)}
          />
          <FieldDescription>{LOGIN_EMAIL_HINT}</FieldDescription>
        </Field>

        <Field data-invalid={Boolean(errors.password)}>
          <FieldLabelRow>
            <FieldLabel htmlFor="owner-password">Password</FieldLabel>
            {errors.password ? <FieldError>{errors.password}</FieldError> : null}
          </FieldLabelRow>
          <div className="relative">
            <Input
              aria-invalid={Boolean(errors.password)}
              autoComplete="new-password"
              className="pr-10"
              id="owner-password"
              minLength={8}
              type={passwordVisible ? "text" : "password"}
              value={ownerPassword}
              onChange={(event) => setOwnerPassword(event.target.value)}
            />
            <Button
              aria-label={passwordVisible ? "Hide password" : "Show password"}
              aria-pressed={passwordVisible}
              className="absolute right-1 top-1/2 size-10 min-h-10 min-w-10 -translate-y-1/2"
              size="icon"
              type="button"
              variant="ghost"
              onClick={() => setPasswordVisible((visible) => !visible)}
            >
              {passwordVisible ? (
                <PiEyeSlash aria-hidden="true" className="size-4" />
              ) : (
                <PiEye aria-hidden="true" className="size-4" />
              )}
            </Button>
          </div>
          <FieldDescription>8+ characters.</FieldDescription>
        </Field>
      </FieldGroup>
    </WizardPanel>
  );
}

export function MailboxStep({
  defaultFromMailboxAddress,
  errors,
  isPending,
  mailboxes,
  onAdd,
  onBack,
  onComplete,
  onRemove,
  onSetDefaultFromMailboxAddress,
  onUpdate,
  submitError
}: {
  defaultFromMailboxAddress: string;
  errors: MailboxErrors;
  isPending: boolean;
  mailboxes: MailboxDraft[];
  onAdd: () => void;
  onBack: () => void;
  onComplete: () => void;
  onRemove: (index: number) => void;
  onSetDefaultFromMailboxAddress: (address: string) => void;
  onUpdate: (index: number, patch: Partial<MailboxDraft>) => void;
  submitError: string | null;
}): React.ReactElement {
  return (
    <WizardPanel
      actions={
        <WizardActions
          isLoading={isPending}
          nextLabel="Complete setup"
          onBack={onBack}
          onNext={onComplete}
        />
      }
      ariaLabel="Mailboxes"
      description=""
      showHeader={false}
      title=""
    >
      <div className="overflow-hidden rounded-md border">
        <Table aria-label="Mailboxes" className="table-fixed">
          <TableHeader className="bg-muted/35">
            <TableRow className="[@media(hover:hover)]:hover:bg-transparent">
              <TableHead className="h-8 w-10 px-2 text-center text-xs">#</TableHead>
              <TableHead className="h-8 px-2 text-xs">Email address</TableHead>
              <TableHead className="h-8 w-[34%] px-2 text-xs">Sender name</TableHead>
              <TableHead className="h-8 w-10 px-1">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mailboxes.map((mailbox, index) => {
              const error = errors.rows[index] ?? {};
              return (
                <TableRow key={index}>
                  <TableCell className="px-2 py-1.5 text-center text-xs text-muted-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell className="p-1.5">
                    <Field className="gap-1" data-invalid={Boolean(error.address)}>
                      {error.address ? <FieldError>{error.address}</FieldError> : null}
                      <Input
                        aria-label={`Mailbox ${index + 1} email address`}
                        aria-invalid={Boolean(error.address)}
                        className="h-8 shadow-none"
                        type="email"
                        value={mailbox.address}
                        onChange={(event) => onUpdate(index, { address: event.target.value })}
                      />
                    </Field>
                  </TableCell>
                  <TableCell className="p-1.5">
                    <Field className="gap-1" data-invalid={Boolean(error.displayName)}>
                      {error.displayName ? <FieldError>{error.displayName}</FieldError> : null}
                      <Input
                        aria-label={`Mailbox ${index + 1} sender name`}
                        aria-invalid={Boolean(error.displayName)}
                        className="h-8 shadow-none"
                        placeholder="Support"
                        value={mailbox.displayName}
                        onChange={(event) => onUpdate(index, { displayName: event.target.value })}
                      />
                    </Field>
                  </TableCell>
                  <TableCell className="px-1 py-1.5 text-center">
                    <Button
                      aria-label={`Remove mailbox ${index + 1}`}
                      className="size-10 min-h-10 min-w-10"
                      disabled={mailboxes.length <= 1}
                      size="icon"
                      type="button"
                      variant="ghost"
                      onClick={() => onRemove(index)}
                    >
                      <PiTrash aria-hidden="true" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Button className="w-fit" size="sm" type="button" variant="outline" onClick={onAdd}>
        <PiPlus data-icon="inline-start" />
        Add mailbox
      </Button>

      <Field className="max-w-md">
        <FieldLabel htmlFor="setup-default-from-mailbox">Default From mailbox</FieldLabel>
        <DropdownSelect
          className="shadow-none"
          id="setup-default-from-mailbox"
          options={mailboxes
            .filter((mailbox) => mailbox.address)
            .map((mailbox) => ({
              label: `${mailbox.displayName || "Mailbox"} — ${mailbox.address}`,
              value: mailbox.address
            }))}
          placeholder="Choose a mailbox"
          value={defaultFromMailboxAddress}
          onValueChange={onSetDefaultFromMailboxAddress}
        />
        <FieldDescription>
          New messages and forwards start from this mailbox. Replies use the mailbox that received
          the original message.
        </FieldDescription>
      </Field>

      {errors.form ? <FieldError>{errors.form}</FieldError> : null}
      {submitError ? (
        <Alert variant="destructive">
          <PiWarningCircle />
          <AlertTitle>Workspace was not created</AlertTitle>
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      ) : null}
    </WizardPanel>
  );
}
