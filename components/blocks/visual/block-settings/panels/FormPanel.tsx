'use client';

// FormPanel: dispatcher for related block types' settings panels.
import type { Block, ButtonBlock, SurveyBlock, SurveyInputBlock, EmailHeaderBlock, EmailFooterBlock, BookingMenuBlock, SurveyResultsBlock, BookingBlock, PopupBlock } from '@/types/blocks';
import type { Breakpoint } from '@/types/responsive';
import { useState, useEffect, useRef } from 'react';
import { RichTextEditable } from '@/components/blocks/visual/RichTextEditable';
import { SurveyResultsBlockSettings } from './SurveyResultsSettings';
import { BookingBlockSettings } from './BookingSettings';
import { TokenColorPicker } from '@/components/blocks/visual/TokenColorPicker';

interface PanelProps {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
  currentViewport: Breakpoint;
}

export function FormPanel({ block, onChange, currentViewport }: PanelProps) {
  switch (block.type) {
    case 'button':
      return <ButtonBlockSettings block={block as ButtonBlock} onChange={onChange as (u: Partial<ButtonBlock>) => void} currentViewport={currentViewport} />;
    case 'booking':
      return <BookingBlockSettings block={block as BookingBlock} onChange={onChange as (u: Partial<BookingBlock>) => void} />;
    case 'survey':
      return <SurveyBlockSettings block={block as SurveyBlock} onChange={onChange as (u: Partial<SurveyBlock>) => void} />;
    case 'survey-results':
      return <SurveyResultsBlockSettings block={block as SurveyResultsBlock} onChange={onChange as (u: Partial<SurveyResultsBlock>) => void} />;
    case 'booking-menu':
      return <BookingMenuBlockSettings block={block as BookingMenuBlock} onChange={onChange as (u: Partial<BookingMenuBlock>) => void} />;
    case 'survey-input':
      return <SurveyInputBlockSettings block={block as SurveyInputBlock} onChange={onChange as (u: Partial<SurveyInputBlock>) => void} />;
    case 'email-header':
      return <EmailHeaderBlockSettings block={block as EmailHeaderBlock} onChange={onChange as (u: Partial<EmailHeaderBlock>) => void} />;
    case 'email-footer':
      return <EmailFooterBlockSettings block={block as EmailFooterBlock} onChange={onChange as (u: Partial<EmailFooterBlock>) => void} />;
    case 'popup':
      return <PopupBlockSettings block={block as PopupBlock} onChange={onChange as (u: Partial<PopupBlock>) => void} />;
    default:
      return null;
  }
}

