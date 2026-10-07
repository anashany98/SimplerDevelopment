'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { pBtnPrimary, pBtnGhost, pCardPad } from '@/components/portal/portal-ui';

interface ApiKey {
  id: number;
  name: string;
  keyPreview: string;
  scopes: string[];
  active: boolean;
  requireCmsApproval: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

const BRAIN_SCOPES = ['brain:read', 'brain:write', 'brain:approve'] as const;
const MCP_ROUTE_PATH = '/api/mcp';

function hasBrainScope(key: ApiKey): boolean {
  if (!key.active || key.revokedAt) return false;
  if (key.scopes.includes('*')) return true;
  if (key.scopes.includes('brain:*')) return true;
  return BRAIN_SCOPES.some((s) => key.scopes.includes(s));
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export default function BrainConnectPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    | { ok: true; message: string }
    | { ok: false; message: string }
    | null
  >(null);

  const [origin, setOrigin] = useState<string>('https://app.simplerdevelopment.com');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const load = useCallback(async () => {
    setLoadingKeys(true);
    try {
      const r = await fetch('/api/portal/api-keys');
      const json = await r.json();
      if (json.success) setKeys(json.data as ApiKey[]);
    } catch {
      /* network — surface via empty state */
    } finally {
      setLoadingKeys(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const brainKeys = useMemo(() => keys.filter(hasBrainScope), [keys]);
  const isConnected = brainKeys.length > 0;

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    setNewKey(null);
    setCopiedKey(false);
    try {
      const stamp = new Date().toLocaleDateString();
      const r = await fetch('/api/portal/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Claude Desktop – Brain (${stamp})`,
          scopes: [...BRAIN_SCOPES],
          requireCmsApproval: false,
        }),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setGenerateError(json.message ?? 'No se pudo generar la clave.');
        return;
      }
      setNewKey(json.data.key as string);
      await load();
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Error de red');
    } finally {
      setGenerating(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch('/api/portal/brain/search?q=test');
      const json = await r.json().catch(() => ({}));
      if (r.ok && json?.success) {
        setTestResult({
          ok: true,
          message: 'Brain es accesible desde esta sesión del navegador.',
        });
      } else {
        setTestResult({
          ok: false,
          message: json?.message ?? `La solicitud falló (${r.status})`,
        });
      }
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Error de red',
      });
    } finally {
      setTesting(false);
    }
  }

  const claudeConfig = useMemo(() => {
    const endpoint = `${origin}${MCP_ROUTE_PATH}`;
    return JSON.stringify(
      {
        mcpServers: {
          'crm-agents-brain': {
            command: 'npx',
            args: [
              '-y',
              'mcp-remote',
              endpoint,
              '--header',
              'Authorization:Bearer YOUR_KEY',
            ],
          },
        },
      },
      null,
      2,
    );
  }, [origin]);

  async function copyKey() {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } catch {
      /* ignore */
    }
  }

