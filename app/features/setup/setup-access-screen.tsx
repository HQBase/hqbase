import { ArrowRight, Cloud, ExternalLink, Loader2 } from "lucide-react";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { WizardPanel } from "./setup-wizard-parts";

const requiredPermissions = [
  { access: "Edit", permission: "Email Sending", resource: "Account" },
  { access: "Edit", permission: "Workers Scripts", resource: "Account" },
  { access: "Read", permission: "Zone", resource: "Zone" },
  { access: "Edit", permission: "Zone Settings", resource: "Zone" },
  { access: "Edit", permission: "Email Routing Rules", resource: "Zone" }
] as const;

export function AccessStep({
  apiToken,
  error,
  isLoading,
  onApiTokenChange,
  onNext
}: {
  apiToken: string;
  error: string | null;
  isLoading: boolean;
  onApiTokenChange: (value: string) => void;
  onNext: () => void;
}): React.ReactElement {
  return (
    <WizardPanel
      actions={
        <form
          action="/api/setup/cloudflare/oauth/start"
          className="flex w-full justify-end"
          method="post"
        >
          <Button disabled={isLoading} type="submit">
            {isLoading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Cloud />}
            Authorize Cloudflare
            {!isLoading ? <ArrowRight data-icon="inline-end" /> : null}
          </Button>
        </form>
      }
      description="Approve the setup permissions once. HQBase revokes access as soon as your domain is connected."
      eyebrow="Cloudflare"
      title="Connect Cloudflare"
    >
      <Card className="bg-background/40 shadow-none">
        <CardHeader className="pb-3">
          <div className="flex size-9 items-center justify-center rounded-md border bg-card">
            <Cloud className="size-4" />
          </div>
          <CardTitle className="text-sm font-medium">One-time authorization</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm leading-6 text-muted-foreground">
            Cloudflare will show the exact permissions before you approve them. HQBase uses the
            grant only in this browser while it configures your workspace.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {requiredPermissions.map((permission) => (
              <Badge key={`${permission.resource}-${permission.permission}`} variant="secondary">
                {permission.permission} · {permission.access}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Field data-invalid>
          <FieldError>{error}</FieldError>
        </Field>
      ) : null}

      <details className="group rounded-md border bg-background/30">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
          Use an API token instead
        </summary>
        <div className="flex flex-col gap-4 border-t p-4">
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scope</TableHead>
                  <TableHead>Permission</TableHead>
                  <TableHead className="w-20">Access</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requiredPermissions.map((permission) => (
                  <TableRow key={`${permission.resource}-${permission.permission}`}>
                    <TableCell className="font-medium">{permission.resource}</TableCell>
                    <TableCell>{permission.permission}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{permission.access}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Button asChild className="self-start" size="sm" variant="outline">
            <a
              href="https://dash.cloudflare.com/profile/api-tokens"
              rel="noreferrer"
              target="_blank"
            >
              Create token
              <ExternalLink data-icon="inline-end" />
            </a>
          </Button>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="setup-token">API token</FieldLabel>
            <Input
              aria-invalid={Boolean(error)}
              autoComplete="off"
              id="setup-token"
              placeholder="Paste token"
              type="password"
              value={apiToken}
              onChange={(event) => onApiTokenChange(event.target.value)}
            />
            <FieldDescription>Used for this setup request and never stored.</FieldDescription>
          </Field>
          <Button
            className="self-end"
            disabled={isLoading}
            type="button"
            variant="secondary"
            onClick={onNext}
          >
            {isLoading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            Verify token
          </Button>
        </div>
      </details>
    </WizardPanel>
  );
}
