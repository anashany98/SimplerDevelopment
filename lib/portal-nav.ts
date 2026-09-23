// Portal navigation tree — single source of truth for both the sidebar
// and the Cmd+K palette. Keeping this structured (children + alsoActiveOn)
// lets the sidebar render its tree and lets the palette flatten it into a
// searchable list of jumpable targets.

import type { UserAppNavMeta } from '@/lib/plugins/load-user-apps';

export interface PortalNavChild {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
  alsoActiveOn?: string;
  // Extra strings to match against in the command palette (e.g. synonyms,
  // sub-feature names) without polluting the visible label.
  keywords?: string[];
  children?: PortalNavChild[];
  /** Billing domain key that gates this item (matches FEATURE_DOMAINS[n].key). */
  requiredDomain?: string;
  /** Set by buildPortalNavItems when the client is not entitled to this domain. */
  locked?: boolean;
  /** Render a section divider above this item (separates product nav from the
   *  account cluster at the bottom of the sidebar). */
  dividerBefore?: boolean;
  /** Renders as a non-clickable section label inside an accordion (used to
   *  sub-group long child lists like Brain's). Not navigable, skipped by the
   *  Cmd+K palette. */
  groupHeader?: boolean;
}

export interface PortalNavItem extends PortalNavChild {
  children?: PortalNavChild[];
}

/**
 * Build the full portal nav tree. Per-site branches are only included when
 * the user is already inside `/portal/websites/[siteId]/...` — palette callers
 * should pass `null` for activeSiteId when they don't have site context yet.
 *
 * The tree is consolidated into a small set of top-level groups (Brain,
 * Projects, CRM, Marketing, Websites) followed by an account cluster
 * (Support, Billing, Agency, Settings) below a divider, so the sidebar stays
 * scannable. Brain's long child list is sub-grouped with non-clickable
 * `groupHeader` labels (Trabajo / Conocimiento / Equipo / IA y automatización).
 * Email + Publishing + Branding live inside "Marketing"; Pitch decks and
 * Proposals live inside "CRM" (sales surfaces); Media + A/B + the active-site
 * tree live inside "Websites".
 *
 * The optional `apps` param injects an "Apps" group (one parent + one child
 * per installed plugin + grandchildren for each plugin's manifest nav items)
 * directly before the trailing "Settings" entry. Server callers that know
 * the active client's entitled apps pass them in; client callers that don't
 * have that context omit the param and get the unmodified base tree.
 *
 * The optional `entitlements` param gates top-level items by billing domain.
 * When provided and `gatingBypassed` is false, any item whose `requiredDomain`
 * is not in `domains` gets `locked: true` (children inherit the lock). When
 * omitted or bypassed, all items are rendered as today.
 */
