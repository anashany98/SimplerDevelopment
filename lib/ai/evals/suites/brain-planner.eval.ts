/**
 * Eval suite — Brain planner (`lib/ai/brain-tools/planner.ts`).
 *
 * Plan-quality archetype: `generatePlan(message, intent, clientId)` returns
 * {steps, estimatedTools}. We measure (1) contract conformance, (2) that every
 * planned tool comes from the planner's allowlist (a hallucinated tool name
 * would crash the tool loop), and (3) that the plan mentions an expected tool
 * for the query. Like brain-classifier, it routes through the platform AI, so
 * live runs need --clientId; --mock scores canned outputs offline.
 */
import { z } from 'zod';
import { generatePlan, type AgentPlan } from '@/lib/ai/brain-tools/planner';
import type { BrainIntent } from '@/lib/ai/brain-tools/classifier';
import type { EvalSuite } from '../types';
import { zodConformance, predicate, latencyUnder } from '../scorers';

interface Input {
  message: string;
  intent: BrainIntent;
}
interface Expected {
  /** At least one of these tools must appear in the plan. */
  mustInclude: string[];
}

// The allowlist from the planner's system prompt — plans may only reference
// these tools. Keep in sync with planner.ts.
const ALLOWED_TOOLS = new Set([
  'brain_search',
  'brain_dashboard_summary',
  'brain_get_note',
  'brain_create_note',
  'brain_list_decisions',
  'brain_get_decision',
  'brain_list_people',
  'brain_lookup_glossary',
  'brain_list_glossary',
  'brain_list_initiatives',
  'brain_list_tasks',
  'brain_create_task',
]);

const agentPlanSchema = z.object({
  steps: z.array(z.object({
    action: z.string().min(1),
    tool: z.string().min(1),
    reasoning: z.string().min(1),
  })).max(5),
  estimatedTools: z.array(z.string()),
});

function labeled(
  id: string,
  message: string,
  intent: BrainIntent,
  mustInclude: string[],
  mockSteps: AgentPlan['steps'],
) {
  const mockTools = [...new Set(mockSteps.map((s) => s.tool))];
  return {
    id,
    input: { message, intent },
    expected: { mustInclude } satisfies Expected,
    mockOutput: { steps: mockSteps, estimatedTools: mockTools } as AgentPlan,
  };
}

const cases = [
  labeled(
    'plan-pricing-decision',
    'What did we decide about pricing and who owns the rollout?',
    'planning',
    ['brain_list_decisions'],
    [
      { action: 'Look up pricing decisions', tool: 'brain_list_decisions', reasoning: 'Decisions hold the pricing call and its owner' },
      { action: 'Find the owner on the team', tool: 'brain_list_people', reasoning: 'Need a person for the rollout owner' },
    ],
  ),
  labeled(
    'plan-account-summary',
    'Summarize everything we know about Acme Corp: decisions, people and notes.',
    'lookup',
    ['brain_search'],
    [
      { action: 'Search the workspace for Acme Corp', tool: 'brain_search', reasoning: 'Broad recall across notes, meetings and CRM' },
      { action: 'List related decisions', tool: 'brain_list_decisions', reasoning: 'Decisions about the account matter most' },
      { action: 'Find involved people', tool: 'brain_list_people', reasoning: 'Account contacts and owners' },
    ],
  ),
  labeled(
    'plan-onboarding-tasks',
    'Plan the new-hire onboarding: find the playbook and create the setup tasks.',
    'planning',
    ['brain_create_task'],
    [
      { action: 'Search for the onboarding playbook', tool: 'brain_search', reasoning: 'Playbook content drives the task list' },
      { action: 'Create the setup tasks', tool: 'brain_create_task', reasoning: 'Turn playbook steps into tracked tasks' },
    ],
  ),
] as const;

export const brainPlannerSuite: EvalSuite<Input, AgentPlan> = {
  id: 'brain-planner',
  description: 'Company Brain planner → ordered step plan with allowlisted tools.',
  cases: cases as unknown as EvalSuite<Input, AgentPlan>['cases'],
  scorers: [
    zodConformance<AgentPlan>(agentPlanSchema),
    predicate<Input, AgentPlan>('steps-in-range', (o) => {
      const ok = o.steps.length >= 2 && o.steps.length <= 5;
      return { pass: ok, detail: `got ${o.steps.length} steps, want 2-5` };
    }),
    predicate<Input, AgentPlan>('tools-allowlisted', (o) => {
      const bad = [...o.steps.map((s) => s.tool), ...o.estimatedTools].filter((t) => !ALLOWED_TOOLS.has(t));
      return { pass: bad.length === 0, detail: bad.length === 0 ? 'all tools allowlisted' : `unknown tools: ${bad.join(', ')}` };
    }),
    predicate<Input, AgentPlan>('expected-tool-present', (o, ctx) => {
      const exp = ctx.expected as Expected;
      const used = new Set([...o.steps.map((s) => s.tool), ...o.estimatedTools]);
      const hit = exp.mustInclude.some((t) => used.has(t));
      return { pass: hit, detail: hit ? 'expected tool present' : `missing one of: ${exp.mustInclude.join(', ')}` };
    }),
    latencyUnder(10_000),
  ],
  async run(input, env) {
    // generatePlan routes through the platform AI (completeObject + clientId
    // → resolveClientApiKey), so the suite needs --clientId, not a raw key.
    if (!env.clientId) throw new Error('brain-planner suite needs --clientId (routes through platform AI)');
    const output = await generatePlan(input.message, input.intent, env.clientId);
    return { output };
  },
};
