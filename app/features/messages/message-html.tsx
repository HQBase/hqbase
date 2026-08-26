import * as React from "react";
import { PiImageBroken } from "react-icons/pi";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/features/theme/theme-provider";

import { getMessageHtml, trustRemoteMediaSender } from "./api";
import { buildEmailHtmlDocument } from "./html-document";
import { hasMessageHtmlContent, splitQuotedText } from "./message-html-content";
import type { MessageDetail, MessageHtml as MessageHtmlResponse } from "./types";

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
  const quoteVisible = quoteExpanded || !bodyHasContent;
  const showRemoteImagesAlert = Boolean(
    html && !loadRemoteImages && hasVisibleRemoteImages(html, quoteVisible)
  );

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
      {showRemoteImagesAlert && (
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

export function hasVisibleRemoteImages(
  html: Pick<
    MessageHtmlResponse,
    "afterQuotedHtmlHasRemoteImages" | "htmlHasRemoteImages" | "quotedHtmlHasRemoteImages"
  >,
  quoteVisible: boolean
): boolean {
  return (
    html.htmlHasRemoteImages ||
    html.afterQuotedHtmlHasRemoteImages ||
    (quoteVisible && html.quotedHtmlHasRemoteImages)
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
    <div className="flex justify-start print:hidden" data-quoted-content-control>
      <button
        aria-expanded={expanded}
        aria-label={expanded ? "Hide quoted message history" : "Show quoted message history"}
        className="inline-flex h-5 w-8 cursor-pointer items-center justify-center rounded bg-muted text-muted-foreground transition-colors [@media(hover:hover)]:hover:bg-muted/80 [@media(hover:hover)]:hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onToggle}
        type="button"
      >
        <span aria-hidden="true" className="inline-flex items-center gap-0.5">
          <span className="size-[3px] rounded-full bg-current" data-quoted-content-dot />
          <span className="size-[3px] rounded-full bg-current" data-quoted-content-dot />
          <span className="size-[3px] rounded-full bg-current" data-quoted-content-dot />
        </span>
      </button>
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
    <Alert className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 rounded-md border-border/60 bg-muted/50 px-2.5 py-1.5 text-xs sm:grid-cols-[auto_minmax(0,1fr)_auto] [&>svg]:static [&>svg]:size-3.5 [&>svg]:text-muted-foreground [&>svg~*]:pl-0">
      <PiImageBroken />
      <AlertTitle className="mb-0 min-w-0 line-clamp-2 text-[11px] font-semibold leading-[14px] tracking-normal">
        Remote images are hidden. Loading them may reveal that you opened this email.
      </AlertTitle>
      <AlertDescription className="col-start-2 row-start-2 flex flex-wrap gap-1 pt-0.5 sm:col-start-3 sm:row-start-1 sm:flex-nowrap sm:pt-0">
        <Button
          className="h-6 min-h-6 px-2 text-[10px]"
          disabled={loadingImages}
          onClick={onLoad}
          size="sm"
          type="button"
        >
          Load images
        </Button>
        {direction === "inbound" && (
          <Button
            className="h-6 min-h-6 px-2 text-[10px]"
            disabled={savingTrust}
            onClick={onAlwaysLoad}
            size="sm"
            title={`Always load remote images from ${fromAddress}`}
            type="button"
            variant="outline"
          >
            Always load
          </Button>
        )}
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
