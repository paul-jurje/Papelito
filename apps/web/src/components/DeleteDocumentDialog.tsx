import { useEffect } from 'react';

export interface DeleteDocumentDialogProps {
  open: boolean;
  title: string;
  isSubmitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirmation dialog shown before deleting a document. Dismissible with the
 * Escape key. Submit is double-click protected while the delete request is
 * in flight.
 */
export function DeleteDocumentDialog({
  open,
  title,
  isSubmitting,
  error,
  onCancel,
  onConfirm,
}: DeleteDocumentDialogProps): JSX.Element | null {
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
      data-testid="delete-dialog"
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 px-4"
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
        <h2
          id="delete-dialog-title"
          className="text-base font-semibold text-slate-900"
        >
          Delete document?
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          This will permanently delete{' '}
          <span
            data-testid="delete-dialog-title-preview"
            className="font-medium text-slate-900"
          >
            {title}
          </span>
          . This action cannot be undone.
        </p>

        {error !== null && (
          <p
            role="alert"
            data-testid="delete-dialog-error"
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
            data-testid="delete-cancel"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            data-testid="delete-confirm"
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeleteDocumentDialog;
