import Link from 'next/link';
import type { PortalAgentId, PortalAgentProfile } from '@/lib/ai/portal-agents';

interface AgentHeaderProps {
  agent: PortalAgentProfile;
  profiles: readonly PortalAgentProfile[];
  view: 'chat' | 'history';
  onSelectAgent: (id: PortalAgentId) => void;
  onToggleHistory: () => void;
  onNewConversation: () => void;
  /** Floating mode on small screens renders full-screen; the header then offers an explicit close. */
  onClose?: () => void;
}

export function AgentHeader({ agent, profiles, view, onSelectAgent, onToggleHistory, onNewConversation, onClose }: AgentHeaderProps) {
  return (
    <div className="relative flex items-center justify-between gap-2 px-4 py-3 bg-[#0e0d0c] overflow-hidden">
      {/* Brand glow — mirrors the portal sidebar chrome (.portal-chrome-dark in globals.css). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(130px 120px at 16% 4%, rgba(37, 99, 235, 0.30), transparent 70%), radial-gradient(150px 130px at 96% 0%, rgba(16, 185, 129, 0.16), transparent 72%)',
        }}
      />
      <div className="relative flex items-center gap-2.5 min-w-0">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 ring-1 ring-white/20 flex items-center justify-center shrink-0">
          <span className="material-icons text-white text-base">{agent.icon}</span>
        </div>
        <div className="min-w-0">
          <label htmlFor="portal-agent-select" className="sr-only">
            Agente de IA activo
          </label>
          <select
            id="portal-agent-select"
            value={agent.id}
            onChange={(event) => onSelectAgent(event.target.value as PortalAgentId)}
            className="block max-w-[190px] bg-transparent text-sm font-semibold text-white outline-none cursor-pointer truncate appearance-none [&>option]:text-foreground [&>option]:bg-card"
            aria-label="Agente de IA activo"
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-white/60 truncate flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
            {agent.readOnly ? 'Diagnóstico y plan · solo lectura' : 'Especialista contextual'}
          </p>
        </div>
      </div>
      <div className="relative flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onToggleHistory}
          className="p-1.5 rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          title={view === 'history' ? 'Volver al chat' : 'Historial de conversaciones'}
          aria-label={view === 'history' ? 'Volver al chat' : 'Historial de conversaciones'}
        >
          <span className="material-icons text-base">{view === 'history' ? 'arrow_back' : 'history'}</span>
        </button>
        <button
          type="button"
          onClick={onNewConversation}
          className="p-1.5 rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          title="Nueva conversación"
          aria-label="Nueva conversación"
        >
          <span className="material-icons text-base">add_comment</span>
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors"
            title="Cerrar"
            aria-label="Cerrar chat"
          >
            <span className="material-icons text-base">close</span>
          </button>
        )}
      </div>
    </div>
  );
}

interface AgentWelcomeProps {
  agent: PortalAgentProfile;
  onSuggestion: (suggestion: string) => void;
}

export function AgentWelcome({ agent, onSuggestion }: AgentWelcomeProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-8 gap-3">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-primary/20 flex items-center justify-center">
        <span className="material-icons text-white text-2xl">{agent.icon}</span>
      </div>
      <div className="px-3">
        <p className="text-sm font-semibold text-foreground">{agent.name}</p>
        <p className="text-xs text-muted-foreground mt-1 text-pretty">{agent.description}</p>
        {agent.delegatesTo && (
          <p className="text-[11px] text-muted-foreground mt-2 text-pretty">
            Analiza y prioriza; tú decides cuándo abrir el especialista recomendado para ejecutar cada paso.
          </p>
        )}
      </div>
      {agent.handoffPath ? (
        <Link
          href={agent.handoffPath}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:bg-foreground/90 transition-colors"
        >
          <span className="material-icons text-sm">open_in_new</span>
          Abrir agente dedicado
        </Link>
      ) : (
        <div className="flex flex-col gap-1.5 w-full mt-2">
          {agent.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSuggestion(suggestion)}
              className="group text-xs text-left px-3.5 py-2.5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-colors text-foreground flex items-center justify-between gap-2"
            >
              <span>{suggestion}</span>
              <span className="material-icons text-sm text-muted-foreground/50 group-hover:text-primary transition-colors" aria-hidden="true">
                arrow_forward
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
