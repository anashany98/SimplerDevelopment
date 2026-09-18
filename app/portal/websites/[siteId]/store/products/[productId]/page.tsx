'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { slugify } from '@/lib/publishing/slug';
import MediaUploadModal from '@/components/admin/MediaUploadModal';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { PrintfulFulfillmentPanel } from '@/components/portal/store/PrintfulFulfillmentPanel';
import { ProductStylesPanel } from '@/components/portal/store/ProductStylesPanel';
import { pBtnPrimary, pBtnGhost, pBtnSoft, pCard, pCardPad, pInput, pSelect, pSectionTitle, pChip } from '@/components/portal/portal-ui';

interface ProductImage {
  id?: number;
  url: string;
  altText?: string;
  position: number;
}

interface ProductOption {
  id?: number;
  name: string;
  values: string[];
}

interface ProductVariant {
  id?: number;
  name: string;
  sku: string;
  priceCents: number;
  quantity: number;
  active: boolean;
  options: Record<string, string>;
  printfulVariantId: number | null;
}

interface BulkPricingRule {
  id?: number;
  minQty: number;
  maxQty: number | null;
  type: 'fixed' | 'percent_off';
  amount: number;
}

interface Category {
  id: number;
  name: string;
}

type ProductDesignMode = 'standard' | 'store' | 'customer';

interface ProductForm {
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  status: string;
  featured: boolean;
  designMode: ProductDesignMode;
  metadata: Record<string, string>;
  designable: boolean;
  priceCents: number;
  compareAtPriceCents: number;
  costPriceCents: number;
  sku: string;
  barcode: string;
  trackInventory: boolean;
  quantity: number;
  weight: string;
  weightUnit: string;
  categoryId: string;
  tags: string;
  seoTitle: string;
  seoDescription: string;
  images: ProductImage[];
  options: ProductOption[];
  variants: ProductVariant[];
  bulkPricing: BulkPricingRule[];
  printfulVariantId: number | null;
}


function centsToDollars(cents: number) {
  return cents ? (cents / 100).toFixed(2) : '';
}

function dollarsToCents(dollars: string) {
  const num = parseFloat(dollars);
  return isNaN(num) ? 0 : Math.round(num * 100);
}

function moneyToCents(value: unknown) {
  if (value == null || value === '') return 0;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? Math.round(num) : 0;
}

function normalizeOptionValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const row = value as { value?: unknown; label?: unknown };
    if (typeof row.value === 'string') return row.value;
    if (typeof row.label === 'string') return row.label;
  }
  return String(value ?? '');
}

function normalizeProductImage(img: {
  id?: number;
  url: string;
  alt?: string | null;
  altText?: string | null;
  order?: number;
  position?: number;
}, index: number): ProductImage {
  return {
    id: img.id,
    url: img.url,
    altText: img.altText ?? img.alt ?? '',
    position: img.position ?? img.order ?? index,
  };
}

function normalizeProductOption(opt: {
  id?: number;
  name?: string | null;
  values?: unknown[];
}): ProductOption {
  return {
    id: opt.id,
    name: opt.name ?? '',
    values: (opt.values ?? []).map(normalizeOptionValue).filter(Boolean),
  };
}

function normalizeVariant(variant: {
  id?: number;
  name?: string | null;
  sku?: string | null;
  price?: unknown;
  priceCents?: unknown;
  quantity?: number | null;
  active?: boolean | null;
  options?: Record<string, string> | null;
  printfulVariantId?: number | null;
}): ProductVariant {
  return {
    id: variant.id,
    name: variant.name ?? '',
    sku: variant.sku ?? '',
    priceCents: moneyToCents(variant.priceCents ?? variant.price),
    quantity: variant.quantity ?? 0,
    active: variant.active ?? true,
    options: variant.options ?? {},
    printfulVariantId: variant.printfulVariantId ?? null,
  };
}

function normalizeBulkRule(rule: {
  id?: number;
  minQty?: number;
  minQuantity?: number;
  maxQty?: number | null;
  maxQuantity?: number | null;
  type?: 'fixed' | 'percent_off';
  amount?: number | string | null;
}): BulkPricingRule {
  return {
    id: rule.id,
    minQty: rule.minQty ?? rule.minQuantity ?? 1,
    maxQty: rule.maxQty ?? rule.maxQuantity ?? null,
    type: rule.type ?? 'fixed',
    amount: typeof rule.amount === 'string' ? parseFloat(rule.amount) || 0 : rule.amount ?? 0,
  };
}

function normalizeMetadata(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(value)) {
    if (val != null) out[key] = String(val);
  }
  return out;
}

