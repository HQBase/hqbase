import { Paperclip, Trash2 } from "lucide-react";
import type * as React from "react";

import { Button } from "@/components/ui/button";
import type { DraftAttachment } from "@/features/drafts/types";
import { cn } from "@/lib/cn";
import { AttachmentList } from "./attachment-list";
import { ComposeFields, type SendingIdentity } from "./compose-fields";
import { submitComposeOnShortcut } from "./compose-shortcuts";
import type { ComposeMode } from "./compose-state";
import { RichEmailEditor } from "./rich-email-editor";

type ComposeFormProps = {
  attachments: DraftAttachment[];
  bcc: string;
  cc: string;
  formId: string;
  from: string;
  html: string;
  identities: SendingIdentity[];
  isPending: boolean;
  mode: ComposeMode;
  presentation: "window" | "thread";
  ready: boolean;
  sendDisabled: boolean;
  subject: string;
  threadContext?: React.ReactNode;
  to: string;
  onDiscard: () => void;
  onEditorChange: (html: string, text: string) => void;
  onFiles: (files: File[]) => void;
  onRemoveAttachment: (attachment: DraftAttachment) => void;
  onSetBcc: (value: string) => void;
  onSetCc: (value: string) => void;
  onSetFrom: (value: string) => void;
  onSetSubject: (value: string) => void;
  onSetTo: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export function ComposeForm(props: ComposeFormProps): React.ReactElement {
  return (
    <>
      {!props.ready ? (
        <div className="grid min-h-60 flex-1 place-items-center text-sm text-muted-foreground">
          Opening draft…
        </div>
      ) : (
        <form
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            props.presentation === "thread" && "lg:flex-none"
          )}
          id={props.formId}
          onKeyDownCapture={(event) => submitComposeOnShortcut(event, props.sendDisabled)}
          onSubmit={props.onSubmit}
        >
          <ComposeFields
            identities={props.identities}
            mode={props.mode}
            from={props.from}
            to={props.to}
            cc={props.cc}
            bcc={props.bcc}
            subject={props.subject}
            setFrom={props.onSetFrom}
            setTo={props.onSetTo}
            setCc={props.onSetCc}
            setBcc={props.onSetBcc}
            setSubject={props.onSetSubject}
          />
          <RichEmailEditor
            contained={props.presentation === "window"}
            html={props.html}
            onFiles={props.onFiles}
            onChange={props.onEditorChange}
          />
          <AttachmentList attachments={props.attachments} onRemove={props.onRemoveAttachment} />
          <footer
            className={cn(
              "flex items-center justify-between gap-2 border-t bg-background/50 px-5 py-3",
              props.presentation === "window" &&
                "pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-3"
            )}
          >
            <div className="flex gap-2">
              <Button
                className={cn(props.presentation === "thread" && "hidden lg:inline-flex")}
                disabled={props.sendDisabled}
                type="submit"
              >
                {props.isPending ? "Sending" : "Send"}
              </Button>
              <Button asChild size="icon" type="button" variant="ghost">
                <label aria-label="Add attachment" className="cursor-pointer">
                  <Paperclip />
                  <input
                    className="sr-only"
                    multiple
                    type="file"
                    onChange={(event) => {
                      props.onFiles(Array.from(event.target.files ?? []));
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </Button>
            </div>
            <Button
              aria-label="Discard draft"
              size="icon"
              type="button"
              variant="ghost"
              onClick={props.onDiscard}
            >
              <Trash2 />
            </Button>
          </footer>
        </form>
      )}
      {props.presentation === "thread" && props.threadContext ? (
        <div className="border-t bg-background lg:hidden">
          <div className="border-b px-4 py-3 text-xs font-medium text-muted-foreground">
            Conversation
          </div>
          {props.threadContext}
        </div>
      ) : null}
    </>
  );
}
