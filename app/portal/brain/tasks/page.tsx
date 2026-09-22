'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pCard, pSelect } from '@/components/portal/portal-ui';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  pointerWithin,
  useDroppable,
  CollisionDetection,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { priorityColor, stripMarkdown } from '@/lib/portal-utils';

// ─── Tasks types ─────────────────────────────────────────────────────────────

type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'done';

interface BrainTaskRow {
  id: number;
  title: string;
  description: string | null;
  ownerId: number | null;
  status: TaskStatus;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate: string | null;
  source: string;
  createdByAi: boolean;
  meetingId: number | null;
  linkedKanbanCardId: number | null;
  complianceFlag: boolean;
  createdAt: string;
}

interface PromotionTarget {
  id: number;
  name: string;
  projectKey: string | null;
  status: string;
  columns: { id: number; name: string; isDone: boolean }[];
}

const STATUS_COLUMNS: { key: TaskStatus; label: string; color: string }[] = [
  { key: 'open',        label: 'Abiertos',         color: '#94a3b8' },
  { key: 'in_progress', label: 'En progreso',  color: '#3b82f6' },
  { key: 'blocked',     label: 'Bloqueado',    color: '#ef4444' },
  { key: 'done',        label: 'Listo',         color: '#10b981' },
];

// ─── Review types ────────────────────────────────────────────────────────────

type ProposedType =
  | 'task' | 'decision' | 'commitment' | 'relationship_update' | 'follow_up' | 'compliance_warning' | 'note'
  | 'crm_contact_classify' | 'crm_deal_link' | 'crm_deal_create' | 'crm_company_link' | 'crm_company_create';
type ReviewItemStatus = 'pending' | 'approved' | 'rejected' | 'edited';

interface ReviewItem {
  id: number;
  sourceType: string;
  sourceId: number;
  proposedType: ProposedType;
  proposedPayload: Record<string, unknown>;
  status: ReviewItemStatus;
  reviewedAt: string | null;
  resultEntityType: string | null;
  resultEntityId: number | null;
  createdAt: string;
  // Phase 6 — suggested reviewer (populated by lib/brain/review-routing.ts).
  // Null when no candidate crossed the confidence threshold.
  suggestedReviewerPersonId?: number | null;
  suggestedReviewerScore?: number | null;
  suggestedReviewerReason?: string | null;
}

interface MeetingShape {
  id: number;
  title: string;
  status: string;
  meetingDate: string | null;
  source: string;
  gmailThreadId: string | null;
}

