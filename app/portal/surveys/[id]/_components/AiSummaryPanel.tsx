'use client';

/**
 * AiSummaryPanel — generate + display AI-synthesized themes/sentiment/
 * per-question summaries for free-text survey answers (AI-01 / AI-02).
 *
 * Mounts only when the analytics tab has at least one text/textarea question
 * with a response (parent gates the render). Fetches the cached summary on
 * mount; offers a Generate button on empty, a Regenerate button on stale.
 */

import { useEffect, useState } from 'react';

interface PerQuestion {
  fieldId: string;
  label: string;
  summary: string;
  sampleCount: number;
}

interface SummaryData {
  summary: string;
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  themes: string[];
  perQuestion: PerQuestion[];
  generatedAt: string;
  responseCountAtGeneration: number;
  currentResponseCount: number;
  stale: boolean;
}

const SENTIMENT_BADGE: Record<SummaryData['sentiment'], string> = {
  positive: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  negative: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  mixed: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

export default function AiSummaryPanel({ surveyId }: { surveyId: number }) {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/portal/surveys/${surveyId}/ai-summary`);
        const j = await r.json();
        if (cancelled) return;
        if (j.success) setData(j.data);
        else setError(j.message || 'No se pudo cargar el resumen');
      } catch {
        if (!cancelled) setError('No se pudo cargar el resumen');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [surveyId]);

  async function generate(force = false) {
    setGenerating(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/portal/surveys/${surveyId}/ai-summary${force ? '?force=1' : ''}`,
        { method: 'POST' },
      );
      const j = await r.json();
      if (j.success) setData(j.data);
      else setError(j.message || 'No se pudo generar el resumen');
    } catch {
      setError('No se pudo generar el resumen');
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-2 text-sm text-muted-foreground">
        <span className="material-icons text-base animate-spin">autorenew</span>
        Cargando resumen por IA…
      </div>
    );
  }

  // No cached summary — invite generation.
  if (!data) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-start gap-3">
          <span className="material-icons text-primary text-2xl">auto_awesome</span>
          <div className="flex-1">
            <h4 className="font-semibold text-foreground text-sm">Resumen por IA de respuestas de texto</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Sintetiza temas, sentimiento y conclusiones por pregunta a partir de tus respuestas de texto libre.
              Se eliminan las cadenas de correo, teléfono y URL antes de enviar al modelo.
            </p>
          </div>
          <button
            type="button"
            onClick={() => generate(false)}
            disabled={generating}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-foreground text-background rounded-lg text-xs font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50 shrink-0"
          >
            <span className="material-icons text-base">
              {generating ? 'autorenew' : 'auto_awesome'}
            </span>
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </div>
        {error && <p className="text-xs text-destructive mt-3">{error}</p>}
      </div>
    );
  }

  const newResponses = data.currentResponseCount - data.responseCountAtGeneration;

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-foreground text-sm flex items-center gap-2">
            <span className="material-icons text-primary text-lg">auto_awesome</span>
            Resumen por IA
            <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full ${SENTIMENT_BADGE[data.sentiment]}`}>
              {data.sentiment}
            </span>
          </h4>
          <p className="text-xs text-muted-foreground mt-1">
            Generado {new Date(data.generatedAt).toLocaleString()} · {data.responseCountAtGeneration} respuesta{data.responseCountAtGeneration === 1 ? '' : 's'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => generate(true)}
          disabled={generating}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-muted text-foreground rounded-lg text-xs font-medium hover:bg-muted/70 transition-colors disabled:opacity-50 shrink-0"
          title={data.stale ? `${newResponses} ${newResponses === 1 ? 'respuesta nueva' : 'respuestas nuevas'} desde la última generación` : 'Regenerar resumen'}
        >
          <span className={`material-icons text-base ${generating ? 'animate-spin' : ''}`}>
            {generating ? 'autorenew' : 'refresh'}
          </span>
          {generating ? 'Generando…' : data.stale ? `Regenerar (+${newResponses})` : 'Regenerar'}
        </button>
      </div>

      {/* Overall summary */}
      <p className="text-sm text-foreground leading-relaxed">{data.summary}</p>

      {/* Themes */}
      {data.themes.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Temas</p>
          <div className="flex flex-wrap gap-1.5">
            {data.themes.map((t, i) => (
              <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Per-question */}
      {data.perQuestion.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Por pregunta</p>
          {data.perQuestion.map((q) => (
            <div key={q.fieldId} className="border border-border rounded-lg p-3">
              <p className="text-xs font-semibold text-foreground">
                {q.label} <span className="font-normal text-muted-foreground">· {q.sampleCount} respuesta{q.sampleCount === 1 ? '' : 's'}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{q.summary}</p>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
