import * as React from "react";
import { PiAddressBook, PiMagnifyingGlass, PiPlus } from "react-icons/pi";
import { toast } from "sonner";
import { z } from "zod";
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
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { ConversationSummary } from "@/features/messages/types";
import { listContacts, saveContact } from "./api";
import { ContactDetailView, ContactRow } from "./contact-views";
import type { ContactSummary } from "./types";

type ContactsPageProps = {
  selectedId: string | null;
  onBack: () => void;
  onCompose: (email: string) => void;
  onOpenConversation: (conversation: ConversationSummary) => void;
  onSelect: (id: string) => void;
};

export function ContactsPage({
  selectedId,
  onBack,
  onCompose,
  onOpenConversation,
  onSelect
}: ContactsPageProps): React.ReactElement {
  const [contacts, setContacts] = React.useState<ContactSummary[]>([]);
  const [search, setSearch] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const requestId = React.useRef(0);

  const refresh = React.useCallback(async () => {
    const currentRequest = ++requestId.current;
    setError(null);
    try {
      const next = await listContacts(search, 100);
      if (currentRequest === requestId.current) setContacts(next);
    } catch (nextError) {
      if (currentRequest === requestId.current) {
        setError(nextError instanceof Error ? nextError.message : "Contacts could not be loaded.");
      }
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false);
    }
  }, [search]);

  React.useEffect(() => {
    setIsLoading(true);
    const timer = window.setTimeout(() => void refresh(), 150);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  if (selectedId) {
    return (
      <ContactDetailView
        id={selectedId}
        onBack={onBack}
        onCompose={onCompose}
        onOpenConversation={onOpenConversation}
        onRemoved={() => {
          onBack();
          void refresh();
        }}
        onSaved={() => void refresh()}
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-list">
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-divider bg-toolbar px-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold">Contacts</h1>
          <p className="text-xs text-muted-foreground">Saved contacts and recent correspondents</p>
        </div>
        <Button size="sm" type="button" onClick={() => setCreateOpen(true)}>
          <PiPlus aria-hidden="true" />
          Add contact
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[960px] px-4 py-5 sm:px-6 lg:px-8">
          <div className="relative mb-4">
            <PiMagnifyingGlass
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Search contacts"
              className="pl-9"
              placeholder="Search contacts"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : isLoading ? (
            <div className="grid min-h-48 place-items-center text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <Spinner aria-hidden="true" />
                Loading contacts…
              </span>
            </div>
          ) : contacts.length === 0 ? (
            <div className="grid min-h-48 place-items-center rounded-xl border border-dashed p-8 text-center">
              <div>
                <PiAddressBook
                  aria-hidden="true"
                  className="mx-auto size-7 text-muted-foreground"
                />
                <p className="mt-3 text-sm font-medium">
                  {search ? "No contacts match this search" : "No contacts yet"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Correspondents appear here after an email exchange.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-background">
              {contacts.map((contact) => (
                <ContactRow contact={contact} key={contact.id} onSelect={onSelect} />
              ))}
            </div>
          )}
        </div>
      </div>
      <CreateContactDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={(contact) => {
          setCreateOpen(false);
          void refresh();
          onSelect(contact.id);
        }}
      />
    </div>
  );
}

function CreateContactDialog({
  open,
  onOpenChange,
  onSaved
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (contact: ContactSummary) => void;
}): React.ReactElement {
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setEmail("");
    setName("");
    setNotes("");
    setError(null);
  }, [open]);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsedEmail = z.string().trim().email().max(254).safeParse(email);
    if (!parsedEmail.success) {
      setError("Enter a valid email address.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await saveContact(parsedEmail.data, {
        email: parsedEmail.data,
        name: name.trim() || null,
        notes: notes.trim()
      });
      toast.success("Contact saved.");
      onSaved(result.contact);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Contact could not be saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(92vw,520px)]">
        <DialogHeader>
          <DialogTitle>Add contact</DialogTitle>
          <DialogDescription>Save a name and private notes for an email address.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <div className="grid gap-1.5">
            <Label htmlFor="new-contact-email">Email address</Label>
            <Input
              id="new-contact-email"
              maxLength={254}
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new-contact-name">Name</Label>
            <Input
              id="new-contact-name"
              maxLength={200}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new-contact-notes">Notes</Label>
            <Textarea
              id="new-contact-notes"
              maxLength={10_000}
              placeholder="Notes only you can see"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              disabled={pending}
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button disabled={pending} size="sm" type="submit">
              {pending ? <Spinner aria-hidden="true" /> : null}
              Save contact
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
