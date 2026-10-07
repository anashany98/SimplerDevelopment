'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import MediaPicker from '@/components/admin/MediaPicker';
import { GoogleFontPicker } from '@/components/blocks/visual/GoogleFontPicker';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pBtnSoft, pCard, pCardPad, pInput, pSelect, pSectionTitle } from '@/components/portal/portal-ui';

interface ElementTypography {
  font?: string;
  size?: string;
  weight?: string;
  lineHeight?: string;
  letterSpacing?: string;
}

interface DarkModeOverrides {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  navBackground?: string;
  navTextColor?: string;
  logoUrl?: string;
  logoSquareUrl?: string;
  logoRectUrl?: string;
  logoIconUrl?: string;
}

interface ButtonStyle {
  primaryBg?: string;
  primaryText?: string;
  primaryHoverBg?: string;
  secondaryBg?: string;
  secondaryText?: string;
  secondaryHoverBg?: string;
  borderRadius?: string;
  variant?: 'filled' | 'outline';
}

interface Branding {
  logoUrl: string;
  logoAlt: string;
  logoSquareUrl: string;
  logoRectUrl: string;
  logoText: string;
  logoIconUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  typography: Record<string, ElementTypography>;
  darkMode: DarkModeOverrides;
  navTemplate: string;
  navPosition: string;
  navBackground: string;
  navTextColor: string;
  borderRadius: string;
  linkColor: string;
  linkHoverColor: string;
  buttonStyle: ButtonStyle;
  faviconUrl: string;
  ogImageUrl: string;
}

const DEFAULT_TYPOGRAPHY: Record<string, ElementTypography> = {
  h1: { size: '2.5rem', weight: '700', lineHeight: '1.2', letterSpacing: '-0.02em' },
  h2: { size: '2rem', weight: '600', lineHeight: '1.25', letterSpacing: '-0.01em' },
  h3: { size: '1.5rem', weight: '600', lineHeight: '1.3', letterSpacing: '0' },
  h4: { size: '1.25rem', weight: '600', lineHeight: '1.35', letterSpacing: '0' },
  h5: { size: '1.125rem', weight: '600', lineHeight: '1.4', letterSpacing: '0' },
  h6: { size: '1rem', weight: '600', lineHeight: '1.4', letterSpacing: '0.01em' },
  p: { size: '1rem', weight: '400', lineHeight: '1.6', letterSpacing: '0' },
  blockquote: { size: '1.125rem', weight: '400', lineHeight: '1.6', letterSpacing: '0' },
  button: { size: '0.875rem', weight: '500', lineHeight: '1.25', letterSpacing: '0.02em' },
  nav: { size: '0.875rem', weight: '500', lineHeight: '1.5', letterSpacing: '0.01em' },
  small: { size: '0.75rem', weight: '400', lineHeight: '1.5', letterSpacing: '0.01em' },
  caption: { size: '0.875rem', weight: '400', lineHeight: '1.4', letterSpacing: '0.01em' },
};

const ELEMENT_LABELS: Record<string, { label: string; desc: string; category: 'heading' | 'body' | 'ui' }> = {
  h1: { label: 'H1', desc: 'Título de la página principal', category: 'heading' },
  h2: { label: 'H2', desc: 'Título de sección', category: 'heading' },
  h3: { label: 'H3', desc: 'Título de subsección', category: 'heading' },
  h4: { label: 'H4', desc: 'Título de tarjeta o bloque', category: 'heading' },
  h5: { label: 'H5', desc: 'Título pequeño', category: 'heading' },
  h6: { label: 'H6', desc: 'Etiqueta de título', category: 'heading' },
  p: { label: 'Párrafo', desc: 'Texto del cuerpo', category: 'body' },
  blockquote: { label: 'Cita', desc: 'Texto citado', category: 'body' },
  small: { label: 'Small', desc: 'Letra pequeña y leyendas', category: 'body' },
  caption: { label: 'Leyenda', desc: 'Descripciones de imágenes y tablas', category: 'body' },
  button: { label: 'Botón', desc: 'Botones y CTA', category: 'ui' },
  nav: { label: 'Enlace de navegación', desc: 'Elementos de navegación', category: 'ui' },
};

const WEIGHT_OPTIONS = [
  { value: '300', label: 'Ligera' },
  { value: '400', label: 'Normal' },
  { value: '500', label: 'Medios' },
  { value: '600', label: 'Seminegrita' },
  { value: '700', label: 'Negrita' },
  { value: '800', label: 'Extra negrita' },
];

