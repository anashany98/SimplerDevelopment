# Learning Mastra (taught through this repo)

This is a learning guide for **Mastra**, the TypeScript AI-agent framework, taught by
mapping its concepts onto the files already in this project. We're on
**`@mastra/core ^1.46`** (the v1 line). The default weather scaffold was removed —
every primitive below is taught through the real Brain/portal agents instead.

> ⚠️ APIs shift between Mastra versions. Verify anything here against the docs for our
> exact version, and load the project `mastra` skill before building. The code references
> below are ground-truth from this repo as of writing.

---

## What Mastra is

Open-source, **TypeScript-native** framework for AI agents, workflows, and RAG. Not a
Python port — schemas are Zod, runs on any Node runtime, ships a local dev UI
(**Mastra Studio**, `localhost:4111`). Hit 1.0 in Jan 2026.

Everything is assembled in one composition root: **`src/mastra/index.ts`**, a single
`new Mastra({...})` that registers agents, workflows, scorers, storage, logging, and
observability. **Rule (`AGENTS.md`): register everything there** — nothing is live until
it's wired in.

---

## The six primitives (all present in this repo)

### 1. Agent — `src/mastra/agents/brain-agent.ts`
`instructions + model + tools + memory + scorers`. You give it a goal in natural
language; it decides which tools to call, when, and when it's done.

```ts
export const brainAgent = new Agent({
  id: 'brain-agent',
  instructions: `You are the Company Brain assistant...`, // the system prompt = product logic
  model: MAIN_MODEL,   // 'anthropic/claude-sonnet-4-6' (overridable via SD_BRAIN_MODEL)
  tools: async () => await sdTools(),   // pulled live from the portal MCP server
  memory: new Memory(),
  scorers: { toolGroundingScorer, groundednessScorer },
});
```

- **`model` is just a string.** The router maps `provider/model` to 3,000+ models across
  ~90 providers. Swap providers by editing one string (+ the provider's API key in `.env`).
- **`instructions` is the highest-leverage thing you own** — it's most of the behavior.

### 2. Tool — via MCP (`src/mastra/mcp/sd-mcp.ts`)
Our tools aren't hand-declared functions — they're the portal's MCP catalogue,
loaded live (`MCPClient.listTools()`). Same contract the model sees (schema +
description), zero re-implementation. `description` fields remain **prompt
engineering, not docs** — they're how the model decides what to pass and when
to call. Prefer the narrow `brain:read` slice: a full-scope key exposes ~450
tools, which bloats the prompt and dilutes tool selection.

### 3. Workflow — `src/mastra/workflows/brain-workflow.ts`
Agents are non-deterministic; **workflows are deterministic** — explicit steps, branching,
parallelism, loops, pause-for-human-approval. Built from `createStep` + `createWorkflow`;
each step has its own `inputSchema`/`outputSchema` so steps type-check like a pipeline.
Ours runs classify → plan → tool-loop → groundedness check.

**Agent vs workflow:** agent = open-ended ("answer anything about the workspace");
workflow = fixed process ("classify → plan → act → verify", same every time). They
compose — a workflow step can call an agent, and an agent can run a workflow as a tool.

### 4. Memory — `new Memory()` in the agent
Persistence across turns (conversation history; optionally semantic recall + working
memory). Backed by storage — Postgres here (see index.ts), so memory survives
redeploys; the parent app scopes it per tenant via the resourceId key.

### 5. Scorers — `src/mastra/scorers/brain-scorer.ts`
Mastra's **eval** layer. Each scorer auto-grades outputs (here: tool grounding +
groundedness). `sampling: { type: 'ratio', rate: 1 }` = score 100% of runs.
Results show in Studio — the "are my prompt changes actually better?" feedback loop.

### 6. Storage + Observability — `src/mastra/index.ts`
- **Storage:** Postgres (`PostgresStore`, same `DATABASE_URL` as the parent app
  or `MASTRA_DATABASE_URL`) — memory, evals, traces survive redeploys.
- **Observability:** OTel-style tracing with a `SensitiveDataFilter` (redacts
  passwords/tokens) + exporter to Mastra's hosted platform if `MASTRA_PLATFORM_ACCESS_TOKEN`
  is set.

---

## The mental model: the agent loop

The one concept to truly understand.

```
user message
   ↓
[ model reads: instructions + memory + available tool schemas ]
   ↓
model decides: respond directly  OR  call a tool
   ↓ (if tool)
execute tool → feed result back into the model
   ↓
loop until the model decides it's done → final answer (streamed or whole)
```

Everything else — memory, RAG, scorers, MCP — is about **what context goes into that loop**
and **how you measure what comes out**. "Context engineering" is the actual craft.

---

## Try it

```bash
bun dev   # = "mastra dev"
```

Open **`localhost:4111`** (Mastra Studio): chat with the Brain agent, watch each tool call + the
trace, run the workflow, see scorer results. **Learn by mutating the agents** — tighten
`instructions`, narrow the MCP tool slice in `sd-mcp.ts`, add a step to the workflow,
watch the loop change in Studio.

---

## Resources (best-first)

**Official**
- Docs home — https://mastra.ai/docs
- Quickstart — https://mastra.ai/guides/getting-started/quickstart
- **Free ~90-min course "Build Your First Agent in TypeScript"** — https://mastra.ai/blog/build-your-first-agent-course
- Agents overview — https://mastra.ai/docs/agents/overview
- Blog — https://mastra.ai/blog (e.g. The Agent Prototype Playbook — https://mastra.ai/blog/agent-prototype-playbook)
- GitHub (read `examples/`) — https://github.com/mastra-ai/mastra

**Third-party tutorials**
- Firecrawl: Build AI Agents in TypeScript with Mastra — https://www.firecrawl.dev/blog/mastra-tutorial
- WorkOS: TS agent in 5 min — https://workos.com/blog/mastra-ai-quick-start
- DEV: First agent in 5 minutes — https://dev.to/mastra_ai/build-your-first-agent-in-5-minutes-with-mastra-2ah3
- Generative.inc: Complete Guide (2026) — https://www.generative.inc/mastra-ai-the-complete-guide-to-the-typescript-agent-framework-2026
- SurePrompts: Prompting Guide — https://sureprompts.com/blog/mastra-prompting-guide

**YouTube:** Mastra's own channel (linked from docs) is highest-signal; favor 2026 uploads
since the framework moves fast.
