// Per-product automation presets shown in the Brain Automations "Presets"
// tab. Each preset is a one-toggle rule the user can enable, optionally with
// a few configurable fields (delay, etc). Saving a preset writes a regular
// row in `automation_rules` with `source = 'settings'` and a `productScope`
// matching the product the preset belongs to — so the runtime engine treats
// presets identically to NLP- or template-built rules.

import type { AutomationPreset } from '@/components/portal/ProductAutomationSettings';

export const EMAIL_AUTOMATION_PRESETS: AutomationPreset[] = [
  {
    key: 'welcome_email',
    name: 'Email de bienvenida (ticket para el equipo)',
    description:
      'Abre un ticket de soporte para tu equipo para enviar una bienvenida personalizada cuando un nuevo suscriptor se une a una lista. (Todavía no hay una acción de envío de email transaccional — esto crea un ticket como paso manual.)',
    icon: 'waving_hand',
    trigger: { event: 'email.subscriber.added' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Nuevo suscriptor: {{event.email}}', body: 'Un nuevo suscriptor ({{event.email}}) se ha unido a tu lista de correo. Envíale un mensaje de bienvenida.' } }],
  },
  {
    key: 'unsubscribe_notification',
    name: 'Aviso de baja (ticket para el equipo)',
    description:
      'Abre un ticket de soporte para tu equipo cuando alguien se da de baja de tu lista. (Todavía no hay una acción de envío de aviso directo — esto crea un ticket como paso manual.)',
    icon: 'notifications',
    trigger: { event: 'email.subscriber.unsubscribed' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Suscriptor dado de baja: {{event.email}}', body: '{{event.email}} se ha dado de baja de tu lista de correo.' } }],
  },
  {
    key: 'campaign_sent_report',
    name: 'Seguimiento de campaña enviada (ticket para el equipo)',
    description:
      'Abre un ticket para recordar a tu equipo que revise las métricas de interacción de la campaña tras el periodo de espera. (Todavía no hay una acción de envío de informe programado — esto crea un ticket como paso manual.)',
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
    name: 'Añadir suscriptor al CRM',
    description:
      'Crea automáticamente un contacto del CRM cuando alguien se suscribe a tu lista.',
    icon: 'person_add',
    trigger: { event: 'email.subscriber.added' },
    actions: [{
      tool: 'create_crm_contact',
      params: {
        email: '{{event.email}}',
        name: '{{event.name}}',
        notes: 'Creado automáticamente desde el alta de un suscriptor de email.',
      },
    }],
  },
  {
    key: 're_engagement',
    name: 'Recordatorio de reactivación (ticket para el equipo)',
    description:
      'Abre un ticket para recordar a tu equipo que envíe una campaña de reactivación a quienes no abrieron tras una campaña. (Todavía no hay una acción de envío automático de reactivación — esto crea un ticket como paso manual.)',
    icon: 'refresh',
    trigger: { event: 'email.campaign.sent' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Oportunidad de reactivación', body: 'Revisa a quienes no abrieron tu campaña reciente "{{event.name}}" y valora un seguimiento específico.' }, delay: 604800 }],
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

export interface ProductPresetGroup {
  productScope: string;
  label: string;
  icon: string;
  description: string;
  presets: AutomationPreset[];
}

export const BOOKING_AUTOMATION_PRESETS: AutomationPreset[] = [
  {
    key: 'booking_to_crm_contact',
    name: 'Nueva reserva → contacto en el CRM',
    description:
      'Crea automáticamente un contacto del CRM cuando un invitado reserva una franja, para que cada nuevo lead llegue a tu pipeline.',
    icon: 'person_add',
    trigger: { event: 'booking.guest_booked' },
    actions: [{
      tool: 'create_crm_contact',
      params: {
        first_name: '{{event.guestName}}',
        email: '{{event.guestEmail}}',
        phone: '{{event.guestPhone}}',
        source: 'web',
        status: 'lead',
        notes: 'Creado automáticamente desde la reserva: {{event.pageTitle}}',
      },
    }],
  },
  {
    key: 'booking_confirmed_to_deal',
    name: 'Reserva confirmada → negocio en el CRM',
    description:
      'Abre un negocio del CRM cuando se confirma una reserva de pago, para que las oportunidades de ingresos pasen directamente a tu pipeline de ventas.',
    icon: 'handshake',
    trigger: { event: 'booking.confirmed' },
    actions: [{
      tool: 'create_crm_deal',
      params: {
        title: 'Reserva: {{event.pageTitle}} — {{event.guestName}}',
        value: '{{event.total}}',
        notes: 'Creado automáticamente desde la reserva confirmada el {{event.startTime}}. Invitado: {{event.guestEmail}}',
        priority: 'medium',
      },
    }],
  },
  {
    key: 'booking_team_ticket',
    name: 'Nueva reserva → ticket para el equipo',
    description:
      'Abre un ticket de soporte para tu equipo cuando llega una nueva reserva para que nada se quede en el tintero.',
    icon: 'confirmation_number',
    trigger: { event: 'booking.guest_booked' },
    actions: [{
      tool: 'create_support_ticket',
      params: {
        subject: 'Nueva reserva: {{event.pageTitle}} — {{event.guestName}}',
        body: '{{event.guestName}} ({{event.guestEmail}}) reservó una franja en {{event.pageTitle}} a partir del {{event.startTime}}.',
      },
    }],
  },
];

export const SURVEY_AUTOMATION_PRESETS: AutomationPreset[] = [
  {
    key: 'survey_response_to_crm_contact',
    name: 'Respuesta de encuesta → contacto en el CRM',
    description:
      'Crea un contacto del CRM cuando un encuestado envía su dirección de email en una encuesta, capturando automáticamente cada lead entrante.',
    icon: 'person_add',
    trigger: { event: 'survey.response_submitted' },
    conditions: [{ field: 'respondentEmail', operator: 'exists' }],
    actions: [{
      tool: 'create_crm_contact',
      params: {
        first_name: '{{event.respondentName}}',
        email: '{{event.respondentEmail}}',
        source: 'web',
        status: 'lead',
        notes: 'Creado automáticamente desde la respuesta de encuesta: {{event.surveyTitle}}',
      },
    }],
  },
  {
    key: 'survey_response_to_deal',
    name: 'Respuesta de encuesta → negocio en el CRM',
    description:
      'Abre un negocio en tu pipeline cuando alguien envía una encuesta que indica intención de compra — ideal para formularios de solicitud de presupuesto o evaluación de necesidades.',
    icon: 'attach_money',
    trigger: { event: 'survey.response_submitted' },
    actions: [{
      tool: 'create_crm_deal',
      params: {
        title: 'Consulta de encuesta: {{event.surveyTitle}} — {{event.respondentName}}',
        notes: 'Creado automáticamente desde la encuesta "{{event.surveyTitle}}" enviada por {{event.respondentEmail}}',
        priority: 'medium',
      },
    }],
  },
  {
    key: 'survey_response_ticket',
    name: 'Respuesta de encuesta → ticket para el equipo',
    description:
      'Abre un ticket de soporte para tu equipo cuando llega una nueva respuesta de encuesta para que alguien haga seguimiento con prontitud.',
    icon: 'assignment',
    trigger: { event: 'survey.response_submitted' },
    actions: [{
      tool: 'create_support_ticket',
      params: {
        subject: 'Nueva respuesta de encuesta: {{event.surveyTitle}}',
        body: '{{event.respondentName}} ({{event.respondentEmail}}) envió una respuesta a "{{event.surveyTitle}}". Revísala en el portal.',
      },
    }],
  },
];

export const PRODUCT_PRESET_GROUPS: ProductPresetGroup[] = [
  {
    productScope: 'email',
    label: 'Email marketing',
    icon: 'email',
    description: 'Automatiza la interacción de suscriptores y el seguimiento de campañas',
    presets: EMAIL_AUTOMATION_PRESETS,
  },
  {
    productScope: 'booking',
    label: 'Reservas',
    icon: 'calendar_month',
    description: 'Captura leads y abre negocios automáticamente cuando los invitados reservan',
    presets: BOOKING_AUTOMATION_PRESETS,
  },
  {
    productScope: 'survey',
    label: 'Encuestas',
    icon: 'poll',
    description: 'Convierte las respuestas de encuestas en contactos y negocios del CRM automáticamente',
    presets: SURVEY_AUTOMATION_PRESETS,
  },
];
