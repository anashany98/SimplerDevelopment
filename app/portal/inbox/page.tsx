'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pCard } from '@/components/portal/portal-ui';

interface Site {
  id: number;
  name: string;
}

interface Conversation {
  id: number;
  widgetId: number | null;
  visitorId: string | null;
  visitorName: string | null;
  visitorEmail: string | null;
  channel: 'whatsapp' | 'instagram' | 'messenger' | 'webchat' | 'email';
  aiMode: 'ai' | 'human' | 'paused' | 'hybrid' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'open' | 'assigned' | 'closed';
  assignedUserId: number | null;
  lastMessageAt: string;
  createdAt: string;
}

interface Widget {
  id: number;
  siteId: number;
  enabled: boolean;
  primaryColor: string;
}

const STATUS_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'open', label: 'Abierto' },
  { id: 'assigned', label: 'Asignado' },
  { id: 'closed', label: 'Cerrado' },
] as const;

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]['id']>('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create-widget modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function loadConversations(status: string, channel = channelFilter, search = query) {
    const params = new URLSearchParams();
    if (status !== 'all') params.set('status', status);
    if (channel !== 'all') params.set('channel', channel);
    if (search.trim()) params.set('q', search.trim());
    const res = await fetch(`/api/portal/chat/conversations?${params}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'No se pudieron cargar las conversaciones');
    setConversations(json.data as Conversation[]);
  }

  // Initial widget list — drives the empty state and the "Settings" link.
  useEffect(() => {
    fetch('/api/portal/chat/widgets')
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setWidgets(j.data as Widget[]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadConversations(filter, channelFilter, query);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo cargar');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filter, channelFilter, query]);

  // Live updates via SSE — bump unread / new conversations into the list.
  useEffect(() => {
    const es = new EventSource('/api/portal/chat/inbox-stream');
    es.addEventListener('conversation', () => {
      // Cheapest correct strategy: refetch the active filter.
      void loadConversations(filter, channelFilter, query);
    });
    es.addEventListener('message', () => {
      void loadConversations(filter, channelFilter, query);
    });
    es.onerror = () => {
      // EventSource auto-retries.
    };
    return () => es.close();
  }, [filter, channelFilter, query]);

  const empty = useMemo(() => !loading && conversations.length === 0, [loading, conversations.length]);

  const openCreateModal = async () => {
    setCreateError(null);
    setSelectedSiteId('');
    setShowCreateModal(true);
    try {
      const res = await fetch('/api/portal/cms/websites');
      const json = await res.json();
      if (json.success) setSites(json.data as Site[]);
    } catch {
      // non-critical — user can still type a site id if needed
    }
  };

  const createWidget = async () => {
    if (!selectedSiteId) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/portal/chat/widgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: Number(selectedSiteId) }),
      });
      const json = await res.json();
      if (!json.success) {
        setCreateError(json.message ?? 'No se pudo crear el widget');
        return;
      }
      setWidgets((prev) => [...prev, json.data as Widget]);
      setShowCreateModal(false);
    } catch {
      setCreateError('Error de red — inténtalo de nuevo');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <PortalPageHeader
        eyebrow="OMNICANAL"
        title="Bandeja de entrada unificada"
        subtitle="Conversaciones de WhatsApp, Instagram, Messenger, chat web y email."
        actions={
          <div className="flex gap-2">
            <Link href="/portal/settings/channels" className={pBtnGhost}>
              <span className="material-icons text-base">hub</span>
              Canales
            </Link>
            {widgets.length > 0 ? (
              <Link href={`/portal/inbox/widgets/${widgets[0].id}`} className={pBtnGhost}>
                <span className="material-icons text-base">settings</span>
                Chat web
              </Link>
            ) : (
              <button type="button" onClick={openCreateModal} className={pBtnPrimary}>
                <span className="material-icons text-base">add</span>
                Chat web
              </button>
            )}
          </div>
        }
      />

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <label className="relative">
          <span className="material-icons absolute left-3 top-2.5 text-base text-muted-foreground">search</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar personas, email o mensajes" className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm" />
        </label>
        <select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <option value="all">Todos los canales</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="instagram">Instagram</option>
          <option value="messenger">Messenger</option>
          <option value="webchat">Chat web</option>
          <option value="email">Correo</option>
        </select>
      </div>

      <div className="flex gap-2 border-b overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`px-3 py-2 text-sm border-b-2 transition-colors whitespace-nowrap ${
              filter === f.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">{error}</div>
      )}

      {empty ? (
        <div className="text-center py-12 text-muted-foreground">
          <span className="material-icons text-4xl mb-2 block">inbox</span>
          {widgets.length === 0 ? (
            <div className="space-y-3">
              <p>Aún no hay widgets de chat. Crea uno e incrustalo en un sitio para empezar a recibir mensajes.</p>
              <button
                type="button"
                onClick={openCreateModal}
                className={pBtnPrimary}
              >
                <span className="material-icons text-base">add</span>
                Crear widget
              </button>
            </div>
          ) : (
            'Aún no hay conversaciones que coincidan con este filtro.'
          )}
        </div>
      ) : (
        <ul className={`divide-y ${pCard}`}>
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={`/portal/inbox/${c.id}`}
                className="flex items-start gap-3 p-3 hover:bg-accent transition-colors"
              >
                <span className="material-icons text-muted-foreground mt-0.5">
                  {c.channel === 'whatsapp' ? 'chat' : c.channel === 'instagram' ? 'photo_camera' : c.channel === 'messenger' ? 'forum' : c.channel === 'email' ? 'email' : 'language'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{c.visitorName || 'Visitante anónimo'}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{c.channel}</span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        c.status === 'open'
                          ? 'bg-green-100 text-green-800'
                          : c.status === 'assigned'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {c.visitorEmail || c.visitorId || 'Identidad desconocida'} · {c.aiMode.toUpperCase()} · {c.priority} prioridad
                  </div>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(c.lastMessageAt).toLocaleString()}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Create widget modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-2xl shadow-lg w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-display font-extrabold tracking-[-0.01em]">Crear widget de chat</h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <span className="material-icons text-lg">close</span>
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              Un widget de chat permite a los visitantes de tu sitio iniciar conversaciones en vivo. Elige a qué sitio vincularlo.
            </p>
            <div className="space-y-2">
              <label htmlFor="widget-site" className="text-sm font-medium">Sitio</label>
              {sites.length > 0 ? (
                <select
                  id="widget-site"
                  value={selectedSiteId}
                  onChange={(e) => setSelectedSiteId(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Selecciona un sitio…</option>
                  {sites.map((s) => (
                    <option key={s.id} value={String(s.id)}>{s.name}</option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No se han encontrado sitios.{' '}
                  <Link href="/portal/websites" className="underline hover:text-foreground" onClick={() => setShowCreateModal(false)}>
                    Crea un sitio primero.
                  </Link>
                </p>
              )}
            </div>
            {createError && (
              <p className="text-sm text-destructive">{createError}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className={pBtnGhost}
              >Cancelar</button>
              <button
                type="button"
                onClick={createWidget}
                disabled={!selectedSiteId || creating}
                className={pBtnPrimary}
              >
                {creating ? 'Creando…' : 'Crear widget'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
