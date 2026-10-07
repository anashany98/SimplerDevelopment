import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Channel } from './types';

interface MetaOAuthState {
  clientId: number;
  userId: number;
  channel: Channel;
  exp: number;
  nonce: string;
}

function key(): string {
  const value = process.env.META_OAUTH_STATE_SECRET || process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error('META_OAUTH_STATE_SECRET or NEXTAUTH_SECRET is required');
  return value;
}

export function issueMetaOAuthState(state: MetaOAuthState): string {
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
  const signature = createHmac('sha256', key()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyMetaOAuthState(value: string): MetaOAuthState | null {
  const [payload, supplied] = value.split('.');
  if (!payload || !supplied) return null;
  const expected = createHmac('sha256', key()).update(payload).digest('base64url');
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as MetaOAuthState;
    if (!Number.isInteger(state.clientId) || !Number.isInteger(state.userId) || state.exp < Date.now()) return null;
    if (!['whatsapp', 'instagram', 'messenger'].includes(state.channel)) return null;
    return state;
  } catch {
    return null;
  }
}
