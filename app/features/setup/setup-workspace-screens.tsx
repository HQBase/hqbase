import { CircleAlert, Plus, Trash2 } from "lucide-react";
import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText
} from "@/components/ui/input-group";
import type { MailboxDraft, MailboxErrors, OwnerErrors } from "./setup-validation";
import { WizardActions, WizardPanel } from "./setup-wizard-parts";

export type { MailboxDraft } from "./setup-validation";

export function OwnerStep({
  errors,
  onBack,
  onNext,
  ownerEmail,
  ownerEmailLocalPart,
  ownerName,
  ownerPassword,
  primaryDomain,
  setOwnerEmailLocalPart,
  setOwnerName,
  setOwnerPassword
}: {
  errors: OwnerErrors;
  onBack: () => void;
  onNext: () => void;
  ownerEmail: string;
  ownerEmailLocalPart: string;
  ownerName: string;
  ownerPassword: string;
  primaryDomain: string;
  setOwnerEmailLocalPart: (value: string) => void;
  setOwnerName: (value: string) => void;
  setOwnerPassword: (value: string) => void;
}): React.ReactElement {
  return (
    <WizardPanel
      actions={<WizardActions nextLabel="Continue" onBack={onBack} onNext={onNext} />}
      description={`First admin. Login uses @${primaryDomain}.`}
      eyebrow="Owner"
      title="Create your login"
    >
      <FieldGroup>
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="owner-name">Name</FieldLabel>
          <Input
            aria-invalid={Boolean(errors.name)}
            autoComplete="name"
            id="owner-name"
            placeholder="Jane Smith"
            value={ownerName}
            onChange={(event) => setOwnerName(event.target.value)}
          />
          {errors.name ? <FieldError>{errors.name}</FieldError> : null}
        </Field>

        <Field data-invalid={Boolean(errors.email)}>
          <FieldLabel htmlFor="owner-email-local-part">Login address</FieldLabel>
          <InputGroup data-invalid={Boolean(errors.email)}>
            <InputGroupInput
              aria-invalid={Boolean(errors.email)}
              autoCapitalize="none"
              autoComplete="off"
              id="owner-email-local-part"
              placeholder="oleg"
              value={ownerEmailLocalPart}
              onChange={(event) => setOwnerEmailLocalPart(event.target.value)}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>@{primaryDomain}</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
          <FieldDescription>Login: {ownerEmail || `your-name@${primaryDomain}`}</FieldDescription>
          {errors.email ? <FieldError>{errors.email}</FieldError> : null}
        </Field>

        <Field data-invalid={Boolean(errors.password)}>
          <FieldLabel htmlFor="owner-password">Password</FieldLabel>
          <Input
            aria-invalid={Boolean(errors.password)}
            autoComplete="new-password"
            id="owner-password"
            minLength={8}
            type="password"
            value={ownerPassword}
            onChange={(event) => setOwnerPassword(event.target.value)}
          />
          <FieldDescription>8+ characters.</FieldDescription>
          {errors.password ? <FieldError>{errors.password}</FieldError> : null}
        </Field>
      </FieldGroup>
    </WizardPanel>
  );
}

export function MailboxStep({
  errors,
  isPending,
  mailboxes,
  onAdd,
  onBack,
  onComplete,
  onEditDomain,
  onEditOwner,
  onRemove,
  onUpdate,
  ownerEmail,
  primaryDomain,
  submitError
}: {
  errors: MailboxErrors;
  isPending: boolean;
  mailboxes: MailboxDraft[];
  onAdd: () => void;
  onBack: () => void;
  onComplete: () => void;
  onEditDomain: () => void;
  onEditOwner: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, patch: Partial<MailboxDraft>) => void;
  ownerEmail: string;
  primaryDomain: string;
  submitError: string | null;
}): React.ReactElement {
  return (
    <WizardPanel
      actions={
        <WizardActions
          isLoading={isPending}
          nextLabel="Create workspace"
          onBack={onBack}
          onNext={onComplete}
        />
      }
      description="Addresses your team sends and receives from."
      eyebrow="Mailboxes"
      title="Add shared addresses"
    >
      <Card className="bg-background/40 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Review</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <SummaryItem label="Email domain" value={primaryDomain} onEdit={onEditDomain} />
          <SummaryItem label="Owner sign-in" value={ownerEmail} onEdit={onEditOwner} />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {mailboxes.map((mailbox, index) => (
          <MailboxCard
            error={errors.rows[index] ?? {}}
            index={index}
            key={index}
            mailbox={mailbox}
            canRemove={mailboxes.length > 1}
            onRemove={() => onRemove(index)}
            onUpdate={(patch) => onUpdate(index, patch)}
          />
        ))}
      </div>

      <Button className="w-fit" type="button" variant="outline" onClick={onAdd}>
        <Plus data-icon="inline-start" />
        Add mailbox
      </Button>

      {errors.form ? <FieldError>{errors.form}</FieldError> : null}
      {submitError ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Workspace was not created</AlertTitle>
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      ) : null}
    </WizardPanel>
  );
}

function MailboxCard({
  canRemove,
  error,
  index,
  mailbox,
  onRemove,
  onUpdate
}: {
  canRemove: boolean;
  error: NonNullable<MailboxErrors["rows"][number]>;
  index: number;
  mailbox: MailboxDraft;
  onRemove: () => void;
  onUpdate: (patch: Partial<MailboxDraft>) => void;
}): React.ReactElement {
  return (
    <Card className="bg-background/40 shadow-none">
      <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="text-sm font-medium">Mailbox {index + 1}</CardTitle>
        <Button
          aria-label={`Remove mailbox ${index + 1}`}
          disabled={!canRemove}
          size="icon"
          type="button"
          variant="ghost"
          onClick={onRemove}
        >
          <Trash2 data-icon="inline-start" />
        </Button>
      </CardHeader>
      <CardContent>
        <FieldGroup className="grid gap-4 sm:grid-cols-[1fr_0.72fr]">
          <Field data-invalid={Boolean(error.address)}>
            <FieldLabel htmlFor={`mailbox-address-${index}`}>Email address</FieldLabel>
            <Input
              aria-invalid={Boolean(error.address)}
              id={`mailbox-address-${index}`}
              type="email"
              value={mailbox.address}
              onChange={(event) => onUpdate({ address: event.target.value })}
            />
            {error.address ? <FieldError>{error.address}</FieldError> : null}
          </Field>
          <Field data-invalid={Boolean(error.displayName)}>
            <FieldLabel htmlFor={`mailbox-name-${index}`}>Display name</FieldLabel>
            <Input
              aria-invalid={Boolean(error.displayName)}
              id={`mailbox-name-${index}`}
              placeholder="Support"
              value={mailbox.displayName}
              onChange={(event) => onUpdate({ displayName: event.target.value })}
            />
            {error.displayName ? <FieldError>{error.displayName}</FieldError> : null}
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function SummaryItem({
  label,
  onEdit,
  value
}: {
  label: string;
  onEdit: () => void;
  value: string;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-muted/55 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold">{value}</p>
      </div>
      <Button size="sm" type="button" variant="ghost" onClick={onEdit}>
        Edit
      </Button>
    </div>
  );
}
