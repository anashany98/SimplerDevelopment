'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

type Channel = 'whatsapp' | 'instagram' | 'messenger' | 'webchat' | 'email';
type Connection = {
  id: number;
  channel: Channel;
  displayName: string | null;
  externalAccountId: string;
  status: string;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastError: string | null;
};
type PhoneAsset = {
  phoneNumberId: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
  businessName?: string;
  qualityRating?: string;
};
type MetaConfig = {
  configured: boolean;
  source: 'tenant' | 'environment' | 'none';
  appId: string;
  loginConfigId: string;
  hasAppSecret: boolean;
  hasWebhookVerifyToken: boolean;
  callbackUrl: string;
  webhookUrl: string;
};

const cards: Array<{ channel: Channel; label: string; description: string; icon: string }> = [
  { channel: 'whatsapp', label: 'WhatsApp Business', description: 'API Cloud, plantillas y acuses de entrega.', icon: 'chat' },
  { channel: 'instagram', label: 'Instagram Direct', description: 'Mensajes para cuentas profesionales de Instagram.', icon: 'photo_camera' },
  { channel: 'messenger', label: 'Facebook Messenger', description: 'Mensajes de página y eventos de entrega y lectura.', icon: 'forum' },
  { channel: 'webchat', label: 'Web Chat', description: 'Widget propio integrable para tus sitios web.', icon: 'language' },
  { channel: 'email', label: 'Correo', description: 'Entrega en la bandeja compartida a través del servicio de correo actual.', icon: 'email' },
];

function stamp(value: string | null) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Nunca';
}

async function jsonBody<T>(response: Response): Promise<T> {
  return response.json().catch(() => ({})) as Promise<T>;
}

