import type * as React from "react";

import { appRoutePath } from "@/lib/routes";

export function CatchAllPolicyNotice(): React.ReactElement {
  return (
    <div className="shrink-0 border-b border-divider bg-muted/30 px-4 py-2.5">
      <p className="mx-auto max-w-[960px] text-xs leading-5 text-muted-foreground sm:px-5 lg:px-7">
        This owner-only view keeps unassigned mail. Choose how each domain handles new unknown
        addresses in{" "}
        <a
          className="font-medium text-foreground underline underline-offset-4"
          href={appRoutePath({ kind: "settings", tab: "domains" })}
        >
          Domain settings
        </a>
        . Changes do not move mail that is already here.
      </p>
    </div>
  );
}
