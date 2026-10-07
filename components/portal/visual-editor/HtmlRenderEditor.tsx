'use client';

/**
 * HtmlRenderEditor — settings-panel surface for the `html-render` block.
 *
 * Three sections, in order:
 *   1. Values form — what authors edit day-to-day. Tab fields split the form
 *      into ACF-style tabbed sections via `HtmlRenderTabbedForm`.
 *   2. Loop source — exposed when the template contains `data-loop="posts"`.
 *      Repeats the marked element once per matching post.
 *   3. Field schema — power-user view to rename labels, override types, set
 *      help text / validation / conditional logic, reorder, copy/paste/import/
 *      export the schema across blocks.
 *   4. HTML template — CodeMirror editor (with full-screen modal). Detection
 *      runs on every change so the schema stays in sync.
 *
 * Sub-components are extracted under `_components/html-render/`. This file
 * owns the top-level composition and the inline field-schema drag-reorder
 * DndContext (the sortable context for the schema rows themselves).
 *
 * Also re-exports `ImagePickerModal` for backwards compatibility — the
 * component now lives in `./ImagePickerModal.tsx` but the dynamic import in
 * `VisualEditorShell.tsx` has been updated to point there directly.
 */

import React from 'react';
import { DndContext, useSensor, useSensors, PointerSensor, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';

import { HtmlTemplateEditor } from '@/components/blocks/visual/HtmlTemplateEditor';
import { reconcileFields, countFieldUsage, renameFieldInTemplate, findOrphanReferences } from '@/lib/blocks/html-render-template';
import type { Block, HtmlRenderBlock, HtmlRenderField, HtmlRenderLoop, HtmlRenderConditional } from '@/types/blocks';

import { Field, SelectField, NumberField, CheckboxField, TextareaField } from './panel-fields';

import { HtmlRenderTabbedForm } from './_components/html-render/HtmlRenderTabbedForm';
import { HtmlRenderFullJson } from './_components/html-render/HtmlRenderFullJson';
import { HtmlRenderSchemaActions } from './_components/html-render/HtmlRenderSchemaActions';
import { SortableSchemaField } from './_components/html-render/SortableSchemaField';
import { HtmlRenderSubFieldsEditor } from './_components/html-render/HtmlRenderSubFieldsEditor';
import { HtmlRenderAddFieldMenu } from './_components/html-render/HtmlRenderAddFieldMenu';

// Re-export for backwards-compatibility: tests + any remaining imports that
// still reference this file's path for ImagePickerModal.
export { ImagePickerModal } from './ImagePickerModal';

type HtmlRenderValues = Record<string, string | Array<Record<string, string>> | Record<string, string>>;
type AnyHtmlRenderValue = string | Array<Record<string, string>> | Record<string, string>;

// ─── HtmlRenderEditor ────────────────────────────────────────────────────────
// Editing the template auto-reconciles the fields list (new vars added,
// removed vars dropped) but preserves the author's per-field customisations
// via reconcileFields().

export function HtmlRenderEditor({
  block,
  onUpdate,
  siteId,
}: {
  block: Block;
  onUpdate: (updates: Partial<Block>) => void;
  siteId?: number;
}) {
  const b = block as unknown as Record<string, unknown>;
  const html = (b.html as string) || '';
  const fields = (b.fields as HtmlRenderField[] | undefined) || [];
  const values = (b.values as HtmlRenderValues | undefined) || {};
  const loop = (b.loop as HtmlRenderLoop | undefined);
  const mediaApi = siteId ? `/api/portal/cms/websites/${siteId}/media` : '/api/portal/media';
  const hasLoopRegion = /\bdata-loop="posts"/.test(html);

  // FIX: useSensors hoisted to component body to comply with rules-of-hooks
  // (was previously called inline inside the conditional DndContext JSX for
  // the schema field drag-reorder section).
  const schemaSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const setHtml = (next: string) => {
    // Re-detect fields whenever the template changes; preserves any
    // author-tweaked label/type/options on existing fields.
    const reconciled = reconcileFields(next, fields);
    onUpdate({ html: next, fields: reconciled } as Partial<Block>);
  };

  const setValue = (name: string, value: string | Array<Record<string, string>> | Record<string, string>) => {
    onUpdate({ values: { ...values, [name]: value } } as Partial<Block>);
  };

  const setField = (idx: number, patch: Partial<HtmlRenderField>) => {
    const next = fields.map((f, i) => (i === idx ? { ...f, ...patch } : f));
    onUpdate({ fields: next } as Partial<Block>);
  };

  const setLoop = (patch: Partial<HtmlRenderLoop> | null) => {
    if (patch === null) {
      onUpdate({ loop: undefined } as Partial<Block>);
      return;
    }
    const next: HtmlRenderLoop = {
      source: 'posts',
      postType: '',
      limit: 3,
      orderBy: 'recent',
      ...(loop || {}),
      ...patch,
    };
    onUpdate({ loop: next } as Partial<Block>);
  };

  return (
    <>
      <SelectField
        label="Ancho"
        value={(b.width as string) || 'full'}
        options={['full', 'contained']}
        onChange={(v) => onUpdate({ width: v } as Partial<Block>)}
      />

      {/* Values form — what authors actually edit day-to-day. Above the
          template editor since it's the most-used surface. Tab fields split
          the form into tabbed sections (ACF-style). */}
      {fields.length > 0 && (
        <details open className="rounded border border-border">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-foreground bg-accent/40 hover:bg-accent/60 flex items-center gap-1.5">
            <span className="material-icons text-sm">tune</span>Contenido</summary>
          <HtmlRenderTabbedForm
            fields={fields}
            values={values}
            onChange={(name, val) => setValue(name, val)}
            mediaApi={mediaApi}
            siteId={siteId}
          />
        </details>
      )}

      {/* Loop source — exposes when the template contains a data-loop region.
          Repeats the marked element once per matching post so authors can
          build dynamic "Related X" lists without leaving the html-render
          model. Inside the loop, {{post.title}} / {{post.url}} /
          {{post.coverImage}} / {{post.values.X}} resolve per item. */}
      {(hasLoopRegion || loop) && (
        <details open={!loop?.postType} className="rounded border border-border">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-foreground bg-accent/40 hover:bg-accent/60 flex items-center gap-1.5">
            <span className="material-icons text-sm">dynamic_feed</span>
            Origen del bucle {loop?.postType ? `— ${loop.postType}` : ''}
            {hasLoopRegion && !loop?.postType && (
              <span
                className="ml-auto text-[10px] px-1.5 py-0.5 rounded font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300"
                title={'La plantilla tiene data-loop="posts" pero no un slug de tipo de contenido — al renderizar, los marcadores {{post.X}} aparecerán como texto literal. Define abajo un tipo de contenido.'}
              >
                <span className="material-icons text-sm align-middle">warning</span>
                {' '}sin configurar
              </span>
            )}
          </summary>
          <div className="p-3 space-y-3">
            {!hasLoopRegion && (
              <div className="rounded border border-amber-500/40 bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-900 dark:text-amber-100 leading-snug">
                No hay ningún <code className="font-mono">data-loop=&quot;posts&quot;</code> en la plantilla. Añade{' '}
                <code className="font-mono">data-loop=&quot;posts&quot;</code> al elemento que quieras repetir.
              </div>
            )}
            {hasLoopRegion && !loop?.postType && (
              <div className="rounded border border-amber-500/40 bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-900 dark:text-amber-100 leading-snug">
                <div className="flex items-start gap-1.5">
                  <span className="material-icons text-sm mt-0.5">warning</span>
                  <div>
                    La plantilla tiene una región <code className="font-mono">data-loop=&quot;posts&quot;</code> pero no hay un tipo de contenido seleccionado.
                    El renderizador emitirá la plantilla interna con los marcadores <code className="font-mono">{'{{post.X}}'}</code>
                    como texto literal. Define abajo el slug del tipo de contenido para expandir el bucle.
                  </div>
                </div>
              </div>
            )}
            <Field
              label="Slug del tipo de contenido"
              value={loop?.postType || ''}
              onChange={(v) => setLoop({ postType: v })}
            />
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Límite" value={loop?.limit ?? 3} min={1} max={24} onChange={(v) => setLoop({ limit: v })} />
              <SelectField label="Pedido" value={loop?.orderBy || 'recent'} options={['recent', 'oldest', 'title']} onChange={(v) => setLoop({ orderBy: v as HtmlRenderLoop['orderBy'] })} />
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Dentro del elemento del bucle usa{' '}
              <code className="bg-accent/40 px-1 rounded">{'{{post.title}}'}</code>,{' '}
              <code className="bg-accent/40 px-1 rounded">{'{{post.url}}'}</code>,{' '}
              <code className="bg-accent/40 px-1 rounded">{'{{post.coverImage}}'}</code>,{' '}
              <code className="bg-accent/40 px-1 rounded">{'{{post.excerpt}}'}</code>,{' '}
              <code className="bg-accent/40 px-1 rounded">{'{{post.values.X}}'}</code>{' '}(lee un valor del bloque html-render del contenido de destino), o{' '}
              <code className="bg-accent/40 px-1 rounded">{'{{post.fields.X}}'}</code>{' '}(lee un campo personalizado del CMS por su slug).
            </p>
            {loop && (
              <button
                type="button"
                onClick={() => setLoop(null)}
                className="text-xs text-destructive hover:underline"
              >
                Desactivar bucle (conservar el marcado)
              </button>
            )}
          </div>
        </details>
      )}

      {/* Field schema — for power users to rename labels, override types, set
          help text, add tabs, or reorder. Adding/removing schema-only fields
          (tabs, group containers without HTML markers) is also supported here.
          Toolbar at top has Copy / Paste / Export / Import schema actions for
          reusing field definitions across blocks (and across browsers via JSON). */}
      {fields.length > 0 && (() => {
        // Lint: surface template references that have no matching field
        // entry. Until this exists, a typo in `{{name}}` silently expands to
        // empty at render time with no signal in the editor. The badge in the
        // disclosure summary keeps the warning visible even when the schema
        // section is collapsed.
        const orphans = findOrphanReferences(html, fields);
        return (
        <details className="rounded border border-border">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-foreground bg-accent/40 hover:bg-accent/60 flex items-center gap-1.5">
            <span className="material-icons text-sm">schema</span>
            Esquema de campos ({fields.length})
            {orphans.length > 0 && (
              <span
                className="ml-auto text-[10px] px-1.5 py-0.5 rounded font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300"
                title={`Referenciados en la plantilla pero ausentes del esquema:\n  ${orphans.join('\n  ')}\n\nAñade los campos correspondientes abajo o elimina las referencias del HTML.`}
              >
                <span className="material-icons text-sm align-middle">warning</span>
                {' '}{orphans.length} sin definir
              </span>
            )}
          </summary>
          {orphans.length > 0 && (
            <div className="px-3 py-2 border-b border-amber-500/40 bg-amber-500/5 text-[11px] text-amber-900 dark:text-amber-100 leading-snug">
              <div className="flex items-start gap-1.5">
                <span className="material-icons text-sm mt-0.5">warning</span>
                <div className="flex-1">
                  <span className="font-medium">La plantilla referencia {orphans.length} campo{orphans.length === 1 ? '' : 's'} sin definir:</span>{' '}
                  {orphans.map((name, i) => (
                    <span key={name}>
                      <code className="font-mono bg-amber-500/15 px-1 rounded">{name}</code>
                      {i < orphans.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                  <div className="mt-1 text-amber-800 dark:text-amber-200/80">
                    Añade campos abajo o elimina referencias del HTML — las referencias sin definir se renderizan vacías.
                  </div>
                </div>
              </div>
            </div>
          )}
          <HtmlRenderSchemaActions
            block={block as HtmlRenderBlock}
            fields={fields}
            onApply={(updates) => onUpdate(updates as Partial<Block>)}
          />
          <DndContext
            sensors={schemaSensors}
            collisionDetection={closestCenter}
            onDragEnd={(e) => {
              const a = e.active.id as string;
              const o = e.over?.id as string | undefined;
              if (!o || a === o) return;
              const ai = fields.findIndex(f => f.name === a);
              const oi = fields.findIndex(f => f.name === o);
              if (ai < 0 || oi < 0) return;
              onUpdate({ fields: arrayMove(fields, ai, oi) } as Partial<Block>);
            }}
          >
            <SortableContext items={fields.map(f => f.name)} strategy={verticalListSortingStrategy}>
              <div className="p-3 space-y-3">
                {fields.map((f, i) => {
                  const usage = countFieldUsage(html, f.name);
                  return (
                  <SortableSchemaField key={f.name} id={f.name}>
                  {(dragHandleProps) => (
                  <div className="rounded border border-border p-2 space-y-2 bg-card">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        title="Arrastra para reordenar"
                        className="cursor-grab active:cursor-grabbing p-0.5 rounded text-muted-foreground/60 hover:bg-accent hover:text-foreground"
                        {...dragHandleProps}
                      >
                        <span className="material-icons text-sm">drag_indicator</span>
                      </button>
                      <code className="flex-1 text-xs text-muted-foreground truncate" title={f.name}>{f.name}</code>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      usage === 0
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    }`}
                    title={usage === 0 ? 'Sin referencias en la plantilla — añade {{' + f.name + '}} o data-field="' + f.name + '" para usar este campo' : `Referenciado ${usage}× en la plantilla`}
                  >
                    {usage === 0 ? 'sin usar' : `${usage}×`}
                  </span>
                  <button
                    type="button"
                    title="Renombrar la clave del campo (también reescribe las referencias de la plantilla)"
                    onClick={() => {
                      const next = window.prompt(`Renombrar la clave del campo "${f.name}" a:`, f.name);
                      if (!next || next === f.name) return;
                      if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(next)) { window.alert('Las claves de campo deben empezar por una letra o guion bajo y contener solo letras, números, guiones o guiones bajos.'); return; }
                      if (fields.some(o => o.name === next)) { window.alert(`Ya existe un campo llamado "${next}".`); return; }
                      const newFields = fields.map((fld, idx) => idx === i ? { ...fld, name: next } : fld);
                      const newValues: HtmlRenderValues = { ...values };
                      if (f.name in newValues) {
                        newValues[next] = newValues[f.name];
                        delete newValues[f.name];
                      }
                      const { template: newHtml, replacements } = renameFieldInTemplate(html, f.name, next);
                      onUpdate({ fields: newFields, values: newValues, html: newHtml } as Partial<Block>);
                      if (replacements > 0) console.log(`[html-render] renamed ${f.name} → ${next} (${replacements} template refs updated)`);
                    }}
                    className="p-0.5 rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <span className="material-icons text-sm">edit</span>
                  </button>
                      <button
                        type="button"
                        title="Eliminar campo (también borra su valor; quizá quieras quitar el {{name}} o data-field correspondiente de la plantilla)"
                        onClick={() => {
                          const next = fields.filter((_, idx) => idx !== i);
                          const nextValues = { ...values };
                          delete nextValues[f.name];
                          onUpdate({ fields: next, values: nextValues } as Partial<Block>);
                        }}
                        className="p-0.5 rounded text-destructive hover:bg-destructive/10"
                      >
                        <span className="material-icons text-sm">delete_outline</span>
                      </button>
                    </div>
                    <Field label="Etiqueta" value={f.label || ''} onChange={(val) => setField(i, { label: val })} />
                <SelectField
                  label="Tipo"
                  value={f.type}
                  options={['text', 'textarea', 'number', 'richtext', 'boolean', 'url', 'image', 'color', 'select', 'radio', 'date', 'datetime', 'link', 'post', 'array', 'group', 'tab']}
                  onChange={(val) => setField(i, { type: val as HtmlRenderField['type'] })}
                />
                {(f.type === 'array' || f.type === 'group') && (
                  <HtmlRenderSubFieldsEditor
                    parentField={f}
                    onChange={(next) => setField(i, { itemFields: next })}
                  />
                )}
                {(f.type === 'select' || f.type === 'radio') && (
                  <TextareaField
                    label="Opciones (una por línea)"
                    value={(f.options || []).join('\n')}
                    onChange={(val) => setField(i, { options: val.split('\n').map((s) => s.trim()).filter(Boolean) })}
                    rows={3}
                  />
                )}
                {f.type === 'post' && (
                  <Field
                    label="Restringir al tipo de contenido (opcional)"
                    value={f.postType || ''}
                    onChange={(val) => setField(i, { postType: val || undefined })}
                  />
                )}
                {f.type === 'number' && (
                  <div className="grid grid-cols-3 gap-2">
                    <NumberField label="Mín." value={f.min ?? 0} onChange={(v) => setField(i, { min: v })} />
                    <NumberField label="Máx." value={f.max ?? 0} onChange={(v) => setField(i, { max: v })} />
                    <NumberField label="Paso" value={f.step ?? 1} onChange={(v) => setField(i, { step: v })} />
                  </div>
                )}
                {f.type !== 'tab' && (
                  <Field label="Predeterminado" value={f.default || ''} onChange={(val) => setField(i, { default: val })} />
                )}
                <Field label="Texto de ayuda" value={f.help || ''} onChange={(val) => setField(i, { help: val || undefined })} />

                {/* Validation rules */}
                {f.type !== 'tab' && f.type !== 'array' && f.type !== 'group' && (
                  <details className="border-t border-border pt-2">
                    <summary className="cursor-pointer select-none text-[11px] font-medium text-muted-foreground hover:text-foreground">Validación</summary>
                    <div className="pt-2 space-y-2">
                      <CheckboxField label="Obligatorio" checked={f.required} onChange={(v) => setField(i, { required: v || undefined })} />
                      {(f.type === 'text' || f.type === 'textarea' || f.type === 'richtext') && (
                        <div className="grid grid-cols-2 gap-2">
                          <NumberField label="Longitud mínima" value={f.minLength ?? 0} onChange={(v) => setField(i, { minLength: v || undefined })} />
                          <NumberField label="Longitud máxima" value={f.maxLength ?? 0} onChange={(v) => setField(i, { maxLength: v || undefined })} />
                        </div>
                      )}
                      {(f.type === 'text' || f.type === 'url') && (
                        <Field label="Patrón (regex)" value={f.pattern || ''} onChange={(v) => setField(i, { pattern: v || undefined })} />
                      )}
                      <Field label="Mensaje de error personalizado" value={f.errorMessage || ''} onChange={(v) => setField(i, { errorMessage: v || undefined })} />
                    </div>
                  </details>
                )}

                {/* Conditional show/hide */}
                {f.type !== 'tab' && (
                  <details className="border-t border-border pt-2">
                    <summary className="cursor-pointer select-none text-[11px] font-medium text-muted-foreground hover:text-foreground">
                      Lógica condicional{f.conditional ? ' (activo)' : ''}
                    </summary>
                    <div className="pt-2 space-y-2">
                      <SelectField
                        label="Mostrar este campo cuando"
                        value={f.conditional ? 'enabled' : 'always'}
                        options={['always', 'enabled']}
                        onChange={(v) => {
                          if (v === 'always') setField(i, { conditional: undefined });
                          else if (!f.conditional) setField(i, { conditional: { field: '', operator: 'truthy' } });
                        }}
                      />
                      {f.conditional && (
                        <>
                          <SelectField
                            label="Campo"
                            value={f.conditional.field}
                            options={['', ...fields.filter(other => other.name !== f.name && other.type !== 'tab').map(other => other.name)]}
                            onChange={(v) => setField(i, { conditional: { ...f.conditional!, field: v } })}
                          />
                          <SelectField
                            label="Operador"
                            value={f.conditional.operator}
                            options={['truthy', 'falsy', 'eq', 'neq', 'in', 'notIn']}
                            onChange={(v) => setField(i, { conditional: { ...f.conditional!, operator: v as HtmlRenderConditional['operator'] } })}
                          />
                          {(f.conditional.operator === 'eq' || f.conditional.operator === 'neq') && (
                            <Field label="Valor" value={f.conditional.value || ''} onChange={(v) => setField(i, { conditional: { ...f.conditional!, value: v } })} />
                          )}
                          {(f.conditional.operator === 'in' || f.conditional.operator === 'notIn') && (
                            <Field label="Valores (separados con |, p. ej. a|b|c)" value={f.conditional.value || ''} onChange={(v) => setField(i, { conditional: { ...f.conditional!, value: v } })} />
                          )}
                        </>
                      )}
                    </div>
                  </details>
                )}
                  </div>
                  )}
                  </SortableSchemaField>
                  );
                })}

                {/* Add field — quick presets for common shapes. The "Empty…" entry
                    creates a bare text field; the rest insert a typed field with
                    sensible defaults so authors can start with the right input. */}
                <HtmlRenderAddFieldMenu
                  existingNames={fields.map(f => f.name)}
                  onAdd={(field) => onUpdate({ fields: [...fields, field] } as Partial<Block>)}
                />
              </div>
            </SortableContext>
          </DndContext>
        </details>
        );
      })()}

      {/* Template editor — the source HTML. Detection runs on every change
          so the fields list above stays in sync. CodeMirror with HTML syntax
          highlighting + an "Expand" button that opens a full-screen modal
          with the same editor for serious editing sessions. */}
      <details className="rounded border border-border">
        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-foreground bg-accent/40 hover:bg-accent/60 flex items-center gap-1.5">
          <span className="material-icons text-sm">code</span>Plantilla HTML</summary>
        <div className="p-3 space-y-2">
          <HtmlTemplateEditor value={html} onChange={setHtml} />
          <p className="text-[11px] text-muted-foreground leading-snug">
            <code className="bg-accent/40 px-1 rounded">{'{{name}}'}</code> para sustituir atributos/texto.{' '}
            <code className="bg-accent/40 px-1 rounded">data-field=&quot;name&quot;</code> en un elemento para que su HTML interno sea editable en línea.{' '}
            <code className="bg-accent/40 px-1 rounded">data-repeat=&quot;name&quot;</code> se repite por cada elemento del array.{' '}
            <code className="bg-accent/40 px-1 rounded">data-group=&quot;name&quot;</code> envuelve un único objeto anidado.{' '}
            Dentro de repeticiones/grupos: <code className="bg-accent/40 px-1 rounded">{'{{name.subfield}}'}</code> +{' '}
            <code className="bg-accent/40 px-1 rounded">data-field=&quot;subfield&quot;</code>.
          </p>
        </div>
      </details>

      {/* Full block JSON — html + fields + loop + values + width in one blob.
          Copy/paste between blocks, environments, or into source control.
          Distinct from the schema export above, which intentionally drops
          `values` so recipients start blank. */}
      <HtmlRenderFullJson
        block={block as HtmlRenderBlock}
        onApply={(updates) => onUpdate(updates as Partial<Block>)}
      />
    </>
  );
}
