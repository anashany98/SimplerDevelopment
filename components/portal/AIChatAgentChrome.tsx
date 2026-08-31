import Link from 'next/link';
import type { PortalAgentId, PortalAgentProfile } from '@/lib/ai/portal-agents';

interface AgentHeaderProps {
  agent: PortalAgentProfile;
  profiles: readonly PortalAgentProfile[];
  view: 'chat' | 'history';
  onSelectAgent: (id: PortalAgentId) => void;
  onToggleHistory: () => void;
  onNewConversation: () => void;
}

export function AgentHeader({ agent, profiles, view, onSelectAgent, onToggleHistory, onNewConversation }: AgentHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-card">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span className="material-icons text-primary text-base">{agent.icon}</span>
        </div>
        <div className="min-w-0">
          <label htmlFor="portal-agent-select" className="sr-only">
            Agente de IA activo
          </label>
          <select
            id="portal-agent-select"
            value={agent.id}
            onChange={(event) => onSelectAgent(event.target.value as PortalAgentId)}
            className="block max-w-[190px] bg-transparent text-sm font-semibold text-foreground outline-none cursor-pointer truncate"
            aria-label="Agente de IA activo"
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground truncate">
            {agent.readOnly ? 'Diagnóstico y plan · solo lectura' : 'Especialista contextual'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onToggleHistory}
          className="p-1.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title={view === 'history' ? 'Volver al chat' : 'Historial de conversaciones'}
          aria-label={view === 'history' ? 'Volver al chat' : 'Historial de conversaciones'}
        >
          <span className="material-icons text-base">{view === 'history' ? 'arrow_back' : 'history'}</span>
        </button>
        <button onClick={onNewConversation} className="p-1.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Nueva conversación" aria-label="Nueva conversación">
          <span className="material-icons text-base">add_comment</span>
        </button>
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
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
        <span className="material-icons text-primary text-2xl">{agent.icon}</span>
      </div>
      <div className="px-3">
        <p className="text-sm font-medium text-foreground">{agent.name}</p>
        <p className="text-xs text-muted-foreground mt-1 text-pretty">{agent.description}</p>
        {agent.delegatesTo && (
          <p className="text-[11px] text-muted-foreground mt-2 text-pretty">
            Analiza y prioriza; tú decides cuándo abrir el especialista recomendado para ejecutar cada paso.
          </p>
        )}
      </div>
      {agent.handoffPath ? (
        <Link href={agent.handoffPath} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <span className="material-icons text-sm">open_in_new</span>
          Abrir agente dedicado
        </Link>
      ) : (
        <div className="flex flex-col gap-1.5 w-full mt-2">
          {agent.suggestions.map((suggestion) => (
            <button key={suggestion} onClick={() => onSuggestion(suggestion)} className="text-xs text-left px-3 py-2 rounded-lg bg-muted hover:bg-accent transition-colors text-foreground">
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
