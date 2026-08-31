'use client';

import MediaPicker from '@/components/admin/MediaPicker';
import type { Block } from '@/types/blocks';
import {
  Field,
  RichTextField,
  SelectField,
} from '../../panel-fields';
import { MarqueeEditor } from '../MarqueeEditor';
import { HeroSlideshowEditor } from '../HeroSlideshowEditor';
import type { PanelProps } from './ContentPanel';

// ─── Hero Panel — hero, hero-slideshow, cta, hero-cta, marquee ───────────────

export function HeroPanel({ block, onUpdate, siteId }: PanelProps) {
  const b = block as unknown as Record<string, unknown>;
  const mediaApi = siteId ? `/api/portal/cms/websites/${siteId}/media` : '/api/portal/media';
  return (
    <>
      {block.type === 'hero' && (
        <>
          <RichTextField label="Título" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Subtítulo" value={b.subtitle as string} onChange={(v) => onUpdate({ subtitle: v } as Partial<Block>)} singleLine />
          <RichTextField label="Descripción" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} tall />
          <Field label="Texto del CTA" value={b.ctaText as string} onChange={(v) => onUpdate({ ctaText: v } as Partial<Block>)} />
          <Field label="Enlace del CTA" value={b.ctaLink as string} onChange={(v) => onUpdate({ ctaLink: v } as Partial<Block>)} />
          <Field label="2nd CTA Text" value={b.secondaryCtaText as string} onChange={(v) => onUpdate({ secondaryCtaText: v } as Partial<Block>)} />
          <Field label="2nd CTA Link" value={b.secondaryCtaLink as string} onChange={(v) => onUpdate({ secondaryCtaLink: v } as Partial<Block>)} />
          <div><span className="text-xs font-medium text-muted-foreground">Imagen de fondo</span><MediaPicker value={b.backgroundImage as string} onChange={(v) => onUpdate({ backgroundImage: v } as Partial<Block>)} mimeTypeFilter="image" label="" apiEndpoint={mediaApi} /></div>
          <div><span className="text-xs font-medium text-muted-foreground">Video de fondo</span><MediaPicker value={b.backgroundVideo as string} onChange={(v) => onUpdate({ backgroundVideo: v } as Partial<Block>)} mimeTypeFilter="video" label="" apiEndpoint={mediaApi} /></div>
        </>
      )}
      {block.type === 'marquee' && (
        <MarqueeEditor block={block} onUpdate={onUpdate} siteId={siteId} />
      )}
      {block.type === 'hero-slideshow' && (
        <HeroSlideshowEditor block={block} onUpdate={onUpdate} siteId={siteId} />
      )}
      {block.type === 'cta' && (
        <>
          <RichTextField label="Título" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Descripción" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} tall />
          <Field label="Texto del botón" value={b.primaryButtonText as string} onChange={(v) => onUpdate({ primaryButtonText: v } as Partial<Block>)} />
          <Field label="URL del botón" value={b.primaryButtonUrl as string} onChange={(v) => onUpdate({ primaryButtonUrl: v } as Partial<Block>)} />
          <Field label="2nd Button Text" value={b.secondaryButtonText as string} onChange={(v) => onUpdate({ secondaryButtonText: v } as Partial<Block>)} />
          <Field label="2nd Button URL" value={b.secondaryButtonUrl as string} onChange={(v) => onUpdate({ secondaryButtonUrl: v } as Partial<Block>)} />
          {/* Background lives on the Style tab (backgroundColor) — VEQA-065.
              The `backgroundStyle` data field is retained for backward compat;
              CtaBlockRender defaults it to a branded gradient when unset. */}
        </>
      )}
      {block.type === 'hero-cta' && (
        <>
          <SelectField
            label="Diseño"
            value={(b.layout as string) || 'hero'}
            options={['hero', 'banner']}
            onChange={(v) => onUpdate({ layout: v } as Partial<Block>)}
          />
          <RichTextField label="Título" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          {b.layout !== 'banner' && (
            <RichTextField label="Subtítulo" value={b.subtitle as string} onChange={(v) => onUpdate({ subtitle: v } as Partial<Block>)} singleLine />
          )}
          <RichTextField label="Descripción" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} tall />
          <Field label="Texto del botón principal" value={b.primaryButtonText as string} onChange={(v) => onUpdate({ primaryButtonText: v } as Partial<Block>)} />
          <Field label="URL del botón principal" value={b.primaryButtonUrl as string} onChange={(v) => onUpdate({ primaryButtonUrl: v } as Partial<Block>)} />
          <Field label="2nd Button Text" value={b.secondaryButtonText as string} onChange={(v) => onUpdate({ secondaryButtonText: v } as Partial<Block>)} />
          <Field label="2nd Button URL" value={b.secondaryButtonUrl as string} onChange={(v) => onUpdate({ secondaryButtonUrl: v } as Partial<Block>)} />
          {b.layout !== 'banner' && (
            <>
              <div><span className="text-xs font-medium text-muted-foreground">Imagen de fondo</span><MediaPicker value={b.backgroundImage as string} onChange={(v) => onUpdate({ backgroundImage: v } as Partial<Block>)} mimeTypeFilter="image" label="" apiEndpoint={mediaApi} /></div>
              <div><span className="text-xs font-medium text-muted-foreground">Video de fondo</span><MediaPicker value={b.backgroundVideo as string} onChange={(v) => onUpdate({ backgroundVideo: v } as Partial<Block>)} mimeTypeFilter="video" label="" apiEndpoint={mediaApi} /></div>
            </>
          )}
          {b.layout === 'banner' && (
            <SelectField
              label="Estilo de fondo"
              value={(b.backgroundStyle as string) || 'gradient'}
              options={['gradient', 'solid', 'none']}
              onChange={(v) => onUpdate({ backgroundStyle: v } as Partial<Block>)}
            />
          )}
        </>
      )}
    </>
  );
}
