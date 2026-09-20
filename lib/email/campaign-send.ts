/**
 * Shared campaign-send execution.
 *
 * Resume-safe: queries emailCampaignSends to skip subscribers who already
 * received this campaign. Caller is responsible for gating/auth —
 * this module only does the dispatch loop + status transitions.
 *
 * A/B subject test:
 *   When `campaign.abEnabled` is true and `abSubjectB` is set, the first
 *   `abTestSizePct` of the (deterministically-ordered) recipient list is
 *   split evenly between subject A (`subject`) and subject B
 *   (`abSubjectB`). The remainder is held back; status flips to
 *   'ab_testing'. The email-ab-promote cron auto-promotes past the decision
 *   window; POST /api/portal/email/campaigns/[id]/promote-winner remains
 *   for manual (or forced) promotion — both aggregate per-variant counts,
 *   pick the winner by `abWinnerMetric`, and dispatch the held-back remainder.
 *
 * Non-A/B sends stream the list in id-cursor batches (minimal columns,
 * DB-ordered) instead of loading every subscriber row into memory.
 */

import { and, asc, eq, gt } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  emailCampaigns,
  emailCampaignSends,
  emailSubscribers,
} from '@/lib/db/schema';
import { buildCampaignHtml, buildUnsubscribeUrl } from './index';
import { getOrRenderCampaignHtml, htmlToText } from './render-cache';
import type { Block } from '@/types/blocks';
import { splitForAbTest, type AbVariant } from './subject-ab';
import { resolveResendKey } from './resolve-resend';
import { createEmailTransport, isMailpitEmailTransport, type EmailTransport } from './transport';

// Only what the dispatch loop reads — never SELECT * over the subscriber
// table (metadata/subscribedAt add up fast on large lists).
const subscriberCols = {
  id: emailSubscribers.id,
  email: emailSubscribers.email,
  unsubscribeToken: emailSubscribers.unsubscribeToken,
};
type DispatchRecipient = { id: number; email: string; unsubscribeToken: string };

// Batches per round-trip for the streaming (non-A/B) send path.
const SEND_BATCH_SIZE = 500;

