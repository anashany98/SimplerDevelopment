// @vitest-environment node
/**
 * Unit tests for lib/automation/workflow-schedule.ts — the pure decision
 * logic behind the process-workflow-schedules cron.
 */
import { describe, it, expect } from 'vitest';
import {
  FIRING_WINDOW_MS,
  previousFireTime,
  shouldFireSchedule,
} from '@/lib/automation/workflow-schedule';

describe('previousFireTime', () => {
  it('returns the most recent slot strictly before now', () => {
    const now = new Date('2026-08-27T09:00:30Z');
    const prev = previousFireTime('0 9 * * *', now);
    expect(prev?.toISOString()).toBe('2026-08-27T09:00:00.000Z');
  });

  it('returns null for a malformed expression', () => {
    expect(previousFireTime('not-a-cron', new Date())).toBeNull();
  });
});

describe('shouldFireSchedule', () => {
  it('fires when the slot just passed and nothing fired yet', () => {
    const now = new Date('2026-08-27T09:00:30Z');
    expect(shouldFireSchedule('0 9 * * *', null, now)).toBe(true);
  });

  it('does not fire when the slot is too old (missed, not late)', () => {
    const now = new Date('2026-08-27T09:02:00Z'); // 2 min after the 09:00 slot
    expect(shouldFireSchedule('0 9 * * *', null, now)).toBe(false);
  });

  it('does not fire again for a slot already claimed', () => {
    const now = new Date('2026-08-27T09:00:45Z');
    const lastFiredAt = new Date('2026-08-27T09:00:00Z');
    expect(shouldFireSchedule('0 9 * * *', lastFiredAt, now)).toBe(false);
  });

  it('fires for the next slot after a previous one was claimed', () => {
    // Hourly cron: 09:00 slot claimed; at 10:00:30 the 10:00 slot is due.
    const now = new Date('2026-08-27T10:00:30Z');
    const lastFiredAt = new Date('2026-08-27T09:00:00Z');
    expect(shouldFireSchedule('0 * * * *', lastFiredAt, now)).toBe(true);
  });

  it('fires once per minute for a per-minute cron', () => {
    const now = new Date('2026-08-27T09:00:30Z');
    expect(shouldFireSchedule('* * * * *', null, now)).toBe(true);
    // Claimed the 09:00 slot.
    const afterClaim = shouldFireSchedule(
      '* * * * *',
      new Date('2026-08-27T09:00:00Z'),
      now,
    );
    expect(afterClaim).toBe(false);
    // Next minute is a fresh slot.
    expect(
      shouldFireSchedule(
        '* * * * *',
        new Date('2026-08-27T09:00:00Z'),
        new Date('2026-08-27T09:01:30Z'),
      ),
    ).toBe(true);
  });

  it('does not fire when now is before the first slot (fresh workflow)', () => {
    // Workflow activated at 08:00; the 09:00 slot hasn't happened yet, and the
    // previous slot (yesterday 09:00) is far outside the window.
    const now = new Date('2026-08-27T08:00:00Z');
    expect(shouldFireSchedule('0 9 * * *', null, now)).toBe(false);
  });

  it('fires for a weekly cron on the matching day', () => {
    // 2026-08-27 is a Thursday; `0 9 * * 1` fires Mondays. At 09:00:30 on a
    // Monday (2026-08-31) the slot is due.
    const monday = new Date('2026-08-31T09:00:30Z');
    expect(shouldFireSchedule('0 9 * * 1', null, monday)).toBe(true);
  });

  it('does not fire for a weekly cron on a non-matching day', () => {
    const thursday = new Date('2026-08-27T09:00:30Z');
    expect(shouldFireSchedule('0 9 * * 1', null, thursday)).toBe(false);
  });

  it('exposes a positive firing window', () => {
    expect(FIRING_WINDOW_MS).toBeGreaterThan(0);
    expect(FIRING_WINDOW_MS).toBe(90_000);
  });
});
