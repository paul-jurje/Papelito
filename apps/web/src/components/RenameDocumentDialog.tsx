import { useEffect, useRef, useState, type FormEvent } from 'react';

export interface RenameDocumentDialogProps {
  open: boolean;
  initialTitle: string;
  isSubmitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (title: string) => void;
}

/**
 * Modal dialog for renaming a document. Renders nothing when `open` is false
 * so the caller doesn't need to track its own visibility.
 */
export function RenameDocumentDialog({
  open,
  initialTitle,
  isSubmitting,
  error,
  onCancel,
  onSave,
}: RenameDocumentDialogProps): JSX.Element | null {
  const [title, setTitle] = useState<string>(initialTitle);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset the input whenever the dialog opens for a new (or the same) document.
  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      // Focus on next tick so the input is mounted.
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open, initialTitle]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape' && !isSubmitting) {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, isSubmitting, onCancel]);

  if (!open) return null;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed.length === 0 || isSubmitting) return;
    onSave(trimmed);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-dialog-title"
      data-testid="rename-dialog"
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 px-4"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl"
      >
        <h2
          id="rename-dialog-title"
          className="text-base font-semibold text-slate-900"
        >
          Rename document
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Choose a new title. It will appear in your document list.
        </p>

        <div className="mt-4">
          <label
            htmlFor="rename-input"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Title
          </label>
          <input
            id="rename-input"
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isSubmitting}
            data-testid="rename-input"
            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            maxLength={200}
          />
        </div>

        {error !== null && (
          <p
            role="alert"
            data-testid="rename-dialog-error"
            className="mt-3 text-sm text-red-600"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            data-testid="rename-cancel"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || title.trim().length === 0}
            data-testid="rename-save"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default RenameDocumentDialog;
