import * as React from "react";
import { PiArrowLeft, PiEnvelopeSimple, PiNotePencil, PiTrash } from "react-icons/pi";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { ConversationSummary } from "@/features/messages/types";
import { formatConversationTimestamp, initials } from "@/lib/format";
import { getContact, removeContact, saveContact } from "./api";
import type { ContactDetailResponse, ContactSummary } from "./types";

export function ContactRow({
  contact,
  onSelect
}: {
  contact: ContactSummary;
  onSelect: (id: string) => void;
}): React.ReactElement {
  return (
    <button
      className="flex min-h-16 w-full items-center gap-3 border-b px-4 py-2.5 text-left last:border-b-0 [@media(hover:hover)]:hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      type="button"
      onClick={() => onSelect(contact.id)}
    >
      <ContactAvatar contact={contact} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{contact.name ?? contact.email}</span>
        {contact.name ? (
          <span className="block truncate text-xs text-muted-foreground">{contact.email}</span>
        ) : null}
      </span>
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {contact.saved ? "Saved" : contact.source === "mailbox" ? "Mailbox" : "Recent"}
      </span>
    </button>
  );
}

export function ContactDetailView({
  id,
  onBack,
  onCompose,
  onOpenConversation,
  onRemoved,
  onSaved
}: {
  id: string;
  onBack: () => void;
  onCompose: (email: string) => void;
  onOpenConversation: (conversation: ConversationSummary) => void;
  onRemoved: () => void;
  onSaved: () => void;
}): React.ReactElement {
  const [detail, setDetail] = React.useState<ContactDetailResponse | null>(null);
  const [name, setName] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<"save" | "remove" | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    void getContact(id)
      .then((next) => {
        if (cancelled) return;
        setDetail(next);
        setName(next.contact.name ?? "");
        setNotes(next.contact.notes);
      })
      .catch((nextError: unknown) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Contact could not be loaded.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function save(): Promise<void> {
    if (!detail) return;
    setPending("save");
    try {
      const next = await saveContact(detail.contact.id, {
        email: detail.contact.email,
        name: name.trim() || null,
        notes: notes.trim()
      });
      setDetail(next);
      setName(next.contact.name ?? "");
      setNotes(next.contact.notes);
      toast.success("Contact saved.");
      onSaved();
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : "Contact could not be saved.");
    } finally {
      setPending(null);
    }
  }

  async function remove(): Promise<void> {
    if (!detail) return;
    setPending("remove");
    try {
      await removeContact(detail.contact.id);
      toast.success("Saved contact removed.");
      onRemoved();
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : "Contact could not be removed.");
      setPending(null);
    }
  }

  return (
    <div className="flex h-full flex-col bg-reader">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-divider bg-toolbar px-3">
        <Button
          aria-label="Back to contacts"
          className="size-9 shrink-0 text-tertiary"
          onClick={onBack}
          size="icon"
          type="button"
          variant="ghost"
        >
          <PiArrowLeft aria-hidden="true" />
        </Button>
        <span className="text-sm font-medium">Contact</span>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {error ? (
          <div className="mx-auto max-w-3xl p-6 text-sm text-destructive">{error}</div>
        ) : !detail ? (
          <div className="grid min-h-64 place-items-center text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Spinner aria-hidden="true" />
              Loading contact…
            </span>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
            <div className="flex flex-wrap items-center gap-4">
              <ContactAvatar className="size-14" contact={detail.contact} />
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-lg font-semibold">
                  {detail.contact.name ?? detail.contact.email}
                </h1>
                <p className="truncate text-sm text-muted-foreground">{detail.contact.email}</p>
              </div>
              <Button size="sm" type="button" onClick={() => onCompose(detail.contact.email)}>
                <PiEnvelopeSimple aria-hidden="true" />
                New email
              </Button>
            </div>
            <section className="rounded-xl border bg-background p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <PiNotePencil aria-hidden="true" className="text-muted-foreground" />
                <h2 className="text-sm font-medium">Private contact details</h2>
              </div>
              <div className="mt-4 grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="contact-name">Name</Label>
                  <Input
                    id="contact-name"
                    maxLength={200}
                    placeholder="Contact name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="contact-notes">Notes</Label>
                  <Textarea
                    id="contact-notes"
                    maxLength={10_000}
                    placeholder="Notes only you can see"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button disabled={pending !== null} size="sm" type="button" onClick={save}>
                    {pending === "save" ? <Spinner aria-hidden="true" /> : null}
                    Save contact
                  </Button>
                  {detail.contact.saved ? (
                    <Button
                      disabled={pending !== null}
                      size="sm"
                      type="button"
                      variant="ghost"
                      onClick={remove}
                    >
                      {pending === "remove" ? (
                        <Spinner aria-hidden="true" />
                      ) : (
                        <PiTrash aria-hidden="true" />
                      )}
                      Remove saved contact
                    </Button>
                  ) : null}
                </div>
              </div>
            </section>
            <section>
              <h2 className="text-sm font-medium">Email exchanges</h2>
              {detail.conversations.length === 0 ? (
                <p className="mt-3 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                  No accessible email exchanges with this address.
                </p>
              ) : (
                <div className="mt-3 overflow-hidden rounded-xl border bg-background">
                  {detail.conversations.map((conversation) => (
                    <ExchangeRow
                      conversation={conversation}
                      key={conversation.threadId}
                      onOpen={onOpenConversation}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function ExchangeRow({
  conversation,
  onOpen
}: {
  conversation: ConversationSummary;
  onOpen: (conversation: ConversationSummary) => void;
}): React.ReactElement {
  const timestamp = conversation.receivedAt ?? conversation.sentAt ?? conversation.createdAt;
  return (
    <button
      className="grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b px-4 py-3 text-left last:border-b-0 [@media(hover:hover)]:hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      type="button"
      onClick={() => onOpen(conversation)}
    >
      <span className="truncate text-sm font-medium">{conversation.subject || "(no subject)"}</span>
      <span className="text-[11px] text-muted-foreground">
        {formatConversationTimestamp(timestamp)}
      </span>
      <span className="col-span-2 truncate text-xs text-muted-foreground">
        {conversation.snippet}
      </span>
    </button>
  );
}

function ContactAvatar({
  className,
  contact
}: {
  className?: string;
  contact: Pick<ContactSummary, "email" | "name">;
}): React.ReactElement {
  return (
    <Avatar className={className}>
      <AvatarFallback className="bg-primary/10 text-primary">
        {initials(contact.name ?? contact.email) || "@"}
      </AvatarFallback>
    </Avatar>
  );
}
