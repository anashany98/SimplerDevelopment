'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useAgencyChrome } from './AgencyChromeProvider';
import { buildPortalNavItems, type PortalNavItem } from '@/lib/portal-nav';

const DEFAULT_APP = 'CRM AGENTS';

// Order matters: more-specific patterns must come before broader ones.
const ROUTES: { match: RegExp; title: string }[] = [
  // ─── Brain ───────────────────────────────────────────────────────────────
  { match: /^\/portal\/brain\/communications\/\d+\/review$/, title: 'Revisar comunicación' },
  { match: /^\/portal\/brain\/communications\/new$/,         title: 'Nueva comunicación' },
  { match: /^\/portal\/brain\/communications\/\d+$/,         title: 'Comunicación' },
  { match: /^\/portal\/brain\/communications$/,              title: 'Comunicaciones' },
  { match: /^\/portal\/brain\/relationships\/\d+$/,    title: 'Relación' },
  { match: /^\/portal\/brain\/relationships$/,         title: 'Relaciones' },
  { match: /^\/portal\/brain\/tasks$/,                 title: 'Tareas' },
  { match: /^\/portal\/brain\/prospects$/,             title: 'Prospectos' },
  { match: /^\/portal\/brain\/ask$/,                   title: 'Conectar IA' },
  { match: /^\/portal\/brain\/settings$/,              title: 'Ajustes' },
  { match: /^\/portal\/brain$/,                        title: 'Cerebro de empresa' },

  // ─── Projects ────────────────────────────────────────────────────────────
  { match: /^\/portal\/projects\/automations$/,        title: 'Automatizaciones de proyectos' },
  { match: /^\/portal\/projects\/\d+$/,                title: 'Proyecto' },
  { match: /^\/portal\/projects$/,                     title: 'Proyectos' },
  { match: /^\/portal\/my-tasks$/,                     title: 'Mis tareas' },
  { match: /^\/portal\/suggested-projects\/[^/]+\/request$/, title: 'Solicitar proyecto' },
  { match: /^\/portal\/suggested-projects\/[^/]+$/,    title: 'Proyecto sugerido' },
  { match: /^\/portal\/suggested-projects$/,           title: 'Proyectos sugeridos' },

  // ─── CRM ─────────────────────────────────────────────────────────────────
  { match: /^\/portal\/crm\/contacts\/\d+$/,           title: 'Contacto' },
  { match: /^\/portal\/crm\/contacts$/,                title: 'Contactos' },
  { match: /^\/portal\/crm\/companies\/\d+$/,          title: 'Empresa' },
  { match: /^\/portal\/crm\/companies$/,               title: 'Empresas' },
  { match: /^\/portal\/crm\/deals$/,                   title: 'Negocios' },
  { match: /^\/portal\/crm\/proposals\/\d+$/,          title: 'Propuesta' },
  { match: /^\/portal\/crm\/proposals$/,               title: 'Propuestas' },
  { match: /^\/portal\/crm\/settings$/,                title: 'Ajustes de CRM' },
  { match: /^\/portal\/crm$/,                          title: 'CRM' },

  // ─── Email ───────────────────────────────────────────────────────────────
  { match: /^\/portal\/email\/campaigns\/new$/,        title: 'Nueva campaña' },
  { match: /^\/portal\/email\/campaigns\/\d+$/,        title: 'Campaña' },
  { match: /^\/portal\/email\/campaigns$/,             title: 'Campañas' },
  { match: /^\/portal\/email\/templates$/,             title: 'Plantillas de email' },
  { match: /^\/portal\/email\/lists$/,                 title: 'Listas de email' },
  { match: /^\/portal\/email\/segments$/,              title: 'Segmentos de email' },
  { match: /^\/portal\/email\/analytics$/,             title: 'Analítica de email' },
  { match: /^\/portal\/email\/automations$/,           title: 'Automatizaciones de email' },
  { match: /^\/portal\/email\/settings$/,              title: 'Ajustes de email' },
  { match: /^\/portal\/email\/editor-preview$/,        title: 'Vista previa del editor de email' },
  { match: /^\/portal\/email$/,                        title: 'Correo' },

  // ─── Surveys ─────────────────────────────────────────────────────────────
  { match: /^\/portal\/surveys\/new$/,                 title: 'Nueva encuesta' },
  { match: /^\/portal\/surveys\/\d+$/,                 title: 'Encuesta' },
  { match: /^\/portal\/surveys$/,                      title: 'Encuestas' },

  // ─── Tickets / Invoices / Hosting ────────────────────────────────────────
  { match: /^\/portal\/tickets\/new$/,                 title: 'Nuevo ticket' },
  { match: /^\/portal\/tickets\/\d+$/,                 title: 'Ticket' },
  { match: /^\/portal\/invoices\/\d+$/,                title: 'Factura' },
  { match: /^\/portal\/hosting\/\d+$/,                 title: 'Plan de hosting' },
  { match: /^\/portal\/hosting$/,                      title: 'Hosting' },

  // ─── Services ────────────────────────────────────────────────────────────
  { match: /^\/portal\/services\/[^/]+\/request$/,     title: 'Solicitud de servicio' },
  { match: /^\/portal\/services$/,                     title: 'Servicios' },

  // ─── Settings ────────────────────────────────────────────────────────────
  { match: /^\/portal\/settings\/ai$/,                 title: 'Ajustes de IA' },
  { match: /^\/portal\/settings\/api-keys$/,           title: 'Claves de API' },
  { match: /^\/portal\/settings\/billing$/,            title: 'Facturación' },
  { match: /^\/portal\/settings\/profile$/,            title: 'Perfil' },
  { match: /^\/portal\/settings\/support$/,            title: 'Soporte' },
  { match: /^\/portal\/settings\/team$/,               title: 'Equipo' },
  { match: /^\/portal\/settings$/,                     title: 'Ajustes' },

  // ─── Tools / Booking ─────────────────────────────────────────────────────
  { match: /^\/portal\/tools\/booking\/calendar$/,     title: 'Calendario de reservas' },
  { match: /^\/portal\/tools\/booking\/checkin$/,      title: 'Check-in de reservas' },
  { match: /^\/portal\/tools\/booking\/analytics$/,    title: 'Analítica de reservas' },
  { match: /^\/portal\/tools\/booking\/quotes\/new$/,  title: 'Nueva cotización' },
  { match: /^\/portal\/tools\/booking\/quotes$/,       title: 'Cotizaciones' },
  { match: /^\/portal\/tools\/booking\/new$/,          title: 'Nueva reserva' },
  { match: /^\/portal\/tools\/booking\/\d+$/,          title: 'Reserva' },
  { match: /^\/portal\/tools\/booking$/,               title: 'Reservas' },
  { match: /^\/portal\/tools\/gift-certificates$/,     title: 'Tarjetas de regalo' },

  // ─── Tools / Pitch Decks ─────────────────────────────────────────────────
  { match: /^\/portal\/tools\/pitch-decks\/new$/,                 title: 'Nuevo pitch deck' },
  { match: /^\/portal\/tools\/pitch-decks\/\d+\/presenter$/,      title: 'Modo presentador' },
  { match: /^\/portal\/tools\/pitch-decks\/\d+\/slide-preview$/,  title: 'Vista previa de diapositiva' },
  { match: /^\/portal\/tools\/pitch-decks\/\d+$/,                 title: 'Pitch deck' },
  { match: /^\/portal\/tools\/pitch-decks$/,                      title: 'Pitch decks' },

  // ─── Websites (CMS) ──────────────────────────────────────────────────────
  { match: /^\/portal\/websites\/new$/,                                 title: 'Nueva web' },
  { match: /^\/portal\/websites\/\d+\/posts\/\d+\/edit$/,               title: 'Editar entrada' },
  { match: /^\/portal\/websites\/\d+\/posts\/new$/,                     title: 'Nueva entrada' },
  { match: /^\/portal\/websites\/\d+\/email\/\d+$/,                     title: 'Plantilla de email' },
  { match: /^\/portal\/websites\/\d+\/email$/,                          title: 'Emails de la web' },
  { match: /^\/portal\/websites\/\d+\/store\/products\/\d+$/,           title: 'Producto' },
  { match: /^\/portal\/websites\/\d+\/store\/products$/,                title: 'Productos' },
  { match: /^\/portal\/websites\/\d+\/store\/orders\/\d+$/,             title: 'Pedido' },
  { match: /^\/portal\/websites\/\d+\/store\/orders$/,                  title: 'Pedidos' },
  { match: /^\/portal\/websites\/\d+\/store\/categories$/,              title: 'Categorías de la tienda' },
  { match: /^\/portal\/websites\/\d+\/store\/discounts$/,               title: 'Descuentos' },
  { match: /^\/portal\/websites\/\d+\/store\/shipping$/,                title: 'Envíos' },
  { match: /^\/portal\/websites\/\d+\/store\/settings$/,                title: 'Ajustes de la tienda' },
  { match: /^\/portal\/websites\/\d+\/store$/,                          title: 'Tienda' },
  { match: /^\/portal\/websites\/\d+\/entries$/,                        title: 'Entradas' },
  { match: /^\/portal\/websites\/\d+\/taxonomy$/,                       title: 'Taxonomías' },
  { match: /^\/portal\/websites\/\d+\/tags$/,                           title: 'Etiquetas' },
  { match: /^\/portal\/websites\/\d+\/categories$/,                     title: 'Categorías' },
  { match: /^\/portal\/websites\/\d+\/content-types$/,                  title: 'Tipos de contenido' },
  { match: /^\/portal\/websites\/\d+\/media$/,                          title: 'Archivos multimedia' },
  { match: /^\/portal\/websites\/\d+\/calendar$/,                       title: 'Calendario' },
  { match: /^\/portal\/websites\/\d+\/automations$/,                    title: 'Automatizaciones de la web' },
  { match: /^\/portal\/websites\/\d+\/branding$/,                       title: 'Marca de la web' },
  { match: /^\/portal\/websites\/\d+\/navigation$/,                     title: 'Navegación' },
  { match: /^\/portal\/websites\/\d+\/settings$/,                       title: 'Ajustes de la web' },
  { match: /^\/portal\/websites\/\d+$/,                                 title: 'Sitio web' },
  { match: /^\/portal\/websites$/,                                      title: 'Webs' },

  // ─── Branding ────────────────────────────────────────────────────────────
  { match: /^\/portal\/branding\/profiles\/\d+\/guide$/,           title: 'Guía de marca' },
  { match: /^\/portal\/branding\/profiles\/\d+$/,                  title: 'Perfil de marca' },
  { match: /^\/portal\/branding$/,                                 title: 'Marca y mensajes' },

  // ─── Agency / White-Label ────────────────────────────────────────────────
  { match: /^\/portal\/agency\/custom-domain$/,                    title: 'Dominio personalizado del portal' },
  { match: /^\/portal\/agency\/branding$/,                         title: 'Marca de la agencia' },
  { match: /^\/portal\/agency$/,                                   title: 'Agencia' },

  // ─── Top-level ───────────────────────────────────────────────────────────
  { match: /^\/portal\/dashboard$/,                title: 'Panel' },
  { match: /^\/portal\/approvals$/,                title: 'Aprobaciones' },
  { match: /^\/portal\/automations$/,               title: 'Automatizaciones' },
  { match: /^\/portal\/media$/,                    title: 'Medios' },
  { match: /^\/portal\/login$/,                    title: 'Iniciar sesión' },
  { match: /^\/portal\/forgot-password$/,          title: 'Recuperar contraseña' },
  { match: /^\/portal\/reset-password$/,           title: 'Restablecer contraseña' },
  { match: /^\/portal\/invite\/[^/]+$/,            title: 'Aceptar invitación' },
  { match: /^\/portal$/,                           title: 'Portal' },
];

