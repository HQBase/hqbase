import type * as React from "react";
import { DropdownSelect } from "@/components/ui/dropdown-select";
import { Input } from "@/components/ui/input";
import type { ComposeMode } from "./compose-state";
import { RecipientField } from "./recipient-field";

export type SendingIdentity = { mailboxId: string; address: string };
export function ComposeFields(props: {
  identities: SendingIdentity[];
  mode: ComposeMode;
  from: string;
  fromDisabled: boolean;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  setFrom: (value: string) => void;
  setTo: (value: string) => void;
  setCc: (value: string) => void;
  setBcc: (value: string) => void;
  setSubject: (value: string) => void;
}) {
  return (
    <div className="flex flex-col px-5">
      <Row label="From">
        <DropdownSelect
          ariaLabel="From"
          className="rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          disabled={props.fromDisabled}
          options={props.identities.map((identity) => ({
            label: identity.address,
            value: identity.address
          }))}
          placeholder="Choose address"
          required
          value={props.from}
          onValueChange={props.setFrom}
        />
      </Row>
      <Row label="To">
        <RecipientField
          autoFocus={props.mode !== "reply"}
          label="To"
          required
          value={props.to}
          onChange={props.setTo}
        />
      </Row>
      <div className="grid grid-cols-1 border-b sm:grid-cols-2 sm:divide-x">
        <Row label="Cc" border={false}>
          <RecipientField label="Cc" value={props.cc} onChange={props.setCc} />
        </Row>
        <div className="sm:pl-4">
          <Row label="Bcc" border={false}>
            <RecipientField label="Bcc" value={props.bcc} onChange={props.setBcc} />
          </Row>
        </div>
      </div>
      {props.mode !== "reply" ? (
        <Row label="Subject">
          <Input
            aria-label="Subject"
            required
            value={props.subject}
            onChange={(event) => props.setSubject(event.target.value)}
          />
        </Row>
      ) : null}
    </div>
  );
}
function Row({
  label,
  children,
  border = true
}: {
  label: string;
  children: React.ReactNode;
  border?: boolean;
}) {
  return (
    <div className={`grid grid-cols-[3rem_minmax(0,1fr)] items-center ${border ? "border-b" : ""}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="[&_input]:h-10 [&_input]:rounded-none [&_input]:border-0 [&_input]:bg-transparent [&_input]:px-0 [&_input]:shadow-none [&_input]:focus-visible:ring-0">
        {children}
      </div>
    </div>
  );
}
