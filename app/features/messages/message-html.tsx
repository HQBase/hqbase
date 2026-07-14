import { ImageOff } from "lucide-react";
import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { getMessageHtml, trustRemoteMediaSender } from "./api";
import { buildEmailHtmlDocument } from "./html-document";
import type { MessageDetail } from "./types";

type MessageHtmlProps = {
  message: MessageDetail;
};

export function MessageHtml({ message }: MessageHtmlProps): React.ReactElement {
  const [html, setHtml] = React.useState<Awaited<ReturnType<typeof getMessageHtml>> | null>(null);
  const [loadRemoteImages, setLoadRemoteImages] = React.useState(false);
  const [loadingImages, setLoadingImages] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savingTrust, setSavingTrust] = React.useState(false);
  const [frameHeight, setFrameHeight] = React.useState(320);

  React.useEffect(() => {
    let active = true;
    setHtml(null);
    setError(null);
    setLoadRemoteImages(false);
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
            origin: window.location.origin
          }),
    [html, loadRemoteImages]
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
        <PlainText message={message} />
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
      <iframe
        className="w-full rounded-md border bg-white"
        height={frameHeight}
        onLoad={(event) => {
          const height = event.currentTarget.contentDocument?.documentElement.scrollHeight;
          if (height) setFrameHeight(Math.max(320, height));
        }}
        sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
        srcDoc={rendered}
        title={`Message body: ${message.subject}`}
      />
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

function PlainText({ message }: MessageHtmlProps): React.ReactElement {
  return (
    <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-foreground/90">
      {message.textBody || message.snippet}
    </pre>
  );
}
