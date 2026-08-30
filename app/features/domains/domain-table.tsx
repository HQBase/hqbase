import type * as React from "react";
import {
  PiArrowClockwise,
  PiCaretDown,
  PiDotsThree,
  PiPause,
  PiPlug,
  PiTrash
} from "react-icons/pi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { DropdownSelect, type DropdownSelectOption } from "@/components/ui/dropdown-select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Mailbox } from "@/features/mailboxes/types";
import { cn } from "@/lib/cn";

import type { CatchAllPolicy } from "./catch-all-policy-control";
import type { MailDomain } from "./types";

type ReadinessEntry = {
  label: "Receive" | "Send" | "DNS";
  status: MailDomain["receivingStatus"] | MailDomain["dnsStatus"];
};

export function DomainTable({
  domains,
  mailboxes,
  pendingDomainId,
  portalHostname,
  onCatchAllChange,
  onDisconnect,
  onForget,
  onRecheck,
  onReconnect,
  onToggle
}: {
  domains: MailDomain[];
  mailboxes: Mailbox[];
  pendingDomainId: string | null;
  portalHostname: string | null;
  onCatchAllChange: (domain: MailDomain, policy: CatchAllPolicy, mailboxId: string | null) => void;
  onDisconnect: (domain: MailDomain) => void;
  onForget: (domain: MailDomain) => void;
  onRecheck: (domain: MailDomain) => void;
  onReconnect: (domain: MailDomain) => void;
  onToggle: (domain: MailDomain, isEnabled: boolean) => void;
}): React.ReactElement {
  return (
    <Table containerClassName="rounded-lg border">
      <TableHeader className="bg-muted/40">
        <TableRow className="[@media(hover:hover)]:hover:bg-transparent">
          <TableHead>Domain</TableHead>
          <TableHead className="hidden w-44 sm:table-cell">Readiness</TableHead>
          <TableHead className="hidden min-w-64 sm:table-cell">Unknown-address mail</TableHead>
          <TableHead className="w-20">Active</TableHead>
          <TableHead className="w-16 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {domains.length === 0 ? (
          <TableRow>
            <TableCell className="h-24 text-center text-muted-foreground" colSpan={5}>
              No domains connected.
            </TableCell>
          </TableRow>
        ) : null}
        {domains.map((domain) => {
          const pending = pendingDomainId === domain.id;
          const candidates = mailboxes.filter(
            (mailbox) =>
              mailbox.mailDomainId === domain.id &&
              mailbox.kind === "human" &&
              mailbox.isActive &&
              mailbox.deletedAt === null
          );
          return (
            <TableRow key={domain.id}>
              <TableCell className="min-w-48">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{domain.name}</span>
                  {isPortalDomain(domain.name, portalHostname) ? (
                    <Badge className="font-normal text-muted-foreground" variant="outline">
                      Portal
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-2 flex max-w-sm flex-col items-start gap-2 sm:hidden">
                  {domain.disconnectedAt ? (
                    <Badge className="font-normal text-muted-foreground" variant="outline">
                      Disconnected
                    </Badge>
                  ) : (
                    <DomainReadiness
                      disabled={pending}
                      domain={domain}
                      onRecheck={() => onRecheck(domain)}
                    />
                  )}
                  <CatchAllSelect
                    candidates={candidates}
                    disabled={pending || domain.disconnectedAt !== null}
                    domain={domain}
                    onChange={onCatchAllChange}
                  />
                </div>
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                {domain.disconnectedAt ? (
                  <Badge className="font-normal text-muted-foreground" variant="outline">
                    Disconnected
                  </Badge>
                ) : (
                  <DomainReadiness
                    disabled={pending}
                    domain={domain}
                    onRecheck={() => onRecheck(domain)}
                  />
                )}
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                <CatchAllSelect
                  candidates={candidates}
                  disabled={pending || domain.disconnectedAt !== null}
                  domain={domain}
                  onChange={onCatchAllChange}
                />
              </TableCell>
              <TableCell>
                <Switch
                  aria-label={`${domain.name} active in HQBase`}
                  checked={domain.isEnabled}
                  disabled={pending || domain.disconnectedAt !== null}
                  onCheckedChange={(isEnabled) => onToggle(domain, isEnabled)}
                />
              </TableCell>
              <TableCell className="text-right">
                <DomainActions
                  disabled={pending}
                  domain={domain}
                  onDisconnect={onDisconnect}
                  onForget={onForget}
                  onReconnect={onReconnect}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function DomainActions({
  disabled,
  domain,
  onDisconnect,
  onForget,
  onReconnect
}: {
  disabled: boolean;
  domain: MailDomain;
  onDisconnect: (domain: MailDomain) => void;
  onForget: (domain: MailDomain) => void;
  onReconnect: (domain: MailDomain) => void;
}): React.ReactElement {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`Actions for ${domain.name}`}
          disabled={disabled}
          size="icon"
          type="button"
          variant="ghost"
        >
          <PiDotsThree aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {domain.disconnectedAt ? (
          <>
            <DropdownMenuItem className="gap-2" onSelect={() => onReconnect(domain)}>
              <PiPlug aria-hidden="true" />
              Reconnect domain
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 text-destructive" onSelect={() => onForget(domain)}>
              <PiTrash aria-hidden="true" />
              Forget domain
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem
            className="gap-2 text-destructive"
            onSelect={() => onDisconnect(domain)}
          >
            <PiPause aria-hidden="true" />
            Disconnect domain
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CatchAllSelect({
  candidates,
  disabled,
  domain,
  onChange
}: {
  candidates: Mailbox[];
  disabled: boolean;
  domain: MailDomain;
  onChange: (domain: MailDomain, policy: CatchAllPolicy, mailboxId: string | null) => void;
}): React.ReactElement {
  const mailboxValue = `mailbox:${domain.catchAllMailboxId ?? ""}`;
  const hasSelectedMailbox = candidates.some((mailbox) => mailbox.id === domain.catchAllMailboxId);
  const options: DropdownSelectOption[] = [
    ...(!hasSelectedMailbox && domain.catchAllPolicy === "mailbox"
      ? [{ disabled: true, label: "Unavailable catch-all mailbox", value: mailboxValue }]
      : []),
    ...candidates.map((mailbox) => ({
      label: `Deliver to ${mailbox.address}`,
      value: `mailbox:${mailbox.id}`
    })),
    { label: "Keep for owner review", value: "unassigned" },
    { label: "Reject unknown mail", value: "reject" }
  ];
  const value = domain.catchAllPolicy === "mailbox" ? mailboxValue : domain.catchAllPolicy;

  return (
    <DropdownSelect
      ariaLabel={`${domain.name} unknown-address mail`}
      className="h-[30px] min-h-[30px] max-w-sm px-2.5 text-[13px] shadow-none"
      disabled={disabled}
      options={options}
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue.startsWith("mailbox:")) {
          onChange(domain, "mailbox", nextValue.slice("mailbox:".length));
          return;
        }
        onChange(domain, nextValue as Exclude<CatchAllPolicy, "mailbox">, null);
      }}
    />
  );
}

function DomainReadiness({
  disabled,
  domain,
  onRecheck
}: {
  disabled: boolean;
  domain: MailDomain;
  onRecheck: () => void;
}): React.ReactElement {
  const entries = readinessEntries(domain);
  const summary = summarizeDomainReadiness(domain);
  const details = entries.map((entry) => `${entry.label} ${entry.status}`).join(", ");

  return (
    <DropdownMenu>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={`${domain.name} readiness: ${summary.label}. ${details}`}
                className={cn(
                  "h-[30px] min-h-[30px] justify-start px-2 font-normal",
                  summary.tone === "ready" && "text-emerald-700 dark:text-emerald-300",
                  summary.tone === "attention" && "text-destructive",
                  (summary.tone === "checking" || summary.tone === "inactive") &&
                    "text-muted-foreground"
                )}
                disabled={disabled}
                size="sm"
                type="button"
                variant="ghost"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5 rounded-full bg-current",
                    summary.tone === "checking" && "animate-pulse motion-reduce:animate-none"
                  )}
                />
                {summary.label}
                <PiCaretDown aria-hidden="true" className="text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent className="space-y-1 px-3 py-2" side="bottom">
            <ReadinessDetails entries={entries} />
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent align="start" className="w-56 p-2">
        <p className="px-2 pb-1 text-xs font-medium">Cloudflare readiness</p>
        <div className="space-y-1 px-2 py-1 text-xs text-muted-foreground">
          <ReadinessDetails entries={entries} />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem className="w-fit gap-2 px-2 py-1 text-xs" onSelect={onRecheck}>
            <PiArrowClockwise aria-hidden="true" />
            Recheck
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ReadinessDetails({ entries }: { entries: ReadinessEntry[] }): React.ReactElement {
  return (
    <>
      {entries.map((entry) => (
        <p className="flex items-center justify-between gap-5" key={entry.label}>
          <span>{entry.label}</span>
          <span className="capitalize">{entry.status}</span>
        </p>
      ))}
    </>
  );
}

export function summarizeDomainReadiness(domain: MailDomain): {
  label: string;
  tone: "attention" | "checking" | "inactive" | "ready";
} {
  if (domain.disconnectedAt) return { label: "Disconnected", tone: "inactive" };
  if (!domain.isEnabled) return { label: "Inactive", tone: "inactive" };
  const entries = readinessEntries(domain);
  const issues = entries.filter(
    (entry) => entry.status === "degraded" || entry.status === "disabled"
  );
  if (issues.length === 1) {
    return { label: `${issues[0]?.label} needs attention`, tone: "attention" };
  }
  if (issues.length > 1) return { label: `${issues.length} issues`, tone: "attention" };
  const pending = entries.filter((entry) => entry.status === "pending");
  if (pending.length === 1) {
    return { label: `Checking ${pending[0]?.label}`, tone: "checking" };
  }
  if (pending.length > 1) {
    return { label: `Checking ${pending.length} items`, tone: "checking" };
  }
  return { label: "Ready", tone: "ready" };
}

function readinessEntries(domain: MailDomain): ReadinessEntry[] {
  return [
    { label: "Receive", status: domain.receivingStatus },
    { label: "Send", status: domain.sendingStatus },
    { label: "DNS", status: domain.dnsStatus }
  ];
}

function isPortalDomain(domain: string, portalHostname: string | null): boolean {
  const hostname = portalHostname?.trim().toLowerCase().replace(/\.$/, "");
  const normalizedDomain = domain.toLowerCase();
  return hostname === normalizedDomain || hostname?.endsWith(`.${normalizedDomain}`) === true;
}
