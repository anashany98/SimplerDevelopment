'use client';

import { useEffect, useState } from 'react';

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

interface ScopeOption {
  value: string;
  label: string;
}

interface ScopeGroup {
  label: string;
  description?: string;
  scopes: ScopeOption[];
}

const SCOPE_GROUPS: ScopeGroup[] = [
  {
    label: 'Contenido',
    scopes: [
      { value: 'sites:read', label: 'Leer sitios web y páginas' },
      { value: 'sites:write', label: 'Escribir sitios web y páginas' },
      { value: 'media:read', label: 'Leer biblioteca multimedia' },
      { value: 'media:write', label: 'Subir a la biblioteca multimedia' },
      { value: 'decks:read', label: 'Leer presentaciones' },
      { value: 'decks:write', label: 'Escribir presentaciones' },
      { value: 'email:read', label: 'Leer campañas de email' },
      { value: 'email:write', label: 'Escribir campañas de email' },
      { value: 'email:send', label: 'Enviar campañas de email' },
    ],
  },
  {
    label: 'Gestión de trabajo',
    scopes: [
      { value: 'projects:read', label: 'Leer proyectos y tarjetas' },
      { value: 'projects:write', label: 'Escribir proyectos y tarjetas' },
      { value: 'tickets:read', label: 'Leer tickets de soporte' },
      { value: 'tickets:write', label: 'Escribir tickets de soporte' },
    ],
  },
  {
    label: 'CRM e interacción',
    scopes: [
      { value: 'crm:read', label: 'Leer contactos y negocios' },
      { value: 'crm:write', label: 'Escribir contactos y negocios' },
      { value: 'bookings:read', label: 'Leer reservas' },
      { value: 'bookings:write', label: 'Escribir reservas' },
      { value: 'surveys:read', label: 'Leer encuestas' },
      { value: 'surveys:write', label: 'Escribir encuestas' },
    ],
  },
  {
    label: 'Comercio',
    scopes: [
      { value: 'store:read', label: 'Leer tienda (productos, pedidos, clientes)' },
      { value: 'store:write', label: 'Escribir tienda' },
      { value: 'services:read', label: 'Leer servicios' },
      { value: 'services:write', label: 'Escribir servicios' },
    ],
  },
  {
    label: 'Configuración',
    scopes: [
      { value: 'branding:read', label: 'Leer marca' },
      { value: 'branding:write', label: 'Escribir marca' },
      { value: 'team:read', label: 'Leer miembros del equipo' },
      { value: 'team:write', label: 'Invitar y gestionar el equipo' },
      { value: 'profile:read', label: 'Leer mi perfil' },
      { value: 'profile:write', label: 'Actualizar mi perfil' },
      { value: 'integrations:read', label: 'Leer integraciones (Google Workspace)' },
      { value: 'integrations:write', label: 'Desconectar integraciones' },
      { value: 'automations:read', label: 'Leer automatizaciones' },
      { value: 'automations:write', label: 'Escribir automatizaciones' },
      { value: 'billing:read', label: 'Leer facturación' },
      { value: 'billing:write', label: 'Gestionar facturación y suscripciones' },
      { value: 'ai:read', label: 'Leer uso y funciones de IA' },
    ],
  },
  {
    label: 'Company Brain',
    description: 'Acceso a notas, contactos, reuniones, tareas y la base de conocimiento de IA.',
    scopes: [
      { value: 'brain:read', label: 'Leer Brain (notas, contactos, reuniones, tareas)' },
      { value: 'brain:write', label: 'Escribir Brain (crear/actualizar notas, tareas, reuniones)' },
      { value: 'brain:approve', label: 'Aprobar / rechazar elementos de revisión de Brain' },
    ],
  },
  {
    label: 'Aprobaciones',
    description: 'Necesario para aprobar o rechazar cambios preparados por otras claves.',
    scopes: [
      { value: 'approvals:read', label: 'Leer cambios preparados (listar / ver)' },
      { value: 'approvals:manage', label: 'Aprobar / rechazar cambios preparados' },
    ],
  },
];

interface McpApiKeysManagerProps {
  heading?: string | null;
  subheading?: string | null;
}

