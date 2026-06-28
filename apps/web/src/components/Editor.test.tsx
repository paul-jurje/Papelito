import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { JSONContent } from '@tiptap/core';
import Editor from './Editor';

beforeEach(() => {
  // jsdom does not implement scrollIntoView, but Tiptap calls it on init.
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Editor', () => {
  it('eventually mounts the editor surface and marks the wrapper as ready', async () => {
    render(
      <Editor
        content={null}
        onChange={() => {}}
        editable
      />,
    );

    // Tiptap may initialize synchronously (so the loading state may already
    // be gone) or asynchronously — only assert that the surface eventually
    // appears and the loading state is gone.
    await waitFor(() => {
      expect(screen.getByTestId('editor-surface')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('editor-loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('editor-wrapper')).toHaveAttribute(
      'data-ready',
      'true',
    );
  });

  it('renders a formatting toolbar with bold, italic, heading, and list buttons', async () => {
    render(
      <Editor
        content={null}
        onChange={() => {}}
        editable
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('editor-surface')).toBeInTheDocument();
    });

    const toolbar = screen.getByTestId('editor-toolbar');
    expect(toolbar).toHaveAttribute('role', 'toolbar');

    expect(
      toolbar.querySelector('[data-testid="toolbar-bold"]'),
    ).toBeInTheDocument();
    expect(
      toolbar.querySelector('[data-testid="toolbar-italic"]'),
    ).toBeInTheDocument();
    expect(
      toolbar.querySelector('[data-testid="toolbar-heading"]'),
    ).toBeInTheDocument();
    expect(
      toolbar.querySelector('[data-testid="toolbar-bullet-list"]'),
    ).toBeInTheDocument();
    expect(
      toolbar.querySelector('[data-testid="toolbar-ordered-list"]'),
    ).toBeInTheDocument();
  });

  it('hides the toolbar when editable is false', async () => {
    render(
      <Editor
        content={null}
        onChange={() => {}}
        editable={false}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('editor-surface')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('editor-toolbar')).not.toBeInTheDocument();
  });

  it('renders supplied ProseMirror JSON content into the editor', async () => {
    const initial: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'hello world' }],
        },
      ],
    };

    render(
      <Editor
        content={initial}
        onChange={() => {}}
        editable
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('editor-surface')).toBeInTheDocument();
    });

    const surface = screen.getByTestId('editor-surface');
    expect(surface.textContent).toContain('hello world');
  });

  it('renders an empty editor when content is null', async () => {
    render(
      <Editor
        content={null}
        onChange={() => {}}
        editable
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('editor-surface')).toBeInTheDocument();
    });

    // Surface is mounted but contains no text.
    const surface = screen.getByTestId('editor-surface');
    expect(surface.textContent ?? '').toBe('');
  });
});
