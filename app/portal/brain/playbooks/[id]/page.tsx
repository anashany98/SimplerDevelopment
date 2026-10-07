'use client';

/**
 * Playbook detail.
 *
 * Layout:
 *   [back to list]
 *   ┌────────────────────────────────────────────────────────────────────────┐
 *   │ Header: name + status + triggerKind + category + owner                 │
 *   │                       Actions: Edit / Activate / Archive / Start / Del │
 *   ├────────────────────────────────────────────────────────────────────────┤
 *   │ Description                                                            │
 *   │ Trigger config (formatted)                                             │
 *   │ Default topics (chip list)                                             │
 *   │ Steps — read-only <PlaybookStepGraph>                                  │
 *   │ DAG validation banner (draft only)                                     │
 *   │ Active runs link                                                       │
 *   └────────────────────────────────────────────────────────────────────────┘
 *
 * "Start a run" opens a modal so the user can supply label + context + links
 * without navigating away. On success, redirects to /playbook-runs/[runId].
 */

import { useCallback, useEffect, useMemo, useState, use as reactUse } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PlaybookStepGraph from '@/components/brain/PlaybookStepGraph';
import PlaybookContextEditor from '@/components/brain/PlaybookContextEditor';
import {
  PLAYBOOK_LINK_ENTITY_TYPES,
  playbookLinkEntityMeta,
  playbookStatusChip,
  playbookTriggerKindChip,
  type BrainPlaybookLinkEntityType,
  type PlaybookRow,
  type PlaybookStepRow,
} from '@/components/brain/playbooks-shared';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pCard, pCardPad, pSectionTitle, pInput, pSelect } from '@/components/portal/portal-ui';

interface TeamMember {
  userId: number;
  name: string | null;
  email: string;
}

interface DetailResponse {
  playbook: PlaybookRow;
  steps: PlaybookStepRow[];
}

interface RunListEnvelope {
  items: Array<{ id: number; status: string }>;
}

