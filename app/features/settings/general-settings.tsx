import type * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SetupStatus } from "@/features/setup/types";

type GeneralSettingsProps = {
  setup: SetupStatus;
};

export function GeneralSettings({ setup }: GeneralSettingsProps): React.ReactElement {
  return (
    <Card className="bg-card/70 shadow-none">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-medium">General</CardTitle>
        <CardDescription className="text-xs">Deployment status</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm md:grid-cols-2">
        <Setting label="Primary domain" value={setup.primaryDomain ?? "Not configured"} />
        <Setting label="Setup status" value={setup.isComplete ? "Complete" : "Incomplete"} />
        <Setting label="Users" value={String(setup.userCount)} />
        <Setting label="Mailboxes" value={String(setup.mailboxCount)} />
        <div className="flex items-center justify-between gap-2 rounded-md border bg-background/50 p-3">
          <span className="text-muted-foreground">Domain setup</span>
          <Badge variant={setup.checklistAcknowledged ? "secondary" : "outline"}>
            {setup.checklistAcknowledged ? "Ready" : "Pending"}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function Setting({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-background/50 p-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
