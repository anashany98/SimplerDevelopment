'use client';

// DynamicPanel: dispatcher for related block types' settings panels.
import type { Block, BlogPostsBlock, CardGridBlock, FeaturedContentBlock, ProductGridBlock, FeaturedProductsBlock, ProductCategoriesBlock, ShoppingCartBlock, ProductDetailBlock, StoreBannerBlock, AccordionBlock, TabsBlock } from '@/types/blocks';
import type { Breakpoint } from '@/types/responsive';
import { useState } from 'react';
import MediaPicker from '@/components/admin/MediaPicker';
import { TokenColorPicker } from '@/components/blocks/visual/TokenColorPicker';
import { RichTextEditable } from '@/components/blocks/visual/RichTextEditable';

interface PanelProps {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
  currentViewport: Breakpoint;
}

export function DynamicPanel({ block, onChange, currentViewport }: PanelProps) {
  switch (block.type) {
    case 'blog-posts':
      return <BlogPostsBlockSettings block={block as BlogPostsBlock} onChange={onChange as (u: Partial<BlogPostsBlock>) => void} currentViewport={currentViewport} />;
    case 'card-grid':
      return <CardGridBlockSettings block={block as CardGridBlock} onChange={onChange as (u: Partial<CardGridBlock>) => void} currentViewport={currentViewport} />;
    case 'featured-content':
      return <FeaturedContentBlockSettings block={block as FeaturedContentBlock} onChange={onChange as (u: Partial<FeaturedContentBlock>) => void} currentViewport={currentViewport} />;
    case 'accordion':
      return <AccordionBlockSettings block={block as AccordionBlock} onChange={onChange as (u: Partial<AccordionBlock>) => void} currentViewport={currentViewport} />;
    case 'product-grid':
      return <ProductGridBlockSettings block={block as ProductGridBlock} onChange={onChange as (u: Partial<ProductGridBlock>) => void} />;
    case 'featured-products':
      return <FeaturedProductsBlockSettings block={block as FeaturedProductsBlock} onChange={onChange as (u: Partial<FeaturedProductsBlock>) => void} />;
    case 'product-categories':
      return <ProductCategoriesBlockSettings block={block as ProductCategoriesBlock} onChange={onChange as (u: Partial<ProductCategoriesBlock>) => void} />;
    case 'shopping-cart':
      return <ShoppingCartBlockSettings block={block as ShoppingCartBlock} onChange={onChange as (u: Partial<ShoppingCartBlock>) => void} />;
    case 'store-banner':
      return <StoreBannerBlockSettings block={block as StoreBannerBlock} onChange={onChange as (u: Partial<StoreBannerBlock>) => void} />;
    case 'product-detail':
      return <ProductDetailBlockSettings block={block as ProductDetailBlock} onChange={onChange as (u: Partial<ProductDetailBlock>) => void} />;
    case 'tabs':
      return <TabsBlockSettings block={block as TabsBlock} onChange={onChange as (u: Partial<TabsBlock>) => void} />;
    default:
      return null;
  }
}

