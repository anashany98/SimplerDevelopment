import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));

import { mapBackgroundAgentRun } from '@/lib/ai/background-agent-runs';

const createdAt = new Date('2026-08-31T10:00:00.000Z');

describe('mapBackgroundAgentRun', () => {
  it('uses the CEO for legacy CEO rows that have no agentId in their payload', () => {
    const run = mapBackgroundAgentRun({
      id: 1,
      type: 'ceo.background_analysis',
      payload: { task: 'Revisar riesgos generales' },
      status: 'pending',
      attemptCount: 0,
      createdAt,
      processedAt: null,
      nextRetryAt: null,
    });

    expect(run).toEqual(expect.objectContaining({ agentId: 'ceo', agentName: 'Agente CEO', task: 'Revisar riesgos generales' }));
  });

  it('keeps specialist status tenant-safe and falls back safely for a malformed agent id', () => {
    const run = mapBackgroundAgentRun({
      id: 2,
      type: 'agent.background_analysis',
      payload: { agentId: 'not-authorized', task: '  ' },
      status: 'dead_letter',
      attemptCount: 3,
      createdAt,
      processedAt: null,
      nextRetryAt: null,
    });

    expect(run).toEqual(expect.objectContaining({
      agentId: 'general',
      agentName: 'Supervisor',
      task: 'Análisis sin descripción disponible',
      status: 'dead_letter',
    }));
  });
});
