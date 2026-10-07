// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// next/link is fine to use directly but mock it to avoid app-router context
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

import NoteActionButtons from '@/components/brain/NoteActionButtons';

describe('components-batch-38e', () => {
  // -------------------------------------------------------------------------
  // NoteActionButtons — conditional rendering + click handlers
  // -------------------------------------------------------------------------
  describe('NoteActionButtons', () => {
    const baseNote = {
      id: 'note-1',
      title: 'hello',
      body: 'world',
      pinned: false,
    } as any;

    it('renders pin + delete + zen-link by default', () => {
      render(
        <NoteActionButtons
          note={baseNote}
          onPatch={() => {}}
          onDelete={() => {}}
        />,
      );
      // Pin (title="Pin" because not pinned)
      expect(screen.getByTitle('Pin')).toBeInTheDocument();
      expect(screen.getByTitle('Delete note')).toBeInTheDocument();
      // Zen link present
      const zen = screen.getByTitle(/Zen mode/i);
      expect(zen).toBeInTheDocument();
      expect(zen).toHaveAttribute('href', '/portal/brain/knowledge/note-1');
    });

    it('hides the zen link when showZenLink=false', () => {
      render(
        <NoteActionButtons
          note={baseNote}
          onPatch={() => {}}
          onDelete={() => {}}
          showZenLink={false}
        />,
      );
      expect(screen.queryByTitle(/Zen mode/i)).toBeNull();
    });

    it('flips pinned via onPatch when the pin button is clicked', () => {
      const onPatch = vi.fn();
      render(
        <NoteActionButtons
          note={baseNote}
          onPatch={onPatch}
          onDelete={() => {}}
        />,
      );
      fireEvent.click(screen.getByTitle('Pin'));
      expect(onPatch).toHaveBeenCalledWith({ pinned: true });
    });

    it('shows "Unpin" title and flips pinned to false for a pinned note', () => {
      const onPatch = vi.fn();
      render(
        <NoteActionButtons
          note={{ ...baseNote, pinned: true }}
          onPatch={onPatch}
          onDelete={() => {}}
        />,
      );
      const btn = screen.getByTitle('Unpin');
      expect(btn).toBeInTheDocument();
      // Pinned variant uses amber styling
      expect(btn.className).toMatch(/amber/);
      fireEvent.click(btn);
      expect(onPatch).toHaveBeenCalledWith({ pinned: false });
    });

    it('invokes onDelete when the delete button is clicked', () => {
      const onDelete = vi.fn();
      render(
        <NoteActionButtons
          note={baseNote}
          onPatch={() => {}}
          onDelete={onDelete}
        />,
      );
      fireEvent.click(screen.getByTitle('Delete note'));
      expect(onDelete).toHaveBeenCalledTimes(1);
    });
  });
});
