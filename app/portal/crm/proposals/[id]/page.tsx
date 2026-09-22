'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { sanitizeRichHtml } from '@/lib/security/sanitize-html';
import CrmCompanyTypeaheadPicker from '@/components/portal/CrmCompanyTypeaheadPicker';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pBtnSoft, pCard, pCardPad, pInput, pSelect, pSectionTitle } from '@/components/portal/portal-ui';
import { normalizeLineItems, lineItemTotal, sumLineItems } from '@/lib/proposals/line-items';
import { formatMoney as fmtCurrency } from '@/lib/utils/money';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Section {
  id: string;
  type: 'heading' | 'text' | 'image' | 'divider' | 'pricing' | 'terms' | 'signature';
  content: string;
}

interface LineItem {
  id: string;
  description: string;
  details: string;
  quantity: number;
  unitPrice: number;
  optional: boolean;
}

interface Fee {
  id: string;
  label: string;
  type: 'flat' | 'percent';
  amount: number;
}

interface Contact {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
}

interface Deal {
  id: number;
  title: string;
}

interface Proposal {
  id: number;
  title: string;
  summary: string | null;
  status: string;
  contactId: number | null;
  companyId: number | null;
  dealId: number | null;
  sections: Section[];
  lineItems: LineItem[];
  fees: Fee[];
  currency: string;
  validUntil: string | null;
  clientToken: string;
  accentColor: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  footerText: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  signatureName: string | null;
  signedAt: string | null;
  createdAt: string;
  updatedAt: string;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  companyName: string | null;
  dealTitle: string | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const statusColor: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  viewed: 'bg-yellow-100 text-yellow-700',
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  expired: 'bg-gray-100 text-gray-500',
};

