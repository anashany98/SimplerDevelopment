/**
 * Dashboard widget registry.
 * Defines all 22 available widgets with their metadata and visibility rules.
 */

export type DashboardWidgetId =
  | 'metric-active-projects'
  | 'metric-open-tickets'
  | 'metric-unpaid-invoices'
  | 'metric-amount-due'
  | 'websites-glance'
  | 'editorial-pipeline'
  | 'store-overview'
  | 'email-performance'
  | 'crm-snapshot'
  | 'crm-activity'
  | 'proposals-esign'
  | 'upcoming-bookings'
  | 'survey-responses'
  | 'ab-experiments'
  | 'projects-overview'
  | 'my-tasks'
  | 'support-tickets'
  | 'invoices'
  | 'brain-review-queue'
  | 'brain-tasks'
  | 'live-chat'
  | 'automations'
  | 'pitch-decks'
  | 'agency-status'
  | 'hosting-status'
  | 'ai-connect';

export interface DashboardWidgetDef {
  id: DashboardWidgetId;
  title: string;
  icon: string;
  solution: string;
  description: string;
  href: string;
  serviceCategory?: string;
  defaultEnabled: boolean;
}

/**
 * Human-readable display names for each solution slug.
 * Mirrors the badge strings from lib/data/solutions.ts without importing that file.
 */
export const SOLUTION_LABELS: Record<string, string> = {
  'ai-connect': 'Conexión IA',
  'websites': 'Constructor de webs',
  'ecommerce': 'Tienda online',
  'publishing': 'Calendario de contenidos',
  'email-marketing': 'Email marketing',
  'crm': 'CRM',
  'contracts': 'Contratos y firma electrónica',
  'invoicing': 'Facturación',
  'booking': 'Reservas',
  'surveys': 'Encuestas y formularios',
  'experiments': 'Pruebas A/B',
  'project-management': 'Proyectos',
  'help-desk': 'Mesa de ayuda',
  'company-brain': 'Cerebro de empresa',
  'ai-chatbot': 'Chat en vivo',
  'automations': 'Automatizaciones',
  'pitch-decks': 'Pitch decks',
  'agency': 'Marca blanca',
  'hosting': 'Alojamiento',
};

