import { ImageOff } from "lucide-react";
import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useTheme } from "@/features/theme/theme-provider";

import { getMessageHtml, trustRemoteMediaSender } from "./api";
import { buildEmailHtmlDocument } from "./html-document";
import type { MessageDetail } from "./types";

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
      html === null
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

  if (!rendered) {
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
      <EmailFrame srcDoc={rendered} title={`Message body: ${message.subject}`} />
      {renderedQuote ? (
        <>
          <QuotedContentDivider
            expanded={quoteExpanded}
            onToggle={() => setQuoteExpanded((expanded) => !expanded)}
          />
          {quoteExpanded ? (
            <EmailFrame
              srcDoc={renderedQuote}
              title={`Quoted message history: ${message.subject}`}
            />
          ) : null}
        </>
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
    <div className="flex items-center gap-2" data-quoted-content-control>
      <Separator className="flex-1" />
      <Button
        aria-expanded={expanded}
        aria-label={expanded ? "Hide quoted message history" : "Show quoted message history"}
        className="h-6 min-w-10 rounded-full px-2 font-mono tracking-wider"
        onClick={onToggle}
        size="sm"
        type="button"
        variant="outline"
      >
        ...
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
      <ImageOff />
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
      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-foreground/90">
        {content.body}
      </pre>
      {content.quote ? (
        <>
          <QuotedContentDivider expanded={expanded} onToggle={() => setExpanded((open) => !open)} />
          {expanded ? (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-muted-foreground">
              {content.quote}
            </pre>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function splitQuotedText(value: string): { body: string; quote: string | null } {
  const match = /\n{1,2}On [^\n]+ wrote:\n>/i.exec(value.replace(/\r\n?/g, "\n"));
  if (!match) return { body: value, quote: null };
  const normalized = value.replace(/\r\n?/g, "\n");
  return {
    body: normalized.slice(0, match.index).trimEnd(),
    quote: normalized.slice(match.index).trim()
  };
}
