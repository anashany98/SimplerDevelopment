'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnGhost } from '@/components/portal/portal-ui';

type ProposedType =
  | 'task' | 'decision' | 'commitment' | 'relationship_update' | 'follow_up' | 'compliance_warning' | 'note'
  | 'crm_contact_classify' | 'crm_deal_link' | 'crm_deal_create' | 'crm_company_link' | 'crm_company_create';
type ReviewItemStatus = 'pending' | 'approved' | 'rejected' | 'edited';

interface ReviewItem {
  id: number;
  proposedType: ProposedType;
  proposedPayload: Record<string, unknown>;
  status: ReviewItemStatus;
  reviewedAt: string | null;
  resultEntityType: string | null;
  resultEntityId: number | null;
  createdAt: string;
}

const TYPE_META: Record<ProposedType, { label: string; icon: string; tone: string }> = {
  task: { label: 'Tarea', icon: 'task_alt', tone: 'text-blue-600 dark:text-blue-400 bg-blue-500/10' },
  decision: { label: 'Decisión', icon: 'flag', tone: 'text-purple-600 dark:text-purple-400 bg-purple-500/10' },
  commitment: { label: 'Compromiso', icon: 'handshake', tone: 'text-amber-600 dark:text-amber-400 bg-amber-500/10' },
  relationship_update: { label: 'Actualización de relación', icon: 'group_work', tone: 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/10' },
  follow_up: { label: 'Seguimiento', icon: 'reply', tone: 'text-foreground bg-muted' },
  compliance_warning: { label: 'Aviso de cumplimiento', icon: 'warning', tone: 'text-red-600 dark:text-red-400 bg-red-500/10' },
  note: { label: 'Nota', icon: 'sticky_note_2', tone: 'text-foreground bg-muted' },
  crm_contact_classify: { label: 'Clasificar contacto', icon: 'badge', tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
  crm_deal_link:        { label: 'Vincular a negocio',     icon: 'link',  tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
  crm_deal_create:      { label: 'Crear negocio',      icon: 'monetization_on', tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
  crm_company_link:     { label: 'Vincular a empresa',  icon: 'link',  tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
  crm_company_create:   { label: 'Crear empresa',   icon: 'apartment', tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
};

const TYPE_ORDER: ProposedType[] = [
  'compliance_warning',
  'crm_company_link', 'crm_company_create', 'crm_contact_classify', 'crm_deal_link', 'crm_deal_create',
  'task', 'decision', 'commitment', 'relationship_update', 'follow_up', 'note',
];

interface MeetingShape {
  id: number;
  title: string;
  status: string;
  aiSummary: string | null;
}

export default function MeetingReviewPage() {
  const params = useParams<{ id: string }>();
  const meetingId = parseInt(params.id, 10);

  const [meeting, setMeeting] = useState<MeetingShape | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mr, ir] = await Promise.all([
        fetch(`/api/portal/brain/communications/${meetingId}`),
        fetch(`/api/portal/brain/communications/${meetingId}/review`),
      ]);
      const [mj, ij] = await Promise.all([mr.json(), ir.json()]);
      if (!mr.ok || !mj.success) {
        setError(mj.message || 'No se pudo cargar la comunicación.');
      } else if (!ir.ok || !ij.success) {
        setError(ij.message || 'No se pudieron cargar los elementos de revisión.');
      } else {
        setMeeting({ id: mj.data.id, title: mj.data.title, status: mj.data.status, aiSummary: mj.data.aiSummary });
        setItems(ij.data);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red');
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => { if (!Number.isNaN(meetingId)) load(); }, [meetingId, load]);

  const grouped = useMemo(() => {
    const out = new Map<ProposedType, ReviewItem[]>();
    for (const t of TYPE_ORDER) out.set(t, []);
    for (const i of items) {
      if (!out.has(i.proposedType)) out.set(i.proposedType, []);
      out.get(i.proposedType)!.push(i);
    }
    return out;
  }, [items]);

  const pendingCount = items.filter((i) => i.status === 'pending').length;

  const approve = async (item: ReviewItem, editedPayload?: Record<string, unknown>) => {
    setBusyId(item.id);
    try {
      const r = await fetch(`/api/portal/brain/review-items/${item.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editedPayload ? { editedPayload } : {}),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'No se pudo aprobar.');
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (item: ReviewItem) => {
    setBusyId(item.id);
    try {
      const r = await fetch(`/api/portal/brain/review-items/${item.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'No se pudo rechazar.');
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center py-16 text-muted-foreground">
        <span className="material-icons animate-spin mr-2">progress_activity</span>
        Cargando la cola de revisión…
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
          {error || 'Comunicación no encontrada.'}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-6">
      <div>
        <Link
          href={`/portal/brain/communications/${meetingId}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4"
        >
          <span className="material-icons text-sm">arrow_back</span>
          Volver a la comunicación
        </Link>
        <PortalPageHeader
          eyebrow="Cerebro de empresa"
          title={
            <span className="flex items-center gap-2">
              <span className="material-icons text-primary">reviews</span>
              Cola de revisión
            </span>
          }
          subtitle={meeting.title}
          actions={
            pendingCount === 0
              ? <span className="text-emerald-600 dark:text-emerald-400 font-medium inline-flex items-center gap-1 text-sm"><span className="material-icons text-base">check_circle</span> Todo en orden</span>
              : <span className="text-sm text-muted-foreground"><strong className="text-foreground">{pendingCount}</strong> pendientes</span>
          }
        />
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {meeting.aiSummary && (
        <section className="bg-card border border-border rounded-2xl p-5">
          <h2 className="font-display text-[17px] font-extrabold tracking-[-0.02em] text-foreground flex items-center gap-2 mb-2">
            <span className="material-icons text-base text-muted-foreground">auto_awesome</span>
            Resumen de IA
          </h2>
          <p className="text-sm text-foreground whitespace-pre-wrap">{meeting.aiSummary}</p>
        </section>
      )}

      {items.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-2xl">
          <span className="material-icons text-4xl text-muted-foreground mb-2 block">inbox</span>
          <p className="text-sm text-muted-foreground">
            Aún no hay elementos en la cola de revisión. Ejecuta el procesamiento de IA desde la página de la comunicación.
          </p>
        </div>
      ) : (
        TYPE_ORDER.filter((t) => (grouped.get(t)?.length ?? 0) > 0).map((type) => (
          <section key={type} className="space-y-2">
            <h2 className="font-display text-[17px] font-extrabold tracking-[-0.02em] text-foreground flex items-center gap-2">
              <span className="material-icons text-base text-muted-foreground">{TYPE_META[type].icon}</span>
              {TYPE_META[type].label}
              <span className="text-xs text-muted-foreground font-normal">
                ({grouped.get(type)!.length})
              </span>
            </h2>
            <div className="space-y-2">
              {grouped.get(type)!.map((item) => (
                <ReviewCard
                  key={item.id}
                  item={item}
                  busy={busyId === item.id}
                  onApprove={(payload) => approve(item, payload)}
                  onReject={() => reject(item)}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function ReviewCard({ item, busy, onApprove, onReject }: {
  item: ReviewItem;
  busy: boolean;
  onApprove: (editedPayload?: Record<string, unknown>) => void;
  onReject: () => void;
}) {
  const meta = TYPE_META[item.proposedType];
  const [editing, setEditing] = useState(false);
  const [draftJson, setDraftJson] = useState(JSON.stringify(item.proposedPayload, null, 2));

  const isPending = item.status === 'pending';

  let summary = '';
  const p = item.proposedPayload;
  if (item.proposedType === 'task') {
    summary = (typeof p.title === 'string' ? p.title : 'Tarea sin título');
  } else if (item.proposedType === 'decision') {
    summary = (typeof p.title === 'string' ? p.title : '');
  } else if (item.proposedType === 'commitment') {
    summary = `${typeof p.who === 'string' ? p.who : 'Alguien'} → ${typeof p.what === 'string' ? p.what : ''}`;
  } else if (item.proposedType === 'relationship_update') {
    summary = `${typeof p.field === 'string' ? p.field : 'campo'}: ${typeof p.value === 'string' ? p.value : ''}`;
  } else if (item.proposedType === 'compliance_warning') {
    summary = typeof p.message === 'string' ? p.message : '';
  } else if (item.proposedType === 'crm_contact_classify') {
    const parts: string[] = [];
    if (typeof p.proposedStatus === 'string') parts.push(`estado → ${p.proposedStatus}`);
    if (typeof p.proposedSeniority === 'string') parts.push(`antigüedad → ${p.proposedSeniority}`);
    if (typeof p.proposedDepartment === 'string') parts.push(`departamento → ${p.proposedDepartment}`);
    if (typeof p.proposedTitle === 'string') parts.push(`cargo → ${p.proposedTitle}`);
    summary = parts.length > 0 ? `Contacto #${p.contactId}: ${parts.join(', ')}` : `Contacto #${p.contactId}`;
  } else if (item.proposedType === 'crm_deal_link') {
    summary = `Vincular este correo al negocio #${p.dealId}`;
  } else if (item.proposedType === 'crm_deal_create') {
    const value = typeof p.value === 'number' ? ` (${formatCents(p.value, typeof p.currency === 'string' ? p.currency : 'EUR')})` : '';
    summary = `Crear negocio: ${typeof p.title === 'string' ? p.title : '(sin título)'}${value}`;
  } else if (item.proposedType === 'crm_company_link') {
    const candidates = Array.isArray(p.candidateCompanyIds) ? p.candidateCompanyIds : [];
    summary = candidates.length > 1
      ? `Elige una empresa entre ${candidates.length} candidatas (por defecto: #${p.companyId})`
      : `Vincular a empresa #${p.companyId}`;
  } else if (item.proposedType === 'crm_company_create') {
    const dom = typeof p.domain === 'string' ? ` (${p.domain})` : '';
    summary = `Crear empresa: ${typeof p.name === 'string' ? p.name : '(sin nombre)'}${dom}`;
  } else {
    summary = JSON.stringify(p).slice(0, 80);
  }

  return (
    <div className={`bg-card border rounded-2xl p-4 ${
      item.status === 'approved' || item.status === 'edited'
        ? 'border-emerald-500/30 bg-emerald-500/5'
        : item.status === 'rejected'
          ? 'border-border opacity-60'
          : 'border-border'
    }`}>
      <div className="flex items-start gap-3">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.tone} flex items-center gap-1 flex-shrink-0`}>
          <span className="material-icons text-sm">{meta.icon}</span>
          {meta.label}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground break-words">{summary}</p>
          <PayloadDetails payload={item.proposedPayload} type={item.proposedType} />
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isPending ? (
            <>
              <button
                onClick={() => setEditing(!editing)}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded-xl border border-border bg-card text-foreground hover:border-foreground/25 disabled:opacity-50 inline-flex items-center"
              >
                {editing ? 'Cancelar edición' : 'Editar'}
              </button>
              <button
                onClick={onReject}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded-xl border border-border bg-card text-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 inline-flex items-center gap-1"
              >
                <span className="material-icons text-sm">close</span>
                Rechazar
              </button>
              <button
                onClick={() => {
                  if (editing) {
                    try {
                      const parsed = JSON.parse(draftJson);
                      onApprove(parsed);
                      setEditing(false);
                    } catch {
                      alert('El JSON editado no es válido.');
                    }
                  } else {
                    onApprove();
                  }
                }}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded-xl bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 inline-flex items-center gap-1 font-semibold"
              >
                <span className="material-icons text-sm">check</span>
                Aprobar
              </button>
            </>
          ) : item.status === 'approved' || item.status === 'edited' ? (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
              <span className="material-icons text-sm">check_circle</span>
              {item.status === 'edited' ? 'Editado y aprobado' : 'Aprobado'}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <span className="material-icons text-sm">block</span>
              Rechazado
            </span>
          )}
        </div>
      </div>
      {editing && (
        <div className="mt-3">
          <label className="text-xs text-muted-foreground mb-1 block">Edita el JSON antes de aprobar:</label>
          <textarea
            value={draftJson}
            onChange={(e) => setDraftJson(e.target.value)}
            rows={Math.min(15, draftJson.split('\n').length + 1)}
            className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs text-foreground font-mono outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
          />
        </div>
      )}
    </div>
  );
}

function PayloadDetails({ payload, type }: { payload: Record<string, unknown>; type: ProposedType }) {
  const bits: { label: string; value: string }[] = [];
  if (type === 'task') {
    if (typeof payload.description === 'string' && payload.description) bits.push({ label: '', value: payload.description });
    if (typeof payload.ownerHint === 'string') bits.push({ label: 'responsable', value: payload.ownerHint });
    if (typeof payload.dueDate === 'string') bits.push({ label: 'vence', value: payload.dueDate });
    if (typeof payload.priority === 'string') bits.push({ label: 'prioridad', value: payload.priority });
    if (payload.complianceFlag === true) bits.push({ label: '', value: 'marca de cumplimiento' });
    if (typeof payload.relatesToBrainHit === 'string') bits.push({ label: 'contexto de Brain', value: payload.relatesToBrainHit });
  } else if (type === 'decision' && typeof payload.details === 'string') {
    bits.push({ label: '', value: payload.details });
  } else if (type === 'commitment' && typeof payload.when === 'string') {
    bits.push({ label: 'cuándo', value: payload.when });
  } else if (type === 'relationship_update' && typeof payload.rationale === 'string') {
    bits.push({ label: 'motivo', value: payload.rationale });
  } else if (type === 'compliance_warning' && typeof payload.severity === 'string') {
    bits.push({ label: 'gravedad', value: payload.severity });
  } else if (type === 'crm_contact_classify') {
    if (typeof payload.confidence === 'string') bits.push({ label: 'confianza', value: payload.confidence });
    if (typeof payload.rationale === 'string') bits.push({ label: 'motivo', value: payload.rationale });
  } else if (type === 'crm_deal_link') {
    if (typeof payload.rationale === 'string') bits.push({ label: 'motivo', value: payload.rationale });
  } else if (type === 'crm_deal_create') {
    if (typeof payload.priority === 'string') bits.push({ label: 'prioridad', value: payload.priority });
    if (typeof payload.expectedCloseDate === 'string') bits.push({ label: 'cierre previsto', value: payload.expectedCloseDate });
    if (typeof payload.contactId === 'number') bits.push({ label: 'contacto', value: `#${payload.contactId}` });
    if (typeof payload.companyId === 'number') bits.push({ label: 'empresa', value: `#${payload.companyId}` });
    if (typeof payload.rationale === 'string') bits.push({ label: 'motivo', value: payload.rationale });
  } else if (type === 'crm_company_link') {
    const candidates = Array.isArray(payload.candidateCompanyIds) ? payload.candidateCompanyIds : [];
    if (candidates.length > 1) bits.push({ label: 'candidatas', value: candidates.map((c) => `#${c}`).join(', ') });
    if (typeof payload.rationale === 'string') bits.push({ label: 'motivo', value: payload.rationale });
  } else if (type === 'crm_company_create') {
    if (typeof payload.industry === 'string') bits.push({ label: 'sector', value: payload.industry });
    if (typeof payload.website === 'string') bits.push({ label: 'sitio web', value: payload.website });
    if (typeof payload.rationale === 'string') bits.push({ label: 'motivo', value: payload.rationale });
  }

  if (bits.length === 0) return null;
  return (
    <div className="text-xs text-muted-foreground mt-1.5 space-y-0.5">
      {bits.map((b, i) => (
        <div key={i}>
          {b.label && <span className="font-medium">{b.label}:</span>} {b.value}
        </div>
      ))}
    </div>
  );
}

function formatCents(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: currency || 'EUR' }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}
