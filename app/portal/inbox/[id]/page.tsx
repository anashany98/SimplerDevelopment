'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pCard } from '@/components/portal/portal-ui';

interface Conversation {
  id: number;
  widgetId: number | null;
  visitorName: string | null;
  visitorEmail: string | null;
  channel: 'whatsapp' | 'instagram' | 'messenger' | 'webchat' | 'email';
  aiMode: 'ai' | 'human' | 'paused' | 'hybrid' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  tags: string[];
  status: 'open' | 'assigned' | 'closed';
  assignedUserId: number | null;
  lastMessageAt: string;
}

interface Message {
  id: number;
  conversationId: number;
  authorKind: 'visitor' | 'agent' | 'system';
  authorName: string | null;
  body: string;
  direction: 'inbound' | 'outbound';
  status: string;
  attachments: unknown[];
  occurredAt: string;
}

interface AiRun {
  id: number;
  messageId: number;
  status: string;
  decision: { answer?: string; confidence?: number; grounded?: boolean; action?: string; citations?: string[] } | null;
  provider: string | null;
  model: string | null;
}

export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const conversationId = Number.parseInt(id, 10);

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [aiRuns, setAiRuns] = useState<AiRun[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/portal/chat/conversations/${conversationId}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'No se pudo cargar la conversación');
    setConversation(json.data.conversation as Conversation);
    setMessages(json.data.messages as Message[]);
    setAiRuns((json.data.aiRuns ?? []) as AiRun[]);
  }, [conversationId]);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar'));
  }, [load]);

  // SSE — same inbox stream the list page uses; we filter to this conversation.
  useEffect(() => {
    if (!conversation) return;
    const es = new EventSource('/api/portal/chat/inbox-stream');
    const refetch = () => {
      void load();
    };
    es.addEventListener('message', (ev) => {
      try {
        const payload = JSON.parse((ev as MessageEvent).data);
        const m = payload?.data;
        if (m?.conversationId === conversationId && m?.id) {
          setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m as Message]));
        }
      } catch {
        refetch();
      }
    });
    es.addEventListener('conversation', (ev) => {
      try {
        const payload = JSON.parse((ev as MessageEvent).data);
        if (payload?.data?.conversationId === conversationId) refetch();
      } catch {
        refetch();
      }
    });
    return () => es.close();
  }, [conversation, conversationId, load]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const send = useCallback(async () => {
    if (!draft.trim() || sending) return;
    const body = draft.trim();
    setSending(true);
    setDraft('');
    try {
      const res = await fetch(`/api/portal/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'No se pudo enviar');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar');
    } finally {
      setSending(false);
    }
  }, [draft, sending, conversationId, load]);

  const action = useCallback(
    async (a: 'assign-self' | 'unassign' | 'close' | 'reopen' | 'ai-takeover' | 'human-takeover' | 'pause-ai') => {
      const res = await fetch(`/api/portal/chat/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: a }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message || 'No se pudo actualizar');
        return;
      }
      setConversation((c) => (c ? { ...c, ...(json.data as Conversation) } : c));
    },
    [conversationId],
  );

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/portal/inbox" className="hover:text-foreground inline-flex items-center gap-1">
          <span className="material-icons text-base">arrow_back</span>
          Bandeja de entrada
        </Link>
      </div>

      <PortalPageHeader eyebrow="Bandeja unificada" title="Conversación" />

      {error && <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">{error}</div>}

      {conversation && (
        <header className={`${pCard} p-4 flex items-center justify-between`}>
          <div>
            <div className="font-semibold flex items-center gap-2">
              <span className="material-icons">person</span>
              {conversation.visitorName || 'Visitante anónimo'}
            </div>
            <div className="text-xs text-muted-foreground">
              {conversation.visitorEmail || '—'} · {conversation.channel} · {conversation.status} · {conversation.aiMode.toUpperCase()}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {conversation.status !== 'closed' && conversation.aiMode !== 'ai' && (
              <button type="button" onClick={() => action('ai-takeover')} className={pBtnGhost} title="La IA solo puede enviar automáticamente respuestas fundamentadas y de alta confianza">
                <span className="material-icons text-base">smart_toy</span> IA
              </button>
            )}
            {conversation.status !== 'closed' && conversation.aiMode !== 'human' && (
              <button type="button" onClick={() => action('human-takeover')} className={pBtnGhost}>
                <span className="material-icons text-base">support_agent</span> Humano
              </button>
            )}
            {conversation.status !== 'closed' && conversation.aiMode !== 'paused' && (
              <button type="button" onClick={() => action('pause-ai')} className={pBtnGhost}>
                <span className="material-icons text-base">pause</span> Pausar IA
              </button>
            )}
            {conversation.status !== 'closed' && (
              <>
                {conversation.assignedUserId ? (
                  <button
                    type="button"
                    onClick={() => action('unassign')}
                    className={pBtnGhost}
                  >
                    <span className="material-icons text-base">person_remove</span>
                    Quitar asignación
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => action('assign-self')}
                    className={pBtnGhost}
                  >
                    <span className="material-icons text-base">person_add</span>
                    Asignármela
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => action('close')}
                  className={pBtnGhost}
                >
                  <span className="material-icons text-base">check_circle</span>Cerrar</button>
              </>
            )}
            {conversation.status === 'closed' && (
              <button
                type="button"
                onClick={() => action('reopen')}
                className={pBtnGhost}
              >
                <span className="material-icons text-base">refresh</span>
                Reabrir
              </button>
            )}
          </div>
        </header>
      )}

      <div className="rounded-2xl border border-border bg-muted/30 p-3 h-[480px] overflow-y-auto">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.direction === 'outbound' || m.authorKind === 'agent' ? 'justify-end' : 'justify-start'} mb-2`}
          >
            <div
              className={`max-w-[75%] px-3 py-2 rounded-lg ${
                m.direction === 'outbound' || m.authorKind === 'agent'
                  ? 'bg-primary text-primary-foreground'
                  : m.authorKind === 'system'
                  ? 'bg-amber-100 text-amber-900'
                  : 'bg-card border'
              }`}
            >
              <div className="text-[10px] opacity-70">
                {m.authorName || m.authorKind} · {new Date(m.occurredAt).toLocaleString()}
              </div>
              <div className="whitespace-pre-wrap break-words">{m.body}</div>
              <div className="mt-1 text-right text-[9px] opacity-60">{m.status}</div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {aiRuns.some((run) => run.status === 'review' && run.decision?.answer) && (
        <section className={`${pCard} space-y-3 p-4`}>
          <h2 className="flex items-center gap-2 text-sm font-semibold"><span className="material-icons text-base text-primary">auto_awesome</span>Borradores de IA pendientes de revisión</h2>
          {aiRuns.filter((run) => run.status === 'review' && run.decision?.answer).map((run) => (
            <div key={run.id} className="rounded-lg border border-border p-3 text-sm">
              <p className="whitespace-pre-wrap">{run.decision?.answer}</p>
              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>{Math.round((run.decision?.confidence ?? 0) * 100)}% de confianza · {run.decision?.grounded ? 'fundamentado' : 'no fundamentado'}</span>
                <button type="button" onClick={() => setDraft(run.decision?.answer ?? '')} className="rounded border border-border px-2 py-1 font-medium text-foreground">Usar borrador</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {conversation?.status !== 'closed' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Responder…"
            maxLength={8000}
            className="flex-1 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            className={pBtnPrimary}
          >
            <span className="material-icons text-base">send</span>Enviar</button>
        </form>
      )}
    </div>
  );
}
