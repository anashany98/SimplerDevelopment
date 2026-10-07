/**
 * Server-rendered brain dashboard counters + tile grid. Streams in via
 * Suspense — the cached `getDashboardSummary` call replaces the old client
 * useEffect fetch, so the initial HTML can include the real data instead of
 * a loading spinner. When this component is wrapped in `<Suspense>`, Next
 * streams the surrounding shell immediately and patches in this subtree
 * once the cached query resolves.
 */
import Link from 'next/link';
import { getDashboardSummary } from '@/lib/brain/dashboard';
import { Counter, Tile, TaskRow } from './parts';

interface Props {
  clientId: number;
}

export async function BrainDashboardSummaryTile({ clientId }: Props) {
  const data = await getDashboardSummary(clientId);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Counter
          icon="reviews"
          tone="text-blue-600 dark:text-blue-400"
          label="Pendientes de revisión"
          value={data.counts.pendingReviewItems}
          href="/portal/brain/communications?status=needs_review"
        />
        <Counter
          icon="checklist"
          tone="text-foreground"
          label="Tareas abiertas"
          value={data.counts.openTasks}
          href="/portal/brain/tasks"
        />
        <Counter
          icon="auto_awesome"
          tone="text-primary"
          label="Tareas creadas por IA"
          value={data.counts.aiCreatedTasks}
          href="/portal/brain/tasks?filter=ai"
        />
        <Counter
          icon="group_work"
          tone="text-cyan-600 dark:text-cyan-400"
          label="Relaciones"
          value={data.counts.relationships}
          href="/portal/brain/relationships"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Tile
          title="Necesitan revisión"
          icon="reviews"
          tone="text-blue-600 dark:text-blue-400"
          action={
            <Link href="/portal/brain/communications" className="text-xs text-primary hover:underline">Ver todo</Link>
          }
          empty="Nada pendiente de revisión."
          items={data.needsReviewMeetings}
          render={(m) => (
            <Link
              href={`/portal/brain/communications/${m.id}/review`}
              className="block hover:text-primary"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-foreground truncate">{m.title}</span>
                {m.pendingReviewItems > 0 && (
                  <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex-shrink-0">
                    {m.pendingReviewItems}
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(m.meetingDate || m.createdAt).toLocaleDateString()}
              </span>
            </Link>
          )}
        />

        <Tile
          title="Atrasado"
          icon="event_busy"
          tone="text-red-600 dark:text-red-400"
          action={
            <Link href="/portal/brain/tasks" className="text-xs text-primary hover:underline">
              Todas las tareas
            </Link>
          }
          empty="Nada atrasado."
          items={data.overdueTasks}
          render={(t) => <TaskRow task={t} highlightDue />}
        />

        <Tile
          title="Prospectos inactivos"
          icon="schedule"
          tone="text-amber-600 dark:text-amber-400"
          action={
            <Link
              href="/portal/brain/relationships?view=stale"
              className="text-xs text-primary hover:underline"
            >Todos</Link>
          }
          empty="No hay prospectos inactivos."
          items={data.staleProspects}
          render={(r) => (
            <Link
              href={`/portal/brain/relationships/${r.overlayId}`}
              className="block hover:text-primary"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-foreground truncate">{r.name}</span>
                <span className="text-xs text-amber-600 dark:text-amber-400 flex-shrink-0">
                  {r.daysSinceTouch}d
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {r.type.replace(/_/g, ' ')} · inactivo tras {r.staleAfterDays}d
              </span>
            </Link>
          )}
        />

        <Tile
          title="Relaciones prioritarias"
          icon="flag"
          tone="text-red-600 dark:text-red-400"
          action={
            <Link
              href="/portal/brain/relationships?priority=high"
              className="text-xs text-primary hover:underline"
            >Ver todo</Link>
          }
          empty="No hay relaciones de alta prioridad."
          items={data.priorityRelationships}
          render={(r) => (
            <Link
              href={`/portal/brain/relationships/${r.overlayId}`}
              className="block hover:text-primary"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-foreground truncate">{r.name}</span>
                <span
                  className={`text-xs font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                    r.priority === 'critical'
                      ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {r.priority}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {r.type.replace(/_/g, ' ')}
                {r.openTaskCount > 0 && ` · ${r.openTaskCount} abiertas`}
              </span>
            </Link>
          )}
        />

        <Tile
          title="Bloqueadas"
          icon="block"
          tone="text-muted-foreground"
          action={
            <Link
              href="/portal/brain/tasks?status=blocked"
              className="text-xs text-primary hover:underline"
            >Ver todo</Link>
          }
          empty="Nada bloqueado."
          items={data.blockedTasks}
          render={(t) => <TaskRow task={t} />}
        />

        <Tile
          title="Próximas"
          icon="event"
          tone="text-foreground"
          action={
            <Link href="/portal/brain/tasks" className="text-xs text-primary hover:underline">Ver todo</Link>
          }
          empty="No hay vencimientos próximos."
          items={data.upcomingTasks}
          render={(t) => <TaskRow task={t} />}
        />
      </div>

      {/* Recent communication */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="material-icons text-base text-muted-foreground">forum</span>
            Comunicación reciente
          </h2>
          <Link
            href="/portal/brain/communications/new"
            className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
          >
            <span className="material-icons text-sm">add</span>
            Nueva nota
          </Link>
        </div>
        {data.recentMeetings.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Aún no hay notas. Pega tu primera transcripción o reenvía un email para empezar.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {data.recentMeetings.map((m) => (
              <li key={m.id} className="py-2">
                <Link
                  href={`/portal/brain/communications/${m.id}`}
                  className="flex items-center justify-between hover:text-primary"
                >
                  <span className="text-sm text-foreground truncate">{m.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.status.replace(/_/g, ' ')} · {new Date(m.createdAt).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
