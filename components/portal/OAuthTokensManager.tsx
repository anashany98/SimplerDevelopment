'use client';

import { useEffect, useState } from 'react';

interface OAuthToken {
  id: number;
  tokenPreview: string;
  scopes: string[];
  resource: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  userId: number;
  memberName: string | null;
  memberEmail: string | null;
  clientName: string;
  clientUri: string | null;
}

interface OAuthTokensManagerProps {
  heading?: string | null;
  subheading?: string | null;
}

/** One table of grants. Rendered twice -- once for the caller's own
 *  connections, once (owners/admins only) for the rest of the team -- so the
 *  member column is opt-in rather than a permanently-empty column in the
 *  personal view. */
function TokenTable({
  tokens,
  loading,
  emptyMessage,
  showMember,
  onRevoke,
}: {
  tokens: OAuthToken[];
  loading: boolean;
  emptyMessage: string;
  showMember: boolean;
  onRevoke: (id: number, clientName: string) => void;
}) {
  const colCount = showMember ? 8 : 7;
  return (
    <div className="rounded-md border border-border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">Aplicación</th>
              {showMember && <th className="px-3 py-2 font-medium">Miembro</th>}
              <th className="px-3 py-2 font-medium">Token</th>
              <th className="px-3 py-2 font-medium">Permisos</th>
              <th className="px-3 py-2 font-medium">Último uso</th>
              <th className="px-3 py-2 font-medium">Caduca</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={colCount} className="px-3 py-4 text-center text-muted-foreground">Cargando…</td></tr>
            )}
            {!loading && tokens.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-3 py-4 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {tokens.map(t => {
              const expired = t.expiresAt && new Date(t.expiresAt) < new Date();
              return (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <div className="font-medium">{t.clientName}</div>
                    {t.clientUri && (
                      <a href={t.clientUri} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:underline">
                        {t.clientUri}
                      </a>
                    )}
                  </td>
                  {showMember && (
                    <td className="px-3 py-2">
                      <div>{t.memberName ?? 'Desconocido'}</div>
                      {t.memberEmail && (
                        <div className="text-xs text-muted-foreground">{t.memberEmail}</div>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2"><code className="text-xs">{t.tokenPreview}</code></td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {t.scopes.map(s => (
                        <code key={s} className="text-xs px-1.5 py-0.5 bg-muted rounded">{s}</code>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : 'Nunca'}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {t.expiresAt ? new Date(t.expiresAt).toLocaleDateString() : 'Nunca'}
                  </td>
                  <td className="px-3 py-2">
                    {t.revokedAt ? (
                      <span className="text-xs px-2 py-0.5 bg-destructive/10 text-destructive rounded">Revocado</span>
                    ) : expired ? (
                      <span className="text-xs px-2 py-0.5 bg-muted rounded">Caducado</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 bg-green-500/10 text-green-700 dark:text-green-400 rounded">Activo</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!t.revokedAt && !expired && (
                      <button
                        onClick={() => onRevoke(t.id, t.clientName)}
                        className="text-xs text-destructive hover:underline"
                      >
                        Revocar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function OAuthTokensManager({
  heading = 'Tokens emitidos mediante OAuth',
  subheading = 'Aplicaciones que aprobaste mediante una pantalla de consentimiento de OAuth, como un conector de Claude.ai. Revocar una corta su acceso de inmediato.',
}: OAuthTokensManagerProps) {
  const [mine, setMine] = useState<OAuthToken[]>([]);
  const [team, setTeam] = useState<OAuthToken[]>([]);
  // Drives whether the team section renders at all. Deliberately NOT inferred
  // from `team.length`: a one-person client and a non-privileged member both
  // yield an empty list, and only one of them should see the section.
  const [canManageTeam, setCanManageTeam] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/portal/oauth-tokens');
      const json = await res.json();
      if (json.success) {
        setMine(json.data.mine ?? []);
        setTeam(json.data.team ?? []);
        setCanManageTeam(Boolean(json.data.canManageTeam));
      } else {
        setError(json.message ?? 'No se pudieron cargar los tokens');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los tokens');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Wrapped rather than `void load()`: load() sets state before its first
    // await, and calling it straight from the effect body trips
    // react-hooks/set-state-in-effect (cascading renders).
    void (async () => { await load(); })();
  }, []);

  async function handleRevoke(id: number, clientName: string) {
    if (!confirm(`¿Revocar el acceso de ${clientName}? Perderá el acceso inmediatamente y tendrá que volver a conectarse.`)) return;
    const res = await fetch(`/api/portal/oauth-tokens?id=${id}`, { method: 'DELETE' });
    // The route 404s when the grant isn't the caller's to revoke. Refresh FIRST
    // and report after: `load()` clears `error` on entry, so setting it
    // beforehand would be wiped by the very reload that follows -- leaving the
    // row Active with no reason why.
    await load();
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      setError(json?.message ?? 'No se pudo revocar el token');
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          {heading && <h2 className="text-xl font-semibold">{heading}</h2>}
          {subheading && <p className="text-sm text-muted-foreground mt-1">{subheading}</p>}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <TokenTable
          tokens={mine}
          loading={loading}
          showMember={false}
          emptyMessage="Aún no hay conexiones OAuth. Conecta Claude.ai con los pasos anteriores para ver los tokens aquí."
          onRevoke={handleRevoke}
        />
      </div>

      {canManageTeam && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Conexiones del equipo</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Aplicaciones que han conectado otros miembros. Visible para propietarios y administradores para poder auditar
              y cortar el acceso cuando alguien se va.
            </p>
          </div>

          <TokenTable
            tokens={team}
            loading={loading}
            showMember
            emptyMessage="Ningún otro miembro ha conectado una aplicación."
            onRevoke={handleRevoke}
          />
        </div>
      )}
    </div>
  );
}
