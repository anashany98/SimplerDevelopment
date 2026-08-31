'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';
import { AgentHeader, AgentWelcome } from './AIChatAgentChrome';
import { PORTAL_AGENT_PROFILES, getPortalAgent, getPortalAgentForPathname, type PortalAgentId } from '@/lib/ai/portal-agents';

interface Message {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: { name: string; input: Record<string, unknown>; success?: boolean }[] | null;
  injectedBy?: number | null;
  createdAt?: string;
}

interface Conversation {
  id: number;
  title: string;
  updatedAt: string;
}

const TOOL_LABELS: Record<string, string> = {
  // Read tools
  get_dashboard_summary: 'Consultó el panel',
  get_my_projects: 'Buscó proyectos',
  get_project_board: 'Consultó el tablero',
  get_project_cards: 'Consultó las tarjetas',
  get_sprint_progress: 'Consultó el progreso del sprint',
  get_project_files: 'Buscó archivos',
  get_my_invoices: 'Consultó las facturas',
  get_invoice_details: 'Consultó el detalle de la factura',
  get_payment_methods: 'Consultó los métodos de pago',
  get_my_tickets: 'Consultó los tickets',
  get_ticket_details: 'Consultó el detalle del ticket',
  get_services_catalog: 'Exploró los servicios',
  get_my_services: 'Consultó las suscripciones',
  get_my_websites: 'Consultó las webs',
  get_website_pages: 'Consultó las páginas',
  get_website_categories: 'Consultó las categorías',
  get_website_tags: 'Consultó las etiquetas',
  get_website_media: 'Consultó los medios',
  get_my_hosted_sites: 'Consultó el alojamiento',
  get_my_email_campaigns: 'Consultó las campañas',
  get_my_email_lists: 'Consultó las listas de email',
  get_my_pitch_decks: 'Consultó los pitch decks',
  get_my_booking_pages: 'Consultó las páginas de reservas',
  get_bookings_for_page: 'Consultó las reservas',
  get_suggested_projects: 'Exploró los proyectos sugeridos',
  get_my_team: 'Consultó el equipo',
  get_my_profile: 'Consultó el perfil',
  get_inbox_channels: 'Consultó los canales',
  get_inbox_conversations: 'Consultó las conversaciones',
  get_inbox_conversation: 'Leyó la conversación',
  // Write tools
  create_support_ticket: 'Creó el ticket',
  reply_to_ticket: 'Respondió al ticket',
  add_card_comment: 'Añadió un comentario',
  create_website: 'Creó la web',
  create_website_page: 'Creó la página',
  publish_page: 'Actualizó la página',
  create_website_category: 'Creó la categoría',
  create_website_tag: 'Creó la etiqueta',
  request_service: 'Solicitó el servicio',
  request_suggested_project: 'Solicitó el proyecto',
  update_profile: 'Actualizó el perfil',
  invite_team_member: 'Invitó a un miembro',
  send_inbox_message: 'Respuesta en cola para aprobación',
  assign_inbox_conversation: 'Asignó la conversación',
  take_over_inbox_conversation: 'Asumió la conversación',
  pause_inbox_ai: 'Pausó la IA',
  return_inbox_conversation_to_ai: 'Reanudación de IA en cola para aprobación',
  close_inbox_conversation: 'Cerró la conversación',
  // Navigation
  navigate_to: 'Abriendo página',
  pay_invoice: 'Abriendo factura',
};

const TOOL_FAILURE_LABELS: Record<string, string> = {
  create_website: 'No se creó la web',
  create_website_page: 'No se creó la página',
};

