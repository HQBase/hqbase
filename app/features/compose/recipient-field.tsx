import * as React from "react";
import { PiAddressBook, PiClock, PiEnvelopeSimple } from "react-icons/pi";
import { listRecipientSuggestions } from "@/features/contacts/api";
import type { ContactSource, ContactSummary } from "@/features/contacts/types";
import { cn } from "@/lib/cn";
import { invalidRecipients, splitRecipients } from "./compose-state";

export function RecipientField({
  autoFocus = false,
  label,
  required = false,
  value,
  onChange
}: {
  autoFocus?: boolean;
  label: "To" | "Cc" | "Bcc";
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
}): React.ReactElement {
  const [suggestions, setSuggestions] = React.useState<ContactSummary[]>([]);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [focused, setFocused] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const requestId = React.useRef(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listId = React.useId();
  const query = recipientQuery(value);
  const open = focused && query.length > 0 && suggestions.length > 0;

  React.useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  React.useEffect(() => {
    if (!focused || query.length === 0) {
      setSuggestions([]);
      return;
    }
    const currentRequest = ++requestId.current;
    const timer = window.setTimeout(() => {
      void listRecipientSuggestions(query, 5)
        .then((contacts) => {
          if (currentRequest !== requestId.current) return;
          setSuggestions(contacts);
          setActiveIndex(0);
        })
        .catch(() => {
          if (currentRequest === requestId.current) setSuggestions([]);
        });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [focused, query]);

  function select(contact: ContactSummary): void {
    onChange(insertRecipient(value, contact.email));
    setSuggestions([]);
    setError(null);
  }

  return (
    <div className="relative min-w-0">
      <input
        aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        aria-invalid={error ? true : undefined}
        aria-label={label}
        autoComplete="off"
        className="flex w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
        data-compose-autofocus={autoFocus ? "" : undefined}
        ref={inputRef}
        role="combobox"
        required={required}
        value={value}
        onBlur={() => {
          setFocused(false);
          const invalid = invalidRecipients(value);
          setError(
            invalid.length > 0
              ? `${invalid.length === 1 ? "This address is" : "These addresses are"} not valid: ${invalid.join(", ")}`
              : null
          );
        }}
        onChange={(event) => {
          setError(null);
          onChange(event.target.value);
        }}
        onFocus={() => setFocused(true)}
        onKeyDown={(event) => {
          if (!open) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const step = event.key === "ArrowDown" ? 1 : -1;
            setActiveIndex((current) => (current + step + suggestions.length) % suggestions.length);
          } else if (event.key === "Enter" || event.key === "Tab") {
            const contact = suggestions[activeIndex];
            if (!contact) return;
            if (event.key === "Enter") event.preventDefault();
            select(contact);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setSuggestions([]);
          }
        }}
      />
      {error ? (
        <p className="pb-1 text-[11px] leading-4 text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {open ? (
        <div
          className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
          id={listId}
          role="listbox"
        >
          {suggestions.map((contact, index) => (
            <button
              aria-selected={index === activeIndex}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs outline-none",
                index === activeIndex && "bg-accent text-accent-foreground"
              )}
              id={`${listId}-${index}`}
              key={`${contact.source}:${contact.id}`}
              role="option"
              tabIndex={-1}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => select(contact)}
            >
              <SourceIcon source={contact.source} />
              <span className="min-w-0 flex-1">
                {contact.name ? (
                  <span className="block truncate font-medium">{contact.name}</span>
                ) : null}
                <span className="block truncate text-muted-foreground">{contact.email}</span>
              </span>
              <span className="text-[10px] text-muted-foreground">
                {sourceLabel(contact.source)}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SourceIcon({ source }: { source: ContactSource }): React.ReactElement {
  const className = "size-4 shrink-0 text-muted-foreground";
  if (source === "saved") return <PiAddressBook aria-hidden="true" className={className} />;
  if (source === "mailbox") return <PiEnvelopeSimple aria-hidden="true" className={className} />;
  return <PiClock aria-hidden="true" className={className} />;
}

function sourceLabel(source: ContactSource): string {
  if (source === "saved") return "Contact";
  if (source === "mailbox") return "Mailbox";
  return "Recent";
}

export function recipientQuery(value: string): string {
  const query = value.split(/[,\n]/).at(-1)?.trim() ?? "";
  return query && invalidRecipients(query).length > 0 ? query : "";
}

export function insertRecipient(value: string, email: string): string {
  const beforeCurrent = value
    .split(/[,\n]/)
    .slice(0, -1)
    .map((part) => part.trim());
  const recipients = [...beforeCurrent.filter(Boolean), email.trim()];
  const unique = recipients.filter(
    (recipient, index) =>
      recipients.findIndex((candidate) => candidate.toLowerCase() === recipient.toLowerCase()) ===
      index
  );
  return `${splitRecipients(unique.join(", ")).join(", ")}, `;
}
