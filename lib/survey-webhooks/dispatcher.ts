/**
 * Survey webhook dispatcher.
 *
 * Submissions enqueue one durable job per subscribed webhook in the same
 * transaction as the response. Each destination retries independently, so one
 * failed endpoint cannot replay successful deliveries to other endpoints.
 */

import { createHmac } from 'crypto';
import { db } from '@/lib/db';
import { enqueueJob, type JobExecutionContext, type JobQueueDatabase } from '@/lib/jobs';
import {
  surveyWebhooks,
  surveyWebhookDeliveries,
  surveyResponses,
  surveys,
} from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { assertSafeUrl } from '@/lib/ssrf-guard';
import { readResponseBodyPreview } from '@/lib/webhooks/read-response-body-preview';

export const REQUEST_TIMEOUT_MS = 8_000;
export const MAX_RESPONSE_BODY_LEN = 2_000;

export type SurveyResponseRow = typeof surveyResponses.$inferSelect;

export interface SurveyResponseEventPayload {
  event: 'response.submitted';
  surveyId: number;
  surveyTitle: string;
  surveySlug: string;
  responseId: number;
  formName: string;
  source: string | null;
  sourceId: string | null;
  respondentName: string | null;
  respondentEmail: string | null;
  answers: Record<string, unknown>;
  completedAt: string | null;
  deliveredAt: string;
}

export function signPayload(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

interface AttemptResult {
  status: 'success' | 'failed';
  statusCode?: number;
  responseBody?: string;
  error?: string;
}

/**
 * Single HTTP attempt. SSRF-checked at dispatch time (guards DNS rebinding
 * between registration and send) and bounded by REQUEST_TIMEOUT_MS.
 */
async function attemptDelivery(
  webhookId: number,
  url: string,
  secret: string | null,
  event: string,
  body: string,
  deliveryId: string,
): Promise<AttemptResult> {
  try {
    await assertSafeUrl(url);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-SD-Event': event,
      'X-SimplerDev-Event': event,
      'X-SimplerDev-Webhook-Id': String(webhookId),
      'X-SD-Delivery-Id': deliveryId,
    };
    if (secret) {
      const signature = signPayload(secret, body);
      // Spec says X-SD-Signature; mirror the project-webhook X-SimplerDev-* set
      // so existing tooling that consumes either prefix keeps working.
      headers['X-SD-Signature'] = `sha256=${signature}`;
      headers['X-SimplerDev-Signature'] = `sha256=${signature}`;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: ctrl.signal,
        // An attacker could register a safe URL that 302s to a private address.
        // Disable redirects; let the dispatcher record the 3xx as a failure.
        redirect: 'manual',
      });

      const respBody = await readResponseBodyPreview(res.body, MAX_RESPONSE_BODY_LEN);

      const ok = res.status >= 200 && res.status < 300;
      return {
        status: ok ? 'success' : 'failed',
        statusCode: res.status,
        responseBody: respBody,
        error: ok ? undefined : `HTTP ${res.status}`,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function surveyWebhookDeliveryDedupeKey(webhookId: number, responseId: number): string {
  return `survey.webhook_delivery:${webhookId}:${responseId}`;
}

/**
 * Enqueue one job per subscribed destination. The survey route awaits this in
 * the same transaction that stores the answer; external HTTP is deferred to cron.
 */
export async function dispatchSurveyResponseWebhooks(
  response: SurveyResponseRow & { surveyTitle: string; surveySlug: string },
  clientId: number,
  queueDb: JobQueueDatabase = db,
): Promise<void> {
  const hooks = await queueDb.select().from(surveyWebhooks)
    .where(and(
      eq(surveyWebhooks.surveyId, response.surveyId),
      eq(surveyWebhooks.enabled, true),
    ));
  const subscribed = hooks.filter(isSubscribed);
  if (subscribed.length === 0) return;

  const dispatchRequestedAt = new Date().toISOString();
  for (const webhook of subscribed) {
    await enqueueJob({
      clientId,
      type: 'survey.webhook_delivery',
      payload: {
        responseId: response.id,
        surveyId: response.surveyId,
        clientId,
        webhookId: webhook.id,
        dispatchRequestedAt,
      },
      dedupeKey: surveyWebhookDeliveryDedupeKey(webhook.id, response.id),
    }, queueDb);
  }
}

function positiveInteger(payload: Record<string, unknown>, field: string): number {
  const value = payload[field];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`survey.webhook_delivery: payload.${field} must be a positive integer`);
  }
  return value;
}

