'use client';

import { useEffect, useState } from 'react';

type Kind = 'text' | 'number' | 'date' | 'select' | 'multi_select' | 'url' | 'checkbox';

interface CustomField {
  id: number;
  key: string;
  name: string;
  kind: Kind;
  required: boolean;
  options: string[];
  order: number;
}

const KIND_LABELS: Record<Kind, string> = {
  text: 'Texto',
  number: 'Número',
  date: 'Fecha',
  select: 'Selección (una)',
  multi_select: 'Selección (múltiple)',
  url: 'URL',
  checkbox: 'Casilla',
};

const KINDS: Kind[] = ['text', 'number', 'date', 'select', 'multi_select', 'url', 'checkbox'];

export default function ProjectCustomFieldsPanel({ projectId, canEdit }: { projectId: number; canEdit: boolean }) {
  const [rows, setRows] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', kind: 'text' as Kind, required: false, optionsCsv: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await fetch(`/api/portal/projects/${projectId}/custom-fields`);
      const json = await res.json();
      if (json.success) setRows(json.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [projectId]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const opts = (form.kind === 'select' || form.kind === 'multi_select')
        ? form.optionsCsv.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      const res = await fetch(`/api/portal/projects/${projectId}/custom-fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, kind: form.kind, required: form.required, options: opts }),
      });
      if ((await res.json()).success) {
        setShowForm(false);
        setForm({ name: '', kind: 'text', required: false, optionsCsv: '' });
        await load();
      }
    } finally { setSaving(false); }
  };

  const onDelete = async (id: number) => {
    if (!confirm('¿Eliminar este campo? Se eliminarán los valores existentes en las tarjetas.')) return;
    await fetch(`/api/portal/custom-fields/${id}`, { method: 'DELETE' });
    await load();
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Campos personalizados</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Añade una sección editable al detalle de cada tarjeta de este proyecto.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-foreground text-background hover:bg-foreground/90"
          >
            <span className="material-icons text-sm">{showForm ? 'close' : 'add'}</span>
            {showForm ? 'Cancelar' : 'Nuevo campo'}
          </button>
        )}
      </div>

      {showForm && canEdit && (
        <form onSubmit={onSubmit} className="space-y-3 border border-border rounded-lg p-4 bg-background">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Nombre del campo <span className="text-destructive">*</span></label>
              <input
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                required
                placeholder="p. ej. Gravedad"
                className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Tipo</label>
              <select
                value={form.kind}
                onChange={e => setForm(p => ({ ...p, kind: e.target.value as Kind }))}
                className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm"
              >
                {KINDS.map(k => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
              </select>
            </div>
            {(form.kind === 'select' || form.kind === 'multi_select') && (
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-medium text-foreground">Opciones (separadas por comas)</label>
                <input
                  value={form.optionsCsv}
                  onChange={e => setForm(p => ({ ...p, optionsCsv: e.target.value }))}
                  placeholder="Crítica, Alta, Media, Baja"
                  className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.required}
                  onChange={e => setForm(p => ({ ...p, required: e.target.checked }))}
                  className="accent-primary"
                />Obligatorio</label>
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="px-4 py-1.5 rounded bg-foreground text-background text-xs font-medium hover:bg-foreground/90 disabled:opacity-50">
              {saving ? 'Guardando…' : 'Añadir campo'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">Aún no hay campos personalizados.</p>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {rows.map(f => (
            <div key={f.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{f.name}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">{f.key}</span>
                  {f.required && <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive font-medium">obligatorio</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {KIND_LABELS[f.kind]}{f.options.length > 0 ? ` · ${f.options.length} opciones` : ''}
                </p>
              </div>
              {canEdit && (
                <button onClick={() => onDelete(f.id)} className="text-xs text-muted-foreground hover:text-destructive" title="Eliminar">
                  <span className="material-icons text-sm">delete_outline</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
