'use client';

/**
 * Decisions — create / supersede form.
 *
 *   /portal/brain/decisions/new                    → create flow.
 *   /portal/brain/decisions/new?supersedes=<id>    → supersede flow. Fetches
 *                                                    the predecessor and
 *                                                    pre-fills the form.
 *
 * On submit:
 *   - create:    POST /api/portal/brain/decisions
 *   - supersede: POST /api/portal/brain/decisions/[oldId]/supersede
 * Then, if topicIds are selected, POSTs /api/portal/brain/topics/attach with
 * `entityType: 'decision', entityId: <newId>, topicIds: [...]`. Redirects to
 * the new decision's detail page on success.
 */
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import DecisionForm, {
  type DecisionFormInitial,
  type DecisionFormSubmitPayload,
} from '@/components/brain/DecisionForm';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnGhost } from '@/components/portal/portal-ui';

interface DetailResponse {
  success: boolean;
  data?: {
    decision: {
      id: number;
      title: string;
      context: string | null;
      decision: string;
      rationale: string;
      alternativesConsidered: string | null;
      reversibility: 'one_way' | 'two_way';
      status: 'proposed' | 'accepted' | 'superseded' | 'rejected';
      decisionMakerId: number | null;
      decidedAt: string;
      meetingId: number | null;
      noteId: number | null;
      companyId: number | null;
      dealId: number | null;
      confidentialityLevel: 'standard' | 'restricted' | 'confidential';
    };
  };
  message?: string;
}

export default function NewDecisionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supersedesIdRaw = searchParams.get('supersedes');
  const supersedesId = supersedesIdRaw ? parseInt(supersedesIdRaw, 10) : null;
  const isSupersede = supersedesId !== null && Number.isFinite(supersedesId);

  const [initial, setInitial] = useState<DecisionFormInitial | undefined>(
    isSupersede ? undefined : {},
  );
  const [loadingInitial, setLoadingInitial] = useState(isSupersede);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // When in supersede mode, fetch the predecessor and pre-fill.
  useEffect(() => {
    if (!isSupersede || supersedesId === null) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/portal/brain/decisions/${supersedesId}`);
        const json: DetailResponse = await r.json();
        if (cancelled) return;
        if (!r.ok || !json.success || !json.data) {
          setLoadError(json.message || `HTTP ${r.status}`);
          setLoadingInitial(false);
          return;
        }
        const d = json.data.decision;
        setInitial({
          title: d.title,
          context: d.context,
          decision: d.decision,
          rationale: d.rationale,
          alternativesConsidered: d.alternativesConsidered,
          reversibility: d.reversibility,
          // Default decidedAt to today for the new decision — superseding is
          // a fresh act, not a back-date.
          decidedAt: new Date(),
          decisionMakerId: d.decisionMakerId,
          meetingId: d.meetingId,
          noteId: d.noteId,
          companyId: d.companyId,
          dealId: d.dealId,
          confidentialityLevel: d.confidentialityLevel,
          topicIds: [],
        });
        setLoadingInitial(false);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Error de red');
        setLoadingInitial(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isSupersede, supersedesId]);

  const handleSubmit = useCallback(
    async (payload: DecisionFormSubmitPayload) => {
      setSubmitting(true);
      setSubmitError(null);
      try {
        const body = {
          title: payload.title,
          context: payload.context,
          decision: payload.decision,
          rationale: payload.rationale,
          alternativesConsidered: payload.alternativesConsidered,
          reversibility: payload.reversibility,
          decidedAt: payload.decidedAt,
          decisionMakerId: payload.decisionMakerId,
          anchors: payload.anchors,
          confidentialityLevel: payload.confidentialityLevel,
        };

        const url = isSupersede
          ? `/api/portal/brain/decisions/${supersedesId}/supersede`
          : '/api/portal/brain/decisions';
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await r.json().catch(() => ({}));
        if (!r.ok || !json?.success) {
          setSubmitError(json?.message || `HTTP ${r.status}`);
          setSubmitting(false);
          return;
        }

        // Both endpoints return slightly different shapes:
        //   POST /decisions       → { data: { decision: row } }
        //   POST /…/supersede     → { data: { previous, current: row } }
        const created = (json.data.decision ?? json.data.current) as { id: number };
        const newId = created?.id;
        if (!newId) {
          setSubmitError('La respuesta del servidor no incluye el id de la decisión');
          setSubmitting(false);
          return;
        }

        // Attach topics (post-create, idempotent).
        if (payload.topicIds.length > 0) {
          try {
            await fetch('/api/portal/brain/topics/attach', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                entityType: 'decision',
                entityId: newId,
                topicIds: payload.topicIds,
              }),
            });
          } catch {
            // Non-blocking — the decision is already created. The user can
            // re-attach topics from the detail view in a future iteration.
          }
        }

        router.push(`/portal/brain/decisions/${newId}`);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Error de red');
        setSubmitting(false);
      }
    },
    [isSupersede, supersedesId, router],
  );

  if (isSupersede && loadingInitial) {
    return (
      <div className="max-w-3xl mx-auto py-12 flex items-center justify-center gap-2 text-muted-foreground text-sm">
        <span className="material-icons animate-spin mr-2">autorenew</span>
        Cargando la decisión anterior…
      </div>
    );
  }

  if (isSupersede && loadError) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-sm text-destructive">
          <div className="flex items-center gap-2 font-medium mb-1">
            <span className="material-icons text-base">error_outline</span>
            No se pudo cargar la decisión que se va a reemplazar
          </div>
          <p>{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
      <div className="mb-2">
        <Link
          href={isSupersede ? `/portal/brain/decisions/${supersedesId}` : '/portal/brain/decisions'}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4"
        >
          <span className="material-icons text-sm">chevron_left</span>
          {isSupersede ? 'Volver a la decisión' : 'Decisiones'}
        </Link>
        <PortalPageHeader
          eyebrow="Cerebro de empresa"
          title={
            <span className="flex items-center gap-2">
              <span className="material-icons text-primary">{isSupersede ? 'history' : 'add_circle'}</span>
              {isSupersede ? 'Reemplazar decisión' : 'Registrar una decisión'}
            </span>
          }
          subtitle={isSupersede
            ? 'Crea una nueva decisión que reemplaza la anterior. La predecesora se marcará como reemplazada.'
            : 'Captura el contexto, qué se decidió, por qué y qué alternativas se consideraron. Las decisiones son un historial inmutable: para "cambiar" una más adelante, la reemplazas.'}
        />
      </div>

      <DecisionForm
        mode={isSupersede ? 'supersede' : 'create'}
        initial={initial}
        cancelHref={isSupersede ? `/portal/brain/decisions/${supersedesId}` : '/portal/brain/decisions'}
        submitLabel={isSupersede ? 'Reemplazar' : 'Registrar decisión'}
        onSubmit={handleSubmit}
        submitting={submitting}
        submitError={submitError}
      />
    </div>
  );
}
