'use client';

import type { ChatConversation } from './types';

interface ChatHistoryProps {
  conversations: ChatConversation[];
  loading: boolean;
  activeId: number | null;
  onSelect: (id: number) => void;
}

export function ChatHistory({ conversations, loading, activeId, onSelect }: ChatHistoryProps) {
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-1">
      <p className="text-xs font-medium text-muted-foreground px-2 pb-1">Conversaciones recientes</p>
      {loading ? (
        <p className="text-xs text-muted-foreground text-center py-4">Cargando…</p>
      ) : conversations.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">Todavía no hay conversaciones.</p>
      ) : (
        conversations.map((conv) => (
          <button
            key={conv.id}
            type="button"
            onClick={() => onSelect(conv.id)}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors flex items-start gap-2.5 ${
              conv.id === activeId ? 'bg-primary/10' : 'hover:bg-accent'
            }`}
          >
            <span className="material-icons text-base text-muted-foreground mt-0.5" aria-hidden="true">chat_bubble_outline</span>
            <span className="min-w-0 flex-1">
              <p className="font-medium text-foreground truncate">{conv.title}</p>
              <p className="text-[11px] text-muted-foreground">
                {new Date(conv.updatedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </span>
          </button>
        ))
      )}
    </div>
  );
}