function BlogPostsBlockSettings({ block, onChange, currentViewport }: { block: BlogPostsBlock; onChange: (updates: Partial<BlogPostsBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Título de la sección</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Título de sección..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Descripción de la sección</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} singleLine placeholder="Descripción de sección..." className="text-sm text-foreground" />
        </div>
      </div>
      <div className="border-t border-border pt-4">
        <label className="block text-sm font-medium text-foreground mb-2">Tipo de post</label>
        <input
          type="text"
          value={block.postType || ''}
          onChange={(e) => onChange({ postType: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Déjalo vacío para todos los posts"
        />
        <p className="text-xs text-muted-foreground mt-1">Filtra por tipo de post (opcional). Ponlo en <span className="font-mono">category</span> para habilitar el filtro por categoría de abajo.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Slug de categoría</label>
        <input
          type="text"
          value={block.categorySlug || ''}
          onChange={(e) => onChange({ categorySlug: e.target.value || undefined })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="p. ej. noticias-de-empresa"
        />
        <p className="text-xs text-muted-foreground mt-1">Activo cuando el tipo de post es <span className="font-mono">category</span>.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Número de posts</label>
        <input
          type="number"
          value={block.limit || 3}
          onChange={(e) => onChange({ limit: parseInt(e.target.value) })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          min="1"
          max="12"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Columnas</label>
        <select
          value={block.columns || 3}
          onChange={(e) => onChange({ columns: parseInt(e.target.value) as BlogPostsBlock['columns'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="2">2 columnas</option>
          <option value="3">3 columnas</option>
        </select>
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="showExcerpt"
          checked={block.showExcerpt !== false}
          onChange={(e) => onChange({ showExcerpt: e.target.checked })}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
        />
        <label htmlFor="showExcerpt" className="ml-2 text-sm text-foreground">
          Mostrar extracto
        </label>
      </div>
    </div>
  );
}

function CardGridBlockSettings({ block, onChange, currentViewport }: { block: CardGridBlock; onChange: (updates: Partial<CardGridBlock>) => void; currentViewport: Breakpoint }) {
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const updateCard = (cardId: string, updates: Partial<CardGridBlock['cards'][number]>) =>
    onChange({ cards: (block.cards || []).map((c) => (c.id === cardId ? { ...c, ...updates } : c)) });

  return (
    <div className="space-y-4">
      <div><label className="block text-sm font-medium text-foreground mb-1">Título de la sección</label><div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]"><RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Título de sección..." className="text-sm text-foreground" /></div></div>
      <div><label className="block text-sm font-medium text-foreground mb-1">Descripción de la sección</label><div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]"><RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} singleLine placeholder="Descripción de sección..." className="text-sm text-foreground" /></div></div>
      <div className="border-t border-border pt-4">
        <label className="block text-sm font-medium text-foreground mb-2">Número de columnas</label>
        <select value={block.columns || 3} onChange={(e) => onChange({ columns: parseInt(e.target.value) as CardGridBlock['columns'] })} className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground">
          <option value="2">2 columnas</option><option value="3">3 columnas</option><option value="4">4 columnas</option>
        </select>
      </div>

      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground mb-1">Colores de iconos de tarjeta</label>
        {(block.cards || []).map((card, index) => (
          <div key={card.id} className="border border-border rounded-md overflow-hidden">
            <button type="button" onClick={() => setExpandedCardId(expandedCardId === card.id ? null : card.id)} className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent transition-colors"><span className="font-medium">Tarjeta {index + 1}{card.title ? ` — ${card.title}` : ''}</span><span className="material-icons text-base text-muted-foreground">{expandedCardId === card.id ? 'expand_less' : 'expand_more'}</span></button>
            {expandedCardId === card.id && <div className="px-3 pb-3 pt-3 border-t border-border"><TokenColorPicker label="Color del icono" value={card.iconColor || ''} onChange={(color) => updateCard(card.id, { iconColor: color || undefined })} placeholder="Predeterminado (primario)" /></div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function FeaturedContentBlockSettings({ block, onChange, currentViewport }: { block: FeaturedContentBlock; onChange: (updates: Partial<FeaturedContentBlock>) => void; currentViewport: Breakpoint }) {
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Título</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title} onChange={(html) => onChange({ title: html })} singleLine placeholder="Título..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Descripción</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[60px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} placeholder="Descripción..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Texto del botón</label>
        <input
          type="text"
          value={block.buttonText || ''}
          onChange={(e) => onChange({ buttonText: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Texto del botón..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">URL del botón</label>
        <input
          type="text"
          value={block.buttonUrl || ''}
          onChange={(e) => onChange({ buttonUrl: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="/url..."
        />
      </div>
      <div className="border-t border-border pt-4">
        <label className="block text-sm font-medium text-foreground mb-2">Imagen destacada</label>
        {block.imageUrl ? (
          <div className="space-y-2">
            <img
              src={block.imageUrl}
              alt="Destacada"
              className="w-full h-32 object-cover rounded border border-border"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowMediaPicker(true)}
                className="flex-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
              >
                Cambiar imagen
              </button>
              <button
                type="button"
                onClick={() => onChange({ imageUrl: '' })}
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
            <span className="material-icons text-5xl text-muted-foreground/20 mb-2">image</span>
            <p className="text-sm text-muted-foreground">Haz clic para seleccionar una imagen</p>
          </button>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Posición de la imagen</label>
        <select
          value={block.imagePosition || 'right'}
          onChange={(e) => onChange({ imagePosition: e.target.value as FeaturedContentBlock['imagePosition'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="left">Izquierda</option>
          <option value="right">Derecha</option>
        </select>
      </div>

      <div className="space-y-3 pt-3 border-t border-border">
        <h4 className="text-sm font-semibold text-foreground">Llamada a la acción (opcional)</h4>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Texto del botón</label>
          <input
            type="text"
            value={block.buttonText || ''}
            onChange={(e) => onChange({ buttonText: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            placeholder="Saber más"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">URL del botón</label>
          <input
            type="text"
            value={block.buttonUrl || ''}
            onChange={(e) => onChange({ buttonUrl: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            placeholder="/learn-more"
          />
        </div>
      </div>

      {showMediaPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={() => setShowMediaPicker(false)}>
          <div className="bg-white dark:bg-gray-900 border border-border rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <MediaPicker
              value={block.imageUrl || ''}
              onChange={(url) => {
                onChange({ imageUrl: url });
                setShowMediaPicker(false);
              }}
              label="Seleccionar imagen destacada"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ProductGridBlockSettings({ block, onChange }: { block: ProductGridBlock; onChange: (updates: Partial<ProductGridBlock>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Título de la sección</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Título de sección opcional..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Descripción de la sección</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} singleLine placeholder="Descripción opcional..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Filtro de categoría</label>
        <input
          type="text"
          value={block.categorySlug || ''}
          onChange={(e) => onChange({ categorySlug: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Déjalo vacío para todos los productos"
        />
        <p className="text-xs text-muted-foreground mt-1">Slug de categoría por el que filtrar</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Ordenar por</label>
        <select
          value={block.sort || 'newest'}
          onChange={(e) => onChange({ sort: e.target.value as ProductGridBlock['sort'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="newest">Más recientes</option>
          <option value="price_asc">Precio: de menor a mayor</option>
          <option value="price_desc">Precio: de mayor a menor</option>
          <option value="featured">Destacados</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Número de productos</label>
        <input
          type="number"
          value={block.limit || 6}
          onChange={(e) => onChange({ limit: parseInt(e.target.value) })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          min="1"
          max="24"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Columnas</label>
        <select
          value={block.columns || 3}
          onChange={(e) => onChange({ columns: parseInt(e.target.value) as ProductGridBlock['columns'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="2">2 columnas</option>
          <option value="3">3 columnas</option>
          <option value="4">4 columnas</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Texto del botón</label>
        <input
          type="text"
          value={block.buttonText || ''}
          onChange={(e) => onChange({ buttonText: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="p. ej. Añadir al carrito"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center">
          <input type="checkbox" id="pgShowPrice" checked={block.showPrice !== false} onChange={(e) => onChange({ showPrice: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pgShowPrice" className="ml-2 text-sm text-foreground">Mostrar precio</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="pgShowDesc" checked={block.showDescription === true} onChange={(e) => onChange({ showDescription: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pgShowDesc" className="ml-2 text-sm text-foreground">Mostrar descripción</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="pgShowCat" checked={block.showCategory === true} onChange={(e) => onChange({ showCategory: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pgShowCat" className="ml-2 text-sm text-foreground">Mostrar categoría</label>
        </div>
      </div>
    </div>
  );
}

function FeaturedProductsBlockSettings({ block, onChange }: { block: FeaturedProductsBlock; onChange: (updates: Partial<FeaturedProductsBlock>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Título de la sección</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Optional section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Descripción de la sección</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} singleLine placeholder="Optional description..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Número de productos</label>
        <input
          type="number"
          value={block.limit || 4}
          onChange={(e) => onChange({ limit: parseInt(e.target.value) })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          min="1"
          max="12"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Columnas</label>
        <select
          value={block.columns || 4}
          onChange={(e) => onChange({ columns: parseInt(e.target.value) as FeaturedProductsBlock['columns'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="2">2 columnas</option>
          <option value="3">3 columnas</option>
          <option value="4">4 columnas</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Texto de la insignia</label>
        <input
          type="text"
          value={block.badgeText || ''}
          onChange={(e) => onChange({ badgeText: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Destacado"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Texto del botón</label>
        <input
          type="text"
          value={block.buttonText || ''}
          onChange={(e) => onChange({ buttonText: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="p. ej. Comprar ahora"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center">
          <input type="checkbox" id="fpShowPrice" checked={block.showPrice !== false} onChange={(e) => onChange({ showPrice: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="fpShowPrice" className="ml-2 text-sm text-foreground">Mostrar precio</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="fpShowBadge" checked={block.showBadge !== false} onChange={(e) => onChange({ showBadge: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="fpShowBadge" className="ml-2 text-sm text-foreground">Mostrar insignia</label>
        </div>
      </div>
    </div>
  );
}

function ProductCategoriesBlockSettings({ block, onChange }: { block: ProductCategoriesBlock; onChange: (updates: Partial<ProductCategoriesBlock>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Título de la sección</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Título de sección opcional..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Descripción de la sección</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} singleLine placeholder="Descripción opcional..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Diseño</label>
        <select
          value={block.layout || 'grid'}
          onChange={(e) => onChange({ layout: e.target.value as ProductCategoriesBlock['layout'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="grid">Cuadrícula</option>
          <option value="list">Lista</option>
        </select>
      </div>

      {block.layout !== 'list' && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Columnas</label>
          <select
            value={block.columns || 3}
            onChange={(e) => onChange({ columns: parseInt(e.target.value) as ProductCategoriesBlock['columns'] })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          >
            <option value="2">2 columnas</option>
            <option value="3">3 columnas</option>
            <option value="4">4 columnas</option>
          </select>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center">
          <input type="checkbox" id="pcShowCount" checked={block.showProductCount !== false} onChange={(e) => onChange({ showProductCount: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pcShowCount" className="ml-2 text-sm text-foreground">Mostrar número de productos</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="pcShowImage" checked={block.showImage !== false} onChange={(e) => onChange({ showImage: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pcShowImage" className="ml-2 text-sm text-foreground">Mostrar imagen</label>
        </div>
      </div>
    </div>
  );
}

function ShoppingCartBlockSettings({ block, onChange }: { block: ShoppingCartBlock; onChange: (updates: Partial<ShoppingCartBlock>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Estilo del carrito</label>
        <select
          value={block.variant || 'full'}
          onChange={(e) => onChange({ variant: e.target.value as ShoppingCartBlock['variant'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="full">Carrito completo</option>
          <option value="mini">Carrito mini</option>
          <option value="icon-only">Solo icono</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Texto del botón de pago</label>
        <input
          type="text"
          value={block.checkoutButtonText || ''}
          onChange={(e) => onChange({ checkoutButtonText: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Ir a pagar"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Mensaje de carrito vacío</label>
        <input
          type="text"
          value={block.emptyCartMessage || ''}
          onChange={(e) => onChange({ emptyCartMessage: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Tu carrito está vacío"
        />
      </div>

      <div className="flex items-center">
        <input type="checkbox" id="scShowSubtotal" checked={block.showSubtotal !== false} onChange={(e) => onChange({ showSubtotal: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
        <label htmlFor="scShowSubtotal" className="ml-2 text-sm text-foreground">Mostrar subtotal</label>
      </div>
    </div>
  );
}

function ProductDetailBlockSettings({ block, onChange }: { block: ProductDetailBlock; onChange: (updates: Partial<ProductDetailBlock>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Slug del producto</label>
        <input
          type="text"
          value={block.productSlug || ''}
          onChange={(e) => onChange({ productSlug: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="p. ej. cena-en-el-club"
        />
        <p className="text-xs text-muted-foreground mt-1">El slug de URL del producto a mostrar</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Diseño</label>
        <select
          value={block.layout || 'standard'}
          onChange={(e) => onChange({ layout: e.target.value as ProductDetailBlock['layout'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="standard">Estándar (2 columnas)</option>
          <option value="compact">Compacto (imagen pequeña)</option>
          <option value="wide">Ancho (apilado)</option>
        </select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center">
          <input type="checkbox" id="pdShowGallery" checked={block.showGallery !== false} onChange={(e) => onChange({ showGallery: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pdShowGallery" className="ml-2 text-sm text-foreground">Mostrar galería de imágenes</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="pdShowDescription" checked={block.showDescription !== false} onChange={(e) => onChange({ showDescription: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pdShowDescription" className="ml-2 text-sm text-foreground">Mostrar descripción completa</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="pdShowVariants" checked={block.showVariants !== false} onChange={(e) => onChange({ showVariants: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pdShowVariants" className="ml-2 text-sm text-foreground">Mostrar opciones de variante</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="pdShowAddToCart" checked={block.showAddToCart !== false} onChange={(e) => onChange({ showAddToCart: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pdShowAddToCart" className="ml-2 text-sm text-foreground">Mostrar añadir al carrito</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="pdShowBulkPricing" checked={block.showBulkPricing !== false} onChange={(e) => onChange({ showBulkPricing: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pdShowBulkPricing" className="ml-2 text-sm text-foreground">Mostrar precios por volumen</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="pdShowBreadcrumb" checked={block.showBreadcrumb !== false} onChange={(e) => onChange({ showBreadcrumb: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pdShowBreadcrumb" className="ml-2 text-sm text-foreground">Mostrar ruta de navegación</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="pdShowTags" checked={block.showTags !== false} onChange={(e) => onChange({ showTags: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pdShowTags" className="ml-2 text-sm text-foreground">Mostrar etiquetas y SKU</label>
        </div>
      </div>
    </div>
  );
}

function StoreBannerBlockSettings({ block, onChange }: { block: StoreBannerBlock; onChange: (updates: Partial<StoreBannerBlock>) => void }) {
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Título</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title} onChange={(html) => onChange({ title: html })} singleLine placeholder="Título del banner..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Subtítulo</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.subtitle || ''} onChange={(html) => onChange({ subtitle: html || undefined })} singleLine placeholder="Subtítulo..." className="text-sm text-foreground" />
        </div>
      </div>
      <div className="border-t border-border pt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Código de descuento</label>
          <input
            type="text"
            value={block.discountCode || ''}
            onChange={(e) => onChange({ discountCode: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground font-mono"
            placeholder="p. ej. AHORRA20"
          />
        </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Texto del botón</label>
        <input
          type="text"
          value={block.buttonText || ''}
          onChange={(e) => onChange({ buttonText: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Comprar ahora"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">URL del botón</label>
        <input
          type="text"
          value={block.buttonUrl || ''}
          onChange={(e) => onChange({ buttonUrl: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="/tienda"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Estilo de fondo</label>
        <select
          value={block.backgroundStyle || 'gradient'}
          onChange={(e) => onChange({ backgroundStyle: e.target.value as StoreBannerBlock['backgroundStyle'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="gradient">Degradado</option>
          <option value="solid">Sólido</option>
          <option value="image">Imagen</option>
        </select>
      </div>

      <div>
        <TokenColorPicker
          label="Color de acento"
          value={block.accentColor || ''}
          onChange={(v) => onChange({ accentColor: v })}
          placeholder="#6366f1"
        />
      </div>

      {block.backgroundStyle === 'image' && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Imagen de fondo</label>
          {block.backgroundImage ? (
            <div className="space-y-2">
              <img src={block.backgroundImage} alt="Fondo del banner" className="w-full h-24 object-cover rounded border border-border" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowMediaPicker(true)} className="flex-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90">Cambiar</button>
                <button type="button" onClick={() => onChange({ backgroundImage: '' })} className="px-3 py-2 text-sm bg-background border border-border text-foreground rounded hover:bg-accent">Quitar</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowMediaPicker(true)} className="w-full px-3 py-2 text-sm bg-background border border-border text-foreground rounded hover:bg-accent">
              Elegir imagen
            </button>
          )}
          {showMediaPicker && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={() => setShowMediaPicker(false)}>
              <div className="bg-white dark:bg-gray-900 border border-border rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <MediaPicker
                  value={block.backgroundImage || ''}
                  onChange={(url) => {
                    onChange({ backgroundImage: url });
                    setShowMediaPicker(false);
                  }}
                  label="Seleccionar imagen del banner"
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Fecha de fin de la cuenta atrás</label>
        <input
          type="datetime-local"
          value={block.countdownDate || ''}
          onChange={(e) => onChange({ countdownDate: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        />
        <p className="text-xs text-muted-foreground mt-1">Opcional: muestra un contador en vivo</p>
      </div>
      </div>
    </div>
  );
}

function AccordionBlockSettings({ block, onChange, currentViewport }: { block: AccordionBlock; onChange: (updates: Partial<AccordionBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Título de la sección</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Preguntas frecuentes" className="text-sm text-foreground" />
        </div>
      </div>
      <div className="border-t border-border pt-4">
      <p className="text-xs text-muted-foreground">Usa los controles del editor para añadir, quitar o editar elementos de acordeón.</p>
      </div>
    </div>
  );
}

function TabsBlockSettings({ block, onChange }: { block: TabsBlock; onChange: (updates: Partial<TabsBlock>) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Edita el contenido de cada pestaña seleccionándola en el lienzo y usando el editor integrado. Añade o elimina pestañas aquí.
      </p>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Pestañas</label>
        {(block.tabs || []).map((tab, i) => (
          <div key={tab.id ?? i} className="flex gap-2 items-center">
            <input
              type="text"
              value={tab.label}
              onChange={(e) => {
                const next = [...(block.tabs || [])];
                next[i] = { ...next[i], label: e.target.value };
                onChange({ tabs: next });
              }}
              className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Etiqueta de la pestaña"
            />
            <button
              type="button"
              onClick={() => onChange({ tabs: (block.tabs || []).filter((_, j) => j !== i) })}
              className="px-2 py-1.5 text-xs rounded border border-border text-destructive hover:bg-destructive/10"
              title="Eliminar pestaña"
            >
              <span className="material-icons text-xs">delete</span>
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ tabs: [...(block.tabs || []), { id: `tab-${Date.now()}`, label: 'Nueva pestaña', blocks: [] }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Añadir pestaña
        </button>
      </div>
    </div>
  );
}

