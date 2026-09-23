/**
 * Automation Event Bus
 *
 * In-process pub/sub for automation triggers PLUS a durable journal. API routes
 * call `emitEvent()` after mutations; the engine runs matching rules in process for
 * instant execution, and every event is also journaled to `automation_jobs` and
 * marked completed once handlers finish. The process-automation-jobs cron
 * re-runs any event whose in-process dispatch was dropped (e.g. a serverless
 * cold-start) — at-least-once delivery + retries, replacing the old
 * fire-and-forget that silently lost events.
 */

import { db } from '@/lib/db';
import { automationJobs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export interface AutomationEvent {
  event: string;        // e.g. 'booking.created', 'crm.deal.updated'
  clientId: number;
  userId: number;
  payload: Record<string, unknown>;
  timestamp: Date;
}

type EventHandler = (event: AutomationEvent) => Promise<void>;

const handlers: EventHandler[] = [];

/**
 * Register a handler that runs for every emitted event.
 * Called once at app startup by the automation engine.
 */
export function onEvent(handler: EventHandler): void {
  handlers.push(handler);
}

/**
 * Persist the event before returning to the caller, then run handlers in the
 * background. The running row carries a lease so the cron cannot reclaim an
 * event while this process is still dispatching it.
 */
export async function emitEvent(
  event: string,
  clientId: number,
  userId: number,
  payload: Record<string, unknown>,
): Promise<void> {
  const automationEvent: AutomationEvent = { event, clientId, userId, payload, timestamp: new Date() };
  let jobId: number | null = null;
  try {
    const [row] = await db
      .insert(automationJobs)
      .values({
        clientId: automationEvent.clientId,
        event: automationEvent.event,
        userId: automationEvent.userId,
        payload: automationEvent.payload,
        status: 'running',
        nextRetryAt: new Date(Date.now() + 10 * 60_000),
      })
      .returning({ id: automationJobs.id });
    jobId = row?.id ?? null;
  } catch (err) {
    console.error(`[automation] journal insert failed for ${event}:`, err);
  }

  if (jobId === null) {
    // A completed business mutation must not turn into an HTTP error and invite
    // a duplicate retry just because its automation journal was unavailable.
    // Preserve the old best-effort inline dispatch; this exceptional path is
    // logged and cannot be recovered by the cron.
    void runHandlers(automationEvent).catch((err) =>
      console.error(`[automation] unjournaled dispatch failed for ${event}:`, err),
    );
    return;
  }

  // The durable row exists before the mutation endpoint can return. Handler
  // work continues independently while the lease prevents an early cron retry.
  void dispatchJournaledEvent(automationEvent, jobId);
}

/** Run all registered handlers for an event (no journaling). Used by the retry
 *  cron to re-process a dropped event. */
export async function runHandlers(event: AutomationEvent): Promise<void> {
  await Promise.all(handlers.map((h) => h(event)));
}

async function dispatchJournaledEvent(event: AutomationEvent, jobId: number): Promise<void> {
  // In-process dispatch — unchanged behavior; each handler isolated so one
  // failure doesn't sink the others.
  let allOk = true;
  await Promise.all(
    handlers.map((h) =>
      h(event).catch((err) => {
        allOk = false;
        console.error(`[automation] Handler error for ${event.event}:`, err);
      }),
    ),
  );

  // Mark done so the retry cron skips it. If the process died before reaching
  // here, the running lease expires and the cron reclaims the journal row.
  if (allOk) {
    await db
      .update(automationJobs)
      .set({ status: 'completed', processedAt: new Date(), nextRetryAt: null })
      .where(eq(automationJobs.id, jobId))
      .catch((err) => console.error(`[automation] journal completion failed for ${event.event}:`, err));
  } else {
    await db
      .update(automationJobs)
      .set({
        status: 'pending',
        attemptCount: 1,
        error: 'One or more in-process automation handlers failed',
        nextRetryAt: new Date(Date.now() + 60_000),
      })
      .where(eq(automationJobs.id, jobId))
      .catch((err) => console.error(`[automation] journal retry scheduling failed for ${event.event}:`, err));
  }
}

// ─── KNOWN EVENT TYPES (for NLP parser + UI reference) ─────────────────────

export const AUTOMATION_EVENTS = {
  // Booking
  'booking.created': 'A new booking page is created',
  'booking.guest_booked': 'A guest books a slot on a booking page',
  'booking.confirmed': 'A booking is confirmed',
  'booking.cancelled': 'A booking is cancelled',
  'booking.rescheduled': 'A booking is rescheduled',

  // CRM
  'crm.contact.created': 'A new CRM contact is created',
  'crm.contact.updated': 'A CRM contact is updated',
  'crm.deal.created': 'A new deal is created',
  'crm.deal.updated': 'A deal is updated (stage change, etc.)',
  'crm.deal.won': 'A deal is marked as won',
  'crm.deal.lost': 'A deal is marked as lost',

  // Email
  'email.campaign.sent': 'An email campaign is sent',
  'email.subscriber.added': 'A new subscriber joins a list',
  'email.subscriber.unsubscribed': 'A subscriber opts out',

  // Projects
  'project.created': 'A new project is created',
  'project.status.changed': 'A project status changes',
  'task.created': 'A kanban card/task is created',
  'task.completed': 'A kanban card/task is moved to done',
  'task.assigned': 'A task is assigned to someone',

  // Support
  'ticket.created': 'A support ticket is opened',
  'ticket.replied': 'A reply is added to a ticket',
  'ticket.resolved': 'A ticket is resolved',

  // Websites / Forms
  'form.submitted': 'A website form is submitted',
  'page.published': 'A website page is published',

  // Surveys
  'survey.response_submitted': 'A survey response is submitted',

  // Store / Orders
  'order.placed': 'A new order is placed',
  'order.paid': 'An order payment is received',
  'order.shipped': 'An order is shipped',
  'cart.abandoned': 'A cart with items is left inactive for over an hour',

  // Invoices
  'invoice.sent': 'An invoice is sent',
  'invoice.paid': 'An invoice is paid',
  'invoice.overdue': 'An invoice becomes overdue',

  // Proposals
  'proposal.sent': 'A proposal is sent to client',
  'proposal.viewed': 'A proposal is viewed',
  'proposal.accepted': 'A proposal is accepted',
  'proposal.declined': 'A proposal is declined',

  // Omnichannel inbox
  'conversation.created': 'A new channel conversation is created',
  'conversation.message_received': 'A normalized inbound message is received',
  'conversation.message_sent': 'An outbound channel message is sent',
  'conversation.assigned': 'A conversation is assigned to a user or team',
  'conversation.closed': 'A conversation is closed',
  'conversation.ai_handoff': 'AI escalates a conversation to a human',
  'channel.connected': 'A communication channel is connected',
  'channel.disconnected': 'A communication channel is disconnected',
  'channel.error': 'A communication channel enters an error state',
} as const;

export type AutomationEventType = keyof typeof AUTOMATION_EVENTS;
