'use client';

/**
 * Visitor-side chat UI rendered inside the widget iframe.
 *
 * Lifecycle:
 *   1. open → request a verified session from the host-page loader
 *   2. open SSE on /api/public/chat/stream
 *   3. visitor types → POST /api/public/chat/messages
 *
 * postMessage to parent window for resize / close. Material Icons via the
 * Google CDN (the iframe is its own document — we can include it freely).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface StartResponse {
  conversationId: number;
  widgetId: number;
  ephemeralToken: string;
  greetingMessage: string | null;
  primaryColor: string;
  position: string;
  awayMessage: string | null;
  displayName: string | null;
  logoUrl: string | null;
  avatarUrl: string | null;
  language: string;
  allowAttachments: boolean;
  showBranding: boolean;
  privacyLink: string | null;
}

interface Message {
  id: number;
  authorKind: 'visitor' | 'agent' | 'system';
  authorName: string | null;
  body: string;
  attachments?: Array<{ url: string; name: string; mimeType: string; size: number }>;
  occurredAt: string;
}

function postParent(message: unknown, targetOrigin: string) {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(message, targetOrigin);
    }
  } catch {
    // ignore
  }
}

export default function ChatBootstrap({
  parentOrigin = '',
}: {
  parentOrigin?: string;
}) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<StartResponse | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState<Array<{ url: string; name: string; mimeType: string; size: number }>>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Always-on Material Icons — self-hosted webfont injected once per iframe.
  // The widget iframe is served from our origin, so the relative /fonts URL
  // resolves to our app (not the embedding customer's site).
  useEffect(() => {
    if (document.getElementById('sd-chat-mi')) return;
    const style = document.createElement('style');
    style.id = 'sd-chat-mi';
    style.textContent =
      '@font-face{font-family:"Material Icons";font-style:normal;font-weight:400;font-display:block;src:url("/fonts/material-icons.woff2") format("woff2");}' +
      '.material-icons{font-family:"Material Icons";font-weight:normal;font-style:normal;font-size:24px;line-height:1;letter-spacing:normal;text-transform:none;display:inline-block;white-space:nowrap;word-wrap:normal;direction:ltr;font-feature-settings:"liga";-webkit-font-feature-settings:"liga";-webkit-font-smoothing:antialiased;}';
    document.head.appendChild(style);
  }, []);

  // Tell the parent loader to expand/collapse.
  useEffect(() => {
    postParent({ type: 'sd-chat:resize', expanded: open, width: 380, height: 560 }, parentOrigin || '*');
  }, [open, parentOrigin]);

  // The iframe never creates a session itself. The host-page loader performs
  // that cross-origin request so the server can validate the browser Origin,
  // then sends this opaque session back over a pinned postMessage channel.
  useEffect(() => {
    if (!parentOrigin) return;
    const receiveSession = (event: MessageEvent) => {
      if (event.origin !== parentOrigin || event.source !== window.parent) return;
      const data = event.data as { type?: string; session?: StartResponse; message?: string } | null;
      if (!data) return;
      if (data.type === 'sd-chat:error') {
        setError(data.message || 'No se pudo iniciar el chat');
        return;
      }
      if (data.type !== 'sd-chat:session' || !data.session
        || !Number.isInteger(data.session.conversationId)
        || typeof data.session.ephemeralToken !== 'string') return;
      setSession(data.session);
      setError(null);
      if (data.session.greetingMessage) {
        setMessages([{
          id: -1,
          authorKind: 'system',
          authorName: null,
          body: data.session.greetingMessage,
          occurredAt: new Date().toISOString(),
        }]);
      }
    };
    window.addEventListener('message', receiveSession);
    return () => window.removeEventListener('message', receiveSession);
  }, [parentOrigin]);

  useEffect(() => {
    if (!open || session) return;
    if (!parentOrigin) {
      setError('Este chat debe abrirse desde un sitio autorizado.');
      return;
    }
    postParent({ type: 'sd-chat:start' }, parentOrigin);
  }, [open, parentOrigin, session]);

  // SSE subscription — only after session is live.
  useEffect(() => {
    if (!session) return;
    const url = `/api/public/chat/stream?conversationId=${session.conversationId}&token=${encodeURIComponent(session.ephemeralToken)}`;
    const es = new EventSource(url);
    es.addEventListener('message', (ev) => {
      try {
        const payload = JSON.parse((ev as MessageEvent).data);
        const m = payload?.data;
        if (m && m.id) {
          setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m as Message]));
        }
      } catch {
        // drop
      }
    });
    es.addEventListener('hello', () => {
      // connected
    });
    es.onerror = () => {
      // EventSource auto-reconnects on transient failures.
    };
    return () => es.close();
  }, [session]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const send = useCallback(async () => {
    if (!session || (!draft.trim() && attachments.length === 0) || sending) return;
    const body = draft.trim();
    setSending(true);
    setDraft('');
    try {
      const res = await fetch('/api/public/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: session.conversationId,
          ephemeralToken: session.ephemeralToken,
          body,
          attachments,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'No se pudo enviar el mensaje');
      // Optimistically reflect — SSE will dedupe by id.
      setMessages((prev) => [...prev, json.data as Message]);
      setAttachments([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar el mensaje');
    } finally {
      setSending(false);
    }
  }, [attachments, draft, sending, session]);

  const upload = useCallback(async (file: File) => {
    if (!session) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('conversationId', String(session.conversationId));
      form.set('ephemeralToken', session.ephemeralToken);
      form.set('file', file);
      const response = await fetch('/api/public/chat/upload', {
        method: 'POST',
        headers: {
          'X-Chat-Conversation': String(session.conversationId),
          'X-Chat-Token': session.ephemeralToken,
        },
        body: form,
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || 'No se pudo subir el archivo');
      setAttachments((current) => [...current, body.data].slice(0, 5));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'No se pudo subir el archivo');
    } finally {
      setUploading(false);
    }
  }, [session]);

  const primary = session?.primaryColor || '#0070f3';

  if (!open) {
    return (
      <button
        type="button"
        aria-label="Open chat"
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          bottom: 0,
          right: 0,
          width: 72,
          height: 72,
          padding: 0,
          border: 'none',
          borderRadius: '50%',
          background: primary,
          color: 'white',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        }}
      >
        <span className="material-icons" style={{ fontSize: 32 }}>chat_bubble</span>
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'white',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: 14,
        color: '#111',
      }}
    >
      <header
        style={{
          background: primary,
          color: 'white',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontWeight: 600 }}>{session?.displayName || 'Chat en vivo'}</span>
        <button
          type="button"
          aria-label="Cerrar chat"
          onClick={() => {
            setOpen(false);
            postParent({ type: 'sd-chat:close' }, parentOrigin || '*');
          }}
          style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: 4 }}
        >
          <span className="material-icons">close</span>
        </button>
      </header>
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, background: '#f7f8fa' }}>
        {error && (
          <div style={{ background: '#fee', color: '#900', padding: 8, borderRadius: 8, marginBottom: 8, fontSize: 12 }}>
            {error}
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              display: 'flex',
              justifyContent: m.authorKind === 'visitor' ? 'flex-end' : 'flex-start',
              marginBottom: 8,
            }}
          >
            <div
              style={{
                maxWidth: '75%',
                padding: '8px 12px',
                borderRadius: 12,
                background: m.authorKind === 'visitor' ? primary : 'white',
                color: m.authorKind === 'visitor' ? 'white' : '#111',
                boxShadow: m.authorKind === 'visitor' ? 'none' : '0 1px 2px rgba(0,0,0,0.06)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {m.body}
              {m.attachments?.map((attachment) => (
                <a key={attachment.url} href={attachment.url} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 6, textDecoration: 'underline' }}>{attachment.name}</a>
              ))}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        style={{ display: 'flex', flexWrap: 'wrap', borderTop: '1px solid #eee', padding: 8, gap: 8, background: 'white' }}
      >
        {attachments.length > 0 && <div style={{ width: '100%', display: 'flex', gap: 4, flexWrap: 'wrap' }}>{attachments.map((attachment) => <button key={attachment.url} type="button" onClick={() => setAttachments((current) => current.filter((item) => item.url !== attachment.url))} style={{ border: '1px solid #ddd', borderRadius: 6, background: '#fff', padding: '3px 6px', fontSize: 11 }}>{attachment.name} ×</button>)}</div>}
        {session?.allowAttachments && <label aria-label="Adjuntar archivo" style={{ display: 'flex', alignItems: 'center', cursor: uploading ? 'wait' : 'pointer' }}><span className="material-icons">attach_file</span><input type="file" hidden disabled={uploading || attachments.length >= 5} accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ''; }} /></label>}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escribe un mensaje…"
          maxLength={4000}
          style={{
            flex: 1,
            border: '1px solid #ddd',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 14,
            outline: 'none',
          }}
          disabled={!session || sending}
        />
        <button
          type="submit"
          disabled={!session || (!draft.trim() && attachments.length === 0) || sending}
          aria-label="Enviar mensaje"
          style={{
            border: 'none',
            background: primary,
            color: 'white',
            borderRadius: 8,
            padding: '0 12px',
            cursor: !session || (!draft.trim() && attachments.length === 0) || sending ? 'not-allowed' : 'pointer',
            opacity: !session || (!draft.trim() && attachments.length === 0) || sending ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <span className="material-icons">send</span>
        </button>
      </form>
      {session?.showBranding && <div style={{ padding: '4px 8px', textAlign: 'center', fontSize: 10, color: '#777', background: 'white' }}>Con tecnología de CRM AGENTS{session.privacyLink ? <> · <a href={session.privacyLink} target="_blank" rel="noreferrer">Privacidad</a></> : null}</div>}
    </div>
  );
}