export function buildPortalNavItems(activeSiteId: string | null, activeSiteName: string | null, apps?: UserAppNavMeta[], entitlements?: { domains: Set<string>; gatingBypassed: boolean }): PortalNavItem[] {
  const items: PortalNavItem[] = [
    {
      href: '/portal/dashboard',
      label: 'Panel',
      icon: 'dashboard',
      keywords: ['home', 'overview'],
    },
    {
      href: '/portal/chat',
      label: 'Chat',
      icon: 'chat',
      exact: true,
      keywords: ['ai assistant', 'copilot', 'ceo agent', 'conversations'],
    },
    {
      href: '/portal/brain',
      label: 'Cerebro de empresa',
      icon: 'psychology',
      exact: true,
      requiredDomain: 'brain',
      keywords: ['ai', 'knowledge', 'brain'],
      children: [
        // Calendar is intentionally hidden from sidebar + cmd-k. The page at
        // /portal/brain/calendar still renders for direct URL navigation.
        // Relationships is intentionally hidden from sidebar + cmd-k. The page
        // at /portal/brain/relationships still renders for direct URL access.
        { href: '', label: 'Trabajo', icon: '', groupHeader: true },
        {
          href: '/portal/brain/tasks',
          label: 'Tareas',
          icon: 'checklist',
          alsoActiveOn: '/portal/brain/review',
          keywords: ['kanban', 'review queue', 'todo', 'communications'],
        },
        {
          href: '/portal/brain/initiatives',
          label: 'Iniciativas',
          icon: 'flag',
          keywords: ['programs', 'projects', 'okr', 'objectives', 'cross-functional', 'multi-quarter'],
        },
        {
          href: '/portal/brain/goals',
          label: 'Objetivos',
          icon: 'track_changes',
          keywords: ['okr', 'objectives', 'kpi', 'metrics', 'progress'],
        },
        {
          href: '/portal/brain/playbooks',
          label: 'Playbooks',
          icon: 'play_circle',
          keywords: ['runbooks', 'processes', 'workflows', 'onboarding', 'renewal', 'incident response', 'sop'],
        },
        {
          href: '/portal/brain/playbook-runs',
          label: 'Ejecuciones',
          icon: 'playlist_play',
          keywords: ['runs', 'instances', 'in-flight', 'monitor'],
        },
        { href: '', label: 'Conocimiento', icon: '', groupHeader: true },
        {
          href: '/portal/brain/knowledge',
          label: 'Conocimiento',
          icon: 'menu_book',
          keywords: ['notes', 'wiki', 'docs'],
        },
        {
          href: '/portal/brain/decisions',
          label: 'Decisiones',
          icon: 'gavel',
          keywords: ['decision log', 'rationale', 'supersede', 'adr'],
        },
        {
          href: '/portal/brain/topics',
          label: 'Temas',
          icon: 'account_tree',
          keywords: ['taxonomy', 'tags', 'categories', 'tree'],
        },
        {
          href: '/portal/brain/glossary',
          label: 'Glosario',
          icon: 'menu_book',
          keywords: ['terms', 'definitions', 'acronyms', 'vocabulary'],
        },
        {
          href: '/portal/brain/documents',
          label: 'Documentos',
          icon: 'description',
          keywords: ['sop', 'policy', 'guide', 'required reading', 'acknowledgments', 'versioned'],
        },
        {
          href: '/portal/brain/documents/queue',
          label: 'Mi cola de lectura',
          icon: 'assignment_late',
          keywords: ['required reads', 'acknowledgments', 'overdue', 'due soon', 'unread documents'],
        },
        {
          href: '/portal/brain/templates',
          label: 'Plantillas',
          icon: 'auto_stories',
          keywords: ['note templates', 'forms', 'structured notes'],
        },
        { href: '', label: 'Equipo', icon: '', groupHeader: true },
        {
          href: '/portal/brain/people',
          label: 'Personas',
          icon: 'groups',
          keywords: ['team', 'employees', 'staff', 'expertise', 'who knows'],
        },
        {
          href: '/portal/brain/org-chart',
          label: 'Organigrama',
          icon: 'account_tree',
          keywords: ['org units', 'departments', 'hierarchy', 'reporting structure'],
        },
        { href: '', label: 'IA y automatización', icon: '', groupHeader: true },
        {
          href: '/portal/brain/automations',
          label: 'Automatizaciones',
          icon: 'bolt',
          keywords: ['rules', 'triggers', 'actions', 'schedule', 'scheduled', 'plugin scripts', 'workflows'],
        },
        {
          href: '/portal/agents',
          label: 'Agentes de IA',
          icon: 'hub',
          keywords: ['assistant', 'copilot', 'specialists', 'crm agent', 'inbox agent', 'automation agent'],
        },
        {
          href: '/portal/brain/ask',
          label: 'Conectar IA',
          icon: 'cable',
          keywords: ['mcp', 'ask brain', 'chat'],
        },
        {
          href: '/portal/brain/settings',
          label: 'Ajustes',
          icon: 'settings',
          keywords: ['brain settings'],
        },
      ],
    },
    {
      href: '/portal/projects',
      label: 'Proyectos',
      icon: 'view_kanban',
      exact: true,
      requiredDomain: 'projects',
      alsoActiveOn: '/portal/my-tasks',
      children: [
        {
          href: '/portal/projects',
          label: 'Todos los proyectos',
          icon: 'view_kanban',
          exact: true,
        },
        { href: '/portal/my-tasks', label: 'Mis tareas', icon: 'task_alt' },
      ],
    },
    {
      href: '/portal/crm',
      label: 'CRM',
      icon: 'contacts',
      exact: true,
      requiredDomain: 'crm',
      keywords: ['customer relationship management', 'pipeline'],
      children: [
        {
          href: '/portal/crm',
          label: 'Panel',
          icon: 'dashboard',
          exact: true,
          keywords: ['crm home'],
        },
        {
          href: '/portal/crm/contacts',
          label: 'Contactos',
          icon: 'people',
          keywords: ['leads', 'people'],
        },
        {
          href: '/portal/crm/companies',
          label: 'Empresas',
          icon: 'business',
          keywords: ['organizations', 'accounts'],
        },
        {
          href: '/portal/crm/deals',
          label: 'Negocios',
          icon: 'handshake',
          keywords: ['pipeline', 'opportunities'],
        },
        {
          href: '/portal/crm/contracts',
          label: 'Contratos',
          icon: 'description',
          keywords: ['agreements', 'esign', 'documents'],
        },
        { href: '/portal/crm/proposals', label: 'Propuestas', icon: 'request_quote', exact: true, requiredDomain: 'pitch-decks', keywords: ['quotes'] },
        { href: '/portal/tools/pitch-decks', label: 'Pitch decks', icon: 'slideshow', exact: true, requiredDomain: 'pitch-decks', keywords: ['slides', 'presentations'] },
        {
          href: '/portal/crm/settings',
          label: 'Ajustes',
          icon: 'settings',
          keywords: ['crm settings', 'custom fields'],
        },
      ],
    },
    {
      href: '/portal/surveys',
      label: 'Encuestas',
      icon: 'poll',
      exact: true,
      requiredDomain: 'surveys',
      keywords: ['forms', 'questionnaires'],
      children: [
        {
          href: '/portal/surveys',
          label: 'Todas las encuestas',
          icon: 'poll',
          exact: true,
        },
        {
          href: '/portal/surveys/new',
          label: 'Nueva encuesta',
          icon: 'add_circle',
          keywords: ['create survey'],
        },
      ],
    },
    {
      href: '/portal/seo',
      label: 'SEO Intelligence',
      icon: 'travel_explore',
      requiredDomain: 'seo',
      keywords: ['seo', 'site audit', 'crawler', 'technical seo', 'search console', 'rankings'],
    },
    {
      // Marketing groups the outbound/content surfaces so they don't each take
      // a top-level slot. Each child keeps its own requiredDomain gate.
      href: '/portal/marketing',
      label: 'Marketing',
      icon: 'campaign',
      keywords: ['marketing', 'email', 'publishing', 'proposals', 'content', 'outbound'],
      children: [
        {
          href: '/portal/email',
          label: 'Email',
          icon: 'email',
          exact: true,
          requiredDomain: 'email',
          keywords: ['marketing', 'newsletters'],
          children: [
            {
              href: '/portal/email',
              label: 'Panel',
              icon: 'dashboard',
              exact: true,
            },
            {
              href: '/portal/email/campaigns',
              label: 'Campañas',
              icon: 'campaign',
            },
            {
              href: '/portal/email/templates',
              label: 'Plantillas',
              icon: 'dynamic_feed',
            },
            {
              href: '/portal/email/lists',
              label: 'Listas',
              icon: 'list_alt',
              keywords: ['mailing list', 'audiences'],
            },
            {
              href: '/portal/email/segments',
              label: 'Segmentos',
              icon: 'filter_alt',
            },
            {
              href: '/portal/email/analytics',
              label: 'Analítica',
              icon: 'analytics',
              keywords: ['stats', 'opens', 'clicks'],
            },
            {
              href: '/portal/email/settings',
              label: 'Ajustes',
              icon: 'settings',
              keywords: ['email settings'],
            },
          ],
        },
        {
          href: '/portal/publishing',
          label: 'Publicaciones',
          icon: 'rocket_launch',
          requiredDomain: 'publishing',
          keywords: ['content calendar', 'publishing command center', 'schedule', 'blog', 'social', 'email blast'],
          children: [
            {
              href: '/portal/publishing/board',
              label: 'Tablero',
              icon: 'view_kanban',
            },
            {
              href: '/portal/publishing/calendar',
              label: 'Calendario',
              icon: 'calendar_month',
              keywords: ['content calendar', 'schedule'],
            },
            {
              href: '/portal/publishing/campaigns',
              label: 'Campañas',
              icon: 'campaign',
            },
            { href: '/portal/publishing/tags', label: 'Etiquetas', icon: 'sell' },
            {
              href: '/portal/publishing/permissions',
              label: 'Permisos',
              icon: 'lock',
            },
          ],
        },
        {
          href: '/portal/branding',
          label: 'Marca y mensajes',
          icon: 'palette',
          keywords: ['brand', 'theme', 'colors', 'logo', 'voice', 'messaging'],
        },
      ],
    },
    {
      // Websites consolidates the site list, Media, A/B experiments, and (when
      // inside a site) that site's content/store/settings tree.
      href: '/portal/websites',
      label: 'Webs',
      icon: 'language',
      requiredDomain: 'websites',
      keywords: ['sites', 'cms', 'media', 'experiments', 'ab', 'a/b'],
      children: [
        {
          href: '/portal/websites',
          label: 'Todas las webs',
          icon: 'language',
          exact: true,
          keywords: ['sites', 'cms'],
        },
        ...(activeSiteId
          ? [
              {
                href: `/portal/websites/${activeSiteId}`,
                label: activeSiteName || 'Current Site',
                icon: 'web',
                exact: true,
                children: [
                  {
                    href: `/portal/websites/${activeSiteId}/entries`,
                    label: 'Contenido',
                    icon: 'article',
                    alsoActiveOn: `/portal/websites/${activeSiteId}/posts`,
                    keywords: ['pages', 'posts'],
                    children: [
                      {
                        href: `/portal/websites/${activeSiteId}/entries`,
                        label: 'Entradas',
                        icon: 'edit_note',
                        alsoActiveOn: `/portal/websites/${activeSiteId}/posts`,
                      },
                      {
                        href: `/portal/websites/${activeSiteId}/taxonomy`,
                        label: 'Taxonomías',
                        icon: 'account_tree',
                        keywords: ['categories', 'tags'],
                      },
                      {
                        href: `/portal/websites/${activeSiteId}/content-types`,
                        label: 'Tipos de contenido',
                        icon: 'description',
                      },
                    ],
                  },
                  {
                    href: `/portal/websites/${activeSiteId}/store`,
                    label: 'Tienda',
                    icon: 'shopping_cart',
                    exact: true,
                    keywords: ['ecommerce', 'shop'],
                    children: [
                      {
                        href: `/portal/websites/${activeSiteId}/store/products`,
                        label: 'Productos',
                        icon: 'inventory_2',
                      },
                      {
                        href: `/portal/websites/${activeSiteId}/store/orders`,
                        label: 'Pedidos',
                        icon: 'receipt_long',
                      },
                      {
                        href: `/portal/websites/${activeSiteId}/store/categories`,
                        label: 'Categorías',
                        icon: 'category',
                      },
                      {
                        href: `/portal/websites/${activeSiteId}/store/discounts`,
                        label: 'Descuentos',
                        icon: 'sell',
                      },
                      {
                        href: `/portal/websites/${activeSiteId}/store/shipping`,
                        label: 'Envíos',
                        icon: 'local_shipping',
                      },
                      {
                        href: `/portal/websites/${activeSiteId}/store/settings`,
                        label: 'Ajustes de la tienda',
                        icon: 'settings',
                      },
                    ],
                  },
                  {
                    href: `/portal/websites/${activeSiteId}/email`,
                    label: 'Emails de la web',
                    icon: 'email',
                    keywords: ['transactional', 'site emails'],
                  },
                  {
                    href: `/portal/websites/${activeSiteId}/navigation`,
                    label: 'Navegación',
                    icon: 'menu',
                    keywords: ['menus'],
                  },
                  {
                    href: `/portal/websites/${activeSiteId}/settings`,
                    label: 'Ajustes de la web',
                    icon: 'settings',
                  },
                ],
              },
            ]
          : []),
        {
          href: '/portal/media',
          label: 'Archivos multimedia',
          icon: 'perm_media',
          keywords: ['images', 'files', 'uploads'],
        },
        {
          href: '/portal/experiments',
          label: 'Experimentos A/B',
          icon: 'science',
          keywords: ['ab', 'a/b', 'split test', 'variant', 'experiment'],
        },
      ],
    },
    {
      // ── Account cluster (below the divider) ──────────────────────────────
      // Support surfaces grouped so they don't each take a top-level slot.
      href: '/portal/tickets',
      label: 'Soporte',
      icon: 'support_agent',
      dividerBefore: true,
      keywords: ['help desk', 'support', 'requests', 'tickets', 'chat', 'inbox', 'live chat'],
      children: [
        {
          href: '/portal/tickets',
          label: 'Tickets',
          icon: 'support_agent',
          exact: true,
          keywords: ['help desk', 'support', 'requests'],
        },
        {
          href: '/portal/inbox',
          label: 'Bandeja de entrada',
          icon: 'forum',
          keywords: ['chat', 'conversations', 'messages', 'live chat', 'inbox'],
        },
      ],
    },
    {
      // Billing & account surfaces (invoices, purchasable services, hosting).
      href: '/portal/invoices',
      label: 'Facturación',
      icon: 'receipt_long',
      keywords: ['billing', 'payments', 'charges', 'invoices', 'services', 'subscriptions', 'add-ons', 'hosting', 'dns', 'domains'],
      children: [
        {
          href: '/portal/settings/billing',
          label: 'Facturas',
          icon: 'receipt_long',
          exact: true,
          keywords: ['billing', 'payments', 'charges'],
        },
      ],
    },
    // MCP Approvals is intentionally hidden from sidebar + cmd-k. The page
    // at /portal/approvals still renders for direct URL access.
    {
      href: '/portal/agency',
      label: 'Agencia',
      icon: 'storefront',
      exact: true,
      keywords: ['white label', 'white-label', 'reseller', 'custom domain', 'agency branding', 'saas mode', 'scale'],
      children: [
        {
          href: '/portal/agency',
          label: 'Resumen',
          icon: 'storefront',
          exact: true,
        },
        {
          href: '/portal/agency/custom-domain',
          label: 'Dominio personalizado',
          icon: 'dns',
          keywords: ['dns', 'cname', 'verify'],
        },
        {
          href: '/portal/agency/branding',
          label: 'Marca de la agencia',
          icon: 'palette',
          keywords: ['logo', 'wordmark', 'agency name'],
        },
        { href: '/portal/services', label: 'Servicios', icon: 'miscellaneous_services', keywords: ['subscriptions', 'add-ons'] },
        { href: '/portal/hosting', label: 'Hosting', icon: 'dns', keywords: ['dns', 'domains', 'servers'] },
      ],
    },
    {
      href: '/portal/settings',
      label: 'Ajustes',
      icon: 'settings',
      keywords: ['account', 'team', 'billing'],
    },
  ];

  // Inject the "Apps" group before Settings when the caller supplied a list
  // of entitled plugins. Done as a post-process splice (rather than inline
  // in the array literal) so the base tree stays trivially readable and the
  // existing call signature `buildPortalNavItems(siteId, siteName)` keeps
  // working unchanged.
  if (apps && apps.length > 0) {
    const appsGroup: PortalNavItem = {
      href: '/portal/apps',
      label: 'Aplicaciones',
      icon: 'apps',
      keywords: ['plugins', 'integrations'],
      children: apps.map((a) => ({
        href: `/portal/apps/${a.slug}`,
        label: a.name,
        icon: a.icon,
        keywords: [a.slug],
        children: a.navItems.map((item) => ({
          // Manifest hrefs are plugin-local and start with `/`. The portal
          // rewrites them under `/portal/apps/<slug>`. A bare `/` becomes
          // the slug root itself rather than appearing as `/<slug>/`.
          href: `/portal/apps/${a.slug}${item.href === '/' ? '' : item.href}`,
          label: item.label,
          icon: item.icon,
          keywords: item.keywords ?? [],
        })),
      })),
    };

    const settingsIdx = items.findIndex((i) => i.href === '/portal/settings');
    if (settingsIdx >= 0) {
      items.splice(settingsIdx, 0, appsGroup);
    } else {
      items.push(appsGroup);
    }
  }

  // Apply entitlement gating: when entitlements are provided and gating is
  // active, mark items and their children as locked when the required domain
  // is not in the entitled set.
  if (entitlements && !entitlements.gatingBypassed) {
    const lockChildren = (children: PortalNavChild[]): PortalNavChild[] =>
      children.map((c) => ({
        ...c,
        locked: true,
        children: c.children ? lockChildren(c.children) : c.children,
      }));

    const applyLock = (nodes: PortalNavChild[]) => {
      for (const item of nodes) {
        if (item.requiredDomain && !entitlements.domains.has(item.requiredDomain)) {
          item.locked = true;
          if (item.children) item.children = lockChildren(item.children);
        } else if (item.children) {
          // No gate on this node (e.g. the Marketing container) — recurse so
          // gated children inside it still lock individually.
          applyLock(item.children);
        }
      }
    };
    applyLock(items);
  }

  return items;
}