function PopupBlockSettings({ block, onChange }: { block: PopupBlock; onChange: (updates: Partial<PopupBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  const trigger = block.trigger ?? 'time-delay';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Titular</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable
            html={block.headline || ''}
            onChange={(html) => onChange({ headline: html })}
            singleLine
            placeholder="Titular del modal"
            className="text-sm text-foreground"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Cuerpo</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[60px]">
          <RichTextEditable
            html={block.body || ''}
            onChange={(html) => onChange({ body: html || undefined })}
            placeholder="Texto del cuerpo — admite texto enriquecido"
            className="text-sm text-foreground"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Etiqueta CTA</label>
          <input
            type="text"
            value={block.ctaLabel || ''}
            onChange={(e) => onChange({ ctaLabel: e.target.value || undefined })}
            className={inputClass}
            placeholder="Quiero registrarme"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">URL CTA</label>
          <input
            type="text"
            value={block.ctaUrl || ''}
            onChange={(e) => onChange({ ctaUrl: e.target.value || undefined })}
            className={inputClass}
            placeholder="https:// o /go/<slug>"
          />
        </div>
      </div>
      <div className="border-t border-border pt-4">
        <label className="block text-sm font-medium text-foreground mb-1">Disparador</label>
        <select
          value={trigger}
          onChange={(e) => onChange({ trigger: e.target.value as PopupBlock['trigger'] })}
          className={inputClass}
        >
          <option value="page-load">Al cargar la página</option>
          <option value="time-delay">Retardo de tiempo</option>
          <option value="scroll-percent">Porcentaje de scroll</option>
          <option value="exit-intent">Intención de salida (solo escritorio)</option>
        </select>
      </div>
      {trigger === 'time-delay' && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Retardo (segundos)</label>
          <input
            type="number"
            min={0}
            step={1}
            value={block.delaySeconds ?? 5}
            onChange={(e) => onChange({ delaySeconds: Number(e.target.value) })}
            className={inputClass}
          />
        </div>
      )}
      {trigger === 'scroll-percent' && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Porcentaje de scroll (0-100)</label>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={block.scrollPercent ?? 50}
            onChange={(e) => onChange({ scrollPercent: Math.max(0, Math.min(100, Number(e.target.value))) })}
            className={inputClass}
          />
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Frecuencia</label>
        <select
          value={block.frequency ?? 'once-per-session'}
          onChange={(e) => onChange({ frequency: e.target.value as PopupBlock['frequency'] })}
          className={inputClass}
        >
          <option value="always">Cada visita</option>
          <option value="once-per-session">Una vez por sesión</option>
          <option value="once-per-week">Una vez por semana</option>
        </select>
        <p className="text-xs text-muted-foreground mt-1">
          Se guarda en <code className="font-mono">localStorage</code> con la clave del id del bloque.
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={block.dismissable ?? true}
          onChange={(e) => onChange({ dismissable: e.target.checked })}
          className="rounded border-border"
        />
        Descartable (botón de cierre + Esc + clic en el fondo)
      </label>
    </div>
  );
}

function ButtonBlockSettings({ block, onChange, currentViewport }: { block: ButtonBlock; onChange: (updates: Partial<ButtonBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Texto del botón</label>
        <input
          type="text"
          value={block.text}
          onChange={(e) => onChange({ text: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Haz clic aquí"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">URL del enlace</label>
        <input
          type="text"
          value={block.url}
          onChange={(e) => onChange({ url: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="https://..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Variante</label>
        <select
          value={block.variant || 'primary'}
          onChange={(e) => onChange({ variant: e.target.value as ButtonBlock['variant'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="primary">Primario</option>
          <option value="secondary">Secundario</option>
          <option value="outline">Contorno</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Tamaño</label>
        <select
          value={block.size || 'md'}
          onChange={(e) => onChange({ size: e.target.value as ButtonBlock['size'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="sm">Pequeño</option>
          <option value="md">Media</option>
          <option value="lg">Grande</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Alineación</label>
        <div className="flex gap-2">
          {(['left', 'center', 'right'] as const).map((align) => (
            <button
              key={align}
              type="button"
              onClick={() => onChange({ alignment: align })}
              className={`flex-1 px-3 py-2 text-sm rounded ${
                (block.alignment || 'left') === align
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background border border-border text-foreground hover:bg-accent'
              }`}
            >
              {align === 'left' && <span className="material-icons text-base">format_align_left</span>}
              {align === 'center' && <span className="material-icons text-base">format_align_center</span>}
              {align === 'right' && <span className="material-icons text-base">format_align_right</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="openInNewTab"
          checked={block.openInNewTab || false}
          onChange={(e) => onChange({ openInNewTab: e.target.checked })}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
        />
        <label htmlFor="openInNewTab" className="ml-2 text-sm text-foreground">
          Abrir en nueva pestaña
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Icono (nombre de Material Icon)</label>
        <input
          type="text"
          value={block.icon || ''}
          onChange={(e) => onChange({ icon: e.target.value || undefined })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="p. ej. arrow_forward"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Explora nombres en <span className="font-mono">fonts.google.com/icons</span>
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Posición del icono</label>
        <select
          value={block.iconPosition || 'left'}
          onChange={(e) => onChange({ iconPosition: e.target.value as ButtonBlock['iconPosition'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          disabled={!block.icon}
        >
          <option value="left">A la izquierda del texto</option>
          <option value="right">A la derecha del texto</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Efecto al pasar el cursor</label>
        <select
          value={block.hoverEffect || 'none'}
          onChange={(e) => onChange({ hoverEffect: e.target.value as ButtonBlock['hoverEffect'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="none">Ninguno</option>
          <option value="lift">Elevar (desplazar hacia arriba)</option>
          <option value="glow">Brillo</option>
          <option value="fill">Relleno (lavado sutil)</option>
          <option value="slide">Deslizar (barrido de luz)</option>
          <option value="pulse">Pulso</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Preset de marca (opcional)</label>
        <input
          type="text"
          value={block.presetId || ''}
          onChange={(e) => onChange({ presetId: e.target.value || undefined })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="ID de preset de los presets de marca"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Clave de preset de los presets de marca. Configura los presets en el panel Branding del sitio; los estilos del preset se aplican primero y los estilos de este bloque se superponen.
        </p>
      </div>

    </div>
  );
}

function SurveyBlockSettings({ block, onChange }: { block: SurveyBlock; onChange: (updates: Partial<SurveyBlock>) => void }) {
  const [surveys, setSurveys] = useState<Array<{ id: number; slug: string; title: string; status: string; responseCount: number }>>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/portal/surveys')
      .then(r => r.json())
      .then(json => { if (json.success) setSurveys(json.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = search
    ? surveys.filter(s => s.title.toLowerCase().includes(search.toLowerCase()) || s.slug.toLowerCase().includes(search.toLowerCase()))
    : surveys;
  const selected = surveys.find(s => s.slug === block.slug);

  return (
    <div className="space-y-4">
      <div ref={ref} className="relative">
        <label className="block text-sm font-medium text-foreground mb-1">Encuesta</label>
        {selected && !open ? (
          <button type="button" onClick={() => setOpen(true)}
            className="w-full flex items-center gap-2 rounded border border-border bg-background px-3 py-2 text-sm text-left hover:border-primary transition-colors">
            <span className="material-icons text-primary text-base">assignment</span>
            <div className="flex-1 min-w-0">
              <div className="truncate font-medium">{selected.title}</div>
              <div className="text-xs text-muted-foreground">{selected.slug} &middot; {selected.responseCount} respuestas</div>
            </div>
            <span className="material-icons text-sm text-muted-foreground">unfold_more</span>
          </button>
        ) : (
          <input type="text" value={open ? search : block.slug || ''}
            onChange={(e) => { setSearch(e.target.value); if (!open) onChange({ slug: e.target.value }); }}
            onFocus={() => setOpen(true)}
            placeholder={loading ? 'Cargando...' : 'Buscar encuestas...'}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:ring-1 focus:ring-primary" />
        )}
        {open && (
          <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                {loading ? 'Cargando...' : surveys.length === 0 ? 'No se encontraron encuestas' : 'Sin resultados'}
              </div>
            ) : filtered.map(s => (
              <button key={s.slug} type="button"
                onClick={() => { onChange({ slug: s.slug }); setOpen(false); setSearch(''); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-primary/5 ${s.slug === block.slug ? 'bg-primary/10' : ''}`}>
                <span className="material-icons text-primary text-base">assignment</span>
                <div className="flex-1 min-w-0">
                  <div className="truncate">{s.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.slug} {s.status !== 'active' && <span className="text-amber-500">({s.status})</span>}
                  </div>
                </div>
                {s.slug === block.slug && <span className="material-icons text-primary text-sm">check</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Título</label>
        <input type="text" value={block.title || ''} onChange={(e) => onChange({ title: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground" placeholder="Responde nuestra encuesta" />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Descripción</label>
        <input type="text" value={block.description || ''} onChange={(e) => onChange({ description: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground" placeholder="Nos encantaría conocer tu opinión" />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Altura del embed</label>
        <input type="text" value={block.height || '700px'} onChange={(e) => onChange({ height: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground" placeholder="700px" />
      </div>
      <div className="flex items-center">
        <input type="checkbox" id="surveyShowPageTitle" checked={block.showPageTitle !== false}
          onChange={(e) => onChange({ showPageTitle: e.target.checked })}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
        <label htmlFor="surveyShowPageTitle" className="ml-2 text-sm text-foreground">Mostrar título de la encuesta</label>
      </div>
      <div className="flex items-center">
        <input type="checkbox" id="surveyShowDescription" checked={block.showDescription !== false}
          onChange={(e) => onChange({ showDescription: e.target.checked })}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
        <label htmlFor="surveyShowDescription" className="ml-2 text-sm text-foreground">Mostrar descripción</label>
      </div>
      <div className="flex items-center">
        <input type="checkbox" id="surveyShowLogo" checked={block.showLogo !== false}
          onChange={(e) => onChange({ showLogo: e.target.checked })}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
        <label htmlFor="surveyShowLogo" className="ml-2 text-sm text-foreground">Mostrar logo</label>
      </div>

      {/* Advanced styling overrides — take precedence over the survey's own styling and the site branding. */}
      <details className="border border-border rounded">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-foreground hover:bg-accent/40">
          Ajustes de estilo avanzados
        </summary>
        <div className="px-3 pb-3 pt-2 space-y-4">
          <p className="text-xs text-muted-foreground">
            Tienen prioridad sobre el estilo propio de la encuesta y el branding del sitio. Déjalo en blanco para usar los valores predeterminados.
          </p>
          {(() => {
            const so = block.styleOverrides || {};
            const update = (patch: Partial<NonNullable<SurveyBlock['styleOverrides']>>) =>
              onChange({ styleOverrides: { ...so, ...patch } });
            const inputClass = 'w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground';
            const groupLabel = 'text-[10px] uppercase tracking-wide font-semibold text-muted-foreground';
            const fieldLabel = 'block text-xs text-muted-foreground mb-1';
            return (
              <>
                {/* ── Brand colors ─────────────────────────────────────── */}
                <div className="space-y-2">
                  <div className={groupLabel}>Colores de marca</div>
                  <div className="grid grid-cols-2 gap-2">
                    <TokenColorPicker label="Primario" value={so.primaryColor || ''} onChange={(v) => update({ primaryColor: v || undefined })} />
                    <TokenColorPicker label="Secundario (tinte de tarjeta)" value={so.secondaryColor || ''} onChange={(v) => update({ secondaryColor: v || undefined })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <TokenColorPicker label="Acento (tinte de campo)" value={so.accentColor || ''} onChange={(v) => update({ accentColor: v || undefined })} />
                    <TokenColorPicker label="Fondo" value={so.backgroundColor || ''} onChange={(v) => update({ backgroundColor: v || undefined })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <TokenColorPicker label="Texto" value={so.textColor || ''} onChange={(v) => update({ textColor: v || undefined })} />
                    <TokenColorPicker label="Etiqueta" value={so.labelColor || ''} onChange={(v) => update({ labelColor: v || undefined })} />
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-foreground">
                    <input
                      type="checkbox"
                      checked={so.hideQuestionNumbers === true}
                      onChange={(e) => update({ hideQuestionNumbers: e.target.checked || undefined })}
                      className="h-3.5 w-3.5 rounded border-border"
                    />
                    Ocultar números de pregunta
                  </label>
                </div>

                {/* ── Form / Card chrome ──────────────────────────────── */}
                <div className="space-y-2 border-t border-border pt-3">
                  <div className="flex items-center justify-between">
                    <div className={groupLabel}>Tarjeta del formulario</div>
                    <label className="flex items-center gap-1.5 text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={so.hideCardChrome === true}
                        onChange={(e) => update({ hideCardChrome: e.target.checked || undefined })}
                        className="h-3.5 w-3.5 rounded border-border"
                      />
                      Ocultar el marco de la tarjeta
                    </label>
                  </div>
                  <p className="text-[11px] text-muted-foreground -mt-1">
                    Ocultar el marco elimina el fondo, el borde y la sombra de la tarjeta: útil al insertarla dentro de una sección que ya tiene estilo.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <TokenColorPicker label="Fondo de la tarjeta" value={so.formBg || ''} onChange={(v) => update({ formBg: v || undefined })} />
                    <TokenColorPicker label="Borde de la tarjeta" value={so.formBorderColor || ''} onChange={(v) => update({ formBorderColor: v || undefined })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <TokenColorPicker label="Barra de acento" value={so.formAccentBarColor || ''} onChange={(v) => update({ formAccentBarColor: v || undefined })} />
                  </div>
                  <p className="text-[11px] text-muted-foreground -mt-1">
                    Añade una pequeña barra decorativa (156×12px) arriba a la izquierda dentro de la tarjeta, encima del primer campo. Déjalo en blanco para no mostrarla.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={fieldLabel}>Ancho del borde de la tarjeta</label>
                      <input type="text" value={so.formBorderWidth || ''} onChange={(e) => update({ formBorderWidth: e.target.value || undefined })}
                        className={inputClass} placeholder='p. ej. 0, 1px, 2px' />
                    </div>
                    <div>
                      <label className={fieldLabel}>Radio de la tarjeta</label>
                      <input type="text" value={so.formBorderRadius || ''} onChange={(e) => update({ formBorderRadius: e.target.value || undefined })}
                        className={inputClass} placeholder="p. ej. 16px" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={fieldLabel}>Relleno de la tarjeta</label>
                      <input type="text" value={so.formPadding || ''} onChange={(e) => update({ formPadding: e.target.value || undefined })}
                        className={inputClass} placeholder="p. ej. 1.5rem" />
                    </div>
                    <div>
                      <label className={fieldLabel}>Sombra de la tarjeta</label>
                      <input type="text" value={so.formShadow || ''} onChange={(e) => update({ formShadow: e.target.value || undefined })}
                        className={inputClass} placeholder='p. ej. none' />
                    </div>
                  </div>
                </div>

                {/* ── Inputs ──────────────────────────────────────────── */}
                <div className="space-y-2 border-t border-border pt-3">
                  <div className={groupLabel}>Campos</div>
                  <div className="grid grid-cols-2 gap-2">
                    <TokenColorPicker label="Fondo del campo" value={so.inputBg || ''} onChange={(v) => update({ inputBg: v || undefined })} />
                    <TokenColorPicker label="Texto del campo" value={so.inputTextColor || ''} onChange={(v) => update({ inputTextColor: v || undefined })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <TokenColorPicker label="Borde del campo" value={so.inputBorderColor || ''} onChange={(v) => update({ inputBorderColor: v || undefined })} />
                    <TokenColorPicker label="Anillo de foco" value={so.inputFocusRingColor || ''} onChange={(v) => update({ inputFocusRingColor: v || undefined })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={fieldLabel}>Ancho del borde del campo</label>
                      <input type="text" value={so.inputBorderWidth || ''} onChange={(e) => update({ inputBorderWidth: e.target.value || undefined })}
                        className={inputClass} placeholder="p. ej. 1px" />
                    </div>
                    <div>
                      <label className={fieldLabel}>Radio del campo</label>
                      <input type="text" value={so.inputBorderRadius || ''} onChange={(e) => update({ inputBorderRadius: e.target.value || undefined })}
                        className={inputClass} placeholder="p. ej. 8px" />
                    </div>
                  </div>
                </div>

                {/* ── Buttons ─────────────────────────────────────────── */}
                <div className="space-y-2 border-t border-border pt-3">
                  <div className={groupLabel}>Botones</div>
                  <div className="grid grid-cols-2 gap-2">
                    <TokenColorPicker label="Fondo del botón" value={so.buttonBg || ''} onChange={(v) => update({ buttonBg: v || undefined })} />
                    <TokenColorPicker label="Texto del botón" value={so.buttonText || ''} onChange={(v) => update({ buttonText: v || undefined })} />
                  </div>
                  <div>
                    <label className={fieldLabel}>Radio del botón</label>
                    <input type="text" value={so.buttonBorderRadius || ''} onChange={(e) => update({ buttonBorderRadius: e.target.value || undefined })}
                      className={inputClass} placeholder="p. ej. 6px" />
                  </div>
                  <div>
                    <label className={fieldLabel}>Etiqueta de envío</label>
                    <input type="text" value={so.submitLabel || ''} onChange={(e) => update({ submitLabel: e.target.value || undefined })}
                      className={inputClass} placeholder="Enviar" />
                  </div>
                </div>

                {/* ── Typography / global ─────────────────────────────── */}
                <div className="space-y-2 border-t border-border pt-3">
                  <div className={groupLabel}>Tipografía y global</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={fieldLabel}>Fuente de títulos</label>
                      <input type="text" value={so.headingFont || ''} onChange={(e) => update({ headingFont: e.target.value || undefined })}
                        className={inputClass} placeholder="p. ej. Inter, sans-serif" />
                    </div>
                    <div>
                      <label className={fieldLabel}>Fuente del cuerpo</label>
                      <input type="text" value={so.bodyFont || ''} onChange={(e) => update({ bodyFont: e.target.value || undefined })}
                        className={inputClass} placeholder="p. ej. system-ui, sans-serif" />
                    </div>
                  </div>
                  <div>
                    <label className={fieldLabel}>Radio de borde global (reserva)</label>
                    <input type="text" value={so.borderRadius || ''} onChange={(e) => update({ borderRadius: e.target.value || undefined })}
                      className={inputClass} placeholder="p. ej. 8px — se usa cuando no se define un radio por elemento" />
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </details>
    </div>
  );
}

function SurveyInputBlockSettings({ block, onChange }: { block: SurveyInputBlock; onChange: (updates: Partial<SurveyInputBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  const FIELD_TYPES = ['text', 'textarea', 'email', 'phone', 'url', 'number', 'date', 'select', 'radio', 'checkbox', 'toggle', 'rating', 'slider', 'heading'];
  const showOptions = ['select', 'radio', 'checkbox'].includes(block.fieldType);
  const showSliderConfig = block.fieldType === 'slider';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Tipo de campo</label>
        <select
          value={block.fieldType}
          onChange={(e) => onChange({ fieldType: e.target.value })}
          className={inputClass}
        >
          {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Etiqueta del campo</label>
        <input
          type="text"
          value={block.fieldLabel}
          onChange={(e) => onChange({ fieldLabel: e.target.value })}
          className={inputClass}
          placeholder="Pregunta o etiqueta"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Marcador de posición</label>
        <input
          type="text"
          value={block.placeholder || ''}
          onChange={(e) => onChange({ placeholder: e.target.value || undefined })}
          className={inputClass}
          placeholder="Texto del marcador de posición (opcional)"
        />
      </div>
      {showOptions && (
        <div className="border-t border-border pt-4 space-y-2">
          <label className="block text-sm font-medium text-foreground">Opciones</label>
          {(block.options || []).map((opt, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                value={opt}
                onChange={(e) => {
                  const next = [...(block.options || [])];
                  next[i] = e.target.value;
                  onChange({ options: next });
                }}
                className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
                placeholder="Valor de la opción"
              />
              <button
                type="button"
                onClick={() => onChange({ options: (block.options || []).filter((_, j) => j !== i) })}
                className="px-2 text-xs text-destructive hover:underline"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange({ options: [...(block.options || []), ''] })}
            className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
          >
            + Añadir opción
          </button>
        </div>
      )}
      {showSliderConfig && (
        <div className="grid grid-cols-3 gap-3 border-t border-border pt-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Mín</label>
            <input
              type="number"
              value={block.min ?? 0}
              onChange={(e) => onChange({ min: Number(e.target.value) })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Máx</label>
            <input
              type="number"
              value={block.max ?? 100}
              onChange={(e) => onChange({ max: Number(e.target.value) })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Paso</label>
            <input
              type="number"
              value={block.step ?? 1}
              onChange={(e) => onChange({ step: Number(e.target.value) })}
              className={inputClass}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function EmailHeaderBlockSettings({ block, onChange }: { block: EmailHeaderBlock; onChange: (updates: Partial<EmailHeaderBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Logo URL</label>
        <input
          type="url"
          value={block.logoUrl || ''}
          onChange={(e) => onChange({ logoUrl: e.target.value || undefined })}
          className={inputClass}
          placeholder="https://..."
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Ancho del logo (px)</label>
          <input
            type="number"
            value={block.logoWidth ?? 180}
            onChange={(e) => onChange({ logoWidth: Number(e.target.value) || undefined })}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Alineación</label>
          <select
            value={block.alignment || 'center'}
            onChange={(e) => onChange({ alignment: e.target.value as EmailHeaderBlock['alignment'] })}
            className={inputClass}
          >
            <option value="left">Izquierda</option>
            <option value="center">Centrado</option>
            <option value="right">Derecha</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Lema</label>
        <input
          type="text"
          value={block.tagline || ''}
          onChange={(e) => onChange({ tagline: e.target.value || undefined })}
          className={inputClass}
          placeholder="Lema opcional debajo del logo"
        />
      </div>
    </div>
  );
}

function EmailFooterBlockSettings({ block, onChange }: { block: EmailFooterBlock; onChange: (updates: Partial<EmailFooterBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Nombre de la empresa</label>
        <input
          type="text"
          value={block.companyName || ''}
          onChange={(e) => onChange({ companyName: e.target.value || undefined })}
          className={inputClass}
          placeholder="Tu empresa"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Dirección</label>
        <textarea
          value={block.address || ''}
          onChange={(e) => onChange({ address: e.target.value || undefined })}
          className={`${inputClass} min-h-[60px] resize-y`}
          placeholder="Calle 123, Ciudad, CP 00000"
        />
      </div>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={block.showUnsubscribe !== false}
            onChange={(e) => onChange({ showUnsubscribe: e.target.checked })}
            className="rounded border-border"
          />
          Mostrar enlace de cancelación de suscripción
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={block.showViewInBrowser ?? false}
            onChange={(e) => onChange({ showViewInBrowser: e.target.checked })}
            className="rounded border-border"
          />
          Mostrar enlace &quot;Ver en el navegador&quot;
        </label>
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Enlaces sociales</label>
        {(block.socialLinks || []).map((link, i) => (
          <div key={i} className="flex gap-1">
            <input
              type="text"
              value={link.platform}
              onChange={(e) => {
                const next = [...(block.socialLinks || [])];
                next[i] = { ...next[i], platform: e.target.value };
                onChange({ socialLinks: next });
              }}
              className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Plataforma (p. ej. linkedin)"
            />
            <input
              type="url"
              value={link.url}
              onChange={(e) => {
                const next = [...(block.socialLinks || [])];
                next[i] = { ...next[i], url: e.target.value };
                onChange({ socialLinks: next });
              }}
              className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="https://..."
            />
            <button
              type="button"
              onClick={() => onChange({ socialLinks: (block.socialLinks || []).filter((_, j) => j !== i) })}
              className="px-2 text-xs text-destructive hover:underline"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ socialLinks: [...(block.socialLinks || []), { platform: '', url: '' }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Añadir enlace social
        </button>
      </div>
    </div>
  );
}

function BookingMenuBlockSettings({ block, onChange }: { block: BookingMenuBlock; onChange: (updates: Partial<BookingMenuBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Título de la sección</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Título de sección opcional..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Descripción</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} singleLine placeholder="Descripción opcional..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Columnas</label>
        <select
          value={block.columns || 3}
          onChange={(e) => onChange({ columns: Number(e.target.value) as BookingMenuBlock['columns'] })}
          className={inputClass}
        >
          <option value={2}>2 columnas</option>
          <option value={3}>3 columnas</option>
          <option value={4}>4 columnas</option>
        </select>
      </div>
      <p className="text-xs text-muted-foreground">
        Las páginas de reserva se toman en vivo de las reservas publicadas de este sitio. Añade páginas de reserva desde el admin de Reservas para llenar la cuadrícula.
      </p>
    </div>
  );
}

