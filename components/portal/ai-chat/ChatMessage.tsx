'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';
import type { PortalAgentProfile } from '@/lib/ai/portal-agents';
import type { ChatMessageItem } from './types';
import { TOOL_LABELS, TOOL_FAILURE_LABELS } from './chat-tool-labels';

export function ToolChips({ toolCalls }: { toolCalls: { name: string; success?: boolean }[] }) {
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

function formatTime(createdAt?: string): string | null {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export function ChatMessage({ msg, agent }: { msg: ChatMessageItem; agent: PortalAgentProfile }) {
  const isUser = msg.role === 'user';
  const isInjected = !isUser && msg.injectedBy;
  const [copied, setCopied] = useState(false);
  const time = formatTime(msg.createdAt);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (non-secure context) — keep the button inert.
    }
  }

  return (
    <div className={`group flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div
          aria-hidden="true"
          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ring-1 ${
            isInjected
              ? 'bg-amber-100 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-900'
              : 'bg-primary/10 ring-primary/15'
          }`}
        >
          <span className={`material-icons text-sm ${isInjected ? 'text-amber-600 dark:text-amber-400' : 'text-primary'}`}>
            {isInjected ? 'support_agent' : agent.icon}
          </span>
        </div>
      )}

      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} gap-1 max-w-[85%] min-w-0`}>
        {!isUser && msg.toolCalls && msg.toolCalls.length > 0 && <ToolChips toolCalls={msg.toolCalls} />}

        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm break-words ${
            isUser
              ? 'bg-primary text-primary-foreground rounded-tr-sm shadow-sm'
              : isInjected
                ? 'bg-amber-50 border border-amber-200 text-foreground rounded-tl-sm dark:bg-amber-950/30 dark:border-amber-800'
                : 'bg-muted text-foreground rounded-tl-sm'
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
                p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                em: ({ children }) => <em className="italic">{children}</em>,
                ul: ({ children }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
                li: ({ children }) => <li>{children}</li>,
                pre: ({ children }) => (
                  <pre className="bg-black/5 dark:bg-white/10 rounded-lg p-2.5 my-1.5 overflow-x-auto">{children}</pre>
                ),
                code: ({ className, children }) => {
                  const isBlock = typeof className === 'string' && className.startsWith('language-');
                  if (isBlock) return <code className="font-mono text-xs">{children}</code>;
                  return <code className="bg-black/10 dark:bg-white/10 rounded px-1 py-0.5 text-xs font-mono">{children}</code>;
                },
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

        {(time || (!isUser && !isInjected)) && (
          <div className="flex items-center gap-2 px-1 h-4">
            {time && <span className="text-[10px] text-muted-foreground/70 tabular-nums">{time}</span>}
            {!isUser && !isInjected && (
              <button
                type="button"
                onClick={handleCopy}
                aria-label="Copiar mensaje"
                title={copied ? 'Copiado' : 'Copiar'}
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
              >
                <span className="material-icons text-xs">{copied ? 'check' : 'content_copy'}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
