'use client';

import { useMemo } from 'react';
import type {
  SurveyRecommendationConfig,
  SurveyRecommendationOffering,
  SurveyRecommendationQuestion,
  SurveyRecommendationHybridRule,
} from '@/lib/db/schema';

type SurveyField = {
  id: string;
  type: string;
  label: string;
  options: string[];
};

interface Props {
  config: SurveyRecommendationConfig | undefined;
  surveyFields: SurveyField[];
  onChange: (next: SurveyRecommendationConfig | undefined) => void;
}

const EMPTY_CONFIG: SurveyRecommendationConfig = {
  offerings: [],
  questions: [],
  bookUrl: '',
};

// Only field types whose answers are a fixed set of option texts can drive
// vote-based routing. Free-text questions don't fit this model.
function isRoutableField(f: SurveyField): boolean {
  return (f.type === 'radio' || f.type === 'select') && f.options.length > 0;
}

export function SurveyRecommendationEditor({ config, surveyFields, onChange }: Props) {
  const c = config ?? EMPTY_CONFIG;
  const routableFields = useMemo(() => surveyFields.filter(isRoutableField), [surveyFields]);

  function patch(updates: Partial<SurveyRecommendationConfig>) {
    onChange({ ...c, ...updates });
  }

  // ─── Offerings ───────────────────────────────────────────────────────────
  function addOffering() {
    const key = `offering-${Date.now().toString(36)}`;
    patch({
      offerings: [
        ...c.offerings,
        { key, name: 'Nueva oferta', tagline: '', youGet: '', price: '', duration: '' },
      ],
    });
  }
  function updateOffering(idx: number, updates: Partial<SurveyRecommendationOffering>) {
    const offerings = [...c.offerings];
    const prev = offerings[idx];
    const next = { ...prev, ...updates };
    offerings[idx] = next;
    // Auto-rename references when the key changes — otherwise optionToOffering /
    // overrides / hybrid all silently break.
    if (updates.key && updates.key !== prev.key) {
      const oldKey = prev.key;
      const newKey = updates.key;
      const renameInRecord = (r: Record<string, string>) => Object.fromEntries(
        Object.entries(r).map(([k, v]) => [k, v === oldKey ? newKey : v]),
      );
      onChange({
        ...c,
        offerings,
        questions: c.questions.map(q => ({ ...q, optionToOffering: renameInRecord(q.optionToOffering) })),
        overrides: c.overrides?.map(o => ({
          ...o,
          forceOfferingKey: o.forceOfferingKey === oldKey ? newKey : o.forceOfferingKey,
        })),
        hybrid: c.hybrid
          ? { ...c.hybrid, offeringKeys: c.hybrid.offeringKeys.map(k => k === oldKey ? newKey : k) }
          : undefined,
        alwaysAlsoOfferingKey: c.alwaysAlsoOfferingKey === oldKey ? newKey : c.alwaysAlsoOfferingKey,
      });
      return;
    }
    patch({ offerings });
  }
  function removeOffering(idx: number) {
    if (!confirm('¿Quitar esta oferta? Las referencias a ella en el enrutado y las anulaciones quedarán huérfanas.')) return;
    patch({ offerings: c.offerings.filter((_, i) => i !== idx) });
  }

  // ─── Question routing ────────────────────────────────────────────────────
  function getQuestion(fieldId: string): SurveyRecommendationQuestion | undefined {
    return c.questions.find(q => q.fieldId === fieldId);
  }
  function upsertQuestion(fieldId: string, updates: Partial<SurveyRecommendationQuestion>) {
    const existing = getQuestion(fieldId);
    if (existing) {
      patch({ questions: c.questions.map(q => q.fieldId === fieldId ? { ...q, ...updates } : q) });
    } else {
      patch({
        questions: [
          ...c.questions,
          { fieldId, context: {}, optionToOffering: {}, ...updates },
        ],
      });
    }
  }
  function setOptionVote(fieldId: string, option: string, offeringKey: string) {
    const q = getQuestion(fieldId);
    const optionToOffering = { ...(q?.optionToOffering ?? {}) };
    if (offeringKey) optionToOffering[option] = offeringKey;
    else delete optionToOffering[option];
    upsertQuestion(fieldId, { optionToOffering });
  }
  function setOptionContext(fieldId: string, option: string, phrase: string) {
    const q = getQuestion(fieldId);
    const context = { ...(q?.context ?? {}) };
    if (phrase) context[option] = phrase;
    else delete context[option];
    upsertQuestion(fieldId, { context });
  }

  // ─── Overrides ───────────────────────────────────────────────────────────
  function addOverride() {
    patch({
      overrides: [
        ...(c.overrides ?? []),
        { whenAnyAnswer: [], forceOfferingKey: c.offerings[0]?.key ?? '' },
      ],
    });
  }
  function updateOverride(idx: number, updates: Partial<NonNullable<SurveyRecommendationConfig['overrides']>[number]>) {
    const overrides = [...(c.overrides ?? [])];
    overrides[idx] = { ...overrides[idx], ...updates };
    patch({ overrides });
  }
  function removeOverride(idx: number) {
    patch({ overrides: (c.overrides ?? []).filter((_, i) => i !== idx) });
  }

  // ─── Hybrid ──────────────────────────────────────────────────────────────
  function enableHybrid() {
    if (c.hybrid) return;
    patch({
      hybrid: { whenAnswers: {}, title: '', body: '', offeringKeys: [] },
    });
  }
  function updateHybrid(updates: Partial<SurveyRecommendationHybridRule>) {
    if (!c.hybrid) return;
    patch({ hybrid: { ...c.hybrid, ...updates } });
  }
  function disableHybrid() {
    patch({ hybrid: undefined });
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  // No config yet — show a single CTA to create one.
  if (!config) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <span className="material-icons text-3xl text-muted-foreground/60 mb-2 block">recommend</span>
        <p className="text-sm font-medium text-foreground">No hay diapositiva de recomendación configurada</p>
        <p className="text-xs text-muted-foreground mt-1 mb-4">
          Una recomendación se muestra después del agradecimiento de la encuesta y calcula una oferta principal a partir de las respuestas del encuestado.
        </p>
        <button
          onClick={() => onChange({ offerings: [], questions: [], bookUrl: '' })}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-foreground text-background rounded-lg hover:bg-foreground/90 transition-colors"
        >
          <span className="material-icons text-base">add</span>
          Añadir recomendación
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ─── Header ─── */}
      <Card title="Encabezado y CTA" icon="title">
        <Field label="Antetítulo" hint="Etiqueta pequeña sobre el titular">
          <input
            type="text"
            value={c.eyebrow ?? ''}
            onChange={e => patch({ eyebrow: e.target.value })}
            className={inputCls}
            placeholder="p. ej. Aquí es donde aterriza esto"
          />
        </Field>
        <Field
          label="Plantilla de narrativa"
          hint="Admite {{primary}} (nombre de la oferta) y {{q1Context}}, {{q2Context}}, … (frases de contexto por pregunta)"
        >
          <textarea
            value={c.narrativeTemplate ?? ''}
            onChange={e => patch({ narrativeTemplate: e.target.value })}
            rows={3}
            className={`${inputCls} resize-none font-mono text-xs`}
            placeholder="Eres {{q1Context}}, {{q3Context}}. Según eso, **{{primary}}** es el punto de partida adecuado."
          />
        </Field>
        <Field label="URL de reserva" hint="A dónde enlaza el botón principal de CTA">
          <input
            type="url"
            value={c.bookUrl ?? ''}
            onChange={e => patch({ bookUrl: e.target.value })}
            className={inputCls}
            placeholder="https://calendly.com/..."
          />
        </Field>
        <Field label="Oferta siempre incluida" hint="Tarjeta de respaldo opcional que se muestra junto a la recomendación principal">
          <select
            value={c.alwaysAlsoOfferingKey ?? ''}
            onChange={e => patch({ alwaysAlsoOfferingKey: e.target.value || undefined })}
            className={inputCls}
          >
            <option value="">— Ninguna —</option>
            {c.offerings.map(o => (
              <option key={o.key} value={o.key}>{o.name} ({o.key})</option>
            ))}
          </select>
        </Field>
      </Card>

      {/* ─── Offerings ─── */}
      <Card
        title={`Ofertas (${c.offerings.length})`}
        icon="inventory_2"
        action={
          <button onClick={addOffering} className={btnSecondaryCls}>
            <span className="material-icons text-sm">add</span>
            Añadir oferta
          </button>
        }
      >
        {c.offerings.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Aún no hay ofertas. Añade una para empezar a dirigir respuestas a recomendaciones.
          </p>
        ) : (
          <div className="space-y-3">
            {c.offerings.map((off, idx) => (
              <div key={idx} className="border border-border rounded-lg p-3 space-y-2 bg-background/50">
                <div className="flex items-start gap-2">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <Field label="Clave" hint="Id estable que usan las reglas de enrutado" inline>
                      <input
                        type="text"
                        value={off.key}
                        onChange={e => updateOffering(idx, { key: e.target.value })}
                        className={`${inputCls} font-mono`}
                      />
                    </Field>
                    <Field label="Nombre" inline>
                      <input
                        type="text"
                        value={off.name}
                        onChange={e => updateOffering(idx, { name: e.target.value })}
                        className={inputCls}
                      />
                    </Field>
                  </div>
                  <button
                    onClick={() => removeOffering(idx)}
                    className="mt-5 p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    title="Quitar oferta"
                  >
                    <span className="material-icons text-base">delete</span>
                  </button>
                </div>
                <Field label="Eslogan" inline>
                  <textarea
                    value={off.tagline}
                    onChange={e => updateOffering(idx, { tagline: e.target.value })}
                    rows={2}
                    className={`${inputCls} resize-none`}
                  />
                </Field>
                <Field label="Qué incluye" inline>
                  <textarea
                    value={off.youGet}
                    onChange={e => updateOffering(idx, { youGet: e.target.value })}
                    rows={2}
                    className={`${inputCls} resize-none`}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Precio" inline>
                    <input
                      type="text"
                      value={off.price}
                      onChange={e => updateOffering(idx, { price: e.target.value })}
                      className={inputCls}
                      placeholder="$7,500"
                    />
                  </Field>
                  <Field label="Duración" inline>
                    <input
                      type="text"
                      value={off.duration}
                      onChange={e => updateOffering(idx, { duration: e.target.value })}
                      className={inputCls}
                      placeholder="3-4 semanas"
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ─── Question Routing ─── */}
      <Card title="Enrutado de preguntas" icon="route">
        {routableFields.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            No hay preguntas de opción única o selección en esta encuesta. El enrutado requiere preguntas con opciones fijas.
          </p>
        ) : (
          <div className="space-y-4">
            {routableFields.map(field => {
              const q = getQuestion(field.id);
              return (
                <details key={field.id} open className="group">
                  <summary className="cursor-pointer flex items-center gap-2 py-1.5 -mx-1 px-1 rounded hover:bg-accent/50">
                    <span className="material-icons text-sm text-muted-foreground transition-transform group-open:rotate-90">chevron_right</span>
                    <span className="font-mono text-xs text-muted-foreground">{field.id}</span>
                    <span className="text-sm text-foreground truncate">{field.label}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {Object.keys(q?.optionToOffering ?? {}).length}/{field.options.length} enrutadas
                    </span>
                  </summary>
                  <div className="mt-2 pl-6 space-y-2">
                    {field.options.map(option => (
                      <div key={option} className="border border-border rounded-md p-2 space-y-1.5 bg-background/30">
                        <p className="text-xs text-foreground line-clamp-2" title={option}>{option}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground">Frase de contexto</label>
                            <input
                              type="text"
                              value={q?.context?.[option] ?? ''}
                              onChange={e => setOptionContext(field.id, option, e.target.value)}
                              className={`${inputCls} text-xs`}
                              placeholder="rellena {{q1Context}}, etc."
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground">Vota por la oferta</label>
                            <select
                              value={q?.optionToOffering?.[option] ?? ''}
                              onChange={e => setOptionVote(field.id, option, e.target.value)}
                              className={`${inputCls} text-xs`}
                            >
                              <option value="">— Sin voto —</option>
                              {c.offerings.map(o => (
                                <option key={o.key} value={o.key}>{o.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </Card>

      {/* ─── Overrides ─── */}
      <Card
        title={`Anulaciones (${c.overrides?.length ?? 0})`}
        icon="priority_high"
        action={
          <button onClick={addOverride} className={btnSecondaryCls}>
            <span className="material-icons text-sm">add</span>
            Añadir anulación
          </button>
        }
      >
        <p className="text-xs text-muted-foreground mb-2">
          Fuerza una oferta concreta como principal cuando coincida cualquiera de estas respuestas. Gana la primera anulación que coincida.
        </p>
        {(c.overrides ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Sin anulaciones.</p>
        ) : (
          <div className="space-y-3">
            {(c.overrides ?? []).map((ov, idx) => (
              <div key={idx} className="border border-border rounded-lg p-3 bg-background/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">Anulación {idx + 1}</span>
                  <button
                    onClick={() => removeOverride(idx)}
                    className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    title="Quitar"
                  >
                    <span className="material-icons text-sm">delete</span>
                  </button>
                </div>
                <Field label="Forzar oferta" inline>
                  <select
                    value={ov.forceOfferingKey}
                    onChange={e => updateOverride(idx, { forceOfferingKey: e.target.value })}
                    className={inputCls}
                  >
                    <option value="">— Seleccionar —</option>
                    {c.offerings.map(o => (
                      <option key={o.key} value={o.key}>{o.name} ({o.key})</option>
                    ))}
                  </select>
                </Field>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Cuando coincida cualquiera de estas respuestas:</label>
                  <div className="space-y-1.5">
                    {routableFields.map(field => {
                      const matchedValues = ov.whenAnyAnswer.find(w => w.fieldId === field.id)?.values ?? [];
                      return (
                        <details key={field.id} className="border border-border rounded">
                          <summary className="cursor-pointer text-xs px-2 py-1 hover:bg-accent/50 flex items-center gap-2">
                            <span className="material-icons text-xs text-muted-foreground">chevron_right</span>
                            <span className="font-mono text-muted-foreground">{field.id}</span>
                            <span className="truncate">{field.label}</span>
                            {matchedValues.length > 0 && (
                              <span className="ml-auto text-[10px] bg-primary/10 text-primary px-1.5 rounded">{matchedValues.length}</span>
                            )}
                          </summary>
                          <div className="p-2 space-y-1">
                            {field.options.map(option => {
                              const checked = matchedValues.includes(option);
                              return (
                                <label key={option} className="flex items-start gap-2 text-xs cursor-pointer hover:bg-accent/30 rounded p-1">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={e => {
                                      const newValues = e.target.checked
                                        ? [...matchedValues, option]
                                        : matchedValues.filter(v => v !== option);
                                      const others = ov.whenAnyAnswer.filter(w => w.fieldId !== field.id);
                                      const next = newValues.length > 0
                                        ? [...others, { fieldId: field.id, values: newValues }]
                                        : others;
                                      updateOverride(idx, { whenAnyAnswer: next });
                                    }}
                                    className="mt-0.5 rounded border-border"
                                  />
                                  <span className="text-foreground">{option}</span>
                                </label>
                              );
                            })}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ─── Hybrid ─── */}
      <Card
        title="Regla híbrida"
        icon="merge"
        action={c.hybrid ? (
          <button onClick={disableHybrid} className={btnSecondaryCls}>
            <span className="material-icons text-sm">close</span>Desactivar</button>
        ) : (
          <button onClick={enableHybrid} className={btnSecondaryCls}>
            <span className="material-icons text-sm">add</span>Activar</button>
        )}
      >
        <p className="text-xs text-muted-foreground mb-2">
          Muestra una tarjeta híbrida combinada cuando coincida exactamente este conjunto de respuestas.
        </p>
        {!c.hybrid ? (
          <p className="text-xs text-muted-foreground text-center py-4">Sin regla híbrida.</p>
        ) : (
          <div className="space-y-2">
            <Field label="Título" inline>
              <input
                type="text"
                value={c.hybrid.title}
                onChange={e => updateHybrid({ title: e.target.value })}
                className={inputCls}
                placeholder="p. ej. Una instantánea de la hoja de ruta."
              />
            </Field>
            <Field label="Cuerpo" inline>
              <textarea
                value={c.hybrid.body}
                onChange={e => updateHybrid({ body: e.target.value })}
                rows={3}
                className={`${inputCls} resize-none`}
              />
            </Field>
            <Field label="Ofertas que mostrar (en orden)" inline>
              <div className="space-y-1">
                {c.offerings.map(o => {
                  const idx = c.hybrid!.offeringKeys.indexOf(o.key);
                  const checked = idx >= 0;
                  return (
                    <label key={o.key} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-accent/30 rounded p-1">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => {
                          const keys = e.target.checked
                            ? [...c.hybrid!.offeringKeys, o.key]
                            : c.hybrid!.offeringKeys.filter(k => k !== o.key);
                          updateHybrid({ offeringKeys: keys });
                        }}
                        className="rounded border-border"
                      />
                      <span className="text-foreground">{o.name}</span>
                      {checked && (
                        <span className="ml-auto text-[10px] text-muted-foreground">#{idx + 1}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </Field>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">
                Respuestas requeridas (TODAS deben coincidir para que se active la regla híbrida):
              </label>
              <div className="space-y-1.5">
                {routableFields.map(field => (
                  <div key={field.id} className="grid grid-cols-[auto_1fr] gap-2 items-center">
                    <span className="text-xs font-mono text-muted-foreground">{field.id}</span>
                    <select
                      value={c.hybrid!.whenAnswers[field.id] ?? ''}
                      onChange={e => {
                        const next = { ...c.hybrid!.whenAnswers };
                        if (e.target.value) next[field.id] = e.target.value;
                        else delete next[field.id];
                        updateHybrid({ whenAnswers: next });
                      }}
                      className={`${inputCls} text-xs`}
                    >
                      <option value="">— Cualquiera —</option>
                      {field.options.map(opt => (
                        <option key={opt} value={opt}>{opt.length > 60 ? opt.slice(0, 60) + '…' : opt}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Local UI helpers (kept inline so the editor stays a single file) ───────

const inputCls = 'w-full px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50';
const btnSecondaryCls = 'inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-border rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors';

function Card({ title, icon, action, children }: { title: string; icon: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="material-icons text-base text-primary">{icon}</span>
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({ label, hint, inline, children }: { label: string; hint?: string; inline?: boolean; children: React.ReactNode }) {
  return (
    <div className={inline ? 'space-y-0.5' : 'space-y-1 mb-2'}>
      <label className="text-[10px] text-muted-foreground block">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}
