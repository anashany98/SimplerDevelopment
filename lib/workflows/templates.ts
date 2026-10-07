// Plantillas de flujo de trabajo para el constructor visual. El flujo
// "Nuevo desde plantilla" de la lista clona una de estas en una fila
// `workflows` nueva en estado 'draft', acotada al cliente activo.

import type { WorkflowGraph, WorkflowTriggerConfig } from './types';

export interface WorkflowTemplate {
  id: string;
  icon: string; // Material Icons name
  name: string;
  description: string;
  trigger: WorkflowTriggerConfig;
  graph: WorkflowGraph;
}

// Helper — mantiene legibles las plantillas literales de abajo.
function pos(x: number, y: number) {
  return { x, y };
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  // 1. Nutrición de nuevos prospectos
  {
    id: 'new-lead-nurture',
    icon: 'person_add',
    name: 'Nutrición de nuevos prospectos',
    description: 'Cuando se crea un contacto, espera una hora y envía el email de bienvenida.',
    trigger: { kind: 'contact.created' },
    graph: {
      nodes: [
        { id: 'trigger', type: 'trigger', position: pos(50, 50), data: { kind: 'contact.created' } },
        { id: 'wait-1h', type: 'action', position: pos(50, 200), data: { kind: 'wait', ms: 60 * 60 * 1000 } },
        { id: 'welcome-email', type: 'action', position: pos(50, 350), data: { kind: 'send_email', templateId: 0, to: 'contact' } },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'wait-1h' },
        { id: 'e2', source: 'wait-1h', target: 'welcome-email' },
      ],
    },
  },

  // 2. Recordatorio de negocios estancados — lunes 9h, rama según condición.
  {
    id: 'stale-deal-nudge',
    icon: 'schedule',
    name: 'Recordatorio de negocios estancados',
    description: 'Cada lunes a las 9h, crea una tarea de seguimiento para cualquier negocio que lleve más de 7 días en la misma etapa.',
    trigger: { kind: 'schedule', cron: '0 9 * * 1' },
    graph: {
      nodes: [
        { id: 'trigger', type: 'trigger', position: pos(50, 50), data: { kind: 'schedule', cron: '0 9 * * 1' } },
        {
          id: 'check-stale',
          type: 'condition',
          position: pos(50, 200),
          data: { kind: 'condition', expression: 'deal.daysInStage > 7' },
        },
        {
          id: 'create-followup',
          type: 'action',
          position: pos(50, 350),
          data: { kind: 'create_task', title: 'Seguimiento de negocio estancado' },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'check-stale' },
        { id: 'e2', source: 'check-stale', target: 'create-followup', label: 'true' },
      ],
    },
  },

  // 3. Tarea automática por envío de formulario.
  {
    id: 'form-submission-auto-task',
    icon: 'assignment',
    name: 'Tarea automática por formulario',
    description: 'Cuando se envía un formulario, crea una tarea para que el responsable haga el seguimiento.',
    trigger: { kind: 'form.submitted' },
    graph: {
      nodes: [
        { id: 'trigger', type: 'trigger', position: pos(50, 50), data: { kind: 'form.submitted' } },
        {
          id: 'task-followup',
          type: 'action',
          position: pos(50, 200),
          data: { kind: 'create_task', title: 'Seguimiento del formulario' },
        },
      ],
      edges: [{ id: 'e1', source: 'trigger', target: 'task-followup' }],
    },
  },

  // 4. Webhook a Slack.
  {
    id: 'webhook-to-slack',
    icon: 'webhook',
    name: 'Webhook a Slack',
    description: 'Recibe un webhook entrante y reenvía el payload a una URL de webhook entrante de Slack.',
    trigger: { kind: 'webhook.received', secret: 'change-me' },
    graph: {
      nodes: [
        { id: 'trigger', type: 'trigger', position: pos(50, 50), data: { kind: 'webhook.received', secret: 'change-me' } },
        {
          id: 'forward-slack',
          type: 'action',
          position: pos(50, 200),
          data: {
            kind: 'webhook',
            url: 'https://hooks.slack.com/services/REPLACE/ME',
            payload: { text: 'Flujo disparado: {{trigger.kind}}' },
          },
        },
      ],
      edges: [{ id: 'e1', source: 'trigger', target: 'forward-slack' }],
    },
  },

  // 5. Celebración de avance de etapa — fan-out desde un disparador a dos acciones paralelas.
  {
    id: 'stage-advance-celebration',
    icon: 'celebration',
    name: 'Celebración de avance de etapa',
    description: 'Cuando un negocio pasa a "ganado", crea una tarea de agradecimiento y notifica a un webhook de celebración.',
    trigger: { kind: 'deal.stage_changed' },
    graph: {
      nodes: [
        { id: 'trigger', type: 'trigger', position: pos(50, 50), data: { kind: 'deal.stage_changed' } },
        {
          id: 'thank-you-task',
          type: 'action',
          position: pos(-100, 200),
          data: { kind: 'create_task', title: 'Enviar agradecimiento al cliente' },
        },
        {
          id: 'celebrate-hook',
          type: 'action',
          position: pos(200, 200),
          data: {
            kind: 'webhook',
            url: 'https://hooks.example.com/celebrate',
            payload: { event: 'deal.won' },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'thank-you-task' },
        { id: 'e2', source: 'trigger', target: 'celebrate-hook' },
      ],
    },
  },

  // 6. Formulario → alta en lista de correo (usa la acción add_to_list).
  {
    id: 'form-submission-to-list',
    icon: 'playlist_add',
    name: 'Formulario → alta en lista',
    description: 'Cuando se envía un formulario, añade el contacto a tu lista de correo para campañas.',
    trigger: { kind: 'form.submitted' },
    graph: {
      nodes: [
        { id: 'trigger', type: 'trigger', position: pos(50, 50), data: { kind: 'form.submitted' } },
        {
          id: 'add-to-list',
          type: 'action',
          position: pos(50, 200),
          data: { kind: 'add_to_list', listId: 0 },
        },
      ],
      edges: [{ id: 'e1', source: 'trigger', target: 'add-to-list' }],
    },
  },

  // 7. Ganado vs perdido — condición con ambas ramas (true/false).
  {
    id: 'deal-outcome-branches',
    icon: 'call_split',
    name: 'Negocio ganado vs perdido',
    description: 'Cuando un negocio cambia de estado, crea una tarea distinta según el resultado: ganado o perdido.',
    trigger: { kind: 'deal.stage_changed' },
    graph: {
      nodes: [
        { id: 'trigger', type: 'trigger', position: pos(50, 50), data: { kind: 'deal.stage_changed' } },
        {
          id: 'check-outcome',
          type: 'condition',
          position: pos(50, 200),
          data: { kind: 'condition', expression: 'status eq won' },
        },
        {
          id: 'won-task',
          type: 'action',
          position: pos(-100, 350),
          data: { kind: 'create_task', title: 'Activar entrega del negocio ganado' },
        },
        {
          id: 'lost-task',
          type: 'action',
          position: pos(200, 350),
          data: { kind: 'create_task', title: 'Registrar motivos del negocio perdido' },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'check-outcome' },
        { id: 'e2', source: 'check-outcome', target: 'won-task', label: 'true' },
        { id: 'e3', source: 'check-outcome', target: 'lost-task', label: 'false' },
      ],
    },
  },
];

export function findTemplate(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id);
}
