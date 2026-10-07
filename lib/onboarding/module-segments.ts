// Client-safe module segment definitions — no db imports.
// Maps domain keys to rich "get started" action lists shown in the
// post-onboarding module-setup step and the dashboard checklist.

export interface ModuleSegmentAction {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: string;
  /** Optional docs deep link rendered alongside the action. */
  docsHref?: string;
  /** Server-side detection key (see lib/onboarding/detections.ts). Steps
   *  without one are pointer rows — shown, but excluded from progress math. */
  detect?: string;
  /** Always-true step credited on first render. Every domain's FIRST action
   *  must set this so no consumer can ever compute 0% (goal gradient — spec
   *  "Per-Domain Onboarding", UX psychology req 1). */
  preCredited?: boolean;
}

export interface ModuleSegment {
  domainKey: string;
  title: string;
  blurb: string;
  actions: ModuleSegmentAction[];
}

/** Steps that participate in progress math (detected or pre-credited). */
export function countableActions(segment: ModuleSegment): ModuleSegmentAction[] {
  return segment.actions.filter((a) => a.preCredited || a.detect);
}

function enabledStep(domainLabel: string, href: string): ModuleSegmentAction {
  return {
    key: 'enabled',
    label: `${domainLabel} activado`,
    description: 'Este módulo está activo en tu cuenta.',
    href,
    icon: 'check_circle',
    preCredited: true,
  };
}

