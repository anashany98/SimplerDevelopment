import { db } from '@/lib/db';
import { crmContacts } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { parseDisplayName } from '@/lib/crm/parse';
import type { Attribution } from '@/lib/attribution';

export { parseDisplayName };

export interface UpsertContactByEmailArgs {
  clientId: number;
  email: string;
  /** Display name from the email "From" header — "Jane Doe", "Jane Doe <jane@x.com>", or undefined. */
  displayName?: string;
  /** Defaults to 'email'. Set to override (e.g. 'crm-import'). */
  source?: string;
  companyId?: number;
  /**
   * First-touch attribution, when the caller has a request to read it from.
   * Only applied to NEWLY created contacts — see the note below on why an
   * existing contact is never re-attributed.
   */
  attribution?: Attribution | null;
}

export interface UpsertContactByEmailResult {
  contactId: number;
  /** True when a new row was inserted; false when an existing contact matched. */
  created: boolean;
}

/**
 * Upsert a CRM contact keyed on (clientId, lower(email)). Used by the brain
 * email pipeline to ensure every inbound sender has a contact row before
 * classification proposals reference it.
 *
 * Intentionally conservative: never modifies status/seniority/department on
 * an existing contact — those are review-queue decisions made downstream.
 * For new contacts, status keeps the schema default ('active'); a follow-up
 * `crm_contact_classify` review item proposes promotion to 'lead'/'customer'.
 *
 * `attribution` follows the same rule for a stronger reason: overwriting it on
 * a returning contact would silently convert first-touch into last-touch and
 * re-credit every existing lead to whatever campaign they most recently
 * clicked. Write-once is what makes the data mean anything.
 */
export async function upsertContactByEmail(args: UpsertContactByEmailArgs): Promise<UpsertContactByEmailResult> {
  const email = args.email.trim().toLowerCase();
  if (!email) throw new Error('upsertContactByEmail: email is required');

  const { firstName, lastName } = parseDisplayName(args.displayName, email);
  // Atomic upsert backed by crm_contacts_client_email_unique_idx (clientId,
  // email). onConflictDoNothing avoids the SELECT-then-INSERT race where two
  // concurrent callers both miss the SELECT and insert duplicate rows. The
  // returning clause is empty on conflict, so fall back to a SELECT to
  // resolve the pre-existing row (still tenant-scoped).
  const [inserted] = await db.insert(crmContacts).values({
    clientId: args.clientId,
    companyId: args.companyId ?? null,
    firstName,
    lastName,
    email,
    source: args.source ?? 'email',
    attribution: args.attribution ?? null,
  }).onConflictDoNothing({ target: [crmContacts.clientId, crmContacts.email] }).returning({ id: crmContacts.id });
  if (inserted) return { contactId: inserted.id, created: true };

  const [existing] = await db.select({ id: crmContacts.id }).from(crmContacts)
    .where(and(eq(crmContacts.clientId, args.clientId), eq(crmContacts.email, email)))
    .limit(1);
  if (existing) return { contactId: existing.id, created: false };

  // Extremely narrow window: row deleted between INSERT conflict and SELECT.
  // Retry once via a second insert attempt rather than throwing a confusing
  // "not found" to the caller.
  const [retried] = await db.insert(crmContacts).values({
    clientId: args.clientId,
    companyId: args.companyId ?? null,
    firstName,
    lastName,
    email,
    source: args.source ?? 'email',
    attribution: args.attribution ?? null,
  }).onConflictDoNothing({ target: [crmContacts.clientId, crmContacts.email] }).returning({ id: crmContacts.id });
  if (retried) return { contactId: retried.id, created: true };
  const [reread] = await db.select({ id: crmContacts.id }).from(crmContacts)
    .where(and(eq(crmContacts.clientId, args.clientId), eq(crmContacts.email, email)))
    .limit(1);
  if (!reread) throw new Error('upsertContactByEmail: contact vanished after conflict resolution');
  return { contactId: reread.id, created: false };
}