function uid(): string {
  return crypto.randomUUID();
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ProposalEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  // Display label for the typeahead picker. Seeded from the proposal's
  // denormalised `companyName` after load so the closed-state of the
  // dropdown reads correctly before any search happens.
  const [companyLabel, setCompanyLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Editable state
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [contactId, setContactId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [dealId, setDealId] = useState('');
  const [accentColor, setAccentColor] = useState('#2563eb');
  const [logoUrl, setLogoUrl] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [footerText, setFooterText] = useState('');
  const [sections, setSections] = useState<Section[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);

  // Send dialog
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [sendingUrl, setSendingUrl] = useState('');
  const [sending, setSending] = useState(false);

  // Delete dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Save-as-template dialog
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  /* Load proposal + reference data */
  const loadProposal = useCallback(async () => {
    const res = await fetch(`/api/portal/crm/proposals/${id}`);
    const d = await res.json();
    if (!d.success) {
      setError(d.message ?? 'No se pudo cargar la propuesta');
      setLoading(false);
      return;
    }
    const p = d.data as Proposal;
    setProposal(p);
    setTitle(p.title);
    setSummary(p.summary ?? '');
    setContactId(p.contactId ? String(p.contactId) : '');
    setCompanyId(p.companyId ? String(p.companyId) : '');
    setCompanyLabel(p.companyName ?? null);
    setDealId(p.dealId ? String(p.dealId) : '');
    setAccentColor(p.accentColor ?? '#2563eb');
    setLogoUrl(p.logoUrl ?? '');
    setCoverImageUrl(p.coverImageUrl ?? '');
    setValidUntil(p.validUntil ? p.validUntil.slice(0, 10) : '');
    setFooterText(p.footerText ?? '');
    setSections(Array.isArray(p.sections) ? p.sections : []);
    setLineItems(normalizeLineItems(p.lineItems) as LineItem[]);
    setFees(Array.isArray(p.fees) ? p.fees : []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadProposal();
    // Company picker uses typeahead (?q=<query>) below — no bulk fetch needed;
    // the pre-existing companyName on the loaded proposal seeds the closed-
    // state label of the picker. Contacts is still bulk-loaded at limit=100 —
    // TODO(perf): convert to typeahead when the contacts route gains ?q=.
    Promise.all([
      fetch('/api/portal/crm/contacts?limit=100').then(r => r.json()),
      fetch('/api/portal/crm/deals?status=open').then(r => r.json()),
    ]).then(([c, d]) => {
      setContacts(c.data?.contacts ?? c.data ?? []);
      setDeals(d.data ?? []);
    });
  }, [loadProposal]);

  /* Save */
  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess('');
    const body = {
      title,
      summary: summary || null,
      contactId: contactId ? Number(contactId) : null,
      companyId: companyId ? Number(companyId) : null,
      dealId: dealId ? Number(dealId) : null,
      accentColor,
      logoUrl: logoUrl || null,
      coverImageUrl: coverImageUrl || null,
      validUntil: validUntil || null,
      footerText: footerText || null,
      sections,
      lineItems,
      fees,
    };
    const res = await fetch(`/api/portal/crm/proposals/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setSaving(false);
    if (!d.success) {
      setError(d.message ?? 'No se pudo guardar');
      return;
    }
    setSuccess('Guardado');
    setTimeout(() => setSuccess(''), 2000);
  }

  /* Send */
  async function handleSend() {
    setSending(true);
    // Auto-save first
    await fetch(`/api/portal/crm/proposals/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, summary, contactId: contactId ? Number(contactId) : null, companyId: companyId ? Number(companyId) : null, dealId: dealId ? Number(dealId) : null, accentColor, logoUrl: logoUrl || null, coverImageUrl: coverImageUrl || null, validUntil: validUntil || null, footerText: footerText || null, sections, lineItems, fees }),
    });
    const res = await fetch(`/api/portal/crm/proposals/${id}/send`, { method: 'POST' });
    const d = await res.json();
    setSending(false);
    if (!d.success) {
      setError(d.message ?? 'No se pudo enviar');
      setShowSendDialog(false);
      return;
    }
    const url = `${window.location.origin}${d.data.proposalUrl}`;
    setSendingUrl(url);
    loadProposal();
  }

  /* Delete */
  async function handleDelete() {
    setDeleting(true);
    await fetch(`/api/portal/crm/proposals/${id}`, { method: 'DELETE' });
    setDeleting(false);
    router.push('/portal/crm/proposals');
  }

  /* Save as Template */
  async function handleSaveTemplate(e: React.FormEvent) {
    e.preventDefault();
    setSavingTemplate(true);
    const body = {
      name: templateName,
      sections,
      lineItems,
      fees,
      accentColor,
      footerText: footerText || null,
    };
    const res = await fetch('/api/portal/crm/proposal-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setSavingTemplate(false);
    if (d.success) {
      setShowTemplateDialog(false);
      setTemplateName('');
      setSuccess('Plantilla guardada');
      setTimeout(() => setSuccess(''), 2000);
    }
  }

  /* Section helpers */
  function addSection(type: Section['type']) {
    setSections(prev => [...prev, { id: uid(), type, content: '' }]);
  }

  function updateSection(sectionId: string, content: string) {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, content } : s));
  }

  function removeSection(sectionId: string) {
    setSections(prev => prev.filter(s => s.id !== sectionId));
  }

  function moveSection(sectionId: string, direction: -1 | 1) {
    setSections(prev => {
      const idx = prev.findIndex(s => s.id === sectionId);
      if (idx < 0) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
  }

  /* Line item helpers */
  function addLineItem() {
    setLineItems(prev => [...prev, { id: uid(), description: '', details: '', quantity: 1, unitPrice: 0, optional: false }]);
  }

  function updateLineItem(itemId: string, field: keyof LineItem, value: string | number | boolean) {
    setLineItems(prev => prev.map(li => li.id === itemId ? { ...li, [field]: value } : li));
  }

  function removeLineItem(itemId: string) {
    setLineItems(prev => prev.filter(li => li.id !== itemId));
  }

  /* Fee helpers */
  function addFee() {
    setFees(prev => [...prev, { id: uid(), label: '', type: 'flat', amount: 0 }]);
  }

  function updateFee(feeId: string, field: keyof Fee, value: string | number) {
    setFees(prev => prev.map(f => f.id === feeId ? { ...f, [field]: value } : f));
  }

  function removeFee(feeId: string) {
    setFees(prev => prev.filter(f => f.id !== feeId));
  }

  /* Computed totals */
  const subtotal = sumLineItems(lineItems.filter(li => !li.optional));
  const computedFees = fees.map(f => ({
    ...f,
    computed: f.type === 'flat' ? f.amount : Math.round(subtotal * f.amount / 100),
  }));
  const feesTotal = computedFees.reduce((sum, f) => sum + f.computed, 0);
  const grandTotal = subtotal + feesTotal;

  /* Contact / Company display for preview */
  const selectedContact = contacts.find(c => c.id === Number(contactId));
  const selectedCompanyName = companyId ? companyLabel : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <span className="material-icons animate-spin mr-2">autorenew</span>
        Cargando propuesta...
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="text-center py-20">
        <span className="material-icons text-4xl text-muted-foreground mb-2 block">error_outline</span>
        <p className="text-muted-foreground">{error || 'Propuesta no encontrada'}</p>
        <button onClick={() => router.push('/portal/crm/proposals')} className="mt-4 text-sm text-primary hover:underline">
          Volver a propuestas
        </button>
      </div>
    );
  }

  const sectionTypeLabel: Record<string, string> = {
    heading: 'Encabezado',
    text: 'Texto',
    image: 'Imagen',
    divider: 'Separador',
    pricing: 'Precios',
    terms: 'Condiciones',
    signature: 'Firma',
  };

  const sectionTypeIcon: Record<string, string> = {
    heading: 'title',
    text: 'notes',
    image: 'image',
    divider: 'horizontal_rule',
    pricing: 'payments',
    terms: 'gavel',
    signature: 'draw',
  };

  return (
    <div className="space-y-4">
      {/* Back + status row above the header */}
      <div className="flex items-center gap-3 mb-1">
        <button
          onClick={() => router.push('/portal/crm/proposals')}
          className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="Volver"
        >
          <span className="material-icons text-base">arrow_back</span>
        </button>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor[proposal.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {({ draft: 'Borrador', sent: 'Enviada', viewed: 'Vista', accepted: 'Aceptada', declined: 'Rechazada', expired: 'Expirada' })[proposal.status] ?? proposal.status}
        </span>
        {success && (
          <span className="text-xs text-green-600 flex items-center gap-1">
            <span className="material-icons text-sm">check</span>
            {success}
          </span>
        )}
        {error && (
          <span className="text-xs text-destructive flex items-center gap-1">
            <span className="material-icons text-sm">error</span>
            {error}
          </span>
        )}
      </div>
      <PortalPageHeader
        eyebrow="CRM"
        title={title || 'Propuesta sin título'}
        subtitle="Editor de propuesta"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTemplateDialog(true)}
              className={pBtnGhost}
            >
              <span className="material-icons text-sm">bookmark_add</span>
              Guardar como plantilla
            </button>
            <button
              onClick={() => setShowSendDialog(true)}
              disabled={proposal.status === 'accepted' || proposal.status === 'declined' || proposal.status === 'expired'}
              className={pBtnSoft}
            >
              <span className="material-icons text-sm">send</span>
              Enviar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={pBtnPrimary}
            >
              <span className="material-icons text-sm">save</span>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
            <button
              onClick={() => setShowDeleteDialog(true)}
              className="inline-flex items-center justify-center rounded-xl border border-destructive/30 bg-card px-3 py-2.5 text-sm text-destructive transition hover:bg-destructive/10"
            >
              <span className="material-icons text-sm">delete</span>
            </button>
          </div>
        }
      />

      {/* Two-column layout */}
      <div className="grid lg:grid-cols-5 gap-4">
        {/* Left Panel - Editor (60%) */}
        <div className="lg:col-span-3 space-y-4">
          {/* Title */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Título de la propuesta"
              className="w-full text-xl font-bold bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {/* Summary */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <label className="block text-xs font-medium text-muted-foreground mb-2">Resumen</label>
            <textarea
              value={summary}
              onChange={e => setSummary(e.target.value)}
              rows={3}
              placeholder="Resumen breve de esta propuesta..."
              className={`${pInput} resize-none`}
            />
          </div>

          {/* Recipient & Branding */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <h2 className={`${pSectionTitle} flex items-center gap-2`}>
              <span className="material-icons text-base text-muted-foreground">settings</span>
              Detalles y marca
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label htmlFor="proposal-contact" className="block text-xs font-medium text-muted-foreground mb-1">Contacto</label>
                <select id="proposal-contact" value={contactId} onChange={e => setContactId(e.target.value)} className={pSelect}>
                  <option value="">Ninguno</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Empresa</label>
                <CrmCompanyTypeaheadPicker
                  value={companyId}
                  selectedLabel={companyLabel}
                  onChange={opt => {
                    setCompanyId(opt ? String(opt.id) : '');
                    setCompanyLabel(opt ? opt.name : null);
                  }}
                  placeholder="Seleccionar empresa…"
                />
              </div>
              <div>
                <label htmlFor="proposal-deal" className="block text-xs font-medium text-muted-foreground mb-1">Negocio</label>
                <select id="proposal-deal" value={dealId} onChange={e => setDealId(e.target.value)} className={pSelect}>
                  <option value="">Ninguno</option>
                  {deals.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="proposal-accent-color-hex" className="block text-xs font-medium text-muted-foreground mb-1">Color de acento</label>
                <div className="flex items-center gap-2">
                  <input type="color" aria-label="Selector de color de acento" value={accentColor} onChange={e => setAccentColor(e.target.value)} className="w-8 h-8 rounded border border-border cursor-pointer" />
                  <input id="proposal-accent-color-hex" value={accentColor} onChange={e => setAccentColor(e.target.value)} className="flex-1 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">URL del logo</label>
                <input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..." className={pInput} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">URL de la imagen de portada</label>
                <input value={coverImageUrl} onChange={e => setCoverImageUrl(e.target.value)} placeholder="https://..." className={pInput} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Válido hasta</label>
                <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className={pInput} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Texto de pie</label>
                <input value={footerText} onChange={e => setFooterText(e.target.value)} placeholder="Gracias por tu consideración." className={pInput} />
              </div>
            </div>
          </div>

          {/* Content Sections */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <h2 className={`${pSectionTitle} flex items-center gap-2`}>
              <span className="material-icons text-base text-muted-foreground">view_list</span>
              Secciones de contenido
            </h2>

            {sections.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Aún no hay secciones. Añade secciones abajo para construir tu propuesta.</p>
            )}

            {sections.map((section, idx) => (
              <div key={section.id} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <span className="material-icons text-sm">{sectionTypeIcon[section.type] ?? 'article'}</span>
                    {sectionTypeLabel[section.type] ?? section.type}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => moveSection(section.id, -1)} disabled={idx === 0} className="p-1 rounded hover:bg-accent text-muted-foreground disabled:opacity-30 transition-colors">
                      <span className="material-icons text-sm">arrow_upward</span>
                    </button>
                    <button onClick={() => moveSection(section.id, 1)} disabled={idx === sections.length - 1} className="p-1 rounded hover:bg-accent text-muted-foreground disabled:opacity-30 transition-colors">
                      <span className="material-icons text-sm">arrow_downward</span>
                    </button>
                    <button onClick={() => removeSection(section.id)} className="p-1 rounded hover:bg-destructive/10 text-destructive transition-colors">
                      <span className="material-icons text-sm">close</span>
                    </button>
                  </div>
                </div>

                {section.type === 'heading' && (
                  <input
                    value={section.content}
                    onChange={e => updateSection(section.id, e.target.value)}
                    placeholder="Texto del encabezado..."
                    className={`${pInput} font-semibold`}
                  />
                )}
                {section.type === 'text' && (
                  <textarea
                    value={section.content}
                    onChange={e => updateSection(section.id, e.target.value)}
                    rows={4}
                    placeholder="Introduce el contenido (HTML admitido)..."
                    className={`${pInput} resize-y`}
                  />
                )}
                {section.type === 'image' && (
                  <div className="space-y-2">
                    <input
                      value={section.content}
                      onChange={e => updateSection(section.id, e.target.value)}
                      placeholder="URL de la imagen..."
                      className={pInput}
                    />
                    {section.content && (
                      <img src={section.content} alt="Imagen de sección" className="max-h-40 rounded-lg border border-border object-contain" />
                    )}
                  </div>
                )}
                {section.type === 'divider' && (
                  <hr className="border-border" />
                )}
                {section.type === 'pricing' && (
                  <p className="text-xs text-muted-foreground">Esta sección mostrará las partidas y la tabla de precios de abajo.</p>
                )}
                {section.type === 'terms' && (
                  <textarea
                    value={section.content}
                    onChange={e => updateSection(section.id, e.target.value)}
                    rows={4}
                    placeholder="Términos y condiciones..."
                    className={`${pInput} resize-y`}
                  />
                )}
                {section.type === 'signature' && (
                  <p className="text-xs text-muted-foreground">El campo de firma aparecerá aquí para que el cliente firme.</p>
                )}
              </div>
            ))}

            {/* Add section buttons */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              {(['heading', 'text', 'image', 'divider', 'pricing', 'terms', 'signature'] as Section['type'][]).map(type => (
                <button
                  key={type}
                  onClick={() => addSection(type)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-foreground/25 hover:text-foreground hover:shadow-sm"
                >
                  <span className="material-icons text-sm">{sectionTypeIcon[type]}</span>
                  {sectionTypeLabel[type]}
                </button>
              ))}
            </div>
          </div>

          {/* Line Items */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <h2 className={`${pSectionTitle} flex items-center gap-2`}>
              <span className="material-icons text-base text-muted-foreground">receipt_long</span>
              Partidas
            </h2>

            {lineItems.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-2 font-medium text-muted-foreground text-xs">Descripción</th>
                      <th className="text-left py-2 pr-2 font-medium text-muted-foreground text-xs">Detalles</th>
                      <th className="text-right py-2 pr-2 font-medium text-muted-foreground text-xs w-16">Cant.</th>
                      <th className="text-right py-2 pr-2 font-medium text-muted-foreground text-xs w-28">Precio unit.</th>
                      <th className="text-right py-2 pr-2 font-medium text-muted-foreground text-xs w-28">Total</th>
                      <th className="text-center py-2 pr-2 font-medium text-muted-foreground text-xs w-16">Opc.</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map(li => (
                      <tr key={li.id} className="border-b border-border last:border-0">
                        <td className="py-2 pr-2">
                          <input
                            value={li.description}
                            onChange={e => updateLineItem(li.id, 'description', e.target.value)}
                            placeholder="Descripción del artículo"
                            className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            value={li.details}
                            onChange={e => updateLineItem(li.id, 'details', e.target.value)}
                            placeholder="Detalles"
                            className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            min="0"
                            value={li.quantity}
                            onChange={e => updateLineItem(li.id, 'quantity', Number(e.target.value))}
                            className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground text-right outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={li.unitPrice}
                            onChange={e => updateLineItem(li.id, 'unitPrice', Number(e.target.value))}
                            className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground text-right outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                          />
                        </td>
                        <td className="py-2 pr-2 text-right font-medium text-foreground">
                          {fmtCurrency(lineItemTotal(li))}
                        </td>
                        <td className="py-2 pr-2 text-center">
                          <input
                            type="checkbox"
                            checked={li.optional}
                            onChange={e => updateLineItem(li.id, 'optional', e.target.checked)}
                            className="rounded border-border"
                          />
                        </td>
                        <td className="py-2">
                          <button onClick={() => removeLineItem(li.id)} className="p-1 rounded hover:bg-destructive/10 text-destructive transition-colors">
                            <span className="material-icons text-sm">close</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <button onClick={addLineItem} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors font-medium">
              <span className="material-icons text-sm">add</span>
              Añadir partida
            </button>

            {/* Totals */}
            {lineItems.length > 0 && (
              <div className="border-t border-border pt-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium text-foreground">{fmtCurrency(subtotal)}</span>
                </div>
                {computedFees.map(f => (
                  <div key={f.id} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{f.label || 'Cargo'} {f.type === 'percent' ? `(${f.amount}%)` : ''}</span>
                    <span className="text-foreground">{fmtCurrency(f.computed)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-bold pt-1 border-t border-border">
                  <span className="text-foreground">Total general</span>
                  <span className="text-foreground">{fmtCurrency(grandTotal)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Fees Editor */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <h2 className={`${pSectionTitle} flex items-center gap-2`}>
              <span className="material-icons text-base text-muted-foreground">percent</span>
              Cargos
            </h2>

            {fees.map(f => (
              <div key={f.id} className="flex items-center gap-2">
                <input
                  value={f.label}
                  onChange={e => updateFee(f.id, 'label', e.target.value)}
                  placeholder="Etiqueta del cargo"
                  className="flex-1 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
                />
                <select
                  value={f.type}
                  onChange={e => updateFee(f.id, 'type', e.target.value)}
                  className="appearance-none rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
                >
                  <option value="flat">Fijo ($)</option>
                  <option value="percent">Porcentaje (%)</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step={f.type === 'percent' ? '0.01' : '1'}
                  value={f.amount}
                  onChange={e => updateFee(f.id, 'amount', Number(e.target.value))}
                  className="w-24 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground text-right outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
                />
                <button onClick={() => removeFee(f.id)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors">
                  <span className="material-icons text-sm">close</span>
                </button>
              </div>
            ))}

            <button onClick={addFee} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors font-medium">
              <span className="material-icons text-sm">add</span>
              Añadir cargo
            </button>
          </div>
        </div>

        {/* Right Panel - Live Preview (40%) */}
        <div className="lg:col-span-2">
          <div className="sticky top-4">
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-4 py-2 border-b border-border bg-accent/30 flex items-center gap-2">
                <span className="material-icons text-sm text-muted-foreground">visibility</span>
                <span className="text-xs font-medium text-muted-foreground">Vista previa</span>
              </div>
              <div className="p-4 max-h-[calc(100vh-12rem)] overflow-y-auto">
                <div className="space-y-4">
                  {/* Logo */}
                  {logoUrl && (
                    <img src={logoUrl} alt="Logo" className="h-10 object-contain" />
                  )}

                  {/* Cover Image */}
                  {coverImageUrl && (
                    <img src={coverImageUrl} alt="Portada" className="w-full h-32 object-cover rounded-lg" />
                  )}

                  {/* Title */}
                  <h1 className="text-xl font-bold" style={{ color: accentColor }}>
                    {title || 'Propuesta sin título'}
                  </h1>

                  {/* Summary */}
                  {summary && (
                    <p className="text-sm text-muted-foreground">{summary}</p>
                  )}

                  {/* Recipient */}
                  {(selectedContact || selectedCompanyName) && (
                    <p className="text-xs text-muted-foreground">
                      Preparado para: {selectedContact ? `${selectedContact.firstName} ${selectedContact.lastName}` : ''}
                      {selectedContact && selectedCompanyName ? ' de ' : ''}
                      {selectedCompanyName ?? ''}
                    </p>
                  )}

                  {/* Valid until */}
                  {validUntil && (
                    <p className="text-xs text-muted-foreground">
                      Válido hasta: {new Date(validUntil + 'T00:00:00').toLocaleDateString()}
                    </p>
                  )}

                  {/* Sections */}
                  {sections.map(section => (
                    <div key={section.id}>
                      {section.type === 'heading' && (
                        <h2 className="text-base font-semibold" style={{ color: accentColor }}>
                          {section.content || 'Encabezado'}
                        </h2>
                      )}
                      {section.type === 'text' && (
                        <div className="text-sm text-foreground prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(section.content || '<p class="text-muted-foreground italic">Contenido de texto...</p>') }} />
                      )}
                      {section.type === 'image' && section.content && (
                        <img src={section.content} alt="Sección" className="w-full rounded-lg" />
                      )}
                      {section.type === 'divider' && (
                        <hr style={{ borderColor: accentColor, opacity: 0.3 }} />
                      )}
                      {section.type === 'pricing' && lineItems.length > 0 && (
                        <div className="border border-border rounded-lg overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-accent/30">
                                <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Artículo</th>
                                <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Qty</th>
                                <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Precio</th>
                                <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lineItems.map(li => (
                                <tr key={li.id} className="border-t border-border">
                                  <td className="px-2 py-1.5">
                                    <div className="font-medium text-foreground">{li.description || 'Artículo'}</div>
                                    {li.details && <div className="text-muted-foreground">{li.details}</div>}
                                    {li.optional && <span className="text-xs text-yellow-600">(Opcional)</span>}
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-muted-foreground">{li.quantity}</td>
                                  <td className="px-2 py-1.5 text-right text-muted-foreground">{fmtCurrency(li.unitPrice)}</td>
                                  <td className="px-2 py-1.5 text-right font-medium text-foreground">{fmtCurrency(lineItemTotal(li))}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t border-border">                                  <td colSpan={3} className="px-2 py-1.5 text-right text-muted-foreground">Subtotal</td>
                                <td className="px-2 py-1.5 text-right font-medium text-foreground">{fmtCurrency(subtotal)}</td>
                              </tr>
                              {computedFees.map(f => (
                                <tr key={f.id}>
                                  <td colSpan={3} className="px-2 py-1 text-right text-muted-foreground">{f.label || 'Cargo'}{f.type === 'percent' ? ` (${f.amount}%)` : ''}</td>
                                  <td className="px-2 py-1 text-right text-foreground">{fmtCurrency(f.computed)}</td>
                                </tr>
                              ))}
                              <tr className="border-t-2 border-border">
                                <td colSpan={3} className="px-2 py-1.5 text-right font-bold text-foreground">Total</td>
                                <td className="px-2 py-1.5 text-right font-bold" style={{ color: accentColor }}>{fmtCurrency(grandTotal)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                      {section.type === 'terms' && (
                        <div className="text-xs text-muted-foreground bg-accent/20 rounded-lg p-3">
                          <div className="font-medium text-foreground mb-1">Términos y condiciones</div>
                          <div className="whitespace-pre-wrap">{section.content || 'Los términos y condiciones aparecerán aquí.'}</div>
                        </div>
                      )}
                      {section.type === 'signature' && (
                        <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                          <span className="material-icons text-2xl text-muted-foreground">draw</span>
                          <p className="text-xs text-muted-foreground mt-1">Área de firma</p>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Footer */}
                  {footerText && (
                    <p className="text-xs text-muted-foreground pt-4 border-t border-border italic">{footerText}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Send Dialog */}
      {showSendDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full space-y-4">
            {sendingUrl ? (
              <>
                <div className="flex items-center gap-2 text-green-600">
                  <span className="material-icons">check_circle</span>
                  <h3 className="font-semibold text-foreground">Propuesta enviada</h3>
                </div>
                <p className="text-sm text-muted-foreground">Comparte este enlace con tu cliente:</p>
                <div className="flex items-center gap-2">
                  <input readOnly value={sendingUrl} className="flex-1 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none" />
                  <button
                    onClick={() => { navigator.clipboard.writeText(sendingUrl); }}
                    className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    title="Copiar enlace"
                  >
                    <span className="material-icons text-base">content_copy</span>
                  </button>
                </div>
                <div className="flex justify-end">
                  <button onClick={() => { setShowSendDialog(false); setSendingUrl(''); }} className={pBtnPrimary}>
                    Hecho
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="font-semibold text-foreground">Enviar propuesta</h3>
                <p className="text-sm text-muted-foreground">
                  Esto marcará la propuesta como &quot;Enviada&quot; y generará un enlace único para tu cliente.
                  {selectedContact?.email && (
                    <span className="block mt-1">
                      Puedes compartir el enlace con <strong>{selectedContact.firstName} {selectedContact.lastName}</strong> ({selectedContact.email}).
                    </span>
                  )}
                </p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowSendDialog(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    Cancelar
                  </button>
                  <button onClick={handleSend} disabled={sending} className={`${pBtnPrimary} disabled:opacity-50`}>
                    {sending ? 'Enviando...' : 'Enviar ahora'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="font-semibold text-foreground">Eliminar propuesta</h3>
            <p className="text-sm text-muted-foreground">
              ¿Seguro que quieres eliminar &quot;{title}&quot;? Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeleteDialog(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                Cancelar
              </button>
              <button onClick={handleDelete} disabled={deleting} className="inline-flex items-center justify-center gap-2 rounded-xl bg-destructive px-4 py-2.5 text-sm font-bold text-white transition hover:-translate-y-px hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save as Template Dialog */}
      {showTemplateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="font-semibold text-foreground">Guardar como plantilla</h3>
            <p className="text-sm text-muted-foreground">
              Guarda las secciones, partidas y cargos actuales como plantilla reutilizable.
            </p>
            <form onSubmit={handleSaveTemplate} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Nombre de la plantilla *</label>
                <input
                  required
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  placeholder="p. ej. Propuesta estándar de diseño web"
                  className={pInput}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowTemplateDialog(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={savingTemplate} className={pBtnPrimary}>
                  {savingTemplate ? 'Guardando...' : 'Guardar plantilla'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
