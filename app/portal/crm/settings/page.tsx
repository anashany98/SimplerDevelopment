'use client';

import { useState, useEffect } from 'react';
import ProductAutomationSettings from '@/components/portal/ProductAutomationSettings';
import type { AutomationPreset } from '@/components/portal/ProductAutomationSettings';
import CrmCustomFieldsAdmin from '@/components/portal/CrmCustomFieldsAdmin';
import LeadScoringTab from './_components/LeadScoringTab';
import NotificationsTab from './_components/NotificationsTab';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary } from '@/components/portal/portal-ui';

// All 5 presets below wire to the same `create_support_ticket` tool (only the
// subject/body differ) — none send email, so there's nothing to check in an
// email inbox for these. `deal_created_project`'s name/description promise
// project creation, but its action is `create_support_ticket` like the rest;
// no Projects/Kanban row is ever created — treat the name as aspirational.
const CRM_AUTOMATION_PRESETS: AutomationPreset[] = [
  {
    key: 'deal_won_notification',
    name: 'Aviso de negocio ganado',
    description: 'Crea una tarea para arrancar el onboarding cuando un negocio se marca como ganado',
    icon: 'celebration',
    trigger: { event: 'crm.deal.won' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Negocio ganado: {{event.title}} - Iniciar onboarding', body: '¡El negocio "{{event.title}}" se ha ganado! Inicia el proceso de onboarding para el cliente.' } }],
  },
  {
    key: 'deal_lost_review',
    name: 'Revisión de negocio perdido',
    description: 'Crea una tarea de revisión cuando un negocio se pierde para analizar qué salió mal',
    icon: 'rate_review',
    trigger: { event: 'crm.deal.lost' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Revisión de negocio perdido: {{event.title}}', body: 'El negocio "{{event.title}}" se ha perdido. Programa una revisión para entender qué pasó y mejorar el proceso.' } }],
  },
  {
    key: 'new_contact_task',
    name: 'Seguimiento de nuevo contacto',
    description: 'Crea una tarea de seguimiento cuando se añade un nuevo contacto al CRM',
    icon: 'person_add',
    trigger: { event: 'crm.contact.created' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Seguimiento con nuevo contacto: {{event.name}}', body: 'Nuevo contacto añadido: {{event.name}} ({{event.email}}). Contacta dentro de 24 horas.' } }],
    settings: [
      {
        key: 'followUpDelay',
        label: 'Seguimiento dentro de',
        type: 'select',
        options: [
          { value: '0', label: 'Inmediatamente' },
          { value: '3600', label: '1 hora' },
          { value: '86400', label: '1 día' },
          { value: '172800', label: '2 días' },
        ],
        defaultValue: '0',
        mapsTo: { actionIndex: 0, paramKey: 'delay' },
      },
    ],
  },
  {
    key: 'deal_stage_change',
    name: 'Aviso de cambio de etapa',
    description: 'Recibe un aviso cuando un negocio pasa a una nueva etapa del pipeline',
    icon: 'swap_horiz',
    trigger: { event: 'crm.deal.updated' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Negocio movido: {{event.title}}', body: 'El negocio "{{event.title}}" se ha actualizado. Revisa la nueva etapa y planifica los siguientes pasos.' } }],
  },
  {
    key: 'deal_created_project',
    name: 'Crear proyecto automáticamente al ganar un negocio',
    description: 'Crea automáticamente un proyecto cuando un negocio se gana para hacer seguimiento de la entrega',
    icon: 'view_kanban',
    trigger: { event: 'crm.deal.won' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Nuevo proyecto necesario: {{event.title}}', body: 'El negocio "{{event.title}}" se ha ganado. Debería crearse un proyecto para hacer seguimiento de la entrega.' } }],
  },
];

interface Pipeline {
  id: number;
  name: string;
  stages: Stage[];
}

interface Stage {
  id: number;
  name: string;
  color: string;
  probability: number;
  order: number;
}

interface Tag {
  id: number;
  name: string;
  color: string;
}

const defaultColors = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#6366f1', '#14b8a6', '#f97316',
];

type SettingsTab = 'pipelines' | 'tags' | 'custom-fields' | 'automations' | 'lead-scoring' | 'notifications';

const SETTINGS_TABS: { value: SettingsTab; label: string; icon: string }[] = [
  { value: 'pipelines', label: 'Pipelines', icon: 'view_column' },
  { value: 'tags', label: 'Etiquetas', icon: 'sell' },
  { value: 'custom-fields', label: 'Campos personalizados', icon: 'tune' },
  { value: 'automations', label: 'Automatizaciones', icon: 'bolt' },
  { value: 'lead-scoring', label: 'Puntuación de leads', icon: 'leaderboard' },
  { value: 'notifications', label: 'Notificaciones', icon: 'notifications' },
];

export default function CrmSettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('pipelines');
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  // Pipeline form
  const [newPipelineName, setNewPipelineName] = useState('');
  const [pipelineSaving, setPipelineSaving] = useState(false);
  const [editingPipelineId, setEditingPipelineId] = useState<number | null>(null);
  const [editPipelineName, setEditPipelineName] = useState('');

  // Stage form
  const [expandedPipelineId, setExpandedPipelineId] = useState<number | null>(null);
  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState('#3b82f6');
  const [newStageProbability, setNewStageProbability] = useState('50');
  const [stageSaving, setStageSaving] = useState(false);

  // Tag form
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const [tagSaving, setTagSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/portal/crm/pipelines').then(r => r.json()),
      fetch('/api/portal/crm/tags').then(r => r.json()),
    ]).then(([p, t]) => {
      setPipelines(p.data ?? []);
      setTags(t.data ?? []);
      setLoading(false);
    });
  }, []);

  async function createPipeline(e: React.FormEvent) {
    e.preventDefault();
    if (!newPipelineName.trim()) return;
    setPipelineSaving(true);
    const res = await fetch('/api/portal/crm/pipelines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newPipelineName.trim() }),
    });
    const d = await res.json();
    setPipelineSaving(false);
    if (d.success) {
      setPipelines(prev => [...prev, { ...d.data, stages: d.data.stages ?? [] }]);
      setNewPipelineName('');
    }
  }

  async function updatePipelineName(id: number) {
    if (!editPipelineName.trim()) return;
    await fetch(`/api/portal/crm/pipelines/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editPipelineName.trim() }),
    });
    setPipelines(prev => prev.map(p => p.id === id ? { ...p, name: editPipelineName.trim() } : p));
    setEditingPipelineId(null);
  }

  async function deletePipeline(id: number) {
    if (!confirm('¿Eliminar este pipeline y todas sus etapas? Los negocios quedarán sin asignar.')) return;
    await fetch(`/api/portal/crm/pipelines/${id}`, { method: 'DELETE' });
    setPipelines(prev => prev.filter(p => p.id !== id));
    if (expandedPipelineId === id) setExpandedPipelineId(null);
  }

  async function addStage(pipelineId: number, e: React.FormEvent) {
    e.preventDefault();
    if (!newStageName.trim()) return;
    setStageSaving(true);
    const pipeline = pipelines.find(p => p.id === pipelineId);
    const order = (pipeline?.stages?.length ?? 0) + 1;
    const res = await fetch(`/api/portal/crm/pipelines/${pipelineId}/stages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newStageName.trim(),
        color: newStageColor,
        probability: Number(newStageProbability),
        order,
      }),
    });
    const d = await res.json();
    setStageSaving(false);
    if (d.success) {
      setPipelines(prev =>
        prev.map(p =>
          p.id === pipelineId
            ? { ...p, stages: [...(p.stages ?? []), d.data] }
            : p
        )
      );
      setNewStageName('');
      setNewStageColor('#3b82f6');
      setNewStageProbability('50');
    }
  }

  async function deleteStage(pipelineId: number, stageId: number) {
    if (!confirm('¿Eliminar esta etapa? Los negocios de esta etapa deberán reasignarse.')) return;
    await fetch(`/api/portal/crm/pipelines/${pipelineId}/stages/${stageId}`, { method: 'DELETE' });
    setPipelines(prev =>
      prev.map(p =>
        p.id === pipelineId
          ? { ...p, stages: (p.stages ?? []).filter(s => s.id !== stageId) }
          : p
      )
    );
  }

  async function moveStage(pipelineId: number, stageId: number, direction: 'up' | 'down') {
    const pipeline = pipelines.find(p => p.id === pipelineId);
    if (!pipeline) return;
    const sorted = [...(pipeline.stages ?? [])].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex(s => s.id === stageId);
    if (direction === 'up' && idx <= 0) return;
    if (direction === 'down' && idx >= sorted.length - 1) return;

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const tempOrder = sorted[idx].order;
    sorted[idx].order = sorted[swapIdx].order;
    sorted[swapIdx].order = tempOrder;

    // Optimistic update
    setPipelines(prev =>
      prev.map(p => p.id === pipelineId ? { ...p, stages: [...sorted] } : p)
    );

    // Persist
    await fetch(`/api/portal/crm/pipelines/${pipelineId}/stages`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stages: sorted.sort((a, b) => a.order - b.order).map((s, i) => ({ id: s.id, order: i + 1 })),
      }),
    });
  }

  async function createTag(e: React.FormEvent) {
    e.preventDefault();
    if (!newTagName.trim()) return;
    setTagSaving(true);
    const res = await fetch('/api/portal/crm/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
    });
    const d = await res.json();
    setTagSaving(false);
    if (d.success) {
      setTags(prev => [...prev, d.data]);
      setNewTagName('');
      setNewTagColor('#3b82f6');
    }
  }

  async function deleteTag(id: number) {
    if (!confirm('¿Eliminar esta etiqueta?')) return;
    await fetch(`/api/portal/crm/tags/${id}`, { method: 'DELETE' });
    setTags(prev => prev.filter(t => t.id !== id));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <PortalPageHeader eyebrow="CRM" title="Ajustes del CRM" subtitle="Gestiona pipelines, etiquetas, campos y automatizaciones" />
      {/* Tab nav */}
      <div className="flex border-b border-border overflow-x-auto">
        {SETTINGS_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors shrink-0 ${
              activeTab === tab.value
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="material-icons text-base">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Pipelines */}
      {activeTab === 'pipelines' && (
      <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
        <div>
          <h2 className="font-display text-[17px] font-extrabold tracking-[-0.02em] text-foreground">Pipelines</h2>
          <p className="text-sm text-muted-foreground mt-1">Gestiona tus pipelines de negocios y sus etapas.</p>
        </div>

        {/* Pipeline list */}
        <div className="space-y-3">
          {pipelines.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">Aún no hay pipelines. Crea uno para empezar.</p>
          )}
          {pipelines.map(pipeline => (
            <div key={pipeline.id} className="border border-border rounded-xl overflow-hidden">
              {/* Pipeline header */}
              <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
                {editingPipelineId === pipeline.id ? (
                  <div className="flex items-center gap-2 flex-1 mr-2">
                    <input
                      value={editPipelineName}
                      onChange={e => setEditPipelineName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') updatePipelineName(pipeline.id);
                        if (e.key === 'Escape') setEditingPipelineId(null);
                      }}
                      autoFocus
                      className="flex-1 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
                    />
                    <button
                      onClick={() => updatePipelineName(pipeline.id)}
                      className="text-primary text-sm font-medium hover:underline"
                    >
                      Guardar
                    </button>
                    <button
                      onClick={() => setEditingPipelineId(null)}
                      className="text-muted-foreground text-sm hover:text-foreground"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setExpandedPipelineId(expandedPipelineId === pipeline.id ? null : pipeline.id)}
                    className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors"
                  >
                    <span className="material-icons text-base">
                      {expandedPipelineId === pipeline.id ? 'expand_more' : 'chevron_right'}
                    </span>
                    {pipeline.name}
                    <span className="text-xs text-muted-foreground font-normal">
                      ({(pipeline.stages ?? []).length} etapa{(pipeline.stages ?? []).length !== 1 ? 's' : ''})
                    </span>
                  </button>
                )}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditingPipelineId(pipeline.id);
                      setEditPipelineName(pipeline.name);
                    }}
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    title="Renombrar"
                  >
                    <span className="material-icons text-base">edit</span>
                  </button>
                  <button
                    onClick={() => deletePipeline(pipeline.id)}
                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Eliminar"
                  >
                    <span className="material-icons text-base">delete</span>
                  </button>
                </div>
              </div>

              {/* Stages */}
              {expandedPipelineId === pipeline.id && (
                <div className="p-4 space-y-3">
                  {/* Stage list */}
                  {(pipeline.stages ?? []).sort((a, b) => a.order - b.order).map((stage, i) => (
                    <div key={stage.id} className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-accent/50 transition-colors">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: stage.color || '#6b7280' }}
                      />
                      <span className="text-sm font-medium text-foreground flex-1">{stage.name}</span>
                      <span className="text-xs text-muted-foreground">{stage.probability}%</span>
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => moveStage(pipeline.id, stage.id, 'up')}
                          disabled={i === 0}
                          className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                        >
                          <span className="material-icons text-sm">arrow_upward</span>
                        </button>
                        <button
                          onClick={() => moveStage(pipeline.id, stage.id, 'down')}
                          disabled={i === (pipeline.stages ?? []).length - 1}
                          className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                        >
                          <span className="material-icons text-sm">arrow_downward</span>
                        </button>
                        <button
                          onClick={() => deleteStage(pipeline.id, stage.id)}
                          className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors ml-1"
                        >
                          <span className="material-icons text-sm">close</span>
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Add stage form */}
                  <form onSubmit={e => addStage(pipeline.id, e)} className="flex items-end gap-3 pt-2 border-t border-border">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Nombre de la etapa</label>
                      <input
                        value={newStageName}
                        onChange={e => setNewStageName(e.target.value)}
                        placeholder="p. ej. Propuesta"
                        className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
                      />
                    </div>
                    <div className="w-20">
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Color</label>
                      <div className="flex gap-1 flex-wrap">
                        <input
                          type="color"
                          value={newStageColor}
                          onChange={e => setNewStageColor(e.target.value)}
                          className="w-8 h-8 rounded cursor-pointer border border-border"
                        />
                      </div>
                    </div>
                    <div className="w-20">
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Prob. %</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={newStageProbability}
                        onChange={e => setNewStageProbability(e.target.value)}
                        className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={stageSaving || !newStageName.trim()}
                      className={`${pBtnPrimary} shrink-0`}
                    >
                      {stageSaving && <span className="material-icons animate-spin text-xs">refresh</span>}
                      <span className="material-icons text-sm">add</span>
                      Añadir
                    </button>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Create pipeline */}
        <form onSubmit={createPipeline} className="flex gap-3 pt-2 border-t border-border">
          <input
            value={newPipelineName}
            onChange={e => setNewPipelineName(e.target.value)}
            placeholder="Nombre del nuevo pipeline..."
            className="flex-1 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
          />
          <button
            type="submit"
            disabled={pipelineSaving || !newPipelineName.trim()}
            className={pBtnPrimary}
          >
            {pipelineSaving && <span className="material-icons animate-spin text-sm">refresh</span>}
            Crear pipeline
          </button>
        </form>
      </div>
      )}

      {/* Tags */}
      {activeTab === 'tags' && (
      <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
        <div>
          <h2 className="font-display text-[17px] font-extrabold tracking-[-0.02em] text-foreground">Etiquetas</h2>
          <p className="text-sm text-muted-foreground mt-1">Gestiona las etiquetas para organizar tus contactos.</p>
        </div>

        {/* Tag list */}
        <div className="flex flex-wrap gap-2">
          {tags.length === 0 && (
            <p className="text-sm text-muted-foreground">Aún no hay etiquetas.</p>
          )}
          {tags.map(tag => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border border-border"
            >
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: tag.color || '#6b7280' }}
              />
              {tag.name}
              <button
                onClick={() => deleteTag(tag.id)}
                className="text-muted-foreground hover:text-destructive transition-colors ml-0.5"
              >
                <span className="material-icons text-xs">close</span>
              </button>
            </span>
          ))}
        </div>

        {/* Add tag form */}
        <form onSubmit={createTag} className="flex items-end gap-3 pt-2 border-t border-border">
          <div className="flex-1">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Nombre de la etiqueta</label>
            <input
              value={newTagName}
              onChange={e => setNewTagName(e.target.value)}
              placeholder="e.g. VIP"
              className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Color</label>
            <div className="flex gap-1 items-center">
              <input
                type="color"
                value={newTagColor}
                onChange={e => setNewTagColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-border"
              />
              <div className="flex gap-1">
                {defaultColors.slice(0, 5).map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewTagColor(color)}
                    className={`w-5 h-5 rounded-full border-2 transition-colors ${
                      newTagColor === color ? 'border-foreground' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>
          <button
            type="submit"
            disabled={tagSaving || !newTagName.trim()}
            className={pBtnPrimary}
          >
            {tagSaving && <span className="material-icons animate-spin text-sm">refresh</span>}
            Añadir etiqueta
          </button>
        </form>
      </div>
      )}

      {/* Custom Fields */}
      {activeTab === 'custom-fields' && (
      <div className="bg-card border border-border rounded-2xl p-6">
        <CrmCustomFieldsAdmin />
      </div>
      )}

      {/* ─── Automations ───────────────────────────────────────────────── */}
      {activeTab === 'automations' && (
      <div className="bg-card border border-border rounded-2xl p-6">
        <ProductAutomationSettings
          productScope="crm"
          presets={CRM_AUTOMATION_PRESETS}
          title="Automatizaciones del CRM"
          description="Automatiza seguimientos, avisos y flujos de trabajo para tus negocios y contactos"
        />
      </div>
      )}

      {/* ─── Lead Scoring ──────────────────────────────────────────────── */}
      {activeTab === 'lead-scoring' && <LeadScoringTab />}

      {/* ─── Notification Preferences ──────────────────────────────────── */}
      {activeTab === 'notifications' && <NotificationsTab />}
    </div>
  );
}
