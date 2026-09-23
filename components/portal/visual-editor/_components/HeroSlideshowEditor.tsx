'use client';

import { useState } from 'react';
import type { Block } from '@/types/blocks';
import MediaPicker from '@/components/admin/MediaPicker';
import {
  Field,
  ColorField,
  TextareaField,
  RichTextField,
  SelectField,
  CheckboxField,
} from '../panel-fields';

// ─── Hero Slideshow Editor ──────────────────────────────────────────────────

export function HeroSlideshowEditor({ block, onUpdate, siteId }: { block: Block; onUpdate: (updates: Partial<Block>) => void; siteId?: number }) {
  const b = block as unknown as Record<string, unknown>;
  const slides = (b.slides as Array<Record<string, unknown>>) || [];
  const [activeSlide, setActiveSlide] = useState(0);
  const slide = slides[activeSlide] as Record<string, unknown> | undefined;
  const mediaApi = siteId ? `/api/portal/cms/websites/${siteId}/media` : '/api/portal/media';

  function updateSlide(index: number, updates: Record<string, unknown>) {
    const newSlides = slides.map((s, i) => i === index ? { ...s, ...updates } : s);
    onUpdate({ slides: newSlides } as Partial<Block>);
  }

  function addSlide() {
    const newSlide = { id: `slide-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title: 'Nueva diapositiva', textAlignment: 'center' };
    onUpdate({ slides: [...slides, newSlide] } as Partial<Block>);
    setActiveSlide(slides.length);
  }

  function removeSlide(index: number) {
    if (slides.length <= 1) return;
    const newSlides = slides.filter((_, i) => i !== index);
    onUpdate({ slides: newSlides } as Partial<Block>);
    if (activeSlide >= newSlides.length) setActiveSlide(newSlides.length - 1);
  }

  return (
    <div className="space-y-3">
      <div>
        <span className="text-xs font-medium text-muted-foreground">Diapositivas</span>
        <div className="flex flex-wrap gap-1 mt-1">
          {slides.map((_, i) => (
            <button key={i} type="button" onClick={() => setActiveSlide(i)}
              className={`px-2.5 py-1 text-xs font-medium rounded ${i === activeSlide ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
            >{i + 1}</button>
          ))}
          <button type="button" onClick={addSlide} className="px-2.5 py-1 text-xs rounded bg-muted text-muted-foreground hover:text-foreground">+</button>
        </div>
        {slides.length > 1 && (
          <button type="button" onClick={() => removeSlide(activeSlide)} className="text-xs text-destructive hover:underline mt-1">Eliminar diapositiva {activeSlide + 1}</button>
        )}
      </div>

      {slide && (
        <>
          <RichTextField label="Título" value={(slide.title as string) || ''} onChange={(v) => updateSlide(activeSlide, { title: v })} singleLine />
          <Field label="Subtítulo" value={(slide.subtitle as string) || ''} onChange={(v) => updateSlide(activeSlide, { subtitle: v })} />
          <TextareaField label="Descripción" value={(slide.description as string) || ''} onChange={(v) => updateSlide(activeSlide, { description: v })} rows={3} />
          <Field label="Texto del CTA" value={(slide.ctaText as string) || ''} onChange={(v) => updateSlide(activeSlide, { ctaText: v })} />
          <Field label="Enlace del CTA" value={(slide.ctaLink as string) || ''} onChange={(v) => updateSlide(activeSlide, { ctaLink: v })} />
          <Field label="Texto del CTA 2" value={(slide.secondaryCtaText as string) || ''} onChange={(v) => updateSlide(activeSlide, { secondaryCtaText: v })} />
          <Field label="Enlace del CTA 2" value={(slide.secondaryCtaLink as string) || ''} onChange={(v) => updateSlide(activeSlide, { secondaryCtaLink: v })} />
          <div><span className="text-xs font-medium text-muted-foreground">Imagen de fondo</span><MediaPicker value={(slide.backgroundImage as string) || ''} onChange={(v) => updateSlide(activeSlide, { backgroundImage: v })} mimeTypeFilter="image" label="" apiEndpoint={mediaApi} /></div>
          <SelectField label="Tamaño del fondo" value={(slide.backgroundSize as string) || 'cover'} options={['cover','contain','auto','50%','100%','150%','200%']} onChange={(v) => updateSlide(activeSlide, { backgroundSize: v })} />
          <Field label="Posición del fondo" value={(slide.backgroundPosition as string) || 'center'} onChange={(v) => updateSlide(activeSlide, { backgroundPosition: v })} />
          <SelectField label="Repetición del fondo" value={(slide.backgroundRepeat as string) || 'no-repeat'} options={['no-repeat','repeat','repeat-x','repeat-y','space','round']} onChange={(v) => updateSlide(activeSlide, { backgroundRepeat: v })} />
          <Field label="URL del video" value={(slide.backgroundVideo as string) || ''} onChange={(v) => updateSlide(activeSlide, { backgroundVideo: v })} />
          <ColorField label="Color de la superposición" value={(slide.overlayColor as string) || 'rgba(0,0,0,0.45)'} onChange={(v) => updateSlide(activeSlide, { overlayColor: v })} />
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs font-medium text-muted-foreground">Opacidad de la superposición</span>
              <span className="text-[10px] text-muted-foreground font-mono">{Math.round(((slide.overlayOpacity as number) ?? 1) * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={(slide.overlayOpacity as number) ?? 1}
              onChange={(e) => updateSlide(activeSlide, { overlayOpacity: parseFloat(e.target.value) })}
              className="w-full h-1.5 rounded-full appearance-none bg-border cursor-pointer accent-primary"
            />
          </div>
          <SelectField label="Alineación del texto" value={(slide.textAlignment as string) || 'center'} options={['left','center','right']} onChange={(v) => updateSlide(activeSlide, { textAlignment: v })} />
        </>
      )}

      <div className="border-t border-border pt-3 space-y-2">
        <span className="text-xs font-medium text-muted-foreground">Ajustes del slideshow</span>
        <SelectField label="Transición" value={(b.transition as string) || 'fade'} options={['fade','slide','zoom']} onChange={(v) => onUpdate({ transition: v } as Partial<Block>)} />
        <Field label="Alto" value={(b.height as string) || '90vh'} onChange={(v) => onUpdate({ height: v } as Partial<Block>)} />
        <Field label="Intervalo (ms)" value={String((b.interval as number) || 6000)} onChange={(v) => onUpdate({ interval: Number(v) || 6000 } as Partial<Block>)} />
        <Field label="Duración de la transición (ms)" value={String((b.transitionDuration as number) || 800)} onChange={(v) => onUpdate({ transitionDuration: Number(v) || 800 } as Partial<Block>)} />
        <CheckboxField label="Reproducción automática" checked={(b.autoplay as boolean) ?? true} onChange={(v) => onUpdate({ autoplay: v } as Partial<Block>)} />
        <CheckboxField label="Mostrar puntos" checked={(b.showDots as boolean) ?? true} onChange={(v) => onUpdate({ showDots: v } as Partial<Block>)} />
        <CheckboxField label="Mostrar flechas" checked={(b.showArrows as boolean) ?? true} onChange={(v) => onUpdate({ showArrows: v } as Partial<Block>)} />
        <CheckboxField label="Efecto Ken Burns" checked={(b.kenBurns as boolean) ?? true} onChange={(v) => onUpdate({ kenBurns: v } as Partial<Block>)} />
        <CheckboxField label="Pausa al pasar el cursor" checked={(b.pauseOnHover as boolean) ?? true} onChange={(v) => onUpdate({ pauseOnHover: v } as Partial<Block>)} />
        <Field label="URL del video de fondo (nivel de deck)" value={(b.backgroundVideo as string) || ''} onChange={(v) => onUpdate({ backgroundVideo: v || undefined } as Partial<Block>)} />
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs font-medium text-muted-foreground">Opacidad del video de fondo</span>
            <span className="text-[10px] text-muted-foreground font-mono">{Math.round(((b.backgroundVideoOpacity as number) ?? 1) * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={(b.backgroundVideoOpacity as number) ?? 1}
            onChange={(e) => onUpdate({ backgroundVideoOpacity: parseFloat(e.target.value) } as Partial<Block>)}
            className="w-full h-1.5 rounded-full appearance-none bg-border cursor-pointer accent-primary"
          />
        </div>
      </div>

      {/* Navigation Colors */}
      <div className="border-t border-border pt-3 space-y-2">
        <span className="text-xs font-medium text-muted-foreground">Colores de navegación</span>
        <ColorField label="Color de las flechas" value={(b.arrowColor as string) || '#fff'} onChange={(v) => onUpdate({ arrowColor: v } as Partial<Block>)} />
        <ColorField label="Fondo de las flechas" value={(b.arrowBackground as string) || 'rgba(255,255,255,0.12)'} onChange={(v) => onUpdate({ arrowBackground: v } as Partial<Block>)} />
        <ColorField label="Borde de las flechas" value={(b.arrowBorderColor as string) || 'rgba(255,255,255,0.2)'} onChange={(v) => onUpdate({ arrowBorderColor: v } as Partial<Block>)} />
        <ColorField label="Color de los puntos" value={(b.dotColor as string) || 'rgba(255,255,255,0.4)'} onChange={(v) => onUpdate({ dotColor: v } as Partial<Block>)} />
        <ColorField label="Punto activo" value={(b.dotActiveColor as string) || '#fff'} onChange={(v) => onUpdate({ dotActiveColor: v } as Partial<Block>)} />
        <ColorField label="Barra de progreso" value={(b.progressBarColor as string) || 'rgba(255,255,255,0.5)'} onChange={(v) => onUpdate({ progressBarColor: v } as Partial<Block>)} />
      </div>
    </div>
  );
}