export const DASHBOARD_WIDGETS: DashboardWidgetDef[] = [
  {
    id: 'metric-active-projects',
    title: 'Proyectos activos',
    icon: 'view_kanban',
    solution: 'project-management',
    description: 'Número de proyectos que no están archivados.',
    href: '/portal/projects',
    defaultEnabled: true,
  },
  {
    id: 'metric-open-tickets',
    title: 'Tickets abiertos',
    icon: 'support_agent',
    solution: 'help-desk',
    description: 'Número de tickets de soporte que no están cerrados.',
    href: '/portal/tickets',
    defaultEnabled: true,
  },
  {
    id: 'metric-unpaid-invoices',
    title: 'Facturas pendientes',
    icon: 'receipt_long',
    solution: 'invoicing',
    description: 'Número de facturas en estado "enviada" pendientes de pago.',
    href: '/portal/invoices',
    defaultEnabled: true,
  },
  {
    id: 'metric-amount-due',
    title: 'Importe pendiente',
    icon: 'attach_money',
    solution: 'invoicing',
    description: 'Valor total de todas las facturas enviadas sin cobrar.',
    href: '/portal/invoices',
    defaultEnabled: true,
  },
  {
    id: 'websites-glance',
    title: 'Webs de un vistazo',
    icon: 'language',
    solution: 'websites',
    description: 'Resumen de tus sitios activos, número de páginas y actividad reciente de publicación.',
    href: '/portal/websites',
    serviceCategory: 'cms',
    defaultEnabled: false,
  },
  {
    id: 'editorial-pipeline',
    title: 'Pipeline editorial',
    icon: 'rocket_launch',
    solution: 'publishing',
    description: 'Sigue borradores, publicaciones programadas y contenido pendiente de revisión.',
    href: '/portal/publishing',
    serviceCategory: 'cms',
    defaultEnabled: false,
  },
  {
    id: 'store-overview',
    title: 'Resumen de la tienda',
    icon: 'storefront',
    solution: 'ecommerce',
    description: 'Resumen rápido de pedidos recientes, ingresos y productos destacados.',
    href: '/portal/websites',
    serviceCategory: 'cms',
    defaultEnabled: false,
  },
  {
    id: 'email-performance',
    title: 'Rendimiento del email',
    icon: 'email',
    solution: 'email-marketing',
    description: 'Estadísticas recientes de campañas, incluyendo tasas de apertura y crecimiento de suscriptores.',
    href: '/portal/email',
    serviceCategory: 'email',
    defaultEnabled: false,
  },
  {
    id: 'crm-snapshot',
    title: 'Resumen del CRM',
    icon: 'groups',
    solution: 'crm',
    description: 'Resumen general de contactos, negocios abiertos y valor del pipeline.',
    href: '/portal/crm',
    defaultEnabled: true,
  },
  {
    id: 'crm-activity',
    title: 'Actividad reciente del CRM',
    icon: 'history',
    solution: 'crm',
    description: 'Últimas notas, llamadas y actualizaciones de negocios en tu CRM.',
    href: '/portal/crm',
    defaultEnabled: false,
  },
  {
    id: 'proposals-esign',
    title: 'Propuestas y firma electrónica',
    icon: 'draw',
    solution: 'contracts',
    description: 'Propuestas pendientes, contratos a la espera de firma y cierres recientes.',
    href: '/portal/crm/proposals',
    defaultEnabled: false,
  },
  {
    id: 'upcoming-bookings',
    title: 'Próximas reservas',
    icon: 'calendar_month',
    solution: 'booking',
    description: 'Citas confirmadas y rendimiento de tu página de reservas.',
    href: '/portal/tools/booking',
    serviceCategory: 'booking',
    defaultEnabled: false,
  },
  {
    id: 'survey-responses',
    title: 'Respuestas de encuestas',
    icon: 'ballot',
    solution: 'surveys',
    description: 'Envios recientes de encuestas y tendencias de tasa de respuesta.',
    href: '/portal/surveys',
    defaultEnabled: false,
  },
  {
    id: 'ab-experiments',
    title: 'Experimentos A/B',
    icon: 'science',
    solution: 'experiments',
    description: 'Experimentos en curso, mejoras de conversión y recomendaciones de ganador.',
    href: '/portal/experiments',
    defaultEnabled: false,
  },
  {
    id: 'projects-overview',
    title: 'Resumen de proyectos',
    icon: 'view_kanban',
    solution: 'project-management',
    description: 'Proyectos activos, estado del sprint y número de tarjetas bloqueadas.',
    href: '/portal/projects',
    serviceCategory: 'project-mgmt',
    defaultEnabled: true,
  },
  {
    id: 'my-tasks',
    title: 'Mis tareas',
    icon: 'checklist',
    solution: 'project-management',
    description: 'Tarjetas y tareas asignadas a ti en todos los proyectos.',
    href: '/portal/my-tasks',
    serviceCategory: 'project-mgmt',
    defaultEnabled: false,
  },
  {
    id: 'support-tickets',
    title: 'Tickets de soporte',
    icon: 'support_agent',
    solution: 'help-desk',
    description: 'Tickets abiertos, actualizaciones recientes y estado del SLA de un vistazo.',
    href: '/portal/tickets',
    defaultEnabled: true,
  },
  {
    id: 'invoices',
    title: 'Facturas',
    icon: 'receipt_long',
    solution: 'invoicing',
    description: 'Facturas pendientes, pagos recientes e importe pendiente.',
    href: '/portal/invoices',
    defaultEnabled: true,
  },
  {
    id: 'brain-review-queue',
    title: 'Cola de revisión del cerebro',
    icon: 'psychology',
    solution: 'company-brain',
    description: 'Elementos marcados por la IA para tu revisión y aprobación.',
    href: '/portal/brain/review',
    defaultEnabled: true,
  },
  {
    id: 'brain-tasks',
    title: 'Tareas del cerebro',
    icon: 'task_alt',
    solution: 'company-brain',
    description: 'Tareas y seguimientos generados por la IA pendientes de tu acción.',
    href: '/portal/brain/tasks',
    defaultEnabled: true,
  },
  {
    id: 'live-chat',
    title: 'Chat en vivo',
    icon: 'smart_toy',
    solution: 'ai-chatbot',
    description: 'Conversaciones recientes y métricas de interacción del chatbot de IA.',
    href: '/portal/inbox',
    serviceCategory: 'ai',
    defaultEnabled: false,
  },
  {
    id: 'automations',
    title: 'Automatizaciones',
    icon: 'account_tree',
    solution: 'automations',
    description: 'Flujos de automatización activos y actividad reciente de disparadores.',
    href: '/portal/brain/automations',
    defaultEnabled: false,
  },
  {
    id: 'pitch-decks',
    title: 'Pitch decks recientes',
    icon: 'slideshow',
    solution: 'pitch-decks',
    description: 'Decks generados por IA, última vista y estado de compartido.',
    href: '/portal/tools/pitch-decks',
    serviceCategory: 'pitch-decks',
    defaultEnabled: false,
  },
  {
    id: 'agency-status',
    title: 'Agencia y marca blanca',
    icon: 'storefront',
    solution: 'agency',
    description: 'Uso de asientos de marca blanca, estado de subcuentas y salud del revendedor.',
    href: '/portal/agency',
    defaultEnabled: false,
  },
  {
    id: 'hosting-status',
    title: 'Estado del alojamiento',
    icon: 'cloud',
    solution: 'hosting',
    description: 'Disponibilidad, estado SSL, uso de ancho de banda y registro de despliegues reciente.',
    href: '/portal/hosting',
    serviceCategory: 'hosting',
    defaultEnabled: false,
  },
  {
    id: 'ai-connect',
    title: 'Conexión IA',
    icon: 'cable',
    solution: 'ai-connect',
    description: 'Integraciones de IA conectadas, uso de herramientas MCP y consumo de tokens.',
    href: '/portal/brain/connect',
    defaultEnabled: false,
  },
];

