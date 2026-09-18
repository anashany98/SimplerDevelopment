'use client';

// Severity summary + status-code / depth-distribution / indexability bars for
// the dashboard's default tab. No chart library — plain divs sized by
// percentage, matching the house "no chart libs" convention for simple
// distributions.

import { pCard, pCardPad } from '@/components/portal/portal-ui';
import { isRunActive } from './format';
import type { SeoRun } from './types';

function Bar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
        <span className="font-mono">{label}</span>
        <span>
          {count} ({pct}%)
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function OverviewTab({ run }: { run: SeoRun | null }) {
  if (!run) {
    return (
      <div className={`${pCard} p-10 text-center`}>
        <span className="material-icons text-4xl text-muted-foreground/50 mb-2">travel_explore</span>
        <p className="text-sm text-muted-foreground">Aún no hay rastreos. Ejecuta una auditoría para ver aquí los resultados.</p>
      </div>
    );
  }

  if (run.status === 'failed') {
    return (
      <div className={`${pCard} p-6 flex items-start gap-3`}>
        <span className="material-icons text-destructive">error</span>
        <div>
          <p className="font-semibold text-foreground text-sm">El último rastreo falló</p>
          <p className="text-sm text-muted-foreground mt-1">{run.error || 'Error desconocido.'}</p>
        </div>
      </div>
    );
  }

  if (isRunActive(run.status) && run.pagesCrawled === 0) {
    return (
      <div className={`${pCard} p-10 text-center`}>
        <span className="material-icons animate-spin text-3xl text-primary mb-2">progress_activity</span>
        <p className="text-sm text-muted-foreground">Rastreo en curso — los resultados aparecerán a medida que se obtengan las páginas.</p>
      </div>
    );
  }

  const { stats } = run;
  const statusCodes = stats.statusCodes ?? {};
  const depthDist = stats.depthDistribution ?? {};
  const statusTotal = Object.values(statusCodes).reduce((a, b) => a + b, 0);
  const depthTotal = Object.values(depthDist).reduce((a, b) => a + b, 0);
  const indexable = stats.indexable ?? 0;
  const nonIndexable = stats.nonIndexable ?? 0;
  const indexTotal = indexable + nonIndexable;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className={pCardPad}>
          <p className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">{run.pagesCrawled}</p>
          <p className="text-xs text-muted-foreground">Páginas rastreadas</p>
        </div>
        <div className={pCardPad}>
          <p className="font-display text-2xl font-extrabold tracking-[-0.02em] text-red-600 dark:text-red-400">
            {run.criticalCount}
          </p>
          <p className="text-xs text-muted-foreground">Problemas críticos</p>
        </div>
        <div className={pCardPad}>
          <p className="font-display text-2xl font-extrabold tracking-[-0.02em] text-yellow-600 dark:text-yellow-400">
            {run.warningCount}
          </p>
          <p className="text-xs text-muted-foreground">Advertencias</p>
        </div>
        <div className={pCardPad}>
          <p className="font-display text-2xl font-extrabold tracking-[-0.02em] text-blue-600 dark:text-blue-400">
            {run.noticeCount}
          </p>
          <p className="text-xs text-muted-foreground">Avisos</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={`${pCardPad} space-y-3`}>
          <h3 className="font-display text-sm font-extrabold tracking-[-0.01em] text-foreground">Códigos de estado</h3>
          {Object.keys(statusCodes).length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin datos.</p>
          ) : (
            Object.entries(statusCodes)
              .sort((a, b) => b[1] - a[1])
              .map(([code, count]) => <Bar key={code} label={code} count={count} total={statusTotal} />)
          )}
        </div>

        <div className={`${pCardPad} space-y-3`}>
          <h3 className="font-display text-sm font-extrabold tracking-[-0.01em] text-foreground">Profundidad de rastreo</h3>
          {Object.keys(depthDist).length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin datos.</p>
          ) : (
            Object.entries(depthDist)
              .sort((a, b) => Number(a[0]) - Number(b[0]))
              .map(([depth, count]) => <Bar key={depth} label={`Profundidad ${depth}`} count={count} total={depthTotal} />)
          )}
        </div>

        <div className={`${pCardPad} space-y-3 sm:col-span-2`}>
          <h3 className="font-display text-sm font-extrabold tracking-[-0.01em] text-foreground">Indexabilidad</h3>
          {indexTotal === 0 ? (
            <p className="text-xs text-muted-foreground">Sin datos.</p>
          ) : (
            <>
              <Bar label="Indexable" count={indexable} total={indexTotal} />
              <Bar label="No indexable" count={nonIndexable} total={indexTotal} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