export const RICH_SEGMENTS: Record<string, ModuleSegment> = {
  websites: {
    domainKey: 'websites',
    title: 'Ponle nombre a tu primera web',
    blurb: 'Crea y publica tu primera web en minutos.',
    actions: [
      enabledStep('Webs', '/portal/websites'),
      {
        key: 'create-site',
        label: 'Ponle nombre a tu primera web',
        description: 'Elige un nombre y dominio para tu nueva web.',
        href: '/portal/websites',
        icon: 'add_circle',
        detect: 'websites.hasSite',
      },
      {
        key: 'visual-editor',
        label: 'Publica tu primera página',
        description: 'Diseña páginas con bloques y publícalas.',
        href: '/portal/websites',
        icon: 'design_services',
        detect: 'websites.hasPublishedPage',
      },
      {
        key: 'setup-nav',
        label: 'Configura tu navegación',
        description: 'Define menús y enlaces para tu web.',
        href: '/portal/websites',
        icon: 'menu',
        detect: 'websites.hasNavigation',
      },
    ],
  },

  crm: {
    domainKey: 'crm',
    title: 'Configura tu CRM',
    blurb: 'Sigue cada contacto, negocio y conversación en un solo lugar.',
    actions: [
      enabledStep('CRM', '/portal/crm'),
      {
        key: 'add-contacts',
        label: 'Importa o añade tus primeros contactos',
        description: 'Trae tus contactos existentes o añádelos uno a uno.',
        href: '/portal/crm/contacts',
        icon: 'person_add',
        detect: 'crm.hasContact',
      },
      {
        key: 'create-pipeline',
        label: 'Crea tu embudo de ventas',
        description: 'Define etapas que encajen con tu proceso de ventas.',
        href: '/portal/crm/settings',
        icon: 'account_tree',
        detect: 'crm.hasPipeline',
      },
      {
        key: 'log-deal',
        label: 'Registra tu primer negocio',
        description: 'Empieza a seguir una oportunidad activa.',
        href: '/portal/crm/deals',
        icon: 'handshake',
        detect: 'crm.hasDeal',
      },
    ],
  },

  email: {
    domainKey: 'email',
    title: 'Lanza tu email marketing',
    blurb: 'Envía campañas cuidadas que convierten.',
    actions: [
      enabledStep('Email', '/portal/email'),
      {
        key: 'verify-sender',
        label: 'Verifica tu dirección de envío',
        description: 'Autentica tu dominio para una entrega fiable.',
        href: '/portal/email/settings',
        icon: 'verified',
        // detect wired in DOB-006 once the sender-verification column is pinned down.
      },
      {
        key: 'create-list',
        label: 'Crea tu primera lista',
        description: 'Segmenta tu audiencia desde el principio.',
        href: '/portal/email/lists',
        icon: 'group_add',
        detect: 'email.hasList',
      },
      {
        key: 'first-campaign',
        label: 'Redacta tu primera campaña',
        description: 'Empieza desde una plantilla probada, no desde una página en blanco.',
        href: '/portal/email/templates',
        icon: 'article',
        detect: 'email.hasCampaign',
      },
    ],
  },

  brain: {
    domainKey: 'brain',
    title: 'Potencia tu Cerebro de empresa',
    blurb: 'Haz que el conocimiento de tu empresa sea buscable y esté listo para la IA.',
    actions: [
      enabledStep('Cerebro de empresa', '/portal/brain'),
      {
        key: 'add-knowledge',
        label: 'Añade tu primer conocimiento',
        description: 'Sube documentos, pega enlaces o escribe notas.',
        href: '/portal/brain/knowledge',
        icon: 'upload_file',
        detect: 'brain.hasKnowledge',
      },
      {
        key: 'meet-assistant',
        label: 'Conoce a tu asistente de IA',
        description: 'Pregunta lo que quieras sobre los datos de tu empresa.',
        href: '/portal/brain/ask',
        icon: 'smart_toy',
        detect: 'brain.hasConversation',
      },
      {
        key: 'map-team',
        label: 'Mapea tu equipo',
        description: 'Añade personas y sus áreas de especialidad.',
        href: '/portal/brain/people',
        icon: 'groups',
        detect: 'brain.hasPerson',
      },
    ],
  },

  surveys: {
    domainKey: 'surveys',
    title: 'Crea tu primera encuesta',
    blurb: 'Recoge respuestas, cualifica leads y enruta resultados automáticamente.',
    actions: [
      enabledStep('Encuestas', '/portal/surveys'),
      {
        key: 'create-survey',
        label: 'Crea tu primera encuesta',
        description: 'Crea un formulario, sondeo o cuestionario de cualificación.',
        href: '/portal/surveys',
        icon: 'ballot',
        detect: 'surveys.hasSurvey',
      },
      {
        key: 'collect-response',
        label: 'Consigue tu primera respuesta',
        description: 'Comparte el enlace de la encuesta y mira llegar los resultados.',
        href: '/portal/surveys',
        icon: 'how_to_vote',
        detect: 'surveys.hasResponse',
      },
    ],
  },

  bookings: {
    domainKey: 'bookings',
    title: 'Empieza a recibir reservas',
    blurb: 'Deja que tus clientes reserven tiempo contigo directamente.',
    actions: [
      enabledStep('Reservas', '/portal/tools/booking'),
      {
        key: 'create-page',
        label: 'Crea una página de reservas',
        description: 'Configura un servicio, su duración y tu disponibilidad.',
        href: '/portal/tools/booking/new',
        icon: 'event_available',
        detect: 'bookings.hasPage',
      },
      {
        key: 'first-booking',
        label: 'Recibe tu primera reserva',
        description: 'Comparte tu enlace /book y consigue una reserva.',
        href: '/portal/tools/booking',
        icon: 'event',
        detect: 'bookings.hasBooking',
      },
    ],
  },

  store: {
    domainKey: 'store',
    title: 'Abre tu tienda',
    blurb: 'Vende productos con pago, pedidos e inventario.',
    actions: [
      enabledStep('Tienda', '/portal/websites'),
      {
        key: 'add-product',
        label: 'Añade tu primer producto',
        description: 'Crea un producto con precio e imágenes.',
        href: '/portal/websites',
        icon: 'inventory_2',
        detect: 'store.hasProduct',
      },
      {
        key: 'first-order',
        label: 'Recibe tu primer pedido',
        description: 'Tu tienda está lista cuando los pedidos pueden fluir.',
        href: '/portal/websites',
        icon: 'shopping_cart',
        detect: 'store.hasOrder',
      },
    ],
  },

  esign: {
    domainKey: 'esign',
    title: 'Envía tu primer contrato',
    blurb: 'Redacta, envía y firma acuerdos sin salir del portal.',
    actions: [
      enabledStep('Firma electrónica', '/portal/crm/contracts'),
      {
        key: 'create-contract',
        label: 'Crea tu primer contrato',
        description: 'Redacta un acuerdo desde cero o con plantilla.',
        href: '/portal/crm/contracts',
        icon: 'history_edu',
        detect: 'esign.hasContract',
      },
      {
        key: 'send-contract',
        label: 'Envíalo a firmar',
        description: 'Entrega un enlace de firma a la otra parte.',
        href: '/portal/crm/contracts',
        icon: 'send',
        detect: 'esign.hasSentContract',
      },
      {
        key: 'first-signed',
        label: 'Consigue la firma completa',
        description: 'Reúne todas las firmas para cerrarlo.',
        href: '/portal/crm/contracts',
        icon: 'task_alt',
        detect: 'esign.hasSignedContract',
      },
    ],
  },

  'pitch-decks': {
    domainKey: 'pitch-decks',
    title: 'Crea tu primera presentación',
    blurb: 'Diseña, comparte y sigue presentaciones con tu marca.',
    actions: [
      enabledStep('Presentaciones', '/portal/websites'),
      {
        key: 'create-deck',
        label: 'Crea tu primera presentación',
        description: 'Empieza con una plantilla o en blanco.',
        href: '/portal/websites',
        icon: 'slideshow',
        detect: 'decks.hasDeck',
      },
      {
        key: 'publish-deck',
        label: 'Publícala y compártela',
        description: 'Genera un enlace para compartir y ponla delante de alguien.',
        href: '/portal/websites',
        icon: 'ios_share',
        detect: 'decks.hasPublishedDeck',
      },
    ],
  },

  automations: {
    domainKey: 'automations',
    title: 'Automatiza tu primer flujo',
    blurb: 'Dispara acciones automáticamente desde eventos del portal.',
    actions: [
      enabledStep('Automatizaciones', '/portal/automations'),
      {
        key: 'create-automation',
        label: 'Crea tu primera automatización',
        description: 'Elige un disparador y las acciones que lanza.',
        href: '/portal/automations',
        icon: 'bolt',
        detect: 'automations.hasRule',
      },
      {
        key: 'enable-automation',
        label: 'Actívala',
        description: 'Activa la regla para que se ejecute con eventos reales.',
        href: '/portal/automations',
        icon: 'toggle_on',
        detect: 'automations.hasEnabledRule',
      },
    ],
  },

  publishing: {
    domainKey: 'publishing',
    title: 'Publica en tus canales',
    blurb: 'Redacta y programa contenido social desde el portal.',
    actions: [
      enabledStep('Publicación', '/portal/publishing'),
      {
        key: 'connect-channel',
        label: 'Conecta un canal',
        description: 'Vincula tu cuenta de LinkedIn para publicar.',
        href: '/portal/publishing',
        icon: 'link',
        detect: 'publishing.hasConnection',
      },
      {
        key: 'first-post',
        label: 'Redacta tu primer post',
        description: 'Escríbelo una vez y prográmalo cuando esté listo.',
        href: '/portal/publishing',
        icon: 'post_add',
        detect: 'publishing.hasPost',
      },
    ],
  },

  projects: {
    domainKey: 'projects',
    title: 'Arranca un proyecto',
    blurb: 'Mantén el trabajo organizado y a tu equipo sincronizado.',
    actions: [
      enabledStep('Proyectos', '/portal/projects'),
      {
        key: 'create-project',
        label: 'Crea tu primer proyecto',
        description: 'Monta un tablero Kanban para cualquier flujo de trabajo.',
        href: '/portal/projects',
        icon: 'add_task',
        detect: 'projects.hasProject',
      },
      {
        key: 'check-tasks',
        label: 'Revisa Mis tareas',
        description: 'Ve todas tus tareas abiertas de todos los proyectos.',
        href: '/portal/my-tasks',
        icon: 'task_alt',
      },
    ],
  },
};

