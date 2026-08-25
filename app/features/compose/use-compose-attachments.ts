import * as React from "react";
import { toast } from "sonner";

import { deleteDraftAttachment, uploadDraftAttachment } from "@/features/drafts/api";
import type { Draft, DraftAttachment } from "@/features/drafts/types";

import { referencedInlineAttachmentIds } from "./email-images";

const inlineImageDeleteDelayMs = 1_000;

type MutableRef<T> = { current: T };

type UseComposeAttachmentsOptions = {
  draftRef: MutableRef<Draft | null>;
  generationRef: MutableRef<number>;
  htmlRef: MutableRef<string>;
};

export function useComposeAttachments({
  draftRef,
  generationRef,
  htmlRef
}: UseComposeAttachmentsOptions) {
  const [attachments, setAttachments] = React.useState<DraftAttachment[]>([]);
  const [uploadCount, setUploadCount] = React.useState(0);
  const attachmentsRef = React.useRef<DraftAttachment[]>([]);
  const uploadTokensRef = React.useRef(new Set<symbol>());
  const removingInlineIdsRef = React.useRef(new Set<string>());
  const inlineRemovalTimersRef = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const mountedRef = React.useRef(true);

  const updateAttachments = React.useCallback(
    (update: (current: DraftAttachment[]) => DraftAttachment[]) => {
      setAttachments((current) => {
        const next = update(current);
        attachmentsRef.current = next;
        return next;
      });
    },
    []
  );

  const replaceAttachments = React.useCallback((next: DraftAttachment[]) => {
    attachmentsRef.current = next;
    setAttachments(next);
  }, []);

  const clearInlineRemovalTimers = React.useCallback(() => {
    for (const timer of inlineRemovalTimersRef.current.values()) clearTimeout(timer);
    inlineRemovalTimersRef.current.clear();
  }, []);

  const startSession = React.useCallback((): number => {
    const generation = ++generationRef.current;
    uploadTokensRef.current.clear();
    removingInlineIdsRef.current.clear();
    clearInlineRemovalTimers();
    setUploadCount(0);
    return generation;
  }, [clearInlineRemovalTimers, generationRef]);

  const invalidate = React.useCallback(() => {
    generationRef.current += 1;
    uploadTokensRef.current.clear();
    clearInlineRemovalTimers();
    setUploadCount(0);
  }, [clearInlineRemovalTimers, generationRef]);

  const beginUpload = React.useCallback((): symbol => {
    const token = Symbol("compose-upload");
    uploadTokensRef.current.add(token);
    setUploadCount(uploadTokensRef.current.size);
    return token;
  }, []);

  const finishUpload = React.useCallback((token: symbol): void => {
    uploadTokensRef.current.delete(token);
    if (mountedRef.current) setUploadCount(uploadTokensRef.current.size);
  }, []);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      uploadTokensRef.current.clear();
      clearInlineRemovalTimers();
    };
  }, [clearInlineRemovalTimers, generationRef]);

  const upload = React.useCallback(
    async (files: File[]) => {
      const activeDraft = draftRef.current;
      if (!activeDraft || files.length === 0) return;
      const generation = generationRef.current;
      const token = beginUpload();
      let added = false;
      try {
        for (const file of files) {
          if (generation !== generationRef.current || draftRef.current?.id !== activeDraft.id)
            break;
          const item = await uploadDraftAttachment(activeDraft.id, file);
          if (generation !== generationRef.current || draftRef.current?.id !== activeDraft.id) {
            await deleteDraftAttachment(activeDraft.id, item.id).catch(() => undefined);
            break;
          }
          updateAttachments((current) => [...current, item]);
          added = true;
        }
        if (added) toast.success("Attachment added.");
      } catch (error) {
        if (generation === generationRef.current) {
          toast.error(error instanceof Error ? error.message : "Upload failed.");
        }
      } finally {
        finishUpload(token);
      }
    },
    [beginUpload, draftRef, finishUpload, generationRef, updateAttachments]
  );

  const uploadImages = React.useCallback(
    async (files: File[]) => {
      const activeDraft = draftRef.current;
      if (!activeDraft || files.length === 0) return [];
      const generation = generationRef.current;
      const token = beginUpload();
      const images = [];
      let failed = false;
      try {
        for (const file of files) {
          if (generation !== generationRef.current || draftRef.current?.id !== activeDraft.id)
            break;
          try {
            const item = await uploadDraftAttachment(activeDraft.id, file, true);
            if (generation !== generationRef.current || draftRef.current?.id !== activeDraft.id) {
              await deleteDraftAttachment(activeDraft.id, item.id).catch(() => undefined);
              break;
            }
            updateAttachments((current) => [...current, item]);
            images.push({
              alt: file.name || "Image",
              src: `/api/v2/drafts/${encodeURIComponent(activeDraft.id)}/attachments/${encodeURIComponent(item.id)}/inline`
            });
          } catch {
            failed = true;
          }
        }
        if (generation === generationRef.current) {
          if (images.length) toast.success(images.length === 1 ? "Image added." : "Images added.");
          if (failed) toast.error("Some images could not be uploaded.");
        }
        return images;
      } finally {
        finishUpload(token);
      }
    },
    [beginUpload, draftRef, finishUpload, generationRef, updateAttachments]
  );

  const removeAttachment = React.useCallback(
    async (item: DraftAttachment) => {
      const activeDraft = draftRef.current;
      if (!activeDraft) return;
      await deleteDraftAttachment(activeDraft.id, item.id);
      updateAttachments((current) => current.filter((attachment) => attachment.id !== item.id));
    },
    [draftRef, updateAttachments]
  );

  const removeUnreferencedInlineAttachments = React.useCallback(
    (nextHtml: string): void => {
      const activeDraft = draftRef.current;
      if (!activeDraft) return;
      htmlRef.current = nextHtml;
      const referencedIds = referencedInlineAttachmentIds(nextHtml, activeDraft.id);
      for (const item of attachmentsRef.current) {
        if (!item.inline) continue;
        const existingTimer = inlineRemovalTimersRef.current.get(item.id);
        if (referencedIds.has(item.id)) {
          if (existingTimer !== undefined) clearTimeout(existingTimer);
          inlineRemovalTimersRef.current.delete(item.id);
          continue;
        }
        if (existingTimer !== undefined || removingInlineIdsRef.current.has(item.id)) continue;
        const generation = generationRef.current;
        const timer = setTimeout(() => {
          inlineRemovalTimersRef.current.delete(item.id);
          if (
            generation !== generationRef.current ||
            draftRef.current?.id !== activeDraft.id ||
            referencedInlineAttachmentIds(htmlRef.current, activeDraft.id).has(item.id)
          )
            return;
          removingInlineIdsRef.current.add(item.id);
          void deleteDraftAttachment(activeDraft.id, item.id)
            .then(() => {
              removingInlineIdsRef.current.delete(item.id);
              if (generation === generationRef.current && draftRef.current?.id === activeDraft.id) {
                updateAttachments((current) =>
                  current.filter((attachment) => attachment.id !== item.id)
                );
              }
            })
            .catch((error: unknown) => {
              removingInlineIdsRef.current.delete(item.id);
              if (generation === generationRef.current) {
                toast.error(error instanceof Error ? error.message : "Image could not be removed.");
              }
            });
        }, inlineImageDeleteDelayMs);
        inlineRemovalTimersRef.current.set(item.id, timer);
      }
    },
    [draftRef, generationRef, htmlRef, updateAttachments]
  );

  return {
    attachments,
    uploadCount,
    invalidate,
    removeAttachment,
    removeUnreferencedInlineAttachments,
    replaceAttachments,
    startSession,
    upload,
    uploadImages
  };
}
