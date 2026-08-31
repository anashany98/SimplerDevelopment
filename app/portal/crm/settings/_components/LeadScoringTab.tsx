'use client';

import { useState, useEffect, useRef } from 'react';

interface ScoringRule {
  id: number;
  eventType: string;
  points: number;
  description: string | null;
  enabled: boolean;
}

export default function LeadScoringTab() {
  const [scoringRules, setScoringRules] = useState<ScoringRule[]>([]);
  const [scoringLoaded, setScoringLoaded] = useState(false);
  const scoringFetchingRef = useRef(false);
  // create form
  const [newEventType, setNewEventType] = useState('');
  const [newPoints, setNewPoints] = useState('10');
  const [newDescription, setNewDescription] = useState('');
  const [scoringSaving, setScoringSaving] = useState(false);
  // inline edit
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [editEventType, setEditEventType] = useState('');
  const [editPoints, setEditPoints] = useState('');
  const [editDescription, setEditDescription] = useState('');

  useEffect(() => {
    if (!scoringLoaded && !scoringFetchingRef.current) {
      scoringFetchingRef.current = true;
      fetch('/api/portal/crm/scoring-rules')
        .then(r => r.json())
        .then(d => {
          setScoringRules(d.data ?? []);
          setScoringLoaded(true);
          scoringFetchingRef.current = false;
        })
        .catch(() => { scoringFetchingRef.current = false; });
    }
  }, [scoringLoaded]);

  async function createScoringRule(e: React.FormEvent) {
    e.preventDefault();
    if (!newEventType.trim()) return;
    setScoringSaving(true);
    const res = await fetch('/api/portal/crm/scoring-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: newEventType.trim(),
        points: Number(newPoints),
        description: newDescription.trim() || null,
        enabled: true,
      }),
    });
    const d = await res.json();
    setScoringSaving(false);
    if (d.success) {
      setScoringRules(prev => [...prev, d.data]);
      setNewEventType('');
      setNewPoints('10');
      setNewDescription('');
    }
  }

  async function saveScoringRule(id: number) {
    if (!editEventType.trim()) return;
    const res = await fetch(`/api/portal/crm/scoring-rules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: editEventType.trim(),
        points: Number(editPoints),
        description: editDescription.trim() || null,
      }),
    });
    const d = await res.json();
    if (d.success) {
      setScoringRules(prev => prev.map(r => r.id === id ? d.data : r));
      setEditingRuleId(null);
    }
  }

  async function toggleScoringRule(rule: ScoringRule) {
    const res = await fetch(`/api/portal/crm/scoring-rules/${rule.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    const d = await res.json();
    if (d.success) {
      setScoringRules(prev => prev.map(r => r.id === rule.id ? d.data : r));
    }
  }

  async function deleteScoringRule(id: number) {
    if (!confirm('¿Eliminar esta regla de puntuación?')) return;
    const res = await fetch(`/api/portal/crm/scoring-rules/${id}`, { method: 'DELETE' });
    const d = await res.json();
    if (d.success) {
      setScoringRules(prev => prev.filter(r => r.id !== id));
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-6">
      <div>
        <h3 className="font-semibold text-foreground text-lg">Puntuación de leads</h3>
        {/* NOTE: "automátically" here is aspirational — see the comment on
            POST /api/portal/crm/contacts/[id]/score. No in-app event calls
            that endpoint today; applying a rule's points is manual/API-only. */}
        <p className="text-sm text-muted-foreground mt-1">
          Asigna puntos a eventos de contacto (aperturas de email, envíos de formularios, reuniones reservadas y más).
          Cuando un contacto dispara un evento, los puntos de la regla coincidente se añaden automáticamente
          a su puntuación — las puntuaciones altas destacan a tus leads más comprometidos y listos para vender.
        </p>
        <div className="mt-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Ejemplo:</span> Email abierto
          <span className="font-semibold text-foreground"> +5</span>, Formulario enviado
          <span className="font-semibold text-foreground"> +15</span>, Reunión reservada
          <span className="font-semibold text-foreground"> +25</span>. Un contacto que abre dos emails,
          envía un formulario y reserva una reunión alcanza <span className="font-semibold text-foreground">50</span> puntos —
          lo marca como lead caliente para priorizar.
        </div>
      </div>

      {!scoringLoaded && (
        <div className="flex items-center justify-center py-10">
          <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
        </div>
      )}

      {scoringLoaded && (
        <>
          {/* Rule list */}
          <div className="space-y-2">
            {scoringRules.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Aún no hay reglas de puntuación. Añade una abajo para empezar a puntuar leads.
              </p>
            )}
            {scoringRules.map(rule => (
              <div
                key={rule.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${
                  rule.enabled ? 'border-border bg-background' : 'border-border/50 bg-muted/30 opacity-60'
                }`}
              >
                {editingRuleId === rule.id ? (
                  <>
                    <div className="flex-1 grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Tipo de evento</label>
                        <input
                          value={editEventType}
                          onChange={e => setEditEventType(e.target.value)}
                          className="w-full px-2 py-1 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Puntos</label>
                        <input
                          type="number"
                          value={editPoints}
                          onChange={e => setEditPoints(e.target.value)}
                          className="w-full px-2 py-1 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Descripción</label>
                        <input
                          value={editDescription}
                          onChange={e => setEditDescription(e.target.value)}
                          className="w-full px-2 py-1 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => saveScoringRule(rule.id)}
                        className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 transition-colors"
                      >
                        Guardar
                      </button>
                      <button
                        onClick={() => setEditingRuleId(null)}
                        className="px-3 py-1 bg-muted text-foreground rounded text-xs font-medium hover:bg-accent transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => toggleScoringRule(rule)}
                      title={rule.enabled ? 'Desactivar regla' : 'Activar regla'}
                      className={`shrink-0 w-9 h-5 rounded-full transition-colors relative ${
                        rule.enabled ? 'bg-primary' : 'bg-muted-foreground/30'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                          rule.enabled ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground font-mono">{rule.eventType}</span>
                        <span
                          className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                            rule.points > 0
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : rule.points < 0
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {rule.points > 0 ? '+' : ''}{rule.points} pts
                        </span>
                      </div>
                      {rule.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{rule.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => {
                          setEditingRuleId(rule.id);
                          setEditEventType(rule.eventType);
                          setEditPoints(String(rule.points));
                          setEditDescription(rule.description ?? '');
                        }}
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        title="Editar regla"
                      >
                        <span className="material-icons text-base">edit</span>
                      </button>
                      <button
                        onClick={() => deleteScoringRule(rule.id)}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Eliminar regla"
                      >
                        <span className="material-icons text-base">delete</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Create rule form */}
          <form onSubmit={createScoringRule} className="pt-4 border-t border-border space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Añadir regla</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Tipo de evento</label>
                <input
                  value={newEventType}
                  onChange={e => setNewEventType(e.target.value)}
                  placeholder="p. ej. form_submitted"
                  className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Puntos</label>
                <input
                  type="number"
                  value={newPoints}
                  onChange={e => setNewPoints(e.target.value)}
                  className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Descripción (opcional)</label>
                <input
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  placeholder="p. ej. El contacto envió un formulario"
                  className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={scoringSaving || !newEventType.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {scoringSaving && <span className="material-icons animate-spin text-sm">refresh</span>}
                <span className="material-icons text-sm">add</span>
                Añadir regla
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
