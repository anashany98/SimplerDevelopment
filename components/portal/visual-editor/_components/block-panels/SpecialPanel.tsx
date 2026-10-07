'use client';

import MediaPicker from '@/components/admin/MediaPicker';
import type { Block } from '@/types/blocks';
import { GoogleFontPicker } from '@/components/blocks/visual/GoogleFontPicker';
import {
  Field,
  TextareaField,
  RichTextField,
  SelectField,
  ColorField,
  CheckboxField,
  NumberField,
} from '../../panel-fields';
import { ListEditor } from '../ListEditor';
import { SurveyResultsEditor } from '../SurveyResultsEditor';
import { HtmlEmbedEditor } from '../HtmlEmbedEditor';
import dynamic from 'next/dynamic';

// Lazy-loaded through the SAME boundary (same module specifier) as
// ContentPanel's copy. A static import here put a SECOND full copy of the
// CodeMirror stack (incl. @codemirror/state) into the entry chunk while
// ContentPanel's dynamic() pulled the shared lazy chunk — two module
// instances of @codemirror/state on the same edit page, and its extension
// resolution uses instanceof, so selecting an html-render block crashed with
// "Unrecognized extension value in extension set" (operator-reported, prod).
// Same version everywhere — the duplication was per-chunk-graph, which is why
// the package.json overrides pin alone didn't cure it.
const HtmlRenderEditor = dynamic(
  () => import('@/components/portal/visual-editor/HtmlRenderEditor').then((m) => ({ default: m.HtmlRenderEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-2 animate-pulse">
        <div className="h-3 w-24 bg-muted rounded" />
        <div className="h-8 bg-muted rounded" />
      </div>
    ),
  },
);
import { BookingPagePicker } from '../pickers/BookingPagePicker';
import { SurveyPicker } from '../pickers/SurveyPicker';
import type { PanelProps } from './ContentPanel';

// ─── Special Panel ────────────────────────────────────────────────────────────
// booking, survey, popup, deck-next-slide, deck-jump-to, booking-menu,
// social-links, timeline, accordion, tabs, sticky-scroll-tabs, blog-posts,
// survey-results, html-embed, html-render, site-footer

export function SpecialPanel({ block, onUpdate, siteId }: PanelProps) {
  const b = block as unknown as Record<string, unknown>;
  const uid = () => `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mediaApi = siteId ? `/api/portal/cms/websites/${siteId}/media` : '/api/portal/media';
  return (
    <>
      {/* ── Accordion Block — with item editor ── */}
      {block.type === 'accordion' && (
        <>
          <RichTextField label="Título" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <ListEditor
            label="Elementos"
            items={(block.items || []).map(item => ({ id: item.id, fields: { title: item.title, content: item.content } }))}
            fieldDefs={[
              { name: 'title', label: 'Título', placeholder: 'Título de sección' },
              { name: 'content', label: 'Contenido', placeholder: 'Contenido de la sección', type: 'richtext' },
            ]}
            onAdd={() => onUpdate({ items: [...(block.items || []), { id: uid(), title: 'Nueva sección', content: '' }] } as Partial<Block>)}
            onRemove={(id) => onUpdate({ items: block.items.filter(i => i.id !== id) } as Partial<Block>)}
            onItemChange={(id, field, value) => onUpdate({ items: block.items.map(i => i.id === id ? { ...i, [field]: value } : i) } as Partial<Block>)}
            onReorder={(ids) => onUpdate({ items: ids.map(id => block.items.find(i => i.id === id)!).filter(Boolean) } as Partial<Block>)}
          />
        </>
      )}

      {/* ── Tabs Block — with tab editor ── */}
      {block.type === 'tabs' && (
        <>
          <ListEditor
            label="Pestañas"
            items={(block.tabs || []).map(tab => ({ id: tab.id, fields: { label: tab.label } }))}
            fieldDefs={[{ name: 'label', label: 'Etiqueta de la pestaña', placeholder: 'Nombre de la pestaña' }]}
            onAdd={() => onUpdate({ tabs: [...(block.tabs || []), { id: uid(), label: 'Nueva pestaña', blocks: [] }] } as Partial<Block>)}
            onRemove={(id) => onUpdate({ tabs: block.tabs.filter(t => t.id !== id) } as Partial<Block>)}
            onItemChange={(id, field, value) => onUpdate({ tabs: block.tabs.map(t => t.id === id ? { ...t, [field]: value } : t) } as Partial<Block>)}
            onReorder={(ids) => onUpdate({ tabs: ids.map(id => block.tabs.find(t => t.id === id)!).filter(Boolean) } as Partial<Block>)}
          />
          <p className="text-xs text-muted-foreground">Edita el contenido de las pestañas desde el panel de capas.</p>
        </>
      )}

      {/* ── Sticky Scroll Tabs Block ── */}
      {block.type === 'sticky-scroll-tabs' && (
        <>
          <RichTextField label="Antetítulo" value={(b.overline as string) || ''} onChange={(v) => onUpdate({ overline: v || undefined } as Partial<Block>)} singleLine />
          <RichTextField label="Título" value={(b.title as string) || ''} onChange={(v) => onUpdate({ title: v || undefined } as Partial<Block>)} singleLine />
          <RichTextField label="Descripción" value={(b.description as string) || ''} onChange={(v) => onUpdate({ description: v || undefined } as Partial<Block>)} />
          <ListEditor
            label="Paneles"
            items={(block.panels || []).map(p => ({ id: p.id, fields: { label: p.label, icon: p.icon || '' } }))}
            fieldDefs={[
              { name: 'label', label: 'Etiqueta del panel', placeholder: 'Nombre del panel' },
              { name: 'icon', label: 'Icono Material (opcional)', placeholder: 'rocket_launch' },
            ]}
            onAdd={() => onUpdate({ panels: [...(block.panels || []), { id: uid(), label: 'Nuevo panel', blocks: [] }] } as Partial<Block>)}
            onRemove={(id) => onUpdate({ panels: block.panels.filter(p => p.id !== id) } as Partial<Block>)}
            onItemChange={(id, field, value) => onUpdate({ panels: block.panels.map(p => p.id === id ? { ...p, [field]: value || undefined } : p) } as Partial<Block>)}
            onReorder={(ids) => onUpdate({ panels: ids.map(id => block.panels.find(p => p.id === id)!).filter(Boolean) } as Partial<Block>)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Desplazamiento superior fijo (px)" value={String(b.stickyTopOffset ?? 80)} onChange={(v) => { const n = Number(v); onUpdate({ stickyTopOffset: Number.isNaN(n) ? undefined : n } as Partial<Block>); }} />
            <Field label="Alto mínimo del panel" value={(b.panelMinHeight as string) || ''} onChange={(v) => onUpdate({ panelMinHeight: v || undefined } as Partial<Block>)} />
          </div>
          <Field label="Radio del borde de la pestaña" value={(b.tabBorderRadius as string) || ''} onChange={(v) => onUpdate({ tabBorderRadius: v || undefined } as Partial<Block>)} />
          <div className="grid grid-cols-2 gap-2">
            <ColorField label="Fondo de pestaña activa" value={(b.activeTabBackground as string) || ''} onChange={(v) => onUpdate({ activeTabBackground: v || undefined } as Partial<Block>)} />
            <ColorField label="Texto de pestaña activa" value={(b.activeTabColor as string) || ''} onChange={(v) => onUpdate({ activeTabColor: v || undefined } as Partial<Block>)} />
            <ColorField label="Fondo de pestaña inactiva" value={(b.inactiveTabBackground as string) || ''} onChange={(v) => onUpdate({ inactiveTabBackground: v || undefined } as Partial<Block>)} />
            <ColorField label="Texto de pestaña inactiva" value={(b.inactiveTabColor as string) || ''} onChange={(v) => onUpdate({ inactiveTabColor: v || undefined } as Partial<Block>)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ColorField label="Fondo activo (móvil)" value={(b.mobileActiveTabBackground as string) || ''} onChange={(v) => onUpdate({ mobileActiveTabBackground: v || undefined } as Partial<Block>)} />
            <ColorField label="Texto activo (móvil)" value={(b.mobileActiveTabColor as string) || ''} onChange={(v) => onUpdate({ mobileActiveTabColor: v || undefined } as Partial<Block>)} />
            <ColorField label="Fondo inactivo (móvil)" value={(b.mobileInactiveTabBackground as string) || ''} onChange={(v) => onUpdate({ mobileInactiveTabBackground: v || undefined } as Partial<Block>)} />
            <ColorField label="Texto inactivo (móvil)" value={(b.mobileInactiveTabColor as string) || ''} onChange={(v) => onUpdate({ mobileInactiveTabColor: v || undefined } as Partial<Block>)} />
          </div>
          <SelectField label="Comportamiento de pestañas en móvil" value={(b.mobileTabsBehavior as string) || 'carousel'} options={['carousel', 'hide']} onChange={(v) => onUpdate({ mobileTabsBehavior: v } as Partial<Block>)} />
        </>
      )}

      {/* ── Blog Posts Block ── */}
      {block.type === 'blog-posts' && (
        <>
          <RichTextField label="Título" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Descripción" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <Field label="Tipo de contenido" value={b.postType as string} onChange={(v) => onUpdate({ postType: v } as Partial<Block>)} />
          <Field label="Slug de categoría" value={b.categorySlug as string} onChange={(v) => onUpdate({ categorySlug: v } as Partial<Block>)} />
          <SelectField label="Límite" value={String(b.limit || 6)} options={['3','6','9','12']} onChange={(v) => onUpdate({ limit: Number(v) } as Partial<Block>)} />
          <SelectField label="Columnas" value={String(b.columns || 3)} options={['2','3']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <CheckboxField label="Mostrar extracto" checked={b.showExcerpt as boolean ?? true} onChange={(v) => onUpdate({ showExcerpt: v } as Partial<Block>)} />
        </>
      )}

      {block.type === 'booking' && (
        <>
          <BookingPagePicker value={b.slug as string} onChange={(v) => onUpdate({ slug: v } as Partial<Block>)} />
          <RichTextField label="Título" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Descripción" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <Field label="Alto del embed" value={(b.height as string) || '700px'} onChange={(v) => onUpdate({ height: v } as Partial<Block>)} />
          <CheckboxField label="Mostrar título de la página de reserva" checked={b.showPageTitle !== false} onChange={(v) => onUpdate({ showPageTitle: v } as Partial<Block>)} />
          <CheckboxField label="Mostrar descripción" checked={b.showDescription !== false} onChange={(v) => onUpdate({ showDescription: v } as Partial<Block>)} />
          <CheckboxField label="Mostrar indicador de pasos" checked={b.showSteps !== false} onChange={(v) => onUpdate({ showSteps: v } as Partial<Block>)} />
          <CheckboxField label="Mostrar logotipo" checked={b.showLogo !== false} onChange={(v) => onUpdate({ showLogo: v } as Partial<Block>)} />

          {/* Style Overrides */}
          <details className="pt-2 border-t border-border mt-2">
            <summary className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground select-none py-1">
              <span className="material-icons text-sm">palette</span>Anulaciones de estilo</summary>
            <div className="pt-3 space-y-3">
              <ColorField label="Color principal" value={(b.styleOverrides as Record<string,string>)?.primaryColor || ''} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), primaryColor: v } } as Partial<Block>)} />
              <ColorField label="Fondo" value={(b.styleOverrides as Record<string,string>)?.backgroundColor || ''} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), backgroundColor: v } } as Partial<Block>)} />
              <ColorField label="Color del texto" value={(b.styleOverrides as Record<string,string>)?.textColor || ''} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), textColor: v } } as Partial<Block>)} />
              <ColorField label="Fondo del formulario" value={(b.styleOverrides as Record<string,string>)?.formBg || ''} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), formBg: v } } as Partial<Block>)} />
              <ColorField label="Fondo del campo de entrada" value={(b.styleOverrides as Record<string,string>)?.inputBg || ''} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), inputBg: v } } as Partial<Block>)} />
              <ColorField label="Fondo del botón" value={(b.styleOverrides as Record<string,string>)?.buttonBg || ''} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), buttonBg: v } } as Partial<Block>)} />
              <ColorField label="Texto del botón" value={(b.styleOverrides as Record<string,string>)?.buttonText || ''} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), buttonText: v } } as Partial<Block>)} />
              <div>
                <span className="text-xs font-medium text-muted-foreground">Fuente de los encabezados</span>
                <GoogleFontPicker value={(b.styleOverrides as Record<string,string>)?.headingFont || ''} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), headingFont: v } } as Partial<Block>)} />
              </div>
              <div>
                <span className="text-xs font-medium text-muted-foreground">Fuente del cuerpo</span>
                <GoogleFontPicker value={(b.styleOverrides as Record<string,string>)?.bodyFont || ''} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), bodyFont: v } } as Partial<Block>)} />
              </div>
              <SelectField label="Radio del botón" value={(b.styleOverrides as Record<string,string>)?.buttonBorderRadius || ''} options={['', '0px', '4px', '8px', '12px', '9999px']} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), buttonBorderRadius: v } } as Partial<Block>)} />
              <SelectField label="Radio de la tarjeta" value={(b.styleOverrides as Record<string,string>)?.borderRadius || ''} options={['', '0px', '4px', '8px', '12px', '16px', '24px']} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), borderRadius: v } } as Partial<Block>)} />
            </div>
          </details>
        </>
      )}

      {block.type === 'survey' && (
        <>
          <SurveyPicker value={b.slug as string} onChange={(v) => onUpdate({ slug: v } as Partial<Block>)} />
          <RichTextField label="Título" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Descripción" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <Field label="Alto del embed" value={(b.height as string) || '700px'} onChange={(v) => onUpdate({ height: v } as Partial<Block>)} />
          <CheckboxField label="Mostrar título de la encuesta" checked={b.showPageTitle !== false} onChange={(v) => onUpdate({ showPageTitle: v } as Partial<Block>)} />
        </>
      )}

      {/* ── Popup Block (modal triggered by load / time / scroll / exit-intent) ── */}
      {block.type === 'popup' && (
        <>
          <RichTextField label="Titular" value={b.headline as string} onChange={(v) => onUpdate({ headline: v } as Partial<Block>)} singleLine />
          <RichTextField label="Cuerpo" value={(b.body as string) || ''} onChange={(v) => onUpdate({ body: v || undefined } as Partial<Block>)} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Etiqueta del CTA" value={(b.ctaLabel as string) || ''} onChange={(v) => onUpdate({ ctaLabel: v || undefined } as Partial<Block>)} />
            <Field label="URL del CTA" value={(b.ctaUrl as string) || ''} onChange={(v) => onUpdate({ ctaUrl: v || undefined } as Partial<Block>)} />
          </div>
          <SelectField label="Disparador" value={(b.trigger as string) || 'time-delay'} options={['page-load','time-delay','scroll-percent','exit-intent']} onChange={(v) => onUpdate({ trigger: v } as Partial<Block>)} />
          {(b.trigger as string) === 'time-delay' && (
            <NumberField label="Retardo (segundos)" value={(b.delaySeconds as number) ?? 5} min={0} onChange={(v) => onUpdate({ delaySeconds: v } as Partial<Block>)} />
          )}
          {(b.trigger as string) === 'scroll-percent' && (
            <NumberField label="Porcentaje de desplazamiento (0-100)" value={(b.scrollPercent as number) ?? 50} min={0} max={100} onChange={(v) => onUpdate({ scrollPercent: Math.max(0, Math.min(100, v)) } as Partial<Block>)} />
          )}
          <SelectField label="Frecuencia" value={(b.frequency as string) || 'once-per-session'} options={['always','once-per-session','once-per-week']} onChange={(v) => onUpdate({ frequency: v } as Partial<Block>)} />
          <CheckboxField label="Prescindible (botón de cierre + Esc + clic en el fondo)" checked={(b.dismissable as boolean) !== false} onChange={(v) => onUpdate({ dismissable: v } as Partial<Block>)} />
          <p className="text-xs text-muted-foreground">La frecuencia se guarda en <code className="font-mono">localStorage</code>, identificada por el ID del bloque.</p>
        </>
      )}

      {block.type === 'deck-next-slide' && (
        <>
          <Field label="Texto del botón" value={(b.text as string) || 'Siguiente diapositiva'} onChange={(v) => onUpdate({ text: v } as Partial<Block>)} />
          <SelectField label="Variante" value={(b.variant as string) || 'primary'} options={['primary','secondary','outline']} onChange={(v) => onUpdate({ variant: v } as Partial<Block>)} />
          <SelectField label="Tamaño" value={(b.size as string) || 'md'} options={['sm','md','lg']} onChange={(v) => onUpdate({ size: v } as Partial<Block>)} />
          <SelectField label="Alineación" value={(b.alignment as string) || 'center'} options={['left','center','right']} onChange={(v) => onUpdate({ alignment: v } as Partial<Block>)} />
          <Field label="Ícono" value={(b.icon as string) || ''} onChange={(v) => onUpdate({ icon: v } as Partial<Block>)} />
          <SelectField label="Posición del icono" value={(b.iconPosition as string) || 'left'} options={['left','right']} onChange={(v) => onUpdate({ iconPosition: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'deck-jump-to' && (
        <>
          <Field label="Texto del botón" value={(b.text as string) || 'Ir a'} onChange={(v) => onUpdate({ text: v } as Partial<Block>)} />
          <Field label="Diapositiva destino #" value={String((b.targetSlide as number) || 1)} onChange={(v) => onUpdate({ targetSlide: parseInt(v, 10) || 1 } as Partial<Block>)} />
          <SelectField label="Variante" value={(b.variant as string) || 'secondary'} options={['primary','secondary','outline']} onChange={(v) => onUpdate({ variant: v } as Partial<Block>)} />
          <SelectField label="Tamaño" value={(b.size as string) || 'md'} options={['sm','md','lg']} onChange={(v) => onUpdate({ size: v } as Partial<Block>)} />
          <SelectField label="Alineación" value={(b.alignment as string) || 'center'} options={['left','center','right']} onChange={(v) => onUpdate({ alignment: v } as Partial<Block>)} />
          <Field label="Ícono" value={(b.icon as string) || ''} onChange={(v) => onUpdate({ icon: v } as Partial<Block>)} />
          <SelectField label="Posición del icono" value={(b.iconPosition as string) || 'left'} options={['left','right']} onChange={(v) => onUpdate({ iconPosition: v } as Partial<Block>)} />
        </>
      )}

      {/* ── Booking Menu Block ── */}
      {block.type === 'booking-menu' && (
        <>
          <RichTextField label="Título" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Descripción" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} singleLine />
          <SelectField label="Columnas" value={String(b.columns || 3)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <p className="text-xs text-muted-foreground">Las páginas de reserva se cargan en vivo desde las reservas publicadas de este sitio. Añade páginas de reserva desde el administrador de Reservas para rellenar la cuadrícula.</p>
        </>
      )}

      {/* ── Social Links Block ── */}
      {block.type === 'social-links' && (
        <>
          <SelectField label="Alineación" value={(b.alignment as string) || 'center'} options={['left','center','right']} onChange={(v) => onUpdate({ alignment: v } as Partial<Block>)} />
          <SelectField label="Tamaño del ícono (px)" value={String((b.iconSize as number) ?? 32)} options={['24','32','40']} onChange={(v) => onUpdate({ iconSize: Number(v) } as Partial<Block>)} />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Enlaces ({((b.links as Array<{platform: string; url: string}>) || []).length})</span>
            </div>
            {((b.links as Array<{platform: string; url: string}>) || []).map((link, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select
                  value={link.platform}
                  onChange={(e) => {
                    const next = [...((b.links as Array<{platform: string; url: string}>) || [])];
                    next[i] = { ...next[i], platform: e.target.value };
                    onUpdate({ links: next } as Partial<Block>);
                  }}
                  className="text-xs rounded border border-border bg-background px-2 py-2 text-foreground"
                >
                  {(['facebook','twitter','instagram','linkedin','youtube','tiktok'] as const).map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <input
                  type="url"
                  value={link.url}
                  onChange={(e) => {
                    const next = [...((b.links as Array<{platform: string; url: string}>) || [])];
                    next[i] = { ...next[i], url: e.target.value };
                    onUpdate({ links: next } as Partial<Block>);
                  }}
                  className="flex-1 text-xs rounded border border-border bg-background px-2 py-2 text-foreground"
                  placeholder="https://"
                />
                <button
                  type="button"
                  onClick={() => onUpdate({ links: ((b.links as Array<{platform: string; url: string}>) || []).filter((_, j) => j !== i) } as Partial<Block>)}
                  className="px-2 py-2 text-xs rounded border border-border text-destructive hover:bg-destructive/10"
                >
                  <span className="material-icons text-xs">delete</span>
                </button>
              </div>
            ))}
            {((b.links as Array<{platform: string; url: string}>) || []).length < 6 && (
              <button
                type="button"
                onClick={() => onUpdate({ links: [...((b.links as Array<{platform: string; url: string}>) || []), { platform: 'facebook', url: '' }] } as Partial<Block>)}
                className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
              >
                + Añadir enlace
              </button>
            )}
          </div>
        </>
      )}

      {/* ── Timeline Block ── */}
      {block.type === 'timeline' && (
        <>
          <Field label="Antetítulo" value={(b.overline as string) || ''} onChange={(v) => onUpdate({ overline: v || undefined } as Partial<Block>)} />
          <RichTextField label="Título" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Subtítulo" value={b.subtitle as string} onChange={(v) => onUpdate({ subtitle: v } as Partial<Block>)} singleLine />
          <SelectField label="Diseño" value={(b.layout as string) || 'alternating'} options={['alternating','left']} onChange={(v) => onUpdate({ layout: v } as Partial<Block>)} />
          <div className="grid grid-cols-3 gap-2">
            <ColorField label="Color de la línea" value={(b.lineColor as string) || ''} onChange={(v) => onUpdate({ lineColor: v || undefined } as Partial<Block>)} />
            <ColorField label="Color del número" value={(b.numberColor as string) || ''} onChange={(v) => onUpdate({ numberColor: v || undefined } as Partial<Block>)} />
            <ColorField label="Color del nodo" value={(b.nodeColor as string) || ''} onChange={(v) => onUpdate({ nodeColor: v || undefined } as Partial<Block>)} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Pasos ({((b.steps as Array<{id?: string; number?: string; icon?: string; title: string; description: string}>) || []).length})</span>
              <button type="button" onClick={() => onUpdate({ steps: [...((b.steps as Array<{id?: string; number?: string; icon?: string; title: string; description: string}>) || []), { id: `step-${Date.now()}`, title: '', description: '' }] } as Partial<Block>)} className="text-xs text-primary hover:text-primary/80 font-medium">+ Añadir</button>
            </div>
            {((b.steps as Array<{id?: string; number?: string; icon?: string; title: string; description: string}>) || []).map((step, i) => (
              <div key={step.id ?? i} className="space-y-1 p-2 rounded border border-border">
                <input type="text" value={step.number || ''} onChange={(e) => { const next = [...((b.steps as Array<{id?: string; number?: string; icon?: string; title: string; description: string}>) || [])]; next[i] = { ...next[i], number: e.target.value || undefined }; onUpdate({ steps: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Número (p. ej. 01) — opcional" />
                <input type="text" value={step.icon || ''} onChange={(e) => { const next = [...((b.steps as Array<{id?: string; number?: string; icon?: string; title: string; description: string}>) || [])]; next[i] = { ...next[i], icon: e.target.value || undefined }; onUpdate({ steps: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Nombre del icono Material (opcional, alternativa al número)" />
                <input type="text" value={step.title} onChange={(e) => { const next = [...((b.steps as Array<{id?: string; number?: string; icon?: string; title: string; description: string}>) || [])]; next[i] = { ...next[i], title: e.target.value }; onUpdate({ steps: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold" placeholder="Título del paso" />
                <textarea value={step.description} onChange={(e) => { const next = [...((b.steps as Array<{id?: string; number?: string; icon?: string; title: string; description: string}>) || [])]; next[i] = { ...next[i], description: e.target.value }; onUpdate({ steps: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Descripción del paso" rows={2} />
                <button type="button" onClick={() => onUpdate({ steps: ((b.steps as Array<{id?: string; number?: string; icon?: string; title: string; description: string}>) || []).filter((_, j) => j !== i) } as Partial<Block>)} className="text-xs text-destructive hover:underline">Quitar</button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Survey Results Block ── */}
      {block.type === 'survey-results' && (
        <SurveyResultsEditor block={block} onUpdate={onUpdate} />
      )}

      {/* ── HTML Embed Block ── */}
      {block.type === 'html-embed' && (
        <HtmlEmbedEditor block={block} onUpdate={onUpdate} siteId={siteId} />
      )}

      {/* ── HTML Render Block (with field-based content management) ── */}
      {block.type === 'html-render' && (
        <HtmlRenderEditor block={block} onUpdate={onUpdate} siteId={siteId} />
      )}

      {/* ── Site Footer Block ── */}
      {block.type === 'site-footer' && (
        <>
          <Field label="URL del logotipo" value={(b.logoUrl as string) || ''} onChange={(v) => onUpdate({ logoUrl: v || undefined } as Partial<Block>)} />
          <Field label="Texto alternativo del logotipo" value={(b.logoAlt as string) || ''} onChange={(v) => onUpdate({ logoAlt: v || undefined } as Partial<Block>)} />
          <Field label="Marca denominativa" value={(b.wordmark as string) || ''} onChange={(v) => onUpdate({ wordmark: v || undefined } as Partial<Block>)} />
          <SelectField label="Tamaño de la marca" value={(b.brandSize as string) || 'md'} options={['sm','md','lg']} onChange={(v) => onUpdate({ brandSize: v } as Partial<Block>)} />
          <Field label="Eslogan" value={(b.tagline as string) || ''} onChange={(v) => onUpdate({ tagline: v || undefined } as Partial<Block>)} />
          <Field label="Texto del CTA" value={(b.ctaText as string) || ''} onChange={(v) => onUpdate({ ctaText: v || undefined } as Partial<Block>)} />
          <Field label="URL del CTA" value={(b.ctaUrl as string) || ''} onChange={(v) => onUpdate({ ctaUrl: v || undefined } as Partial<Block>)} />
          <div className="grid grid-cols-3 gap-2">
            <ColorField label="Fondo" value={(b.backgroundColor as string) || ''} onChange={(v) => onUpdate({ backgroundColor: v || undefined } as Partial<Block>)} />
            <ColorField label="Texto" value={(b.textColor as string) || ''} onChange={(v) => onUpdate({ textColor: v || undefined } as Partial<Block>)} />
            <ColorField label="Acento" value={(b.accentColor as string) || ''} onChange={(v) => onUpdate({ accentColor: v || undefined } as Partial<Block>)} />
          </div>
          <details className="pt-2 border-t border-border mt-2">
            <summary className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground select-none py-1">
              <span className="material-icons text-sm">contact_mail</span>Información de contacto</summary>
            <div className="pt-3 space-y-2">
              <Field label="Dirección" value={(b.contactInfo as Record<string,string>)?.address || ''} onChange={(v) => onUpdate({ contactInfo: { ...((b.contactInfo as Record<string,string>) || {}), address: v || undefined } } as Partial<Block>)} />
              <Field label="Teléfono" value={(b.contactInfo as Record<string,string>)?.phone || ''} onChange={(v) => onUpdate({ contactInfo: { ...((b.contactInfo as Record<string,string>) || {}), phone: v || undefined } } as Partial<Block>)} />
              <Field label="Correo" value={(b.contactInfo as Record<string,string>)?.email || ''} onChange={(v) => onUpdate({ contactInfo: { ...((b.contactInfo as Record<string,string>) || {}), email: v || undefined } } as Partial<Block>)} />
            </div>
          </details>
          <details className="pt-2 border-t border-border mt-2">
            <summary className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground select-none py-1">
              <span className="material-icons text-sm">link</span>
              Grupos de enlaces ({((b.linkGroups as Array<{label: string; links: Array<{label: string; href: string}>}>) || []).length})
            </summary>
            <div className="pt-3 space-y-2">
              {((b.linkGroups as Array<{label: string; links: Array<{label: string; href: string}>}>) || []).map((group, gi) => (
                <div key={gi} className="space-y-1 p-2 rounded border border-border">
                  <input type="text" value={group.label} onChange={(e) => { const next = [...((b.linkGroups as Array<{label: string; links: Array<{label: string; href: string}>}>) || [])]; next[gi] = { ...next[gi], label: e.target.value }; onUpdate({ linkGroups: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold" placeholder="Etiqueta del grupo (p. ej. PRODUCTO)" />
                  {(group.links || []).map((link, li) => (
                    <div key={li} className="flex gap-1">
                      <input type="text" value={link.label} onChange={(e) => { const groups = [...((b.linkGroups as Array<{label: string; links: Array<{label: string; href: string}>}>) || [])]; const links = [...(groups[gi].links || [])]; links[li] = { ...links[li], label: e.target.value }; groups[gi] = { ...groups[gi], links }; onUpdate({ linkGroups: groups } as Partial<Block>); }} className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Etiqueta del enlace" />
                      <input type="text" value={link.href} onChange={(e) => { const groups = [...((b.linkGroups as Array<{label: string; links: Array<{label: string; href: string}>}>) || [])]; const links = [...(groups[gi].links || [])]; links[li] = { ...links[li], href: e.target.value }; groups[gi] = { ...groups[gi], links }; onUpdate({ linkGroups: groups } as Partial<Block>); }} className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="/path" />
                      <button type="button" onClick={() => { const groups = [...((b.linkGroups as Array<{label: string; links: Array<{label: string; href: string}>}>) || [])]; groups[gi] = { ...groups[gi], links: (groups[gi].links || []).filter((_, j) => j !== li) }; onUpdate({ linkGroups: groups } as Partial<Block>); }} className="px-2 text-xs text-destructive hover:underline">x</button>
                    </div>
                  ))}
                  <div className="flex gap-1">
                    <button type="button" onClick={() => { const groups = [...((b.linkGroups as Array<{label: string; links: Array<{label: string; href: string}>}>) || [])]; groups[gi] = { ...groups[gi], links: [...(groups[gi].links || []), { label: '', href: '' }] }; onUpdate({ linkGroups: groups } as Partial<Block>); }} className="flex-1 text-xs text-muted-foreground hover:underline">+ Enlace</button>
                    <button type="button" onClick={() => onUpdate({ linkGroups: ((b.linkGroups as Array<{label: string; links: Array<{label: string; href: string}>}>) || []).filter((_, j) => j !== gi) } as Partial<Block>)} className="text-xs text-destructive hover:underline">Quitar grupo</button>
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => onUpdate({ linkGroups: [...((b.linkGroups as Array<{label: string; links: Array<{label: string; href: string}>}>) || []), { label: '', links: [] }] } as Partial<Block>)} className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50">+ Añadir grupo</button>
            </div>
          </details>
          <details className="pt-2 border-t border-border mt-2">
            <summary className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground select-none py-1">
              <span className="material-icons text-sm">share</span>
              Enlaces sociales ({((b.socialLinks as Array<{platform: string; url: string}>) || []).length})
            </summary>
            <div className="pt-3 space-y-2">
              {((b.socialLinks as Array<{platform: string; url: string}>) || []).map((link, i) => (
                <div key={i} className="flex gap-1">
                  <input type="text" value={link.platform} onChange={(e) => { const next = [...((b.socialLinks as Array<{platform: string; url: string}>) || [])]; next[i] = { ...next[i], platform: e.target.value }; onUpdate({ socialLinks: next } as Partial<Block>); }} className="w-24 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="plataforma" />
                  <input type="url" value={link.url} onChange={(e) => { const next = [...((b.socialLinks as Array<{platform: string; url: string}>) || [])]; next[i] = { ...next[i], url: e.target.value }; onUpdate({ socialLinks: next } as Partial<Block>); }} className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="https://" />
                  <button type="button" onClick={() => onUpdate({ socialLinks: ((b.socialLinks as Array<{platform: string; url: string}>) || []).filter((_, j) => j !== i) } as Partial<Block>)} className="px-2 text-xs text-destructive hover:underline">x</button>
                </div>
              ))}
              <button type="button" onClick={() => onUpdate({ socialLinks: [...((b.socialLinks as Array<{platform: string; url: string}>) || []), { platform: '', url: '' }] } as Partial<Block>)} className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50">+ Añadir enlace social</button>
            </div>
          </details>
          <details className="pt-2 border-t border-border mt-2">
            <summary className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground select-none py-1">
              <span className="material-icons text-sm">copyright</span>
              Copyright y aviso legal
            </summary>
            <div className="pt-3 space-y-2">
              <Field label="Copyright" value={(b.copyright as string) || ''} onChange={(v) => onUpdate({ copyright: v || undefined } as Partial<Block>)} />
              <TextareaField label="Aviso legal" value={(b.disclaimer as string) || ''} onChange={(v) => onUpdate({ disclaimer: v || undefined } as Partial<Block>)} rows={2} />
            </div>
          </details>
        </>
      )}

      {/* ── Navigation Block — presentational only; the nav tree itself is
           managed in the site's Navigation manager, not here. ── */}
      {block.type === 'navigation' && (
        <>
          <p className="text-xs text-muted-foreground">
            Los elementos del menú provienen del gestor de Navegación de este sitio. Este panel solo controla el aspecto de la barra.
          </p>
          <Field label="URL del logotipo" value={(b.logoUrl as string) || ''} onChange={(v) => onUpdate({ logoUrl: v || undefined } as Partial<Block>)} />
          <Field label="Texto alternativo del logotipo" value={(b.logoAlt as string) || ''} onChange={(v) => onUpdate({ logoAlt: v || undefined } as Partial<Block>)} />
          <Field label="Alto del logotipo" value={(b.logoHeight as string) || ''} onChange={(v) => onUpdate({ logoHeight: v || undefined } as Partial<Block>)} />
          <CheckboxField label="Fijo" checked={(b.sticky as boolean) ?? true} onChange={(v) => onUpdate({ sticky: v } as Partial<Block>)} />
          <Field label="Ancho máximo del contenedor" value={(b.containerMaxWidth as string) || ''} onChange={(v) => onUpdate({ containerMaxWidth: v || undefined } as Partial<Block>)} />
          <Field label="Familia de fuente" value={(b.fontFamily as string) || ''} onChange={(v) => onUpdate({ fontFamily: v || undefined } as Partial<Block>)} />
          <div className="grid grid-cols-3 gap-2">
            <ColorField label="Fondo" value={(b.backgroundColor as string) || ''} onChange={(v) => onUpdate({ backgroundColor: v || undefined } as Partial<Block>)} />
            <ColorField label="Enlace" value={(b.linkColor as string) || ''} onChange={(v) => onUpdate({ linkColor: v || undefined } as Partial<Block>)} />
            <ColorField label="Enlace al pasar el cursor" value={(b.linkHoverColor as string) || ''} onChange={(v) => onUpdate({ linkHoverColor: v || undefined } as Partial<Block>)} />
          </div>
          <Field label="Imagen de fondo (CSS)" value={(b.backgroundImage as string) || ''} onChange={(v) => onUpdate({ backgroundImage: v || undefined } as Partial<Block>)} />
          <details className="pt-2 border-t border-border mt-2" open>
            <summary className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground select-none py-1">
              <span className="material-icons text-sm">format_size</span>Tipografía del enlace</summary>
            <div className="pt-3 space-y-2">
              <p className="text-xs text-muted-foreground">Aplica solo a las etiquetas de los enlaces del menú de nivel superior — no al botón CTA.</p>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Tamaño de fuente" value={(b.linkFontSize as string) || ''} onChange={(v) => onUpdate({ linkFontSize: v || undefined } as Partial<Block>)} />
                <Field label="Estilo de fuente" value={(b.linkFontStyle as string) || ''} onChange={(v) => onUpdate({ linkFontStyle: v || undefined } as Partial<Block>)} />
                <Field label="Espaciado entre letras" value={(b.linkLetterSpacing as string) || ''} onChange={(v) => onUpdate({ linkLetterSpacing: v || undefined } as Partial<Block>)} />
              </div>
            </div>
          </details>
          <details className="pt-2 border-t border-border mt-2" open>
            <summary className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground select-none py-1">
              <span className="material-icons text-sm">smart_button</span>Botón CTA</summary>
            <div className="pt-3 space-y-2">
              <p className="text-xs text-muted-foreground">Se renderiza para cualquier elemento de menú de nivel superior marcado como botón en el gestor de navegación.</p>
              <div className="grid grid-cols-3 gap-2">
                <ColorField label="Fondo" value={(b.ctaBackgroundColor as string) || ''} onChange={(v) => onUpdate({ ctaBackgroundColor: v || undefined } as Partial<Block>)} />
                <ColorField label="Texto" value={(b.ctaTextColor as string) || ''} onChange={(v) => onUpdate({ ctaTextColor: v || undefined } as Partial<Block>)} />
                <ColorField label="Fondo al pasar el cursor" value={(b.ctaHoverBackgroundColor as string) || ''} onChange={(v) => onUpdate({ ctaHoverBackgroundColor: v || undefined } as Partial<Block>)} />
              </div>
              <Field label="Radio del borde" value={(b.ctaBorderRadius as string) || ''} onChange={(v) => onUpdate({ ctaBorderRadius: v || undefined } as Partial<Block>)} />
            </div>
          </details>
          <details className="pt-2 border-t border-border mt-2">
            <summary className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground select-none py-1">
              <span className="material-icons text-sm">arrow_drop_down_circle</span>
              Panel desplegable
            </summary>
            <div className="pt-3 grid grid-cols-2 gap-2">
              <ColorField label="Fondo" value={(b.dropdownBackgroundColor as string) || ''} onChange={(v) => onUpdate({ dropdownBackgroundColor: v || undefined } as Partial<Block>)} />
              <ColorField label="Enlace" value={(b.dropdownLinkColor as string) || ''} onChange={(v) => onUpdate({ dropdownLinkColor: v || undefined } as Partial<Block>)} />
            </div>
          </details>
        </>
      )}
    </>
  );
}
