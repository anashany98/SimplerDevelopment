'use client';

import type { RefObject } from 'react';
import type { PortalAgentProfile } from '@/lib/ai/portal-agents';

interface ChatComposerProps {
  agent: PortalAgentProfile;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  /** Aborts the in-flight request; only shown while `loading` is true. */
  onStop: () => void;
  loading: boolean;
  backgroundLoading: boolean;
  onBackgroundRun: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}

export function ChatComposer({
  agent,
  input,
  onInputChange,
  onSend,
  onStop,
  loading,
  backgroundLoading,
  onBackgroundRun,
  inputRef,
}: ChatComposerProps) {
  const busy = loading || backgroundLoading;

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  return (
    <div className="border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex items-end gap-2 rounded-2xl border border-border bg-background px-2.5 py-2 transition-shadow focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/50">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Pregunta a ${agent.shortName}…`}
          rows={1}
          disabled={busy}
          className="flex-1 resize-none bg-transparent px-1 py-1 text-sm focus:outline-none disabled:opacity-50 max-h-28 overflow-y-auto"
          style={{ height: 'auto' }}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
          }}
        />
        {loading ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Detener respuesta"
            title="Detener"
            className="w-9 h-9 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-accent flex items-center justify-center shrink-0 transition-colors"
          >
            <span className="material-icons text-base">stop</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={busy || !input.trim()}
            aria-label="Enviar mensaje"
            className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-blue-600 text-primary-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-40 transition-all shrink-0"
          >
            <span className="material-icons text-base">send</span>
          </button>
        )}
      </div>

      {agent.id === 'ceo' && (
        <button
          type="button"
          onClick={onBackgroundRun}
          disabled={busy || !input.trim()}
          className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-primary/30 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
        >
          <span className={`material-icons text-sm ${backgroundLoading ? 'animate-spin' : ''}`}>
            {backgroundLoading ? 'autorenew' : 'schedule'}
          </span>
          {backgroundLoading ? 'Encolando análisis…' : 'Ejecutar análisis en segundo plano'}
        </button>
      )}

      <p className="text-[11px] text-muted-foreground text-center mt-2">Enter para enviar · Shift+Enter para nueva línea</p>
    </div>
  );
}
