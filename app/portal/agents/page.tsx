import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { PORTAL_AGENT_PROFILES } from '@/lib/ai/portal-agents';
import { getAgentActivity } from '@/lib/ai/agent-activity';
import { pCard } from '@/components/portal/portal-ui';

export const metadata = {
  title: 'Agentes de IA',
};

const AGENT_LABEL: Record<string, string> = {};
for (const agent of PORTAL_AGENT_PROFILES) {
  AGENT_LABEL[agent.id] = agent.shortName;
}

function formatNumber(n: number): string {
  return n.toLocaleString('es-ES');
}

function formatDate(d: Date): string {
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function PortalAgentsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const client = await getPortalClient(parseInt(session.user.id, 10));
  const activity = client
    ? await getAgentActivity(client.id)
    : null;

  const activeAgents = activity
    ? Object.values(activity.stats).filter((s) => s.toolCalls > 0).length
    : 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Fuerza de trabajo de IA</p>
          <h1 className="font-display text-2xl font-extrabold tracking-[-0.03em] text-foreground mt-1">
            Agentes especializados, un núcleo gobernado
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Cada sección del portal activa al especialista con el conjunto de herramientas más ajustado.
            Cambia de agente desde el chat flotante en cualquier momento.
          </p>
        </div>
        <Link href="/portal/approvals" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
          <span className="material-icons text-sm">verified_user</span>
          Revisar aprobaciones de agentes
        </Link>
      </div>

      {/* Resumen de actividad */}
      {activity && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {[
            { icon: 'forum', label: 'Conversaciones', value: formatNumber(activity.totalConversations) },
            { icon: 'handyman', label: 'Acciones de herramientas', value: formatNumber(activity.totalToolCalls) },
            { icon: 'data_usage', label: 'Tokens consumidos', value: formatNumber(activity.totalTokens) },
            { icon: 'smart_toy', label: 'Agentes activos', value: formatNumber(activeAgents) },
          ].map((kpi) => (
            <div key={kpi.label} className={`${pCard} p-4`}>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="material-icons text-primary text-base">{kpi.icon}</span>
                {kpi.label}
              </div>
              <p className="font-display text-2xl font-extrabold text-foreground mt-2">{kpi.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className={`${pCard} px-4 py-3 flex items-start gap-3`}>
        <span className="material-icons text-primary text-lg mt-0.5">shield</span>
        <div>
          <p className="text-sm font-semibold text-foreground">El control humano sigue en el bucle</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Las operaciones sensibles de salida, financieras, de publicación y de cambio de permisos se aprueban
            antes de ejecutarse. Las políticas de canal y los límites por tenant se aplican fuera del modelo.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {PORTAL_AGENT_PROFILES.map((agent) => {
          const stat = activity?.stats[agent.id];
          return (
            <article key={agent.id} className={`${pCard} p-5 flex flex-col min-h-56`}>
              <div className="flex items-start justify-between gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <span className="material-icons text-primary">{agent.icon}</span>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-2 py-1 rounded-full">
                  {agent.handoffPath ? 'RAG dedicado' : agent.domains.length === 0 ? 'Supervisor' : `${agent.domains.length} dominios`}
                </span>
              </div>
              <h2 className="text-base font-display font-extrabold text-foreground mt-4">{agent.name}</h2>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{agent.description}</p>
              <div className="flex flex-wrap gap-1 mt-3">
                {(agent.domains.length === 0 ? ['todas las áreas del portal'] : agent.domains).map((domain) => (
                  <span key={domain} className="text-[10px] text-foreground/70 bg-muted px-2 py-0.5 rounded">
                    {domain.replace('_', ' ')}
                  </span>
                ))}
              </div>
              {stat && stat.toolCalls > 0 && (
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-3 pt-3 border-t border-border">
                  <span className="inline-flex items-center gap-1">
                    <span className="material-icons text-xs">handyman</span>
                    {formatNumber(stat.toolCalls)} acciones
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="material-icons text-xs">data_usage</span>
                    {formatNumber(stat.inputTokens + stat.outputTokens)} tokens
                  </span>
                  {stat.lastActiveAt && (
                    <span className="inline-flex items-center gap-1 ml-auto">
                      <span className="material-icons text-xs">schedule</span>
                      {formatDate(stat.lastActiveAt)}
                    </span>
                  )}
                </div>
              )}
              <Link href={agent.handoffPath ?? agent.homePath} className="mt-auto pt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                Abrir {agent.shortName}
                <span className="material-icons text-sm">arrow_forward</span>
              </Link>
            </article>
          );
        })}
      </div>

      {/* Actividad reciente de los agentes */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-extrabold text-foreground">Actividad reciente de los agentes</h2>
        </div>
        {!activity || activity.recent.length === 0 ? (
          <div className={`${pCard} p-10 text-center mt-3`}>
            <span className="material-icons text-4xl text-muted-foreground/40 block mb-2">smart_toy</span>
            <p className="text-sm text-muted-foreground">
              Aún no hay actividad de agentes. Pide algo desde el chat flotante y verás aquí el trabajo de tus agentes.
            </p>
          </div>
        ) : (
          <div className={`${pCard} overflow-hidden mt-3`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Fecha</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Agente</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Herramienta</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Conversación</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {activity.recent.map((call) => (
                    <tr key={`${call.messageId}-${call.toolName}`} className="hover:bg-accent/50 transition-colors">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{formatDate(call.createdAt)}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-medium text-foreground">{AGENT_LABEL[call.agentId] ?? call.agentId}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{call.toolName}</code>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[220px] truncate">{call.conversationTitle}</td>
                      <td className="px-4 py-2.5 text-right">
                        {call.succeeded ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
                            <span className="material-icons text-sm">check_circle</span>
                            Correcto
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
                            <span className="material-icons text-sm">error</span>
                            Error
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
