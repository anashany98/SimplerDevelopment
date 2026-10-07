import type { PortalAgentId } from './portal-agents';

/**
 * Deterministic, bounded handoff from the CEO to background specialists.
 *
 * This deliberately does not ask a model which jobs to start: a prompt must
 * never be able to fan out an unbounded amount of paid work. The keyword map
 * only chooses a maximum of three read-only analyses; writes stay behind the
 * existing approval workflow.
 */
const SPECIALIST_MATCHERS: ReadonlyArray<readonly [PortalAgentId, RegExp]> = [
  ['crm', /\b(cliente|clientes|lead|leads|contacto|contactos|empresa|empresas|negocio|negocios|oportunidad|oportunidades|venta|ventas|pipeline)\b/i],
  ['inbox', /\b(whatsapp|instagram|messenger|mensaje|mensajes|conversaci[oó]n|conversaciones|bandeja|inbox|canal|canales)\b/i],
  ['marketing', /\b(marketing|campa[nñ]a|campa[nñ]as|audiencia|audiencias|segmento|segmentos|newsletter|email|emails)\b/i],
  ['commerce', /\b(cat[aá]logo|producto|productos|precio|precios|stock|inventario|tienda|ecommerce|shopify|prestashop|woocommerce|pedido|pedidos)\b/i],
  ['websites', /\b(web|website|p[aá]gina|p[aá]ginas|contenido|contenidos|seo|landing|dominio)\b/i],
  ['automations', /\b(automatizaci[oó]n|automatizaciones|workflow|workflows|flujo|flujos|disparador|disparadores|regla|reglas)\b/i],
  ['projects', /\b(proyecto|proyectos|tarea|tareas|sprint|bloqueo|bloqueos|kanban)\b/i],
  ['support', /\b(soporte|ticket|tickets|incidencia|incidencias)\b/i],
  ['billing', /\b(factura|facturas|pago|pagos|cobro|cobros|facturaci[oó]n)\b/i],
  ['analytics', /\b(m[eé]trica|m[eé]tricas|indicador|indicadores|rendimiento|informe|informes|anal[ií]tica|analisis|an[aá]lisis)\b/i],
  ['team', /\b(equipo|miembro|miembros|usuario|usuarios|permiso|permisos)\b/i],
  ['bookings', /\b(reserva|reservas|cita|citas|agenda|disponibilidad)\b/i],
];

export const MAX_BACKGROUND_SPECIALISTS = 3;

export function selectBackgroundSpecialists(task: string): PortalAgentId[] {
  const selected: PortalAgentId[] = [];
  for (const [agentId, pattern] of SPECIALIST_MATCHERS) {
    if (pattern.test(task)) selected.push(agentId);
    if (selected.length === MAX_BACKGROUND_SPECIALISTS) break;
  }
  return selected;
}
