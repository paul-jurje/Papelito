import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { JSONContent } from '@tiptap/core';
import Editor from '../components/Editor';
import DocumentList from '../components/DocumentList';
import RenameDocumentDialog from '../components/RenameDocumentDialog';
import DeleteDocumentDialog from '../components/DeleteDocumentDialog';
import SubscribeButton from '../components/SubscribeButton';
import { useAuth } from '../hooks/useAuth';
import { useDocuments } from '../hooks/useDocuments';

const AUTOSAVE_DEBOUNCE_MS = 1000;
const EMPTY_DOC: JSONContent = { type: 'doc', content: [] };

type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';

function saveStatusLabel(status: SaveStatus): string {
  switch (status) {
    case 'idle':
      return '';
    case 'unsaved':
      return 'Unsaved changes';
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved';
    case 'error':
      return 'Save failed';
  }
}

function saveStatusColor(status: SaveStatus): string {
  switch (status) {
    case 'saving':
      return 'text-slate-500';
    case 'saved':
      return 'text-green-700';
    case 'error':
      return 'text-red-600';
    case 'unsaved':
      return 'text-amber-700';
    default:
      return 'text-slate-400';
  }
}

export function EditorPage(): ReactNode {
  const { user, isSubscriber } = useAuth();
  const {
    documents,
    isLoading,
    error,
    createDocument,
    renameDocument,
    deleteDocument,
    saveDocument,
    loadDocument,
    selectedDocument,
    selectedId,
    setSelectedId,
  } = useDocuments();

  const [isCreating, setIsCreating] = useState(false);
  const [renameTargetId, setRenameTargetId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState<string>('');
  const [renameSubmitting, setRenameSubmitting] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [editorContent, setEditorContent] = useState<JSONContent>(EMPTY_DOC);
  const editorContentRef = useRef<JSONContent>(EMPTY_DOC);
  const saveTimerRef = useRef<number | null>(null);

  // Track the latest content in a ref so the debounced save always uses the
  // most recent value (avoids stale-closure issues when state updates batch).
  useEffect(() => {
    editorContentRef.current = editorContent;
  }, [editorContent]);

  // When a different document is selected, load its content into the editor
  // and reset the save state.
  useEffect(() => {
    if (selectedId === null) {
      setEditorContent(EMPTY_DOC);
      setSaveStatus('idle');
      return;
    }
    let cancelled = false;
    (async () => {
      const detail = await loadDocument(selectedId);
      if (cancelled) return;
      if (detail) {
        setEditorContent(detail.content);
        setSaveStatus('idle');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, loadDocument]);

  // Clear the autosave timer on unmount so we don't fire after navigation.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const flushSave = useCallback(async (): Promise<void> => {
    if (selectedId === null) return;
    if (saveStatus === 'saving') return;
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setSaveStatus('saving');
    const result = await saveDocument(selectedId, editorContentRef.current);
    if (result) {
      setSaveStatus('saved');
    } else {
      setSaveStatus('error');
    }
  }, [selectedId, saveStatus, saveDocument]);

  const handleEditorChange = useCallback(
    (next: JSONContent): void => {
      setEditorContent(next);
      if (selectedId === null) return;
      // Skip scheduling if a save is already in flight; the in-flight save
      // will finish with the latest server state, and we'll re-mark as
      // unsaved on the next keystroke after it completes.
      if (saveStatus === 'saving') {
        setSaveStatus('unsaved');
        return;
      }
      setSaveStatus('unsaved');
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        void flushSave();
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [selectedId, saveStatus, flushSave],
  );

  const handleCreate = useCallback(async (): Promise<void> => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      await createDocument();
    } finally {
      setIsCreating(false);
    }
  }, [isCreating, createDocument]);

  const openRename = useCallback(
    (id: number): void => {
      const target = documents.find((d) => d.id === id);
      setRenameTargetId(id);
      setRenameDraft(target?.title ?? '');
      setRenameError(null);
    },
    [documents],
  );

  const closeRename = useCallback((): void => {
    if (renameSubmitting) return;
    setRenameTargetId(null);
    setRenameError(null);
  }, [renameSubmitting]);

  const submitRename = useCallback(
    async (title: string): Promise<void> => {
      if (renameTargetId === null) return;
      setRenameSubmitting(true);
      setRenameError(null);
      const result = await renameDocument(renameTargetId, title);
      setRenameSubmitting(false);
      if (result) {
        setRenameTargetId(null);
      } else {
        setRenameError('Could not rename document. Please try again.');
      }
    },
    [renameTargetId, renameDocument],
  );

  const openDelete = useCallback((id: number): void => {
    setDeleteTargetId(id);
    setDeleteError(null);
  }, []);

  const closeDelete = useCallback((): void => {
    if (deleteSubmitting) return;
    setDeleteTargetId(null);
    setDeleteError(null);
  }, [deleteSubmitting]);

  const confirmDelete = useCallback(async (): Promise<void> => {
    if (deleteTargetId === null) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    const ok = await deleteDocument(deleteTargetId);
    setDeleteSubmitting(false);
    if (ok) {
      setDeleteTargetId(null);
    } else {
      setDeleteError('Could not delete document. Please try again.');
    }
  }, [deleteTargetId, deleteDocument]);

  const renameTarget = documents.find((d) => d.id === renameTargetId) ?? null;
  const deleteTarget = documents.find((d) => d.id === deleteTargetId) ?? null;

  // ---- view selection -----------------------------------------------------

  if (!isSubscriber) {
    return <UpsellScreen userEmail={user?.email ?? null} />;
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <Header
        title={selectedDocument?.title ?? 'Untitled document'}
        saveStatus={saveStatus}
        userEmail={user?.email ?? null}
      />

      <div className="flex flex-1 overflow-hidden">
        <DocumentList
          documents={documents}
          selectedId={selectedId}
          isLoading={isLoading}
          error={error}
          isCreating={isCreating}
          onSelect={(id) => setSelectedId(id)}
          onCreate={handleCreate}
          onRename={openRename}
          onDelete={openDelete}
        />

        <main
          className="flex-1 overflow-y-auto bg-white"
          data-testid="editor-main"
        >
          {selectedId === null ? (
            <EmptyWorkspace onCreate={handleCreate} isCreating={isCreating} />
          ) : (
            <Editor
              content={editorContent}
              onChange={handleEditorChange}
              editable
              className="h-full"
            />
          )}
        </main>
      </div>

      <RenameDocumentDialog
        open={renameTargetId !== null}
        initialTitle={renameTarget?.title ?? renameDraft}
        isSubmitting={renameSubmitting}
        error={renameError}
        onCancel={closeRename}
        onSave={submitRename}
      />

      <DeleteDocumentDialog
        open={deleteTargetId !== null}
        title={deleteTarget?.title ?? 'this document'}
        isSubmitting={deleteSubmitting}
        error={deleteError}
        onCancel={closeDelete}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

interface HeaderProps {
  title: string;
  saveStatus: SaveStatus;
  userEmail: string | null;
}

function Header({ title, saveStatus, userEmail }: HeaderProps): JSX.Element {
  return (
    <header className="flex items-center justify-between border-b border-slate-100 bg-white px-5 py-3.5 shadow-xs">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          to="/"
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
        >
          ← Home
        </Link>
        <div className="h-4 w-px bg-slate-200" />
        <h1
          className="truncate text-sm font-bold text-slate-800"
          data-testid="document-title"
        >
          {title}
        </h1>
        <div className="flex items-center gap-1.5 ml-2">
          <span className={`h-1.5 w-1.5 rounded-full ${
            saveStatus === 'saving' ? 'bg-indigo-500 animate-pulse' :
            saveStatus === 'saved' ? 'bg-emerald-500' :
            saveStatus === 'error' ? 'bg-rose-500' :
            saveStatus === 'unsaved' ? 'bg-amber-500' : 'bg-transparent'
          }`} />
          <span
            aria-live="polite"
            data-testid="save-status"
            data-status={saveStatus}
            className={`text-[10px] font-bold tracking-wide uppercase ${saveStatusColor(saveStatus)}`}
          >
            {saveStatusLabel(saveStatus)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {userEmail && (
          <span className="hidden truncate text-xs font-semibold text-slate-400 sm:inline bg-slate-50 px-2.5 py-1 rounded-full border border-slate-100">
            {userEmail}
          </span>
        )}
      </div>
    </header>
  );
}

interface EmptyWorkspaceProps {
  onCreate: () => void;
  isCreating: boolean;
}

function EmptyWorkspace({ onCreate, isCreating }: EmptyWorkspaceProps): JSX.Element {
  return (
    <div
      data-testid="editor-empty"
      className="flex h-full flex-col items-center justify-center px-6 text-center bg-slate-50/20"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-650 mb-4 shadow-xs">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="h-5 w-5"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </div>
      <h2 className="text-base font-bold text-slate-800">No document selected</h2>
      <p className="mt-2 max-w-xs text-xs text-slate-400 font-medium leading-relaxed">
        Choose an existing document from the left workspace sidebar or create a fresh draft to begin writing.
      </p>
      <button
        type="button"
        onClick={onCreate}
        disabled={isCreating}
        data-testid="empty-create-button"
        className="mt-6 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 transition-all hover:scale-[1.01]"
      >
        {isCreating ? 'Creating…' : 'Create new draft'}
      </button>
    </div>
  );
}

interface UpsellScreenProps {
  userEmail: string | null;
}

function UpsellScreen({ userEmail }: UpsellScreenProps): JSX.Element {
  return (
    <div
      data-testid="upsell-screen"
      className="flex min-h-screen flex-col bg-gradient-to-b from-indigo-50/20 via-white to-slate-50/50"
    >
      <header className="border-b border-slate-100 bg-white px-6 py-4 shadow-xs">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-900"
          >
            <span
              aria-hidden="true"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-black text-white"
            >
              P
            </span>
            <span>Papelito</span>
          </Link>
          {userEmail && (
            <span className="hidden truncate text-xs font-semibold text-slate-400 sm:inline bg-slate-50 px-2.5 py-1 rounded-full border border-slate-100">
              {userEmail}
            </span>
          )}
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-3xl border border-slate-200/80 bg-white p-8 sm:p-10 shadow-xl shadow-slate-100/50 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 mb-5 shadow-xs">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="h-5 w-5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight sm:text-2xl">
            Subscribe to start writing
          </h1>
          <p className="mt-3.5 text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
            Papelito&apos;s editor is available to active subscribers. Subscribe
            to create, edit, and organize your documents. It takes about a
            minute.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4">
            <SubscribeButton
              variant="solid"
              label="Subscribe now"
              returnTo="/editor"
              data-testid-attr="upsell-cta"
              className="w-full rounded-xl bg-slate-900 py-3.5 text-sm font-bold text-white shadow-sm hover:bg-slate-800 transition-all hover:scale-[1.01]"
            />
            <Link
              to="/#pricing"
              className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
            >
              See pricing details
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

export default EditorPage;