export default function ChannelsSettingsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [assets, setAssets] = useState<Record<number, PhoneAsset[]>>({});
  const [metaConfig, setMetaConfig] = useState<MetaConfig | null>(null);
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [loginConfigId, setLoginConfigId] = useState('');
  const [webhookVerifyToken, setWebhookVerifyToken] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [channelsResponse, configResponse] = await Promise.all([
      fetch('/api/portal/channels', { cache: 'no-store' }),
      fetch('/api/portal/channels/meta/config', { cache: 'no-store' }),
    ]);
    const [channelsBody, configBody] = await Promise.all([
      jsonBody<{ data?: Connection[]; message?: string }>(channelsResponse),
      jsonBody<{ data?: MetaConfig; message?: string }>(configResponse),
    ]);
    if (channelsResponse.ok) setConnections(channelsBody.data ?? []);
    else setNotice(channelsBody.message ?? 'No se pudieron cargar los canales.');
    if (configResponse.ok && configBody.data) {
      const config = configBody.data;
      setMetaConfig(config);
      setAppId(config.appId ?? '');
      setLoginConfigId(config.loginConfigId ?? '');
    } else {
      setNotice(configBody.message ?? 'No se pudo cargar la configuración de Meta.');
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
      const result = new URLSearchParams(window.location.search).get('meta');
      if (result) setNotice(result === 'connected' ? 'Canal de Meta conectado.' : result === 'selection_required' ? 'Selecciona el número de teléfono de WhatsApp para terminar la configuración.' : `Conexión con Meta: ${result.replaceAll('_', ' ')}.`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function connectMeta(channel: 'whatsapp' | 'instagram' | 'messenger') {
    setBusy(`connect:${channel}`);
    setNotice(null);
    try {
      const response = await fetch(`/api/portal/channels/meta/connect?channel=${channel}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? 'No se pudo iniciar la conexión con Meta.');
      window.location.assign(body.data.authorizationUrl);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo iniciar la conexión con Meta.');
      setBusy(null);
    }
  }

  async function saveMetaConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('meta-config');
    setNotice(null);
    try {
      const response = await fetch('/api/portal/channels/meta/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId, appSecret, loginConfigId, webhookVerifyToken }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? 'No se pudo guardar la configuración de Meta.');
      setMetaConfig(body.data as MetaConfig);
      setAppSecret('');
      setWebhookVerifyToken('');
      setNotice('Configuración de Meta guardada de forma segura. Ya puedes conectar WhatsApp.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo guardar la configuración de Meta.');
    } finally {
      setBusy(null);
    }
  }

  async function refresh(connection: Connection) {
    setBusy(`refresh:${connection.id}`);
    const response = await fetch(`/api/portal/channels/${connection.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'refresh' }),
    });
    const body = await response.json();
    setNotice(response.ok ? 'Credenciales validadas.' : body.message ?? 'La validación de credenciales ha fallado.');
    setBusy(null);
    await load();
  }

  async function disconnect(connection: Connection) {
    if (!window.confirm(`¿Desconectar ${connection.displayName || connection.channel}? Los nuevos mensajes salientes se detendrán.`)) return;
    setBusy(`disconnect:${connection.id}`);
    const response = await fetch(`/api/portal/channels/${connection.id}`, { method: 'DELETE' });
    const body = await response.json();
    setNotice(response.ok ? 'Canal desconectado.' : body.message ?? 'No se pudo desconectar.');
    setBusy(null);
    await load();
  }

  async function discover(connection: Connection) {
    setBusy(`assets:${connection.id}`);
    const response = await fetch(`/api/portal/channels/${connection.id}/assets`);
    const body = await response.json();
    if (response.ok) setAssets((current) => ({ ...current, [connection.id]: body.data ?? [] }));
    else setNotice(body.message ?? 'No se pudieron descubrir los números de teléfono.');
    setBusy(null);
  }

  async function selectAsset(connection: Connection, phoneNumberId: string) {
    setBusy(`select:${phoneNumberId}`);
    const response = await fetch(`/api/portal/channels/${connection.id}/assets`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phoneNumberId }),
    });
    const body = await response.json();
    setNotice(response.ok ? 'Número de teléfono de WhatsApp conectado.' : body.message ?? 'La selección ha fallado.');
    setBusy(null);
    await load();
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Canales de comunicación</h2>
        <p className="mt-1 text-sm text-muted-foreground">Conecta los recursos del proveedor a la bandeja unificada. Los tokens de acceso se mantienen cifrados y nunca se devuelven a esta página.</p>
      </div>

      {notice && <div role="status" className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-foreground">{notice}</div>}

      <form onSubmit={(event) => void saveMetaConfig(event)} className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-foreground">Configuración de la app de Meta</h3>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Añade la app de Meta que usa esta empresa. El secreto de la app y el token del webhook se cifran en reposo y nunca se devuelven al navegador.</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${metaConfig?.configured ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
            {metaConfig?.configured ? `Configurado${metaConfig.source === 'environment' ? ' por el despliegue' : ''}` : 'Sin configurar'}
          </span>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-foreground">
            ID de la app de Meta
            <input aria-label="ID de la app de Meta" inputMode="numeric" autoComplete="off" value={appId} onChange={(event) => setAppId(event.target.value)} placeholder="123456789012345" required className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <label className="text-sm font-medium text-foreground">
            ID de configuración de inicio de sesión
            <input aria-label="ID de configuración de inicio de sesión" inputMode="numeric" autoComplete="off" value={loginConfigId} onChange={(event) => setLoginConfigId(event.target.value)} placeholder="123456789012345" required className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <label className="text-sm font-medium text-foreground">
            Secreto de la app de Meta
            <input aria-label="Secreto de la app de Meta" type="password" autoComplete="new-password" value={appSecret} onChange={(event) => setAppSecret(event.target.value)} placeholder={metaConfig?.hasAppSecret ? 'Guardado — déjalo en blanco para conservarlo' : 'secreto de app de 32 caracteres'} required={!metaConfig?.hasAppSecret} className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <label className="text-sm font-medium text-foreground">
            Token de verificación del webhook
            <input aria-label="Token de verificación del webhook" type="password" autoComplete="new-password" value={webhookVerifyToken} onChange={(event) => setWebhookVerifyToken(event.target.value)} placeholder={metaConfig?.hasWebhookVerifyToken ? 'Guardado — déjalo en blanco para conservarlo' : 'Elige un token privado (16+ caracteres)'} required={!metaConfig?.hasWebhookVerifyToken} className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-primary" />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">Copia este valor en Meta antes de guardar; por seguridad no podrá volver a mostrarse.</span>
          </label>
        </div>

        <div className="mt-4 grid gap-3 rounded-lg bg-muted/40 p-4 text-sm md:grid-cols-2">
          <div className="min-w-0">
            <p className="font-medium text-foreground">URI de redirección de OAuth</p>
            <code className="mt-1 block overflow-x-auto text-xs text-muted-foreground">{metaConfig?.callbackUrl ?? 'Cargando…'}</code>
          </div>
          <div className="min-w-0">
            <p className="font-medium text-foreground">URL de callback del webhook</p>
            <code className="mt-1 block overflow-x-auto text-xs text-muted-foreground">{metaConfig?.webhookUrl ?? 'Guarda la configuración para generarla'}</code>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Usa estas dos URL en el panel de desarrollador de Meta y luego haz clic en Conectar en el canal de abajo.</p>
          <button type="submit" disabled={busy !== null} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {busy === 'meta-config' ? 'Guardando…' : metaConfig?.source === 'tenant' ? 'Actualizar configuración' : 'Guardar configuración'}
          </button>
        </div>
      </form>

      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((card) => {
          const rows = connections.filter((connection) => connection.channel === card.channel && connection.status !== 'disconnected');
          const canOAuth = card.channel === 'whatsapp' || card.channel === 'instagram' || card.channel === 'messenger';
          return (
            <article key={card.channel} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex gap-3">
                  <span className="material-icons rounded-lg bg-primary/10 p-2 text-primary" aria-hidden="true">{card.icon}</span>
                  <div>
                    <h3 className="font-semibold text-foreground">{card.label}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{card.description}</p>
                  </div>
                </div>
                {canOAuth && (
                  <button type="button" disabled={busy !== null || !metaConfig?.configured} title={metaConfig?.configured ? undefined : 'Guarda primero la configuración de la app de Meta'} onClick={() => void connectMeta(card.channel as 'whatsapp' | 'instagram' | 'messenger')} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                    Conectar
                  </button>
                )}
                {card.channel === 'webchat' && <Link href="/portal/inbox" className="rounded-md border border-border px-3 py-2 text-sm font-medium">Gestionar</Link>}
              </div>

              <div className="mt-4 space-y-3">
                {rows.length === 0 && <p className="text-sm text-muted-foreground">Sin conexión activa.</p>}
                {rows.map((connection) => (
                  <div key={connection.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{connection.displayName || connection.externalAccountId}</p>
                        <p className="text-xs text-muted-foreground">Última entrada: {stamp(connection.lastInboundAt)}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${connection.status === 'connected' ? 'bg-emerald-500/10 text-emerald-600' : connection.status === 'incomplete' ? 'bg-amber-500/10 text-amber-600' : 'bg-destructive/10 text-destructive'}`}>
                        {connection.status}
                      </span>
                    </div>
                    {connection.lastError && <p className="mt-2 text-xs text-destructive">{connection.lastError}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {connection.status === 'incomplete' && connection.channel === 'whatsapp' && (
                        <button type="button" disabled={busy !== null} onClick={() => void discover(connection)} className="rounded border border-border px-2 py-1 text-xs font-medium">Seleccionar teléfono</button>
                      )}
                      {connection.status === 'connected' && (
                        <button type="button" disabled={busy !== null} onClick={() => void refresh(connection)} className="rounded border border-border px-2 py-1 text-xs font-medium">Probar credenciales</button>
                      )}
                      <button type="button" disabled={busy !== null} onClick={() => void disconnect(connection)} className="rounded border border-border px-2 py-1 text-xs font-medium text-destructive">Desconectar</button>
                    </div>
                    {assets[connection.id]?.length === 0 && <p className="mt-3 text-xs text-muted-foreground">No se encontraron números de teléfono autorizados.</p>}
                    {assets[connection.id]?.map((asset) => (
                      <button key={asset.phoneNumberId} type="button" disabled={busy !== null} onClick={() => void selectAsset(connection, asset.phoneNumberId)} className="mt-3 flex w-full items-center justify-between rounded border border-border p-2 text-left hover:bg-muted/50">
                        <span>{asset.verifiedName || asset.displayPhoneNumber || asset.phoneNumberId}</span>
                        <span className="text-xs text-muted-foreground">{asset.qualityRating || 'Seleccionar'}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold text-foreground">Webhook de Meta</h3>
        <p className="mt-1 text-sm text-muted-foreground">Copia la URL de callback del webhook generada arriba en Meta y suscribe los campos de mensajes de WhatsApp, Messenger o Instagram. Las cargas entrantes se comprueban con el secreto de la app de esta empresa antes de poder actualizar la bandeja.</p>
      </div>
    </section>
  );
}