export interface PortalNavTarget {
  href: string;
  label: string;
  icon: string;
  /** Breadcrumb labels from root to (but not including) this item. */
  breadcrumb: string[];
  /** Lower-cased haystack used for fuzzy matching. */
  haystack: string;
}

/**
 * Walk the nav tree depth-first and emit one record per navigable destination.
 * Parents that have children are still emitted because clicking them is valid.
 * Each destination is deduplicated by href so the palette doesn't double-list
 * the same page when a parent and its first child share the same href.
 */
export function flattenPortalNav(items: PortalNavItem[]): PortalNavTarget[] {
  const out: PortalNavTarget[] = [];
  const seen = new Set<string>();

  const walk = (nodes: PortalNavChild[], trail: string[]) => {
    for (const node of nodes) {
      // Section labels are not destinations — skip them entirely.
      if (node.groupHeader) continue;
      // Locked nodes are not surfaced in the Cmd+K palette — their href is not
      // a reachable destination for ungated users.
      if (node.locked) continue;
      if (!seen.has(node.href)) {
        seen.add(node.href);
        const haystackParts = [...trail.map((s) => s.toLowerCase()), node.label.toLowerCase(), ...(node.keywords ?? []).map((k) => k.toLowerCase())];
        out.push({
          href: node.href,
          label: node.label,
          icon: node.icon,
          breadcrumb: trail,
          haystack: haystackParts.join(' '),
        });
      }
      if (node.children?.length) walk(node.children, [...trail, node.label]);
    }
  };

  walk(items, []);
  return out;
}
