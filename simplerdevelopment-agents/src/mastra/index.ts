
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { PostgresStore } from '@mastra/pg';
import { Observability, MastraStorageExporter, MastraPlatformExporter, SensitiveDataFilter } from '@mastra/observability';
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';
import { toolCallAppropriatenessScorer, completenessScorer, translationScorer } from './scorers/weather-scorer';
import { toolGroundingScorer, groundednessScorer } from './scorers/brain-scorer';
// SimplerDevelopment Company Brain example (talks to the portal MCP server).
import { brainAgent } from './agents/brain-agent';
import { classifierAgent, plannerAgent, grounderAgent } from './agents/brain-stages';
import { brainWorkflow } from './workflows/brain-workflow';
import { portalAssistant } from './agents/portal-assistant';
import { portalClassifier } from './agents/portal-intent';
import { sdMcp, sdMcpConfigured } from './mcp/sd-mcp';

// Mastra's memory scoping key, read from requestContext by the agent runtime
// (see @mastra/core agent/durable resolveScope). It is a stable string key,
// not exported through the public entry — define locally to avoid coupling to
// an internal chunk.
const MASTRA_RESOURCE_ID_KEY = 'mastra__resourceId';

// Fail-fast (spec: "refuse to start without SD_AGENTS_INTERNAL_SECRET"). In
// production the HTTP surface is the only way in and every request needs the
// shared secret — booting without it would 401 everything (or worse, if
// someone later softens the middleware). Dev/CLI runs (run-brain.ts /
// run-portal.ts / Studio) don't set it and must keep working, so the guard is
// scoped to NODE_ENV=production (the Dockerfile/Railway set it).
if (process.env.NODE_ENV === 'production' && !process.env.SD_AGENTS_INTERNAL_SECRET) {
  throw new Error(
    'SD_AGENTS_INTERNAL_SECRET is required in production: the agents HTTP API is ' +
      'private-network-only and every request must authenticate with the shared ' +
      'internal secret. Set it on the Railway service (see railway.toml).',
  );
}

export const mastra = new Mastra({
  workflows: { weatherWorkflow, brainWorkflow },
  agents: {
    weatherAgent,
    brainAgent,
    classifierAgent,
    plannerAgent,
    grounderAgent,
    portalAssistant,
    portalClassifier,
  },
  // Surface the connected SimplerDevelopment MCP server in Mastra Studio so its
  // tools are browsable alongside native ones. Only registered when a key is set.
  ...(sdMcpConfigured ? { mcpServers: sdMcp.toMCPServerProxies() } : {}),
  // Inbound auth. This HTTP surface is private-network-only and is reached SOLELY
  // by the parent app (see lib/ai/agents-client.ts). Reject anything missing the
  // shared internal secret (fail closed). On success, forward the per-request,
  // single-tenant token into the run's requestContext, so the SD MCP client
  // (./mcp/sd-mcp.ts) calls the portal AS that tenant. Server-set requestContext
  // wins over the body copy, so a caller can't spoof a different tenant via the
  // body. (In-process CLI runs — run-brain.ts / run-portal.ts — don't traverse
  // this middleware, so they keep working with SD_MCP_API_KEY.)
  //
  // Tenant guardrail for Memory at rest: the parent app also sends
  // `x-sd-tenant-id` (the clientId it minted the token for), which we map to
  // Mastra's `mastra__resourceId` requestContext key. The agent runtime scopes
  // all memory (threads, messages, working memory) by resourceId, so one
  // tenant can never read another's memory even if a threadId collides.
  // Only the app can pass the internal secret, so this header is trusted.
  server: {
    middleware: [
      {
        path: '/api/*',
        handler: async (
          c: {
            req: { header(name: string): string | undefined };
            json(body: unknown, status?: number): Response;
            get(key: string): { set(k: string, v: unknown): void } | undefined;
          },
          next: () => Promise<void>,
        ) => {
          const expected = process.env.SD_AGENTS_INTERNAL_SECRET;
          const provided = c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
          if (!expected || provided !== expected) {
            return c.json({ error: 'unauthorized' }, 401);
          }
          const tenantToken = c.req.header('x-sd-tenant-token');
          if (tenantToken) {
            c.get('requestContext')?.set('token', tenantToken);
          }
          const tenantId = c.req.header('x-sd-tenant-id');
          if (tenantId) {
            c.get('requestContext')?.set(MASTRA_RESOURCE_ID_KEY, tenantId);
          }
          await next();
        },
      },
    ],
  },
  scorers: {
    toolCallAppropriatenessScorer,
    completenessScorer,
    translationScorer,
    toolGroundingScorer,
    groundednessScorer,
  },
  // Durable Postgres storage (ADR mastra-consolidate-separate-service, item 2):
  // replaces the old LibSQL file + DuckDB combo so Memory + observability
  // survive redeploys on Railway. Uses the same DATABASE_URL as the parent app
  // (or MASTRA_DATABASE_URL to point at a dedicated DB). PostgresStore
  // auto-creates its schema (mastra_* tables) on first use.
  storage: new PostgresStore({
    id: 'mastra-storage',
    connectionString: process.env.MASTRA_DATABASE_URL ?? process.env.DATABASE_URL!,
    ssl: process.env.MASTRA_DB_SSL ? { rejectUnauthorized: false } : undefined,
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [
          new MastraStorageExporter(), // Persists observability events to Mastra Storage
          new MastraPlatformExporter(), // Sends observability events to Mastra Platform (if MASTRA_PLATFORM_ACCESS_TOKEN is set)
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys
        ],
      },
    },
  }),
});
