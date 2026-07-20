import * as React from "react";

type SettingsSectionProps = {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
};

export function SettingsSection({
  title,
  description,
  action,
  children
}: SettingsSectionProps): React.ReactElement {
  const titleId = React.useId();

  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-medium" id={titleId}>
            {title}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}
