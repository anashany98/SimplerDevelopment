import type {
  MessageSource,
  VisualEditorMessage,
} from '@/types/visual-editor';

const ALLOWED_ORIGINS = [
  'simplerdevelopment.com',
  '.simplerdevelopment.com',
  '.up.railway.app',
];

export function isValidOrigin(origin: string): boolean {
  // Allow localhost in development
  if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
    return true;
  }

  try {
    const url = new URL(origin);
    const hostname = url.hostname;
    return ALLOWED_ORIGINS.some((allowed) => {
      if (allowed.startsWith('.')) {
        return hostname.endsWith(allowed) || hostname === allowed.slice(1);
      }
      return hostname === allowed;
    });
  } catch {
    return false;
  }
}

export function createMessage<T>(
  source: MessageSource,
  type: string,
  payload: T,
): VisualEditorMessage<T> {
  return {
    source,
    type,
    payload,
    timestamp: Date.now(),
  };
}

export function isVisualEditorMessage(
  data: unknown,
): data is VisualEditorMessage {
  if (!data || typeof data !== 'object') return false;
  const msg = data as Record<string, unknown>;
  return (
    (msg.source === 'sd-editor-parent' || msg.source === 'sd-editor-iframe') &&
    typeof msg.type === 'string' &&
    typeof msg.timestamp === 'number'
  );
}

export function sendToIframe(
  iframe: HTMLIFrameElement | null,
  type: string,
  payload: unknown,
  targetOrigin?: string,
): void {
  if (!iframe?.contentWindow) return;
  const message = createMessage('sd-editor-parent', type, payload);
  iframe.contentWindow.postMessage(message, resolveIframeTargetOrigin(iframe, targetOrigin));
}

export function sendToParent(type: string, payload: unknown, parentOrigin?: string): void {
  if (typeof window === 'undefined' || !window.parent || window.parent === window) return;
  const message = createMessage('sd-editor-iframe', type, payload);
  window.parent.postMessage(message, resolveParentTargetOrigin(parentOrigin));
}

/**
 * Never broadcast editor content with '*': derive the iframe's origin from
 * its `src` (the preview may live on a tenant host, so same-origin cannot be
 * assumed). An explicit, validated `targetOrigin` always wins. Falls back to
 * the current origin only when the src is missing/unparseable — never '*'.
 */
function resolveIframeTargetOrigin(iframe: HTMLIFrameElement, explicit?: string): string {
  if (explicit && isValidOrigin(explicit)) return new URL(explicit).origin;
  try {
    const src = iframe.getAttribute('src') ?? iframe.src;
    if (src) {
      const origin = new URL(src, window.location.href).origin;
      if (isValidOrigin(origin)) return origin;
    }
  } catch {
    // fall through to the safe default below
  }
  return window.location.origin;
}

/**
 * Same rule in the other direction: target the embedding portal origin
 * (via document.referrer) instead of '*', so block content is never offered
 * to an unexpected ancestor frame. Both sides still validate inbound senders
 * with isValidOrigin — this only narrows the outbound audience.
 */
function resolveParentTargetOrigin(explicit?: string): string {
  if (explicit && isValidOrigin(explicit)) return new URL(explicit).origin;
  try {
    if (typeof document !== 'undefined' && document.referrer) {
      const origin = new URL(document.referrer).origin;
      if (isValidOrigin(origin)) return origin;
    }
  } catch {
    // fall through to the safe default below
  }
  return window.location.origin;
}
