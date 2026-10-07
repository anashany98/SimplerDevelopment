'use client';

import { useState, useEffect } from 'react';
import { formatCents } from '@/lib/portal-utils';
import SurveyBuilder, { SurveyField } from '@/components/admin/SurveyBuilder';
import { FEATURE_DOMAINS } from '@/lib/billing/domain-catalog';

interface Service {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  price: number;
  billingCycle: string | null;
  active: boolean;
  features: string[];
  surveyFields: SurveyField[];
  stripePriceId: string | null;
  stripeProductId: string | null;
}

const categoryIcon: Record<string, string> = {
  // Module domains — sourced from FEATURE_DOMAINS
  ...Object.fromEntries(FEATURE_DOMAINS.map((d) => [d.key, d.icon])),
  // Bundle / plan tiers
  bundle: 'all_inclusive',
  'plan-starter': 'star_outline',
  'plan-growth': 'trending_up',
  'plan-scale': 'rocket_launch',
  // Legacy service categories
  domain: 'language',
  hosting: 'cloud',
  development: 'code',
  maintenance: 'build',
  plugins: 'extension',
};

const emptyForm = {
  name: '', description: '', category: '', price: '', billingCycle: 'once', active: true, stripePriceId: '',
};

export default function AdminPortalServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [featuresInput, setFeaturesInput] = useState('');
  const [editFeaturesInput, setEditFeaturesInput] = useState('');
  const [form, setForm] = useState({ ...emptyForm });
  const [editForm, setEditForm] = useState({ ...emptyForm });
  const [createSurveyFields, setCreateSurveyFields] = useState<SurveyField[]>([]);
  const [editSurveyFields, setEditSurveyFields] = useState<SurveyField[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/portal/services').then(r => r.json()).then(d => {
      setServices(d.data ?? []);
      setLoading(false);
    });
  }, []);

  async function createService(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const features = featuresInput.split('\n').map(f => f.trim()).filter(Boolean);
    const res = await fetch('/api/admin/portal/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        price: Math.round(parseFloat(form.price) * 100),
        features,
        stripePriceId: form.stripePriceId || undefined,
        surveyFields: createSurveyFields,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!data.success) { setError(data.message ?? 'No se pudo crear'); return; }
    setServices(prev => [...prev, data.data]);
    setShowCreateForm(false);
    setForm({ ...emptyForm });
    setFeaturesInput('');
    setCreateSurveyFields([]);
  }

  function startEdit(svc: Service) {
    setEditingId(svc.id);
    setEditForm({
      name: svc.name,
      description: svc.description ?? '',
      category: svc.category,
      price: (svc.price / 100).toFixed(2),
      billingCycle: svc.billingCycle ?? 'once',
      active: svc.active,
      stripePriceId: svc.stripePriceId ?? '',
    });
    setEditFeaturesInput((svc.features ?? []).join('\n'));
    setEditSurveyFields(svc.surveyFields ?? []);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (editingId === null) return;
    setSaving(true);
    setError('');
    const features = editFeaturesInput.split('\n').map(f => f.trim()).filter(Boolean);
    const res = await fetch(`/api/admin/portal/services/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...editForm,
        price: Math.round(parseFloat(editForm.price) * 100),
        features,
        stripePriceId: editForm.stripePriceId || null,
        surveyFields: editSurveyFields,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!data.success) { setError(data.message ?? 'No se pudo guardar'); return; }
    setServices(prev => prev.map(s => s.id === editingId ? data.data : s));
    setEditingId(null);
  }

  async function deleteService(id: number, name: string) {
    if (!window.confirm(`¿Eliminar "${name}"? Esta acción no se puede deshacer.`)) return;
    setDeleting(id);
    const res = await fetch(`/api/admin/portal/services/${id}`, { method: 'DELETE' });
    const data = await res.json();
    setDeleting(null);
    if (data.success) {
      setServices(prev => prev.filter(s => s.id !== id));
    } else {
      alert(data.message ?? 'No se pudo eliminar');
    }
  }

  async function toggleActive(id: number, active: boolean) {
    const res = await fetch('/api/admin/portal/services', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, active }),
    });
    const data = await res.json();
    if (data.success) setServices(prev => prev.map(s => s.id === id ? { ...s, active } : s));
  }

  const serviceForm = (
    values: typeof emptyForm,
    setValues: React.Dispatch<React.SetStateAction<typeof emptyForm>>,
    feats: string,
    setFeats: (v: string) => void,
    surveyFields: SurveyField[],
    setSurveyFields: (v: SurveyField[]) => void,
    onSubmit: (e: React.FormEvent) => void,
    onCancel: () => void,
    submitLabel: string,
  ) => (
    <form onSubmit={onSubmit} className="grid sm:grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Nombre del servicio <span className="text-destructive">*</span></label>
        <input type="text" required value={values.name} onChange={e => setValues({ ...values, name: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Categoría<span className="text-destructive">*</span></label>
        <select value={values.category} onChange={e => setValues({ ...values, category: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="domain">Dominio (White Label)</option>
          <option value="hosting">Hosting (Railway White Label)</option>
          <option value="development">Desarrollo</option>
          <option value="maintenance">Mantenimiento</option>
          <option value="plugins">Plugins</option>
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="block text-sm font-medium text-foreground mb-1">Descripción</label>
        <textarea rows={2} value={values.description} onChange={e => setValues({ ...values, description: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Precio (EUR) <span className="text-destructive">*</span></label>
        <input type="number" required min="0" step="0.01" placeholder="0.00" value={values.price}
          onChange={e => setValues({ ...values, price: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Ciclo de facturación</label>
        <select value={values.billingCycle} onChange={e => setValues({ ...values, billingCycle: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="once">Pago único</option>
          <option value="monthly">Mensual</option>
          <option value="annually">Anual</option>
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="block text-sm font-medium text-foreground mb-1">ID de precio de Stripe (opcional: se crea solo si se deja en blanco)</label>
        <input type="text" placeholder="price_xxx" value={values.stripePriceId}
          onChange={e => setValues({ ...values, stripePriceId: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
        <p className="text-xs text-muted-foreground mt-0.5">Déjalo en blanco para crear automáticamente un producto y precio de Stripe cuando Stripe esté configurado.</p>
      </div>
      <div className="sm:col-span-2">
        <label className="block text-sm font-medium text-foreground mb-1">Características (una por línea)</label>
        <textarea rows={4} value={feats} onChange={e => setFeats(e.target.value)}
          placeholder={'Configuración de dominio personalizado\nCertificado SSL incluido\nGestión de DNS'}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
      </div>

      {/* ── Survey Builder ────────────────────────────────── */}
      <div className="sm:col-span-2 border-t border-border pt-4 mt-2">
        <SurveyBuilder fields={surveyFields} onChange={setSurveyFields} />
      </div>

      <div className="sm:col-span-2 flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
        <button type="submit" disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-foreground text-background rounded-lg text-sm font-medium hover:bg-foreground/90 disabled:opacity-50">
          {saving ? <><span className="material-icons text-base animate-spin">refresh</span>Guardando...</> : submitLabel}
        </button>
      </div>
    </form>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Catálogo de servicios</h1>
          <p className="text-muted-foreground mt-1">Gestiona servicios y sus formularios de solicitud. Añade una encuesta para que los clientes completen los detalles al solicitar un servicio.</p>
        </div>
        <button onClick={() => { setShowCreateForm(!showCreateForm); setEditingId(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg text-sm font-medium hover:bg-foreground/90 transition-colors">
          <span className="material-icons text-base">add</span>Nuevo servicio
        </button>
      </div>

      {showCreateForm && (
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Crear servicio</h2>
          {error && <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">{error}</div>}
          {serviceForm(
            form, setForm,
            featuresInput, setFeaturesInput,
            createSurveyFields, setCreateSurveyFields,
            createService, () => { setShowCreateForm(false); setCreateSurveyFields([]); },
            'Crear servicio',
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando...</div>
      ) : services.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">Aún no hay servicios. Crea uno arriba.</div>
      ) : (
        <div className="space-y-4">
          {services.map(svc => (
            <div key={svc.id} className={`bg-card border rounded-xl overflow-hidden ${svc.active ? 'border-border' : 'border-border opacity-60'}`}>
              {editingId === svc.id ? (
                <div className="p-6">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Editando: {svc.name}</h3>
                  {error && <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">{error}</div>}
                  {serviceForm(
                    editForm, setEditForm,
                    editFeaturesInput, setEditFeaturesInput,
                    editSurveyFields, setEditSurveyFields,
                    saveEdit, () => setEditingId(null),
                    'Guardar cambios',
                  )}
                </div>
              ) : (
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="material-icons text-xl text-primary mt-0.5">{categoryIcon[svc.category] ?? 'category'}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-foreground">{svc.name}</h3>
                          <span className="text-xs text-muted-foreground capitalize bg-muted px-1.5 py-0.5 rounded">{svc.category}</span>
                          {(svc.surveyFields ?? []).length > 0 && (
                            <span className="text-xs text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                              <span className="material-icons text-xs">assignment</span>
                              {svc.surveyFields.length} campo{svc.surveyFields.length !== 1 ? 's' : ''} de encuesta
                            </span>
                          )}
                          {svc.stripeProductId ? (
                            <span className="text-xs text-green-700 bg-green-100 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                              <span className="material-icons text-xs">check_circle</span>Sincronizado con Stripe
                            </span>
                          ) : (
                            <span className="text-xs text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                              <span className="material-icons text-xs">warning</span>Sin producto en Stripe
                            </span>
                          )}
                        </div>
                        {svc.description && <p className="text-sm text-muted-foreground mt-0.5">{svc.description}</p>}
                        <div className="mt-1 flex items-center gap-3 text-sm">
                          <span className="font-bold text-foreground">{formatCents(svc.price)}</span>
                          {svc.billingCycle !== 'once' && <span className="text-xs text-muted-foreground">/{svc.billingCycle}</span>}
                          {svc.stripePriceId && (
                            <span className="text-xs text-muted-foreground font-mono truncate max-w-[180px]" title={svc.stripePriceId}>
                              {svc.stripePriceId}
                            </span>
                          )}
                        </div>
                        {(svc.features ?? []).length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                            {(svc.features ?? []).slice(0, 4).map((f, i) => (
                              <span key={i} className="text-xs text-muted-foreground flex items-center gap-0.5">
                                <span className="material-icons text-xs text-green-600">check</span>{f}
                              </span>
                            ))}
                            {(svc.features ?? []).length > 4 && (
                              <span className="text-xs text-muted-foreground">+{svc.features.length - 4} más</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => toggleActive(svc.id, !svc.active)}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${svc.active ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700' : 'bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-700'}`}>
                        {svc.active ? 'Activo' : 'Inactivo'}
                      </button>
                      <button onClick={() => startEdit(svc)}
                        className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                        title="Editar">
                        <span className="material-icons text-base">edit</span>
                      </button>
                      <button onClick={() => deleteService(svc.id, svc.name)} disabled={deleting === svc.id}
                        className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-40"
                        title="Eliminar">
                        <span className="material-icons text-base">{deleting === svc.id ? 'refresh' : 'delete_outline'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
