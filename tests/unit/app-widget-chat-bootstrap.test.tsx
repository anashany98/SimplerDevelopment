// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — must precede component import
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// ---------------------------------------------------------------------------
// jsdom stubs: scrollIntoView, window.parent.postMessage
// ---------------------------------------------------------------------------

// jsdom never implements scrollIntoView — stub it so the ref effect doesn't throw.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// The component receives a session from the host-page loader over postMessage.
// In jsdom, window.parent === window, so install one stable parent object for
// both outgoing messages and incoming-event source validation.
const postMessageMock = vi.fn();
const parentWindow = { postMessage: postMessageMock } as unknown as Window;
Object.defineProperty(window, 'parent', {
  get: () => parentWindow,
  configurable: true,
});

// ---------------------------------------------------------------------------
// EventSource mock (jsdom has none)
// ---------------------------------------------------------------------------

type ESListener = (ev: MessageEvent) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  _listeners: Record<string, ESListener[]> = {};
  onerror: (() => void) | null = null;
  readyState = 1;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: ESListener) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(cb);
  }

  removeEventListener(type: string, cb: ESListener) {
    this._listeners[type] = (this._listeners[type] ?? []).filter((l) => l !== cb);
  }

  dispatchSSE(type: string, data: unknown) {
    const evt = { data: JSON.stringify(data) } as MessageEvent;
    for (const cb of this._listeners[type] ?? []) {
      cb(evt);
    }
  }

  close() {
    this.readyState = 2;
  }
}

// Install before component import
globalThis.EventSource = MockEventSource as unknown as typeof EventSource;

// ---------------------------------------------------------------------------
// Component under test (imported after mocks)
// ---------------------------------------------------------------------------

import ChatBootstrap from '@/app/widget/chat/chat-bootstrap';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FetchResponder = (url: string, init?: RequestInit) => unknown;

function installFetchMock(responder: FetchResponder) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = responder(url, init);
    return {
      ok: true,
      json: async () => body,
    } as unknown as Response;
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const sessionData = {
  conversationId: 42,
  widgetId: 7,
  ephemeralToken: 'tok_abc',
  greetingMessage: 'Hello! How can I help you?',
  primaryColor: '#ff6600',
  position: 'bottom-right',
  awayMessage: null,
};

function defaultFetch(url: string): unknown {
  if (url === '/api/public/chat/messages') {
    return {
      success: true,
      data: {
        id: 100,
        authorKind: 'visitor',
        authorName: null,
        body: 'Thanks!',
        occurredAt: new Date().toISOString(),
      },
    };
  }
  return {};
}

const HOST_ORIGIN = 'https://customer.example';

function renderWidget() {
  return render(<ChatBootstrap parentOrigin={HOST_ORIGIN} />);
}

function deliverSession(session: typeof sessionData = sessionData) {
  window.dispatchEvent(new MessageEvent('message', {
    origin: HOST_ORIGIN,
    source: parentWindow,
    data: { type: 'sd-chat:session', session },
  }));
}

