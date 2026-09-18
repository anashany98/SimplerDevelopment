'use client';

import { useState } from 'react';
import ProductAutomationSettings from '@/components/portal/ProductAutomationSettings';
import type { AutomationPreset } from '@/components/portal/ProductAutomationSettings';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pCard, pInput } from '@/components/portal/portal-ui';

const EMAIL_AUTOMATION_PRESETS: AutomationPreset[] = [
  {
    key: 'welcome_email',
    name: 'Email de bienvenida',
    description: 'Envía un mensaje de bienvenida cuando un nuevo suscriptor se une a una lista',
    icon: 'waving_hand',
    trigger: { event: 'email.subscriber.added' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Nuevo suscriptor: {{event.email}}', body: 'Un nuevo suscriptor ({{event.email}}) se ha unido a tu lista de correo.' } }],
  },
  {
    key: 'unsubscribe_notification',
    name: 'Notificación de baja',
    description: 'Recibe un aviso cuando alguien se da de baja de tu lista',
    icon: 'notifications',
    trigger: { event: 'email.subscriber.unsubscribed' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Suscriptor dado de baja: {{event.email}}', body: '{{event.email}} se ha dado de baja de tu lista de correo.' } }],
  },
  {
    key: 'campaign_sent_report',
    name: 'Informe de campaña enviada',
    description: 'Crea una tarea de seguimiento cuando se envía una campaña para medir resultados',
    icon: 'assessment',
    trigger: { event: 'email.campaign.sent' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Revisar resultados: {{event.name}}', body: 'La campaña "{{event.name}}" se ha enviado. Revisa las métricas de interacción en 24-48 horas.' }, delay: 86400 }],
    settings: [
      {
        key: 'reportDelay',
        label: 'Revisar resultados después de',
        type: 'select',
        options: [
          { value: '86400', label: '1 día' },
          { value: '172800', label: '2 días' },
          { value: '604800', label: '1 semana' },
        ],
        defaultValue: '86400',
        mapsTo: { actionIndex: 0, paramKey: 'delay' },
      },
    ],
  },
  {
    key: 'subscriber_to_crm',
    name: 'Añadir suscriptores al CRM',
    description: 'Crea automáticamente un contacto del CRM cuando alguien se suscribe a tu lista',
    icon: 'person_add',
    trigger: { event: 'email.subscriber.added' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Nuevo suscriptor para el CRM: {{event.email}}', body: 'Considera añadir a {{event.email}} como contacto del CRM para nutrirlo.' } }],
  },
  {
    key: 're_engagement',
    name: 'Recordatorio de reactivación',
    description: 'Recibe un recordatorio para enviar una campaña de reactivación a suscriptores inactivos',
    icon: 'refresh',
    trigger: { event: 'email.campaign.sent' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Oportunidad de reactivación', body: 'Revisa a quienes no abrieron tu campaña reciente "{{event.name}}" y considera un seguimiento específico.' }, delay: 604800 }],
    settings: [
      {
        key: 'reEngageDelay',
        label: 'Recordar después de',
        type: 'select',
        options: [
          { value: '259200', label: '3 días' },
          { value: '604800', label: '1 semana' },
          { value: '1209600', label: '2 semanas' },
        ],
        defaultValue: '604800',
        mapsTo: { actionIndex: 0, paramKey: 'delay' },
      },
    ],
  },
];

// Known gap: the Sender Defaults fields below are local-only state — there is
// no load-existing-values effect, no Save button, and no API call, so nothing
// entered here persists. This is why inline sender-verification wasn't added
// to the onboarding module-setup step for email (see the WIZARD_TIERS doc
// comment in lib/onboarding/module-segments.ts) — there's no working save
// path to wire an inline form to yet.
export default function EmailSettingsPage() {
  const [defaultFromName, setDefaultFromName] = useState('');
  const [defaultFromEmail, setDefaultFromEmail] = useState('');
  const [defaultReplyTo, setDefaultReplyTo] = useState('');

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <PortalPageHeader
        eyebrow="Correo"
        title="Ajustes"
        subtitle="Configura valores predeterminados y automatizaciones para tu email marketing"
      />

      {/* Sender Defaults */}
      <div className={`${pCard} p-6 space-y-4`}>
        <h2 className="font-semibold flex items-center gap-2">
          <span className="material-icons text-lg text-primary">alternate_email</span>Remitente predeterminado</h2>
        <p className="text-sm text-muted-foreground">Define los datos del remitente por defecto para nuevas campañas</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nombre del remitente</label>
            <input value={defaultFromName} onChange={e => setDefaultFromName(e.target.value)} placeholder="El nombre de tu empresa" className={`mt-1 ${pInput}`} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Email del remitente</label>
            <input value={defaultFromEmail} onChange={e => setDefaultFromEmail(e.target.value)} placeholder="hello@yourdomain.com" className={`mt-1 ${pInput}`} />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Email de respuesta (Reply-To)</label>
          <input value={defaultReplyTo} onChange={e => setDefaultReplyTo(e.target.value)} placeholder="replies@yourdomain.com" className={`mt-1 ${pInput}`} />
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <span className="material-icons text-xs">info</span>El correo del remitente debe usar un dominio de envío verificado</p>
      </div>

      {/* Automations */}
      <div className={`${pCard} p-6`}>
        <ProductAutomationSettings
          productScope="email"
          presets={EMAIL_AUTOMATION_PRESETS}
          title="Automatizaciones de email"
          description="Automatiza la interacción con los suscriptores y el seguimiento de campañas"
        />
      </div>
    </div>
  );
}
