import type * as React from "react";

import { DropdownSelect } from "@/components/ui/dropdown-select";
import { cn } from "@/lib/cn";

import type { MailDomain } from "./types";

export type CatchAllPolicy = MailDomain["catchAllPolicy"];

export function CatchAllPolicyControl({
  disabled = false,
  idPrefix,
  mailboxOptions,
  mailboxValue,
  policy,
  onMailboxChange,
  onPolicyChange
}: {
  disabled?: boolean;
  idPrefix: string;
  mailboxOptions: Array<{ label: string; value: string }>;
  mailboxValue: string;
  policy: CatchAllPolicy;
  onMailboxChange: (value: string) => void;
  onPolicyChange: (policy: CatchAllPolicy) => void;
}): React.ReactElement {
  const options: Array<{
    description: string;
    label: string;
    policy: CatchAllPolicy;
  }> = [
    {
      description: "Send unknown addresses to one inbox.",
      label: "Deliver to a mailbox",
      policy: "mailbox"
    },
    {
      description: "Keep unknown addresses in the owner-only Catch-all view.",
      label: "Keep for owner review",
      policy: "unassigned"
    },
    {
      description: "Return unknown addresses to the sender as undeliverable.",
      label: "Reject",
      policy: "reject"
    }
  ];

  return (
    <fieldset className="min-w-0 space-y-1.5" disabled={disabled}>
      <legend className="sr-only">Unknown address policy</legend>
      {options.map((option) => {
        const id = `${idPrefix}-${option.policy}`;
        const selected = policy === option.policy;
        return (
          <div
            className={cn(
              "rounded-md border px-3 py-2.5 transition-colors",
              selected ? "border-foreground/25 bg-muted/45" : "border-transparent"
            )}
            key={option.policy}
          >
            <label className="flex cursor-pointer items-start gap-2.5" htmlFor={id}>
              <input
                checked={selected}
                className="mt-0.5 size-4 shrink-0 accent-foreground"
                disabled={option.policy === "mailbox" && mailboxOptions.length === 0}
                id={id}
                name={`${idPrefix}-policy`}
                type="radio"
                value={option.policy}
                onChange={() => onPolicyChange(option.policy)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium leading-5">{option.label}</span>
                <span className="block text-xs leading-4 text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </label>
            {option.policy === "mailbox" && selected ? (
              <div className="ml-6 mt-2 max-w-md">
                <DropdownSelect
                  ariaLabel="Catch-all mailbox"
                  className="shadow-none"
                  disabled={disabled || mailboxOptions.length === 0}
                  options={mailboxOptions}
                  placeholder="Choose a mailbox"
                  required
                  value={mailboxValue}
                  onValueChange={onMailboxChange}
                />
                {mailboxOptions.length === 0 ? (
                  <p className="mt-1.5 text-xs text-destructive">
                    Add an active mailbox on this domain first.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </fieldset>
  );
}