const TYPE_META: Record<ProposedType, { label: string; icon: string; tone: string }> = {
  task: { label: 'Tarea', icon: 'task_alt', tone: 'text-blue-600 dark:text-blue-400 bg-blue-500/10' },
  decision: { label: 'Decisión', icon: 'flag', tone: 'text-purple-600 dark:text-purple-400 bg-purple-500/10' },
  commitment: { label: 'Compromiso', icon: 'handshake', tone: 'text-amber-600 dark:text-amber-400 bg-amber-500/10' },
  relationship_update: { label: 'Actualización de relación', icon: 'group_work', tone: 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/10' },
  follow_up: { label: 'Seguimiento', icon: 'reply', tone: 'text-foreground bg-muted' },
  compliance_warning: { label: 'Aviso de cumplimiento', icon: 'warning', tone: 'text-red-600 dark:text-red-400 bg-red-500/10' },
  note: { label: 'Nota', icon: 'sticky_note_2', tone: 'text-foreground bg-muted' },
  crm_contact_classify: { label: 'Clasificar contacto', icon: 'badge', tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
  crm_deal_link:        { label: 'Vincular a negocio',     icon: 'link',  tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
  crm_deal_create:      { label: 'Crear negocio',      icon: 'monetization_on', tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
  crm_company_link:     { label: 'Vincular a empresa',  icon: 'link',  tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
  crm_company_create:   { label: 'Crear empresa',   icon: 'apartment', tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
};

const REVIEW_STATUS_TABS: { key: 'pending' | 'approved' | 'rejected' | 'all'; label: string }[] = [
  { key: 'pending', label: 'Pendiente' },
  { key: 'approved', label: 'Aprobado' },
  { key: 'rejected', label: 'Rechazado' },
  { key: 'all', label: 'Todos' },
];

// ─── Outer page (tab shell) ──────────────────────────────────────────────────

type Tab = 'tasks' | 'review';

export default function BrainTasksAndReviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab: Tab = searchParams.get('tab') === 'review' ? 'review' : 'tasks';
  const [tab, setTabState] = useState<Tab>(initialTab);
  const [pendingReviewCount, setPendingReviewCount] = useState<number | null>(null);

  const setTab = useCallback((next: Tab) => {
    setTabState(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'tasks') params.delete('tab');
    else params.set('tab', next);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
  }, [router, searchParams]);

  // Always poll the pending-review count for the badge, regardless of which tab is open.
  useEffect(() => {
    let cancelled = false;
    const fetchCount = () => {
      fetch('/api/portal/brain/review?status=pending')
        .then((r) => r.json())
        .then((json) => { if (!cancelled && json.success) setPendingReviewCount(json.data.items.length); })
        .catch(() => {});
    };
    fetchCount();
    const t = setInterval(fetchCount, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  return (
    <div className="space-y-6">
      <PortalPageHeader
        eyebrow="Cerebro de empresa"
        title={
          <span className="flex items-center gap-2">
            <span className="material-icons text-primary">{tab === 'review' ? 'reviews' : 'checklist'}</span>
            {tab === 'review' ? 'Cola de revisión' : 'Tareas del cerebro'}
          </span>
        }
        subtitle={
          tab === 'review'
            ? 'Tareas, decisiones, compromisos y vínculos del CRM extraídos por la IA de tus comunicaciones. Apruébalos para confirmarlos, edítalos y apruébalos, o recházalos.'
            : 'Tareas capturadas de las comunicaciones y sugerencias generadas por la IA, tras la aprobación humana.'
        }
      />

      <div className="flex items-center gap-1 border-b border-border overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        <button
          onClick={() => setTab('tasks')}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
            tab === 'tasks'
              ? 'border-foreground text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <span className="material-icons text-base">checklist</span>
          Tareas
        </button>
        <button
          onClick={() => setTab('review')}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
            tab === 'review'
              ? 'border-foreground text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <span className="material-icons text-base">reviews</span>
          Cola de revisión
          {pendingReviewCount !== null && pendingReviewCount > 0 && (
            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
              {pendingReviewCount > 99 ? '99+' : pendingReviewCount}
            </span>
          )}
        </button>
      </div>

      {tab === 'tasks' ? <TasksTab /> : <ReviewTab onPendingChange={setPendingReviewCount} />}
    </div>
  );
}

// ─── Tasks Tab ───────────────────────────────────────────────────────────────

function TasksTab() {
  const [tasks, setTasks] = useState<BrainTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promoteTask, setPromoteTask] = useState<BrainTaskRow | null>(null);
  const [activeTask, setActiveTask] = useState<BrainTaskRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/portal/brain/tasks');
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'No se pudieron cargar las tareas.');
      } else {
        setTasks(json.data);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const tasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, BrainTaskRow[]> = { open: [], in_progress: [], blocked: [], done: [] };
    for (const t of tasks) map[t.status].push(t);
    return map;
  }, [tasks]);

  const setStatus = async (taskId: number, status: TaskStatus) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t));
    try {
      const r = await fetch(`/api/portal/brain/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'No se pudo actualizar la tarea.');
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      await load();
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const collisionDetection: CollisionDetection = (args) => {
    const pointer = pointerWithin(args);
    const overCol = pointer.find(c => String(c.id).startsWith('col-'));
    if (overCol) {
      const colId = String(overCol.id).replace('col-', '') as TaskStatus;
      const cardCollisions = closestCorners({
        ...args,
        droppableContainers: args.droppableContainers.filter(c => {
          const id = String(c.id);
          if (!id.startsWith('card-')) return false;
          const cardId = parseInt(id.replace('card-', ''), 10);
          return tasksByStatus[colId]?.some(t => t.id === cardId) ?? false;
        }),
      });
      if (cardCollisions.length > 0) return [cardCollisions[0]];
      return [overCol];
    }
    const corners = closestCorners(args);
    const firstCard = corners.find(c => String(c.id).startsWith('card-'));
    if (firstCard) return [firstCard];
    return corners;
  };

  function onDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    if (data?.type === 'task') setActiveTask(data.task);
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId || !activeId.startsWith('card-')) return;

    const taskId = parseInt(activeId.replace('card-', ''), 10);
    const current = tasks.find(t => t.id === taskId);
    if (!current) return;

    let targetStatus: TaskStatus | null = null;
    if (overId.startsWith('col-')) {
      targetStatus = overId.replace('col-', '') as TaskStatus;
    } else if (overId.startsWith('card-')) {
      const overTaskId = parseInt(overId.replace('card-', ''), 10);
      const overTask = tasks.find(t => t.id === overTaskId);
      if (overTask) targetStatus = overTask.status;
    }

    if (targetStatus && current.status !== targetStatus) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: targetStatus! } : t));
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);
    if (!over) return;
    const activeId = String(active.id);
    if (!activeId.startsWith('card-')) return;
    const taskId = parseInt(activeId.replace('card-', ''), 10);
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    void setStatus(task.id, task.status);
  }

  return (
    <>
      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <span className="material-icons animate-spin mr-2">autorenew</span>Cargando…</div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STATUS_COLUMNS.map(col => (
              <TaskColumn
                key={col.key}
                statusKey={col.key}
                label={col.label}
                color={col.color}
                tasks={tasksByStatus[col.key]}
                onPromote={setPromoteTask}
              />
            ))}
          </div>

          <DragOverlay>
            {activeTask && <TaskCard task={activeTask} onPromote={() => {}} dragging />}
          </DragOverlay>
        </DndContext>
      )}

      {promoteTask && (
        <PromoteModal
          task={promoteTask}
          onClose={() => setPromoteTask(null)}
          onPromoted={() => { setPromoteTask(null); load(); }}
          onError={(msg) => setError(msg)}
        />
      )}
    </>
  );
}

function TaskColumn({
  statusKey,
  label,
  color,
  tasks,
  onPromote,
}: {
  statusKey: TaskStatus;
  label: string;
  color: string;
  tasks: BrainTaskRow[];
  onPromote: (task: BrainTaskRow) => void;
}) {
  const cardIds = tasks.map(t => `card-${t.id}`);
  const { setNodeRef, isOver } = useDroppable({ id: `col-${statusKey}` });

  return (
    <div className="flex-shrink-0 w-72 flex flex-col bg-muted/40 rounded-xl border border-border">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <h2 className="text-sm font-semibold text-foreground truncate">{label}</h2>
          <span className="text-xs rounded-full px-1.5 py-0.5 shrink-0 font-medium bg-muted text-muted-foreground">
            {tasks.length}
          </span>
        </div>
      </div>

      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`p-2 space-y-2 flex-1 min-h-[120px] transition-colors ${
            isOver ? 'bg-primary/5 ring-2 ring-primary/20 ring-inset rounded-b-xl' : ''
          }`}
        >
          {tasks.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-6">
              Sin tareas
            </div>
          ) : (
            tasks.map(t => <TaskCard key={t.id} task={t} onPromote={onPromote} />)
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function TaskCard({
  task,
  onPromote,
  dragging,
}: {
  task: BrainTaskRow;
  onPromote: (task: BrainTaskRow) => void;
  dragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `card-${task.id}`,
    data: { type: 'task', task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && !dragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-card border border-border rounded-2xl p-3 shadow-sm cursor-grab active:cursor-grabbing hover:border-primary/50 hover:shadow-md transition-all"
    >
      <div className="flex items-start gap-2">
        <p className="text-sm font-medium text-foreground flex-1">
          {task.title}
          {task.complianceFlag && (
            <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-red-600 dark:text-red-400 align-middle">
              <span className="material-icons text-sm">warning</span>
              cumplimiento
            </span>
          )}
        </p>
      </div>

      {task.description && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{stripMarkdown(task.description)}</p>
      )}

      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${priorityColor(task.priority)}`}>
          {task.priority}
        </span>
        {task.dueDate && (
          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
            <span className="material-icons text-xs">event</span>
            {new Date(task.dueDate).toLocaleDateString('es-ES')}
          </span>
        )}
        {task.createdByAi && (
          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
            <span className="material-icons text-xs">auto_awesome</span>
            AI
          </span>
        )}
        {task.meetingId && (
          <Link
            href={`/portal/brain/communications/${task.meetingId}`}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline flex items-center gap-0.5"
          >
            <span className="material-icons text-xs">forum</span>
            comunicación
          </Link>
        )}
        {task.linkedKanbanCardId && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
            <span className="material-icons text-xs">view_kanban</span>
            en el tablero
          </span>
        )}
      </div>

      {!task.linkedKanbanCardId && task.status !== 'done' && (
        <div className="mt-2 pt-2 border-t border-border/50">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onPromote(task); }}
            onPointerDown={(e) => e.stopPropagation()}
            className={`${pBtnGhost} !py-1 !px-2 !text-xs`}
            title="Promover al tablero de proyecto"
          >
            <span className="material-icons text-sm">view_kanban</span>
            Promover
          </button>
        </div>
      )}
    </div>
  );
}

