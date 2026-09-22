'use client';

// Search tab — Google Search Console data for the project. Unlike the
// Issues/Pages tabs (which key off a crawl run and happily refetch every
// time the tab mounts), this data is project-level and its own fetch is
// comparatively expensive, so the dashboard shell owns the fetched result
// (`data`/`onDataChange`) and only the first tab-open triggers a request —
// see the `data === null` guard below. Reopening the tab after that renders
// straight from the cached prop; only an explicit "Import now" forces a
// refetch.

import { useCallback, useEffect, useState } from 'react';
import { pBtnGhost, pBtnPrimary, pCard, pCardPad } from '@/components/portal/portal-ui';
import { formatPct, formatPosition } from './format';
import { SearchPerformanceChart } from './SearchPerformanceChart';
import { SearchPerformanceReportsView } from './SearchPerformanceReports';
import type { GscImportResult, SearchPerformanceData } from './types';

interface Props {
  projectId: number;
  data: SearchPerformanceData | null;
  onDataChange: (data: SearchPerformanceData) => void;
}

// GscImportResult['skipped'] is a terse enum from lib/seo/gsc.ts, not
// user-facing copy — map it before it hits the screen.
const SKIP_MESSAGES: Record<string, string> = {
  'not-linked': 'Este proyecto no está vinculado a un sitio web alojado, así que no puede importar desde Search Console.',
  'not-connected': 'Google aún no está conectado para el sitio web alojado de este proyecto.',
  'up-to-date': 'Ya está actualizado: no hay nada nuevo que importar.',
};

export function SearchPerformanceTab({ projectId, data, onDataChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importNote, setImportNote] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/portal/seo/projects/${projectId}/search-performance`);
      const json = await res.json();
      if (!json.success) {
        setError(json.message || 'No se pudieron cargar los datos de Search Console.');
        return;
      }
      onDataChange(json.data);
    } catch {
      setError('Error de red al cargar los datos de Search Console.');
    } finally {
      setLoading(false);
    }
  }, [projectId, onDataChange]);

  // Lazy-fetch: only runs while `data` is still null, i.e. the first time
  // this tab is opened. Once the parent has cached a result, remounting on a
  // later tab switch sees a non-null `data` prop and skips the request.
  useEffect(() => {
    if (data === null) fetchData();
  }, [data, fetchData]);

  async function importNow() {
    setImporting(true);
    setImportError('');
    setImportNote('');
    try {
      const res = await fetch(`/api/portal/seo/projects/${projectId}/gsc-import`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setImportError(json.message || 'No se pudieron importar los datos de Search Console.');
        return;
      }
      const result = json.data as GscImportResult;
      if ('skipped' in result) {
        setImportNote(SKIP_MESSAGES[result.skipped] ?? result.skipped);
      } else {
        const { queries, pages } = result.imported;
        setImportNote(
          `Se importaron ${queries.toLocaleString()} ${queries === 1 ? 'consulta' : 'consultas'} en ${pages.toLocaleString()} ${pages === 1 ? 'página' : 'páginas'}.`,
        );
      }
      await fetchData();
    } catch {
      setImportError('Error de red al iniciar la importación.');
    } finally {
      setImporting(false);
    }
  }

  if (data === null) {
    if (error) return <p className="text-sm text-destructive">{error}</p>;
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <span className="material-icons animate-spin text-2xl">autorenew</span>
      </div>
    );
  }

  if (!data.connected) {
    return (
      <div className={`${pCard} p-10 text-center max-w-xl mx-auto`}>
        <span className="material-icons text-4xl text-muted-foreground/50 mb-2">link_off</span>
        <p className="text-sm text-muted-foreground">
          Los datos de Search Console necesitan que este proyecto esté vinculado a un sitio web alojado con
          Google conectado, en Ajustes del sitio → Google → Search Console. Los proyectos que siguen un dominio externo
          que no está alojado aquí no pueden establecer esa conexión hoy.
        </p>
      </div>
    );
  }

  if (!data.lastDate) {
    return (
      <div className={`${pCard} p-10 text-center max-w-xl mx-auto space-y-4`}>
        <div>
          <span className="material-icons text-4xl text-muted-foreground/50 mb-2">query_stats</span>
          <p className="text-sm text-muted-foreground">
            Este proyecto está conectado a Search Console{data.siteUrl ? ` (${data.siteUrl})` : ''}, pero todavía no se
            han importado datos.
          </p>
        </div>
        <button type="button" onClick={importNow} disabled={importing} className={`${pBtnPrimary} mx-auto`}>
          {importing ? (
            <>
              <span className="material-icons text-base animate-spin">autorenew</span>
                Importando…
            </>
          ) : (
            <>
              <span className="material-icons text-base">sync</span>
                Importar ahora
            </>
          )}
        </button>
        {importError && <p className="text-xs text-destructive">{importError}</p>}
        {!importError && importNote && <p className="text-xs text-muted-foreground">{importNote}</p>}
      </div>
    );
  }

  const { overview, reports } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-mono text-muted-foreground truncate" title={data.siteUrl ?? undefined}>
            {data.siteUrl}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Datos hasta {data.lastDate}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button type="button" onClick={importNow} disabled={importing || loading} className={pBtnGhost}>
            {importing ? (
              <>
                <span className="material-icons text-base animate-spin">autorenew</span>
              Importando…
              </>
            ) : (
              <>
                <span className="material-icons text-base">sync</span>
              Importar ahora
              </>
            )}
          </button>
          {importError && <p className="text-xs text-destructive">{importError}</p>}
          {!importError && importNote && <p className="text-xs text-muted-foreground">{importNote}</p>}
        </div>
      </div>

      {overview && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className={pCardPad}>
              <p className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">
                {overview.totals.clicks.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Clics</p>
            </div>
            <div className={pCardPad}>
              <p className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">
                {overview.totals.impressions.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Impresiones</p>
            </div>
            <div className={pCardPad}>
              <p className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">
                {formatPct(overview.totals.avgCtr)}
              </p>
              <p className="text-xs text-muted-foreground">CTR medio</p>
            </div>
            <div className={pCardPad}>
              <p className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">
                {formatPosition(overview.totals.avgPosition)}
              </p>
              <p className="text-xs text-muted-foreground">Posición media</p>
            </div>
          </div>

          {overview.series.length > 0 && (
            <div className={pCardPad}>
              <SearchPerformanceChart series={overview.series} />
            </div>
          )}
        </>
      )}

      {reports && <SearchPerformanceReportsView reports={reports} />}
    </div>
  );
}