const DEFAULTS: Branding = {
  logoUrl: '',
  logoAlt: '',
  logoSquareUrl: '',
  logoRectUrl: '',
  logoText: '',
  logoIconUrl: '',
  primaryColor: '#2563eb',
  secondaryColor: '#1e40af',
  accentColor: '#f59e0b',
  backgroundColor: '#ffffff',
  textColor: '#111827',
  headingFont: '',
  bodyFont: '',
  typography: {},
  darkMode: {},
  navTemplate: 'classic',
  navPosition: 'top',
  navBackground: '#ffffff',
  navTextColor: '#111827',
  borderRadius: '8px',
  linkColor: '',
  linkHoverColor: '',
  buttonStyle: {},
  faviconUrl: '',
  ogImageUrl: '',
};

export default function BrandingPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const [branding, setBranding] = useState<Branding>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<'logos' | 'colors' | 'typography' | 'style'>('logos');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiTone, setAiTone] = useState('');
  const [showAiPanel, setShowAiPanel] = useState(false);

  const generateBranding = async () => {
    if (!aiPrompt.trim() || aiPrompt.trim().length < 10) {
      setAiError('Describe tu marca con al menos 10 caracteres.');
      return;
    }
    setAiGenerating(true);
    setAiError('');
    setAiTone('');
    try {
      const res = await fetch(`/api/portal/cms/websites/${siteId}/branding/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: aiPrompt.trim() }),
      });
      const data = await res.json();
      if (!data.success) {
        setAiError(data.message || 'La generación falló.');
        return;
      }
      const g = data.data;
      // Apply generated values (preserve logos and anything AI doesn't set)
      const updates: Partial<Branding> = {};
      if (g.primaryColor) updates.primaryColor = g.primaryColor;
      if (g.secondaryColor) updates.secondaryColor = g.secondaryColor;
      if (g.accentColor) updates.accentColor = g.accentColor;
      if (g.backgroundColor) updates.backgroundColor = g.backgroundColor;
      if (g.textColor) updates.textColor = g.textColor;
      if (g.headingFont) updates.headingFont = g.headingFont;
      if (g.bodyFont) updates.bodyFont = g.bodyFont;
      if (g.navBackground) updates.navBackground = g.navBackground;
      if (g.navTextColor) updates.navTextColor = g.navTextColor;
      if (g.borderRadius) updates.borderRadius = g.borderRadius;
      if (g.linkColor) updates.linkColor = g.linkColor;
      if (g.linkHoverColor) updates.linkHoverColor = g.linkHoverColor;
      if (g.buttonStyle) updates.buttonStyle = { ...(branding.buttonStyle || {}), ...g.buttonStyle };
      if (g.darkMode) updates.darkMode = { ...(branding.darkMode || {}), ...g.darkMode };
      if (g.typography) updates.typography = { ...(branding.typography || {}), ...g.typography };
      setBranding(prev => ({ ...prev, ...updates }));
      setDirty(true);
      if (g.tone) setAiTone(g.tone);
    } catch {
      setAiError('Error de red. Inténtalo de nuevo.');
    } finally {
      setAiGenerating(false);
    }
  };

  useEffect(() => {
    fetch(`/api/portal/websites/${siteId}/branding`)
      .then(r => r.json())
      .then(res => {
        if (res.success) setBranding({ ...DEFAULTS, ...res.data });
      })
      .finally(() => setLoading(false));
  }, [siteId]);

  const update = (updates: Partial<Branding>) => {
    setBranding(prev => ({ ...prev, ...updates }));
    setDirty(true);
  };

  const updateDark = (updates: Partial<DarkModeOverrides>) => {
    update({ darkMode: { ...(branding.darkMode || {}), ...updates } });
  };

  const updateButtonStyle = (updates: Partial<ButtonStyle>) => {
    update({ buttonStyle: { ...(branding.buttonStyle || {}), ...updates } });
  };

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await fetch(`/api/portal/websites/${siteId}/branding`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(branding),
      });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [siteId, branding]);

  const getTypo = (el: string): ElementTypography => ({
    ...DEFAULT_TYPOGRAPHY[el],
    ...(branding.typography?.[el] || {}),
  });

  const updateTypo = (el: string, updates: Partial<ElementTypography>) => {
    const current = getTypo(el);
    update({
      typography: {
        ...(branding.typography || {}),
        [el]: { ...current, ...updates },
      },
    });
  };

  // Resolve font for an element: element-specific -> headingFont/bodyFont -> system
  const resolveFont = (el: string): string => {
    const t = getTypo(el);
    if (t.font) return t.font;
    const info = ELEMENT_LABELS[el];
    if (info?.category === 'heading') return branding.headingFont || '';
    return branding.bodyFont || '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-icons animate-spin text-muted-foreground">refresh</span>
      </div>
    );
  }

  const inputClass = pInput;
  const labelClass = 'block text-xs font-medium text-muted-foreground mb-1.5';

  const tabs = [
    { id: 'logos' as const, label: 'Logotipos', icon: 'image' },
    { id: 'colors' as const, label: 'Colors', icon: 'palette' },
    { id: 'typography' as const, label: 'Tipografía', icon: 'text_fields' },
    { id: 'style' as const, label: 'Estilo', icon: 'tune' },
  ];

  return (
    <div className="max-w-4xl mx-auto py-6 px-6 space-y-6">
      {/* Header */}
      <PortalPageHeader
        eyebrow="Sitio web"
        title="Guía de marca"
        subtitle="Define la identidad de tu marca. Estos estilos se aplican de forma predeterminada en todo tu sitio."
        actions={
          <button
            onClick={save}
            disabled={!dirty || saving}
            className={pBtnPrimary}
          >
            <span className="material-icons text-base">{saving ? 'refresh' : 'save'}</span>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        }
      />

      {/* AI Brand Generator */}
      <div className={`${pCard} overflow-hidden`}>
        <button
          type="button"
          onClick={() => setShowAiPanel(!showAiPanel)}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-accent/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="material-icons text-primary">auto_awesome</span>
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">Generador de marca con IA</p>
              <p className="text-xs text-muted-foreground">Describe tu marca y deja que la IA genere colores, fuentes y estilos</p>
            </div>
          </div>
          <span className="material-icons text-muted-foreground text-base">{showAiPanel ? 'expand_less' : 'expand_more'}</span>
        </button>

        {showAiPanel && (
          <div className="px-5 pb-5 border-t border-border space-y-3">
            <div className="pt-3">
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Describe tu marca</label>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={3}
                className={`${pInput} resize-none`}
                placeholder="e.g. We're a modern fintech startup targeting millennials. Bold, energetic, and trustworthy. Our brand should feel premium but approachable, with a tech-forward aesthetic."
              />
            </div>

            {aiError && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                <span className="material-icons text-base">error_outline</span>
                {aiError}
              </div>
            )}

            {aiTone && (
              <div className="flex items-start gap-2 text-sm text-primary bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
                <span className="material-icons text-base mt-0.5">auto_awesome</span>
                <p>{aiTone}</p>
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">La IA generará colores, fuentes, tipografía, estilos de botones y modo oscuro. Los logotipos se conservan.</p>
              <button
                type="button"
                onClick={generateBranding}
                disabled={aiGenerating || !aiPrompt.trim()}
                className={pBtnPrimary}
              >
                {aiGenerating ? (
                  <>
                    <span className="material-icons text-base animate-spin">refresh</span>
                    Generating...
                  </>
                ) : (
                  <>
                    <span className="material-icons text-base">auto_awesome</span>
                    Generate Brand Theme
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-foreground text-foreground font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="material-icons text-base">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Logos ────────────────────────────────── */}
      {activeTab === 'logos' && (
      <div>
        <h2 className={`${pSectionTitle} mb-1 flex items-center gap-2`}>
          <span className="material-icons text-base">image</span>Logotipos</h2>
        <p className="text-sm text-muted-foreground mb-5">Sube distintos formatos de logotipo para los diferentes usos de tu sitio.</p>

        <div className="grid grid-cols-2 gap-6">
          {/* Square Logo */}
          <div>
            <label className={labelClass}>Logotipo cuadrado</label>
            <p className="text-xs text-muted-foreground mb-2">Se usa para favicon, redes sociales y pantallas pequeñas.</p>
            <MediaPicker
              value={branding.logoSquareUrl}
              onChange={(url) => update({ logoSquareUrl: url })}
              label="Logotipo cuadrado"
              mimeTypeFilter="image"
              apiEndpoint={`/api/portal/cms/websites/${siteId}/media`}
            />
          </div>

          {/* Rectangle Logo */}
          <div>
            <label className={labelClass}>Logotipo rectangular</label>
            <p className="text-xs text-muted-foreground mb-2">Se usa en la barra de navegación y los encabezados.</p>
            <MediaPicker
              value={branding.logoRectUrl}
              onChange={(url) => update({ logoRectUrl: url })}
              label="Logotipo rectangular"
              mimeTypeFilter="image"
              apiEndpoint={`/api/portal/cms/websites/${siteId}/media`}
            />
          </div>

          {/* Icon + Text Logo */}
          <div>
            <label className={labelClass}>Icono de logotipo</label>
            <p className="text-xs text-muted-foreground mb-2">Icono pequeño que aparece junto al nombre de tu marca.</p>
            <MediaPicker
              value={branding.logoIconUrl}
              onChange={(url) => update({ logoIconUrl: url })}
              label="Icono de logotipo"
              mimeTypeFilter="image"
              apiEndpoint={`/api/portal/cms/websites/${siteId}/media`}
            />
          </div>

          {/* Text Logo */}
          <div>
            <label className={labelClass}>Nombre de marca / logotipo de texto</label>
            <p className="text-xs text-muted-foreground mb-2">Texto que se muestra cuando no hay logotipo de imagen disponible.</p>
            <input
              type="text"
              value={branding.logoText}
              onChange={(e) => update({ logoText: e.target.value })}
              className={inputClass}
              placeholder="El nombre de tu marca"
            />
            {branding.logoText && (
              <div className="mt-3 p-4 rounded-xl bg-muted/30 border border-border">
                <span className="text-xl font-bold" style={{ fontFamily: branding.headingFont ? `"${branding.headingFont}", sans-serif` : undefined }}>
                  {branding.logoText}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Dark mode logos */}
        <div className="mt-6 pt-6 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
            <span className="material-icons text-base">dark_mode</span>
            Dark Mode Logo Overrides
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Sube logotipos alternativos para fondos oscuros. Si no se definen, se usan las versiones claras.</p>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className={labelClass}>Logotipo cuadrado oscuro</label>
              <MediaPicker
                value={branding.darkMode?.logoSquareUrl || ''}
                onChange={(url) => updateDark({ logoSquareUrl: url })}
                label="Logotipo cuadrado oscuro"
                mimeTypeFilter="image"
                apiEndpoint={`/api/portal/cms/websites/${siteId}/media`}
              />
            </div>
            <div>
              <label className={labelClass}>Logotipo rectangular oscuro</label>
              <MediaPicker
                value={branding.darkMode?.logoRectUrl || ''}
                onChange={(url) => updateDark({ logoRectUrl: url })}
                label="Logotipo rectangular oscuro"
                mimeTypeFilter="image"
                apiEndpoint={`/api/portal/cms/websites/${siteId}/media`}
              />
            </div>
            <div>
              <label className={labelClass}>Icono de logotipo oscuro</label>
              <MediaPicker
                value={branding.darkMode?.logoIconUrl || ''}
                onChange={(url) => updateDark({ logoIconUrl: url })}
                label="Icono de logotipo oscuro"
                mimeTypeFilter="image"
                apiEndpoint={`/api/portal/cms/websites/${siteId}/media`}
              />
            </div>
            <div>
              <label className={labelClass}>Logotipo primario oscuro (heredado)</label>
              <MediaPicker
                value={branding.darkMode?.logoUrl || ''}
                onChange={(url) => updateDark({ logoUrl: url })}
                label="Logotipo primario oscuro"
                mimeTypeFilter="image"
                apiEndpoint={`/api/portal/cms/websites/${siteId}/media`}
              />
            </div>
          </div>
        </div>

        {/* Legacy logo field */}
        <div className="mt-6 pt-6 border-t border-border">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className={labelClass}>Logotipo primario (heredado)</label>
              <MediaPicker
                value={branding.logoUrl}
                onChange={(url) => update({ logoUrl: url })}
                label="Logotipo primario"
                mimeTypeFilter="image"
                apiEndpoint={`/api/portal/cms/websites/${siteId}/media`}
              />
            </div>
            <div>
              <label className={labelClass}>Texto alternativo del logotipo</label>
              <input
                type="text"
                value={branding.logoAlt}
                onChange={(e) => update({ logoAlt: e.target.value })}
                className={inputClass}
                placeholder="Nombre de la empresa"
              />
            </div>
          </div>
        </div>
      </div>
      )}

      {/* ── Colors ───────────────────────────────── */}
      {activeTab === 'colors' && (
      <div>
        <h2 className={`${pSectionTitle} mb-1 flex items-center gap-2`}>
          <span className="material-icons text-base">palette</span>
          Colors
        </h2>
        <p className="text-sm text-muted-foreground mb-5">Define la paleta de colores de tu marca. Se usa de forma predeterminada en bloques y navegación.</p>

        <div className="grid grid-cols-3 gap-4">
          {([
            { key: 'primaryColor', label: 'Primario', desc: 'Botones, enlaces y acentos' },
            { key: 'secondaryColor', label: 'Secundario', desc: 'Elementos secundarios' },
            { key: 'accentColor', label: 'Acento', desc: 'Destacados e insignias' },
            { key: 'backgroundColor', label: 'Fondo', desc: 'Fondo de página' },
            { key: 'textColor', label: 'Texto', desc: 'Color del texto' },
            { key: 'navBackground', label: 'Fondo de la navegación', desc: 'Barra de navegación' },
            { key: 'navTextColor', label: 'Texto de la navegación', desc: 'Texto de navegación' },
          ] as const).map(({ key, label, desc }) => (
            <div key={key}>
              <label className={labelClass}>{label}</label>
              <p className="text-[11px] text-muted-foreground mb-2">{desc}</p>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={branding[key]}
                  onChange={(e) => update({ [key]: e.target.value })}
                  className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
                />
                <input
                  type="text"
                  value={branding[key]}
                  onChange={(e) => update({ [key]: e.target.value })}
                  className={`${inputClass} font-mono`}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Dark mode colors */}
        <div className="mt-6 pt-6 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
            <span className="material-icons text-base">dark_mode</span>
            Dark Mode Color Overrides
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Colores que se usan cuando el sitio está en modo oscuro. Si no se definen, se toman los del modo claro.</p>
          <div className="grid grid-cols-3 gap-4">
            {([
              { key: 'primaryColor' as const, label: 'Primario' },
              { key: 'secondaryColor' as const, label: 'Secundario' },
              { key: 'accentColor' as const, label: 'Acento' },
              { key: 'backgroundColor' as const, label: 'Fondo' },
              { key: 'textColor' as const, label: 'Texto' },
              { key: 'navBackground' as const, label: 'Fondo de la navegación' },
              { key: 'navTextColor' as const, label: 'Texto de la navegación' },
            ]).map(({ key, label }) => (
              <div key={key}>
                <label className={labelClass}>{label}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={branding.darkMode?.[key] || branding[key]}
                    onChange={(e) => updateDark({ [key]: e.target.value })}
                    className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
                  />
                  <input
                    type="text"
                    value={branding.darkMode?.[key] || ''}
                    onChange={(e) => updateDark({ [key]: e.target.value })}
                    className={`${inputClass} font-mono`}
                    placeholder={branding[key]}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Color previews: Light + Dark side by side */}
        <div className="mt-6 pt-6 border-t border-border">
          <label className={labelClass}>Vista previa</label>
          <div className="grid grid-cols-2 gap-4">
            {/* Light mode preview */}
            <div>
              <span className="text-[11px] text-muted-foreground mb-1 block">Modo claro</span>
              <div className="rounded-lg overflow-hidden border border-border">
                <div className="h-10 flex items-center px-4 gap-4" style={{ backgroundColor: branding.navBackground, color: branding.navTextColor }}>
                  <span className="text-sm font-semibold">{branding.logoText || 'Brand'}</span>
                  <div className="flex-1" />
                  <span className="text-xs">Enlace</span>
                  <span className="text-xs px-2 py-0.5 rounded text-white" style={{ backgroundColor: branding.primaryColor }}>Botón</span>
                </div>
                <div className="p-4" style={{ backgroundColor: branding.backgroundColor, color: branding.textColor }}>
                  <h3 className="text-base font-bold mb-1">Título</h3>
                  <p className="text-xs mb-2">Vista previa del texto con los colores de la marca.</p>
                  <div className="flex gap-1.5">
                    <span className="px-2 py-0.5 rounded text-xs text-white" style={{ backgroundColor: branding.primaryColor }}>Primario</span>
                    <span className="px-2 py-0.5 rounded text-xs text-white" style={{ backgroundColor: branding.secondaryColor }}>Secundario</span>
                    <span className="px-2 py-0.5 rounded text-xs text-white" style={{ backgroundColor: branding.accentColor }}>Acento</span>
                  </div>
                </div>
              </div>
            </div>
            {/* Dark mode preview */}
            <div>
              <span className="text-[11px] text-muted-foreground mb-1 block">Modo oscuro</span>
              <div className="rounded-lg overflow-hidden border border-border">
                <div className="h-10 flex items-center px-4 gap-4" style={{ backgroundColor: branding.darkMode?.navBackground || branding.navBackground, color: branding.darkMode?.textColor || branding.navTextColor }}>
                  <span className="text-sm font-semibold">{branding.logoText || 'Brand'}</span>
                  <div className="flex-1" />
                  <span className="text-xs">Enlace</span>
                  <span className="text-xs px-2 py-0.5 rounded text-white" style={{ backgroundColor: branding.darkMode?.primaryColor || branding.primaryColor }}>Botón</span>
                </div>
                <div className="p-4" style={{ backgroundColor: branding.darkMode?.backgroundColor || '#111827', color: branding.darkMode?.textColor || '#f3f4f6' }}>
                  <h3 className="text-base font-bold mb-1">Título</h3>
                  <p className="text-xs mb-2">Vista previa del texto con los colores del modo oscuro.</p>
                  <div className="flex gap-1.5">
                    <span className="px-2 py-0.5 rounded text-xs text-white" style={{ backgroundColor: branding.darkMode?.primaryColor || branding.primaryColor }}>Primario</span>
                    <span className="px-2 py-0.5 rounded text-xs text-white" style={{ backgroundColor: branding.darkMode?.secondaryColor || branding.secondaryColor }}>Secundario</span>
                    <span className="px-2 py-0.5 rounded text-xs text-white" style={{ backgroundColor: branding.darkMode?.accentColor || branding.accentColor }}>Acento</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* ── Typography ───────────────────────────── */}
      {activeTab === 'typography' && (
      <div>
        <h2 className={`${pSectionTitle} mb-1 flex items-center gap-2`}>
          <span className="material-icons text-base">text_fields</span>Tipografía</h2>
        <p className="text-sm text-muted-foreground mb-5">Define las fuentes predeterminadas de títulos y texto, y luego ajusta cada elemento.</p>

        {/* Global font defaults */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div>
            <label className={labelClass}>Fuente predeterminada de títulos</label>
            <p className="text-[11px] text-muted-foreground mb-2">Se aplica a H1-H6 salvo que se anule abajo.</p>
            <GoogleFontPicker
              value={branding.headingFont}
              onChange={(font) => update({ headingFont: font })}
            />
          </div>
          <div>
            <label className={labelClass}>Fuente predeterminada del texto</label>
            <p className="text-[11px] text-muted-foreground mb-2">Se aplica a los párrafos, las citas y las leyendas.</p>
            <GoogleFontPicker
              value={branding.bodyFont}
              onChange={(font) => update({ bodyFont: font })}
            />
          </div>
        </div>

        {/* Per-element typography */}
        {(['heading', 'body', 'ui'] as const).map(category => (
          <div key={category} className="mb-6">
            <h3 className="text-sm font-semibold text-foreground mb-3 capitalize flex items-center gap-2">
              <span className="material-icons text-sm">
                {category === 'heading' ? 'title' : category === 'body' ? 'notes' : 'smart_button'}
              </span>
              {category === 'heading' ? 'Títulos' : category === 'body' ? 'Texto del cuerpo' : 'UI Elements'}
            </h3>
            <div className="space-y-3">
              {Object.entries(ELEMENT_LABELS)
                .filter(([, info]) => info.category === category)
                .map(([el, info]) => {
                  const t = getTypo(el);
                  const font = resolveFont(el);
                  return (
                    <div key={el} className={`${pCard} p-4`}>
                      <div className="flex items-start gap-4">
                        {/* Preview */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">{info.label}</span>
                            <span className="text-[11px] text-muted-foreground">{info.desc}</span>
                          </div>
                          {font && (
                            <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@300;400;500;600;700;800&display=swap`} />
                          )}
                          <p
                            className="truncate"
                            style={{
                              fontFamily: font ? `"${font}", sans-serif` : undefined,
                              fontSize: t.size,
                              fontWeight: t.weight,
                              lineHeight: t.lineHeight,
                              letterSpacing: t.letterSpacing,
                            }}
                          >
                            The quick brown fox jumps over the lazy dog
                          </p>
                        </div>
                      </div>

                      {/* Controls */}
                      <div className="grid grid-cols-5 gap-3 mt-3 pt-3 border-t border-border/50">
                        <div>
                          <label className="block text-[11px] text-muted-foreground mb-1">Familia de fuente</label>
                          <GoogleFontPicker
                            value={t.font || ''}
                            onChange={(font) => updateTypo(el, { font: font || undefined })}
                          />
                          {!t.font && font && (
                            <span className="text-[10px] text-muted-foreground mt-0.5 block">Inherited: {font}</span>
                          )}
                        </div>
                        <div>
                          <label className="block text-[11px] text-muted-foreground mb-1">Tamaño</label>
                          <input
                            type="text"
                            value={t.size || ''}
                            onChange={(e) => updateTypo(el, { size: e.target.value })}
                            className={`${inputClass} text-xs`}
                            placeholder="1rem"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-muted-foreground mb-1">Peso</label>
                          <select
                            value={t.weight || '400'}
                            onChange={(e) => updateTypo(el, { weight: e.target.value })}
                            className={`${inputClass} text-xs`}
                          >
                            {WEIGHT_OPTIONS.map(w => (
                              <option key={w.value} value={w.value}>{w.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] text-muted-foreground mb-1">Interlineado</label>
                          <input
                            type="text"
                            value={t.lineHeight || ''}
                            onChange={(e) => updateTypo(el, { lineHeight: e.target.value })}
                            className={`${inputClass} text-xs`}
                            placeholder="1.5"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-muted-foreground mb-1">Espaciado de caracteres</label>
                          <input
                            type="text"
                            value={t.letterSpacing || ''}
                            onChange={(e) => updateTypo(el, { letterSpacing: e.target.value })}
                            className={`${inputClass} text-xs`}
                            placeholder="-0.02em"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Style */}
      {activeTab === 'style' && (
      <div className="space-y-8">
        {/* Border Radius */}
        <div>
          <h2 className={`${pSectionTitle} mb-1 flex items-center gap-2`}>
            <span className="material-icons text-base">rounded_corner</span>
            Border Radius
          </h2>
          <p className="text-sm text-muted-foreground mb-4">Lenguaje de formas global aplicado a botones, tarjetas y elementos de la interfaz.</p>
          <div className="grid grid-cols-4 gap-3">
            {[
              { value: '0px', label: 'Angular' },
              { value: '4px', label: 'Sutil' },
              { value: '8px', label: 'Redondeado' },
              { value: '9999px', label: 'Pastilla' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => update({ borderRadius: opt.value })}
                className={`p-3 border text-sm font-medium transition-colors ${
                  branding.borderRadius === opt.value
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
                }`}
                style={{ borderRadius: opt.value }}
              >
                <div
                  className="w-full h-8 bg-primary/20 mb-2"
                  style={{ borderRadius: opt.value }}
                />
                {opt.label}
              </button>
            ))}
          </div>
          <div className="mt-3">
            <label className={labelClass}>Valor personalizado</label>
            <input
              type="text"
              value={branding.borderRadius}
              onChange={(e) => update({ borderRadius: e.target.value })}
              className={`${inputClass} max-w-[200px]`}
              placeholder="8px"
            />
          </div>
        </div>

        {/* Link Colors */}
        <div>
          <h2 className={`${pSectionTitle} mb-1 flex items-center gap-2`}>
            <span className="material-icons text-base">link</span>
            Link Colors
          </h2>
          <p className="text-sm text-muted-foreground mb-4">Colores para los enlaces de texto en línea. Van separados del color primario por accesibilidad.</p>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className={labelClass}>Color de enlaces</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={branding.linkColor || branding.primaryColor}
                  onChange={(e) => update({ linkColor: e.target.value })}
                  className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
                />
                <input
                  type="text"
                  value={branding.linkColor}
                  onChange={(e) => update({ linkColor: e.target.value })}
                  className={`${inputClass} font-mono`}
                  placeholder={branding.primaryColor}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Color de enlace al pasar el cursor</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={branding.linkHoverColor || branding.primaryColor}
                  onChange={(e) => update({ linkHoverColor: e.target.value })}
                  className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
                />
                <input
                  type="text"
                  value={branding.linkHoverColor}
                  onChange={(e) => update({ linkHoverColor: e.target.value })}
                  className={`${inputClass} font-mono`}
                  placeholder={branding.primaryColor}
                />
              </div>
            </div>
          </div>
          <div className="mt-4 p-4 rounded-xl bg-muted/30 border border-border text-sm">
            <span style={{ color: branding.linkColor || branding.primaryColor, textDecoration: 'underline', cursor: 'pointer' }}>
              This is what a link looks like
            </span>
            {' '}within body text.
          </div>
        </div>

        {/* Button Style */}
        <div>
          <h2 className={`${pSectionTitle} mb-1 flex items-center gap-2`}>
            <span className="material-icons text-base">smart_button</span>
            Button Style
          </h2>
          <p className="text-sm text-muted-foreground mb-4">Estilo predeterminado de botones y CTA en todos los bloques.</p>

          <div className="mb-4">
            <label className={labelClass}>Variante predeterminada</label>
            <div className="flex gap-2">
              {(['filled', 'outline'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => updateButtonStyle({ variant: v })}
                  className={`px-4 py-2 text-sm font-medium border transition-colors capitalize ${
                    (branding.buttonStyle?.variant || 'filled') === v
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border text-muted-foreground hover:border-foreground'
                  }`}
                  style={{ borderRadius: branding.buttonStyle?.borderRadius || branding.borderRadius }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className={labelClass}>Radio de borde de botones</label>
            <input
              type="text"
              value={branding.buttonStyle?.borderRadius || ''}
              onChange={(e) => updateButtonStyle({ borderRadius: e.target.value })}
              className={`${inputClass} max-w-[200px]`}
              placeholder={branding.borderRadius || '8px'}
            />
            <p className="text-[11px] text-muted-foreground mt-1">Déjalo vacío para heredar el radio de borde global.</p>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Botón primario</h3>
              <div>
                <label className={labelClass}>Fondo</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={branding.buttonStyle?.primaryBg || branding.primaryColor}
                    onChange={(e) => updateButtonStyle({ primaryBg: e.target.value })}
                    className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
                  />
                  <input
                    type="text"
                    value={branding.buttonStyle?.primaryBg || ''}
                    onChange={(e) => updateButtonStyle({ primaryBg: e.target.value })}
                    className={`${inputClass} font-mono`}
                    placeholder={branding.primaryColor}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Color de texto</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={branding.buttonStyle?.primaryText || '#ffffff'}
                    onChange={(e) => updateButtonStyle({ primaryText: e.target.value })}
                    className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
                  />
                  <input
                    type="text"
                    value={branding.buttonStyle?.primaryText || ''}
                    onChange={(e) => updateButtonStyle({ primaryText: e.target.value })}
                    className={`${inputClass} font-mono`}
                    placeholder="#ffffff"
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Fondo al pasar el cursor</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={branding.buttonStyle?.primaryHoverBg || branding.primaryColor}
                    onChange={(e) => updateButtonStyle({ primaryHoverBg: e.target.value })}
                    className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
                  />
                  <input
                    type="text"
                    value={branding.buttonStyle?.primaryHoverBg || ''}
                    onChange={(e) => updateButtonStyle({ primaryHoverBg: e.target.value })}
                    className={`${inputClass} font-mono`}
                    placeholder={branding.primaryColor}
                  />
                </div>
              </div>
              <div className="pt-2">
                <button
                  className="px-4 py-2 text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: branding.buttonStyle?.primaryBg || branding.primaryColor,
                    color: branding.buttonStyle?.primaryText || '#ffffff',
                    borderRadius: branding.buttonStyle?.borderRadius || branding.borderRadius,
                  }}
                >Botón primario</button>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Botón secundario</h3>
              <div>
                <label className={labelClass}>Fondo</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={branding.buttonStyle?.secondaryBg || branding.secondaryColor}
                    onChange={(e) => updateButtonStyle({ secondaryBg: e.target.value })}
                    className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
                  />
                  <input
                    type="text"
                    value={branding.buttonStyle?.secondaryBg || ''}
                    onChange={(e) => updateButtonStyle({ secondaryBg: e.target.value })}
                    className={`${inputClass} font-mono`}
                    placeholder={branding.secondaryColor}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Color de texto</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={branding.buttonStyle?.secondaryText || '#ffffff'}
                    onChange={(e) => updateButtonStyle({ secondaryText: e.target.value })}
                    className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
                  />
                  <input
                    type="text"
                    value={branding.buttonStyle?.secondaryText || ''}
                    onChange={(e) => updateButtonStyle({ secondaryText: e.target.value })}
                    className={`${inputClass} font-mono`}
                    placeholder="#ffffff"
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Fondo al pasar el cursor</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={branding.buttonStyle?.secondaryHoverBg || branding.secondaryColor}
                    onChange={(e) => updateButtonStyle({ secondaryHoverBg: e.target.value })}
                    className="h-9 w-9 cursor-pointer rounded border border-border shrink-0"
                  />
                  <input
                    type="text"
                    value={branding.buttonStyle?.secondaryHoverBg || ''}
                    onChange={(e) => updateButtonStyle({ secondaryHoverBg: e.target.value })}
                    className={`${inputClass} font-mono`}
                    placeholder={branding.secondaryColor}
                  />
                </div>
              </div>
              <div className="pt-2">
                <button
                  className="px-4 py-2 text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: branding.buttonStyle?.secondaryBg || branding.secondaryColor,
                    color: branding.buttonStyle?.secondaryText || '#ffffff',
                    borderRadius: branding.buttonStyle?.borderRadius || branding.borderRadius,
                  }}
                >Botón secundario</button>
              </div>
            </div>
          </div>
        </div>

        {/* Favicon */}
        <div>
          <h2 className={`${pSectionTitle} mb-1 flex items-center gap-2`}>
            <span className="material-icons text-base">tab</span>
            Favicon
          </h2>
          <p className="text-sm text-muted-foreground mb-4">El icono pequeño que se muestra en las pestañas del navegador. Recomendado: PNG de 32x32 o 48x48.</p>
          <div className="max-w-sm">
            <MediaPicker
              value={branding.faviconUrl}
              onChange={(url) => update({ faviconUrl: url })}
              label="Favicon"
              mimeTypeFilter="image"
              apiEndpoint={`/api/portal/cms/websites/${siteId}/media`}
            />
          </div>
        </div>

        {/* OG / Social Image */}
        <div>
          <h2 className={`${pSectionTitle} mb-1 flex items-center gap-2`}>
            <span className="material-icons text-base">share</span>Social / Imagen OG</h2>
          <p className="text-sm text-muted-foreground mb-4">Imagen que se muestra al compartir páginas en redes sociales. Recomendada: 1200x630.</p>
          <div className="max-w-sm">
            <MediaPicker
              value={branding.ogImageUrl}
              onChange={(url) => update({ ogImageUrl: url })}
              label="Imagen OG"
              mimeTypeFilter="image"
              apiEndpoint={`/api/portal/cms/websites/${siteId}/media`}
            />
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
