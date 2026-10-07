import { and, eq, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { crmContacts } from '@/lib/db/schema';

export function normalizeEmail(value?: string): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.includes('@') ? normalized.slice(0, 320) : null;
}

export function normalizePhone(value?: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return `${trimmed.startsWith('+') ? '+' : ''}${digits}`;
}

export async function findExactContact(args: { clientId: number; email?: string; phone?: string }): Promise<number | null> {
  const email = normalizeEmail(args.email);
  const phone = normalizePhone(args.phone);
  if (!email && !phone) return null;
  const matches = await db.select({ id: crmContacts.id }).from(crmContacts)
    .where(and(
      eq(crmContacts.clientId, args.clientId),
      email && phone
        ? or(eq(crmContacts.email, email), eq(crmContacts.phone, phone))
        : email ? eq(crmContacts.email, email) : eq(crmContacts.phone, phone!),
    ))
    .limit(2);
  // Ambiguous exact keys are deliberately not auto-merged.
  return matches.length === 1 ? matches[0].id : null;
}

export function splitDisplayName(displayName: string | undefined, fallback: string): { firstName: string; lastName: string | null } {
  const parts = (displayName?.trim() || fallback).split(/\s+/).filter(Boolean);
  return { firstName: (parts.shift() || 'Unknown').slice(0, 100), lastName: parts.join(' ').slice(0, 100) || null };
}