export default function PlaybookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = reactUse(params);
  const router = useRouter();
  const playbookId = parseInt(id, 10);

  const [data, setData] = useState<DetailResponse | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dagErrors, setDagErrors] = useState<string[] | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [activeRunCount, setActiveRunCount] = useState<number>(0);

  const load = useCallback(async () => {
    if (!Number.isFinite(playbookId) || playbookId <= 0) {
      setError('ID de playbook no válido');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/portal/brain/playbooks/${playbookId}`);
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'No se pudo cargar el playbook');
        setData(null);
        return;
      }
      setData(json.data as DetailResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red');
    } finally {
      setLoading(false);
    }
  }, [playbookId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/portal/team')
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success && Array.isArray(json.data)) {
          setTeam(
            json.data
              .filter((m: { userId?: number }) => typeof m.userId === 'number')
              .map((m: { userId: number; name: string | null; email: string }) => ({
                userId: m.userId,
                name: m.name,
                email: m.email,
              })),
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Pull active-run count for the link.
  useEffect(() => {
    let cancelled = false;
    if (!Number.isFinite(playbookId) || playbookId <= 0) return;
    fetch(
      `/api/portal/brain/playbook-runs?playbookId=${playbookId}&status=pending,active,paused&limit=100`,
    )
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success && json.data) {
          const items = (json.data as RunListEnvelope).items ?? [];
          setActiveRunCount(items.length);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [playbookId]);

  const ownerLookup = useMemo(() => {
    const m: Record<number, TeamMember> = {};
    for (const t of team) m[t.userId] = t;
    return m;
  }, [team]);

  // ─── actions ──────────────────────────────────────────────────────────────

  const onActivate = useCallback(async () => {
    if (!data) return;
    setBusy(true);
    setError(null);
    setDagErrors(null);
    try {
      const r = await fetch(
        `/api/portal/brain/playbooks/${playbookId}/activate`,
        { method: 'POST' },
      );
      const json = await r.json();
      if (!r.ok || !json.success) {
        // Surface DAG errors inline if present.
        const msg = json.message || 'No se pudo activar';
        if (/DAG invalid/i.test(msg)) {
          const parts = msg.replace(/^.*?DAG invalid:\s*/i, '').split(/;\s*/);
          setDagErrors(parts);
        }
        setError(msg);
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }, [data, playbookId, load]);

  const onArchive = useCallback(async () => {
    if (!data) return;
    if (!confirm('¿Archivar este playbook? Las ejecuciones activas bloquearán el archivado a menos que se fuerce.'))
      return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/portal/brain/playbooks/${playbookId}/archive`, {
        method: 'POST',
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'No se pudo archivar');
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }, [data, playbookId, load]);

  const onDelete = useCallback(async () => {
    if (!data) return;
    if (!confirm('¿Eliminar este playbook? Esta acción no se puede deshacer.')) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/portal/brain/playbooks/${playbookId}`, {
        method: 'DELETE',
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'No se pudo eliminar');
        return;
      }
      router.push('/portal/brain/playbooks');
    } finally {
      setBusy(false);
    }
  }, [data, playbookId, router]);

  // ─── render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-16 flex items-center justify-center text-muted-foreground">
        <span className="material-icons animate-spin mr-2">autorenew</span>Cargando…</div>
    );
  }

  if (error && !data) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <Link
          href="/portal/brain/playbooks"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <span className="material-icons text-sm">chevron_left</span>
          Playbooks
        </Link>
        <div className="mt-4 bg-destructive/10 border border-destructive/30 rounded-md p-4 text-sm text-destructive flex items-center gap-2">
          <span className="material-icons text-base">error_outline</span>
          {error || 'Playbook no encontrado'}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { playbook, steps } = data;
  const status = playbookStatusChip(playbook.status);
  const trigger = playbookTriggerKindChip(playbook.triggerKind);
  const owner = playbook.ownerId !== null ? ownerLookup[playbook.ownerId] : null;
  const ownerName =
    owner?.name ||
    owner?.email ||
    (playbook.ownerId !== null ? `Usuario #${playbook.ownerId}` : null);

  const isDraft = playbook.status === 'draft';
  const isActive = playbook.status === 'active';

  return (
    <div className="max-w-4xl mx-auto py-4 space-y-6">
      <Link
        href="/portal/brain/playbooks"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <span className="material-icons text-sm">chevron_left</span>
        Playbooks
      </Link>

      <PortalPageHeader
        eyebrow="Cerebro de empresa"
        title={playbook.name}
        subtitle={
          <span className="inline-flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
            <span className="font-mono">{playbook.slug}</span>
            {ownerName && (
              <span className="inline-flex items-center gap-1">
                <span className="material-icons text-base">person</span>
                {ownerName}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <span className="material-icons text-base">format_list_numbered</span>
              {steps.length} paso{steps.length === 1 ? '' : 's'}
            </span>
          </span>
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/portal/brain/playbooks/${playbookId}/edit`}
              className={pBtnGhost}
            >
              <span className="material-icons text-sm">edit</span>Editar</Link>
            {isDraft && (
              <button
                type="button"
                onClick={onActivate}
                disabled={busy || steps.length === 0}
                title={steps.length === 0 ? 'Añade al menos un paso antes de activar' : ''}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
              >
                <span className="material-icons text-sm">play_arrow</span>
                Activar
              </button>
            )}
            {isActive && (
              <button
                type="button"
                onClick={() => setStartOpen(true)}
                disabled={busy}
                className={`${pBtnPrimary} disabled:opacity-50`}
              >
                <span className="material-icons text-sm">play_circle</span>
                Iniciar ejecución
              </button>
            )}
            {isActive && (
              <button
                type="button"
                onClick={onArchive}
                disabled={busy}
                className={`${pBtnGhost} disabled:opacity-50`}
              >
                <span className="material-icons text-sm">archive</span>Archivar</button>
            )}
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              <span className="material-icons text-sm">delete</span>Eliminar</button>
          </div>
        }
      />

      <div className="mb-6 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.className}`}
          >
            <span className="material-icons text-[14px]">{status.icon}</span>
            {status.label}
          </span>
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${trigger.className}`}
          >
            <span className="material-icons text-[14px]">{trigger.icon}</span>
            {trigger.label}
          </span>
          {playbook.category && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted/60 text-muted-foreground">
              {playbook.category}
            </span>
          )}
        </div>

        {playbook.description && (
          <div className="text-sm text-foreground/90 whitespace-pre-wrap">
            {playbook.description}
          </div>
        )}

        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-xs text-destructive flex items-start gap-2">
            <span className="material-icons text-base">error_outline</span>
            <div className="flex-1">
              {error}
              {dagErrors && dagErrors.length > 0 && (
                <ul className="mt-1 list-disc pl-4">
                  {dagErrors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Trigger config */}
      <section className={pCardPad}>
        <h2 className={`${pSectionTitle} inline-flex items-center gap-2`}>
          <span className="material-icons text-base text-primary">{trigger.icon}</span>
          Disparador
        </h2>
        <div className="mt-3 text-sm">
          {playbook.triggerKind === 'manual' && (
            <p className="text-muted-foreground">
              Manual: un usuario inicia las ejecuciones explícitamente desde esta página o el MCP.
            </p>
          )}
          {playbook.triggerKind === 'event' && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Evento:</span>
              <code className="px-2 py-0.5 rounded-md bg-muted/60 text-foreground font-mono text-xs">
                {playbook.triggerConfig?.event ?? '— sin definir —'}
              </code>
              <span className="text-[11px] text-muted-foreground italic">
                (la activación por eventos está reservada para la fase G; por ahora las ejecuciones se siguen iniciando manualmente)
              </span>
            </div>
          )}
          {playbook.triggerKind === 'scheduled' && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-muted-foreground">Cron:</span>
              <code className="px-2 py-0.5 rounded-md bg-muted/60 text-foreground font-mono text-xs">
                {playbook.triggerConfig?.cron ?? '— sin definir —'}
              </code>
              <span className="text-[11px] text-muted-foreground italic">
                (la activación programada está reservada para la fase G; por ahora las ejecuciones se siguen iniciando manualmente)
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Default topics */}
      {playbook.defaultTopicIds && playbook.defaultTopicIds.length > 0 && (
        <section className={pCardPad}>
          <h2 className={`${pSectionTitle} inline-flex items-center gap-2`}>
            <span className="material-icons text-base text-primary">sell</span>
            Temas predeterminados
          </h2>
          <div className="mt-3 flex items-center gap-1.5 flex-wrap">
            {playbook.defaultTopicIds.map((tid) => (
              <span
                key={tid}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted/60 text-foreground"
              >
                <span className="material-icons text-[14px]">sell</span>
                Tema #{tid}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Steps */}
      <section className={pCardPad}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className={`${pSectionTitle} inline-flex items-center gap-2`}>
            <span className="material-icons text-base text-primary">account_tree</span>
            Pasos
            <span className="text-xs text-muted-foreground font-normal">
              ({steps.length})
            </span>
          </h2>
          <Link
            href={`/portal/brain/playbooks/${playbookId}/edit`}
            className={pBtnGhost}
          >
            <span className="material-icons text-sm">edit</span>
            Editar pasos
          </Link>
        </div>

        <div className="mt-4">
          <PlaybookStepGraph steps={steps} />
        </div>

        {isDraft && steps.length > 0 && (
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <span>¿Listo para publicarse?</span>
            <button
              type="button"
              onClick={onActivate}
              disabled={busy}
              className={`${pBtnGhost} disabled:opacity-50`}
            >
              <span className="material-icons text-sm">verified</span>
              Validar y activar
            </button>
          </div>
        )}
      </section>

      {/* Active runs link */}
      <section className={pCardPad}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className={`${pSectionTitle} inline-flex items-center gap-2`}>
              <span className="material-icons text-base text-primary">playlist_play</span>
              Ejecuciones activas
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {activeRunCount === 0
                ? 'No hay ejecuciones activas de este playbook.'
                : `${activeRunCount} ${activeRunCount === 1 ? 'ejecución' : 'ejecuciones'} en curso.`}
            </p>
          </div>
          <Link
            href={`/portal/brain/playbook-runs?playbookId=${playbookId}`}
            className={pBtnGhost}
          >
            Ver todas las ejecuciones
            <span className="material-icons text-sm">chevron_right</span>
          </Link>
        </div>
      </section>

      {/* Start-run modal */}
      {startOpen && (
        <StartRunDialog
          playbookId={playbookId}
          onClose={() => setStartOpen(false)}
          onStarted={(runId) => router.push(`/portal/brain/playbook-runs/${runId}`)}
        />
      )}
    </div>
  );
}

// ─── start-run dialog ───────────────────────────────────────────────────────

function StartRunDialog({
  playbookId,
  onClose,
  onStarted,
}: {
  playbookId: number;
  onClose: () => void;
  onStarted: (runId: number) => void;
}) {
  const [label, setLabel] = useState('');
  const [context, setContext] = useState<Record<string, unknown>>({});
  const [links, setLinks] = useState<
    Array<{ key: string; entityType: BrainPlaybookLinkEntityType; entityId: string }>
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const addLink = () =>
    setLinks((p) => [
      ...p,
      {
        key: Math.random().toString(36).slice(2),
        entityType: 'initiative',
        entityId: '',
      },
    ]);
  const removeLink = (key: string) => setLinks((p) => p.filter((l) => l.key !== key));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) {
      setErr('La etiqueta es obligatoria');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const cleanLinks = links
        .map((l) => ({ entityType: l.entityType, entityId: parseInt(l.entityId, 10) }))
        .filter((l) => Number.isFinite(l.entityId) && l.entityId > 0);

      const r = await fetch(`/api/portal/brain/playbooks/${playbookId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label.trim(),
          context,
          links: cleanLinks.length > 0 ? cleanLinks : undefined,
        }),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setErr(json.message || 'No se pudo iniciar la ejecución');
        return;
      }
      onStarted(json.data.runId);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Error de red');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className={`w-full max-w-2xl ${pCard} shadow-xl overflow-hidden flex flex-col max-h-[90vh]`}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-base font-semibold text-foreground inline-flex items-center gap-2">
            <span className="material-icons text-base text-primary">play_circle</span>
            Iniciar ejecución
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Cerrar"
            className="p-1 text-muted-foreground hover:text-foreground rounded disabled:opacity-50"
          >
            <span className="material-icons text-base">close</span>
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-4 overflow-y-auto space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Etiqueta<span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              autoFocus
              maxLength={255}
              placeholder="p. ej. Nueva incorporación: Jane Doe"
              className={pInput}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Identificador legible para esta ejecución.
            </p>
          </div>

          <div>
            <span className="block text-xs font-medium text-muted-foreground mb-1.5">
              Variables de contexto
            </span>
            <p className="text-[11px] text-muted-foreground mb-2">
              Estas inicializan el contexto de la ejecución; las configuraciones de los pasos pueden referenciarlas con{' '}
              <code className="px-1 py-0.5 rounded bg-muted/60 font-mono">{`{{varName}}`}</code>.
            </p>
            <PlaybookContextEditor
              value={context}
              onChange={setContext}
              disabled={submitting}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-muted-foreground">Vínculos</span>
              <button
                type="button"
                onClick={addLink}
                disabled={submitting}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50"
              >
                <span className="material-icons text-sm">add</span>
                Añadir vínculo
              </button>
            </div>
            {links.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">
                Opcional. Vincula esta ejecución a una iniciativa, persona, empresa, negocio,
                reunión o decisión existente.
              </p>
            ) : (
              <div className="space-y-2">
                {links.map((l) => (
                  <div key={l.key} className="grid grid-cols-12 gap-2 items-center">
                    <select
                      value={l.entityType}
                      onChange={(e) =>
                        setLinks((prev) =>
                          prev.map((p) =>
                            p.key === l.key
                              ? {
                                  ...p,
                                  entityType: e.target.value as BrainPlaybookLinkEntityType,
                                }
                              : p,
                          ),
                        )
                      }
                      disabled={submitting}
                      className={`col-span-5 ${pSelect}`}
                    >
                      {PLAYBOOK_LINK_ENTITY_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {playbookLinkEntityMeta(t).label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={l.entityId}
                      onChange={(e) =>
                        setLinks((prev) =>
                          prev.map((p) =>
                            p.key === l.key ? { ...p, entityId: e.target.value } : p,
                          ),
                        )
                      }
                      placeholder="id de entidad"
                      disabled={submitting}
                      className={`col-span-6 ${pInput}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeLink(l.key)}
                      disabled={submitting}
                      aria-label="Quitar este vínculo"
                      className="col-span-1 p-1 text-muted-foreground hover:text-destructive rounded justify-self-end disabled:opacity-50"
                    >
                      <span className="material-icons text-sm">close</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {err && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-md p-2 text-xs text-destructive">
              {err}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className={`${pBtnGhost} disabled:opacity-50`}
            >Cancelar</button>
            <button
              type="submit"
              disabled={submitting}
              className={`${pBtnPrimary} disabled:opacity-50`}
            >
              {submitting ? (
                <>
                  <span className="material-icons animate-spin text-base">autorenew</span>
                  Iniciando…
                </>
              ) : (
                <>
                  <span className="material-icons text-base">play_circle</span>
                  Iniciar ejecución
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
