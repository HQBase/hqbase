import { Copy, KeyRound, Mail, UserPlus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLabelRow
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LOGIN_EMAIL_HINT, loginEmailUsesManagedDomain } from "@/lib/login-email";
import { createUser } from "./api";
import { RoleSelect } from "./role-select";
import type { CreateWorkspaceUserInput, UserOnboardingMethod, WorkspaceRole } from "./types";

type UserOnboardingDialogProps = {
  managedDomains: string[];
  onCreated: () => void;
};

type TemporaryCredential = {
  email: string;
  password: string;
};

export function UserOnboardingDialog({
  managedDomains,
  onCreated
}: UserOnboardingDialogProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const [method, setMethod] = React.useState<UserOnboardingMethod>("email_invite");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<WorkspaceRole>("member");
  const [pending, setPending] = React.useState(false);
  const [emailAttempted, setEmailAttempted] = React.useState(false);
  const [credential, setCredential] = React.useState<TemporaryCredential | null>(null);
  const emailError =
    emailAttempted && loginEmailUsesManagedDomain(email, managedDomains)
      ? LOGIN_EMAIL_HINT
      : undefined;

  function reset() {
    setName("");
    setEmail("");
    setRole("member");
    setMethod("email_invite");
    setEmailAttempted(false);
    setCredential(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailAttempted(true);
    if (loginEmailUsesManagedDomain(email, managedDomains)) return;
    setPending(true);
    const input: CreateWorkspaceUserInput = { email, method, name, role };
    try {
      const result = await createUser(input);
      onCreated();
      if (result.temporaryPassword) {
        setCredential({ email: result.user.email, password: result.temporaryPassword });
        return;
      }
      toast.success(`Invitation sent to ${result.user.email}.`);
      setOpen(false);
      reset();
    } catch (error) {
      onCreated();
      toast.error(error instanceof Error ? error.message : "User onboarding failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">
          <UserPlus data-icon="inline-start" />
          Add user
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(92vw,560px)]">
        {credential ? (
          <TemporaryPasswordReveal credential={credential} onDone={() => setOpen(false)} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add user</DialogTitle>
              <DialogDescription>
                Choose how this person will receive workspace sign-in access.
              </DialogDescription>
            </DialogHeader>
            <Tabs
              value={method}
              onValueChange={(value) => setMethod(value as UserOnboardingMethod)}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="email_invite">
                  <Mail data-icon="inline-start" />
                  Email invite
                </TabsTrigger>
                <TabsTrigger value="temporary_password">
                  <KeyRound data-icon="inline-start" />
                  Create directly
                </TabsTrigger>
              </TabsList>
              <TabsContent value="email_invite">
                <p className="mb-5 text-sm text-muted-foreground">
                  Send a seven-day link so the user can choose their own password.
                </p>
                <UserIdentityForm
                  email={email}
                  emailError={emailError}
                  method={method}
                  name={name}
                  pending={pending}
                  role={role}
                  onEmailChange={setEmail}
                  onNameChange={setName}
                  onRoleChange={setRole}
                  onSubmit={handleSubmit}
                />
              </TabsContent>
              <TabsContent value="temporary_password">
                <p className="mb-5 text-sm text-muted-foreground">
                  Generate a temporary password to share through a secure channel.
                </p>
                <UserIdentityForm
                  email={email}
                  emailError={emailError}
                  method={method}
                  name={name}
                  pending={pending}
                  role={role}
                  onEmailChange={setEmail}
                  onNameChange={setName}
                  onRoleChange={setRole}
                  onSubmit={handleSubmit}
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function UserIdentityForm({
  email,
  emailError,
  method,
  name,
  pending,
  role,
  onEmailChange,
  onNameChange,
  onRoleChange,
  onSubmit
}: {
  email: string;
  emailError?: string | undefined;
  method: UserOnboardingMethod;
  name: string;
  pending: boolean;
  role: WorkspaceRole;
  onEmailChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onRoleChange: (value: WorkspaceRole) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}): React.ReactElement {
  return (
    <form className="flex flex-col gap-5" onSubmit={onSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${method}-user-name`}>Name</FieldLabel>
          <Input
            autoComplete="off"
            id={`${method}-user-name`}
            onChange={(event) => onNameChange(event.target.value)}
            required
            value={name}
          />
        </Field>
        <Field data-invalid={Boolean(emailError)}>
          <FieldLabelRow>
            <FieldLabel htmlFor={`${method}-user-email`}>Login email</FieldLabel>
            {emailError ? <FieldError>{emailError}</FieldError> : null}
          </FieldLabelRow>
          <Input
            aria-invalid={Boolean(emailError)}
            autoComplete="email"
            id={`${method}-user-email`}
            onChange={(event) => onEmailChange(event.target.value)}
            required
            type="email"
            value={email}
          />
          <FieldDescription>{LOGIN_EMAIL_HINT}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel>Workspace role</FieldLabel>
          <RoleSelect ariaLabel="Workspace role" value={role} onChange={onRoleChange} />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button disabled={pending} type="submit">
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {method === "email_invite" ? "Send invitation" : "Create user"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function TemporaryPasswordReveal({
  credential,
  onDone
}: {
  credential: TemporaryCredential;
  onDone: () => void;
}): React.ReactElement {
  async function copyPassword() {
    await navigator.clipboard.writeText(credential.password);
    toast.success("Temporary password copied.");
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Temporary password created</DialogTitle>
        <DialogDescription>
          Share this with {credential.email} through a secure channel.
        </DialogDescription>
      </DialogHeader>
      <Alert>
        <KeyRound />
        <AlertTitle>Shown once</AlertTitle>
        <AlertDescription>
          HQBase stores only the password hash. The user must replace this password after signing
          in.
        </AlertDescription>
      </Alert>
      <div className="flex items-center gap-2">
        <Input aria-label="Temporary password" readOnly value={credential.password} />
        <Button
          aria-label="Copy temporary password"
          onClick={() => void copyPassword()}
          size="icon"
        >
          <Copy />
        </Button>
      </div>
      <DialogFooter>
        <Button onClick={onDone} type="button">
          Done
        </Button>
      </DialogFooter>
    </>
  );
}