function isSubscribed(webhook: typeof surveyWebhooks.$inferSelect): boolean {
  const events = webhook.events ?? [];
  return events.length === 0 || events.includes('response.submitted') || events.includes('*');
}

/**
 * Internal-job handler. Each job represents one webhook/response pair and
 * performs one HTTP attempt. Queue retry/dead-letter state and the delivery
 * audit rows therefore describe the same attempt sequence.
 */
export async function runSurveyWebhookJob(
  payload: Record<string, unknown>,
  queueDb: typeof db,
  context: JobExecutionContext,
): Promise<void> {
  const responseId = positiveInteger(payload, 'responseId');
  const surveyId = positiveInteger(payload, 'surveyId');
  const clientId = positiveInteger(payload, 'clientId');
  const webhookId = positiveInteger(payload, 'webhookId');

  const [survey] = await queueDb.select({
    id: surveys.id,
    title: surveys.title,
    slug: surveys.slug,
    clientId: surveys.clientId,
  }).from(surveys)
    .where(and(eq(surveys.id, surveyId), eq(surveys.clientId, clientId)))
    .limit(1);
  if (!survey) return;

  const [response] = await queueDb.select().from(surveyResponses)
    .where(and(eq(surveyResponses.id, responseId), eq(surveyResponses.surveyId, surveyId)))
    .limit(1);
  if (!response) return;

  const [webhook] = await queueDb.select().from(surveyWebhooks).where(and(
    eq(surveyWebhooks.id, webhookId),
    eq(surveyWebhooks.surveyId, surveyId),
    eq(surveyWebhooks.enabled, true),
  )).limit(1);
  if (!webhook || !isSubscribed(webhook)) return;

  const event = 'response.submitted';
  const dispatchRequestedAt = typeof payload.dispatchRequestedAt === 'string' &&
    Number.isFinite(Date.parse(payload.dispatchRequestedAt))
    ? payload.dispatchRequestedAt
    : new Date().toISOString();
  const eventPayload: SurveyResponseEventPayload = {
    event,
    surveyId,
    surveyTitle: survey.title,
    surveySlug: survey.slug,
    responseId,
    formName: response.formName,
    source: response.source,
    sourceId: response.sourceId,
    respondentName: response.respondentName,
    respondentEmail: response.respondentEmail,
    answers: response.answers,
    completedAt: response.completedAt ? response.completedAt.toISOString() : null,
    deliveredAt: dispatchRequestedAt,
  };

  const result = await attemptDelivery(
    webhook.id,
    webhook.url,
    webhook.secret,
    event,
    JSON.stringify(eventPayload),
    `${webhook.id}:${responseId}`,
  );

  await queueDb.insert(surveyWebhookDeliveries).values({
    webhookId: webhook.id,
    event,
    attempt: context.attempt,
    status: result.status,
    statusCode: result.statusCode ?? null,
    requestBody: eventPayload as unknown as Record<string, unknown>,
    responseBody: result.responseBody ?? null,
    error: result.error ?? null,
  });

  await queueDb.update(surveyWebhooks).set({
    lastFiredAt: new Date(),
    lastStatus: result.statusCode ?? null,
    ...(result.status === 'success'
      ? { failureCount: 0 }
      : context.isFinalAttempt
        ? { failureCount: sql`${surveyWebhooks.failureCount} + 1` }
        : {}),
    updatedAt: new Date(),
  }).where(eq(surveyWebhooks.id, webhook.id));

  if (result.status === 'failed') {
    throw new Error(`Survey webhook ${webhook.id} delivery failed: ${result.error ?? 'unknown error'}`);
  }
}

/**
 * Generate a 64-char hex secret. Mirrors `lib/pm-webhooks.generateWebhookSecret`
 * — kept local to avoid coupling survey webhooks to project webhooks.
 */
export function generateWebhookSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
