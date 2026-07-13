import * as React from "react";
import { toast } from "sonner";
import { ProUpgradeLink } from "@/components/pro-upgrade";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Mailbox } from "@/features/mailboxes/types";
import type { MessageDetail } from "@/features/messages/types";
import { replyToMessage, sendMessage } from "./api";

type ComposeDialogProps = {
  mailboxes: Mailbox[];
  canManage: boolean;
  open: boolean;
  replyTo: MessageDetail | null;
  onOpenChange: (open: boolean) => void;
  onSent: () => void;
};

export function ComposeDialog({
  mailboxes,
  canManage,
  open,
  replyTo,
  onOpenChange,
  onSent
}: ComposeDialogProps): React.ReactElement {
  const activeMailboxes = React.useMemo(
    () => mailboxes.filter((mailbox) => mailbox.isActive),
    [mailboxes]
  );
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [cc, setCc] = React.useState("");
  const [bcc, setBcc] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [text, setText] = React.useState("");
  const [isPending, setIsPending] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setFrom(activeMailboxes[0]?.address ?? "");
    setTo(replyTo?.fromAddress ?? "");
    setCc("");
    setBcc("");
    setSubject(replyTo ? `Re: ${replyTo.subject.replace(/^re:\s*/i, "")}` : "");
    setText("");
  }, [activeMailboxes, open, replyTo]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    try {
      if (replyTo) {
        await replyToMessage({ from, messageId: replyTo.id, text });
      } else {
        await sendMessage({
          from,
          to: splitRecipients(to),
          cc: splitRecipients(cc),
          bcc: splitRecipients(bcc),
          subject,
          text
        });
      }
      toast.success("Message sent.");
      onOpenChange(false);
      onSent();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sending failed.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden bg-card p-0 shadow-2xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="text-base font-medium">
            {replyTo ? "Reply" : "New message"}
          </DialogTitle>
          <DialogDescription className="text-xs">Shared mailbox</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col" onSubmit={(event) => void handleSubmit(event)}>
          <div className="flex flex-col px-5">
            <div className="grid grid-cols-[3rem_minmax(0,1fr)] items-center border-b">
              <span className="text-xs text-muted-foreground">From</span>
              <Select required value={from} onValueChange={setFrom}>
                <SelectTrigger className="h-10 rounded-none border-0 bg-transparent px-0 shadow-none focus:ring-0">
                  <SelectValue placeholder="Choose mailbox" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {activeMailboxes.map((mailbox) => (
                      <SelectItem key={mailbox.id} value={mailbox.address}>
                        {mailbox.address}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            {!replyTo && (
              <>
                <div className="grid grid-cols-[3rem_minmax(0,1fr)] items-center border-b">
                  <label className="text-xs text-muted-foreground" htmlFor="compose-to">
                    To
                  </label>
                  <Input
                    className="h-10 rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                    id="compose-to"
                    required
                    value={to}
                    onChange={(event) => setTo(event.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 border-b sm:grid-cols-2 sm:divide-x">
                  <div className="grid grid-cols-[3rem_minmax(0,1fr)] items-center">
                    <label className="text-xs text-muted-foreground" htmlFor="compose-cc">
                      Cc
                    </label>
                    <Input
                      className="h-10 rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                      id="compose-cc"
                      value={cc}
                      onChange={(event) => setCc(event.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-[3rem_minmax(0,1fr)] items-center sm:pl-4">
                    <label className="text-xs text-muted-foreground" htmlFor="compose-bcc">
                      Bcc
                    </label>
                    <Input
                      className="h-10 rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                      id="compose-bcc"
                      value={bcc}
                      onChange={(event) => setBcc(event.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-[3rem_minmax(0,1fr)] items-center border-b">
                  <label className="text-xs text-muted-foreground" htmlFor="compose-subject">
                    Subject
                  </label>
                  <Input
                    className="h-10 rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                    id="compose-subject"
                    required
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                  />
                </div>
              </>
            )}
            {replyTo && (
              <div className="border-b py-3 text-xs text-muted-foreground">
                Replying to <span className="text-foreground">{replyTo.fromAddress}</span>
              </div>
            )}
            <Textarea
              aria-label="Message"
              className="min-h-60 resize-none rounded-none border-0 bg-transparent px-0 py-4 shadow-none focus-visible:ring-0"
              placeholder="Write your message…"
              required
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
          <DialogFooter className="border-t bg-background/50 px-5 py-3">
            {canManage ? (
              <ProUpgradeLink className="mr-auto text-muted-foreground" placement="composer">
                Attachments, rich formatting, and durable drafts in Pro
              </ProUpgradeLink>
            ) : null}
            <Button
              className="h-8 px-4"
              disabled={isPending || activeMailboxes.length === 0}
              type="submit"
            >
              {isPending ? "Sending" : "Send"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function splitRecipients(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}
