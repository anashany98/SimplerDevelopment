'use client';

/**
 * Inline "create your first note" form for the onboarding quick-setup step —
 * a single title field -> POST /api/portal/brain/knowledge, embedded so the
 * user activates Company Brain right in the wizard instead of being bounced
 * to another tab (OBQA-004: brain keeps its walk-tier segment, but the
 * add-knowledge action gets an inline create instead of a bare pointer row,
 * same pattern as WebsitesSetupForm / BookingsSetupForm).
 */

import { useState } from 'react';
import { obPrimaryBtn } from '../ob-styles';

interface Props {
  /** Called with the new note id after a successful create. */
  onCreated: (noteId: number) => void;
}

export function BrainNoteSetupForm({ onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!title.trim()) {
      setError('Ponle un título a tu nota.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/portal/brain/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || 'No se pudo crear la nota — inténtalo de nuevo.');
        return;
      }
      onCreated(data.data.id);
    } catch {
      setError('Algo salió mal — inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[13px] border border-primary/30 bg-primary/[0.04] px-[15px] py-[13px] space-y-3">
      <div>
        <p className="text-[14px] font-semibold leading-snug">Añade tu primer conocimiento</p>
        <p className="text-[12.5px] text-muted-foreground mt-0.5">
          Se crea aquí mismo — puedes añadir los detalles más tarde desde Company Brain.
        </p>
      </div>

      <div className="space-y-2.5">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && title.trim() && !saving) void handleCreate();
          }}
          placeholder="Título de la nota — p. ej. Descripción de la empresa"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-primary"
          data-testid="ob-setup-brain-note-title"
        />
      </div>

      {error && (
        <p className="text-[12.5px] text-destructive flex items-center gap-1.5" role="alert">
          <span className="material-icons text-[15px]">error_outline</span>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleCreate}
        disabled={saving || !title.trim()}
        className={`w-full ${obPrimaryBtn}`}
        data-testid="ob-setup-brain-note-create"
      >
        {saving ? (
          <span className="material-icons text-[18px] animate-spin">refresh</span>
        ) : (
          <span className="material-icons text-[18px]">add_circle</span>
        )}
        {saving ? 'Creando…' : 'Crear nota'}
      </button>
    </div>
  );
}
