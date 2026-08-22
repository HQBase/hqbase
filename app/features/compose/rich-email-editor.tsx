import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import * as React from "react";
import {
  PiArrowUUpLeft,
  PiArrowUUpRight,
  PiEraser,
  PiLink,
  PiListBullets,
  PiListNumbers,
  PiTextB,
  PiTextItalic
} from "react-icons/pi";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function RichEmailEditor({
  contained = true,
  html,
  onChange,
  onFiles
}: {
  contained?: boolean;
  html: string;
  onChange: (html: string, text: string) => void;
  onFiles: (files: File[]) => void;
}) {
  const onChangeRef = React.useRef(onChange);
  const onFilesRef = React.useRef(onFiles);
  React.useEffect(() => {
    onChangeRef.current = onChange;
    onFilesRef.current = onFiles;
  }, [onChange, onFiles]);
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ link: { openOnClick: false } }),
        Placeholder.configure({ placeholder: "Write your message…" })
      ],
      content: html,
      editorProps: {
        attributes: {
          class:
            "prose prose-sm min-h-60 max-w-none px-5 py-4 text-sm outline-none [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_p]:my-2",
          "data-compose-autofocus": ""
        },
        handleDrop: (_view, event) => {
          const files = Array.from(event.dataTransfer?.files ?? []);
          if (files.length === 0) return false;
          onFilesRef.current(files);
          return true;
        },
        handlePaste: (_view, event) => {
          const files = Array.from(event.clipboardData?.files ?? []);
          if (files.length === 0) return false;
          onFilesRef.current(files);
          return true;
        }
      },
      onUpdate: ({ editor: value }) => onChangeRef.current(value.getHTML(), value.getText())
    },
    []
  );
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
function Tool({
  active = false,
  children,
  label,
  onClick
}: {
  active?: boolean;
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={label}
      aria-pressed={active}
      className="size-10 min-h-10 min-w-10"
      size="icon"
      type="button"
      variant={active ? "secondary" : "ghost"}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
