'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type {
  WorkflowGraph,
  WorkflowAction,
  WorkflowTriggerConfig,
  WorkflowStatus,
} from '@/lib/workflows/types';

interface WorkflowResponse {
  id: number;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  trigger: WorkflowTriggerConfig;
  graph: WorkflowGraph;
}

interface RunRow {
  id: number;
  status: string;
  triggeredBy: string | null;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

interface RunStepRow {
  id: number;
  nodeId: string;
  action: string;
  status: string;
  attemptCount: number;
  nextRetryAt: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
}

// Sidebar palette — click these to add a node to the canvas.
interface PaletteEntry {
  type: 'trigger' | 'action' | 'condition';
  icon: string;
  label: string;
  defaultData: WorkflowTriggerConfig | WorkflowAction;
}

const PALETTE: PaletteEntry[] = [
  { type: 'trigger', icon: 'person_add', label: 'Contacto creado', defaultData: { kind: 'contact.created' } },
  { type: 'trigger', icon: 'sync_alt', label: 'Etapa de negocio cambiada', defaultData: { kind: 'deal.stage_changed' } },
  { type: 'trigger', icon: 'assignment_turned_in', label: 'Formulario enviado', defaultData: { kind: 'form.submitted' } },
  { type: 'trigger', icon: 'webhook', label: 'Webhook recibido', defaultData: { kind: 'webhook.received', secret: 'change-me' } },
  { type: 'trigger', icon: 'schedule', label: 'Programación (cron)', defaultData: { kind: 'schedule', cron: '0 9 * * 1' } },
  { type: 'action', icon: 'mail', label: 'Enviar email', defaultData: { kind: 'send_email', templateId: 0, to: 'contact' } },
  { type: 'action', icon: 'task_alt', label: 'Crear tarea', defaultData: { kind: 'create_task', title: 'Seguimiento' } },
  { type: 'action', icon: 'playlist_add', label: 'Añadir a lista', defaultData: { kind: 'add_to_list', listId: 0 } },
  { type: 'action', icon: 'hourglass_empty', label: 'Esperar', defaultData: { kind: 'wait', ms: 60_000 } },
  { type: 'action', icon: 'send', label: 'Webhook', defaultData: { kind: 'webhook', url: 'https://example.com', payload: {} } },
  { type: 'condition', icon: 'fork_right', label: 'Condición', defaultData: { kind: 'condition', expression: 'true' } },
];

function nodeLabel(data: WorkflowTriggerConfig | WorkflowAction): string {
  switch (data.kind) {
    case 'contact.created': return 'Contacto creado';
    case 'deal.stage_changed': return 'Etapa de negocio cambiada';
    case 'form.submitted': return 'Formulario enviado';
    case 'webhook.received': return 'Webhook recibido';
    case 'schedule': return `Programación: ${data.cron}`;
    case 'send_email': return `Enviar email (plantilla ${data.templateId})`;
    case 'create_task': return `Crear tarea: ${data.title}`;
    case 'add_to_list': return `Añadir a lista ${data.listId}`;
    case 'wait': return `Esperar ${Math.round(data.ms / 1000)}s`;
    case 'webhook': return `Webhook a ${truncate(data.url, 30)}`;
    case 'condition': return `Si: ${truncate(data.expression, 30)}`;
    default: return 'Desconocido';
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '...';
}

// Translate our workflow graph into ReactFlow's Node/Edge shape, embedding
// our typed payload on `node.data.payload` and a label for display.
function toRFNodes(graph: WorkflowGraph): Node[] {
  return graph.nodes.map((n) => ({
    id: n.id,
    position: n.position,
    data: { payload: n.data, kind: n.type, label: nodeLabel(n.data) },
    type: 'default',
    style: nodeStyle(n.type),
  }));
}

function toRFEdges(graph: WorkflowGraph): Edge[] {
  return graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    type: 'default',
    animated: true,
  }));
}

function nodeStyle(kind: 'trigger' | 'action' | 'condition'): React.CSSProperties {
  const bg = kind === 'trigger' ? '#10b981' : kind === 'condition' ? '#f59e0b' : '#3b82f6';
  return { background: bg, color: 'white', border: 'none', borderRadius: 10, padding: 8, fontSize: 12 };
}

function newNodeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

// Re-derive our graph shape from the live ReactFlow nodes/edges so we can
// persist it to the API.
function fromRF(nodes: Node[], edges: Edge[]): WorkflowGraph {
  return {
    nodes: nodes.map((n) => {
      const data = n.data as { payload: WorkflowTriggerConfig | WorkflowAction; kind: 'trigger' | 'action' | 'condition' };
      return {
        id: n.id,
        type: data.kind,
        position: n.position,
        data: data.payload,
      };
    }),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: (e.label as 'true' | 'false' | undefined) ?? undefined,
    })),
  };
}

export default function WorkflowEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ? parseInt(params.id, 10) : NaN;

  const [wf, setWf] = useState<WorkflowResponse | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [name, setName] = useState('');
  const [status, setStatus] = useState<WorkflowStatus>('draft');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [runSteps, setRunSteps] = useState<RunStepRow[]>([]);
  const [stepsLoading, setStepsLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const updatePayloadField = useCallback((field: string, value: string | number) => {
    if (!selectedNodeId) return;
    setNodes((current) => current.map((node) => {
      if (node.id !== selectedNodeId) return node;
      const payload = { ...(node.data.payload as Record<string, unknown>), [field]: value } as WorkflowTriggerConfig | WorkflowAction;
      return { ...node, data: { ...node.data, payload, label: nodeLabel(payload) } };
    }));
  }, [selectedNodeId]);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    void Promise.all([
      fetch(`/api/portal/workflows/${id}`).then((r) => r.json()),
      fetch(`/api/portal/workflows/${id}/runs?limit=10`).then((r) => r.json()),
    ])
      .then(([wfRes, runsRes]) => {
        if (wfRes?.success) {
          const data: WorkflowResponse = wfRes.data;
          setWf(data);
          setNodes(toRFNodes(data.graph));
          setEdges(toRFEdges(data.graph));
          setName(data.name);
          setStatus(data.status);
        }
        if (runsRes?.success) setRuns(runsRes.data ?? []);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);
  const onConnect = useCallback((conn: Connection) => {
    setEdges((eds) => addEdge({ ...conn, id: `e-${Math.random().toString(36).slice(2, 8)}`, animated: true }, eds));
  }, []);
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => setSelectedNodeId(node.id), []);

  const handleAdd = useCallback((entry: PaletteEntry) => {
    const nid = newNodeId(entry.type);
    const position = rfInstance
      ? rfInstance.screenToFlowPosition({ x: 250, y: 200 })
      : { x: 200 + Math.random() * 100, y: 200 + Math.random() * 100 };
    setNodes((nds) =>
      nds.concat({
        id: nid,
        position,
        data: { payload: entry.defaultData, kind: entry.type, label: nodeLabel(entry.defaultData) },
        type: 'default',
        style: nodeStyle(entry.type),
      }),
    );
  }, [rfInstance]);

  const handleSave = useCallback(async () => {
    if (!wf) return;
    setSaving(true);
    try {
      const graph = fromRF(nodes, edges);
      await fetch(`/api/portal/workflows/${wf.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, status, graph }),
      });
    } finally {
      setSaving(false);
    }
  }, [wf, nodes, edges, name, status]);

  const handleTestRun = useCallback(async () => {
    if (!wf) return;
    setTesting(true);
    try {
      // Save current graph first so the run uses the latest version.
      await handleSave();
      await fetch(`/api/portal/workflows/${wf.id}/test-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: {} }),
      });
      // Refresh runs list.
      const runsRes = await fetch(`/api/portal/workflows/${wf.id}/runs?limit=10`).then((r) => r.json());
      if (runsRes?.success) setRuns(runsRes.data ?? []);
    } finally {
      setTesting(false);
    }
  }, [wf, handleSave]);

  const handleDelete = useCallback(async () => {
    if (!wf) return;
    if (!confirm('¿Eliminar este flujo? Esta acción no se puede deshacer.')) return;
    await fetch(`/api/portal/workflows/${wf.id}`, { method: 'DELETE' });
    router.push('/portal/automations/workflows');
  }, [wf, router]);

  const handleSelectRun = useCallback(async (runId: number) => {
    if (selectedRunId === runId) {
      // Toggle: collapse if already open.
      setSelectedRunId(null);
      setRunSteps([]);
      return;
    }
    setSelectedRunId(runId);
    setRunSteps([]);
    setStepsLoading(true);
    try {
      const res = await fetch(`/api/portal/workflows/runs/${runId}`).then((r) => r.json());
      if (res?.success) setRunSteps(res.data?.steps ?? []);
    } finally {
      setStepsLoading(false);
    }
  }, [selectedRunId]);

  const handleRetry = useCallback(async (runId: number) => {
    setRetrying(true);
    try {
      await fetch(`/api/portal/workflows/runs/${runId}/retry`, { method: 'POST' });
      // Refresh runs list so the new pending status is reflected.
      if (wf) {
        const runsRes = await fetch(`/api/portal/workflows/${wf.id}/runs?limit=10`).then((r) => r.json());
        if (runsRes?.success) setRuns(runsRes.data ?? []);
      }
      // Refresh steps if this run is currently expanded.
      if (selectedRunId === runId) {
        const stepsRes = await fetch(`/api/portal/workflows/runs/${runId}`).then((r) => r.json());
        if (stepsRes?.success) setRunSteps(stepsRes.data?.steps ?? []);
      }
    } finally {
      setRetrying(false);
    }
  }, [wf, selectedRunId]);

  const triggerKindLabel = useMemo(() => wf?.trigger?.kind ?? '-', [wf]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6 text-sm text-muted-foreground">
        <span className="material-icons text-base align-middle animate-spin mr-2">autorenew</span>
        Cargando flujo...
      </div>
    );
  }
  if (!wf) {
    return (
      <div className="max-w-6xl mx-auto p-6 text-sm text-muted-foreground">
        Flujo no encontrado.
        <Link href="/portal/automations/workflows" className="text-primary ml-2 hover:underline">Volver a la lista</Link>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col gap-3 p-3">
      {/* Aviso — la ejecución se procesa por el cron de fondo */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200 text-xs">
        <span className="material-icons text-base shrink-0">science</span>
        <span>
          <span className="font-semibold">Beta — la ejecución de flujos aún se está afinando.</span>{' '}
          Los flujos activos se ejecutan desde eventos de CRM, formularios y programaciones (cron); los de webhook se prueban con «Probar ejecución».
        </span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/portal/automations/workflows" className="text-muted-foreground hover:text-foreground">
          <span className="material-icons">arrow_back</span>
        </Link>
        <input
          value={name} aria-label="Nombre del flujo"
          onChange={(e) => setName(e.target.value)}
          className="text-lg font-semibold bg-transparent border border-transparent hover:border-border focus:border-border rounded px-2 py-1 outline-none flex-1 min-w-[200px]"
        />
        <select
          aria-label="Estado del flujo" value={status}
          onChange={(e) => setStatus(e.target.value as WorkflowStatus)}
          className="text-xs px-2 py-1 border border-border rounded bg-background"
        >
          <option value="draft">Borrador</option>
          <option value="active">Activo</option>
          <option value="paused">Pausado</option>
        </select>
        <span className="text-xs text-muted-foreground">
          Disparador: <code className="font-mono">{triggerKindLabel}</code>
        </span>
        <button
          type="button"
          onClick={handleTestRun}
          disabled={testing}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted disabled:opacity-60"
        >
          <span className="material-icons text-sm">play_arrow</span>
          {testing ? 'Ejecutando...' : 'Probar ejecución'}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-foreground text-background hover:bg-foreground/90 disabled:opacity-60"
        >
          <span className="material-icons text-sm">save</span>
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20"
        >
          <span className="material-icons text-sm">delete</span>
          Eliminar
        </button>
      </div>

      {/* Canvas + sidebar */}
      <div className="flex flex-1 gap-3 min-h-0">
        {/* Sidebar */}
        <div className="w-56 bg-card border border-border rounded-xl p-3 overflow-y-auto">
          <h3 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Disparadores</h3>
          <div className="space-y-1 mb-4">
            {PALETTE.filter((p) => p.type === 'trigger').map((p) => (
              <PaletteButton key={p.label} entry={p} onAdd={handleAdd} />
            ))}
          </div>
          <h3 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Acciones</h3>
          <div className="space-y-1 mb-4">
            {PALETTE.filter((p) => p.type === 'action').map((p) => (
              <PaletteButton key={p.label} entry={p} onAdd={handleAdd} />
            ))}
          </div>
          <h3 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Lógica</h3>
          <div className="space-y-1">
            {PALETTE.filter((p) => p.type === 'condition').map((p) => (
              <PaletteButton key={p.label} entry={p} onAdd={handleAdd} />
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onInit={setRfInstance}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>

        {/* Inspector */}
        {selectedNode && (
          <NodeInspector node={selectedNode} onChange={updatePayloadField} onClose={() => setSelectedNodeId(null)} />
        )}

        {/* Runs panel */}
        <div className="w-72 bg-card border border-border rounded-xl p-3 overflow-y-auto">
          <h3 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Ejecuciones recientes</h3>
          {runs.length === 0 ? (
            <div className="text-xs text-muted-foreground">Aún no hay ejecuciones. Pulsa «Probar ejecución» para lanzar una.</div>
          ) : (
            <ul className="space-y-2">
              {runs.map((r) => (
                <li key={r.id} className="text-xs border border-border rounded">
                  {/* Run header row — click to expand step drill-down */}
                  <button
                    type="button"
                    onClick={() => void handleSelectRun(r.id)}
                    className="w-full flex items-center justify-between gap-1 p-2 text-left hover:bg-muted/50 rounded-t transition-colors"
                  >
                    <span className="flex items-center gap-1 font-medium">
                      <span className="material-icons text-sm text-muted-foreground">
                        {selectedRunId === r.id ? 'expand_less' : 'expand_more'}
                      </span>
                      #{r.id}
                    </span>
                    <RunStatusBadge status={r.status} />
                  </button>
                  <div className="px-2 pb-1 text-muted-foreground">
                    {r.triggeredBy} · {new Date(r.startedAt).toLocaleTimeString()}
                    {r.completedAt && (
                      <span> → {new Date(r.completedAt).toLocaleTimeString()}</span>
                    )}
                  </div>
                  {r.error && (
                    <div className="px-2 pb-1 text-red-600 line-clamp-3">{r.error}</div>
                  )}

                  {/* Retry button — only shown for failed runs (dead-lettered) */}
                  {r.status === 'failed' && (
                    <div className="px-2 pb-2">
                      <button
                        type="button"
                        onClick={() => void handleRetry(r.id)}
                        disabled={retrying}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-muted disabled:opacity-60 text-xs"
                      >
                        <span className="material-icons text-sm">replay</span>
                        {retrying ? 'Reintentando…' : 'Reintentar'}
                      </button>
                    </div>
                  )}

                  {/* Step drill-down — expanded when this run is selected */}
                  {selectedRunId === r.id && (
                    <div className="border-t border-border px-2 py-2">
                      {stepsLoading ? (
                        <div className="flex items-center gap-1 text-muted-foreground py-1">
                          <span className="material-icons text-sm animate-spin">autorenew</span>
                          Cargando pasos…
                        </div>
                      ) : runSteps.length === 0 ? (
                        <div className="text-muted-foreground py-1">Aún no hay registros de pasos.</div>
                      ) : (
                        <ul className="space-y-1.5">
                          {runSteps.map((s) => (
                            <li key={s.id} className="rounded bg-muted/40 p-1.5">
                              <div className="flex items-center justify-between gap-1 mb-0.5">
                                <span className="font-mono truncate max-w-[100px]" title={s.nodeId}>
                                  {s.nodeId}
                                </span>
                                <StepStatusBadge status={s.status} />
                              </div>
                              <div className="text-muted-foreground">
                                <span className="font-medium">{s.action}</span>
                                {s.attemptCount > 0 && (
                                  <span className="ml-1">· {s.attemptCount} {s.attemptCount !== 1 ? 'intentos' : 'intento'}</span>
                                )}
                              </div>
                              {s.nextRetryAt && (
                                <div className="text-amber-600 dark:text-amber-400 mt-0.5">
                                  <span className="material-icons text-xs align-middle mr-0.5">schedule</span>
                                  Reintento a las {new Date(s.nextRetryAt).toLocaleTimeString()}
                                </div>
                              )}
                              {s.error && (
                                <div className="text-red-600 mt-0.5 line-clamp-2" title={s.error}>
                                  {s.error}
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Footer hint */}
      <div className="text-xs text-muted-foreground">
        <span className="material-icons text-sm align-middle mr-1">info</span>
        Haz clic en una entrada de la paleta para añadirla al lienzo. Haz clic en un nodo para abrir su inspector y configurar sus datos. Arrastra los nodos para recolocarlos y desde un conector para conectarlos.
      </div>
    </div>
  );
}

function NodeInspector({ node, onChange, onClose }: { node: Node; onChange: (field: string, value: string | number) => void; onClose: () => void }) {
  const payload = node.data.payload as Record<string, unknown>;
  const kind = String(payload.kind);
  const fields = kind === 'schedule' ? [['cron', 'Expresión cron', String(payload.cron ?? '')]] : kind === 'send_email' ? [['templateId', 'ID de plantilla', String(payload.templateId ?? 0)], ['to', 'Destinatario', String(payload.to ?? 'contact')]] : kind === 'add_to_list' ? [['listId', 'ID de lista', String(payload.listId ?? 0)]] : kind === 'condition' ? [['expression', 'Expresión', String(payload.expression ?? '')]] : kind === 'create_task' ? [['title', 'Título', String(payload.title ?? '')]] : kind === 'webhook' ? [['url', 'URL', String(payload.url ?? '')]] : [];
  return <aside className="w-64 bg-card border border-border rounded-xl p-3 overflow-y-auto" aria-label="Inspector del nodo"><div className="flex items-center justify-between mb-3"><h3 className="text-xs font-semibold uppercase tracking-wide">Configurar nodo</h3><button type="button" onClick={onClose} aria-label="Cerrar inspector" className="text-muted-foreground hover:text-foreground"><span className="material-icons text-sm">close</span></button></div><div className="text-xs text-muted-foreground mb-3">{nodeLabel(payload as WorkflowTriggerConfig | WorkflowAction)}</div>{fields.length === 0 ? <p className="text-xs text-muted-foreground">Este nodo no tiene opciones configurables.</p> : fields.map(([field, label, value]) => <label key={field} className="block text-xs mb-3"><span className="block mb-1 font-medium">{label}</span><input aria-label={label} value={value} type={field.endsWith('Id') ? 'number' : 'text'} onChange={(event) => onChange(field, field.endsWith('Id') ? Number(event.target.value) : event.target.value)} className="w-full px-2 py-1.5 border border-border rounded bg-background" /></label>)}</aside>;
}

function PaletteButton({ entry, onAdd }: { entry: PaletteEntry; onAdd: (e: PaletteEntry) => void }) {
  return (
    <button
      type="button"
      onClick={() => onAdd(entry)}
      className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left rounded hover:bg-muted transition-colors"
    >
      <span className="material-icons text-base text-primary">{entry.icon}</span>
      <span>{entry.label}</span>
    </button>
  );
}

const RUN_STATUS_LABEL: Record<string, string> = { completed: 'Completada', running: 'En curso', pending: 'Pendiente', failed: 'Fallida' };

function RunStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    pending: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded ${styles[status] ?? styles.pending}`}>{RUN_STATUS_LABEL[status] ?? status}</span>
  );
}

const STEP_STATUS_LABEL: Record<string, string> = { completed: 'Completado', running: 'En curso', pending: 'Pendiente', failed: 'Fallido', dead_letter: 'Descartado' };

function StepStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    pending: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    failed: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    dead_letter: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };
  return (
    <span className={`px-1 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${styles[status] ?? styles.pending}`}>
      {STEP_STATUS_LABEL[status] ?? status}
    </span>
  );
}
