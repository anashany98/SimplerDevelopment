/**
 * Notification delivery settings for a survey: how often (digest cadence) and to
 * whom (recipients).
 *
 * Split out of SurveySettings.tsx rather than added to it — that file is on the
 * god-file budget list (scripts/check-file-budget.ts), and these two controls are
 * a cohesive pair that nothing else in the settings form touches.
 */
'use client';

interface NotifyDeliveryFieldsProps {
  editDigest: string;
  setEditDigest: (v: string) => void;
  // Optional with safe defaults: an omitted list must degrade to "nothing
  // selectable", never crash the whole settings form. That is also the correct
  // semantics — no selection already means "notify the account owner" — so the
  // fallback is real behaviour, not just a guard to keep tests happy.
  editNotifyUserIds?: number[];
  setEditNotifyUserIds?: (v: number[]) => void;
  teamMembers?: { userId: number; name: string | null; email: string | null }[];
}

export default function NotifyDeliveryFields({
  editDigest,
  setEditDigest,
  editNotifyUserIds = [],
  setEditNotifyUserIds,
  teamMembers = [],
}: NotifyDeliveryFieldsProps) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Resumen por correo</label>
        <select
          value={editDigest}
          onChange={(e) => setEditDigest(e.target.value)}
          className="w-full sm:w-48 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="off">Desactivado</option>
          <option value="daily">Resumen diario</option>
          <option value="weekly">Resumen semanal</option>
        </select>
        <p className="text-xs text-muted-foreground mt-1">
          Recibe un correo resumen con estadísticas y destacados de las respuestas
        </p>
      </div>

      {/* PUX-084: who receives the notification. Only people already on this
          account are selectable — responses can carry PII, so recipients are
          portal users rather than a free-text address list. Leaving every box
          unchecked keeps the previous behaviour (the account owner is notified). */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Notificar a estas personas</label>
        {teamMembers.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Cargando miembros del equipo…
          </p>
        ) : (
          <div className="space-y-1.5">
            {teamMembers.map((m) => (
              <label key={m.userId} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editNotifyUserIds.includes(m.userId)}
                  onChange={(e) =>
                    setEditNotifyUserIds?.(
                      e.target.checked
                        ? [...editNotifyUserIds, m.userId]
                        : editNotifyUserIds.filter((v) => v !== m.userId),
                    )
                  }
                  className="rounded border-border"
                />
                <span className="text-sm text-foreground">
                  {m.name || m.email}
                  {m.name && m.email ? (
                    <span className="text-xs text-muted-foreground"> &middot; {m.email}</span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          Aplica tanto al correo inmediato como al resumen. Si no seleccionas ninguno,
          se notifica al propietario de la cuenta.
        </p>
      </div>
    </>
  );
}