function resolveDesignMode(product: { designable?: boolean; metadata?: unknown }): ProductDesignMode {
  const metadata = normalizeMetadata(product.metadata);
  const raw = metadata.productDesignMode;
  if (raw === 'standard' || raw === 'store' || raw === 'customer') return raw;
  if (product.designable) return 'customer';
  if (metadata.storeDesignId) {
    return 'store';
  }
  return 'standard';
}

const defaultForm: ProductForm = {
  name: '',
  slug: '',
  shortDescription: '',
  description: '',
  status: 'draft',
  featured: false,
  designMode: 'standard',
  metadata: {},
  designable: false,
  priceCents: 0,
  compareAtPriceCents: 0,
  costPriceCents: 0,
  sku: '',
  barcode: '',
  trackInventory: false,
  quantity: 0,
  weight: '',
  weightUnit: 'g',
  categoryId: '',
  tags: '',
  seoTitle: '',
  seoDescription: '',
  images: [],
  options: [],
  variants: [],
  bulkPricing: [],
  printfulVariantId: null,
};

export default function ProductEditPage() {
  const { siteId, productId } = useParams<{ siteId: string; productId: string }>();
  const router = useRouter();
  const isNew = productId === 'new';
  const base = `/api/portal/websites/${siteId}/store`;

  const [form, setForm] = useState<ProductForm>({ ...defaultForm });
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('details');
  const [showSeo, setShowSeo] = useState(false);
  const [showVariants, setShowVariants] = useState(false);
  const [showBulkPricing, setShowBulkPricing] = useState(false);
  const [showCustomization, setShowCustomization] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [showMediaUpload, setShowMediaUpload] = useState(false);
  const [mediaItems, setMediaItems] = useState<{ id: number; filename: string; url: string; mimeType: string; alt?: string | null }[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaSearch, setMediaSearch] = useState('');
  const mediaEndpoint = `/api/portal/cms/websites/${siteId}/media`;

  useEffect(() => {
    fetch(`${base}/categories`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setCategories(data.data || []);
      })
      .catch(() => {});
  }, [base]);

  useEffect(() => {
    if (isNew) return;
    fetch(`${base}/products/${productId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) {
          const p = data.data;
          const metadata = normalizeMetadata(p.metadata);
          const designMode = resolveDesignMode(p);
          setForm({
            name: p.name || '',
            slug: p.slug || '',
            shortDescription: p.shortDescription || '',
            description: p.description || '',
            status: p.status || 'draft',
            featured: p.featured || false,
            designable: designMode === 'customer',
            designMode,
            metadata,
            priceCents: moneyToCents(p.priceCents ?? p.price),
            compareAtPriceCents: moneyToCents(p.compareAtPriceCents ?? p.compareAtPrice),
            costPriceCents: moneyToCents(p.costPriceCents ?? p.costPrice),
            sku: p.sku || '',
            barcode: p.barcode || '',
            trackInventory: p.trackInventory || false,
            quantity: p.quantity || 0,
            weight: p.weight ? String(p.weight) : '',
            weightUnit: p.weightUnit || 'g',
            categoryId: p.categoryId ? String(p.categoryId) : '',
            tags: (p.tags || []).join(', '),
            seoTitle: p.seoTitle || '',
            seoDescription: p.seoDescription || '',
            images: (p.images || []).map(normalizeProductImage),
            options: (p.options || []).map(normalizeProductOption),
            variants: (p.variants || []).map(normalizeVariant),
            bulkPricing: (p.bulkPricing || p.bulkPricingRules || []).map(normalizeBulkRule),
            printfulVariantId: p.printfulVariantId ?? null,
          });
          if (p.seoTitle || p.seoDescription) setShowSeo(true);
          if (p.options?.length || p.variants?.length) setShowVariants(true);
          if (p.bulkPricing?.length) setShowBulkPricing(true);
          if (designMode !== 'standard') setShowCustomization(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [base, productId, isNew]);

  const updateField = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
    setSuccess('');
  };

  const setDesignMode = async (mode: ProductDesignMode) => {
    const metadata = { ...form.metadata, productDesignMode: mode };
    const designable = mode === 'customer';
    setForm((prev) => ({
      ...prev,
      designMode: mode,
      designable,
      metadata,
    }));
    setError('');
    setSuccess('');
    if (!isNew) {
      try {
        await fetch(`${base}/products/${productId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ designable, metadata }),
        });
      } catch {
        // Non-fatal. A later full save will surface any persistent issue.
      }
    }
  };

  const handleNameChange = (name: string) => {
    setForm((prev) => ({
      ...prev,
      name,
      slug: isNew && !prev.slug ? slugify(name) : prev.slug,
    }));
    setError('');
    setSuccess('');
  };

  const fetchMedia = useCallback(async (searchTerm?: string) => {
    setMediaLoading(true);
    const params = new URLSearchParams({ limit: '50', mimeType: 'image' });
    if (searchTerm) params.append('search', searchTerm);
    try {
      const res = await fetch(`${mediaEndpoint}?${params}`);
      const data = await res.json();
      if (data.success) setMediaItems(data.data || []);
    } catch { /* ignore */ }
    setMediaLoading(false);
  }, [mediaEndpoint]);

  useEffect(() => {
    if (showMediaPicker) {
      void Promise.resolve().then(() => fetchMedia(mediaSearch));
    }
  }, [showMediaPicker, mediaSearch, fetchMedia]);

  const addImageFromMedia = (url: string) => {
    const alreadyAdded = form.images.some(img => img.url === url);
    if (alreadyAdded) return;
    const newImg: ProductImage = { url, position: form.images.length };
    updateField('images', [...form.images, newImg]);
  };

  const removeImage = (index: number) => {
    const updated = form.images.filter((_, i) => i !== index).map((img, i) => ({ ...img, position: i }));
    updateField('images', updated);
  };

  const addOption = () => {
    updateField('options', [...form.options, { name: '', values: [] }]);
  };

  const updateOption = (index: number, field: 'name' | 'values', value: string | string[]) => {
    const updated = [...form.options];
    if (field === 'name') {
      updated[index] = { ...updated[index], name: value as string };
    } else {
      updated[index] = { ...updated[index], values: value as string[] };
    }
    updateField('options', updated);
  };

  const removeOption = (index: number) => {
    updateField('options', form.options.filter((_, i) => i !== index));
  };

  const generateVariants = () => {
    const validOptions = form.options.filter((o) => o.name && o.values.length > 0);
    if (validOptions.length === 0) return;

    const combinations: Record<string, string>[] = [{}];
    for (const opt of validOptions) {
      const newCombinations: Record<string, string>[] = [];
      for (const combo of combinations) {
        for (const val of opt.values) {
          newCombinations.push({ ...combo, [opt.name]: val });
        }
      }
      combinations.length = 0;
      combinations.push(...newCombinations);
    }

    const variants: ProductVariant[] = combinations.map((combo) => ({
      name: Object.values(combo).join(' / '),
      sku: '',
      priceCents: form.priceCents,
      quantity: 0,
      active: true,
      options: combo,
      printfulVariantId: null,
    }));
    updateField('variants', variants);
  };

  const updateVariant = (index: number, field: keyof ProductVariant, value: unknown) => {
    const updated = [...form.variants];
    updated[index] = { ...updated[index], [field]: value };
    updateField('variants', updated);
  };

  const addBulkRule = () => {
    updateField('bulkPricing', [
      ...form.bulkPricing,
      { minQty: 1, maxQty: null, type: 'fixed' as const, amount: 0 },
    ]);
  };

  const updateBulkRule = (index: number, field: keyof BulkPricingRule, value: unknown) => {
    const updated = [...form.bulkPricing];
    updated[index] = { ...updated[index], [field]: value };
    updateField('bulkPricing', updated);
  };

  const removeBulkRule = (index: number) => {
    updateField('bulkPricing', form.bulkPricing.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError('El nombre del producto es obligatorio.');
      return;
    }
    if (!form.slug.trim()) {
      setError('El slug es obligatorio.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    const payload = {
      ...form,
      price: form.priceCents,
      compareAtPrice: form.compareAtPriceCents || null,
      costPrice: form.costPriceCents || null,
      categoryId: form.categoryId ? parseInt(form.categoryId) : null,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      weight: form.weight ? parseFloat(form.weight) : null,
      images: form.images.map((img, idx) => ({
        url: img.url,
        alt: img.altText || null,
        order: idx,
      })),
      designable: form.designMode === 'customer',
      metadata: {
        ...form.metadata,
        productDesignMode: form.designMode,
      },
    };

    try {
      const url = isNew ? `${base}/products` : `${base}/products/${productId}`;
      const method = isNew ? 'POST' : 'PUT';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(isNew ? '¡Producto creado!' : '¡Producto guardado!');
        if (isNew && data.data?.id) {
          router.replace(`/portal/websites/${siteId}/store/products/${data.data.id}`);
        }
      } else {
        setError(data.message || 'No se pudo guardar.');
      }
    } catch {
      setError('Algo salió mal.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }


  const TABS = [
    { id: 'details', label: 'Detalles' },
    { id: 'pricing', label: 'Precios' },
    { id: 'inventory', label: 'Inventario' },
    { id: 'shipping', label: 'Envío' },
    { id: 'print', label: 'Impresión' },
    { id: 'images', label: 'Imágenes' },
    { id: 'organization', label: 'Organización' },
    { id: 'variants', label: 'Variantes' },
    ...(!isNew ? [{ id: 'customization', label: 'Personalización' }] : []),
    { id: 'bulkPricing', label: 'Precios por volumen' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PortalPageHeader
        eyebrow="Tienda"
        title={isNew ? 'Nuevo producto' : 'Editar producto'}
        subtitle={
          <Link
            href={`/portal/websites/${siteId}/store/products`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="material-icons text-base">arrow_back</span>
            Volver a los productos
          </Link>
        }
        actions={
          <button
            onClick={handleSave}
            disabled={saving}
            className={pBtnPrimary}
          >
            {saving && <span className="material-icons text-base animate-spin">refresh</span>}
            {saving ? 'Guardando…' : 'Guardar producto'}
          </button>
        }
      />

      {/* Designer tab link */}
      {!isNew && form.designable && (
        <div className="flex items-center gap-2">
          <Link
            href={`/portal/websites/${siteId}/store/products/${productId}/designer`}
            className={pBtnGhost}
          >
            <span className="material-icons text-base">design_services</span>
            Abrir configuración del diseñador
          </Link>
          <span className="text-xs text-muted-foreground">
            Configura los estilos, las caras y la biblioteca de recursos del diseñador para clientes.
          </span>
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          <span className="material-icons text-base">error</span>
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm dark:bg-green-900/20 dark:border-green-800 dark:text-green-400">
          <span className="material-icons text-base">check_circle</span>
          {success}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
              activeTab === tab.id
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Details Tab */}
      {activeTab === 'details' && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <h2 className={`${pSectionTitle} flex items-center gap-2`}>
            <span className="material-icons text-lg text-muted-foreground">info</span>
            Información básica
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Nombre</label>
              <input value={form.name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Nombre del producto" className={pInput} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Slug</label>
              <input
                value={form.slug}
                onChange={(e) => updateField('slug', e.target.value)}
                placeholder="product-slug"
                className={`${pInput} font-mono`}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Descripción breve</label>
            <input
              value={form.shortDescription}
              onChange={(e) => updateField('shortDescription', e.target.value)}
              placeholder="Resumen breve"
              className={pInput}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Descripción</label>
            <textarea
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Descripción completa del producto…"
              rows={5}
              className={pInput}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="product-status" className="text-sm font-medium text-foreground">Estado</label>
              <select id="product-status" value={form.status} onChange={(e) => updateField('status', e.target.value)} className={pSelect}>
                <option value="draft">Borrador</option>
                <option value="active">Activo</option>
                <option value="archived">Archivado</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label id="product-featured-label" className="text-sm font-medium text-foreground">Destacado</label>
              <div className="flex items-center gap-3 pt-1.5">
                <button
                  type="button" role="switch" aria-checked={form.featured} aria-labelledby="product-featured-label"
                  onClick={() => updateField('featured', !form.featured)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    form.featured ? 'bg-primary' : 'bg-border'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      form.featured ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-sm text-muted-foreground">{form.featured ? 'Sí' : 'No'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pricing Tab */}
      {activeTab === 'pricing' && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <h2 className={`${pSectionTitle} flex items-center gap-2`}>
            <span className="material-icons text-lg text-muted-foreground">payments</span>Precios</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Precio ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={centsToDollars(form.priceCents)}
                onChange={(e) => updateField('priceCents', dollarsToCents(e.target.value))}
                placeholder="0.00"
                className={pInput}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Precio comparativo ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={centsToDollars(form.compareAtPriceCents)}
                onChange={(e) => updateField('compareAtPriceCents', dollarsToCents(e.target.value))}
                placeholder="0.00"
                className={pInput}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Precio de costo ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={centsToDollars(form.costPriceCents)}
                onChange={(e) => updateField('costPriceCents', dollarsToCents(e.target.value))}
                placeholder="0.00"
                className={pInput}
              />
            </div>
          </div>
        </div>
      )}

      {/* Inventory Tab */}
      {activeTab === 'inventory' && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <h2 className={`${pSectionTitle} flex items-center gap-2`}>
            <span className="material-icons text-lg text-muted-foreground">inventory</span>Inventario</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">SKU</label>
              <input value={form.sku} onChange={(e) => updateField('sku', e.target.value)} placeholder="SKU-001" className={pInput} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Código de barras</label>
              <input value={form.barcode} onChange={(e) => updateField('barcode', e.target.value)} placeholder="123456789" className={pInput} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label id="product-track-inventory-label" className="text-sm font-medium text-foreground">Seguir inventario</label>
            <div className="flex items-center gap-3 pt-1.5">
              <button
                type="button" role="switch" aria-checked={form.trackInventory} aria-labelledby="product-track-inventory-label"
                onClick={() => updateField('trackInventory', !form.trackInventory)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  form.trackInventory ? 'bg-primary' : 'bg-border'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    form.trackInventory ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-sm text-muted-foreground">{form.trackInventory ? 'Activado' : 'Desactivado'}</span>
            </div>
          </div>
          {form.trackInventory && (
            <div className="space-y-1.5 max-w-xs">
              <label className="text-sm font-medium text-foreground">Cantidad</label>
              <input
                type="number"
                min="0"
                value={form.quantity}
                onChange={(e) => updateField('quantity', parseInt(e.target.value) || 0)}
                className={pInput}
              />
            </div>
          )}
        </div>
      )}

      {/* Shipping Tab */}
      {activeTab === 'shipping' && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <h2 className={`${pSectionTitle} flex items-center gap-2`}>
            <span className="material-icons text-lg text-muted-foreground">local_shipping</span>Envío</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Peso</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.weight}
                onChange={(e) => updateField('weight', e.target.value)}
                placeholder="0"
                className={pInput}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="product-weight-unit" className="text-sm font-medium text-foreground">Unidad de peso</label>
              <select id="product-weight-unit" value={form.weightUnit} onChange={(e) => updateField('weightUnit', e.target.value)} className={pSelect}>
                <option value="g">Gramos (g)</option>
                <option value="kg">Kilogramos (kg)</option>
                <option value="oz">Onzas (oz)</option>
                <option value="lb">Libras (lb)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Print Tab */}
      {activeTab === 'print' && (
        <PrintfulFulfillmentPanel
          variants={form.variants}
          productPrintfulVariantId={form.printfulVariantId}
          onProductPrintfulVariantIdChange={(v) => updateField('printfulVariantId', v)}
        />
      )}

      {/* Images Tab */}
      {activeTab === 'images' && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className={`${pSectionTitle} flex items-center gap-2`}>
              <span className="material-icons text-lg text-muted-foreground">photo_library</span>Imágenes</h2>
            <button
              type="button"
              onClick={() => setShowMediaPicker(true)}
              className={pBtnPrimary}
            >
              <span className="material-icons text-base">add_photo_alternate</span>
              Añadir desde medios
            </button>
          </div>
          {form.images.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {form.images.map((img, i) => (
                <div key={i} className="relative group rounded-xl border border-border overflow-hidden aspect-square">
                  <img src={img.url} alt={img.altText || ''} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    {i > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...form.images];
                          [updated[i - 1], updated[i]] = [updated[i], updated[i - 1]];
                          updateField('images', updated.map((img, idx) => ({ ...img, position: idx })));
                        }}
                        className="p-1.5 bg-white/90 rounded-full text-foreground hover:bg-white transition-colors"
                        title="Mover a la izquierda"
                      >
                        <span className="material-icons text-lg">chevron_left</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="p-1.5 bg-white/90 rounded-full text-red-600 hover:bg-white transition-colors"
                    >
                      <span className="material-icons text-lg">close</span>
                    </button>
                    {i < form.images.length - 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...form.images];
                          [updated[i], updated[i + 1]] = [updated[i + 1], updated[i]];
                          updateField('images', updated.map((img, idx) => ({ ...img, position: idx })));
                        }}
                        className="p-1.5 bg-white/90 rounded-full text-foreground hover:bg-white transition-colors"
                        title="Mover a la derecha"
                      >
                        <span className="material-icons text-lg">chevron_right</span>
                      </button>
                    )}
                  </div>
                  <span className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                    {i === 0 ? 'Principal' : `#${i + 1}`}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowMediaPicker(true)}
              className="w-full rounded-2xl border-2 border-dashed border-border px-6 py-10 text-center hover:border-primary/50 transition-colors"
            >
              <span className="material-icons text-3xl text-muted-foreground/40 block mb-1">add_photo_alternate</span>
              <span className="text-sm text-muted-foreground">Haz clic para agregar imágenes desde la biblioteca de medios</span>
            </button>
          )}
        </div>
      )}

      {/* Media Picker Modal — rendered outside tab guard so it can open from any tab */}
      {showMediaPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-2xl shadow-xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">Seleccionar imágenes</h2>
              <button onClick={() => setShowMediaPicker(false)} className="p-1 hover:bg-muted rounded-lg transition-colors">
                <span className="material-icons text-muted-foreground">close</span>
              </button>
            </div>
            <div className="p-4 border-b border-border flex items-center gap-2">
              <div className="flex-1 relative">
                <span className="material-icons text-muted-foreground text-lg absolute left-3 top-1/2 -translate-y-1/2">search</span>
                <input
                  type="text"
                  placeholder="Buscar en medios…"
                  value={mediaSearch}
                  onChange={(e) => setMediaSearch(e.target.value)}
                  className={`${pInput} pl-10`}
                />
              </div>
              <button
                type="button"
                onClick={() => setShowMediaUpload(true)}
                className={pBtnPrimary}
              >
                <span className="material-icons text-base">upload</span>
                Subir nuevo
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {mediaLoading ? (
                <div className="flex items-center justify-center py-16">
                  <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
                </div>
              ) : mediaItems.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <span className="material-icons text-4xl text-muted-foreground/40 block mb-2">photo_library</span>
                  No se encontraron imágenes. Sube algunas para empezar.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {mediaItems.map((item) => {
                    const isSelected = form.images.some(img => img.url === item.url);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            updateField('images', form.images.filter(img => img.url !== item.url).map((img, idx) => ({ ...img, position: idx })));
                          } else {
                            addImageFromMedia(item.url);
                          }
                        }}
                        className={`relative rounded-lg border overflow-hidden text-left transition-all ${
                          isSelected
                            ? 'border-primary ring-2 ring-primary/30'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        {item.mimeType.startsWith('image/') ? (
                          <img src={item.url} alt={item.alt || item.filename} className="w-full aspect-square object-cover" />
                        ) : (
                          <div className="w-full aspect-square flex items-center justify-center bg-muted">
                            <span className="material-icons text-4xl text-muted-foreground">description</span>
                          </div>
                        )}
                        <div className="p-2">
                          <p className="text-xs text-muted-foreground truncate">{item.filename}</p>
                        </div>
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                            <span className="material-icons text-sm">check</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-border flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {form.images.length} {form.images.length !== 1 ? 'imágenes seleccionadas' : 'imagen seleccionada'}
              </span>
              <button
                type="button"
                onClick={() => setShowMediaPicker(false)}
                className={pBtnPrimary}
              >Listo</button>
            </div>
          </div>
        </div>
      )}

      {showMediaUpload && (
        <MediaUploadModal
          onClose={() => setShowMediaUpload(false)}
          onComplete={() => {
            setShowMediaUpload(false);
            fetchMedia(mediaSearch);
          }}
          apiEndpoint={`${mediaEndpoint}/upload`}
        />
      )}

      {/* Organization Tab — Category & Tags card + SEO card */}
      {activeTab === 'organization' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <h2 className={`${pSectionTitle} flex items-center gap-2`}>
              <span className="material-icons text-lg text-muted-foreground">category</span>
              Categoría y etiquetas
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="product-category" className="text-sm font-medium text-foreground">Categoría</label>
                <select id="product-category" value={form.categoryId} onChange={(e) => updateField('categoryId', e.target.value)} className={pSelect}>
                  <option value="">Sin categoría</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={String(cat.id)}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Etiquetas</label>
                <input
                  value={form.tags}
                  onChange={(e) => updateField('tags', e.target.value)}
                  placeholder="tag1, tag2, tag3"
                  className={pInput}
                />
                <p className="text-xs text-muted-foreground">Separados por comas</p>
              </div>
            </div>
          </div>

          {/* SEO (collapsible) */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => setShowSeo(!showSeo)}
              className="w-full px-6 py-4 flex items-center justify-between text-foreground hover:bg-muted/20 transition-colors"
            >
              <span className="font-semibold flex items-center gap-2">
                <span className="material-icons text-lg text-muted-foreground">search</span>
                Ajustes SEO
              </span>
              <span className="material-icons text-muted-foreground">{showSeo ? 'expand_less' : 'expand_more'}</span>
            </button>
            {showSeo && (
              <div className="px-6 pb-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Título SEO</label>
                  <input
                    value={form.seoTitle}
                    onChange={(e) => updateField('seoTitle', e.target.value)}
                    placeholder="Título de la página para buscadores"
                    className={pInput}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Descripción SEO</label>
                  <textarea
                    value={form.seoDescription}
                    onChange={(e) => updateField('seoDescription', e.target.value)}
                    placeholder="Meta descripción para buscadores"
                    rows={3}
                    className={pInput}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Variants Tab */}
      {activeTab === 'variants' && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <h2 className={`${pSectionTitle} flex items-center gap-2`}>
            <span className="material-icons text-lg text-muted-foreground">tune</span>
            Opciones y variantes
          </h2>
          {/* Options */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Opciones</label>
              <button
                type="button"
                onClick={addOption}
                className={pBtnSoft}
              >
                <span className="material-icons text-sm">add</span>Añadir opción</button>
            </div>
            {form.options.map((opt, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-muted/20 rounded-xl">
                <div className="space-y-1.5 flex-1">
                  <input
                    value={opt.name}
                    onChange={(e) => updateOption(i, 'name', e.target.value)}
                    placeholder="Nombre de la opción (p. ej., Color, Tamaño)"
                    className={pInput}
                  />
                </div>
                <div className="space-y-1.5 flex-[2]">
                  <input
                    value={opt.values.join(', ')}
                    onChange={(e) =>
                      updateOption(
                        i,
                        'values',
                        e.target.value.split(',').map((v) => v.trim()).filter(Boolean)
                      )
                    }
                    placeholder="Valores (separados por comas, p. ej., Rojo, Azul, Verde)"
                    className={pInput}
                  />
                  {opt.values.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {opt.values.map((v, vi) => (
                        <span key={vi} className={pChip}>
                          {v}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  className="p-1 text-muted-foreground hover:text-red-600 transition-colors mt-1"
                >
                  <span className="material-icons text-lg">delete</span>
                </button>
              </div>
            ))}
          </div>

          {/* Generate Variants */}
          {form.options.some((o) => o.name && o.values.length > 0) && (
            <button
              type="button"
              onClick={generateVariants}
              className={pBtnGhost}
            >
              <span className="material-icons text-base">auto_awesome</span>
              Generar variantes
            </button>
          )}

          {/* Variants Table */}
          {form.variants.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Variante</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">SKU</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Precio ($)</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Cantidad</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">ID de Printful</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Activo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {form.variants.map((variant, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-medium text-foreground">{variant.name}</td>
                      <td className="px-3 py-2">
                        <input
                          value={variant.sku}
                          onChange={(e) => updateVariant(i, 'sku', e.target.value)}
                          className="w-24 rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={centsToDollars(variant.priceCents)}
                          onChange={(e) => updateVariant(i, 'priceCents', dollarsToCents(e.target.value))}
                          className="w-20 rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          value={variant.quantity}
                          onChange={(e) => updateVariant(i, 'quantity', parseInt(e.target.value) || 0)}
                          className="w-16 rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="1"
                          value={variant.printfulVariantId ?? ''}
                          onChange={(e) =>
                            updateVariant(
                              i,
                              'printfulVariantId',
                              e.target.value ? parseInt(e.target.value) : null,
                            )
                          }
                          placeholder="—"
                          title={
                            variant.active && !variant.printfulVariantId
                              ? 'Sin ID de Printful — Printful no puede preparar esta variante'
                              : undefined
                          }
                          className={`w-20 rounded-lg border bg-card px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 ${
                            variant.active && !variant.printfulVariantId
                              ? 'border-amber-500/60'
                              : 'border-border'
                          }`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => updateVariant(i, 'active', !variant.active)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            variant.active ? 'bg-primary' : 'bg-border'
                          }`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                              variant.active ? 'translate-x-4.5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Customization Tab — only for existing products (!isNew) */}
      {activeTab === 'customization' && !isNew && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <h2 className={`${pSectionTitle} flex items-center gap-2`}>
            <span className="material-icons text-lg text-muted-foreground">brush</span>Personalización</h2>
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">Tipo de diseño del producto</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setDesignMode('standard')}
                className={`text-left rounded-xl border p-4 transition-colors ${
                  form.designMode === 'standard'
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-background hover:bg-muted/30 text-muted-foreground'
                }`}
              >
                <span className="material-icons text-lg block mb-1">inventory_2</span>
                <span className="block text-sm font-medium">Producto estándar</span>
                <span className="block text-xs mt-1">Se vende tal cual, con las fotos del producto.</span>
              </button>
              <button
                type="button"
                onClick={() => setDesignMode('store')}
                className={`text-left rounded-xl border p-4 transition-colors ${
                  form.designMode === 'store'
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-background hover:bg-muted/30 text-muted-foreground'
                }`}
              >
                <span className="material-icons text-lg block mb-1">brush</span>
                <span className="block text-sm font-medium">Diseñado por la tienda</span>
                <span className="block text-xs mt-1">La tienda es dueña del arte; los clientes compran el diseño final.</span>
              </button>
              <button
                type="button"
                onClick={() => setDesignMode('customer')}
                className={`text-left rounded-xl border p-4 transition-colors ${
                  form.designMode === 'customer'
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-background hover:bg-muted/30 text-muted-foreground'
                }`}
              >
                <span className="material-icons text-lg block mb-1">edit</span>
                <span className="block text-sm font-medium">Personalizable por el cliente</span>
                <span className="block text-xs mt-1">Los clientes ven el diseñador público y crean su propia versión.</span>
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Los productos diseñados por la tienda pueden usar registros de diseño/plantilla e imágenes renderizadas del producto, pero solo los personalizables por el cliente muestran el botón Personalizar de la tienda.
            </p>
          </div>
          {form.designMode !== 'standard' && (
            <div className="pt-2 border-t border-border space-y-4">
              {/* Open in Designer — store-designed products only. Customers
                  can't reach the canvas (the public route redirects to
                  /shop), but staff with site access can edit the saved
                  design via /sites/<domain>/designer/<slug>?staff=1.
                  Routed through the portal page so we don't expose the
                  ?staff=1 link directly in customer-facing UI. */}
              {form.designMode === 'store' && (
                <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="material-icons text-primary">design_services</span>
                    <div>
                      <div className="text-sm font-semibold text-foreground">Editar el diseño de este producto</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Abre el mismo editor de lienzo que usan los clientes, pero en modo interno para el personal: carga las capas guardadas, ajústalas y guárdalas de nuevo en el mismo registro de diseño. Omite el añadir al carrito.
                      </div>
                    </div>
                  </div>
                  <a
                    href={`/portal/websites/${siteId}/store/products/${productId}/designer`}
                    target="_blank"
                    rel="noopener"
                    className={`shrink-0 ${pBtnSoft}`}
                  >
                    <span className="material-icons text-base">open_in_new</span>
                    Abrir en el diseñador
                  </a>
                </div>
              )}
              <p className="text-xs text-muted-foreground mb-3">
                Cada superficie (frontal/trasera/manga…) define el área imprimible. Los productos personalizables por el cliente las usan en el diseñador público; los diseñados por la tienda las usan para plantillas creadas por la tienda y la preparación de pedidos.
              </p>
              <ProductStylesPanel siteId={Number(siteId)} productId={Number(productId)} />
            </div>
          )}
        </div>
      )}

      {/* Bulk Pricing Tab */}
      {activeTab === 'bulkPricing' && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <h2 className={`${pSectionTitle} flex items-center gap-2`}>
            <span className="material-icons text-lg text-muted-foreground">price_change</span>
            Precios por volumen
          </h2>
          {form.bulkPricing.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Cant. mín.</th>
                  <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Cant. máx.</th>
                  <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Tipo</th>
                  <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Monto</th>
                  <th className="px-3 py-2 text-xs font-medium text-muted-foreground w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {form.bulkPricing.map((rule, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="1"
                        value={rule.minQty}
                        onChange={(e) => updateBulkRule(i, 'minQty', parseInt(e.target.value) || 1)}
                        className="w-16 rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        value={rule.maxQty ?? ''}
                        onChange={(e) =>
                          updateBulkRule(i, 'maxQty', e.target.value ? parseInt(e.target.value) : null)
                        }
                        placeholder="Sin límite"
                        className="w-20 rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={rule.type}
                        onChange={(e) => updateBulkRule(i, 'type', e.target.value)}
                        className="px-2 py-1 rounded border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                      >
                        <option value="fixed">Precio fijo</option>
                        <option value="percent_off">Porcentaje de descuento</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={rule.amount}
                        onChange={(e) => updateBulkRule(i, 'amount', parseFloat(e.target.value) || 0)}
                        className="w-20 rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => removeBulkRule(i)}
                        className="p-1 text-muted-foreground hover:text-red-600 transition-colors"
                      >
                        <span className="material-icons text-base">delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button
            type="button"
            onClick={addBulkRule}
            className={pBtnSoft}
          >
            <span className="material-icons text-sm">add</span>
            Añadir regla
          </button>
        </div>
      )}

      {/* Bottom save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className={pBtnPrimary}
        >
          {saving && <span className="material-icons text-base animate-spin">refresh</span>}
          {saving ? 'Guardando…' : 'Guardar producto'}
        </button>
      </div>
    </div>
  );
}
