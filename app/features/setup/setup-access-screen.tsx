import { ExternalLink } from "lucide-react";
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
import { WizardActions, WizardPanel } from "./setup-wizard-parts";

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
        <WizardActions
          isLoading={isLoading}
          nextLabel="Verify token"
          onBack={null}
          onNext={onNext}
        />
      }
      description="Temporary access for setup. Never stored."
      eyebrow="Cloudflare"
      title="Connect Cloudflare"
    >
      <Card className="bg-background/40 shadow-none">
        <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
          <CardTitle className="text-sm font-medium">Required permissions</CardTitle>
          <Button asChild className="shrink-0 whitespace-nowrap" size="sm" variant="outline">
            <a
              href="https://dash.cloudflare.com/profile/api-tokens"
              rel="noreferrer"
              target="_blank"
            >
              Create token
              <ExternalLink data-icon="inline-end" />
            </a>
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
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
          <p className="text-xs text-muted-foreground">
            Scope Account rows to your account and Zone rows to your domain.
          </p>
        </CardContent>
      </Card>

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
        <FieldDescription>Delete it after setup.</FieldDescription>
        {error ? <FieldError>{error}</FieldError> : null}
      </Field>
    </WizardPanel>
  );
}