// The curated table above drifts as routes ship — seo, publishing, standup and
// most of brain/ spent months titled just "Portal" (operator-reported: every
// inactive tab looked identical). So a table miss no longer means generic:
// fall back to the nav tree (lib/portal-nav.ts — the one place section names
// are maintained, so future nav'd routes title themselves), then to humanized
// path segments for static tails the nav doesn't reach.

const ACRONYMS: Record<string, string> = { seo: 'SEO', crm: 'CRM', ai: 'AI', api: 'API', gsc: 'GSC' };

function humanize(segment: string): string {
  return segment
    .split('-')
    .map((w) => ACRONYMS[w] ?? w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Deepest nav item whose href prefixes the pathname (site-scoped hrefs align
 *  because the siteId is lifted from the pathname itself). */
function deepestNavMatch(pathname: string): { href: string; label: string } | null {
  const siteId = pathname.match(/^\/portal\/websites\/(\d+)/)?.[1] ?? null;
  let best: { href: string; label: string } | null = null;
  const walk = (items: Array<PortalNavItem | { href: string; label: string; children?: unknown[] }>) => {
    for (const item of items) {
      if (pathname === item.href || pathname.startsWith(item.href + '/')) {
        if (!best || item.href.length > best.href.length) best = { href: item.href, label: item.label };
      }
      if ('children' in item && Array.isArray(item.children)) {
        walk(item.children as Array<{ href: string; label: string; children?: unknown[] }>);
      }
    }
  };
  walk(buildPortalNavItems(siteId, null));
  return best;
}

export function resolvePortalTitle(pathname: string): string {
  for (const r of ROUTES) {
    if (r.match.test(pathname)) return r.title;
  }
  if (!pathname.startsWith('/portal')) return 'Portal';

  const nav = deepestNavMatch(pathname);
  // Static segments past the nav match (or past /portal) distinguish deeper
  // pages; numeric ids say nothing to a human, so they're dropped.
  const tail = pathname
    .slice((nav?.href ?? '/portal').length)
    .split('/')
    .filter((s) => s && !/^\d+$/.test(s));
  const tailTitle = tail.length ? humanize(tail[tail.length - 1]) : null;

  if (nav && tailTitle) return `${tailTitle} · ${nav.label}`;
  if (nav) return nav.label;
  return tailTitle ?? 'Portal';
}

export default function PortalTitle() {
  const pathname = usePathname();
  const { agencyName, whiteLabelEnabled } = useAgencyChrome();
  useEffect(() => {
    const app = whiteLabelEnabled && agencyName ? agencyName : DEFAULT_APP;
    document.title = `${resolvePortalTitle(pathname)} | ${app}`;
  }, [pathname, agencyName, whiteLabelEnabled]);
  return null;
}
