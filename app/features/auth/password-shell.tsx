import type * as React from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";

export function PasswordShell({
  children,
  description,
  footer,
  title
}: {
  children: React.ReactNode;
  description: string;
  footer?: React.ReactNode;
  title: string;
}): React.ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-10 flex items-center justify-center gap-2">
          <img alt="" className="h-7 w-auto" src="/logo.svg" />
          <span className="text-sm font-medium">HQBase</span>
        </div>
        <Card className="bg-card/70 shadow-none">
          <CardHeader>
            <CardTitle className="text-lg font-medium tracking-tight">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
          {footer ? <CardFooter className="justify-center">{footer}</CardFooter> : null}
        </Card>
      </div>
    </main>
  );
}
