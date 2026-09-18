'use client';

// Settings panel for the `HeroSlideshowBlockSettings` block type, extracted from the BlockSettings monolith.
import type { HeroSlideshowBlock, HeroSlideshowSlide } from '@/types/blocks';
import { useState } from 'react';
import MediaPicker from '@/components/admin/MediaPicker';
import { TokenColorPicker } from '@/components/blocks/visual/TokenColorPicker';
import { RichTextEditable } from '@/components/blocks/visual/RichTextEditable';

export function HeroSlideshowBlockSettings({ block, onChange }: { block: HeroSlideshowBlock; onChange: (updates: Partial<HeroSlideshowBlock>) => void }) {
  const [activeSlide, setActiveSlide] = useState(0);
  const slides = block.slides || [];
  const slide = slides[activeSlide];
  const [showImagePicker, setShowImagePicker] = useState(false);

  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  const selectClass = inputClass;

  function updateSlide(index: number, updates: Partial<HeroSlideshowSlide>) {
    const newSlides = slides.map((s, i) => i === index ? { ...s, ...updates } : s);
    onChange({ slides: newSlides });
  }

  function addSlide() {
    const newSlide: HeroSlideshowSlide = {
      id: `slide-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: 'New Slide',
      textAlignment: 'center',
    };
    onChange({ slides: [...slides, newSlide] });
    setActiveSlide(slides.length);
  }

  function removeSlide(index: number) {
    if (slides.length <= 1) return;
    const newSlides = slides.filter((_, i) => i !== index);
    onChange({ slides: newSlides });
    if (activeSlide >= newSlides.length) setActiveSlide(newSlides.length - 1);
  }

  function moveSlide(from: number, direction: -1 | 1) {
    const to = from + direction;
    if (to < 0 || to >= slides.length) return;
    const newSlides = [...slides];
    [newSlides[from], newSlides[to]] = [newSlides[to], newSlides[from]];
    onChange({ slides: newSlides });
    setActiveSlide(to);
  }

  return (
    <div className="space-y-4">
      {/* Slide tabs */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Diapositivas</label>
        <div className="flex flex-wrap gap-1 mb-2">
          {slides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setActiveSlide(i)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                i === activeSlide ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {i + 1}
            </button>
          ))}
          <button onClick={addSlide} className="px-3 py-1.5 text-xs font-medium rounded-md bg-muted text-muted-foreground hover:text-foreground">
            +
          </button>
        </div>
        {slides.length > 1 && (
          <div className="flex gap-1 mb-2">
            <button onClick={() => moveSlide(activeSlide, -1)} disabled={activeSlide === 0} className="px-2 py-1 text-xs rounded border border-border disabled:opacity-30">
              <span className="material-icons text-xs">arrow_back</span>
            </button>
            <button onClick={() => moveSlide(activeSlide, 1)} disabled={activeSlide === slides.length - 1} className="px-2 py-1 text-xs rounded border border-border disabled:opacity-30">
              <span className="material-icons text-xs">arrow_forward</span>
            </button>
            <button onClick={() => removeSlide(activeSlide)} className="px-2 py-1 text-xs rounded border border-border text-destructive hover:bg-destructive/10 ml-auto">
              <span className="material-icons text-xs">delete</span>
            </button>
          </div>
        )}
      </div>

      {/* Active slide content */}
      {slide && (
        <div className="space-y-3 border-t border-border pt-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Título</label>
            <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
              <RichTextEditable html={slide.title} onChange={(html) => updateSlide(activeSlide, { title: html })} singleLine placeholder="Título de la diapositiva" className="text-sm text-foreground" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Subtítulo</label>
            <input type="text" value={slide.subtitle || ''} onChange={(e) => updateSlide(activeSlide, { subtitle: e.target.value })} className={inputClass} placeholder="Subtítulo opcional" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Descripción</label>
            <textarea value={slide.description || ''} onChange={(e) => updateSlide(activeSlide, { description: e.target.value })} className={`${inputClass} min-h-[60px] resize-y`} placeholder="Descripción opcional" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Texto del CTA</label>
              <input type="text" value={slide.ctaText || ''} onChange={(e) => updateSlide(activeSlide, { ctaText: e.target.value })} className={inputClass} placeholder="Texto del botón" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Enlace del CTA</label>
              <input type="text" value={slide.ctaLink || ''} onChange={(e) => updateSlide(activeSlide, { ctaLink: e.target.value })} className={inputClass} placeholder="/page" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Texto secundario</label>
              <input type="text" value={slide.secondaryCtaText || ''} onChange={(e) => updateSlide(activeSlide, { secondaryCtaText: e.target.value })} className={inputClass} placeholder="Opcional" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Enlace secundario</label>
              <input type="text" value={slide.secondaryCtaLink || ''} onChange={(e) => updateSlide(activeSlide, { secondaryCtaLink: e.target.value })} className={inputClass} placeholder="Opcional" />
            </div>
          </div>

          {/* Background */}
          <div className="border-t border-border pt-3">
            <label className="block text-sm font-medium text-foreground mb-2">Imagen de fondo</label>
            {slide.backgroundImage ? (
              <div className="space-y-2">
                <img src={slide.backgroundImage} alt="Fondo de la diapositiva" className="w-full h-24 object-cover rounded border border-border" />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowImagePicker(true)} className="flex-1 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90">Cambiar</button>
                  <button type="button" onClick={() => updateSlide(activeSlide, { backgroundImage: '' })} className="px-3 py-1.5 text-xs border border-border rounded hover:bg-accent">Quitar</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setShowImagePicker(true)} className="w-full px-3 py-6 text-sm border border-dashed border-border rounded-lg text-muted-foreground hover:bg-accent/50 transition-colors">
                Elegir imagen
              </button>
            )}
            {showImagePicker && (
              <div className="mt-2">
                <MediaPicker value={slide.backgroundImage || ''} onChange={(url) => { updateSlide(activeSlide, { backgroundImage: url }); setShowImagePicker(false); }} label="Fondo de la diapositiva" mimeTypeFilter="image" />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">URL del vídeo de fondo</label>
            <input type="text" value={slide.backgroundVideo || ''} onChange={(e) => updateSlide(activeSlide, { backgroundVideo: e.target.value })} className={inputClass} placeholder="https://...mp4 (opcional)" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <TokenColorPicker
                label="Color de superposición"
                value={slide.overlayColor || ''}
                onChange={(v) => updateSlide(activeSlide, { overlayColor: v })}
                placeholder="rgba(0,0,0,0.45)"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Alineación del texto</label>
              <select value={slide.textAlignment || 'center'} onChange={(e) => updateSlide(activeSlide, { textAlignment: e.target.value as 'left' | 'center' | 'right' })} className={selectClass}>
                <option value="left">Izquierda</option>
                <option value="center">Centrado</option>
                <option value="right">Derecha</option>
              </select>
            </div>
          </div>

          {/* Per-slide Advanced */}
          <details className="border border-border rounded">
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-foreground hover:bg-accent/40">
              Avanzado (tamaño de fondo y opacidad de superposición)
            </summary>
            <div className="px-3 pb-3 pt-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Tamaño de fondo</label>
                  <select
                    value={slide.backgroundSize || 'cover'}
                    onChange={(e) => updateSlide(activeSlide, { backgroundSize: e.target.value as HeroSlideshowSlide['backgroundSize'] })}
                    className={selectClass}
                  >
                    <option value="cover">cover</option>
                    <option value="contain">contain</option>
                    <option value="auto">auto</option>
                    <option value="50%">50%</option>
                    <option value="100%">100%</option>
                    <option value="150%">150%</option>
                    <option value="200%">200%</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Repetición de fondo</label>
                  <select
                    value={slide.backgroundRepeat || 'no-repeat'}
                    onChange={(e) => updateSlide(activeSlide, { backgroundRepeat: e.target.value as HeroSlideshowSlide['backgroundRepeat'] })}
                    className={selectClass}
                  >
                    <option value="no-repeat">no-repeat</option>
                    <option value="repeat">repeat</option>
                    <option value="repeat-x">repeat-x</option>
                    <option value="repeat-y">repeat-y</option>
                    <option value="space">space</option>
                    <option value="round">round</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Posición de fondo</label>
                <input
                  type="text"
                  value={slide.backgroundPosition || ''}
                  onChange={(e) => updateSlide(activeSlide, { backgroundPosition: e.target.value || undefined })}
                  className={inputClass}
                  placeholder='p. ej. "center", "top", "50% 30%"'
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Opacidad de superposición</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={slide.overlayOpacity ?? 0.45}
                  onChange={(e) => updateSlide(activeSlide, { overlayOpacity: parseFloat(e.target.value) })}
                  className="w-full"
                />
                <span className="text-xs text-muted-foreground">{slide.overlayOpacity ?? 0.45}</span>
              </div>
            </div>
          </details>
        </div>
      )}

      {/* Persistent background video */}
      <div className="border-t border-border pt-3 space-y-3">
        <label className="block text-sm font-medium text-foreground">Vídeo de fondo</label>
        <p className="text-xs text-muted-foreground">Se reproduce de forma continua bajo todas las diapositivas. No por diapositiva.</p>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">URL del vídeo</label>
          <input type="text" value={block.backgroundVideo || ''} onChange={(e) => onChange({ backgroundVideo: e.target.value || undefined })} className={inputClass} placeholder="https://...mp4 (opcional)" />
        </div>
        {block.backgroundVideo && (
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Opacidad del vídeo</label>
            <input type="range" min="0" max="1" step="0.05" value={block.backgroundVideoOpacity ?? 1} onChange={(e) => onChange({ backgroundVideoOpacity: parseFloat(e.target.value) })} className="w-full" />
            <span className="text-xs text-muted-foreground">{block.backgroundVideoOpacity ?? 1}</span>
          </div>
        )}
      </div>

      {/* Slideshow settings */}
      <div className="border-t border-border pt-3 space-y-3">
        <label className="block text-sm font-medium text-foreground">Ajustes del carrusel</label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Transición</label>
            <select value={block.transition || 'fade'} onChange={(e) => onChange({ transition: e.target.value as 'fade' | 'slide' | 'zoom' })} className={selectClass}>
              <option value="fade">Fundido</option>
              <option value="slide">Deslizar</option>
              <option value="zoom">Zoom</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Alto</label>
            <input type="text" value={block.height || '90vh'} onChange={(e) => onChange({ height: e.target.value })} className={inputClass} placeholder="90vh" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Intervalo (ms)</label>
            <input type="number" value={block.interval || 6000} onChange={(e) => onChange({ interval: parseInt(e.target.value) || 6000 })} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Transición (ms)</label>
            <input type="number" value={block.transitionDuration || 800} onChange={(e) => onChange({ transitionDuration: parseInt(e.target.value) || 800 })} className={inputClass} />
          </div>
        </div>
        <div className="space-y-2">
          {[
            { key: 'autoplay', label: 'Reproducción automática', defaultVal: true },
            { key: 'showDots', label: 'Mostrar puntos', defaultVal: true },
            { key: 'showArrows', label: 'Mostrar flechas', defaultVal: true },
            { key: 'pauseOnHover', label: 'Pausar al pasar el cursor', defaultVal: true },
            { key: 'kenBurns', label: 'Efecto Ken Burns', defaultVal: true },
          ].map(({ key, label, defaultVal }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={(block as unknown as Record<string, unknown>)[key] as boolean ?? defaultVal}
                onChange={(e) => onChange({ [key]: e.target.checked } as Partial<HeroSlideshowBlock>)}
                className="rounded border-border"
              />
              <span className="text-sm text-foreground">{label}</span>
            </label>
          ))}
        </div>

        {/* Deck-level Advanced (nav colors) */}
        <details className="border border-border rounded">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-foreground hover:bg-accent/40">
            Colores de navegación avanzados
          </summary>
          <div className="px-3 pb-3 pt-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <TokenColorPicker
                label="Color de flecha"
                value={block.arrowColor || ''}
                onChange={(v) => onChange({ arrowColor: v || undefined })}
              />
              <TokenColorPicker
                label="Fondo de flecha"
                value={block.arrowBackground || ''}
                onChange={(v) => onChange({ arrowBackground: v || undefined })}
              />
            </div>
            <TokenColorPicker
              label="Color del borde de flecha"
              value={block.arrowBorderColor || ''}
              onChange={(v) => onChange({ arrowBorderColor: v || undefined })}
            />
            <div className="grid grid-cols-2 gap-2">
              <TokenColorPicker
                label="Color de punto"
                value={block.dotColor || ''}
                onChange={(v) => onChange({ dotColor: v || undefined })}
              />
              <TokenColorPicker
                label="Color de punto activo"
                value={block.dotActiveColor || ''}
                onChange={(v) => onChange({ dotActiveColor: v || undefined })}
              />
            </div>
            <TokenColorPicker
              label="Color de la barra de progreso"
              value={block.progressBarColor || ''}
              onChange={(v) => onChange({ progressBarColor: v || undefined })}
            />
          </div>
        </details>
      </div>

      {/* Stats Bar */}
      <div className="border-t border-border pt-3 space-y-3">
        <label className="block text-sm font-medium text-foreground">Barra de estadísticas</label>
        <p className="text-xs text-muted-foreground">Se muestra en la parte inferior del hero.</p>
        {(block.stats || []).map((stat, i) => (
          <div key={stat.id} className="flex gap-2 items-start">
            <div className="flex-1 space-y-1">
              <input
                type="text"
                value={stat.value}
                onChange={(e) => {
                  const newStats = [...(block.stats || [])];
                  newStats[i] = { ...newStats[i], value: e.target.value };
                  onChange({ stats: newStats });
                }}
                className={inputClass}
                placeholder="Valor (p. ej. 22+)"
              />
              <input
                type="text"
                value={stat.label}
                onChange={(e) => {
                  const newStats = [...(block.stats || [])];
                  newStats[i] = { ...newStats[i], label: e.target.value };
                  onChange({ stats: newStats });
                }}
                className={inputClass}
                placeholder="Etiqueta"
              />
            </div>
            <button
              onClick={() => {
                const newStats = (block.stats || []).filter((_, j) => j !== i);
                onChange({ stats: newStats });
              }}
              className="px-2 py-1 text-xs rounded border border-border text-destructive hover:bg-destructive/10 mt-1"
            >
              <span className="material-icons text-xs">delete</span>
            </button>
          </div>
        ))}
        <button
          onClick={() => {
            const newStat = { id: `stat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, value: '', label: '' };
            onChange({ stats: [...(block.stats || []), newStat] });
          }}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        >
          + Añadir estadística
        </button>
      </div>
    </div>
  );
}
