// Client-safe portal utilities — no DB or server imports

export function formatCents(cents: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

export function invoiceStatusColor(status: string): string {
  const map: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    sent: 'bg-blue-100 text-blue-700',
    paid: 'bg-green-100 text-green-700',
    overdue: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-500',
  };
  return map[status] ?? 'bg-muted text-muted-foreground';
}

export function ticketStatusColor(status: string): string {
  const map: Record<string, string> = {
    open: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    waiting: 'bg-orange-100 text-orange-700',
    waiting_on_customer: 'bg-orange-100 text-orange-700',
    resolved: 'bg-green-100 text-green-700',
    closed: 'bg-gray-100 text-gray-500',
  };
  return map[status] ?? 'bg-muted text-muted-foreground';
}

export function priorityColor(priority: string): string {
  const map: Record<string, string> = {
    low: 'bg-gray-100 text-gray-600',
    medium: 'bg-blue-100 text-blue-700',
    high: 'bg-orange-100 text-orange-700',
    urgent: 'bg-red-100 text-red-700',
  };
  return map[priority] ?? 'bg-muted text-muted-foreground';
}

/** Spanish labels for support-ticket statuses (UI shows these, not the enum). */
export function ticketStatusLabel(status: string): string {
  const map: Record<string, string> = {
    open: 'Abierto',
    in_progress: 'En curso',
    waiting: 'Esperando al cliente',
    waiting_on_customer: 'Esperando al cliente',
    resolved: 'Resuelto',
    closed: 'Cerrado',
  };
  return map[status] ?? status.replace(/_/g, ' ');
}

/** Spanish labels for support-ticket priorities (UI shows these, not the enum). */
export function ticketPriorityLabel(priority: string): string {
  const map: Record<string, string> = {
    low: 'Baja',
    medium: 'Media',
    high: 'Alta',
    urgent: 'Urgente',
  };
  return map[priority] ?? priority;
}

/** Spanish labels for chat channels (UI shows these, not the enum). */
export function chatChannelLabel(channel: string): string {
  const map: Record<string, string> = {
    whatsapp: 'WhatsApp',
    instagram: 'Instagram',
    messenger: 'Messenger',
    email: 'Correo',
    webchat: 'Chat web',
  };
  return map[channel] ?? channel;
}

/** Spanish labels for inbox conversation statuses (UI shows these, not the enum). */
export function chatConversationStatusLabel(status: string): string {
  const map: Record<string, string> = {
    open: 'Abierto',
    assigned: 'Asignado',
    closed: 'Cerrado',
  };
  return map[status] ?? status;
}

/** Spanish labels for inbox AI modes (UI shows these, not the enum). */
export function chatAiModeLabel(mode: string): string {
  const map: Record<string, string> = {
    ai: 'IA',
    human: 'Humano',
    hybrid: 'Híbrido',
    paused: 'En pausa',
    closed: 'Cerrado',
  };
  return map[mode] ?? mode;
}

/** Spanish labels for chat message delivery statuses (UI shows these, not the enum). */
export function chatMessageStatusLabel(status: string): string {
  const map: Record<string, string> = {
    received: 'Recibido',
    sent: 'Enviado',
    delivered: 'Entregado',
    read: 'Leído',
    failed: 'Fallido',
    pending: 'Pendiente',
  };
  return map[status] ?? status;
}

/** Spanish labels for chat message author kinds (UI shows these, not the enum). */
export function chatAuthorKindLabel(kind: string): string {
  const map: Record<string, string> = {
    visitor: 'Visitante',
    agent: 'Agente',
    system: 'Sistema',
    ai: 'IA',
  };
  return map[kind] ?? kind;
}

/** Spanish labels for inbox conversation priorities (UI shows these, not the enum). */
export function chatPriorityLabel(priority: string): string {
  const map: Record<string, string> = {
    low: 'Baja',
    normal: 'Normal',
    high: 'Alta',
    urgent: 'Urgente',
  };
  return map[priority] ?? priority;
}

/** Spanish labels for content-calendar statuses (UI shows these, not the enum). */
export function calendarStatusLabel(status: string): string {
  const map: Record<string, string> = {
    published: 'Publicado',
    scheduled: 'Programado',
    draft: 'Borrador',
  };
  return map[status] ?? status;
}

/** Spanish labels for post types (UI shows these, not the slug). */
export function postTypeLabel(postType: string): string {
  const map: Record<string, string> = {
    blog: 'Entrada de blog',
    page: 'Página',
    'case-study': 'Caso de estudio',
    landing: 'Landing page',
  };
  return map[postType] ?? postType;
}

/**
 * Spanish relative time for UI labels — "ahora mismo", "hace 5 min",
 * "hace 3 h", "hace 2 d", "hace 4 meses", "hace 2 años". Pass
 * `{ signed: true }` to render future values too ("en 5 min", "en un
 * momento"); the default only describes the past. `null`/invalid → "—".
 */
export function relativeTimeEs(
  value: string | number | Date | null | undefined,
  opts: { signed?: boolean } = {},
): string {
  if (value == null) return '—';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '—';
  const diffMs = Date.now() - then; // positive = past
  const future = diffMs < 0;
  const abs = Math.abs(diffMs);
  const s = Math.floor(abs / 1000);
  if (s < 45) {
    if (!opts.signed) return 'ahora mismo';
    return future ? 'en un momento' : 'ahora mismo';
  }
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  const mo = Math.floor(d / 30);
  const y = Math.floor(mo / 12);
  const unit =
    m < 60 ? `${m} min` :
    h < 24 ? `${h} h` :
    d < 30 ? `${d} d` :
    mo < 12 ? `${mo} meses` :
    `${y} años`;
  if (!opts.signed) return `hace ${unit}`;
  return future ? `en ${unit}` : `hace ${unit}`;
}

export function orderStatusColor(status: string): string {
  const map: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-blue-100 text-blue-700',
    processing: 'bg-indigo-100 text-indigo-700',
    shipped: 'bg-purple-100 text-purple-700',
    delivered: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
    refunded: 'bg-orange-100 text-orange-700',
  };
  return map[status] ?? 'bg-muted text-muted-foreground';
}

export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/\n{2,}/g, ' ')
    .trim();
}

export function paymentStatusColor(status: string): string {
  const map: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    paid: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    refunded: 'bg-orange-100 text-orange-700',
    partially_refunded: 'bg-amber-100 text-amber-700',
  };
  return map[status] ?? 'bg-muted text-muted-foreground';
}
