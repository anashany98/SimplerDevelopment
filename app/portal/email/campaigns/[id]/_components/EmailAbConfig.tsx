'use client';

/**
 * Subject A/B test configuration block for the email campaign editor.
 *
 * Renders inside the campaign detail page's "edit content" tab. Self-
 * contained — owns its own collapse state and PATCH calls. Parent passes
 * the campaign + a refresh callback.
 *
 * Two modes:
 *   - draft: full edit UI (toggle, subject B, metric, test size slider).
 *   - ab_testing / sent: read-only status + variant counts + manual
 *     "Promote winner now" button (only visible to draft? no — once we're
 *     in ab_testing). The 4-hour wait window is enforced by the endpoint.
 */

import { useEffect, useState } from 'react';

type Metric = 'open' | 'click';

interface VariantCounts {
  variant: 'a' | 'b' | 'winner';
  sent: number;
  opened: number;
  clicked: number;
}

interface AbStatus {
  ready: boolean;
  decided: boolean;
  decidedAt: string | null;
  winnerSubject: string | null;
  counts: VariantCounts[];
  projectedWinner: 'a' | 'b';
  projectedReason: string;
  metric: Metric;
}

interface CampaignAbView {
  id: number;
  status: string;
  subject: string;
  abEnabled?: boolean;
  abSubjectB?: string | null;
  abWinnerMetric?: Metric | null;
  abTestSizePct?: number | null;
  abWinnerSubject?: string | null;
  abDecidedAt?: string | null;
}

interface Props {
  campaign: CampaignAbView;
  onChange: (patch: Partial<CampaignAbView>) => void;
}

