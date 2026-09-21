/**
 * Pure formatters and lookup tables for the card-detail modal.
 *
 * Extracted from the original CardDetailModal.tsx so section components can
 * import them without dragging in the dispatcher.
 */
import type { Activity } from './types';

export const ARTIFACT_ICONS: Record<string, string> = {
  website: 'language',
  email_campaign: 'campaign',
  pitch_deck: 'slideshow',
  proposal: 'description',
  booking: 'calendar_month',
  survey: 'poll',
  project: 'folder',
  post: 'article',
  path_chart: 'device_hub',
  agent_flow_run: 'account_tree',
};

/**
 * Artifact types attached by the workflow runner rather than chosen by a
 * person. They render like any other linked artifact but are filtered out of
 * the "Link Artifact" picker — a human has no way to know which run produced
 * a card, and offering an empty list reads as a broken filter.
 */
export const AGENT_LINKED_ARTIFACT_TYPES = new Set(['agent_flow_run']);

export const ARTIFACT_LABELS: Record<string, string> = {
  website: 'Web',
  email_campaign: 'Campaña de email',
  pitch_deck: 'Presentación',
  proposal: 'Propuesta',
  booking: 'Reserva',
  survey: 'Encuesta',
  project: 'Proyecto',
  post: 'Doc / Artículo',
  path_chart: 'Path chart',
  agent_flow_run: 'Ejecución de workflow',
};

export function artifactUrl(type: string, id: number): string | null {
  switch (type) {
    case 'website':
      return `/portal/websites/${id}`;
    case 'email_campaign':
      return `/portal/email/campaigns/${id}`;
    case 'pitch_deck':
      return `/portal/tools/pitch-decks/${id}`;
    case 'proposal':
      return `/portal/crm/proposals/${id}`;
    case 'booking':
      return `/portal/tools/booking/${id}`;
    case 'survey':
      return `/portal/surveys/${id}`;
    case 'project':
      return `/portal/projects/${id}`;
    case 'post':
      return `/portal/posts/${id}`;
    case 'agent_flow_run':
      // The Executions tab lives under the run's project, and a link row
      // carries only (type, id) — so this points at a resolver that looks the
      // project up and redirects, rather than widening artifactUrl's
      // signature for one caller.
      return `/portal/flow-runs/${id}`;
    default:
      return null;
  }
}

export function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** Render the human-readable activity line for one activity row. */
export function formatActivity(a: Activity): string {
  const who = a.userName ?? 'Alguien';
  const p = a.payload ?? {};
  const q = (v: unknown) => (typeof v === 'string' ? `"${v}"` : String(v));
  switch (a.type) {
    case 'card.created':
      return `${who} creó esta tarjeta`;
    case 'card.title_changed':
      return `${who} la renombró a ${q(p.to)}`;
    case 'card.description_changed':
      return `${who} editó la descripción`;
    case 'card.priority_changed':
      return `${who} puso la prioridad en ${p.to ?? 'ninguna'}`;
    case 'card.due_date_changed':
      return p.to
        ? `${who} puso vencimiento para el ${new Date(String(p.to)).toLocaleDateString('es-ES')}`
        : `${who} quitó el vencimiento`;
    case 'card.assigned':
      return `${who} asignó la tarjeta`;
    case 'card.unassigned':
      return `${who} desasignó la tarjeta`;
    case 'card.sprint_changed':
      return p.to ? `${who} la movió a un sprint` : `${who} la quitó del sprint`;
    case 'card.column_changed':
      return `${who} movió la tarjeta a otra columna`;
    case 'card.label_added':
      return `${who} añadió la etiqueta "${p.name}"`;
    case 'card.label_removed':
      return `${who} quitó la etiqueta "${p.name}"`;
    case 'card.commented':
      return `${who} comentó`;
    case 'card.file_added':
      return `${who} adjuntó un archivo`;
    case 'card.checklist_item_added':
      return `${who} añadió el ítem "${p.text}"`;
    case 'card.checklist_item_completed':
      return `${who} completó "${p.text}"`;
    case 'card.checklist_item_uncompleted':
      return `${who} reabrió "${p.text}"`;
    case 'card.checklist_item_removed':
      return `${who} quitó el ítem "${p.text}"`;
    case 'card.assignee_added':
      return `${who} asignó a ${p.name ?? 'alguien'}`;
    case 'card.assignee_removed':
      return `${who} quitó a ${p.name ?? 'alguien'}`;
    case 'card.dependency_added':
      return `${who} añadió el bloqueante "${p.title ?? p.blockerCardId}"`;
    case 'card.dependency_removed':
      return `${who} quitó un bloqueante`;
    default:
      return `${who} ${a.type}`;
  }
}
