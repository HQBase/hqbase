import { ArrowRight, Cloud, ExternalLink, Loader2 } from "lucide-react";
import type * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
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
    <div className="flex max-w-lg flex-col gap-4">
      {isLoading ? (
        <div
          aria-live="polite"
          className="flex items-center gap-2.5 py-1 text-sm text-muted-foreground"
        >
          <Loader2 aria-hidden="true" className="size-4 animate-spin text-foreground" />
          <span>Checking Cloudflare access to set up the workspace…</span>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3 py-1">
          <p className="text-sm leading-6 text-muted-foreground">
            Approve temporary access so HQBase can connect your domain and email routing.
          </p>
          <Button asChild size="sm">
            <a href="/api/setup/cloudflare/oauth/start">
              <Cloud aria-hidden="true" />
              Authorize Cloudflare
              <ArrowRight aria-hidden="true" data-icon="inline-end" />
            </a>
          </Button>
        </div>
      )}

      {error && !apiToken ? (
        <p className="text-xs leading-4 text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <details className="group border-t border-border/80 pt-4">
        <summary className="w-fit cursor-pointer list-none text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Use an API token instead
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader className="bg-muted/35">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-8 px-2 text-xs">Scope</TableHead>
                  <TableHead className="h-8 px-2 text-xs">Permission</TableHead>
                  <TableHead className="h-8 w-20 px-2 text-xs">Access</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requiredPermissions.map((permission) => (
                  <TableRow key={`${permission.resource}-${permission.permission}`}>
                    <TableCell className="px-2 py-1.5 text-xs font-medium">
                      {permission.resource}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-xs">{permission.permission}</TableCell>
                    <TableCell className="px-2 py-1.5 text-xs text-muted-foreground">
                      {permission.access}
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
              <ExternalLink aria-hidden="true" data-icon="inline-end" />
            </a>
          </Button>
          <Field data-invalid={Boolean(error)}>
            <FieldLabelRow>
              <FieldLabel htmlFor="setup-token">API token</FieldLabel>
              {error && apiToken ? <FieldError>{error}</FieldError> : null}
            </FieldLabelRow>
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
            size="sm"
            type="button"
            variant="outline"
            onClick={onNext}
          >
            {isLoading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            Verify token
          </Button>
        </div>
      </details>
    </div>
  );
}