  async function copyConfig() {
    try {
      await navigator.clipboard.writeText(claudeConfig);
      setCopiedConfig(true);
      setTimeout(() => setCopiedConfig(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/portal/brain" className="hover:underline">
            Brain
          </Link>
          <span className="material-icons text-base">chevron_right</span>
          <span>Conectar Claude Desktop</span>
        </div>
        <h1 className="mt-2 font-display text-[clamp(1.5rem,2.4vw,2rem)] font-extrabold leading-[1.05] tracking-[-0.028em] text-foreground">Conecta Claude Desktop con Brain</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Genera una clave de API, pega una configuración de una línea en Claude Desktop y el
          conocimiento, reuniones, tareas y CRM de tu Brain estarán disponibles como herramientas MCP.
        </p>
      </div>

      {/* Section A — Status */}
      <section className={`${pCardPad} space-y-4`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span className="material-icons text-base">power</span>
              Estado de la conexión
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Brain está conectado en cuanto tienes al menos una clave de API activa con permisos de brain.
            </p>
          </div>
          {isConnected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1 text-sm font-medium text-green-700 dark:text-green-400">
              <span className="material-icons text-base">check_circle</span>
              Conectado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground">
              <span className="material-icons text-base">cancel</span>
              Sin conexión
            </span>
          )}
        </div>

        {loadingKeys ? (
          <p className="text-sm text-muted-foreground">Cargando claves…</p>
        ) : brainKeys.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay claves de API con permisos de brain. Genera una abajo para empezar.
          </p>
        ) : (
          <div className="rounded-xl border border-border overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Nombre</th>
                  <th className="px-3 py-2 font-medium">Clave</th>
                  <th className="px-3 py-2 font-medium">Permisos</th>
                  <th className="px-3 py-2 font-medium">Último uso</th>
                  <th className="px-3 py-2 font-medium">Creado</th>
                </tr>
              </thead>
              <tbody>
                {brainKeys.map((k) => (
                  <tr key={k.id} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{k.name}</td>
                    <td className="px-3 py-2">
                      <code className="text-xs">{k.keyPreview}</code>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {k.scopes.map((s) => (
                          <code key={s} className="text-xs px-1.5 py-0.5 bg-muted rounded">
                            {s}
                          </code>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {k.lastUsedAt ? formatDate(k.lastUsedAt) : 'Nunca'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{formatDate(k.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Gestiona todas las claves (incluidas las que no son de brain) en{' '}
          <Link href="/portal/settings/api-keys" className="text-primary underline">
            Ajustes &raquo; Claves de API
          </Link>
          .
        </p>
      </section>

      {/* Section B — Generate key */}
      <section className={`${pCardPad} space-y-4`}>
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <span className="material-icons text-base">vpn_key</span>
            Generar clave de API
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Crea una nueva clave de API del portal con los permisos{' '}
            <code className="text-xs px-1 py-0.5 bg-muted rounded">brain:read</code>,{' '}
            <code className="text-xs px-1 py-0.5 bg-muted rounded">brain:write</code> y{' '}
            <code className="text-xs px-1 py-0.5 bg-muted rounded">brain:approve</code> —
            exactamente lo que Claude Desktop necesita para usar el servidor MCP de Brain.
          </p>
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          className={pBtnPrimary}
        >
          <span className="material-icons text-base">
            {generating ? 'hourglass_top' : 'add'}
          </span>
          {generating ? 'Generando…' : 'Generar clave de API para Claude Desktop'}
        </button>

        {generateError && (
          <p className="text-sm text-destructive">{generateError}</p>
        )}

        {newKey && (
          <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-medium">
              <span className="material-icons text-base">warning</span>
              Guarda esta clave ahora — no volverás a verla
            </div>
            <p className="text-xs text-amber-800/80 dark:text-amber-200/80">
              Por seguridad solo mostramos la clave completa al crearla. Las visitas posteriores
              solo mostrarán los últimos 4 caracteres. Si la pierdes, genera una nueva y revoca la antigua en{' '}
              <Link href="/portal/settings/api-keys" className="underline">
                Ajustes &raquo; Claves de API
              </Link>
              .
            </p>
            <code className="block w-full p-2 bg-background border border-border rounded text-xs break-all font-mono">
              {newKey}
            </code>
            <div className="flex gap-2">
              <button
                onClick={copyKey}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-border rounded-lg hover:bg-muted"
              >
                <span className="material-icons text-sm">
                  {copiedKey ? 'check' : 'content_copy'}
                </span>
                {copiedKey ? 'Copiada' : 'Copiar clave'}
              </button>
              <button
                onClick={() => setNewKey(null)}
                className="text-xs px-2 py-1 border border-border rounded-lg hover:bg-muted"
              >
                La he guardado
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Section C — Claude Desktop config */}
      <section className={`${pCardPad} space-y-4`}>
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <span className="material-icons text-base">settings</span>
            Configuración de Claude Desktop
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Pega esto en{' '}
            <code className="text-xs px-1 py-0.5 bg-muted rounded">
              ~/.claude/claude_desktop_config.json
            </code>
            . Sustituye{' '}
            <code className="text-xs px-1 py-0.5 bg-muted rounded">YOUR_KEY</code> por la clave de
            API que generaste arriba.
          </p>
        </div>

        <div className="relative">
          <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-4 text-xs font-mono leading-relaxed">
            {claudeConfig}
          </pre>
          <button
            onClick={copyConfig}
            className="absolute top-2 right-2 inline-flex items-center gap-1 text-xs px-2 py-1 bg-background border border-border rounded-lg hover:bg-muted"
          >
            <span className="material-icons text-sm">
              {copiedConfig ? 'check' : 'content_copy'}
            </span>
            {copiedConfig ? 'Copiado' : 'Copiar'}
          </button>
        </div>

        <ol className="list-decimal pl-5 space-y-2 text-sm">
          <li>
            Pega el JSON de arriba en{' '}
            <code className="text-xs px-1 py-0.5 bg-muted rounded">
              ~/.claude/claude_desktop_config.json
            </code>{' '}
            (crea el archivo si no existe) y sustituye{' '}
            <code className="text-xs px-1 py-0.5 bg-muted rounded">YOUR_KEY</code> por tu clave.
          </li>
          <li>Reinicia Claude Desktop.</li>
          <li>
            Las herramientas de Brain aparecen automáticamente. Prueba{' '}
            <code className="text-xs px-1 py-0.5 bg-muted rounded">/mcp</code> en Claude Desktop para
              comprobar que <code className="text-xs px-1 py-0.5 bg-muted rounded">crm-agents-brain</code>{' '}
            aparece en la lista.
          </li>
        </ol>
      </section>

      {/* Section D — Test connection */}
      <section className={`${pCardPad} space-y-4`}>
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <span className="material-icons text-base">network_check</span>
            Probar conexión
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Confirma que tu sesión del portal tiene acceso al backend de Brain. Nota: esto prueba el
            <em> backend</em>, no la conexión saliente de Claude Desktop — pero si pasa,
            tu cuenta y Brain están en buen estado.
          </p>
        </div>

        <button
          onClick={handleTest}
          disabled={testing}
          className={pBtnGhost}
        >
          <span className="material-icons text-base">
            {testing ? 'hourglass_top' : 'play_arrow'}
          </span>
          {testing ? 'Probando…' : 'Probar conexión'}
        </button>

        {testResult && testResult.ok && (
          <div className="rounded-md border border-green-400 bg-green-50 dark:bg-green-950/20 p-3 text-sm flex items-start gap-2 text-green-800 dark:text-green-300">
            <span className="material-icons text-base">check_circle</span>
            <span>{testResult.message}</span>
          </div>
        )}
        {testResult && !testResult.ok && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm flex items-start gap-2 text-destructive">
            <span className="material-icons text-base">error</span>
            <span>{testResult.message}</span>
          </div>
        )}
      </section>
    </div>
  );
}
