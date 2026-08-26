'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pCard } from '@/components/portal/portal-ui';

interface WorkflowRow {
  id: number;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'paused';
  trigger: { kind: string };
  updatedAt: string;
}

interface TemplateOption {
  id: string;
  icon: string;
  name: string;
  description: string;
  triggerKind: string;
  nodeCount: number;
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  paused: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  active: 'Activo',
  paused: 'Pausado',
};

export default function WorkflowsListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<WorkflowRow[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null);
  const [creatingBlank, setCreatingBlank] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/portal/workflows').then((r) => r.json()),
      fetch('/api/portal/workflows/templates').then((r) => r.json()),
    ])
      .then(([listRes, tplRes]) => {
        if (listRes?.success) setRows(listRes.data ?? []);
        if (tplRes?.success) setTemplates(tplRes.data ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const createBlank = async () => {
    setCreatingBlank(true);
    try {
      const res = await fetch('/api/portal/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Flujo sin título' }),
      });
      const data = await res.json();
      if (data?.success && data.data?.id) router.push(`/portal/automations/workflows/${data.data.id}`);
    } finally {
      setCreatingBlank(false);
    }
  };

  const createFromTemplate = async (templateId: string) => {
    setCreatingTemplateId(templateId);
    try {
      const res = await fetch('/api/portal/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId }),
      });
      const data = await res.json();
      if (data?.success && data.data?.id) router.push(`/portal/automations/workflows/${data.data.id}`);
    } finally {
      setCreatingTemplateId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Aviso Beta — la ejecución se procesa por el cron de fondo */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
        <span className="material-icons text-xl mt-0.5 shrink-0">science</span>
        <div className="text-sm">
          <span className="font-semibold">Beta — la ejecución de flujos aún se está afinando.</span>{' '}
          Los flujos activos se ejecutan en segundo plano desde eventos de CRM y formularios.
          Los disparadores programados y de webhook se pueden probar con «Probar ejecución».
        </div>
      </div>

      <PortalPageHeader
        eyebrow="Automatizaciones"
        title="Flujos de trabajo"
        subtitle="Automatizaciones visuales de disparador a acción. Construye un grafo, pruébalo y actívalo."
        actions={
          <>
            <button
              type="button"
              onClick={() => setShowTemplatePicker((v) => !v)}
              className={pBtnGhost}
            >
              <span className="material-icons text-lg">auto_awesome</span>
              Nuevo desde plantilla
            </button>
            <button
              type="button"
              onClick={createBlank}
              disabled={creatingBlank}
              className={pBtnPrimary}
            >
              <span className="material-icons text-lg">add</span>
              Nuevo en blanco
            </button>
          </>
        }
      />

      {showTemplatePicker && (
        <div className={`${pCard} p-5 space-y-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Elige una plantilla</h2>
            <button
              type="button"
              onClick={() => setShowTemplatePicker(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <span className="material-icons text-base align-middle">close</span>
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => createFromTemplate(t.id)}
                disabled={creatingTemplateId === t.id}
                className="text-left p-3 rounded-2xl border border-border bg-card hover:border-primary hover:bg-muted/50 transition-colors disabled:opacity-60"
              >
                <div className="flex items-start gap-3">
                  <span className="material-icons text-primary">{t.icon}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{t.name}</div>
                    <div className="text-xs text-muted-foreground line-clamp-2 mt-1">{t.description}</div>
                    <div className="text-xs text-muted-foreground mt-2">
                      Disparador: <code className="font-mono">{t.triggerKind}</code> · {t.nodeCount} nodos
                    </div>
                  </div>
                </div>
              </button>
            ))}
            {templates.length === 0 && (
              <div className="text-sm text-muted-foreground col-span-full">No hay plantillas disponibles.</div>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className={`${pCard} p-10 text-center`}>
          <span className="material-icons text-3xl text-muted-foreground animate-spin">progress_activity</span>
          <p className="text-sm text-muted-foreground mt-2">Cargando flujos de trabajo...</p>
        </div>
      ) : rows.length === 0 ? (
        <div className={`${pCard} p-10 text-center space-y-4`}>
          <span className="material-icons text-5xl text-muted-foreground/50">account_tree</span>
          <h2 className="text-lg font-semibold text-foreground">Aún no hay flujos de trabajo</h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Los flujos de trabajo encadenan disparadores y acciones de forma visual.
            Empieza desde una plantilla o crea un lienzo en blanco y arrastra nodos.
          </p>
        </div>
      ) : (
        <div className={`${pCard} overflow-hidden`}>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-muted/50">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Disparador</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Actualizado</th>
                <th className="px-4 py-3 font-medium" aria-label="acciones" />
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link
                      href={`/portal/automations/workflows/${w.id}`}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {w.name}
                    </Link>
                    {w.description && (
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{w.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs font-mono text-muted-foreground">{w.trigger?.kind ?? '-'}</code>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        STATUS_BADGE[w.status] ?? STATUS_BADGE.draft
                      }`}
                    >
                      {STATUS_LABEL[w.status] ?? w.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(w.updatedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/portal/automations/workflows/${w.id}`}
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                    >
                      Abrir
                      <span className="material-icons text-sm">arrow_forward</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
