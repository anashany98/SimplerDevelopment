'use client';

import { useEffect, useState } from 'react';

interface OAuthClient {
  id: number;
  clientId: string;
  clientName: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: string;
  clientSecretPreview: string | null;
  clientSecretCreatedAt: string | null;
  clientSecretRotatedAt: string | null;
  createdAt: string;
}

interface RevealedSecret {
  clientId: string;
  clientSecret: string | null; // null for public (PKCE-only) clients
}

interface OAuthClientsManagerProps {
  heading?: string | null;
  subheading?: string | null;
}

export default function OAuthClientsManager({
  heading = 'Aplicaciones OAuth',
  subheading = 'Registra aplicaciones OAuth para asistentes de IA e integraciones. Los clientes públicos (solo PKCE) sirven para ChatGPT, Claude.ai y otros hosts MCP. Los clientes confidenciales añaden un client_secret para integraciones servidor a servidor. Los secretos solo se muestran una vez.',
}: OAuthClientsManagerProps) {
  const [clients, setClients] = useState<OAuthClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [revealed, setRevealed] = useState<RevealedSecret | null>(null);

  // Create form state
  const [clientName, setClientName] = useState('');
  const [redirectUris, setRedirectUris] = useState<string[]>(['']);
  const [authMethod, setAuthMethod] = useState<'client_secret_basic' | 'client_secret_post' | 'none'>('client_secret_basic');
  const [clientUri, setClientUri] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/portal/oauth-clients');
      const json = await res.json();
      if (json.success) {
        // API speaks snake_case (OAuth RFC vocabulary); map once at the edge.
        type ApiRow = {
          id: number; client_id: string; client_name: string; redirect_uris: string[];
          token_endpoint_auth_method: string; client_secret_preview: string | null;
          client_secret_created_at: string | null; client_secret_rotated_at: string | null;
          created_at: string;
        };
        setClients((json.data as ApiRow[]).map((c) => ({
          id: c.id,
          clientId: c.client_id,
          clientName: c.client_name,
          redirectUris: c.redirect_uris,
          tokenEndpointAuthMethod: c.token_endpoint_auth_method,
          clientSecretPreview: c.client_secret_preview,
          clientSecretCreatedAt: c.client_secret_created_at,
          clientSecretRotatedAt: c.client_secret_rotated_at,
          createdAt: c.created_at,
        })));
      } else setError(json.message ?? 'No se pudieron cargar las aplicaciones OAuth');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las aplicaciones OAuth');
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount fetch; load() sets loading state then resolves, not a cascading-render source
  useEffect(() => { load(); }, []);

  function resetCreateForm() {
    setClientName('');
    setRedirectUris(['']);
    setAuthMethod('client_secret_basic');
    setClientUri('');
    setCreateError(null);
  }

  async function handleCreate() {
    setCreateError(null);
    if (!clientName.trim()) { setCreateError('El nombre de la aplicación es obligatorio'); return; }
    const uris = redirectUris.map(u => u.trim()).filter(Boolean);
    if (uris.length === 0) { setCreateError('Se requiere al menos un URI de redirección'); return; }

    setCreating(true);
    try {
      const res = await fetch('/api/portal/oauth-clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: clientName.trim(),
          redirect_uris: uris,
          token_endpoint_auth_method: authMethod,
          ...(clientUri.trim() ? { client_uri: clientUri.trim() } : {}),
        }),
      });
      const json = await res.json();
      if (!json.success) { setCreateError(json.message ?? 'No se pudo crear la aplicación'); return; }
      setRevealed({ clientId: json.data.client_id, clientSecret: json.data.client_secret ?? null });
      resetCreateForm();
      setShowCreate(false);
      load();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'No se pudo crear la aplicación');
    } finally {
      setCreating(false);
    }
  }

  async function handleRotate(id: number, name: string) {
    if (!confirm(`¿Rotar el secreto de "${name}"? El secreto actual dejará de funcionar de inmediato.`)) return;
    try {
      const res = await fetch(`/api/portal/oauth-clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rotate_secret' }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.message ?? 'No se pudo rotar el secreto'); return; }
      setRevealed({ clientId: json.data.client_id, clientSecret: json.data.client_secret });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo rotar el secreto');
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`¿Eliminar la aplicación OAuth "${name}"? Cualquier aplicación conectada que use este client_id perderá el acceso de inmediato.`)) return;
    try {
      const res = await fetch(`/api/portal/oauth-clients/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) { setError(json.message ?? 'No se pudo eliminar la aplicación'); return; }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar la aplicación');
    }
  }

  function addUri() {
    if (redirectUris.length < 5) setRedirectUris(prev => [...prev, '']);
  }

  function removeUri(index: number) {
    setRedirectUris(prev => prev.filter((_, i) => i !== index));
  }

  function updateUri(index: number, value: string) {
    setRedirectUris(prev => prev.map((u, i) => i === index ? value : u));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          {heading && <h2 className="text-xl font-semibold">{heading}</h2>}
          {subheading && (
            <p className="text-sm text-muted-foreground mt-1">{subheading}</p>
          )}
        </div>
        <button
          onClick={() => { setShowCreate(v => !v); setRevealed(null); setCreateError(null); }}
          className="inline-flex items-center gap-2 px-3 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 whitespace-nowrap"
        >
          <span className="material-icons text-base">add</span>
          Nueva aplicación
        </button>
      </div>

      {revealed && (
        <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-medium">
            <span className="material-icons text-base">{revealed.clientSecret ? 'warning' : 'info'}</span>
            {revealed.clientSecret
              ? 'Guarda estas credenciales ahora: el secreto no se volverá a mostrar'
              : 'Cliente público creado: copia tu client_id abajo'}
          </div>
          <div className="space-y-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">client_id</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 block p-2 bg-background border border-border rounded text-xs break-all">
                  {revealed.clientId}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(revealed.clientId)}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-border rounded hover:bg-muted"
                >
                  <span className="material-icons text-[14px] leading-none">content_copy</span>Copiar</button>
              </div>
            </div>
            {revealed.clientSecret && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">client_secret</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 block p-2 bg-background border border-border rounded text-xs break-all">
                    {revealed.clientSecret}
                  </code>
                  <button
                    onClick={() => navigator.clipboard.writeText(revealed.clientSecret!)}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-border rounded hover:bg-muted"
                  >
                    <span className="material-icons text-[14px] leading-none">content_copy</span>Copiar</button>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => setRevealed(null)}
            className="text-xs px-2 py-1 border border-border rounded hover:bg-muted"
          >
            {revealed.clientSecret ? "Ya lo guardé" : 'Hecho'}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {showCreate && (
        <div className="rounded-md border border-border p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nombre de la aplicación <span className="text-destructive">*</span></label>
            <input
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              placeholder="p. ej. Mi aplicación de integración"
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              URIs de redirección <span className="text-destructive">*</span>
              <span className="ml-1 text-xs font-normal text-muted-foreground">(se permiten 1–5)</span>
            </label>
            <div className="space-y-2">
              {redirectUris.map((uri, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={uri}
                    onChange={e => updateUri(i, e.target.value)}
                    placeholder="https://example.com/oauth/callback"
                    className="flex-1 px-3 py-2 border border-border rounded-md bg-background text-sm"
                  />
                  {redirectUris.length > 1 && (
                    <button
                      onClick={() => removeUri(i)}
                      className="inline-flex items-center text-muted-foreground hover:text-destructive"
                      aria-label="Quitar URI"
                    >
                      <span className="material-icons text-base">remove_circle_outline</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
            {redirectUris.length < 5 && (
              <button
                onClick={addUri}
                className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <span className="material-icons text-[14px] leading-none">add_circle_outline</span>
                Añadir otro URI
              </button>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Método de autenticación del endpoint de token</label>
            <select
              value={authMethod}
              onChange={e => setAuthMethod(e.target.value as 'client_secret_basic' | 'client_secret_post' | 'none')}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
            >
              <option value="client_secret_basic">HTTP Basic (client_secret_basic)</option>
              <option value="client_secret_post">POST body (client_secret_post)</option>
              <option value="none">Solo PKCE / cliente público (sin secreto)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              URI de la aplicación <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
            </label>
            <input
              value={clientUri}
              onChange={e => setClientUri(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
            />
          </div>

          {createError && <p className="text-sm text-destructive">{createError}</p>}

          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-3 py-2 bg-foreground text-background rounded-md text-sm font-medium disabled:opacity-60"
            >
              {creating ? 'Creando…' : 'Crear aplicación'}
            </button>
            <button
              onClick={() => { setShowCreate(false); resetCreateForm(); }}
              className="px-3 py-2 border border-border rounded-md text-sm"
            >Cancelar</button>
          </div>
        </div>
      )}

      <div className="rounded-md border border-border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium">client_id</th>
                <th className="px-3 py-2 font-medium">Secreto</th>
                <th className="px-3 py-2 font-medium">Método de autenticación</th>
                <th className="px-3 py-2 font-medium">Creado</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">Cargando…</td></tr>
              )}
              {!loading && clients.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">
                    Aún no hay aplicaciones OAuth. Crea una arriba para obtener un client_id y un client_secret.
                  </td>
                </tr>
              )}
              {clients.map(c => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{c.clientName}</td>
                  <td className="px-3 py-2"><code className="text-xs">{c.clientId}</code></td>
                  <td className="px-3 py-2">
                    {c.clientSecretPreview ? (
                      <code className="text-xs">{c.clientSecretPreview}</code>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <code className="text-xs px-1.5 py-0.5 bg-muted rounded">{c.tokenEndpointAuthMethod}</code>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => handleRotate(c.id, c.clientName)}
                        className="text-xs text-muted-foreground hover:text-foreground hover:underline inline-flex items-center gap-1"
                      >
                        <span className="material-icons text-[14px] leading-none">refresh</span>
                        Rotar secreto
                      </button>
                      <button
                        onClick={() => handleDelete(c.id, c.clientName)}
                        className="text-xs text-destructive hover:underline"
                      >Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
