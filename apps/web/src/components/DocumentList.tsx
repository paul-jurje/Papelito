import { useMemo } from 'react';
import type { DocumentSummary } from '../hooks/useDocuments';

export interface DocumentListProps {
  documents: DocumentSummary[];
  selectedId: string | null;
  isLoading: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  isCreating: boolean;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return dateFormatter.format(date);
}

/**
 * Sidebar listing the user's documents. Shows loading skeletons, an error
 * banner, and an empty state. Each row has Rename / Delete affordances and
 * is keyboard-focusable so users can navigate with the keyboard.
 */
export function DocumentList({
  documents,
  selectedId,
  isLoading,
  error,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  isCreating,
}: DocumentListProps): JSX.Element {
  const sorted = useMemo(
    () =>
      [...documents].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [documents],
  );

  return (
    <aside
      aria-label="Documents"
      data-testid="document-list"
      className="flex h-full w-80 shrink-0 flex-col border-r border-slate-850 bg-slate-900 text-slate-300"
    >
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
          My Workspace
        </h2>
        <button
          type="button"
          onClick={onCreate}
          disabled={isCreating}
          data-testid="new-document-button"
          className="rounded-lg bg-indigo-650 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 transition-all"
        >
          {isCreating ? 'Creating…' : 'New Draft'}
        </button>
      </div>

      {error !== null && (
        <p
          role="alert"
          data-testid="document-list-error"
          className="border-b border-red-900 bg-red-950/40 px-5 py-2.5 text-xs text-red-400 font-semibold"
        >
          {error}
        </p>
      )}

      <div className="flex-1 overflow-y-auto" data-testid="document-list-body">
        {isLoading ? (
          <ul
            aria-busy="true"
            data-testid="document-list-loading"
            className="space-y-1.5 px-3 py-3"
          >
            {[0, 1, 2].map((i) => (
              <li
                key={i}
                aria-hidden="true"
                className="h-14 animate-pulse rounded-xl bg-slate-800/60"
              />
            ))}
          </ul>
        ) : sorted.length === 0 ? (
          <div
            data-testid="document-list-empty"
            className="flex h-full flex-col items-center justify-center px-5 py-12 text-center text-sm text-slate-500"
          >
            <p className="font-semibold text-slate-450">No documents yet</p>
            <p className="mt-1.5 text-xs text-slate-500 leading-relaxed max-w-[12rem]">
              Click <span className="font-bold text-slate-400">New Draft</span> to start writing.
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5 px-3 py-3" role="list">
            {sorted.map((doc) => {
              const isSelected = doc.id === selectedId;
              return (
                <li key={doc.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-current={isSelected ? 'true' : undefined}
                    data-testid={`document-item-${doc.id}`}
                    data-selected={isSelected ? 'true' : 'false'}
                    onClick={() => onSelect(doc.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(doc.id);
                      }
                    }}
                    className={`group flex cursor-pointer flex-col gap-1.5 rounded-xl border px-4 py-3 transition-all focus:outline-none focus:ring-1 focus:ring-slate-500 ${
                      isSelected
                        ? 'border-indigo-500/20 bg-slate-800 text-white shadow-xs'
                        : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="truncate text-sm font-semibold tracking-tight">
                        {doc.title}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <button
                          type="button"
                          aria-label={`Rename ${doc.title}`}
                          data-testid={`rename-document-${doc.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onRename(doc.id);
                          }}
                          className="rounded px-2 py-0.5 text-[11px] font-bold text-slate-350 hover:bg-slate-700 hover:text-white transition-colors"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${doc.title}`}
                          data-testid={`delete-document-${doc.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(doc.id);
                          }}
                          className="rounded px-2 py-0.5 text-[11px] font-bold text-rose-450 hover:bg-rose-950/40 hover:text-rose-400 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <span className="text-[10px] font-medium text-slate-500 tracking-wide">
                      {formatUpdatedAt(doc.updatedAt)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

export default DocumentList;