export function EmailAbConfig({ campaign, onChange }: Props) {
  const [open, setOpen] = useState(!!campaign.abEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Local edit state. We commit on blur / change to keep the UI snappy
  // without saving on every keystroke.
  const [subjectB, setSubjectB] = useState(campaign.abSubjectB ?? '');
  const [metric, setMetric] = useState<Metric>(campaign.abWinnerMetric ?? 'open');
  const [pct, setPct] = useState<number>(campaign.abTestSizePct ?? 10);

  useEffect(() => {
    setSubjectB(campaign.abSubjectB ?? '');
    setMetric(campaign.abWinnerMetric ?? 'open');
    setPct(campaign.abTestSizePct ?? 10);
  }, [campaign.abSubjectB, campaign.abWinnerMetric, campaign.abTestSizePct]);

  const isDraft = campaign.status === 'draft';
  const isTesting = campaign.status === 'ab_testing';
  const isSent = campaign.status === 'sent';
  const enabled = !!campaign.abEnabled;

  async function patchAb(patch: Partial<CampaignAbView>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/email/campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message ?? 'Error al guardar');
      } else {
        onChange(patch);
      }
    } catch {
      setError('Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled() {
    const next = !enabled;
    if (next) setOpen(true);
    await patchAb({ abEnabled: next });
  }

  // ── Status panel (after send) ────────────────────────────────────────
  const [status, setStatus] = useState<AbStatus | null>(null);
  const [promoting, setPromoting] = useState(false);

  useEffect(() => {
    if (!enabled || isDraft) return;
    fetch(`/api/portal/email/campaigns/${campaign.id}/promote-winner`)
      .then(r => r.json())
      .then(d => { if (d.success) setStatus(d.data); })
      .catch(() => {});
  }, [campaign.id, enabled, isDraft, isTesting, campaign.abDecidedAt]);

  async function promoteWinner(force: boolean) {
    if (!confirm(force
      ? '¿Promover al ganador ahora a la fuerza? Los destinatarios retenidos se enviarán de inmediato.'
      : '¿Promover al ganador y enviar los destinatarios retenidos?')) return;
    setPromoting(true);
    try {
      const url = `/api/portal/email/campaigns/${campaign.id}/promote-winner${force ? '?force=1' : ''}`;
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        setError(data.message ?? 'Error al promover');
      } else {
        onChange({
          status: 'sent',
          abWinnerSubject: data.data.winnerSubject,
          abDecidedAt: new Date().toISOString(),
        });
      }
    } finally {
      setPromoting(false);
    }
  }

  return (
    <div className="border border-border rounded-md bg-card">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-accent transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="material-icons text-base text-muted-foreground">science</span>
          <span className="text-sm font-medium text-foreground">Prueba A/B de asuntos</span>
          {enabled && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
              {isTesting ? 'En prueba' : campaign.abDecidedAt ? 'Promocionado' : 'Activado'}
            </span>
          )}
        </div>
        <span className="material-icons text-base text-muted-foreground">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* Toggle (draft only) */}
          {isDraft && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                disabled={saving}
                onChange={toggleEnabled}
                className="h-4 w-4"
              />
              <span className="text-foreground">Activa la prueba A/B para esta campaña</span>
              <span className="text-xs text-muted-foreground">
                ({pct}% para la prueba, {100 - pct}% recibe al ganador)
              </span>
            </label>
          )}

          {!isDraft && enabled && (
            <p className="text-sm text-muted-foreground">
              Prueba A/B {campaign.abDecidedAt ? 'promocionada' : 'en curso'}.
              Asunto A: <span className="text-foreground">{campaign.subject}</span> /
              Asunto B: <span className="text-foreground">{campaign.abSubjectB}</span>
            </p>
          )}

          {/* Edit fields (draft + enabled) */}
          {isDraft && enabled && (
            <>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Asunto B</label>
                <input
                  type="text"
                  value={subjectB}
                  onChange={e => setSubjectB(e.target.value)}
                  onBlur={() => {
                    if (subjectB !== (campaign.abSubjectB ?? '')) {
                      patchAb({ abSubjectB: subjectB });
                    }
                  }}
                  placeholder="Linea de asunto alternativa para probar"
                  className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  El asunto A es el asunto existente de arriba ({campaign.subject || '—'}).
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Métrica del ganador</label>
                <div className="flex gap-2">
                  {(['open', 'click'] as const).map(m => (
                    <button
                      type="button"
                      key={m}
                      onClick={() => {
                        setMetric(m);
                        patchAb({ abWinnerMetric: m });
                      }}
                      className={`px-3 py-1.5 text-sm border rounded-md transition-colors ${
                        metric === m
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-border text-foreground hover:bg-accent'
                      }`}
                    >
                      {m === 'open' ? 'Tasa de apertura' : 'Tasa de clics'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Tamaño de la prueba: {pct}% de la lista
                </label>
                <input
                  type="range"
                  min={5}
                  max={50}
                  step={5}
                  value={pct}
                  onChange={e => setPct(parseInt(e.target.value, 10))}
                  onMouseUp={() => {
                    if (pct !== (campaign.abTestSizePct ?? 10)) {
                      patchAb({ abTestSizePct: pct });
                    }
                  }}
                  onTouchEnd={() => {
                    if (pct !== (campaign.abTestSizePct ?? 10)) {
                      patchAb({ abTestSizePct: pct });
                    }
                  }}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {Math.floor(pct / 2)}% recibe el asunto A, {Math.floor(pct / 2)}% recibe el asunto B,
                  el {100 - pct}% restante recibe al ganador tras una espera de 4 horas.
                </p>
              </div>
            </>
          )}

          {/* Status panel (after send) */}
          {!isDraft && enabled && status && (
            <div className="bg-muted/40 rounded-md p-3 space-y-2">
              <div className="text-sm font-medium text-foreground">Estado de la prueba</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1">Variante</th>
                    <th className="py-1">Enviado</th>
                    <th className="py-1">Aperturas</th>
                    <th className="py-1">Clics</th>
                  </tr>
                </thead>
                <tbody className="text-foreground">
                  {(['a', 'b', 'winner'] as const).map(v => {
                    const c = status.counts.find(x => x.variant === v);
                    if (!c && v !== 'winner') return null;
                    return (
                      <tr key={v}>
                        <td className="py-0.5 capitalize">{v === 'winner' ? 'Envío del ganador' : v}</td>
                        <td className="py-0.5">{c?.sent ?? 0}</td>
                        <td className="py-0.5">{c?.opened ?? 0}</td>
                        <td className="py-0.5">{c?.clicked ?? 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {status.decided ? (
                <p className="text-xs text-muted-foreground">
                  Ganador: <strong className="text-foreground">{status.winnerSubject}</strong>
                  {status.decidedAt && <> &middot; promocionado {new Date(status.decidedAt).toLocaleString()}</>}
                </p>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    Ganador previsto: <strong className="text-foreground">{status.projectedWinner.toUpperCase()}</strong>
                    {' '}— {status.projectedReason}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => promoteWinner(false)}
                      disabled={!status.ready || promoting || isSent}
                      className="px-3 py-1.5 text-sm bg-foreground text-background rounded-md disabled:opacity-50"
                      title={status.ready ? 'Promover al ganador y enviar el resto' : 'La ventana de decisión aún no se ha alcanzado (4 h)'}
                    >
                      {promoting ? 'Promoviendo…' : 'Promover ganador'}
                    </button>
                    {!status.ready && (
                      <button
                        type="button"
                        onClick={() => promoteWinner(true)}
                        disabled={promoting || isSent}
                        className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-accent disabled:opacity-50"
                        title="Omitir la ventana de espera de 4 horas"
                      >
                        Forzar promoción ahora
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {!enabled && isDraft && (
            <p className="text-xs text-muted-foreground">
              Cuando se activa, el primer {pct}% de tu lista se reparte a partes iguales entre dos asuntos.
              Tras 4 horas, se selecciona automáticamente al ganador según la métrica elegida y se envía al resto.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
