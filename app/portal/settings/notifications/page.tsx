'use client';

import { useEffect, useState } from 'react';
import { pCard } from '@/components/portal/portal-ui';

type Delivery = 'instant' | 'digest_daily' | 'off';

interface PrefRow {
  notificationType: string;
  delivery: Delivery;
}

// Human-friendly copy for each notification type. Keep in sync with the
// NOTIFICATION_TYPES tuple in lib/db/schema/crm.ts.
const TYPE_META: Record<string, { label: string; hint: string; icon: string }> = {
  mention: {
    label: '@-menciones',
    hint: 'Cuando un compañero te menciona en un comentario de un negocio.',
    icon: 'alternate_email',
  },
  deal_stage_changed: {
    label: 'Etapa del negocio cambiada',
    hint: 'Un negocio de tu pipeline ha pasado a una nueva etapa.',
    icon: 'swap_horiz',
  },
  deal_assigned: {
    label: 'Negocio asignado',
    hint: 'Te han asignado un negocio.',
    icon: 'assignment_ind',
  },
  deal_stale: {
    label: 'Recordatorio de negocio estancado',
    hint: 'Un negocio abierto no ha tenido actividad durante un tiempo.',
    icon: 'hourglass_top',
  },
  contact_created: {
    label: 'Nuevo contacto',
    hint: 'Se ha añadido un nuevo contacto al CRM.',
    icon: 'person_add',
  },
  proposal_viewed: {
    label: 'Propuesta vista',
    hint: 'Un cliente abrió una propuesta que le enviaste.',
    icon: 'visibility',
  },
  document_comment_mention: {
    label: 'Mención en comentario de documento',
    hint: 'Te mencionaron en un hilo de comentarios de un documento.',
    icon: 'comment',
  },
  task_assigned: {
    label: 'Tarea asignada',
    hint: 'Te han asignado una tarea.',
    icon: 'task_alt',
  },
  task_due_soon: {
    label: 'Tarea próxima a vencer',
    hint: 'Se acerca la fecha límite de una tarea tuya.',
    icon: 'schedule',
  },
  ticket_assigned: {
    label: 'Ticket asignado',
    hint: 'Te han asignado un ticket de soporte.',
    icon: 'support_agent',
  },
  ticket_status_changed: {
    label: 'Estado del ticket cambiado',
    hint: 'Ha cambiado el estado de un ticket que sigues.',
    icon: 'sync',
  },
  automation_failing: {
    label: 'Automatización con errores',
    hint: 'Una regla de automatización ha fallado varias veces.',
    icon: 'error',
  },
  survey_zero_responses: {
    label: 'Encuesta sin respuestas',
    hint: 'Una encuesta activa todavía no ha recibido respuestas.',
    icon: 'poll',
  },
  booking_hold_stuck: {
    label: 'Reserva bloqueada',
    hint: 'Una reserva provisional lleva demasiado tiempo sin finalizarse.',
    icon: 'event_busy',
  },
};

const DELIVERY_OPTIONS: Array<{ value: Delivery; label: string; icon: string }> = [
  { value: 'instant', label: 'Inmediata', icon: 'bolt' },
  { value: 'digest_daily', label: 'Resumen diario', icon: 'mail' },
  { value: 'off', label: 'Desactivada', icon: 'notifications_off' },
];

export default function NotificationPreferencesPage() {
  const [prefs, setPrefs] = useState<PrefRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/portal/notifications/preferences')
      .then((r) => r.json())
      .then((res) => {
        if (res?.success && Array.isArray(res.data?.items)) {
          setPrefs(res.data.items as PrefRow[]);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const updateDelivery = async (notificationType: string, delivery: Delivery) => {
    setSavingType(notificationType);
    setMessage(null);
    // Optimistic update
    setPrefs((prev) =>
      prev.map((p) => (p.notificationType === notificationType ? { ...p, delivery } : p)),
    );
    try {
      const res = await fetch('/api/portal/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationType, delivery }),
      });
      const data = await res.json();
      if (!data.success) {
        setMessage({ type: 'error', text: data.message || 'No se pudo guardar.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error de red. Inténtalo de nuevo.' });
    } finally {
      setSavingType(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className={`${pCard} p-6 space-y-4`}>
        <div>
          <h2 className="text-base font-display font-extrabold tracking-[-0.01em] text-foreground">Preferencias de notificaciones</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Elige cómo recibir cada tipo de notificación. <strong>Inmediata</strong> la ves
            en tu panel al instante. <strong>Resumen diario</strong> la agrupa en un
            correo diario. <strong>Desactivada</strong> la silencia por completo.
          </p>
        </div>

        <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
          {prefs.map((pref) => {
            const meta = TYPE_META[pref.notificationType] ?? {
              label: pref.notificationType,
              hint: '',
              icon: 'notifications',
            };
            const isSaving = savingType === pref.notificationType;
            return (
              <div
                key={pref.notificationType}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between bg-background"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <span className="material-icons text-muted-foreground text-base mt-0.5 shrink-0">
                    {meta.icon}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{meta.label}</div>
                    {meta.hint && (
                      <div className="text-xs text-muted-foreground mt-0.5">{meta.hint}</div>
                    )}
                  </div>
                </div>
                <div
                  role="radiogroup"
                  aria-label={`Entrega para ${meta.label}`}
                  className="flex gap-1 shrink-0 self-start sm:self-auto"
                >
                  {DELIVERY_OPTIONS.map((opt) => {
                    const isActive = pref.delivery === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        disabled={isSaving}
                        onClick={() => updateDelivery(pref.notificationType, opt.value)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors disabled:opacity-50 ${
                          isActive
                            ? 'bg-foreground text-background border-primary'
                            : 'bg-background text-foreground border-border hover:border-primary/50 hover:bg-accent'
                        }`}
                      >
                        <span className="material-icons text-sm">{opt.icon}</span>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {message && (
        <div
          className={`flex items-center gap-3 p-4 rounded-xl border text-sm ${
            message.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300'
              : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300'
          }`}
        >
          <span className="material-icons text-base">
            {message.type === 'success' ? 'check_circle' : 'error'}
          </span>
          {message.text}
        </div>
      )}
    </div>
  );
}
