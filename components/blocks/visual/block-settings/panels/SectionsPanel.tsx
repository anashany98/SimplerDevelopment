'use client';

// SectionsPanel: dispatcher for related block types' settings panels.
import type { Block, CtaBlock, ServicesGridBlock, StatsBlock, TestimonialBlock, SocialLinksBlock, LogoStripBlock, MetricCardsBlock, FlipCardGridBlock, TimelineBlock, TeamShowcaseBlock, TeamFlipGridBlock, BentoGridBlock, BentoCard, HeroBlock, HeroSlideshowBlock, HeroSlideshowSlide, SiteFooterBlock, HeroCtaBlock, NavigationBlock } from '@/types/blocks';
import type { Breakpoint } from '@/types/responsive';
import { useState } from 'react';
import MediaPicker from '@/components/admin/MediaPicker';
import { TokenColorPicker } from '@/components/blocks/visual/TokenColorPicker';
import { RichTextEditable } from '@/components/blocks/visual/RichTextEditable';
import { HeroBlockSettings } from './HeroSettings';
import { HeroSlideshowBlockSettings } from './HeroSlideshowSettings';
import { SiteFooterBlockSettings } from './SiteFooterSettings';
import { NavigationBlockSettings } from './NavigationSettings';
import { TeamShowcaseBlockSettings, TeamFlipGridBlockSettings } from './TeamSettings';
import { HeroCtaBlockSettings } from './HeroCtaSettings';

interface PanelProps {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
  currentViewport: Breakpoint;
}

export function SectionsPanel({ block, onChange, currentViewport }: PanelProps) {
  switch (block.type) {
    case 'hero':
      return <HeroBlockSettings block={block as HeroBlock} onChange={onChange as (u: Partial<HeroBlock>) => void} currentViewport={currentViewport} />;
    case 'hero-slideshow':
      return <HeroSlideshowBlockSettings block={block as HeroSlideshowBlock} onChange={onChange as (u: Partial<HeroSlideshowBlock>) => void} />;
    case 'services-grid':
      return <ServicesGridBlockSettings block={block as ServicesGridBlock} onChange={onChange as (u: Partial<ServicesGridBlock>) => void} currentViewport={currentViewport} />;
    case 'cta':
      return <CtaBlockSettings block={block as CtaBlock} onChange={onChange as (u: Partial<CtaBlock>) => void} currentViewport={currentViewport} />;
    case 'hero-cta':
      return <HeroCtaBlockSettings block={block as HeroCtaBlock} onChange={onChange as (u: Partial<HeroCtaBlock>) => void} currentViewport={currentViewport} />;
    case 'testimonial':
      return <TestimonialBlockSettings block={block as TestimonialBlock} onChange={onChange as (u: Partial<TestimonialBlock>) => void} currentViewport={currentViewport} />;
    case 'stats':
      return <StatsBlockSettings block={block as StatsBlock} onChange={onChange as (u: Partial<StatsBlock>) => void} currentViewport={currentViewport} />;
    case 'social-links':
      return <SocialLinksBlockSettings block={block as SocialLinksBlock} onChange={onChange as (u: Partial<SocialLinksBlock>) => void} />;
    case 'logo-strip':
      return <LogoStripBlockSettings block={block as LogoStripBlock} onChange={onChange as (u: Partial<LogoStripBlock>) => void} />;
    case 'metric-cards':
      return <MetricCardsBlockSettings block={block as MetricCardsBlock} onChange={onChange as (u: Partial<MetricCardsBlock>) => void} />;
    case 'flip-card-grid':
      return <FlipCardGridBlockSettings block={block as FlipCardGridBlock} onChange={onChange as (u: Partial<FlipCardGridBlock>) => void} />;
    case 'timeline':
      return <TimelineBlockSettings block={block as TimelineBlock} onChange={onChange as (u: Partial<TimelineBlock>) => void} />;
    case 'team-showcase':
      return <TeamShowcaseBlockSettings block={block as TeamShowcaseBlock} onChange={onChange as (u: Partial<TeamShowcaseBlock>) => void} />;
    case 'team-flip-grid':
      return <TeamFlipGridBlockSettings block={block as TeamFlipGridBlock} onChange={onChange as (u: Partial<TeamFlipGridBlock>) => void} />;
    case 'bento-grid':
      return <BentoGridBlockSettings block={block as BentoGridBlock} onChange={onChange as (u: Partial<BentoGridBlock>) => void} />;
    case 'site-footer':
      return <SiteFooterBlockSettings block={block as SiteFooterBlock} onChange={onChange as (u: Partial<SiteFooterBlock>) => void} />;
    case 'navigation':
      return <NavigationBlockSettings block={block as NavigationBlock} onChange={onChange as (u: Partial<NavigationBlock>) => void} />;
    default:
      return null;
  }
}

