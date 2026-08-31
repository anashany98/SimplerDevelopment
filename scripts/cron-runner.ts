#!/usr/bin/env bun
/**
 * Self-hosted cron scheduler — replaces the Vercel Cron Jobs platform feature.
 *
 * Reads the same `crons` array from vercel.json (kept as the single source of
 * truth for schedules) and fires each endpoint on time with a Bearer token,
 * which `lib/cron-auth.ts` accepts in place of the `x-vercel-cron` header.
 *
 * Usage:
 *   bun scripts/cron-runner.ts
 *
 * Env:
 *   CRON_BASE_URL  base URL of the app (default http://localhost:3000)
 *   CRON_SECRET    required — must match the app's CRON_SECRET
 *
 * Runs forever; intended to be started as a service alongside the app (see the
 * `cron` service in docker-compose.yml).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CronExpressionParser } from 'cron-parser';

const BASE_URL = (process.env.CRON_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  console.error('[cron-runner] CRON_SECRET is not set — the app would reject every call. Refusing to start.');
  process.exit(1);
}

interface VercelCron {
  path: string;
  schedule: string;
}

interface Entry {
  path: string;
  schedule: string;
  next: number;
  firing: boolean;
}

const vercelJson = JSON.parse(
  readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'),
) as { crons?: VercelCron[] };

const crons = vercelJson.crons ?? [];
if (crons.length === 0) {
  console.error('[cron-runner] vercel.json has no `crons` entries — nothing to schedule.');
  process.exit(1);
}

function nextFireTime(schedule: string, from: Date): number {
  return CronExpressionParser.parse(schedule, { currentDate: from }).next().getTime();
}

const entries: Entry[] = crons.map((c) => ({
  path: c.path,
  schedule: c.schedule,
  next: nextFireTime(c.schedule, new Date()),
  firing: false,
}));

function ts(): string {
  return new Date().toISOString();
}

async function fire(entry: Entry): Promise<void> {
  if (entry.firing) {
    console.warn(`[${ts()}] SKIP ${entry.path} — previous run still in flight`);
    return;
  }
  entry.firing = true;
  const started = Date.now();
  try {
    const res = await fetch(`${BASE_URL}${entry.path}`, {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
      signal: AbortSignal.timeout(55_000),
    });
    console.log(`[${ts()}] ${res.status} ${entry.path} (${Date.now() - started}ms)`);
  } catch (err) {
    console.error(`[${ts()}] ERR  ${entry.path} — ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    entry.firing = false;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

console.log(`[cron-runner] scheduling ${entries.length} jobs against ${BASE_URL}`);

for (;;) {
  const now = Date.now();
  const due = entries.filter((e) => e.next <= now);
  if (due.length > 0) await Promise.allSettled(due.map((e) => fire(e)));
  // Recompute from now: a delayed run forfeits the missed tick instead of
  // firing repeatedly to "catch up" (same behaviour as Vercel's scheduler).
  for (const e of due) e.next = nextFireTime(e.schedule, new Date());
  const waitMs = Math.min(...entries.map((e) => e.next)) - Date.now();
  await sleep(Math.max(1_000, Math.min(waitMs, 30_000)));
}
