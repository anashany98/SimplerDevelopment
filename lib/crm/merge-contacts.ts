import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  channelIdentities,
  chatConversations,
  conversationAuditLogs,
  crmActivities,
  crmContacts,
  crmContactTags,
  crmCustomFieldValues,
  crmDeals,
} from '@/lib/db/schema';

/** Explicit, audited merge. Never called by fuzzy identity resolution. */
export class ContactMergeNotFoundError extends Error {}

export async function mergeCrmContacts(args: { clientId: number; primaryId: number; secondaryId: number; actorUserId?: number }) {
  if (args.primaryId === args.secondaryId) throw new Error('Contacts must be different');
  const [primary] = await db.select().from(crmContacts).where(and(
    eq(crmContacts.id, args.primaryId), eq(crmContacts.clientId, args.clientId),
  ));
  const [secondary] = await db.select().from(crmContacts).where(and(
    eq(crmContacts.id, args.secondaryId), eq(crmContacts.clientId, args.clientId),
  ));
  if (!primary || !secondary) throw new ContactMergeNotFoundError('One or both contacts not found');

  return db.transaction(async (tx) => {
    await tx.update(crmActivities).set({ contactId: args.primaryId }).where(and(
      eq(crmActivities.clientId, args.clientId), eq(crmActivities.contactId, args.secondaryId),
    ));
    await tx.update(crmDeals).set({ contactId: args.primaryId }).where(and(
      eq(crmDeals.clientId, args.clientId), eq(crmDeals.contactId, args.secondaryId),
    ));
    await tx.update(channelIdentities).set({ contactId: args.primaryId, updatedAt: new Date() }).where(and(
      eq(channelIdentities.clientId, args.clientId), eq(channelIdentities.contactId, args.secondaryId),
    ));
    await tx.update(chatConversations).set({ contactId: args.primaryId, updatedAt: new Date() }).where(and(
      eq(chatConversations.clientId, args.clientId), eq(chatConversations.contactId, args.secondaryId),
    ));

    const primaryTags = await tx.select({ tagId: crmContactTags.tagId }).from(crmContactTags)
      .where(eq(crmContactTags.contactId, args.primaryId));
    const haveTags = new Set(primaryTags.map((row) => row.tagId));
    const secondaryTags = await tx.select({ tagId: crmContactTags.tagId }).from(crmContactTags)
      .where(eq(crmContactTags.contactId, args.secondaryId));
    const missingTags = secondaryTags.filter((row) => !haveTags.has(row.tagId));
    if (missingTags.length) await tx.insert(crmContactTags).values(missingTags.map((row) => ({ contactId: args.primaryId, tagId: row.tagId })));
    await tx.delete(crmContactTags).where(eq(crmContactTags.contactId, args.secondaryId));

    const primaryFields = await tx.select({ customFieldId: crmCustomFieldValues.customFieldId }).from(crmCustomFieldValues).where(and(
      eq(crmCustomFieldValues.entityId, args.primaryId), eq(crmCustomFieldValues.entityType, 'contact'),
    ));
    const haveFields = new Set(primaryFields.map((row) => row.customFieldId));
    const secondaryFields = await tx.select().from(crmCustomFieldValues).where(and(
      eq(crmCustomFieldValues.entityId, args.secondaryId), eq(crmCustomFieldValues.entityType, 'contact'),
    ));
    for (const field of secondaryFields) {
      if (!haveFields.has(field.customFieldId)) await tx.insert(crmCustomFieldValues).values({
        customFieldId: field.customFieldId, entityId: args.primaryId, entityType: 'contact', value: field.value,
      });
    }
    await tx.delete(crmCustomFieldValues).where(and(
      eq(crmCustomFieldValues.entityId, args.secondaryId), eq(crmCustomFieldValues.entityType, 'contact'),
    ));

    const fill: Partial<typeof crmContacts.$inferInsert> = { updatedAt: new Date() };
    if (!primary.email && secondary.email) fill.email = secondary.email;
    if (!primary.phone && secondary.phone) fill.phone = secondary.phone;
    if (!primary.title && secondary.title) fill.title = secondary.title;
    if (!primary.lastName && secondary.lastName) fill.lastName = secondary.lastName;
    if (!primary.source && secondary.source) fill.source = secondary.source;
    if (!primary.avatarUrl && secondary.avatarUrl) fill.avatarUrl = secondary.avatarUrl;
    if (!primary.address && secondary.address) fill.address = secondary.address;
    if (!primary.notes && secondary.notes) fill.notes = secondary.notes;
    if (!primary.companyId && secondary.companyId) fill.companyId = secondary.companyId;
    if (!primary.ownerId && secondary.ownerId) fill.ownerId = secondary.ownerId;
    const [updated] = await tx.update(crmContacts).set(fill).where(and(
      eq(crmContacts.id, args.primaryId), eq(crmContacts.clientId, args.clientId),
    )).returning();
    await tx.delete(crmContacts).where(and(
      eq(crmContacts.id, args.secondaryId), eq(crmContacts.clientId, args.clientId),
    ));
    await tx.insert(conversationAuditLogs).values({
      clientId: args.clientId, actorKind: args.actorUserId ? 'user' : 'system', actorUserId: args.actorUserId,
      action: 'contact.merged', details: { primaryId: args.primaryId, secondaryId: args.secondaryId },
    });
    return updated;
  });
}
