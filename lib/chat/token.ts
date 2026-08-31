/**
 * Visitor ephemeral tokens — HMAC-signed `${conversationId}.${expiresAt}`.
 *
 * Visitors don't have NextAuth sessions; the widget sends them this token
 * after `POST /api/public/chat/start` so subsequent calls
 * (`messages` POST, `stream` GET) can be scoped to a single conversation.
 *
 * Symmetric HMAC is sufficient — these tokens are only ever verified by
 * the same Next.js process. We don't need rotating asymmetric keys.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const TTL_MS = 24 * 60 * 60 * 1000; // 24h
const ATTACHMENT_TTL_MS = 15 * 60 * 1000;

function getSecret(): string {
  const configured = process.env.CHAT_TOKEN_SECRET || process.env.NEXTAUTH_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CHAT_TOKEN_SECRET or NEXTAUTH_SECRET is required in production');
  }
  return 'dev-chat-token-secret';
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('hex');
}

export function issueVisitorToken(conversationId: number, ttlMs: number = TTL_MS): string {
  const expiresAt = Date.now() + ttlMs;
  const payload = `${conversationId}.${expiresAt}`;
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export interface VerifiedVisitorToken {
  conversationId: number;
  expiresAt: number;
}

export function verifyVisitorToken(token: string | null | undefined): VerifiedVisitorToken | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [convStr, expStr, sig] = parts;
  const conversationId = Number.parseInt(convStr, 10);
  const expiresAt = Number.parseInt(expStr, 10);
  if (!Number.isInteger(conversationId) || conversationId <= 0) return null;
  if (!Number.isInteger(expiresAt) || expiresAt <= 0) return null;

  const expected = sign(`${convStr}.${expStr}`);
  // Both buffers must be the same length for timingSafeEqual.
  if (sig.length !== expected.length) return null;
  let ok = false;
  try {
    ok = timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return null;
  }
  if (!ok) return null;
  if (Date.now() > expiresAt) return null;
  return { conversationId, expiresAt };
}

/**
 * Attachment references are scoped to one visitor conversation.  The media
 * proxy URL itself is deliberately public so recipients can render an image,
 * but a visitor must not be able to attach another conversation's object just
 * by guessing its path.
 */
export function issueChatAttachmentToken(
  conversationId: number,
  pathname: string,
  ttlMs: number = ATTACHMENT_TTL_MS,
): string {
  const expiresAt = Date.now() + ttlMs;
  const encodedPath = Buffer.from(pathname, 'utf8').toString('base64url');
  const payload = `${conversationId}.${expiresAt}.${encodedPath}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyChatAttachmentToken(
  token: string | null | undefined,
  conversationId: number,
  pathname: string,
): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 4) return false;
  const [conversationIdText, expiresAtText, encodedPath, signature] = parts;
  if (Number.parseInt(conversationIdText, 10) !== conversationId) return false;
  const expiresAt = Number.parseInt(expiresAtText, 10);
  if (!Number.isInteger(expiresAt) || expiresAt <= Date.now()) return false;

  let tokenPath: string;
  try {
    tokenPath = Buffer.from(encodedPath, 'base64url').toString('utf8');
  } catch {
    return false;
  }
  if (tokenPath !== pathname) return false;

  const expected = sign(`${conversationIdText}.${expiresAtText}.${encodedPath}`);
  if (signature.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