export default function McpApiKeysManager({
  heading = 'Claves de API',
  subheading = 'Usa estas claves para autenticar el servidor MCP de CRM AGENTS. Conéctate desde Claude Desktop, Claude Code, ChatGPT o cualquier cliente compatible con MCP para controlar tu portal por programación.',
}: McpApiKeysManagerProps) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [fullAccess, setFullAccess] = useState(true);
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [requireCmsApproval, setRequireCmsApproval] = useState(true);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [newKeyFullAccess, setNewKeyFullAccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/portal/api-keys');
    const json = await res.json();
    if (json.success) setKeys(json.data);
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- pre-existing pattern, predates this change
  useEffect(() => { load(); }, []);

  async function handleCreate() {
    setError(null);
    if (!name.trim()) { setError('Nombre obligatorio'); return; }
    const scopes = fullAccess ? ['*'] : selectedScopes;
    if (scopes.length === 0) { setError('Selecciona al menos un permiso'); return; }
    const res = await fetch('/api/portal/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), scopes, requireCmsApproval }),
    });
    const json = await res.json();
    if (!json.success) { setError(json.message ?? 'No se pudo crear la clave'); return; }
    setNewKey(json.data.key);
    setNewKeyFullAccess(scopes.includes('*'));
    setName('');
    setFullAccess(true);
    setSelectedScopes([]);
    setRequireCmsApproval(true);
    setShowCreate(false);
    load();
  }

  async function handleRevoke(id: number) {
    if (!confirm('¿Revocar esta clave de API? Los clientes que la usen perderán el acceso de inmediato.')) return;
    await fetch(`/api/portal/api-keys?id=${id}`, { method: 'DELETE' });
    load();
  }

  function toggleScope(scope: string) {
    setSelectedScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    );
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
          onClick={() => { setShowCreate(v => !v); setNewKey(null); setError(null); }}
          className="inline-flex items-center gap-2 px-3 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90"
        >
          <span className="material-icons text-base">add</span>
          Nueva clave
        </button>
      </div>

      {newKey && (
        <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-medium">
            <span className="material-icons text-base">warning</span>
            Guarda esta clave ahora: no se volverá a mostrar
          </div>
          {newKeyFullAccess && (
            <p className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1">
              <span className="material-icons text-sm leading-none mt-0.5">gpp_maybe</span>
              <span>Esta clave tiene <strong>acceso completo (*)</strong>: puede realizar cualquier acción en tu portal. Trátala como una contraseña y revócala de inmediato si se filtra.</span>
            </p>
          )}
          <code className="block w-full p-2 bg-background border border-border rounded text-xs break-all">
            {newKey}
          </code>
          <div className="flex gap-2">
            <button
              onClick={() => navigator.clipboard.writeText(newKey)}
              className="text-xs px-2 py-1 border border-border rounded hover:bg-muted"
            >Copiar</button>
            <button
              onClick={() => setNewKey(null)}
              className="text-xs px-2 py-1 border border-border rounded hover:bg-muted"
            >
              Ya la he guardado
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="rounded-md border border-border p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nombre</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="p. ej. Claude Desktop – personal"
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Permisos</label>
            <label className="flex items-start gap-2 text-sm p-2 rounded border border-border bg-muted/30">
              <input
                type="checkbox"
                checked={fullAccess}
                onChange={e => setFullAccess(e.target.checked)}
                className="mt-0.5"
              />
              <div>
                <div className="flex items-center gap-2">
                  <code className="text-xs px-1.5 py-0.5 bg-background border border-border rounded">*</code>
                  <span className="font-medium">Acceso completo</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Otorga todas las acciones del portal. Desmarca para elegir permisos concretos.
                </p>
              </div>
            </label>

            {fullAccess && (
              <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/20 p-2 text-xs text-amber-800 dark:text-amber-300">
                <span className="material-icons text-sm leading-none mt-0.5">warning</span>
                <span>Esta clave podrá realizar <strong>todas las acciones</strong> en tu portal: contenido, CRM, equipo, lecturas de facturación y datos de Company Brain. Es mejor seleccionar solo los permisos que necesite la integración.</span>
              </div>
            )}

            {!fullAccess && (
              <div className="mt-3 space-y-4">
                {SCOPE_GROUPS.map(group => (
                  <div key={group.label}>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                      {group.label}
                    </div>
                    {group.description && (
                      <p className="text-xs text-muted-foreground mb-2">{group.description}</p>
                    )}
                    <div className="space-y-1">
                      {group.scopes.map(opt => (
                        <label key={opt.value} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedScopes.includes(opt.value)}
                            onChange={() => toggleScope(opt.value)}
                          />
                          <code className="text-xs px-1.5 py-0.5 bg-muted rounded">{opt.value}</code>
                          <span className="text-muted-foreground">{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Aprobación de CMS</label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={requireCmsApproval}
                onChange={e => setRequireCmsApproval(e.target.checked)}
                className="mt-0.5"
              />
              <div>
                <div className="font-medium">Requerir aprobación para escrituras en el CMS</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Las escrituras preparadas en entradas, presentaciones, propuestas y campañas de email esperarán a que un
                  administrador las apruebe antes de aplicarse. Las lecturas no se ven afectadas.
                </p>
              </div>
            </label>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              className="px-3 py-2 bg-foreground text-background rounded-md text-sm font-medium"
            >
              Generar clave
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-3 py-2 border border-border rounded-md text-sm"
            >Cancelar</button>
          </div>
        </div>
      )}

      <div className="rounded-md border border-border">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="px-3 py-2 font-medium">Clave</th>
              <th className="px-3 py-2 font-medium">Permisos</th>
              <th className="px-3 py-2 font-medium">Modo</th>
              <th className="px-3 py-2 font-medium">Último uso</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">Cargando…</td></tr>
            )}
            {!loading && keys.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">Aún no hay claves de API</td></tr>
            )}
            {keys.map(k => (
              <tr key={k.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{k.name}</td>
                <td className="px-3 py-2"><code className="text-xs">{k.keyPreview}</code></td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {k.scopes.map(s => s === '*' ? (
                      <span key={s} className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                        <span className="material-icons text-[14px] leading-none">warning</span>
                        Acceso completo
                      </span>
                    ) : (
                      <code key={s} className="text-xs px-1.5 py-0.5 bg-muted rounded">{s}</code>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {k.requireCmsApproval ? (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded">
                      <span className="material-icons text-[14px] leading-none">verified_user</span>
                      Requiere aprobación
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Directo</span>
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Nunca'}
                </td>
                <td className="px-3 py-2">
                  {k.revokedAt ? (
                    <span className="text-xs px-2 py-0.5 bg-destructive/10 text-destructive rounded">Revocada</span>
                  ) : k.active ? (
                    <span className="text-xs px-2 py-0.5 bg-green-500/10 text-green-700 dark:text-green-400 rounded">Activo</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 bg-muted rounded">Inactivo</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {k.active && !k.revokedAt && (
                    <button
                      onClick={() => handleRevoke(k.id)}
                      className="text-xs text-destructive hover:underline"
                    >
                      Revocar
                    </button>
                  )}
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
