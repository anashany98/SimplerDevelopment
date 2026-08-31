'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { slugify } from '@/lib/publishing/slug';
import { pBtnPrimary, pBtnGhost, pCard, pInput } from '@/components/portal/portal-ui';

const WEBSITE_TYPES = [
  { value: 'business', label: 'Web corporativa', icon: 'business', description: 'Inicio, empresa, servicios y contacto' },
  { value: 'portfolio', label: 'Portafolio', icon: 'photo_library', description: 'Muestra tu trabajo y proyectos' },
  { value: 'blog', label: 'Blog', icon: 'rss_feed', description: 'Artículos, noticias y contenido extenso' },
  { value: 'landing', label: 'Landing Page', icon: 'web', description: 'Página única enfocada en un solo objetivo' },
  { value: 'ecommerce', label: 'E-commerce', icon: 'shopping_cart', description: 'Vende productos en línea' },
  { value: 'other', label: 'Otra cosa', icon: 'more_horiz', description: 'Configuración personalizada — lo resolvemos juntos' },
];

export default function PortalCmsNewPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState({ name: '', domain: '', description: '', websiteType: '', subdomain: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Auto-generate subdomain from name
  const effectiveSubdomain = form.subdomain || slugify(form.name, 63);

  const handleCreate = async () => {
    if (!form.name) { setError('Por favor, ingresa un nombre para el sitio web.'); return; }
    setSaving(true); setError('');
    const res = await fetch('/api/portal/cms/websites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        domain: form.domain || null,
        description: form.description || null,
        subdomain: effectiveSubdomain || null,
      }),
    });
    const data = await res.json();
    if (!data.success) { setSaving(false); setError(data.message || 'No se pudo crear la web.'); return; }

    setSaving(false);
    router.push(`/portal/websites/${data.data.id}?created=1`);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back */}
      <Link
        href="/portal/websites"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="material-icons text-base">arrow_back</span>
        Volver a webs
      </Link>

      {/* Progress */}
      <div className="flex items-center gap-2">
        {([1, 2, 3] as const).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
              step > s ? 'bg-primary text-primary-foreground' :
              step === s ? 'bg-primary text-primary-foreground' :
              'bg-muted text-muted-foreground'
            }`}>
              {step > s ? <span className="material-icons text-sm">check</span> : s}
            </div>
            {s < 3 && <div className={`h-px flex-1 w-8 transition-colors ${step > s ? 'bg-primary' : 'bg-border'}`} />}
          </div>
        ))}
        <div className="ml-2 text-xs text-muted-foreground">
          {step === 1 && 'Elige el tipo'}
          {step === 2 && 'Nombra tu sitio'}
          {step === 3 && 'Dominio (opcional)'}
        </div>
      </div>

      {/* Step 1 — Website type */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-display font-extrabold tracking-[-0.02em] text-foreground">¿Qué tipo de sitio web estás creando?</h1>
            <p className="text-muted-foreground text-sm mt-1">Esto nos ayuda a configurarlo todo para ti, pero puedes cambiarlo cuando quieras.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {WEBSITE_TYPES.map((type) => (
              <button
                key={type.value}
                onClick={() => { setForm(f => ({ ...f, websiteType: type.value })); setStep(2); }}
                className={`flex items-start gap-3 p-4 rounded-2xl border text-left transition-all hover:border-primary/60 hover:bg-primary/5 group ${
                  form.websiteType === type.value ? 'border-primary bg-primary/5' : 'border-border bg-card'
                }`}
              >
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                  <span className="material-icons text-muted-foreground group-hover:text-primary transition-colors">{type.icon}</span>
                </div>
                <div>
                  <p className="font-medium text-foreground text-sm">{type.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{type.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2 — Name */}
      {step === 2 && (
        <div className="space-y-5">
          <div>
            <h1 className="text-xl font-display font-extrabold tracking-[-0.02em] text-foreground">Nombra tu sitio web</h1>
            <p className="text-muted-foreground text-sm mt-1">Esto es solo una etiqueta interna — tus visitantes no la verán.</p>
          </div>
          <div className={`${pCard} p-5 space-y-4`}>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Nombre del sitio web *</label>
              <input
                autoFocus
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter' && form.name) setStep(3); }}
                placeholder={
                  form.websiteType === 'business' ? 'p. ej., Web de Acme' :
                  form.websiteType === 'blog' ? 'e.g. My Blog' :
                  form.websiteType === 'portfolio' ? 'e.g. My Portfolio' :
                  'p. ej., Mi web'
                }
                className={`${pInput} w-full`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Descripción breve<span className="text-muted-foreground font-normal">(optional)</span></label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="¿Para qué es este sitio web?"
                className={`${pInput} w-full resize-none`}
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className={pBtnGhost}>Atrás</button>
            <button
              onClick={() => { if (!form.name) { setError('Por favor, ingresa un nombre.'); return; } setError(''); setStep(3); }}
              disabled={!form.name}
              className={`${pBtnPrimary} flex-1 disabled:opacity-50`}
            >Continuar</button>
          </div>
        </div>
      )}

      {/* Step 3 — Subdomain + Domain + create */}
      {step === 3 && (
        <div className="space-y-5">
          <div>
            <h1 className="text-xl font-display font-extrabold tracking-[-0.02em] text-foreground">La dirección de tu sitio web</h1>
            <p className="text-muted-foreground text-sm mt-1">Tu sitio estará disponible en un subdominio gestionado por CRM AGENTS. Puedes agregar un dominio propio más adelante.</p>
          </div>

          {/* Subdomain */}
          <div className={`${pCard} p-5 space-y-4`}>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Subdominio</label>
              <div className="flex items-center gap-0">
                <div className="flex items-center gap-2 px-3 py-2.5 bg-background border border-border rounded-l-lg flex-1 focus-within:border-primary transition-colors">
                  <input
                    autoFocus
                    value={form.subdomain || slugify(form.name, 63)}
                    onChange={e => setForm(f => ({ ...f, subdomain: slugify(e.target.value, 63) }))}
                    className="bg-transparent outline-none flex-1 text-sm text-foreground font-mono"
                  />
                </div>
                <div className="px-3 py-2.5 bg-muted border border-l-0 border-border rounded-r-lg text-sm text-muted-foreground font-mono shrink-0">
                  · CRM AGENTS
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                This will be your website&apos;s default URL
              </p>
            </div>

            {/* Custom domain (optional) */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Dominio personalizado<span className="text-muted-foreground font-normal">(optional)</span></label>
              <div className="flex items-center gap-2 px-3 py-2.5 bg-background border border-border rounded-lg focus-within:border-primary transition-colors">
                <span className="material-icons text-muted-foreground text-base">language</span>
                <input
                  value={form.domain}
                  onChange={e => setForm(f => ({ ...f, domain: e.target.value.replace(/^https?:\/\//, '') }))}
                  placeholder="yoursite.com"
                  className="bg-transparent outline-none flex-1 text-sm text-foreground font-mono"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">También puedes configurar esto más tarde</p>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-muted/30 border border-border rounded-2xl p-4 space-y-2 text-sm">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Resumen</p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tipo</span>
              <span className="text-foreground font-medium capitalize">{WEBSITE_TYPES.find(t => t.value === form.websiteType)?.label || form.websiteType}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nombre</span>
              <span className="text-foreground font-medium">{form.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">URL</span>
              <span className="text-foreground font-mono text-xs">{effectiveSubdomain} · CRM AGENTS</span>
            </div>
            {form.domain && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dominio personalizado</span>
                <span className="text-foreground font-mono text-xs">{form.domain}</span>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className={pBtnGhost}>Atrás</button>
            <button
              onClick={handleCreate}
              disabled={saving}
              className={`${pBtnPrimary} flex-1 disabled:opacity-50`}
            >
              {saving && <span className="material-icons text-base animate-spin">refresh</span>}
              {saving ? 'Creando...' : 'Crear web'}
            </button>
          </div>

          {/* Request help */}
          <div className={`${pCard} flex items-center gap-3 p-4`}>
            <span className="material-icons text-muted-foreground">support_agent</span>
            <div className="flex-1 text-sm">
              <p className="font-medium text-foreground">¿Necesitas ayuda?</p>
              <p className="text-muted-foreground text-xs mt-0.5">Nuestro equipo puede configurarlo todo por ti.</p>
            </div>
            <Link
              href="/portal/tickets/new"
              className="text-sm text-primary hover:underline shrink-0 flex items-center gap-1"
            >
              Get help
              <span className="material-icons text-sm">arrow_forward</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