function PromoteModal({
  task,
  onClose,
  onPromoted,
  onError,
}: {
  task: BrainTaskRow;
  onClose: () => void;
  onPromoted: () => void;
  onError: (msg: string) => void;
}) {
  const [targets, setTargets] = useState<PromotionTarget[] | null>(null);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [columnId, setColumnId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/portal/brain/promotion-targets')
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setTargets(json.data);
          if (json.data.length > 0) {
            const firstActive = json.data.find((p: PromotionTarget) => p.status === 'active') ?? json.data[0];
            setProjectId(firstActive.id);
            const firstCol = firstActive.columns.find((c: PromotionTarget['columns'][number]) => !c.isDone) ?? firstActive.columns[0];
            if (firstCol) setColumnId(firstCol.id);
          }
        } else {
          setLocalError(json.message || 'No se pudieron cargar los proyectos.');
        }
      })
      .catch((err) => setLocalError(err instanceof Error ? err.message : 'Network error'));
  }, []);

  useEffect(() => {
    if (!projectId || !targets) return;
    const proj = targets.find((p) => p.id === projectId);
    if (!proj) return;
    if (!proj.columns.find((c) => c.id === columnId)) {
      const first = proj.columns.find((c) => !c.isDone) ?? proj.columns[0];
      setColumnId(first?.id ?? null);
    }
  }, [projectId, targets, columnId]);

  const submit = async () => {
    if (!projectId) return;
    setSubmitting(true);
    setLocalError(null);
    try {
      const r = await fetch(`/api/portal/brain/tasks/${task.id}/promote-to-kanban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, columnId: columnId ?? undefined }),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setLocalError(json.message || 'No se pudo promover.');
        onError(json.message || 'No se pudo promover.');
        return;
      }
      onPromoted();
    } finally {
      setSubmitting(false);
    }
  };

  const project = targets?.find((p) => p.id === projectId);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-2xl shadow-xl max-w-md w-full p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">Promover al tablero de proyecto</h3>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{task.title}</p>
        </div>

        {localError && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-md p-2 text-xs text-destructive">
            {localError}
          </div>
        )}

        {!targets ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
            <span className="material-icons animate-spin mr-2 text-base">autorenew</span>
            Cargando proyectos…
          </div>
        ) : targets.length === 0 ? (
          <div className="bg-muted/30 border border-border rounded-xl p-3 text-xs text-muted-foreground">
            No hay proyectos activos en los que promover. <Link href="/portal/projects" className="text-primary hover:underline">Primero crea un proyecto</Link>.
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Proyecto</label>
              <select
                value={projectId ?? ''}
                onChange={(e) => setProjectId(parseInt(e.target.value, 10))}
                className={pSelect}
              >
                {targets.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.projectKey ? ` [${p.projectKey}]` : ''}</option>
                ))}
              </select>
            </div>
            {project && project.columns.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Columna</label>
                <select
                  value={columnId ?? ''}
                  onChange={(e) => setColumnId(parseInt(e.target.value, 10))}
                  className={pSelect}
                >
                  {project.columns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.isDone ? ' (listo)' : ''}</option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className={pBtnGhost}
          >Cancelar</button>
          <button
            onClick={submit}
            disabled={submitting || !projectId || !targets || targets.length === 0}
            className={pBtnPrimary}
          >
            {submitting
              ? <><span className="material-icons animate-spin text-base">autorenew</span>Promoviendo…</>
              : <><span className="material-icons text-base">view_kanban</span>Promover</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Review Tab ──────────────────────────────────────────────────────────────

function ReviewTab({ onPendingChange }: { onPendingChange: (n: number) => void }) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [meetings, setMeetings] = useState<Record<number, MeetingShape>>({});
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/portal/brain/review?status=${statusFilter}`);
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'No se pudo cargar la cola de revisión.');
        setItems([]);
      } else {
        setItems(json.data.items);
        setMeetings(json.data.meetings);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Clear selection on tab change and prune any IDs that are no longer pending.
  useEffect(() => { setSelected(new Set()); }, [statusFilter]);
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const stillPending = new Set(items.filter((i) => i.status === 'pending').map((i) => i.id));
      const next = new Set<number>();
      let changed = false;
      for (const id of prev) {
        if (stillPending.has(id)) next.add(id); else changed = true;
      }
      return changed ? next : prev;
    });
  }, [items]);

  // Refresh the parent's pending count whenever this view mutates the queue.
  const refreshPendingCount = useCallback(async () => {
    try {
      const r = await fetch('/api/portal/brain/review?status=pending');
      const json = await r.json();
      if (json.success) onPendingChange(json.data.items.length);
    } catch {}
  }, [onPendingChange]);

  const groups = useMemo(() => {
    const byMeeting = new Map<number | 'other', ReviewItem[]>();
    for (const item of items) {
      const key = item.sourceType === 'meeting' ? item.sourceId : 'other' as const;
      if (!byMeeting.has(key)) byMeeting.set(key, []);
      byMeeting.get(key)!.push(item);
    }
    return [...byMeeting.entries()].sort(([a], [b]) => {
      if (a === 'other') return 1;
      if (b === 'other') return -1;
      const da = meetings[a as number]?.meetingDate ?? '';
      const db = meetings[b as number]?.meetingDate ?? '';
      return db.localeCompare(da);
    });
  }, [items, meetings]);

  const pendingIds = useMemo(
    () => items.filter((i) => i.status === 'pending').map((i) => i.id),
    [items],
  );
  const allPendingSelected = pendingIds.length > 0 && pendingIds.every((id) => selected.has(id));

  const toggleSelect = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAllPending = useCallback(() => {
    setSelected((prev) => {
      const allChecked = pendingIds.length > 0 && pendingIds.every((id) => prev.has(id));
      return allChecked ? new Set() : new Set(pendingIds);
    });
  }, [pendingIds]);

  const toggleGroupPending = useCallback((groupPendingIds: number[]) => {
    if (groupPendingIds.length === 0) return;
    setSelected((prev) => {
      const allChecked = groupPendingIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allChecked) {
        for (const id of groupPendingIds) next.delete(id);
      } else {
        for (const id of groupPendingIds) next.add(id);
      }
      return next;
    });
  }, []);

  const bulkAction = useCallback(async (action: 'approve' | 'reject') => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      const results = await Promise.allSettled(
        ids.map(async (id) => {
          const r = await fetch(`/api/portal/brain/review-items/${id}/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          const json = await r.json();
          if (!r.ok || !json.success) throw new Error(json.message || `${action} failed`);
          return json;
        }),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        setError(`Fallaron ${failed} de ${ids.length} solicitud${ids.length === 1 ? '' : 'es'} de ${action}.`);
      }
      setSelected(new Set());
      await load();
      void refreshPendingCount();
    } finally {
      setBulkBusy(false);
    }
  }, [selected, load, refreshPendingCount]);

  const approve = async (item: ReviewItem) => {
    setBusyId(item.id);
    try {
      const r = await fetch(`/api/portal/brain/review-items/${item.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await r.json();
      if (!r.ok || !json.success) setError(json.message || 'No se pudo aprobar.');
      await load();
      void refreshPendingCount();
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (item: ReviewItem) => {
    setBusyId(item.id);
    try {
      const r = await fetch(`/api/portal/brain/review-items/${item.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await r.json();
      if (!r.ok || !json.success) setError(json.message || 'No se pudo rechazar.');
      await load();
      void refreshPendingCount();
    } finally {
      setBusyId(null);
    }
  };

  const pendingTotal = useMemo(() => items.filter((i) => i.status === 'pending').length, [items]);

  return (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1 overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          {REVIEW_STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatusFilter(t.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-xl transition-colors whitespace-nowrap ${
                statusFilter === t.key
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {statusFilter === 'pending' && (
            <div className="text-sm text-muted-foreground">
              {pendingTotal === 0
                ? <span className="text-emerald-600 dark:text-emerald-400 font-medium inline-flex items-center gap-1"><span className="material-icons text-base">check_circle</span> Todo en orden</span>
                : <span><strong className="text-foreground">{pendingTotal}</strong> pendientes</span>
              }
            </div>
          )}
          <Link
            href="/portal/brain/communications"
            className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
          >
            <span className="material-icons text-sm">forum</span>
            Ver comunicaciones
          </Link>
        </div>
      </div>

      {pendingIds.length > 0 && (
        <div className={`flex items-center justify-between gap-4 ${pCard} px-3 py-2 flex-wrap`}>
          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
              checked={allPendingSelected}
              ref={(el) => { if (el) el.indeterminate = !allPendingSelected && selected.size > 0; }}
              onChange={toggleAllPending}
              disabled={bulkBusy}
              aria-label="Seleccionar todos los elementos pendientes"
            />
            <span>
              {selected.size > 0
                ? <><strong className="text-foreground">{selected.size}</strong> seleccionados</>
                : <>Seleccionar todos los pendientes ({pendingIds.length})</>}
            </span>
          </label>
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => bulkAction('reject')}
                disabled={bulkBusy}
                className={`${pBtnGhost} !py-1 !px-3 !text-xs hover:border-destructive/50 hover:text-destructive`}
              >
                <span className="material-icons text-sm">close</span>
                Rechazar {selected.size}
              </button>
              <button
                onClick={() => bulkAction('approve')}
                disabled={bulkBusy}
                className={`${pBtnPrimary} !py-1 !px-3 !text-xs`}
              >
                {bulkBusy
                  ? <><span className="material-icons animate-spin text-sm">autorenew</span>Procesando…</>
                  : <><span className="material-icons text-sm">check</span>Aprobar {selected.size}</>}
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <span className="material-icons animate-spin mr-2">autorenew</span>Cargando…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-2xl">
          <span className="material-icons text-4xl text-muted-foreground mb-2 block">inbox</span>
          <p className="text-foreground text-sm font-medium">
            {statusFilter === 'pending' ? 'Nada pendiente de revisión.' : 'Nada por aquí todavía.'}
          </p>
          <p className="text-muted-foreground text-xs mt-1">
            Los elementos nuevos aparecen aquí cuando la IA procesa una comunicación o un hilo de correo.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(([key, groupItems]) => {
            const meeting = key === 'other' ? null : meetings[key as number];
            const groupPendingIds = groupItems.filter((i) => i.status === 'pending').map((i) => i.id);
            const allGroupSelected = groupPendingIds.length > 0 && groupPendingIds.every((id) => selected.has(id));
            const someGroupSelected = groupPendingIds.some((id) => selected.has(id)) && !allGroupSelected;
            return (
              <section key={String(key)} className="space-y-2">
                <div className="flex items-center gap-2">
                  {groupPendingIds.length > 0 && (
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                      checked={allGroupSelected}
                      ref={(el) => { if (el) el.indeterminate = someGroupSelected; }}
                      onChange={() => toggleGroupPending(groupPendingIds)}
                      disabled={bulkBusy}
                      aria-label="Seleccionar todos los elementos pendientes de esta sección"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    {meeting ? (
                      <Link
                        href={`/portal/brain/communications/${meeting.id}`}
                        className="text-sm font-medium text-foreground hover:text-primary truncate inline-flex items-center gap-1"
                      >
                        <span className="material-icons text-base text-muted-foreground">
                          {meeting.gmailThreadId ? 'forum' : 'chat'}
                        </span>
                        {meeting.title}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-foreground inline-flex items-center gap-1">
                        <span className="material-icons text-base text-muted-foreground">help</span>
                        Otros orígenes
                      </span>
                    )}
                    {meeting?.meetingDate && (
                      <span className="text-xs text-muted-foreground ml-2">
                        {new Date(meeting.meetingDate).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {groupItems.length} elemento{groupItems.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="space-y-2">
                  {groupItems.map((item) => (
                    <ReviewCard
                      key={item.id}
                      item={item}
                      busy={busyId === item.id || bulkBusy}
                      onApprove={() => approve(item)}
                      onReject={() => reject(item)}
                      meetingHref={meeting ? `/portal/brain/communications/${meeting.id}/review` : null}
                      selectable={item.status === 'pending'}
                      selected={selected.has(item.id)}
                      onToggleSelect={() => toggleSelect(item.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function ReviewCard({ item, busy, onApprove, onReject, meetingHref, selectable, selected, onToggleSelect }: {
  item: ReviewItem;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  meetingHref: string | null;
  selectable: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const meta = TYPE_META[item.proposedType] ?? { label: item.proposedType, icon: 'help', tone: 'text-foreground bg-muted' };
  const isPending = item.status === 'pending';
  const summary = describeProposal(item);

  return (
    <div className={`bg-card border rounded-2xl p-4 ${
      selected
        ? 'border-primary/60 bg-primary/5'
        : item.status === 'approved' || item.status === 'edited'
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : item.status === 'rejected'
            ? 'border-border opacity-60'
            : 'border-border'
    }`}>
      <div className="flex items-start gap-3">
        {selectable && (
          <input
            type="checkbox"
            className="h-4 w-4 mt-0.5 rounded border-border accent-primary cursor-pointer flex-shrink-0"
            checked={selected}
            onChange={onToggleSelect}
            disabled={busy}
            aria-label="Seleccionar elemento"
          />
        )}
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.tone} flex items-center gap-1 flex-shrink-0`}>
          <span className="material-icons text-sm">{meta.icon}</span>
          {meta.label}
        </span>
        <SuggestedReviewerChip item={item} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground break-words">{summary}</p>
          <PayloadDetails payload={item.proposedPayload} type={item.proposedType} />
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isPending ? (
            <>
              {meetingHref && (
                <Link
                  href={meetingHref}
                  className={`${pBtnGhost} !py-1 !px-2 !text-xs`}
                  title="Editar en revisión detallada"
                >
                  <span className="material-icons text-sm">edit</span>
                </Link>
              )}
              <button
                onClick={onReject}
                disabled={busy}
                className={`${pBtnGhost} !py-1 !px-2 !text-xs hover:border-destructive/50 hover:text-destructive`}
              >
                <span className="material-icons text-sm">close</span>
                Rechazar
              </button>
              <button
                onClick={onApprove}
                disabled={busy}
                className={`${pBtnPrimary} !py-1 !px-2 !text-xs`}
              >
                <span className="material-icons text-sm">check</span>
                Aprobar
              </button>
            </>
          ) : item.status === 'approved' || item.status === 'edited' ? (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
              <span className="material-icons text-sm">check_circle</span>
              {item.status === 'edited' ? 'Editado y aprobado' : 'Aprobado'}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <span className="material-icons text-sm">block</span>
              Rechazado
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function describeProposal(item: ReviewItem): string {
  const p = item.proposedPayload;
  const s = (k: string) => typeof p[k] === 'string' ? p[k] as string : '';
  const n = (k: string) => typeof p[k] === 'number' ? p[k] as number : null;
  switch (item.proposedType) {
    case 'task': return s('title') || 'Tarea sin título';
    case 'decision': return s('title') || 'Decisión sin título';
    case 'commitment': return `${s('who') || 'Alguien'} → ${s('what')}`;
    case 'relationship_update': return `${s('field') || 'campo'}: ${s('value')}`;
    case 'compliance_warning': return s('message') || 'Aviso de cumplimiento';
    case 'crm_contact_classify': {
      const parts: string[] = [];
      if (s('proposedStatus')) parts.push(`estado → ${s('proposedStatus')}`);
      if (s('proposedSeniority')) parts.push(`antigüedad → ${s('proposedSeniority')}`);
      if (s('proposedDepartment')) parts.push(`departamento → ${s('proposedDepartment')}`);
      if (s('proposedTitle')) parts.push(`cargo → ${s('proposedTitle')}`);
      const id = n('contactId');
      return parts.length > 0 ? `Contacto${id ? ` #${id}` : ''}: ${parts.join(', ')}` : `Contacto${id ? ` #${id}` : ''}`;
    }
    case 'crm_deal_link': return `Vincular a negocio #${n('dealId')}`;
    case 'crm_deal_create': {
      const value = n('value');
      const v = value !== null ? ` (${formatCents(value, s('currency') || 'EUR')})` : '';
      return `Crear negocio: ${s('title') || '(sin título)'}${v}`;
    }
    case 'crm_company_link': {
      const candidates = Array.isArray(p.candidateCompanyIds) ? p.candidateCompanyIds : [];
      return candidates.length > 1
        ? `Elige una empresa entre ${candidates.length} candidatas (por defecto: #${n('companyId')})`
        : `Vincular a empresa #${n('companyId')}`;
    }
    case 'crm_company_create': {
      const dom = s('domain') ? ` (${s('domain')})` : '';
      return `Crear empresa: ${s('name') || '(sin nombre)'}${dom}`;
    }
    default: return JSON.stringify(p).slice(0, 80);
  }
}

function PayloadDetails({ payload, type }: { payload: Record<string, unknown>; type: ProposedType }) {
  const bits: { label: string; value: string }[] = [];
  if (type === 'task') {
    if (typeof payload.description === 'string' && payload.description) bits.push({ label: '', value: payload.description });
    if (typeof payload.ownerHint === 'string') bits.push({ label: 'responsable', value: payload.ownerHint });
    if (typeof payload.dueDate === 'string') bits.push({ label: 'vence', value: payload.dueDate });
    if (typeof payload.priority === 'string') bits.push({ label: 'prioridad', value: payload.priority });
    if (payload.complianceFlag === true) bits.push({ label: '', value: 'marca de cumplimiento' });
  } else if (type === 'decision' && typeof payload.details === 'string') {
    bits.push({ label: '', value: payload.details });
  } else if (type === 'commitment' && typeof payload.when === 'string') {
    bits.push({ label: 'cuándo', value: payload.when });
  } else if (type === 'relationship_update' && typeof payload.rationale === 'string') {
    bits.push({ label: 'motivo', value: payload.rationale });
  } else if (type === 'compliance_warning' && typeof payload.severity === 'string') {
    bits.push({ label: 'gravedad', value: payload.severity });
  } else if (type === 'crm_contact_classify' && typeof payload.rationale === 'string') {
    bits.push({ label: 'motivo', value: payload.rationale });
  } else if (type === 'crm_deal_link' && typeof payload.rationale === 'string') {
    bits.push({ label: 'motivo', value: payload.rationale });
  } else if (type === 'crm_deal_create') {
    if (typeof payload.priority === 'string') bits.push({ label: 'prioridad', value: payload.priority });
    if (typeof payload.expectedCloseDate === 'string') bits.push({ label: 'cierre previsto', value: payload.expectedCloseDate });
    if (typeof payload.rationale === 'string') bits.push({ label: 'motivo', value: payload.rationale });
  } else if (type === 'crm_company_create') {
    if (typeof payload.industry === 'string') bits.push({ label: 'sector', value: payload.industry });
    if (typeof payload.website === 'string') bits.push({ label: 'sitio web', value: payload.website });
    if (typeof payload.rationale === 'string') bits.push({ label: 'motivo', value: payload.rationale });
  }

  if (bits.length === 0) return null;
  return (
    <div className="text-xs text-muted-foreground mt-1.5 space-y-0.5">
      {bits.map((b, i) => (
        <div key={i}>
          {b.label && <span className="font-medium">{b.label}:</span>} {b.value}
        </div>
      ))}
    </div>
  );
}

function formatCents(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: currency || 'EUR' }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/**
 * Renders the "routed-to" chip on a review-item card. Pulls
 * (suggestedReviewerPersonId, score, reason) from the row — populated by
 * lib/brain/review-routing.ts. Renders nothing when no suggestion exists.
 * The reason is a tooltip via `title` for keyboard + screen-reader users.
 */
function SuggestedReviewerChip({ item }: { item: ReviewItem }) {
  const pid = item.suggestedReviewerPersonId;
  const score = item.suggestedReviewerScore;
  const reason = item.suggestedReviewerReason;
  if (pid == null || score == null) return null;
  // The reason string already includes the person's name when available, e.g.
  // "Sarah Chen — expertise in kubernetes". We surface a compact "#<id> · <score>"
  // here and put the full text in the tooltip so the row stays scannable.
  const label = reason && reason.includes('—')
    ? reason.split('—')[0].trim()
    : `#${pid}`;
  return (
    <span
      className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center gap-1 flex-shrink-0 cursor-help"
      title={reason ?? `Revisor sugerido #${pid} (puntuación ${score})`}
    >
      <span className="material-icons text-sm">person_pin</span>
      <span className="truncate max-w-[8rem]">{label}</span>
      <span className="opacity-70">· {score}</span>
    </span>
  );
}