function ToolChips({ toolCalls }: { toolCalls: { name: string; success?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-1 mt-1 mb-2">
      {toolCalls.map((tc, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
            tc.success === false
              ? 'bg-destructive/10 text-destructive'
              : 'bg-primary/10 text-primary'
          }`}
        >
          <span className="material-icons text-xs">
            {tc.success === false ? 'error_outline' : 'check_circle'}
          </span>
          {tc.success === false
            ? TOOL_FAILURE_LABELS[tc.name] ?? 'Acción fallida'
            : TOOL_LABELS[tc.name] ?? tc.name}
        </span>
      ))}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  const isInjected = !isUser && msg.injectedBy;

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} gap-1`}>
      {!isUser && msg.toolCalls && msg.toolCalls.length > 0 && <ToolChips toolCalls={msg.toolCalls} />}
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm break-words ${
          isUser ? 'bg-primary text-primary-foreground rounded-tr-sm' : isInjected ? 'bg-amber-50 border border-amber-200 text-foreground rounded-tl-sm dark:bg-amber-950/30 dark:border-amber-800' : 'bg-muted text-foreground rounded-tl-sm'
        }`}
      >
        {isInjected && (
          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-1 flex items-center gap-1">
            <span className="material-icons text-xs">support_agent</span>
            CRM AGENTS Team
          </p>
        )}
        {isUser ? (
          <span className="whitespace-pre-wrap">{msg.content}</span>
        ) : (
          <ReactMarkdown
            components={{
              p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
              em: ({ children }) => <em className="italic">{children}</em>,
              ul: ({ children }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
              li: ({ children }) => <li>{children}</li>,
              code: ({ children }) => <code className="bg-black/10 dark:bg-white/10 rounded px-1 py-0.5 text-xs font-mono">{children}</code>,
              a: ({ href, children }) => {
                const isInternal = href?.startsWith('/');
                if (isInternal) {
                  return (
                    <Link href={href!} className="underline font-medium text-primary hover:opacity-80 transition-opacity">
                      {children}
                    </Link>
                  );
                }
                return (
                  <a href={href} className="underline opacity-80 hover:opacity-100" target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                );
              },
            }}
          >
            {msg.content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}

export interface AIChatWidgetProps {
  /** `page` mounts the existing conversation experience as a full portal page. */
  mode?: 'floating' | 'page';
}

export default function AIChatWidget({ mode = 'floating' }: AIChatWidgetProps) {
  const router = useRouter();
  const pathname = usePathname();
  const contextualAgent = getPortalAgentForPathname(pathname);
  const [open, setOpen] = useState(() => mode === 'page');
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState<PortalAgentId | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeAgent = getPortalAgent(selectedAgentId) ?? contextualAgent;

  useEffect(() => {
    // Route changes deliberately hand control to the section specialist and
    // start a fresh context, so CRM history cannot bleed into Billing, Inbox,
    // or another narrower tool boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient chat scope on navigation
    setSelectedAgentId(null);
    setMessages([]);
    setConversationId(null);
    setView('chat');
  }, [pathname]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (open && messages.length > 0) scrollToBottom();
  }, [messages, open, scrollToBottom]);

  async function pollMessages(convId: number) {
    const res = await fetch(`/api/portal/ai/conversations/${convId}`);
    const data = await res.json();
    if (data.success) {
      const fresh: Message[] = data.data.messages.map((m: Message & { tool_calls?: typeof m.toolCalls }) => ({
        ...m,
        toolCalls: m.toolCalls ?? null,
      }));
      setMessages(fresh);
    }
  }

  useEffect(() => {
    if (!(open && view === 'history')) return;
    void (async () => {
      const res = await fetch('/api/portal/ai/conversations');
      const data = await res.json();
      if (data.success) setConversations(data.data);
      setLoadingHistory(false);
    })();
  }, [open, view]);

  // Poll for injected messages when chat is open
  useEffect(() => {
    if (open && conversationId) {
      pollRef.current = setInterval(() => {
        pollMessages(conversationId);
      }, 8000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open, conversationId]);

  async function loadConversation(convId: number) {
    const res = await fetch(`/api/portal/ai/conversations/${convId}`);
    const data = await res.json();
    if (data.success) {
      setMessages(data.data.messages);
      setConversationId(convId);
      setView('chat');
    }
  }

  function startNewConversation() {
    setMessages([]);
    setConversationId(null);
    setView('chat');
  }

  function selectAgent(id: PortalAgentId) {
    setSelectedAgentId(id);
    startNewConversation();
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setLoading(true);

    // Optimistically add user message
    setMessages((prev) => [...prev, { role: 'user', content: text }]);

    try {
      const res = await fetch('/api/portal/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationId,
          agentId: activeAgent.id,
        }),
      });
      const data = await res.json();

      if (data.success) {
        if (!conversationId) setConversationId(data.data.conversationId);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.data.reply,
            toolCalls: data.data.toolCalls?.length > 0 ? data.data.toolCalls : null,
          },
        ]);

        // Handle navigation tool calls
        const navCall = data.data.toolCalls?.find((tc: { name: string; input: Record<string, unknown> }) => tc.name === 'navigate_to' || tc.name === 'pay_invoice');
        if (navCall?.input?.path) {
          setTimeout(() => {
            router.push(navCall.input.path as string);
            // If there's a section to focus, dispatch a custom event
            if (navCall.input.section) {
              setTimeout(() => {
                const el = document.querySelector(`[data-focus-id="${navCall.input.section}"]`);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'transition-all');
                  setTimeout(() => el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'transition-all'), 3000);
                }
              }, 500);
            }
          }, 300);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.message || 'Algo salió mal. Inténtalo de nuevo.',
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'No se pudo contactar con el asistente. Comprueba tu conexión.',
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  async function runCeoInBackground() {
    const task = input.trim();
    if (!task || loading || backgroundLoading || activeAgent.id !== 'ceo') return;

    setInput('');
    setBackgroundLoading(true);
    try {
      const res = await fetch('/api/portal/ai/ceo/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      });
      const data = await res.json();
      if (!data.success) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.message || 'No se pudo iniciar el análisis en segundo plano.' },
        ]);
        return;
      }

      setConversationId(data.data.conversationId);
      setMessages([
        { role: 'user', content: task },
        {
          role: 'assistant',
          content: 'El Agente CEO está realizando el análisis en segundo plano. Puedes seguir trabajando: publicaré aquí el diagnóstico cuando termine.',
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'No se pudo iniciar el análisis en segundo plano. Comprueba tu conexión.' },
      ]);
    } finally {
      setBackgroundLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <>
      {/* The dedicated Chat route owns the visible panel, so it does not need a second floating launcher. */}
      {mode === 'floating' && (
        <button
          onClick={() => setOpen(!open)}
          className="fixed bottom-2 right-2 sm:bottom-6 sm:right-6 z-50 min-w-14 h-14 px-4 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
          title={activeAgent.name}
          aria-label={open ? 'Cerrar agente de IA' : `Abrir ${activeAgent.name}`}
        >
          <span className="material-icons text-2xl">{open ? 'close' : activeAgent.icon}</span>
          {!open && <span className="hidden sm:inline text-xs font-semibold max-w-32 truncate">{activeAgent.shortName}</span>}
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          data-testid="portal-ai-chat-panel"
          className={mode === 'page'
            ? 'relative flex-1 min-h-[32rem] w-full bg-card border border-border rounded-2xl shadow-sm flex flex-col overflow-hidden'
            : 'fixed bottom-20 right-2 sm:bottom-24 sm:right-6 z-50 w-[calc(100vw-1rem)] sm:w-[380px] max-w-[380px] max-h-[600px] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden'}
        >
          <AgentHeader agent={activeAgent} profiles={PORTAL_AGENT_PROFILES} view={view} onSelectAgent={selectAgent} onToggleHistory={() => setView(view === 'history' ? 'chat' : 'history')} onNewConversation={startNewConversation} />

          {/* History view */}
          {view === 'history' ? (
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground px-2 pb-1">Conversaciones recientes</p>
              {loadingHistory ? (
                <p className="text-xs text-muted-foreground text-center py-4">Cargando…</p>
              ) : conversations.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Todavía no hay conversaciones.</p>
              ) : (
                conversations.map((conv) => (
                  <button key={conv.id} onClick={() => loadConversation(conv.id)} className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-accent transition-colors ${conv.id === conversationId ? 'bg-accent' : ''}`}>
                    <p className="font-medium text-foreground truncate">{conv.title}</p>
                    <p className="text-xs text-muted-foreground">{new Date(conv.updatedAt).toLocaleDateString()}</p>
                  </button>
                ))
              )}
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {messages.length === 0 ? (
                  <AgentWelcome
                    agent={activeAgent}
                    onSuggestion={(suggestion) => {
                      setInput(suggestion);
                      inputRef.current?.focus();
                    }}
                  />
                ) : (
                  messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)
                )}

                {loading && (
                  <div className="flex items-start gap-2">
                    <div className="bg-muted rounded-2xl rounded-tl-sm px-3 py-2">
                      <div className="flex gap-1 items-center h-4">
                        <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              {!activeAgent.handoffPath && (
                <div className="border-t border-border p-3">
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={`Pregunta a ${activeAgent.shortName}…`}
                      rows={1}
                      disabled={loading || backgroundLoading}
                      className="flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 max-h-28 overflow-y-auto"
                      style={{ height: 'auto' }}
                      onInput={(e) => {
                        const el = e.currentTarget;
                        el.style.height = 'auto';
                        el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
                      }}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={loading || backgroundLoading || !input.trim()}
                      className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0"
                      aria-label="Enviar mensaje"
                    >
                      <span className="material-icons text-base">send</span>
                    </button>
                  </div>
                  {activeAgent.id === 'ceo' && (
                    <button
                      onClick={runCeoInBackground}
                      disabled={loading || backgroundLoading || !input.trim()}
                      className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary/30 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                    >
                      <span className={`material-icons text-sm ${backgroundLoading ? 'animate-spin' : ''}`}>
                        {backgroundLoading ? 'progress_activity' : 'schedule'}
                      </span>
                      {backgroundLoading ? 'Encolando análisis…' : 'Ejecutar análisis en segundo plano'}
                    </button>
                  )}
                  <p className="text-xs text-muted-foreground text-center mt-2">Enter para enviar · Shift+Enter para nueva línea</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
