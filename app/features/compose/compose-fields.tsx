import type * as React from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import type { ComposeMode } from "./compose-state";

export type SendingIdentity = { mailboxId: string; address: string };
export function ComposeFields(props: {
  identities: SendingIdentity[];
  mode: ComposeMode;
  from: string;
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
        <Select required value={props.from} onValueChange={props.setFrom}>
          <SelectTrigger
            aria-label="From"
            className="h-10 rounded-none border-0 bg-transparent px-0 shadow-none focus:ring-0"
          >
            <SelectValue placeholder="Choose address" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {props.identities.map((identity) => (
                <SelectItem key={identity.address} value={identity.address}>
                  {identity.address}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Row>
      <Row label="To">
        <Input
          aria-label="To"
          autoFocus={props.mode !== "reply"}
          data-compose-autofocus={props.mode !== "reply" ? "" : undefined}
          required
          value={props.to}
          onChange={(event) => props.setTo(event.target.value)}
        />
      </Row>
      <div className="grid grid-cols-1 border-b sm:grid-cols-2 sm:divide-x">
        <Row label="Cc" border={false}>
          <Input
            aria-label="Cc"
            value={props.cc}
            onChange={(event) => props.setCc(event.target.value)}
          />
        </Row>
        <div className="sm:pl-4">
          <Row label="Bcc" border={false}>
            <Input
              aria-label="Bcc"
              value={props.bcc}
              onChange={(event) => props.setBcc(event.target.value)}
            />
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
