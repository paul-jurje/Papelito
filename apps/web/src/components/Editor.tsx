import { useEffect } from 'react';
import type { JSONContent } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { createExtensions } from '../lib/tiptapExtensions';

export interface EditorProps {
  /**
   * ProseMirror JSON document. Pass `null` to start with an empty document.
   * When the value changes (e.g. user picks a different document), the editor
   * is reset to the new content; we do NOT push content on every keystroke —
   * the editor owns its internal state.
   */
  content: JSONContent | null;
  /**
   * Called whenever the editor's content changes. The argument is the current
   * ProseMirror JSON representation. Always wrapped in `onUpdate`, so the
   * editor instance is guaranteed to be non-null when it fires.
   */
  onChange: (content: JSONContent) => void;
  /**
   * When false the editor becomes read-only and the toolbar is hidden. Used
   * by the upsell view (non-subscribers should not be able to type).
   */
  editable?: boolean;
  className?: string;
}

/**
 * Tiptap-backed rich-text editor with a small formatting toolbar.
 *
 * The component is intentionally dumb about persistence — callers wire up
 * auto-save, document loading, and selection state. This keeps the editor
 * reusable and makes it trivial to drive from a hook.
 */
export function Editor({
  content,
  onChange,
  editable = true,
  className,
}: EditorProps): JSX.Element {
  const extensions = createExtensions();

  const editor = useEditor({
    extensions,
    content: content ?? undefined,
    editable,
    onUpdate: ({ editor: e }) => {
      onChange(e.getJSON());
    },
  });

  // Sync external content (e.g. user picked a different document) into the
  // editor. Only run this when the inbound content identity actually changes;
  // doing it on every render would clobber in-flight typing.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getJSON();
    if (!content) {
      // Caller cleared the selection — only reset if the editor isn't already
      // showing an empty doc, otherwise we can stomp on an intentional clear.
      if (current.content !== undefined && current.content.length > 0) {
        editor.commands.setContent({ type: 'doc', content: [] }, { emitUpdate: false });
      }
      return;
    }
    // Cheap identity check: stringify and compare. Documents are small enough
    // that this is fine, and it avoids deep-equality library overhead.
    if (JSON.stringify(current) !== JSON.stringify(content)) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [editor, content]);

  // Sync editable prop changes (e.g. we want to lock the editor when the
  // user is not a subscriber, or while loading).
  useEffect(() => {
    if (!editor) return;
    if (editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  return (
    <div className={className} data-testid="editor-wrapper" data-ready={editor ? 'true' : 'false'}>
      {editor && editable && (
        <div
          role="toolbar"
          aria-label="Formatting"
          data-testid="editor-toolbar"
          className="sticky top-0 z-10 flex flex-wrap gap-1.5 border-b border-slate-150 bg-gray-50 backdrop-blur-xs px-6 py-3"
        >
          <ToolbarButton
            label="Bold"
            isActive={editor.isActive('bold')}
            disabled={!editor.can().toggleBold()}
            onClick={() => editor.chain().focus().toggleBold().run()}
            testId="toolbar-bold"
          />
          <ToolbarButton
            label="Italic"
            isActive={editor.isActive('italic')}
            disabled={!editor.can().toggleItalic()}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            testId="toolbar-italic"
          />
          <div className="h-4 w-px bg-slate-200 self-center mx-1" />
          <ToolbarButton
            label="H1"
            isActive={editor.isActive('heading', { level: 1 })}
            disabled={!editor.can().toggleHeading({ level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            testId="toolbar-heading"
          />
          <div className="h-4 w-px bg-slate-200 self-center mx-1" />
          <ToolbarButton
            label="Bullet list"
            isActive={editor.isActive('bulletList')}
            disabled={!editor.can().toggleBulletList()}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            testId="toolbar-bullet-list"
          />
          <ToolbarButton
            label="Numbered list"
            isActive={editor.isActive('orderedList')}
            disabled={!editor.can().toggleOrderedList()}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            testId="toolbar-ordered-list"
          />
        </div>
      )}

      {editor ? (
        <div className="bg-white">
          <EditorContent
            editor={editor}
            className="prose prose-slate writing-font mx-auto max-w-2xl px-6 py-12 focus:outline-none min-h-[30rem] leading-relaxed text-slate-800"
            data-testid="editor-surface"
          />
        </div>
      ) : (
        <div
          role="status"
          aria-live="polite"
          data-testid="editor-loading"
          className="flex min-h-[30rem] items-center justify-center text-sm font-semibold text-slate-400"
        >
          Loading editor…
        </div>
      )}
    </div>
  );
}

interface ToolbarButtonProps {
  label: string;
  isActive: boolean;
  disabled: boolean;
  onClick: () => void;
  testId: string;
}

function ToolbarButton({
  label,
  isActive,
  disabled,
  onClick,
  testId,
}: ToolbarButtonProps): JSX.Element {
  const baseClasses =
    'rounded-lg px-2.5 py-1 text-xs font-bold transition-all focus:outline-none focus:ring-1 focus:ring-slate-300';
  const stateClasses = disabled
    ? 'cursor-not-allowed text-slate-350 opacity-50'
    : isActive
      ? 'bg-slate-900 text-white shadow-xs'
      : 'text-slate-600 hover:bg-slate-200/75 hover:text-slate-900';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={isActive}
      aria-label={label}
      data-testid={testId}
      className={`${baseClasses} ${stateClasses}`}
    >
      {label}
    </button>
  );
}

export default Editor;
