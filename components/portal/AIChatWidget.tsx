'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AgentHeader, AgentWelcome } from './AIChatAgentChrome';
import { ChatMessage } from './ai-chat/ChatMessage';
import { ChatComposer } from './ai-chat/ChatComposer';
import { ChatHistory } from './ai-chat/ChatHistory';
import type { ChatMessageItem, ChatConversation } from './ai-chat/types';
import { PORTAL_AGENT_PROFILES, getPortalAgent, getPortalAgentForPathname, type PortalAgentId } from '@/lib/ai/portal-agents';

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
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState<PortalAgentId | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prevCountRef = useRef(0);
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
    prevCountRef.current = 0;
  }, [pathname]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const isNearBottom = useCallback(() => {
    const el = scrollBoxRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  // Auto-scroll on new messages — only when the reader is already at the
  // bottom; otherwise surface a "jump to latest" affordance with a counter.
  useEffect(() => {
    if (!open || view !== 'chat') return;
    const grew = messages.length > prevCountRef.current;
    prevCountRef.current = messages.length;
    if (messages.length === 0) return;
    if (isNearBottom()) {
      scrollToBottom();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- keep the badge in sync with scroll position
      setUnseen(0);
    } else if (grew) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- count messages arriving while scrolled up
      setUnseen((u) => u + 1);
    }
  }, [messages, open, view, isNearBottom, scrollToBottom]);

  // Focus the composer when the floating panel opens.
  useEffect(() => {
    if (open && mode === 'floating') {
      const t = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, [open, mode]);

  // Esc closes the floating panel.
  useEffect(() => {
    if (mode !== 'floating' || !open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, open]);

  async function pollMessages(convId: number) {
    const res = await fetch(`/api/portal/ai/conversations/${convId}`);
    const data = await res.json();
    if (data.success) {
      const fresh: ChatMessageItem[] = data.data.messages.map((m: ChatMessageItem & { tool_calls?: typeof m.toolCalls }) => ({
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
    prevCountRef.current = 0;
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

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/portal/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationId,
          agentId: activeAgent.id,
        }),
        signal: controller.signal,
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
    } catch (err) {
      // A user-pressed "Detener" aborts the fetch — that's not a failure.
      if ((err as { name?: string })?.name === 'AbortError') return;
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'No se pudo contactar con el asistente. Comprueba tu conexión.',
        },
      ]);
    } finally {
      abortRef.current = null;
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  function stopMessage() {
    abortRef.current?.abort();
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

  return (
    <>
      {/* The dedicated Chat route owns the visible panel, so it does not need a second floating launcher. */}
      {mode === 'floating' && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="fixed bottom-2 right-2 sm:bottom-6 sm:right-6 z-50 min-w-14 h-14 px-4 rounded-full bg-gradient-to-br from-primary to-blue-600 text-primary-foreground shadow-lg shadow-primary/25 ring-1 ring-white/20 hover:shadow-xl hover:scale-[1.03] active:scale-95 transition-all flex items-center justify-center gap-2"
          title={activeAgent.name}
          aria-label={open ? 'Cerrar agente de IA' : `Abrir ${activeAgent.name}`}
        >
          <span className="material-icons text-2xl">{open ? 'close' : activeAgent.icon}</span>
          {!open && <span className="hidden sm:inline text-xs font-semibold max-w-32 truncate">{activeAgent.shortName}</span>}
        </button>
      )}

      {/* Chat panel — full-screen on mobile, floating card from `sm` up; embedded card in page mode. */}
      {open && (
        <div
          data-testid="portal-ai-chat-panel"
          className={mode === 'page'
            ? 'relative flex-1 min-h-[32rem] w-full bg-card border border-border rounded-2xl shadow-sm flex flex-col overflow-hidden'
            : 'fixed inset-0 sm:inset-auto sm:bottom-24 sm:right-6 z-50 w-full sm:w-[380px] sm:max-w-[380px] h-full sm:h-auto sm:max-h-[600px] bg-card sm:border sm:border-border rounded-none sm:rounded-3xl shadow-2xl sm:ring-1 sm:ring-black/5 flex flex-col overflow-hidden'}
        >
          <AgentHeader
            agent={activeAgent}
            profiles={PORTAL_AGENT_PROFILES}
            view={view}
            onSelectAgent={selectAgent}
            onToggleHistory={() => setView(view === 'history' ? 'chat' : 'history')}
            onNewConversation={startNewConversation}
            onClose={mode === 'floating' ? () => setOpen(false) : undefined}
          />

          {view === 'history' ? (
            <ChatHistory conversations={conversations} loading={loadingHistory} activeId={conversationId} onSelect={loadConversation} />
          ) : (
            <>
              {/* Messages */}
              <div
                ref={scrollBoxRef}
                role="log"
                aria-live="polite"
                aria-label="Conversación"
                onScroll={() => {
                  const near = isNearBottom();
                  setAtBottom(near);
                  if (near) setUnseen(0);
                }}
                className="relative flex-1 overflow-y-auto p-4 space-y-3 min-h-0"
              >
                {messages.length === 0 ? (
                  <AgentWelcome
                    agent={activeAgent}
                    onSuggestion={(suggestion) => {
                      setInput(suggestion);
                      inputRef.current?.focus();
                    }}
                  />
                ) : (
                  messages.map((msg, i) => <ChatMessage key={msg.id ?? i} msg={msg} agent={activeAgent} />)
                )}

                {loading && (
                  <div className="flex items-end gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="material-icons text-sm text-primary">{activeAgent.icon}</span>
                    </div>
                    <div className="bg-muted rounded-2xl rounded-tl-sm px-3 py-2.5 flex items-center gap-2">
                      <div className="flex gap-1 items-center h-4">
                        <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:0ms] motion-reduce:animate-none" />
                        <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:150ms] motion-reduce:animate-none" />
                        <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:300ms] motion-reduce:animate-none" />
                      </div>
                      <span className="text-[11px] text-muted-foreground">Escribiendo…</span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />

                {!atBottom && messages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      scrollToBottom();
                      setUnseen(0);
                      setAtBottom(true);
                    }}
                    aria-label="Ir al final"
                    title="Ir al final"
                    className="sticky bottom-1 left-1/2 -translate-x-1/2 z-10 h-8 min-w-8 px-2 rounded-full bg-card border border-border shadow-lg flex items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span className="material-icons text-base">arrow_downward</span>
                    {unseen > 0 && <span className="text-[10px] font-semibold text-primary tabular-nums">{unseen > 9 ? '9+' : unseen}</span>}
                  </button>
                )}
              </div>

              {/* Input */}
              {!activeAgent.handoffPath && (
                <ChatComposer
                  agent={activeAgent}
                  input={input}
                  onInputChange={setInput}
                  onSend={sendMessage}
                  onStop={stopMessage}
                  loading={loading}
                  backgroundLoading={backgroundLoading}
                  onBackgroundRun={runCeoInBackground}
                  inputRef={inputRef}
                />
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
