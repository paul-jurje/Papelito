import type { Extensions } from '@tiptap/core';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';

/**
 * Build the Tiptap extension set used by the editor.
 *
 * We deliberately use only MIT-licensed Tiptap core + StarterKit + the free
 * Placeholder extension. Do not add any Tiptap Pro / Cloud extensions here —
 * those would require a paid license (see docs/plan.md "License Review").
 *
 * `Placeholder` shows "Start writing…" only when the document is empty, which
 * gives first-time users a hint without being noisy once content exists.
 */
export function createExtensions(): Extensions {
  return [
    StarterKit,
    Placeholder.configure({
      placeholder: 'Start writing…',
      showOnlyWhenEditable: true,
    }),
  ];
}

export default createExtensions;