// Open the widget and deliver the session a verified host loader would send.
async function openAndFlush() {
  const result = renderWidget();
  await act(async () => { fireEvent.click(screen.getByLabelText('Open chat')); });
  await act(async () => { deliverSession(); });
  await flush();
  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatBootstrap', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    postMessageMock.mockClear();
    installFetchMock(defaultFetch);
    // Reset scrollIntoView stub
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    MockEventSource.instances = [];
    // Re-stub scrollIntoView after restore
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = vi.fn();
    }
  });

  // ── Closed (bubble) state ──────────────────────────────────────────────────

  it('renders the open-chat button initially (closed state)', () => {
    renderWidget();
    expect(screen.getByLabelText('Open chat')).toBeTruthy();
  });

  it('does not render the chat panel when closed', () => {
    renderWidget();
    expect(screen.queryByText('Chat en vivo')).toBeNull();
  });

  it('chat bubble contains a chat_bubble icon', () => {
    renderWidget();
    const icons = document.querySelectorAll('span.material-icons');
    expect(Array.from(icons).some((el) => el.textContent === 'chat_bubble')).toBe(true);
  });

  it('applies default primary color #0070f3 as rgb to bubble before session', () => {
    renderWidget();
    const btn = screen.getByLabelText('Open chat') as HTMLButtonElement;
    // jsdom converts hex to rgb
    expect(btn.style.background).toMatch(/0070f3|0, 112, 243/);
  });

  // ── Opening the chat ───────────────────────────────────────────────────────

  it('clicking the bubble opens the chat panel', async () => {
    await openAndFlush();
    expect(screen.getByText('Chat en vivo')).toBeTruthy();
  });

  it('open state renders a close-chat button', async () => {
    await openAndFlush();
    expect(screen.getByLabelText('Cerrar chat')).toBeTruthy();
  });

  it('sends sd-chat:resize postMessage with expanded=true when opened', async () => {
    await openAndFlush();
    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sd-chat:resize', expanded: true }),
      HOST_ORIGIN,
    );
  });

  it('sends sd-chat:resize with expanded=false when closed', async () => {
    await openAndFlush();
    await act(async () => { fireEvent.click(screen.getByLabelText('Cerrar chat')); });
    await flush();
    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sd-chat:resize', expanded: false }),
      HOST_ORIGIN,
    );
  });

  it('sends sd-chat:close postMessage when close button is clicked', async () => {
    await openAndFlush();
    await act(async () => { fireEvent.click(screen.getByLabelText('Cerrar chat')); });
    await flush();
    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sd-chat:close' }),
      HOST_ORIGIN,
    );
  });

  it('closing the chat returns to bubble view', async () => {
    await openAndFlush();
    await act(async () => { fireEvent.click(screen.getByLabelText('Cerrar chat')); });
    await flush();
    expect(screen.getByLabelText('Open chat')).toBeTruthy();
    expect(screen.queryByText('Chat en vivo')).toBeNull();
  });

  // ── Host-verified session handoff ──────────────────────────────────────────

  it('asks the host loader to start a session and never calls start itself', async () => {
    const fetchMock = installFetchMock(defaultFetch);
    await openAndFlush();
    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sd-chat:start' }),
      HOST_ORIGIN,
    );
    expect(fetchMock).not.toHaveBeenCalledWith('/api/public/chat/start', expect.anything());
  });

  it('shows greeting message from session after open', async () => {
    await openAndFlush();
    expect(screen.getByText('Hello! How can I help you?')).toBeTruthy();
  });

  it('does not show greeting message when greetingMessage is null', async () => {
    renderWidget();
    await act(async () => { fireEvent.click(screen.getByLabelText('Open chat')); });
    await act(async () => { deliverSession({ ...sessionData, greetingMessage: null }); });
    expect(screen.queryByText('Hello! How can I help you?')).toBeNull();
  });

  it('applies primaryColor from session to header background', async () => {
    await openAndFlush();
    const header = document.querySelector('header') as HTMLElement;
    // primary from sessionData is '#ff6600' → jsdom stores as rgb
    expect(header.style.background).toMatch(/ff6600|255, 102, 0/);
  });

  it('shows an error sent by the verified host loader', async () => {
    renderWidget();
    await act(async () => { fireEvent.click(screen.getByLabelText('Open chat')); });
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: HOST_ORIGIN,
        source: parentWindow,
        data: { type: 'sd-chat:error', message: 'Widget not found' },
      }));
    });
    expect(screen.getByText('Widget not found')).toBeTruthy();
  });

  it('rejects a session message from another origin', async () => {
    renderWidget();
    await act(async () => { fireEvent.click(screen.getByLabelText('Open chat')); });
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: 'https://attacker.example',
        source: parentWindow,
        data: { type: 'sd-chat:session', session: sessionData },
      }));
    });
    await flush();
    expect(screen.queryByText('Hello! How can I help you?')).toBeNull();
  });

  it('does not request another session once one is established', async () => {
    await openAndFlush();
    const startsAfterFirst = postMessageMock.mock.calls.filter(([message]) => message.type === 'sd-chat:start').length;
    await act(async () => { fireEvent.click(screen.getByLabelText('Cerrar chat')); });
    await flush();
    await act(async () => { fireEvent.click(screen.getByLabelText('Open chat')); });
    await flush();
    const startsAfterSecond = postMessageMock.mock.calls.filter(([message]) => message.type === 'sd-chat:start').length;
    expect(startsAfterSecond).toBe(startsAfterFirst);
  });

  // ── SSE subscription ───────────────────────────────────────────────────────

  it('opens an EventSource after session is established', async () => {
    await openAndFlush();
    expect(MockEventSource.instances.length).toBeGreaterThan(0);
    const es = MockEventSource.instances[0];
    expect(es.url).toContain('/api/public/chat/stream');
    expect(es.url).toContain('conversationId=42');
  });

  it('SSE URL includes encoded ephemeralToken', async () => {
    await openAndFlush();
    const es = MockEventSource.instances[0];
    expect(es.url).toContain(encodeURIComponent('tok_abc'));
  });

  it('renders SSE message arriving in message list', async () => {
    await openAndFlush();
    const es = MockEventSource.instances[0];
    const incomingMsg = {
      data: {
        id: 99,
        authorKind: 'agent',
        authorName: 'Support',
        body: 'How can I help?',
        occurredAt: new Date().toISOString(),
      },
    };
    await act(async () => { es.dispatchSSE('message', incomingMsg); });
    expect(screen.getByText('How can I help?')).toBeTruthy();
  });

  it('deduplicates SSE messages with same id', async () => {
    await openAndFlush();
    const es = MockEventSource.instances[0];
    const msg = {
      data: {
        id: 55,
        authorKind: 'agent',
        authorName: null,
        body: 'Duplicate message',
        occurredAt: new Date().toISOString(),
      },
    };
    await act(async () => {
      es.dispatchSSE('message', msg);
      es.dispatchSSE('message', msg);
    });
    const allDupes = screen.queryAllByText('Duplicate message');
    expect(allDupes.length).toBe(1);
  });

  it('ignores SSE message events with malformed JSON', async () => {
    await openAndFlush();
    const es = MockEventSource.instances[0];
    const fakeEvt = { data: '{not valid json' } as MessageEvent;
    await act(async () => {
      for (const cb of es._listeners['message'] ?? []) {
        cb(fakeEvt);
      }
    });
    // Greeting should still be present, no crash
    expect(screen.getByText('Hello! How can I help you?')).toBeTruthy();
  });

  it('closes EventSource on unmount', async () => {
    const { unmount } = await openAndFlush();
    const es = MockEventSource.instances[0];
    unmount();
    expect(es.readyState).toBe(2);
  });

  // ── Sending messages ───────────────────────────────────────────────────────

  it('renders the message input when chat is open and session active', async () => {
    await openAndFlush();
    const input = screen.getByPlaceholderText('Escribe un mensaje…') as HTMLInputElement;
    expect(input).toBeTruthy();
  });

  it('input is disabled before session is established', async () => {
    globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    renderWidget();
    await act(async () => { fireEvent.click(screen.getByLabelText('Open chat')); });
    // Deliberately no flush — session never resolves
    const input = screen.getByPlaceholderText('Escribe un mensaje…') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it('typing into the input updates draft value', async () => {
    await openAndFlush();
    const input = screen.getByPlaceholderText('Escribe un mensaje…') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Hello there!' } });
    });
    expect(input.value).toBe('Hello there!');
  });

  it('submitting the form with a draft sends a message to API', async () => {
    const fetchMock = installFetchMock(defaultFetch);
    await openAndFlush();
    const input = screen.getByPlaceholderText('Escribe un mensaje…') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'Hi agent!' } }); });
    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => { fireEvent.submit(form); });
    await flush();
    const msgCall = fetchMock.mock.calls.find(([url]) => url === '/api/public/chat/messages');
    expect(msgCall).toBeTruthy();
    const body = JSON.parse((msgCall![1] as RequestInit).body as string);
    expect(body.body).toBe('Hi agent!');
    expect(body.conversationId).toBe(42);
  });

  it('clears draft input after sending', async () => {
    await openAndFlush();
    const input = screen.getByPlaceholderText('Escribe un mensaje…') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'Test draft' } }); });
    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => { fireEvent.submit(form); });
    await flush();
    expect(input.value).toBe('');
  });

  it('optimistically adds sent message to the list from API response', async () => {
    await openAndFlush();
    const input = screen.getByPlaceholderText('Escribe un mensaje…') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'My question here' } }); });
    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => { fireEvent.submit(form); });
    await flush();
    // API response body is "Thanks!"
    expect(screen.getByText('Thanks!')).toBeTruthy();
  });

  it('send button is disabled when draft is empty', async () => {
    await openAndFlush();
    const sendBtn = screen.getByLabelText('Enviar mensaje') as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(true);
  });

  it('send button is enabled when draft has text and session is active', async () => {
    await openAndFlush();
    const input = screen.getByPlaceholderText('Escribe un mensaje…') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'some text' } }); });
    const sendBtn = screen.getByLabelText('Enviar mensaje') as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(false);
  });

  it('does not send when draft is only whitespace', async () => {
    const fetchMock = installFetchMock(defaultFetch);
    await openAndFlush();
    const input = screen.getByPlaceholderText('Escribe un mensaje…') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: '   ' } }); });
    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => { fireEvent.submit(form); });
    await flush();
    const msgCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/public/chat/messages');
    expect(msgCalls.length).toBe(0);
  });

  it('shows error when send returns ok=false', async () => {
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/public/chat/messages') {
        return { ok: false, json: async () => ({ success: false, message: 'Send failed' }) } as unknown as Response;
      }
      return { ok: true, json: async () => defaultFetch(url, init) } as unknown as Response;
    }) as unknown as typeof fetch;
    await openAndFlush();
    const input = screen.getByPlaceholderText('Escribe un mensaje…') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'hello' } }); });
    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => { fireEvent.submit(form); });
    await flush();
    expect(screen.getByText('Send failed')).toBeTruthy();
  });

  it('shows error message when send fetch throws', async () => {
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/public/chat/messages') throw new Error('network error');
      return { ok: true, json: async () => defaultFetch(url, init) } as unknown as Response;
    }) as unknown as typeof fetch;
    await openAndFlush();
    const input = screen.getByPlaceholderText('Escribe un mensaje…') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'hello' } }); });
    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => { fireEvent.submit(form); });
    await flush();
    expect(screen.getByText('network error')).toBeTruthy();
  });

  // ── Material Icons font injection ──────────────────────────────────────────

  it('injects sd-chat-mi style element into document.head on mount', () => {
    renderWidget();
    const style = document.getElementById('sd-chat-mi');
    expect(style).toBeTruthy();
    expect(style?.textContent).toContain('Material Icons');
  });

  it('does not inject sd-chat-mi style if it already exists', () => {
    renderWidget();
    // Second render — id already exists, no duplicate
    const { unmount } = renderWidget();
    unmount();
    const styles = document.querySelectorAll('#sd-chat-mi');
    expect(styles.length).toBe(1);
  });

  // ── Message list rendering / alignment ────────────────────────────────────

  it('renders visitor messages aligned to flex-end', async () => {
    await openAndFlush();
    const input = screen.getByPlaceholderText('Escribe un mensaje…') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'Visitor msg' } }); });
    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => { fireEvent.submit(form); });
    await flush();
    // API returns {authorKind: 'visitor', body: 'Thanks!'}
    const msgContainer = screen.getByText('Thanks!').closest('div')?.parentElement;
    expect(msgContainer?.style.justifyContent).toBe('flex-end');
  });

  it('renders agent messages aligned to flex-start', async () => {
    await openAndFlush();
    const es = MockEventSource.instances[0];
    const agentMsg = {
      data: {
        id: 200,
        authorKind: 'agent',
        authorName: 'Agent',
        body: 'Agent reply here',
        occurredAt: new Date().toISOString(),
      },
    };
    await act(async () => { es.dispatchSSE('message', agentMsg); });
    const msgContainer = screen.getByText('Agent reply here').closest('div')?.parentElement;
    expect(msgContainer?.style.justifyContent).toBe('flex-start');
  });

  it('renders system messages aligned to flex-start', async () => {
    // Greeting from session data (authorKind: 'system') appears as flex-start
    await openAndFlush();
    const greetingEl = screen.getByText('Hello! How can I help you?');
    const container = greetingEl.closest('div')?.parentElement;
    expect(container?.style.justifyContent).toBe('flex-start');
  });

  // ── scrollIntoView called on message update ────────────────────────────────

  it('calls scrollIntoView when messages change', async () => {
    await openAndFlush();
    // Greeting sets messages — scrollIntoView should have been called
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  // ── waitFor-based session greeting ─────────────────────────────────────────

  it('greeting message appears after opening (waitFor variant)', async () => {
    renderWidget();
    fireEvent.click(screen.getByLabelText('Open chat'));
    await act(async () => { deliverSession(); });
    await waitFor(() => {
      expect(screen.getByText('Hello! How can I help you?')).toBeTruthy();
    });
  });
});
