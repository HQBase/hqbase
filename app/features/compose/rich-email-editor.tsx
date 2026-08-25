import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import type { Editor } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import * as React from "react";
import {
  PiArrowUUpLeft,
  PiArrowUUpRight,
  PiEraser,
  PiImage,
  PiLink,
  PiListBullets,
  PiListNumbers,
  PiTextB,
  PiTextItalic
} from "react-icons/pi";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { EMAIL_IMAGE_ACCEPT, isSafeRasterImage, type RichEmailImage } from "./email-images";

export function RichEmailEditor({
  allowDataImages = false,
  contained = true,
  html,
  onChange,
  onFiles,
  onImages
}: {
  allowDataImages?: boolean;
  contained?: boolean;
  html: string;
  onChange: (html: string, text: string) => void;
  onFiles?: (files: File[]) => Promise<void> | void;
  onImages: (files: File[], currentHtml: string) => Promise<RichEmailImage[]>;
}) {
  const onChangeRef = React.useRef(onChange);
  const onFilesRef = React.useRef(onFiles);
  const onImagesRef = React.useRef(onImages);
  const editorRef = React.useRef<Editor | null>(null);
  const pendingInsertionsRef = React.useRef(new Map<number, { order: number; position: number }>());
  const nextInsertionRef = React.useRef(0);
  const activeInsertionOrderRef = React.useRef<number | null>(null);
  const dataImageQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  const insertionTailRef = React.useRef<Promise<void>>(Promise.resolve());
  React.useEffect(() => {
    onChangeRef.current = onChange;
    onFilesRef.current = onFiles;
    onImagesRef.current = onImages;
  }, [onChange, onFiles, onImages]);

  const insertFiles = React.useCallback(
    async (files: File[], position: number) => {
      const sourceEditor = editorRef.current;
      if (!sourceEditor) return;
      const order = nextInsertionRef.current++;
      pendingInsertionsRef.current.set(order, {
        order,
        position: Math.min(position, sourceEditor.state.doc.content.size)
      });
      const insertionTurn = insertionTailRef.current;
      let releaseInsertion: () => void = () => undefined;
      insertionTailRef.current = new Promise<void>((resolve) => {
        releaseInsertion = resolve;
      });
      const performInsertion = async () => {
        try {
          const checks = await Promise.all(
            files.map((file) => isSafeRasterImage(file).catch(() => false))
          );
          const images = files.filter((_file, index) => checks[index]);
          const attachments = files.filter((_file, index) => !checks[index]);
          if (attachments.length) await onFilesRef.current?.(attachments);
          if (!images.length || editorRef.current !== sourceEditor || sourceEditor.isDestroyed)
            return;

          const uploaded = await onImagesRef.current(images, sourceEditor.getHTML());
          const safe = uploaded.filter((image) => isAllowedImageSource(image.src, allowDataImages));
          await insertionTurn;
          const insertion = pendingInsertionsRef.current.get(order);
          if (
            !safe.length ||
            !insertion ||
            editorRef.current !== sourceEditor ||
            sourceEditor.isDestroyed
          )
            return;
          activeInsertionOrderRef.current = order;
          sourceEditor.commands.insertContentAt(
            Math.min(insertion.position, sourceEditor.state.doc.content.size),
            safe.map((image) => ({
              type: "image",
              attrs: { alt: image.alt, src: image.src }
            }))
          );
        } finally {
          activeInsertionOrderRef.current = null;
          pendingInsertionsRef.current.delete(order);
          releaseInsertion();
        }
      };
      if (!allowDataImages) {
        await performInsertion();
        return;
      }
      const queued = dataImageQueueRef.current.then(performInsertion);
      dataImageQueueRef.current = queued.catch(() => undefined);
      await queued;
    },
    [allowDataImages]
  );

  const imageExtension = React.useMemo(
    () =>
      Image.extend({
        addInputRules() {
          return [];
        },
        parseHTML() {
          return [
            {
              tag: "img[src]",
              getAttrs: (element) =>
                element instanceof HTMLElement &&
                isAllowedImageSource(element.getAttribute("src") ?? "", allowDataImages)
                  ? null
                  : false
            }
          ];
        }
      }).configure({
        allowBase64: allowDataImages,
        resize: {
          enabled: true,
          minHeight: 24,
          minWidth: 24,
          alwaysPreserveAspectRatio: true
        }
      }),
    [allowDataImages]
  );

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ link: { openOnClick: false } }),
        imageExtension,
        Placeholder.configure({ placeholder: "Write your message…" })
      ],
      content: html,
      editorProps: {
        attributes: {
          class:
            "prose prose-sm min-h-60 max-w-none px-5 py-4 text-sm outline-none [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_p]:my-2 [&_img]:h-auto [&_img]:max-w-full [&_[data-resize-container]]:max-w-full [&_[data-resize-handle]]:size-3 [&_[data-resize-handle]]:rounded-full [&_[data-resize-handle]]:border-2 [&_[data-resize-handle]]:border-primary [&_[data-resize-handle]]:bg-background",
          "data-compose-autofocus": ""
        },
        handleDrop: (view, event) => {
          const files = Array.from(event.dataTransfer?.files ?? []);
          if (files.length === 0) return false;
          const position =
            view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ??
            view.state.selection.from;
          void insertFiles(files, position);
          return true;
        },
        handlePaste: (view, event) => {
          const files = Array.from(event.clipboardData?.files ?? []);
          if (files.length === 0) return false;
          void insertFiles(files, view.state.selection.from);
          return true;
        }
      },
      onUpdate: ({ editor: value }) =>
        onChangeRef.current(
          value.getHTML(),
          value.getText({
            textSerializers: {
              image: ({ node }) => String(node.attrs.alt || "Image")
            }
          })
        ),
      onTransaction: ({ transaction }) => {
        const insertedOrder = activeInsertionOrderRef.current;
        for (const insertion of pendingInsertionsRef.current.values()) {
          if (insertion.order === insertedOrder) continue;
          insertion.position = transaction.mapping.map(
            insertion.position,
            insertedOrder !== null && insertion.order > insertedOrder ? 1 : -1
          );
        }
      }
    },
    [imageExtension, insertFiles]
  );
  React.useEffect(() => {
    editorRef.current = editor;
    return () => {
      editorRef.current = null;
      pendingInsertionsRef.current.clear();
    };
  }, [editor]);
  React.useEffect(() => {
    if (!editor) return;
    const finishTouchResize = () => {
      if (editor.view.dom.querySelector('[data-resize-state="true"]')) {
        document.dispatchEvent(new MouseEvent("mouseup"));
      }
    };
    document.addEventListener("touchend", finishTouchResize);
    document.addEventListener("touchcancel", finishTouchResize);
    return () => {
      document.removeEventListener("touchend", finishTouchResize);
      document.removeEventListener("touchcancel", finishTouchResize);
    };
  }, [editor]);
  React.useEffect(() => {
    if (editor && editor.getHTML() !== html)
      editor.commands.setContent(html || "<p></p>", { emitUpdate: false });
  }, [editor, html]);
  if (!editor) return <div className="min-h-60" />;
  const link = () => {
    const href = window.prompt("Link URL", editor.getAttributes("link").href ?? "https://");
    if (href === null) return;
    if (!href) editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };
  return (
    <div className={cn(contained && "min-h-0 flex-1 overflow-auto")}>
      <div
        className="sticky top-0 z-10 flex flex-wrap gap-1 border-b bg-card px-4 py-2"
        role="toolbar"
        aria-label="Formatting"
      >
        <Tool label="Undo" onClick={() => editor.chain().focus().undo().run()}>
          <PiArrowUUpLeft />
        </Tool>
        <Tool label="Redo" onClick={() => editor.chain().focus().redo().run()}>
          <PiArrowUUpRight />
        </Tool>
        <Tool
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <PiTextB />
        </Tool>
        <Tool
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <PiTextItalic />
        </Tool>
        <Tool
          label="Bulleted list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <PiListBullets />
        </Tool>
        <Tool
          label="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <PiListNumbers />
        </Tool>
        <Tool label="Link" active={editor.isActive("link")} onClick={link}>
          <PiLink />
        </Tool>
        <Tool
          disabled={!editor.isActive("image")}
          label="Make selected image smaller"
          onClick={() => resizeSelectedImage(editor, 0.8)}
        >
          <span aria-hidden="true">−</span>
        </Tool>
        <Tool
          disabled={!editor.isActive("image")}
          label="Make selected image larger"
          onClick={() => resizeSelectedImage(editor, 1.25)}
        >
          <span aria-hidden="true">+</span>
        </Tool>
        <Button asChild className="size-10 min-h-10 min-w-10" size="icon" variant="ghost">
          <label aria-label="Add image" className="cursor-pointer">
            <PiImage aria-hidden="true" />
            <input
              accept={EMAIL_IMAGE_ACCEPT}
              className="sr-only"
              multiple
              type="file"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length) void insertFiles(files, editor.state.selection.from);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </Button>
        <Tool
          label="Clear formatting"
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
        >
          <PiEraser />
        </Tool>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function isAllowedImageSource(source: string, allowDataImages: boolean): boolean {
  return allowDataImages
    ? /^data:image\/(?:avif|gif|jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/u.test(source)
    : /^\/api\/v[12]\/drafts\/[^/?#]+\/attachments\/[^/?#]+\/inline$/u.test(source);
}

function resizeSelectedImage(editor: Editor, scale: number): void {
  const position = editor.state.selection.from;
  const node = editor.state.doc.nodeAt(position);
  if (node?.type.name !== "image") return;
  const nodeDom = editor.view.nodeDOM(position);
  const image =
    nodeDom instanceof HTMLImageElement
      ? nodeDom
      : nodeDom instanceof HTMLElement
        ? nodeDom.querySelector("img")
        : null;
  const width = positiveNumber(node.attrs.width) ?? image?.offsetWidth ?? image?.naturalWidth ?? 0;
  const height =
    positiveNumber(node.attrs.height) ?? image?.offsetHeight ?? image?.naturalHeight ?? 0;
  if (width <= 0 || height <= 0) return;
  const availableWidth = editor.view.dom.clientWidth || 4096;
  const nextWidth = Math.max(24, Math.min(availableWidth, Math.round(width * scale)));
  const nextHeight = Math.max(24, Math.round(height * (nextWidth / width)));
  editor
    .chain()
    .focus()
    .setNodeSelection(position)
    .updateAttributes("image", { width: nextWidth, height: nextHeight })
    .run();
}

function positiveNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function Tool({
  active = false,
  children,
  disabled = false,
  label,
  onClick
}: {
  active?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={label}
      aria-pressed={active}
      className="size-10 min-h-10 min-w-10"
      disabled={disabled}
      size="icon"
      type="button"
      variant={active ? "secondary" : "ghost"}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
