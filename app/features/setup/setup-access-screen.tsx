import { ArrowRight, Cloud, ExternalLink, Loader2 } from "lucide-react";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
      actions={null}
      description="Approve the setup permissions once. HQBase revokes access as soon as your domain is connected."
      title="Connect Cloudflare"
    >
      <section aria-labelledby="one-time-authorization" className="flex flex-col gap-5 py-1">
        <div className="flex items-start gap-3.5">
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border bg-muted/40">
            <Cloud className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 id="one-time-authorization" className="text-base font-medium">
              One-time authorization
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Cloudflare shows every permission before approval. HQBase uses the grant only in this
              browser while it configures your workspace.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 pl-0 text-xs text-muted-foreground sm:pl-[3.125rem]">
          {requiredPermissions.map((permission) => (
            <span
              className="before:mr-1.5 before:text-foreground/40 before:content-['·']"
              key={`${permission.resource}-${permission.permission}`}
            >
              {permission.permission} {permission.access}
            </span>
          ))}
        </div>

        <form action="/api/setup/cloudflare/oauth/start" method="get" className="sm:pl-[3.125rem]">
          <Button className="h-11 w-full sm:w-auto sm:px-6" disabled={isLoading} type="submit">
            {isLoading ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <Cloud aria-hidden="true" />
            )}
            Authorize Cloudflare
            {!isLoading ? <ArrowRight data-icon="inline-end" aria-hidden="true" /> : null}
          </Button>
        </form>
      </section>

      {error ? (
        <Field data-invalid>
          <FieldError>{error}</FieldError>
        </Field>
      ) : null}

      <details className="group border-t border-border/80 pt-4">
        <summary className="w-fit cursor-pointer list-none text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Use an API token instead
        </summary>
        <div className="mt-4 flex flex-col gap-4 rounded-md border bg-background/30 p-4">
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