export async function executeCampaignSend(
  campaignId: number,
  campaign: typeof emailCampaigns.$inferSelect,
): Promise<{ sent: number; failed: number; total: number; ab?: { phase: 'testing'; held: number } }> {
  const already = await db
    .select({ subscriberId: emailCampaignSends.subscriberId })
    .from(emailCampaignSends)
    .where(eq(emailCampaignSends.campaignId, campaignId));
  const sentIds = new Set(already.map(s => s.subscriberId));

  const abActive = !!(campaign.abEnabled && campaign.abSubjectB?.trim() && !campaign.abDecidedAt);

  // Resolve the email transport: platform config picks Mailpit (capture) vs
  // Resend; BYOK key first, platform key as fallback. campaign.clientId is
  // nullable (global / agency campaigns have no owner), so we fall back
  // gracefully. Resolved BEFORE the status flip below: a missing key must
  // throw while the campaign is still in its prior status, not strand it in
  // 'sending' (the portal route made this same call deliberately).
  let emailTransport: EmailTransport;
  if (await isMailpitEmailTransport()) {
    emailTransport = await createEmailTransport();
  } else if (campaign.clientId != null) {
    const { key } = await resolveResendKey(campaign.clientId);
    emailTransport = await createEmailTransport({ resendApiKey: key });
  } else {
    // Platform config resolves the key (admin setting → RESEND_API_KEY env) and
    // throws with an actionable message when nothing is configured.
    emailTransport = await createEmailTransport();
  }

  // When the campaign opted into the block builder, render once via the
  // sha256-keyed cache so we don't re-render per recipient. The cached HTML
  // contains a `{{UNSUBSCRIBE_URL}}` placeholder we substitute below.
  let cachedHtml: string | null = null;
  let cachedText: string | null = null;
  if (campaign.useBlockEditor && Array.isArray(campaign.contentBlocks)) {
    const result = await getOrRenderCampaignHtml(
      campaignId,
      campaign.contentBlocks as Block[],
      { previewText: campaign.previewText, subject: campaign.subject },
    );
    cachedHtml = result.html;
    cachedText = result.text;
  }

  let sent = 0;
  let failed = 0;
  let attempted = 0;

  // Flip to 'sending' lazily on the first real recipient — an empty list (or
  // a fully-resumed one) throws below with zero status transitions, so the
  // campaign is never stranded in 'sending' with nothing dispatched.
  let statusFlipped = false;
  async function flipToSending(): Promise<void> {
    if (statusFlipped) return;
    statusFlipped = true;
    await db
      .update(emailCampaigns)
      .set({ status: 'sending', updatedAt: new Date() })
      .where(eq(emailCampaigns.id, campaignId));
  }

  async function sendToRecipient(subscriber: DispatchRecipient, subject: string, variant: AbVariant | null): Promise<void> {
    attempted++;
    await flipToSending();
    try {
      const unsubscribeUrl = buildUnsubscribeUrl(subscriber.unsubscribeToken);
      const html = cachedHtml
        ? cachedHtml.replace(/\{\{UNSUBSCRIBE_URL\}\}/g, unsubscribeUrl)
        : buildCampaignHtml(campaign.htmlContent, unsubscribeUrl, campaign.previewText);
      const text = cachedText ?? htmlToText(html);
      const result = await emailTransport.send({
        from: `${campaign.fromName} <${campaign.fromEmail}>`,
        to: subscriber.email,
        subject,
        html,
        text,
        ...(campaign.replyTo ? { replyTo: campaign.replyTo } : {}),
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });
      await db.insert(emailCampaignSends).values({
        campaignId,
        subscriberId: subscriber.id,
        resendEmailId: result.data?.id ?? null,
        abVariant: variant,
        sentAt: new Date(),
      });
      sent++;
    } catch {
      failed++;
    }
  }

  // Base filter shared by both paths: active subscribers of this list.
  const listFilter = and(
    eq(emailSubscribers.listId, campaign.listId),
    eq(emailSubscribers.status, 'active'),
  );

  if (abActive) {
    // A/B mode needs the deterministically-ordered head of the list so the
    // same recipients land in the same cohort across re-runs — ordered in
    // the DB (never sort in JS), minimal columns only.
    const ordered = await db
      .select(subscriberCols)
      .from(emailSubscribers)
      .where(listFilter)
      .orderBy(asc(emailSubscribers.id));
    const targets = ordered.filter(s => !sentIds.has(s.id));
    if (targets.length === 0) throw new Error('No active subscribers remaining to send to');
    const split = splitForAbTest(targets, campaign.abTestSizePct ?? 10);
    for (const r of split.a) await sendToRecipient(r, campaign.subject, 'a');
    for (const r of split.b) await sendToRecipient(r, campaign.abSubjectB!, 'b');

    await db
      .update(emailCampaigns)
      .set({ status: 'ab_testing', sentAt: new Date(), totalRecipients: attempted, totalSent: sent, updatedAt: new Date() })
      .where(eq(emailCampaigns.id, campaignId));
    return {
      sent,
      failed,
      total: attempted,
      ab: { phase: 'testing', held: targets.length - attempted },
    };
  }

  // Standard mode streams the list in id-cursor batches (minimal columns,
  // DB-ordered) instead of loading every subscriber row into memory. Resume
  // stays safe: already-sent ids are skipped per batch via the sends table
  // snapshot taken above.
  let lastId = 0;
  for (;;) {
    const batch: DispatchRecipient[] = await db
      .select(subscriberCols)
      .from(emailSubscribers)
      .where(and(listFilter, gt(emailSubscribers.id, lastId)))
      .orderBy(asc(emailSubscribers.id))
      .limit(SEND_BATCH_SIZE);
    if (batch.length === 0) break;
    lastId = batch[batch.length - 1].id;
    for (const subscriber of batch) {
      if (sentIds.has(subscriber.id)) continue;
      await sendToRecipient(subscriber, campaign.subject, null);
    }
  }
  if (attempted === 0) throw new Error('No active subscribers remaining to send to');

  await db
    .update(emailCampaigns)
    .set({ status: 'sent', sentAt: new Date(), totalRecipients: attempted, totalSent: sent, updatedAt: new Date() })
    .where(eq(emailCampaigns.id, campaignId));

  return { sent, failed, total: attempted };
}
