// Shape of the onboarding wizard state. `OnboardingAnswers` mirrors the
// `answers` JSON column on `user_onboarding` (see lib/db/schema/auth.ts) and
// the per-step input the client posts to /api/portal/onboarding.

export type OnboardingStep =
  | 'welcome'
  | 'about-you'
  | 'about-company'
  | 'choose-modules'
  | 'payment'
  | 'module-setup'
  | 'brand-vibe'
  | 'mission'
  | 'features'
  | 'upsell'
  | 'power-up'
  | 'done';

export const ONBOARDING_STEPS: OnboardingStep[] = [
  'welcome',
  'about-you',
  'about-company',
  'choose-modules',
  'payment',
  'module-setup',
  'brand-vibe',
  'mission',
  'features',
  'upsell',
  'power-up',
  'done',
];

export interface OnboardingAnswers {
  role?: string;
  timezone?: string;
  companySize?: string;
  industry?: string;
  websiteUrl?: string;
  brandTones?: string[];
  primaryColor?: string;
  /** Google font family names → mirrored to brand profile heading/body font. */
  primaryFont?: string;
  secondaryFont?: string;
  mission?: string;
  featuresInterested?: string[];
  skillsDownloaded?: boolean;
  mcpKeyCreatedId?: number;
  /** Domain keys the client selected in the choose-modules step (or ['bundle']). */
  selectedModules?: string[];
  /** ISO timestamp stamped when Stripe checkout completes successfully. */
  checkoutCompletedAt?: string;
  /** Per-domain action completion tracking. domainKey → completed action keys. */
  moduleSetup?: Record<string, string[]>;
  /** ISO timestamp when the post-onboarding checklist was dismissed. */
  checklistDismissedAt?: string;
  /** ISO timestamp stamped server-side by the 'reopen' action; never settable via PATCH. Presence = not a fresh signup. */
  reopenedAt?: string;
  /** Domain keys whose in-domain GetStarted card the user dismissed. */
  dismissedDomains?: string[];
}

export interface OnboardingState {
  step: OnboardingStep;
  answers: OnboardingAnswers;
  completedAt: string | null;
  // pre-filled from users/clients so the wizard never asks for what we
  // already know
  prefill: {
    name: string;
    email: string;
    company: string;
    website: string;
  };
  /**
   * True only for self-serve (billingMode='saas') clients that have not yet
   * activated any module. Computed server-side in loadOnboarding(). When false
   * the wizard skips 'choose-modules' and 'payment' entirely.
   */
  showBillingSteps: boolean;
}

export const FEATURE_CATALOG: Array<{ id: string; label: string; icon: string; description: string }> = [
  { id: 'website', label: 'Crea tu web', icon: 'language', description: 'Páginas con editor visual, blog y SEO.' },
  { id: 'email', label: 'Envía campañas de email', icon: 'email', description: 'Newsletters, automatizaciones y segmentos.' },
  { id: 'booking', label: 'Recibe reservas', icon: 'calendar_month', description: 'Sincronización de calendario, recordatorios y widgets.' },
  { id: 'decks', label: 'Presentaciones (decks)', icon: 'slideshow', description: 'Decks redactados por IA con tu marca aplicada.' },
  { id: 'crm', label: 'Gestiona tu CRM', icon: 'contacts', description: 'Contactos, negocios, embudos y actividad.' },
  { id: 'surveys', label: 'Encuestas y formularios', icon: 'list_alt', description: 'Formularios, NPS y captación de leads.' },
  { id: 'brain', label: 'Cerebro de empresa (IA)', icon: 'smart_toy', description: 'Busca en tus documentos y reuniones con IA.' },
  { id: 'projects', label: 'Gestión de proyectos', icon: 'view_kanban', description: 'Kanban, sprints y colaboración en equipo.' },
  { id: 'store', label: 'Tienda online', icon: 'storefront', description: 'Productos, pedidos e inventario.' },
  { id: 'ai-chat', label: 'Chat en vivo para visitantes', icon: 'chat', description: 'Widget de chat con tu marca y bandeja compartida.' },
];

export const BRAND_TONES: Array<{ id: string; label: string; icon: string }> = [
  { id: 'professional', label: 'Profesional', icon: 'badge' },
  { id: 'friendly', label: 'Cercano', icon: 'sentiment_satisfied' },
  { id: 'bold', label: 'Audaz', icon: 'bolt' },
  { id: 'playful', label: 'Divertido', icon: 'celebration' },
  { id: 'calm', label: 'Sereno', icon: 'spa' },
  { id: 'smart', label: 'Inteligente', icon: 'psychology' },
  { id: 'warm', label: 'Cálido', icon: 'wb_sunny' },
  { id: 'confident', label: 'Seguro', icon: 'star' },
];

export const COMPANY_SIZES: Array<{ id: string; label: string }> = [
  { id: 'solo', label: 'Solo yo' },
  { id: 'small', label: '2–10' },
  { id: 'mid', label: '11–50' },
  { id: 'large', label: '51–250' },
  { id: 'xl', label: '250+' },
];

export const ROLE_PRESETS: Array<{ id: string; label: string; icon: string }> = [
  { id: 'owner', label: 'Propietario / Fundador', icon: 'workspace_premium' },
  { id: 'marketing', label: 'Marketing', icon: 'campaign' },
  { id: 'sales', label: 'Ventas', icon: 'trending_up' },
  { id: 'ops', label: 'Operaciones', icon: 'settings_suggest' },
  { id: 'engineering', label: 'Ingeniería / IT', icon: 'code' },
  { id: 'consultant', label: 'Consultor / Agencia', icon: 'support_agent' },
  { id: 'other', label: 'Otro', icon: 'more_horiz' },
];

export const COLOR_PRESETS: string[] = [
  '#2563eb', // blue
  '#7c3aed', // violet
  '#db2777', // pink
  '#dc2626', // red
  '#ea580c', // orange
  '#ca8a04', // amber
  '#16a34a', // green
  '#0891b2', // cyan
  '#475569', // slate
  '#111827', // graphite
];