/**
 * Onboarding wizard tiers (OBQA-028 re-triage, card 563): complicated modules
 * no longer get their own per-module walk screen. `walk` = the original
 * action-checklist experience; `acknowledge` = a single "it's active" row with
 * no create-pressure (surveys); `summary` = grouped onto ONE final "Also
 * activated" screen instead of a dedicated segment (store/esign/pitch-decks/
 * automations/publishing — also sidesteps the LinkedIn-OAuth-mid-wizard
 * awkwardness for publishing). Kept db-free like the rest of this file.
 *
 * OBQA-005 re-triage: email joins the summary tier — an explain-only
 * "activated" row, mirroring the OBQA-028 model above, since sender
 * verification (its natural first action) isn't ready for inline setup (the
 * email settings page is broken — out of scope here). brain stays `walk`;
 * see OBQA-004 / BrainNoteSetupForm for its inline "create first note" action.
 */
export type WizardTier = 'walk' | 'acknowledge' | 'summary';

export const WIZARD_TIERS: Record<string, WizardTier> = {
  websites: 'walk',
  crm: 'walk',
  brain: 'walk',
  projects: 'walk',
  bookings: 'walk',
  surveys: 'acknowledge',
  email: 'summary',
  store: 'summary',
  esign: 'summary',
  'pitch-decks': 'summary',
  automations: 'summary',
  publishing: 'summary',
};

export function wizardTierFor(key: string): WizardTier {
  return WIZARD_TIERS[key] ?? 'walk';
}

/**
 * Returns the rich segment for a domain key if one exists; otherwise builds a
 * generic fallback from the catalog entry.
 */
export function getSegmentForDomain(
  key: string,
  catalog?: { name: string; tagline: string; navHrefs: string[] },
): ModuleSegment {
  const rich = RICH_SEGMENTS[key];
  if (rich) return rich;

  return {
    domainKey: key,
    title: `Primeros pasos con ${catalog?.name ?? key}`,
    blurb: catalog?.tagline ?? '',
    actions: [
      enabledStep(catalog?.name ?? key, catalog?.navHrefs?.[0] ?? '/portal/dashboard'),
      {
        key: 'explore',
        label: `Explora ${catalog?.name ?? key}`,
        description: 'Empieza a usar este módulo.',
        href: catalog?.navHrefs?.[0] ?? '/portal/dashboard',
        icon: 'open_in_new',
      },
    ],
  };
}