function CtaBlockSettings({ block, onChange, currentViewport }: { block: CtaBlock; onChange: (updates: Partial<CtaBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Título</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title} onChange={(html) => onChange({ title: html })} singleLine placeholder="Título del CTA" className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Descripción</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[60px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} placeholder="Descripción opcional" className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Estilo de fondo</label>
        <select
          value={block.backgroundStyle || 'gradient'}
          onChange={(e) => onChange({ backgroundStyle: e.target.value as CtaBlock['backgroundStyle'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="gradient">Degradado</option>
          <option value="solid">Sólido</option>
          <option value="none">Ninguno</option>
        </select>
      </div>

      <div className="space-y-3 pt-3 border-t border-border">
        <h4 className="text-sm font-semibold text-foreground">Botón principal</h4>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Texto del botón</label>
          <input
            type="text"
            value={block.primaryButtonText}
            onChange={(e) => onChange({ primaryButtonText: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">URL del botón</label>
          <input
            type="text"
            value={block.primaryButtonUrl}
            onChange={(e) => onChange({ primaryButtonUrl: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          />
        </div>
      </div>

      <div className="space-y-3 pt-3 border-t border-border">
        <h4 className="text-sm font-semibold text-foreground">Botón secundario (opcional)</h4>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Texto del botón</label>
          <input
            type="text"
            value={block.secondaryButtonText || ''}
            onChange={(e) => onChange({ secondaryButtonText: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            placeholder="Opcional"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">URL del botón</label>
          <input
            type="text"
            value={block.secondaryButtonUrl || ''}
            onChange={(e) => onChange({ secondaryButtonUrl: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            placeholder="Opcional"
          />
        </div>
      </div>
    </div>
  );
}

function ServicesGridBlockSettings({ block, onChange, currentViewport }: { block: ServicesGridBlock; onChange: (updates: Partial<ServicesGridBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Antetítulo</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.overline || ''} onChange={(html) => onChange({ overline: html || undefined })} singleLine placeholder="NUESTROS SERVICIOS" className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Título de la sección</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Título de la sección..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Descripción de la sección</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} singleLine placeholder="Descripción de la sección..." className="text-sm text-foreground" />
        </div>
      </div>
      <div className="border-t border-border pt-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Número de columnas</label>
        <select
          value={block.columns || 3}
          onChange={(e) => onChange({ columns: parseInt(e.target.value) as ServicesGridBlock['columns'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="2">2 columnas</option>
          <option value="3">3 columnas</option>
          <option value="4">4 columnas</option>
        </select>
      </div>
      </div>
      <div>
        <TokenColorPicker
          label="Color de acento"
          value={block.accentColor || ''}
          onChange={(v) => onChange({ accentColor: v || undefined })}
          placeholder="Primario de marca"
        />
        <p className="text-xs text-muted-foreground mt-1">Se usa para iconos, viñetas y la flecha del enlace.</p>
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Servicios</label>
        {(block.services || []).map((service, i) => (
          <div key={service.id ?? i} className="space-y-1 p-2 rounded border border-border">
            <input
              type="text"
              value={service.title}
              onChange={(e) => {
                const next = [...(block.services || [])];
                next[i] = { ...next[i], title: e.target.value };
                onChange({ services: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold"
              placeholder="Título del servicio"
            />
            <textarea
              value={service.description}
              onChange={(e) => {
                const next = [...(block.services || [])];
                next[i] = { ...next[i], description: e.target.value };
                onChange({ services: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Descripción del servicio"
              rows={2}
            />
            <input
              type="text"
              value={service.icon || ''}
              onChange={(e) => {
                const next = [...(block.services || [])];
                next[i] = { ...next[i], icon: e.target.value || undefined };
                onChange({ services: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Nombre del icono Material (p. ej. 'design_services')"
            />
            <input
              type="url"
              value={service.image || ''}
              onChange={(e) => {
                const next = [...(block.services || [])];
                next[i] = { ...next[i], image: e.target.value || undefined };
                onChange({ services: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="URL de la imagen del servicio (opcional)"
            />
            <input
              type="url"
              value={service.link || ''}
              onChange={(e) => {
                const next = [...(block.services || [])];
                next[i] = { ...next[i], link: e.target.value || undefined };
                onChange({ services: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="URL del enlace (opcional)"
            />
            <input
              type="text"
              value={service.linkText || ''}
              onChange={(e) => {
                const next = [...(block.services || [])];
                next[i] = { ...next[i], linkText: e.target.value || undefined };
                onChange({ services: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder='Texto del CTA (predeterminado "Saber más")'
            />
            <button
              type="button"
              onClick={() => onChange({ services: (block.services || []).filter((_, j) => j !== i) })}
              className="text-xs text-destructive hover:underline"
            >Quitar</button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ services: [...(block.services || []), { id: `service-${Date.now()}`, title: 'Nuevo servicio', description: '', bullets: [] }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Añadir servicio
        </button>
        <p className="text-xs text-muted-foreground">Las viñetas de cada servicio se editan desde el editor del iframe (BlockContentEditor). El array de viñetas se conserva en el ciclo de ida y vuelta.</p>
      </div>
    </div>
  );
}

function StatsBlockSettings({ block, onChange, currentViewport }: { block: StatsBlock; onChange: (updates: Partial<StatsBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Título de la sección</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Título de la sección..." className="text-sm text-foreground" />
        </div>
      </div>
      <div className="border-t border-border pt-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Número de columnas</label>
        <select
          value={block.columns || 3}
          onChange={(e) => onChange({ columns: parseInt(e.target.value) as StatsBlock['columns'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="2">2 columnas</option>
          <option value="3">3 columnas</option>
          <option value="4">4 columnas</option>
        </select>
      </div>
      </div>
    </div>
  );
}

function TestimonialBlockSettings({ block, onChange, currentViewport }: { block: TestimonialBlock; onChange: (updates: Partial<TestimonialBlock>) => void; currentViewport: Breakpoint }) {
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Cita</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[60px]">
          <RichTextEditable html={block.quote} onChange={(html) => onChange({ quote: html })} placeholder="Escribe la cita del testimonio..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Nombre del autor</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.author} onChange={(html) => onChange({ author: html })} singleLine placeholder="Nombre del autor..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Cargo</label>
        <input
          type="text"
          value={block.role || ''}
          onChange={(e) => onChange({ role: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Cargo..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Empresa</label>
        <input
          type="text"
          value={block.company || ''}
          onChange={(e) => onChange({ company: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Empresa..."
        />
      </div>

      <div className="border-t border-border pt-4">
        <label className="block text-sm font-medium text-foreground mb-2">Avatar (opcional)</label>
        {block.avatar ? (
          <div className="space-y-2">
            <img
              src={block.avatar}
              alt="Avatar"
              className="w-20 h-20 rounded-full object-cover border border-border"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowMediaPicker(true)}
                className="flex-1 px-3 py-2 text-sm bg-foreground text-background rounded hover:bg-foreground/90"
              >
                Cambiar avatar
              </button>
              <button
                type="button"
                onClick={() => onChange({ avatar: '' })}
                className="px-3 py-2 text-sm bg-background border border-border text-foreground rounded hover:bg-accent"
              >Quitar</button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowMediaPicker(true)}
            className="w-full p-8 border-2 border-dashed border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors text-center"
          >
            <span className="material-icons text-5xl text-muted-foreground/20 mb-2">person</span>
            <p className="text-sm text-muted-foreground">Haz clic para seleccionar un avatar</p>
          </button>
        )}
      </div>

      {showMediaPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={() => setShowMediaPicker(false)}>
          <div className="bg-white dark:bg-gray-900 border border-border rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <MediaPicker
              value={block.avatar || ''}
              onChange={(url) => {
                onChange({ avatar: url });
                setShowMediaPicker(false);
              }}
              label="Seleccionar avatar"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SocialLinksBlockSettings({ block, onChange }: { block: SocialLinksBlock; onChange: (updates: Partial<SocialLinksBlock>) => void }) {
  const PLATFORMS: Array<SocialLinksBlock['links'][number]['platform']> = ['facebook', 'twitter', 'instagram', 'linkedin', 'youtube', 'tiktok'];
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Tamaño del icono (px)</label>
        <select
          value={block.iconSize ?? 32}
          onChange={(e) => onChange({ iconSize: Number(e.target.value) })}
          className={inputClass}
        >
          <option value={24}>24</option>
          <option value={32}>32</option>
          <option value={40}>40</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Alineación</label>
        <select
          value={block.alignment ?? 'center'}
          onChange={(e) => onChange({ alignment: e.target.value as SocialLinksBlock['alignment'] })}
          className={inputClass}
        >
          <option value="left">Izquierda</option>
          <option value="center">Centrado</option>
          <option value="right">Derecha</option>
        </select>
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Enlaces</label>
        {(block.links || []).map((link, i) => (
          <div key={i} className="flex gap-2 items-start">
            <select
              value={link.platform}
              onChange={(e) => {
                const next = [...(block.links || [])];
                next[i] = { ...next[i], platform: e.target.value as SocialLinksBlock['links'][number]['platform'] };
                onChange({ links: next });
              }}
              className="text-xs rounded border border-border bg-background px-2 py-2 text-foreground"
            >
              {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input
              type="url"
              value={link.url}
              onChange={(e) => {
                const next = [...(block.links || [])];
                next[i] = { ...next[i], url: e.target.value };
                onChange({ links: next });
              }}
              className="flex-1 text-xs rounded border border-border bg-background px-2 py-2 text-foreground"
              placeholder="https://"
            />
            <button
              type="button"
              onClick={() => onChange({ links: (block.links || []).filter((_, j) => j !== i) })}
              className="px-2 py-2 text-xs rounded border border-border text-destructive hover:bg-destructive/10"
              title="Eliminar enlace"
            >
              <span className="material-icons text-xs">delete</span>
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ links: [...(block.links || []), { platform: 'facebook', url: '' }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Añadir enlace
        </button>
      </div>
    </div>
  );
}

function LogoStripBlockSettings({ block, onChange }: { block: LogoStripBlock; onChange: (updates: Partial<LogoStripBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Antetítulo (texto de apoyo)</label>
        <input
          type="text"
          value={block.overline || ''}
          onChange={(e) => onChange({ overline: e.target.value || undefined })}
          className={inputClass}
          placeholder="p. ej. USADO POR MÁS DE 100 EQUIPOS"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Columnas</label>
          <select
            value={block.columns || 6}
            onChange={(e) => onChange({ columns: Number(e.target.value) as LogoStripBlock['columns'] })}
            className={inputClass}
          >
            {[3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Espaciado</label>
          <select
            value={block.gap || 'lg'}
            onChange={(e) => onChange({ gap: e.target.value as LogoStripBlock['gap'] })}
            className={inputClass}
          >
            <option value="sm">Pequeño</option>
            <option value="md">Media</option>
            <option value="lg">Grande</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Alineación</label>
          <select
            value={block.alignment || 'center'}
            onChange={(e) => onChange({ alignment: e.target.value as LogoStripBlock['alignment'] })}
            className={inputClass}
          >
            <option value="left">Izquierda</option>
            <option value="center">Centrado</option>
            <option value="right">Derecha</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Altura del logotipo</label>
          <input
            type="text"
            value={block.logoHeight || '40px'}
            onChange={(e) => onChange({ logoHeight: e.target.value })}
            className={inputClass}
            placeholder="40px"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={block.grayscale ?? true}
          onChange={(e) => onChange({ grayscale: e.target.checked })}
          className="rounded border-border"
        />
        Escala de grises (color al pasar el cursor)
      </label>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Logotipos</label>
        {(block.logos || []).map((logo, i) => (
          <div key={logo.id ?? i} className="space-y-1 p-2 rounded border border-border">
            <input
              type="url"
              value={logo.imageUrl}
              onChange={(e) => {
                const next = [...(block.logos || [])];
                next[i] = { ...next[i], imageUrl: e.target.value };
                onChange({ logos: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="URL de la imagen"
            />
            <input
              type="text"
              value={logo.alt}
              onChange={(e) => {
                const next = [...(block.logos || [])];
                next[i] = { ...next[i], alt: e.target.value };
                onChange({ logos: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Texto alternativo"
            />
            <input
              type="url"
              value={logo.link || ''}
              onChange={(e) => {
                const next = [...(block.logos || [])];
                next[i] = { ...next[i], link: e.target.value || undefined };
                onChange({ logos: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="URL del enlace (opcional)"
            />
            <button
              type="button"
              onClick={() => onChange({ logos: (block.logos || []).filter((_, j) => j !== i) })}
              className="text-xs text-destructive hover:underline"
            >Quitar</button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ logos: [...(block.logos || []), { id: `logo-${Date.now()}`, imageUrl: '', alt: '' }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Añadir logotipo
        </button>
      </div>
    </div>
  );
}

function MetricCardsBlockSettings({ block, onChange }: { block: MetricCardsBlock; onChange: (updates: Partial<MetricCardsBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  const [logoPickerFor, setLogoPickerFor] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Antetítulo</label>
        <input
          type="text"
          value={block.overline || ''}
          onChange={(e) => onChange({ overline: e.target.value || undefined })}
          className={inputClass}
          placeholder="p. ej. PUNTOS CLAVE"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Título de la sección</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Título de la sección..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Descripción</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} singleLine placeholder="Descripción..." className="text-sm text-foreground" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Columnas</label>
          <select
            value={block.columns || 4}
            onChange={(e) => onChange({ columns: Number(e.target.value) as MetricCardsBlock['columns'] })}
            className={inputClass}
          >
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Color de acento</label>
          <TokenColorPicker value={block.accentColor || ''} onChange={(color) => onChange({ accentColor: color || undefined })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Ancho de la columna del logotipo</label>
          <input
            type="text"
            value={block.logoColumnWidth || ''}
            onChange={(e) => onChange({ logoColumnWidth: e.target.value || undefined })}
            className={inputClass}
            placeholder="auto, 240px, 16rem…"
          />
          <p className="text-xs text-muted-foreground mt-1">Ancho CSS de la columna del logo del pie. Déjalo en blanco para el predeterminado.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Ancho máximo de la etiqueta</label>
          <input
            type="text"
            value={block.labelMaxWidth || ''}
            onChange={(e) => onChange({ labelMaxWidth: e.target.value || undefined })}
            className={inputClass}
            placeholder="32rem, 480px…"
          />
          <p className="text-xs text-muted-foreground mt-1">Limita el ancho de la etiqueta de métrica. Déjalo en blanco para el predeterminado.</p>
        </div>
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Métricas</label>
        {(block.metrics || []).map((metric, i) => (
          <div key={metric.id ?? i} className="space-y-1 p-2 rounded border border-border">
            <input
              type="text"
              value={metric.value}
              onChange={(e) => {
                const next = [...(block.metrics || [])];
                next[i] = { ...next[i], value: e.target.value };
                onChange({ metrics: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold"
              placeholder='Valor grande, p. ej. "83%"'
            />
            <input
              type="text"
              value={metric.label}
              onChange={(e) => {
                const next = [...(block.metrics || [])];
                next[i] = { ...next[i], label: e.target.value };
                onChange({ metrics: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Etiqueta pequeña"
            />
            <input
              type="text"
              value={metric.institution || ''}
              onChange={(e) => {
                const next = [...(block.metrics || [])];
                next[i] = { ...next[i], institution: e.target.value || undefined };
                onChange({ metrics: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Texto del pie (opcional)"
            />
            <div className="flex items-center gap-2">
              {metric.institutionLogo && (
                <img src={metric.institutionLogo} alt="" className="h-6 w-auto object-contain rounded border border-border" />
              )}
              <button
                type="button"
                onClick={() => setLogoPickerFor(String(metric.id ?? i))}
                className="flex-1 px-2 py-1.5 text-xs rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
              >
                {metric.institutionLogo ? 'Cambiar logotipo del pie' : 'Seleccionar logotipo del pie (opcional)'}
              </button>
              {metric.institutionLogo && (
                <button
                  type="button"
                  onClick={() => {
                    const next = [...(block.metrics || [])];
                    next[i] = { ...next[i], institutionLogo: undefined };
                    onChange({ metrics: next });
                  }}
                  className="px-2 py-1.5 text-xs rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
                >Quitar</button>
              )}
            </div>
            {logoPickerFor === String(metric.id ?? i) && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={() => setLogoPickerFor(null)}>
                <div className="bg-white dark:bg-gray-900 border border-border rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                  <MediaPicker
                    value={metric.institutionLogo || ''}
                    onChange={(url) => {
                      const next = [...(block.metrics || [])];
                      next[i] = { ...next[i], institutionLogo: url || undefined };
                      onChange({ metrics: next });
                      setLogoPickerFor(null);
                    }}
                    label="Seleccionar logotipo del pie"
                  />
                </div>
              </div>
            )}
            <input
              type="url"
              value={metric.link || ''}
              onChange={(e) => {
                const next = [...(block.metrics || [])];
                next[i] = { ...next[i], link: e.target.value || undefined };
                onChange({ metrics: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="URL del enlace (opcional)"
            />
            <input
              type="text"
              value={metric.linkText || ''}
              onChange={(e) => {
                const next = [...(block.metrics || [])];
                next[i] = { ...next[i], linkText: e.target.value || undefined };
                onChange({ metrics: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder='Texto del CTA (predeterminado "Caso de éxito")'
            />
            <button
              type="button"
              onClick={() => onChange({ metrics: (block.metrics || []).filter((_, j) => j !== i) })}
              className="text-xs text-destructive hover:underline"
            >Quitar</button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ metrics: [...(block.metrics || []), { id: `metric-${Date.now()}`, value: '', label: '' }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Añadir métrica
        </button>
      </div>
    </div>
  );
}

function FlipCardGridBlockSettings({ block, onChange }: { block: FlipCardGridBlock; onChange: (updates: Partial<FlipCardGridBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Antetítulo</label>
        <input
          type="text"
          value={block.overline || ''}
          onChange={(e) => onChange({ overline: e.target.value || undefined })}
          className={inputClass}
          placeholder="p. ej. POR QUÉ SOMOS DIFERENTES"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Título de la sección</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Título de la sección..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Descripción</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} singleLine placeholder="Descripción..." className="text-sm text-foreground" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Columnas</label>
          <select
            value={block.columns || 3}
            onChange={(e) => onChange({ columns: Number(e.target.value) as FlipCardGridBlock['columns'] })}
            className={inputClass}
          >
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Altura de la tarjeta</label>
          <input
            type="text"
            value={block.cardHeight || '280px'}
            onChange={(e) => onChange({ cardHeight: e.target.value })}
            className={inputClass}
            placeholder="280px"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Disparador de giro</label>
          <select
            value={block.flipTrigger || 'hover'}
            onChange={(e) => onChange({ flipTrigger: e.target.value as FlipCardGridBlock['flipTrigger'] })}
            className={inputClass}
          >
            <option value="hover">Al pasar el cursor</option>
            <option value="click">Clic</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Eje de giro</label>
          <select
            value={block.flipAxis || 'horizontal'}
            onChange={(e) => onChange({ flipAxis: e.target.value as FlipCardGridBlock['flipAxis'] })}
            className={inputClass}
          >
            <option value="horizontal">Horizontal (eje Y)</option>
            <option value="vertical">Vertical (eje X)</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Color de acento predeterminado</label>
        <TokenColorPicker value={block.accentColor || ''} onChange={(color) => onChange({ accentColor: color || undefined })} />
        <p className="text-xs text-muted-foreground mt-1">Se usa en cualquier tarjeta que no tenga su propio color de acento más abajo.</p>
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Tarjetas</label>
        {(block.cards || []).map((card, i) => (
          <div key={card.id ?? i} className="space-y-1 p-2 rounded border border-border">
            <input
              type="text"
              value={card.frontTitle}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], frontTitle: e.target.value };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold"
              placeholder="Título del anverso"
            />
            <input
              type="text"
              value={card.frontSubtitle || ''}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], frontSubtitle: e.target.value || undefined };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Subtítulo del anverso (opcional)"
            />
            <input
              type="text"
              value={card.frontIcon || ''}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], frontIcon: e.target.value || undefined };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Nombre del icono Material (p. ej. trending_up)"
            />
            <input
              type="url"
              value={card.frontImage || ''}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], frontImage: e.target.value || undefined };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="URL de la imagen del anverso (opcional)"
            />
            <textarea
              value={card.backText}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], backText: e.target.value };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Texto del reverso"
              rows={2}
            />
            <input
              type="url"
              value={card.backLink || ''}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], backLink: e.target.value || undefined };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="URL del enlace del reverso (opcional)"
            />
            <input
              type="text"
              value={card.backLinkText || ''}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], backLinkText: e.target.value || undefined };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Texto del enlace del reverso (opcional)"
            />
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Color de acento (opcional — sustituye el predeterminado de arriba)</label>
              <TokenColorPicker
                value={card.accentColor || ''}
                onChange={(color) => {
                  const next = [...(block.cards || [])];
                  next[i] = { ...next[i], accentColor: color || undefined };
                  onChange({ cards: next });
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => onChange({ cards: (block.cards || []).filter((_, j) => j !== i) })}
              className="text-xs text-destructive hover:underline"
            >Quitar</button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ cards: [...(block.cards || []), { id: `flipcard-${Date.now()}`, frontTitle: '', backText: '' }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Añadir tarjeta
        </button>
      </div>
    </div>
  );
}

function TimelineBlockSettings({ block, onChange }: { block: TimelineBlock; onChange: (updates: Partial<TimelineBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Antetítulo</label>
        <input
          type="text"
          value={block.overline || ''}
          onChange={(e) => onChange({ overline: e.target.value || undefined })}
          className={inputClass}
          placeholder="p. ej. NUESTRO PROCESO"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Título de la sección</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Título de la sección..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Subtítulo</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.subtitle || ''} onChange={(html) => onChange({ subtitle: html || undefined })} singleLine placeholder="Subtítulo..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Diseño</label>
        <select
          value={block.layout || 'alternating'}
          onChange={(e) => onChange({ layout: e.target.value as TimelineBlock['layout'] })}
          className={inputClass}
        >
          <option value="alternating">Alternado (zigzag)</option>
          <option value="left">Alineado a la izquierda</option>
        </select>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Color de la línea</label>
          <TokenColorPicker value={block.lineColor || ''} onChange={(color) => onChange({ lineColor: color || undefined })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Color del número</label>
          <TokenColorPicker value={block.numberColor || ''} onChange={(color) => onChange({ numberColor: color || undefined })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Color del nodo</label>
          <TokenColorPicker value={block.nodeColor || ''} onChange={(color) => onChange({ nodeColor: color || undefined })} />
        </div>
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Pasos</label>
        {(block.steps || []).map((step, i) => (
          <div key={step.id ?? i} className="space-y-1 p-2 rounded border border-border">
            <input
              type="text"
              value={step.number || ''}
              onChange={(e) => {
                const next = [...(block.steps || [])];
                next[i] = { ...next[i], number: e.target.value || undefined };
                onChange({ steps: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Número (p. ej. 01) — opcional"
            />
            <input
              type="text"
              value={step.icon || ''}
              onChange={(e) => {
                const next = [...(block.steps || [])];
                next[i] = { ...next[i], icon: e.target.value || undefined };
                onChange({ steps: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Nombre del icono Material (opcional, alternativa al número)"
            />
            <input
              type="text"
              value={step.title}
              onChange={(e) => {
                const next = [...(block.steps || [])];
                next[i] = { ...next[i], title: e.target.value };
                onChange({ steps: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold"
              placeholder="Título del paso"
            />
            <textarea
              value={step.description}
              onChange={(e) => {
                const next = [...(block.steps || [])];
                next[i] = { ...next[i], description: e.target.value };
                onChange({ steps: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Descripción del paso"
              rows={2}
            />
            <button
              type="button"
              onClick={() => onChange({ steps: (block.steps || []).filter((_, j) => j !== i) })}
              className="text-xs text-destructive hover:underline"
            >Quitar</button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ steps: [...(block.steps || []), { id: `step-${Date.now()}`, title: '', description: '' }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Añadir paso
        </button>
      </div>
    </div>
  );
}

function BentoGridBlockSettings({ block, onChange }: { block: BentoGridBlock; onChange: (updates: Partial<BentoGridBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Antetítulo</label>
        <input
          type="text"
          value={block.overline || ''}
          onChange={(e) => onChange({ overline: e.target.value || undefined })}
          className={inputClass}
          placeholder="p. ej. CAPACIDADES"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Título de la sección</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Título de la sección..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Subtítulo</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.subtitle || ''} onChange={(html) => onChange({ subtitle: html || undefined })} singleLine placeholder="Subtítulo..." className="text-sm text-foreground" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Columnas</label>
          <select
            value={block.columns || 2}
            onChange={(e) => onChange({ columns: Number(e.target.value) })}
            className={inputClass}
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Fondo oscuro</label>
          <TokenColorPicker value={block.darkBg || ''} onChange={(color) => onChange({ darkBg: color || undefined })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Borde claro</label>
          <TokenColorPicker value={block.lightBorder || ''} onChange={(color) => onChange({ lightBorder: color || undefined })} />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Color de acento</label>
        <TokenColorPicker value={block.accentColor || ''} onChange={(color) => onChange({ accentColor: color || undefined })} />
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Tarjetas</label>
        {(block.cards || []).map((card, i) => (
          <div key={card.id ?? i} className="space-y-1 p-2 rounded border border-border">
            <input
              type="text"
              value={card.title}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], title: e.target.value };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold"
              placeholder="Título"
            />
            <input
              type="text"
              value={card.lead || ''}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], lead: e.target.value || undefined };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground italic"
              placeholder="Entradilla/pregunta (opcional)"
            />
            <textarea
              value={(card.items || []).join('\n')}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], items: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Elementos de viñeta (uno por línea)"
              rows={3}
            />
            <input
              type="url"
              value={card.link || ''}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], link: e.target.value || undefined };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="URL del enlace (opcional)"
            />
            <input
              type="text"
              value={card.linkText || ''}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], linkText: e.target.value || undefined };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Texto del enlace (opcional)"
            />
            <div className="flex gap-2">
              <select
                value={card.variant || 'dark'}
                onChange={(e) => {
                  const next = [...(block.cards || [])];
                  next[i] = { ...next[i], variant: e.target.value as BentoCard['variant'] };
                  onChange({ cards: next });
                }}
                className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              >
                <option value="dark">Oscuro</option>
                <option value="light">Claro</option>
              </select>
              <input
                type="number"
                min={1}
                max={12}
                value={card.span ?? 6}
                onChange={(e) => {
                  const next = [...(block.cards || [])];
                  next[i] = { ...next[i], span: Number(e.target.value) };
                  onChange({ cards: next });
                }}
                className="w-20 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
                placeholder="Columnas"
              />
            </div>
            <button
              type="button"
              onClick={() => onChange({ cards: (block.cards || []).filter((_, j) => j !== i) })}
              className="text-xs text-destructive hover:underline"
            >Quitar</button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ cards: [...(block.cards || []), { id: `bento-${Date.now()}`, title: '', items: [], variant: 'dark', span: 6 }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Añadir tarjeta
        </button>
      </div>
    </div>
  );
}

