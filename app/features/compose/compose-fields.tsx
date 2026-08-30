import * as React from "react";
import { PiCaretDown } from "react-icons/pi";
import { Button } from "@/components/ui/button";
import { DropdownSelect } from "@/components/ui/dropdown-select";
import { Input } from "@/components/ui/input";
import type { ComposeMode } from "./compose-state";
import { RecipientField } from "./recipient-field";

export type SendingIdentity = { mailboxId: string; address: string; displayName: string };
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
  const [showOptionalRecipients, setShowOptionalRecipients] = React.useState(() =>
    Boolean(props.cc.trim() || props.bcc.trim())
  );
  const optionalRecipientsId = React.useId();

  React.useEffect(() => {
    if (props.cc.trim() || props.bcc.trim()) setShowOptionalRecipients(true);
  }, [props.cc, props.bcc]);

  return (
    <div className="flex flex-col px-5">
      <Row label="From">
        <DropdownSelect
          ariaLabel="From"
          className="rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          disabled={props.fromDisabled}
          options={props.identities.map((identity) => ({
            label: `${identity.displayName} — ${identity.address}`,
            value: identity.address
          }))}
          placeholder="Choose address"
          required
          value={props.from}
          onValueChange={props.setFrom}
        />
      </Row>
      <Row label="To">
        <div className="flex min-w-0 items-center gap-1">
          <div className="min-w-0 flex-1">
            <RecipientField
              autoFocus={props.mode !== "reply"}
              label="To"
              required
              value={props.to}
              onChange={props.setTo}
            />
          </div>
          {!showOptionalRecipients ? (
            <Button
              aria-controls={optionalRecipientsId}
              aria-expanded="false"
              aria-label="Show Cc and Bcc"
              className="size-7 min-h-7 min-w-7 shrink-0 rounded-full p-0 text-muted-foreground"
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => setShowOptionalRecipients(true)}
            >
              <PiCaretDown aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </Row>
      {showOptionalRecipients ? (
        <div
          className="grid grid-cols-1 border-b sm:grid-cols-2 sm:divide-x"
          id={optionalRecipientsId}
        >
          <Row label="Cc" border={false}>
            <RecipientField label="Cc" value={props.cc} onChange={props.setCc} />
          </Row>
          <div className="sm:pl-4">
            <Row label="Bcc" border={false}>
              <RecipientField label="Bcc" value={props.bcc} onChange={props.setBcc} />
            </Row>
          </div>
        </div>
      ) : null}
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
      <div className="[&_input]:h-[38px] [&_input]:rounded-none [&_input]:border-0 [&_input]:bg-transparent [&_input]:px-0 [&_input]:shadow-none [&_input]:focus-visible:ring-0">
        {children}
      </div>
    </div>
  );
}
