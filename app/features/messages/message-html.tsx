import * as React from "react";
import { PiImageBroken } from "react-icons/pi";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useTheme } from "@/features/theme/theme-provider";

import { getMessageHtml, trustRemoteMediaSender } from "./api";
import { buildEmailHtmlDocument } from "./html-document";
import { hasMessageHtmlContent, splitQuotedText } from "./message-html-content";
import type { MessageDetail } from "./types";

export { splitQuotedText } from "./message-html-content";

type MessageHtmlProps = {
  message: MessageDetail;
};

export function MessageHtml({ message }: MessageHtmlProps): React.ReactElement {
  const { theme } = useTheme();
  const [html, setHtml] = React.useState<Awaited<ReturnType<typeof getMessageHtml>> | null>(null);
  const [loadRemoteImages, setLoadRemoteImages] = React.useState(false);
  const [loadingImages, setLoadingImages] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savingTrust, setSavingTrust] = React.useState(false);
  const [quoteExpanded, setQuoteExpanded] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    setHtml(null);
    setError(null);
    setLoadRemoteImages(false);
    setQuoteExpanded(false);
    void getMessageHtml(message.id)
      .then((result) => {
        if (!active) return;
        setHtml(result);
        setLoadRemoteImages(result.remoteMediaTrusted);
      })
      .catch(() => {
        if (active) setError("HTML view is unavailable. Plain text is shown instead.");
      });
    return () => {
      active = false;
    };
  }, [message.id]);

  const rendered = React.useMemo(
    () =>
      !html?.html
        ? null
        : buildEmailHtmlDocument({
            allowRemoteImages: loadRemoteImages,
            html: html.html,
            origin: window.location.origin,
            theme
          }),
    [html, loadRemoteImages, theme]
  );
  const renderedQuote = React.useMemo(
    () =>
      html?.quotedHtml
        ? buildEmailHtmlDocument({
            allowRemoteImages: loadRemoteImages,
            html: html.quotedHtml,
            origin: window.location.origin,
            theme
          })
        : null,
    [html, loadRemoteImages, theme]
  );
  const renderedAfterQuote = React.useMemo(
    () =>
      html?.afterQuotedHtml
        ? buildEmailHtmlDocument({
            allowRemoteImages: loadRemoteImages,
            html: html.afterQuotedHtml,
            origin: window.location.origin,
            theme
          })
        : null,
    [html, loadRemoteImages, theme]
  );
  const bodyHasContent = React.useMemo(() => hasMessageHtmlContent(html?.html ?? ""), [html?.html]);

  async function loadImages(): Promise<void> {
    setLoadingImages(true);
    setError(null);
    try {
      const result = await getMessageHtml(message.id, true);
      setHtml(result);
      setLoadRemoteImages(true);
    } catch {
      setError("Remote images could not be loaded.");
    } finally {
      setLoadingImages(false);
    }
  }

  async function alwaysLoadFromSender(): Promise<void> {
    setSavingTrust(true);
    setError(null);
    try {
      await trustRemoteMediaSender(message.id);
      setHtml(await getMessageHtml(message.id, true));
      setLoadRemoteImages(true);
    } catch {
      setError("The sender preference could not be saved.");
    } finally {
      setSavingTrust(false);
    }
  }

  if (!rendered && !renderedQuote && !renderedAfterQuote) {
    return (
      <>
        <PlainTextMessage message={message} />
        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {html?.hasRemoteImages && !loadRemoteImages && (
        <RemoteImagesAlert
          direction={message.direction}
          fromAddress={message.fromAddress}
          loadingImages={loadingImages}
          onAlwaysLoad={() => void alwaysLoadFromSender()}
          onLoad={() => void loadImages()}
          savingTrust={savingTrust}
        />
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <MessageHtmlFrames
        afterQuote={renderedAfterQuote}
        body={rendered}
        bodyHasContent={bodyHasContent}
        onToggleQuote={() => setQuoteExpanded((expanded) => !expanded)}
        quote={renderedQuote}
        quoteExpanded={quoteExpanded}
        subject={message.subject}
      />
    </div>
  );
}

export function MessageHtmlFrames({
  afterQuote,
  body,
  bodyHasContent,
  onToggleQuote,
  quote,
  quoteExpanded,
  subject
}: {
  afterQuote: string | null;
  body: string | null;
  bodyHasContent: boolean;
  onToggleQuote: () => void;
  quote: string | null;
  quoteExpanded: boolean;
  subject: string;
}): React.ReactElement {
  const showQuoteControl = Boolean(bodyHasContent && quote);
  const showQuote = quoteExpanded || !bodyHasContent;

  return (
    <div className="contents" data-message-html-frames>
      {body && bodyHasContent ? (
        <EmailFrame srcDoc={body} title={`Message body: ${subject}`} />
      ) : null}
      {quote ? (
        <>
          {showQuoteControl ? (
            <QuotedContentDivider expanded={quoteExpanded} onToggle={onToggleQuote} />
          ) : null}
          <div
            aria-hidden={!showQuote}
            className={showQuote ? "block" : "hidden print:block"}
            data-quoted-content-frame
          >
            <EmailFrame srcDoc={quote} title={`Quoted message history: ${subject}`} />
          </div>
        </>
      ) : null}
      {afterQuote ? (
        <EmailFrame srcDoc={afterQuote} title={`Message content after quote: ${subject}`} />
      ) : null}
    </div>
  );
}

export function EmailFrame({
  srcDoc,
  title
}: {
  srcDoc: string;
  title: string;
}): React.ReactElement {
  const [height, setHeight] = React.useState(0);
  const observerCleanup = React.useRef<(() => void) | null>(null);

  React.useEffect(
    () => () => {
      observerCleanup.current?.();
    },
    []
  );

  return (
    <iframe
      className="block w-full border-0 bg-transparent"
      height={height}
      onLoad={(event) => {
        observerCleanup.current?.();
        observerCleanup.current = observeFrameHeight(event.currentTarget, setHeight);
      }}
      sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
      srcDoc={srcDoc}
      title={title}
    />
  );
}

function observeFrameHeight(
  frame: HTMLIFrameElement,
  setHeight: React.Dispatch<React.SetStateAction<number>>
): () => void {
  const document = frame.contentDocument;
  if (!document) return () => undefined;

  const update = (): void => {
    const nextHeight = Math.ceil(
      Math.max(
        document.body?.offsetHeight ?? 0,
        document.body?.scrollHeight ?? 0,
        document.documentElement.offsetHeight,
        document.documentElement.scrollHeight
      )
    );
    setHeight((current) => (current === nextHeight ? current : nextHeight));
  };

  update();
  const observer = new ResizeObserver(update);
  observer.observe(document.documentElement);
  if (document.body) observer.observe(document.body);
  document.addEventListener("load", update, true);

  return () => {
    observer.disconnect();
    document.removeEventListener("load", update, true);
  };
}

export function QuotedContentDivider({
  expanded,
  onToggle
}: {
  expanded: boolean;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2 print:hidden" data-quoted-content-control>
      <Separator className="flex-1" />
      <Button
        aria-expanded={expanded}
        aria-label={expanded ? "Hide quoted message history" : "Show quoted message history"}
        className="rounded-full"
        onClick={onToggle}
        size="icon"
        type="button"
        variant="outline"
      >
        <span aria-hidden="true" className="inline-flex items-center gap-1">
          <span className="size-[3px] rounded-full bg-current" data-quoted-content-dot />
          <span className="size-[3px] rounded-full bg-current" data-quoted-content-dot />
          <span className="size-[3px] rounded-full bg-current" data-quoted-content-dot />
        </span>
      </Button>
      <Separator className="flex-1" />
    </div>
  );
}

export function RemoteImagesAlert({
  direction,
  fromAddress,
  loadingImages,
  onAlwaysLoad,
  onLoad,
  savingTrust
}: {
  direction: MessageDetail["direction"];
  fromAddress: string;
  loadingImages: boolean;
  onAlwaysLoad: () => void;
  onLoad: () => void;
  savingTrust: boolean;
}): React.ReactElement {
  return (
    <Alert>
      <PiImageBroken />
      <AlertTitle>Remote images are hidden</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <p>Loading them may tell the sender that you opened this message.</p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={loadingImages} onClick={onLoad} size="sm" type="button">
            Load images
          </Button>
          {direction === "inbound" && (
            <Button
              disabled={savingTrust}
              onClick={onAlwaysLoad}
              size="sm"
              title={`Always load remote images from ${fromAddress}`}
              type="button"
              variant="outline"
            >
              Always load from sender
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function PlainTextMessage({ message }: MessageHtmlProps): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false);
  const content = splitQuotedText(message.textBody || message.snippet);
  return (
    <div className="flex flex-col gap-4">
      {content.body ? (
        <pre className="whitespace-pre-wrap break-words font-[Arial,Helvetica,sans-serif] text-[small] leading-[1.5] text-foreground/90">
          {content.body}
        </pre>
      ) : null}
      {content.quote ? (
        <>
          <QuotedContentDivider expanded={expanded} onToggle={() => setExpanded((open) => !open)} />
          <div
            aria-hidden={!expanded}
            className={expanded ? "block" : "hidden print:block"}
            data-quoted-content-frame
          >
            <pre className="whitespace-pre-wrap break-words border-l border-border pl-[1ex] font-[Arial,Helvetica,sans-serif] text-[small] leading-[1.5] text-muted-foreground">
              {content.quote}
            </pre>
          </div>
        </>
      ) : null}
      {content.afterQuote ? (
        <pre className="whitespace-pre-wrap break-words font-[Arial,Helvetica,sans-serif] text-[small] leading-[1.5] text-foreground/90">
          {content.afterQuote}
        </pre>
      ) : null}
    </div>
  );
}
