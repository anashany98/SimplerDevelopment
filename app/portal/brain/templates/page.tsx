'use client';

/**
 * Brain Note Templates — manage page.
 *
 *   ┌──────────────────────┬───────────────────────────────────┐
 *   │ + New template       │  Edit form: name / trigger /       │
 *   │ ─────────────────    │  enabled / defaultTags / body      │
 *   │ • Daily standup [m]  │  ─── variable hints ───            │
 *   │ • Meeting notes [g]  │  Save | Try it | Delete            │
 *   │ • …                  │                                    │
 *   └──────────────────────┴───────────────────────────────────┘
 *
 * Selection state is local. The list pane on the left lets you pick a
 * template; the right pane is the create-or-edit form. 409-on-duplicate-name
 * surfaces inline. Everything talks to /api/portal/brain/templates.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import {
  pBtnPrimary,
  pBtnGhost,
  pCard,
  pInput,
  pSectionTitle,
  pChip,
} from '@/components/portal/portal-ui';

type Trigger = 'manual' | 'daily' | 'meeting' | 'slash';

interface BrainNoteTemplate {
  id: number;
  name: string;
  body: string;
  trigger: Trigger;
  variables: string[] | null;
  defaultTags: string[] | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FormState {
  name: string;
  trigger: Trigger;
  enabled: boolean;
  defaultTagsInput: string;
  body: string;
}

const TRIGGERS: Array<{ value: Trigger; label: string; icon: string; hint: string }> = [
  { value: 'manual', label: 'Manual', icon: 'touch_app', hint: 'Elige esta plantilla desde el menú al crear una nota.' },
  { value: 'daily', label: 'Diaria', icon: 'today', hint: 'Se genera automáticamente una vez al día con el cron de notas diarias.' },
  { value: 'meeting', label: 'Reunión', icon: 'groups', hint: 'Se adjunta automáticamente al crear una reunión.' },
  { value: 'slash', label: 'Slash', icon: 'keyboard', hint: 'Disponible como comando /slash dentro del editor de notas.' },
];

const TRIGGER_BADGE: Record<Trigger, string> = {
  manual: 'bg-muted text-muted-foreground',
  daily: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  meeting: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  slash: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

// Mirrors lib/brain/template.ts. `today.long` is real but skipped here to
// keep the hint card short — power users will discover it from the README.
const VARIABLE_HINTS: Array<{ name: string; description: string }> = [
  { name: '{{today}}', description: 'Fecha ISO — p. ej. 2026-05-06' },
  { name: '{{week}}', description: 'Etiqueta de semana ISO — p. ej. 2026-W19' },
  { name: '{{userName}}', description: 'Nombre visible del usuario actual' },
  { name: '{{open_tasks}}', description: 'Lista con viñetas de hasta 10 tareas abiertas' },
  { name: '{{recent_meetings}}', description: 'Reuniones de los últimos 7 días' },
];

const EMPTY_FORM: FormState = {
  name: '',
  trigger: 'manual',
  enabled: true,
  defaultTagsInput: '',
  body: '',
};

function tagsFromInput(input: string): string[] {
  return input
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function tagsToInput(tags: string[] | null | undefined): string {
  return (tags ?? []).join(', ');
}

function templateToForm(t: BrainNoteTemplate): FormState {
  return {
    name: t.name,
    trigger: t.trigger,
    enabled: t.enabled,
    defaultTagsInput: tagsToInput(t.defaultTags),
    body: t.body,
  };
}

export default function BrainTemplatesPage() {
  const router = useRouter();
  const [items, setItems] = useState<BrainNoteTemplate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [tryingId, setTryingId] = useState<number | null>(null);

  const loadList = useCallback(async () => {
    setLoadError(null);
    try {
      const r = await fetch('/api/portal/brain/templates');
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.success) {
        setLoadError(json.message || `HTTP ${r.status}`);
        setItems([]);
        return;
      }
      setItems((json.data?.items ?? []) as BrainNoteTemplate[]);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Error de red');
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const selectedTemplate = useMemo(() => {
    if (selectedId === null || selectedId === 'new') return null;
    return items?.find((t) => t.id === selectedId) ?? null;
  }, [items, selectedId]);

  const handleSelect = useCallback((id: number) => {
    const target = items?.find((t) => t.id === id);
    if (!target) return;
    setSelectedId(id);
    setForm(templateToForm(target));
    setFormError(null);
  }, [items]);

  const handleNew = useCallback(() => {
    setSelectedId('new');
    setForm(EMPTY_FORM);
    setFormError(null);
  }, []);

  const handleSave = useCallback(async () => {
    setFormError(null);
    const name = form.name.trim();
    if (!name) {
      setFormError('El nombre es obligatorio.');
      return;
    }
    if (name.length > 150) {
      setFormError('El nombre debe tener 150 caracteres o menos.');
      return;
    }
    if (!form.body.trim()) {
      setFormError('El cuerpo no puede estar vacío.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name,
        body: form.body,
        trigger: form.trigger,
        enabled: form.enabled,
        defaultTags: tagsFromInput(form.defaultTagsInput),
      };
      const isNew = selectedId === 'new' || selectedId === null;
      const url = isNew
        ? '/api/portal/brain/templates'
        : `/api/portal/brain/templates/${selectedId}`;
      const method = isNew ? 'POST' : 'PATCH';
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.success) {
        if (r.status === 409) {
          setFormError('Ya existe una plantilla con ese nombre.');
        } else {
          setFormError(json.message || `No se pudo guardar (${r.status})`);
        }
        return;
      }
      const saved = json.data as BrainNoteTemplate;
      await loadList();
      setSelectedId(saved.id);
      setForm(templateToForm(saved));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error de red');
    } finally {
      setSaving(false);
    }
  }, [form, selectedId, loadList]);

  const handleDelete = useCallback(async () => {
    if (selectedId === null || selectedId === 'new') return;
    if (!window.confirm(`¿Eliminar la plantilla "${form.name}"? Esta acción no se puede deshacer.`)) return;
    setSaving(true);
    setFormError(null);
    try {
      const r = await fetch(`/api/portal/brain/templates/${selectedId}`, { method: 'DELETE' });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.success) {
        setFormError(json.message || `No se pudo eliminar (${r.status})`);
        return;
      }
      setSelectedId(null);
      setForm(EMPTY_FORM);
      await loadList();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error de red');
    } finally {
      setSaving(false);
    }
  }, [selectedId, form.name, loadList]);

  const handleTryIt = useCallback(async () => {
    if (selectedId === null || selectedId === 'new') return;
    setTryingId(selectedId);
    setFormError(null);
    try {
      const r = await fetch(`/api/portal/brain/knowledge/from-template/${selectedId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.success || !json.data?.id) {
        setFormError(json.message || `No se pudo aplicar (${r.status})`);
        return;
      }
      router.push(`/portal/brain/knowledge?id=${json.data.id}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error de red');
    } finally {
      setTryingId(null);
    }
  }, [selectedId, router]);

  const isNewMode = selectedId === 'new';
  const showForm = selectedId !== null;

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <PortalPageHeader
        eyebrow="Cerebro de empresa"
        title={
          <span className="flex items-center gap-2">
            <span className="material-icons text-primary">description</span>
            Plantillas de notas
          </span>
        }
        subtitle={
          <>
            Cuerpos de nota reutilizables con{' '}
            <code className="px-1 py-0.5 rounded bg-muted text-foreground text-xs">{'{{variable}}'}</code>{' '}
            marcadores. Aplícalos manualmente, según una programación o al crear una reunión.
          </>
        }
        actions={
          <>
            <Link href="/portal/brain/knowledge" className={pBtnGhost}>
              <span className="material-icons text-base">arrow_back</span>
              Conocimiento
            </Link>
            <button type="button" onClick={handleNew} className={pBtnPrimary}>
              <span className="material-icons text-base">add</span>Nueva plantilla</button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* List pane */}
        <aside className={`${pCard} overflow-hidden`}>
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Plantillas</span>
            <span className="text-xs text-muted-foreground">{items?.length ?? 0}</span>
          </div>

          {items === null && !loadError && (
            <div className="px-3 py-6 flex items-center gap-2 text-sm text-muted-foreground">
              <span className="material-icons animate-spin text-base">autorenew</span>
              Cargando plantillas…
            </div>
          )}

          {loadError && (
            <div className="px-3 py-4 text-sm text-red-500">
              <span className="material-icons text-base align-text-bottom mr-1">error</span>
              {loadError}
            </div>
          )}

          {items !== null && !loadError && items.length === 0 && (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              Aún no hay plantillas: crea la primera para poder generar notas a partir de plantillas.
            </div>
          )}

          {items !== null && items.length > 0 && (
            <ul className="divide-y divide-border">
              {items.map((tpl) => {
                const isActive = selectedId === tpl.id;
                const tags = tpl.defaultTags ?? [];
                return (
                  <li key={tpl.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(tpl.id)}
                      className={`w-full text-left px-3 py-3 hover:bg-accent transition-colors ${
                        isActive ? 'bg-accent' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-foreground truncate flex-1">
                          {tpl.name}
                        </span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${TRIGGER_BADGE[tpl.trigger]}`}>
                          {tpl.trigger}
                        </span>
                        {!tpl.enabled && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                            desactivada
                          </span>
                        )}
                      </div>
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {tags.slice(0, 4).map((t) => (
                            <span key={t} className={`${pChip} text-[10px] py-0.5 px-1.5`}>
                              {t}
                            </span>
                          ))}
                          {tags.length > 4 && (
                            <span className="text-[10px] text-muted-foreground">+{tags.length - 4}</span>
                          )}
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Edit pane */}
        <section className="min-w-0">
          {!showForm && (
            <div className={`${pCard} p-10 text-center`}>
              <span className="material-icons text-5xl text-muted-foreground">description</span>
              <h2 className={`mt-3 ${pSectionTitle}`}>Selecciona una plantilla para editar</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Elige una de la lista o haz clic en <span className="font-medium text-foreground">Nueva plantilla</span> para empezar de cero.
              </p>
              {items !== null && items.length === 0 && (
                <button type="button" onClick={handleNew} className={`mt-4 ${pBtnPrimary}`}>
                  <span className="material-icons text-base">add</span>
                  Crea tu primera plantilla
                </button>
              )}
            </div>
          )}

          {showForm && (
            <div className={`${pCard} p-6`}>
              <div className="flex items-center justify-between mb-4">
                <h2 className={pSectionTitle}>
                  {isNewMode ? 'Nueva plantilla' : 'Editar plantilla'}
                </h2>
                {selectedTemplate && (
                  <span className="text-xs text-muted-foreground">
                    Actualizada {new Date(selectedTemplate.updatedAt).toLocaleString()}
                  </span>
                )}
              </div>

              <div className="space-y-5">
                {/* Name */}
                <div>
                  <label htmlFor="tpl-name" className="block font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-1.5">Nombre</label>
                  <input
                    id="tpl-name"
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    maxLength={150}
                    placeholder="Reunión diaria"
                    className={pInput}
                  />
                </div>

                {/* Trigger */}
                <div>
                  <span className="block font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
                    Disparador
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {TRIGGERS.map((t) => {
                      const active = form.trigger === t.value;
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setForm({ ...form, trigger: t.value })}
                          className={`flex flex-col items-start gap-1 px-3 py-2 rounded-xl border text-left transition-colors ${
                            active
                              ? 'border-primary bg-primary/10 text-foreground'
                              : 'border-border bg-card hover:bg-accent text-foreground'
                          }`}
                        >
                          <span className="flex items-center gap-1.5 text-sm font-medium">
                            <span className="material-icons text-base">{t.icon}</span>
                            {t.label}
                          </span>
                          <span className="text-[11px] text-muted-foreground leading-tight">
                            {t.hint}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Enabled + Default tags row */}
                <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4">
                  <label className="inline-flex items-center gap-2 self-start mt-6">
                    <input
                      type="checkbox"
                      checked={form.enabled}
                      onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    <span className="text-sm">Activado</span>
                  </label>

                  <div>
                    <label htmlFor="tpl-tags" className="block font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
                      Etiquetas predeterminadas
                    </label>
                    <input
                      id="tpl-tags"
                      type="text"
                      value={form.defaultTagsInput}
                      onChange={(e) => setForm({ ...form, defaultTagsInput: e.target.value })}
                      placeholder="diario, standup, ing"
                      className={pInput}
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Separadas por comas. Se adjuntan a cada nota creada desde esta plantilla.
                    </p>
                  </div>
                </div>

                {/* Body + variable hints */}
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-4">
                  <div>
                    <label htmlFor="tpl-body" className="block font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-1.5">Cuerpo</label>
                    <textarea
                      id="tpl-body"
                      value={form.body}
                      onChange={(e) => setForm({ ...form, body: e.target.value })}
                      placeholder={'# {{today}}\n\n## Tareas abiertas\n{{open_tasks}}\n\n## Reuniones recientes\n{{recent_meetings}}'}
                      rows={18}
                      className={`${pInput} font-mono resize-y min-h-[300px]`}
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Cuerpo en Markdown. Las <code className="px-1 py-0.5 rounded bg-muted text-foreground text-xs">{'{{vars}}'}</code> se resuelven al aplicar la plantilla; las no reconocidas se dejan tal cual.
                    </p>
                  </div>

                  <aside className="rounded-2xl border border-border bg-muted/30 p-4 self-start">
                    <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-3 flex items-center gap-1.5">
                      <span className="material-icons text-sm text-primary">data_object</span>
                      Variables
                    </h3>
                    <ul className="space-y-2">
                      {VARIABLE_HINTS.map((v) => (
                        <li key={v.name}>
                          <code className="text-xs font-mono bg-background px-1.5 py-0.5 rounded border border-border text-foreground">
                            {v.name}
                          </code>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                            {v.description}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </aside>
                </div>

                {formError && (
                  <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 dark:bg-red-950/20 rounded-lg px-3 py-2">
                    <span className="material-icons text-base">error</span>
                    {formError}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className={pBtnPrimary}
                    >
                      {saving ? (
                        <>
                          <span className="material-icons text-base animate-spin">autorenew</span>
                          Guardando…
                        </>
                      ) : (
                        <>
                          <span className="material-icons text-base">save</span>
                          {isNewMode ? 'Crear plantilla' : 'Guardar cambios'}
                        </>
                      )}
                    </button>

                    {!isNewMode && selectedTemplate && (
                      <button
                        type="button"
                        onClick={handleTryIt}
                        disabled={tryingId !== null}
                        title="Crea una nueva nota a partir de esta plantilla y ábrela"
                        className={pBtnGhost}
                      >
                        {tryingId === selectedTemplate.id ? (
                          <>
                            <span className="material-icons text-base animate-spin">autorenew</span>
                            Aplicando…
                          </>
                        ) : (
                          <>
                            <span className="material-icons text-base">play_arrow</span>
                            Probar
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {!isNewMode && (
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-50"
                    >
                      <span className="material-icons text-base">delete_outline</span>Eliminar</button>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
