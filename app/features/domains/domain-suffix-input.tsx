import type * as React from "react";

import { DropdownSelect } from "@/components/ui/dropdown-select";
import type { InputSize } from "@/components/ui/input";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/cn";

export type DomainSuffixOption = { id: string; name: string };

type DomainSuffixInputProps = {
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  domains: DomainSuffixOption[];
  id: string;
  invalid?: boolean;
  placeholder?: string;
  required?: boolean;
  separator: "@" | ".";
  size?: InputSize;
  value: string;
  onValueChange: (value: string) => void;
};

export function DomainSuffixInput({
  ariaLabel,
  className,
  disabled = false,
  domains,
  id,
  invalid = false,
  placeholder,
  required = false,
  separator,
  size = "default",
  value,
  onValueChange
}: DomainSuffixInputProps): React.ReactElement {
  const parsed = parseDomainSuffix(value, domains, separator);
  const selectedDomain = parsed.domain ?? domains[0];
  const controlDisabled = disabled || domains.length === 0;

  function updatePrefix(prefix: string): void {
    if (!selectedDomain) return;
    const pasted = parseDomainSuffix(prefix, domains, separator);
    onValueChange(
      joinDomainSuffix(
        pasted.domain
          ? pasted.prefix
          : separator === "@"
            ? (prefix.split("@", 1)[0] ?? "")
            : prefix,
        pasted.domain ?? selectedDomain,
        separator
      )
    );
  }

  function updateDomain(domainId: string): void {
    const domain = domains.find((candidate) => candidate.id === domainId);
    if (domain) onValueChange(joinDomainSuffix(parsed.prefix, domain, separator));
  }

  return (
    <InputGroup className={className} data-invalid={invalid} size={size}>
      <InputGroupInput
        aria-invalid={invalid}
        aria-label={ariaLabel}
        autoCapitalize="none"
        autoComplete="off"
        disabled={controlDisabled}
        id={id}
        inputMode={separator === "@" ? "email" : "url"}
        placeholder={placeholder}
        required={required}
        spellCheck={false}
        value={parsed.prefix}
        onChange={(event) => updatePrefix(event.target.value)}
      />
      {domains.length > 1 ? (
        <DropdownSelect
          ariaLabel={separator === "@" ? "Email domain" : "Workspace domain"}
          className="h-full min-h-0 w-auto max-w-[65%] shrink-0 rounded-l-none border-0 border-l bg-muted/45 shadow-none focus-visible:ring-0"
          disabled={disabled}
          options={domains.map((domain) => ({
            label: `${separator}${domain.name}`,
            value: domain.id
          }))}
          size={size}
          value={selectedDomain?.id ?? ""}
          onValueChange={updateDomain}
        />
      ) : (
        <span
          className={cn(
            "flex h-full max-w-[65%] shrink-0 items-center truncate border-l bg-muted/45 px-3 text-sm text-muted-foreground",
            controlDisabled && "opacity-50"
          )}
        >
          {domains[0] ? `${separator}${domains[0].name}` : "No domains available"}
        </span>
      )}
    </InputGroup>
  );
}

export function hasCompleteDomainSuffix(
  value: string,
  domains: DomainSuffixOption[],
  separator: "@" | "."
): boolean {
  const parsed = parseDomainSuffix(value, domains, separator);
  return parsed.prefix.trim().length > 0 && parsed.domain !== null;
}

export function parseDomainSuffix(
  value: string,
  domains: DomainSuffixOption[],
  separator: "@" | "."
): { domain: DomainSuffixOption | null; prefix: string } {
  const normalized = value.trim().toLowerCase();
  const domain =
    [...domains]
      .sort((left, right) => right.name.length - left.name.length)
      .find((candidate) => {
        const name = candidate.name.trim().toLowerCase();
        return normalized === name || normalized.endsWith(`${separator}${name}`);
      }) ?? null;

  if (!domain) return { domain: null, prefix: value };
  if (normalized === domain.name.trim().toLowerCase()) return { domain, prefix: "" };
  return {
    domain,
    prefix: value.slice(0, -(domain.name.length + separator.length))
  };
}

function joinDomainSuffix(
  prefix: string,
  domain: DomainSuffixOption,
  separator: "@" | "."
): string {
  return `${prefix}${separator}${domain.name}`;
}