export interface DashboardWidgetPrefs {
  order?: string[];
  hidden?: string[];
  collapsed?: string[];
}

const BRAIN_WIDGET_IDS = new Set<DashboardWidgetId>(['brain-review-queue', 'brain-tasks']);

/**
 * Resolves which widgets are visible and available given the user's prefs,
 * active service categories, and brain enablement.
 *
 * - available: all 22 widgets, except brain widgets are excluded when !brainEnabled
 * - visible: available minus hidden, ordered by prefs.order (unknowns appended in registry order)
 *   When no pref recorded for a widget, default = defaultEnabled || serviceCategory matches
 */
export function resolveVisibleWidgets(
  prefs: DashboardWidgetPrefs,
  activeServiceCategories: Set<string>,
  brainEnabled: boolean,
): { visible: DashboardWidgetDef[]; available: DashboardWidgetDef[] } {
  const available = DASHBOARD_WIDGETS.filter(
    (w) => !(BRAIN_WIDGET_IDS.has(w.id) && !brainEnabled),
  );

  const hiddenSet = new Set(prefs.hidden ?? []);
  const orderList = prefs.order ?? [];

  // Build ordered list: first by prefs.order (filtered to available+not-hidden),
  // then append remaining available widgets not in order (in registry order).
  const availableMap = new Map(available.map((w) => [w.id, w]));
  const ordered: DashboardWidgetDef[] = [];
  const seen = new Set<string>();

  for (const id of orderList) {
    const w = availableMap.get(id as DashboardWidgetId);
    if (w && !hiddenSet.has(id)) {
      ordered.push(w);
      seen.add(id);
    }
  }

  for (const w of available) {
    if (!seen.has(w.id) && !hiddenSet.has(w.id)) {
      // No pref recorded: use defaultEnabled || serviceCategory gate
      const isDefaultVisible =
        w.defaultEnabled ||
        (!!w.serviceCategory && activeServiceCategories.has(w.serviceCategory));
      if (isDefaultVisible) {
        ordered.push(w);
      }
    }
  }

  return { visible: ordered, available };
}
