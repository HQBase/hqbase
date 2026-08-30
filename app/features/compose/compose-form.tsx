import type * as React from "react";
import { PiPaperclip, PiPaperPlaneTilt, PiTrash } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { DraftAttachment } from "@/features/drafts/types";
import type { MessageDetail } from "@/features/messages/types";
import { ComposeSignature } from "@/features/signatures/compose-signature";
import type { SignatureSelection, SignatureSnapshot } from "@/features/signatures/types";
import { cn } from "@/lib/cn";
import { AttachmentList } from "./attachment-list";
import { ComposeFields, type SendingIdentity } from "./compose-fields";
import { submitComposeOnShortcut } from "./compose-shortcuts";
import type { ComposeMode } from "./compose-state";
import type { RichEmailImage } from "./email-images";
import { ReplyQuotePreview } from "./reply-quote-preview";
import { RichEmailEditor } from "./rich-email-editor";

type ComposeFormProps = {
  attachments: DraftAttachment[];
  bcc: string;
  cc: string;
  contextLabel: string | null;
  formId: string;
  from: string;
  fromDisabled: boolean;
  html: string;
  identities: SendingIdentity[];
  isPending: boolean;
  mode: ComposeMode;
  presentation: "window" | "thread";
  ready: boolean;
  replyMessage: MessageDetail | null;
  sendDisabled: boolean;
  signatureDisabled: boolean;
  signature: SignatureSnapshot;
  subject: string;
  threadContext?: React.ReactNode;
  to: string;
  onDiscard: () => void;
  onEditorChange: (html: string, text: string) => void;
  onFiles: (files: File[]) => Promise<void> | void;
  onImages: (files: File[], currentHtml: string) => Promise<RichEmailImage[]>;
  onRemoveAttachment: (attachment: DraftAttachment) => void;
  onManageSignatures: () => void;
  onSetSignature: (selection: SignatureSelection) => Promise<void> | void;
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
          {props.contextLabel ? (
            <div className="border-b bg-muted/30 px-5 py-2 text-xs text-muted-foreground">
              {props.contextLabel}
            </div>
          ) : null}
          <ComposeFields
            identities={props.identities}
            mode={props.mode}
            from={props.from}
            fromDisabled={props.fromDisabled}
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
          <div
            className={cn(props.presentation === "window" && "min-h-0 flex-1 overflow-auto")}
            data-compose-scroll-area
          >
            <RichEmailEditor
              contained={false}
              html={props.html}
              onFiles={props.onFiles}
              onImages={props.onImages}
              onChange={props.onEditorChange}
            />
            <ComposeSignature
              disabled={props.isPending || props.signatureDisabled}
              from={props.from}
              signature={props.signature}
              onManage={props.onManageSignatures}
              onSelectionChange={props.onSetSignature}
            />
          </div>
          {props.replyMessage ? <ReplyQuotePreview message={props.replyMessage} /> : null}
          <AttachmentList attachments={props.attachments} onRemove={props.onRemoveAttachment} />
          <footer
            className={cn(
              "flex items-center justify-between gap-2 border-t bg-background/50 px-5 py-3",
              props.presentation === "window" &&
                "pb-[max(1rem,env(safe-area-inset-bottom))] lg:pb-3"
            )}
          >
            <div className="flex gap-2">
              <Button
                aria-label={props.isPending ? "Sending message" : "Send message"}
                className={cn(props.presentation === "thread" && "hidden lg:inline-flex")}
                disabled={props.sendDisabled}
                size="icon"
                type="submit"
                variant="liquidGlass"
              >
                {props.isPending ? (
                  <Spinner aria-hidden="true" />
                ) : (
                  <PiPaperPlaneTilt aria-hidden="true" className="pointer-events-none" />
                )}
              </Button>
              <Button asChild size="icon" type="button" variant="ghost">
                <label aria-label="Add attachment" className="cursor-pointer">
                  <PiPaperclip aria-hidden="true" className="pointer-events-none" />
                  <input
                    className="sr-only"
                    multiple
                    type="file"
                    onChange={(event) => {
                      void props.onFiles(Array.from(event.target.files ?? []));
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
              <PiTrash aria-hidden="true" className="pointer-events-none" />
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
