import * as React from "react";
import { PiArrowLeft, PiCaretDown, PiEnvelopeSimple, PiNotePencil, PiTrash } from "react-icons/pi";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { setConversationLabel } from "@/features/labels/api";
import type { MailLabel } from "@/features/labels/types";
import { runConversationAction } from "@/features/messages/api";
import { groupConversations } from "@/features/messages/conversation-display";
import { MessageListItem } from "@/features/messages/message-list-item";
import type { ConversationSummary } from "@/features/messages/types";
import { initials } from "@/lib/format";
import { appRoutePath } from "@/lib/routes";
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
      className="flex min-h-16 w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors [@media(hover:hover)]:hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:py-2"
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
  canCreateLabels = false,
  canOrganizeConversation = () => false,
  id,
  labels = [],
  onBack,
  onCompose,
  onOpenConversation,
  onLabelsChanged,
  onRemoved,
  onSaved
}: {
  canCreateLabels?: boolean;
  canOrganizeConversation?: (mailboxId: string | null) => boolean;
  id: string;
  labels?: MailLabel[];
  onBack: () => void;
  onCompose: (email: string) => void;
  onOpenConversation: (conversation: ConversationSummary) => void;
  onLabelsChanged?: (() => Promise<void>) | undefined;
  onRemoved: () => void;
  onSaved: () => void;
}): React.ReactElement {
  const [detail, setDetail] = React.useState<ContactDetailResponse | null>(null);
  const [name, setName] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [pending, setPending] = React.useState<"save" | "remove" | null>(null);
  const loadMoreRequest = React.useRef(0);

  React.useEffect(() => {
    let cancelled = false;
    loadMoreRequest.current += 1;
    setDetail(null);
    setError(null);
    setLoadingMore(false);
    void getContact(id)
      .then((next) => {
        if (cancelled) return;
        setDetail(next);
        setName(next.contact.savedName ?? "");
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
      setName(next.contact.savedName ?? "");
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

  async function loadMore(): Promise<void> {
    if (!detail?.nextCursor || loadingMore) return;
    const contactId = detail.contact.id;
    const cursor = detail.nextCursor;
    const request = ++loadMoreRequest.current;
    setLoadingMore(true);
    try {
      const next = await getContact(contactId, cursor);
      if (request !== loadMoreRequest.current) return;
      setDetail((current) =>
        current?.contact.id === contactId
          ? {
              ...current,
              conversations: [...current.conversations, ...next.conversations],
              nextCursor: next.nextCursor
            }
          : current
      );
    } catch (nextError) {
      if (request === loadMoreRequest.current) {
        toast.error(
          nextError instanceof Error ? nextError.message : "Exchanges could not be loaded."
        );
      }
    } finally {
      if (request === loadMoreRequest.current) setLoadingMore(false);
    }
  }

  async function toggleLabel(
    conversation: ConversationSummary,
    label: MailLabel,
    assigned: boolean
  ): Promise<void> {
    const result = await setConversationLabel(conversation.id, label.id, assigned);
    setDetail((current) =>
      current
        ? {
            ...current,
            conversations: current.conversations.map((entry) =>
              entry.threadId === result.threadId ? { ...entry, labels: result.labels } : entry
            )
          }
        : current
    );
  }

  async function toggleStar(conversation: ConversationSummary): Promise<void> {
    const action = conversation.isStarred ? "unstar" : "star";
    try {
      const result = await runConversationAction(conversation.id, action, conversation.folder);
      setDetail((current) =>
        current
          ? {
              ...current,
              conversations: current.conversations.map((entry) =>
                entry.threadId === result.threadId
                  ? {
                      ...entry,
                      isStarred: action === "star",
                      starredAt: action === "star" ? new Date().toISOString() : null
                    }
                  : entry
              )
            }
          : current
      );
    } catch {
      toast.error("The conversation could not be updated. Try again.");
    }
  }

  return (
    <div className="flex h-full flex-col bg-list">
      <header className="flex h-12 shrink-0 items-center border-b border-divider bg-toolbar">
        <div className="mx-auto flex w-full max-w-[960px] items-center gap-2 px-3 sm:px-6 lg:px-8">
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
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {error ? (
          <div className="mx-auto w-full max-w-[960px] p-6 text-sm text-destructive">{error}</div>
        ) : !detail ? (
          <div className="grid min-h-64 place-items-center text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Spinner aria-hidden="true" />
              Loading contact…
            </span>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
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
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md py-1 text-left [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2">
                  <PiNotePencil aria-hidden="true" className="text-muted-foreground" />
                  <h2 className="text-sm font-medium">Private contact details</h2>
                </span>
                <PiCaretDown
                  aria-hidden="true"
                  className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                />
              </summary>
              <FieldGroup className="mt-4 gap-4">
                <Field>
                  <FieldLabel htmlFor="contact-name">Name</FieldLabel>
                  <Input
                    id="contact-name"
                    maxLength={200}
                    placeholder={detail.contact.name ?? "Contact name"}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="contact-notes">Notes</FieldLabel>
                  <Textarea
                    id="contact-notes"
                    maxLength={10_000}
                    placeholder="Notes only you can see"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </Field>
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
              </FieldGroup>
            </details>
            <section>
              <h2 className="text-sm font-medium">Email exchanges</h2>
              {detail.conversations.length === 0 ? (
                <p className="mt-3 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                  No accessible email exchanges with this address.
                </p>
              ) : (
                <div className="mt-3">
                  {groupConversations(detail.conversations).map((group) => (
                    <section aria-labelledby={`contact-exchange-${group.key}`} key={group.key}>
                      <h3
                        className="px-3 pb-1.5 pt-4 text-[13px] font-medium text-foreground sm:px-0"
                        id={`contact-exchange-${group.key}`}
                      >
                        {group.label}
                      </h3>
                      <div className="flex flex-col gap-0.5">
                        {group.conversations.map((conversation) => (
                          <MessageListItem
                            canCreateLabels={canCreateLabels}
                            canOrganizeLabels={canOrganizeConversation(conversation.mailboxId)}
                            conversation={conversation}
                            href={appRoutePath({
                              kind: "mail",
                              folder: conversation.folder,
                              messageId: conversation.id
                            })}
                            isActive={false}
                            key={conversation.threadId}
                            labels={labels}
                            onLabelsChanged={onLabelsChanged}
                            onSelect={onOpenConversation}
                            onToggleLabel={(label, assigned) =>
                              toggleLabel(conversation, label, assigned)
                            }
                            onToggleStar={(entry) => void toggleStar(entry)}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
              {detail.nextCursor ? (
                <div className="mt-3 flex justify-center">
                  <Button
                    disabled={loadingMore}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={loadMore}
                  >
                    {loadingMore ? <Spinner aria-hidden="true" /> : null}
                    Load more exchanges
                  </Button>
                </div>
              ) : null}
            </section>
          </div>
        )}
      </div>
    </div>
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
