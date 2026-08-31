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
  { channel: 'whatsapp', label: 'WhatsApp Business', description: 'Cloud API, templates and delivery receipts.', icon: 'chat' },
  { channel: 'instagram', label: 'Instagram Direct', description: 'Messages for professional Instagram accounts.', icon: 'photo_camera' },
  { channel: 'messenger', label: 'Facebook Messenger', description: 'Page messages and delivery/read events.', icon: 'forum' },
  { channel: 'webchat', label: 'Web Chat', description: 'Embeddable first-party widget for your websites.', icon: 'language' },
  { channel: 'email', label: 'Correo', description: 'Shared inbox delivery through the existing email service.', icon: 'email' },
];

function stamp(value: string | null) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Never';
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
    else setNotice(channelsBody.message ?? 'Channels could not be loaded.');
    if (configResponse.ok && configBody.data) {
      const config = configBody.data;
      setMetaConfig(config);
      setAppId(config.appId ?? '');
      setLoginConfigId(config.loginConfigId ?? '');
    } else {
      setNotice(configBody.message ?? 'Meta configuration could not be loaded.');
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
      const result = new URLSearchParams(window.location.search).get('meta');
      if (result) setNotice(result === 'connected' ? 'Meta channel connected.' : result === 'selection_required' ? 'Select the WhatsApp phone number to finish setup.' : `Meta connection: ${result.replaceAll('_', ' ')}.`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function connectMeta(channel: 'whatsapp' | 'instagram' | 'messenger') {
    setBusy(`connect:${channel}`);
    setNotice(null);
    try {
      const response = await fetch(`/api/portal/channels/meta/connect?channel=${channel}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? 'Meta connection could not start.');
      window.location.assign(body.data.authorizationUrl);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Meta connection could not start.');
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
      if (!response.ok) throw new Error(body.message ?? 'Meta configuration could not be saved.');
      setMetaConfig(body.data as MetaConfig);
      setAppSecret('');
      setWebhookVerifyToken('');
      setNotice('Meta configuration saved securely. You can now connect WhatsApp.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Meta configuration could not be saved.');
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
    setNotice(response.ok ? 'Credentials validated.' : body.message ?? 'Credential validation failed.');
    setBusy(null);
    await load();
  }

  async function disconnect(connection: Connection) {
    if (!window.confirm(`Disconnect ${connection.displayName || connection.channel}? New outbound messages will stop.`)) return;
    setBusy(`disconnect:${connection.id}`);
    const response = await fetch(`/api/portal/channels/${connection.id}`, { method: 'DELETE' });
    const body = await response.json();
    setNotice(response.ok ? 'Channel disconnected.' : body.message ?? 'Disconnect failed.');
    setBusy(null);
    await load();
  }

  async function discover(connection: Connection) {
    setBusy(`assets:${connection.id}`);
    const response = await fetch(`/api/portal/channels/${connection.id}/assets`);
    const body = await response.json();
    if (response.ok) setAssets((current) => ({ ...current, [connection.id]: body.data ?? [] }));
    else setNotice(body.message ?? 'Phone numbers could not be discovered.');
    setBusy(null);
  }

  async function selectAsset(connection: Connection, phoneNumberId: string) {
    setBusy(`select:${phoneNumberId}`);
    const response = await fetch(`/api/portal/channels/${connection.id}/assets`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phoneNumberId }),
    });
    const body = await response.json();
    setNotice(response.ok ? 'WhatsApp phone number connected.' : body.message ?? 'Selection failed.');
    setBusy(null);
    await load();
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Communication channels</h2>
        <p className="mt-1 text-sm text-muted-foreground">Connect provider assets to the unified inbox. Access tokens remain encrypted and are never returned to this page.</p>
      </div>

      {notice && <div role="status" className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-foreground">{notice}</div>}

      <form onSubmit={(event) => void saveMetaConfig(event)} className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-foreground">Meta app configuration</h3>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Add the Meta app used by this company. App Secret and webhook token are encrypted at rest and are never returned to the browser.</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${metaConfig?.configured ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
            {metaConfig?.configured ? `Configured${metaConfig.source === 'environment' ? ' by deployment' : ''}` : 'Not configured'}
          </span>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-foreground">
            Meta App ID
            <input aria-label="Meta App ID" inputMode="numeric" autoComplete="off" value={appId} onChange={(event) => setAppId(event.target.value)} placeholder="123456789012345" required className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <label className="text-sm font-medium text-foreground">
            Login configuration ID
            <input aria-label="Login configuration ID" inputMode="numeric" autoComplete="off" value={loginConfigId} onChange={(event) => setLoginConfigId(event.target.value)} placeholder="123456789012345" required className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <label className="text-sm font-medium text-foreground">
            Meta App Secret
            <input aria-label="Meta App Secret" type="password" autoComplete="new-password" value={appSecret} onChange={(event) => setAppSecret(event.target.value)} placeholder={metaConfig?.hasAppSecret ? 'Saved — leave blank to keep it' : '32-character app secret'} required={!metaConfig?.hasAppSecret} className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <label className="text-sm font-medium text-foreground">
            Webhook verify token
            <input aria-label="Webhook verify token" type="password" autoComplete="new-password" value={webhookVerifyToken} onChange={(event) => setWebhookVerifyToken(event.target.value)} placeholder={metaConfig?.hasWebhookVerifyToken ? 'Saved — leave blank to keep it' : 'Choose a private token (16+ characters)'} required={!metaConfig?.hasWebhookVerifyToken} className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-primary" />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">Copia este valor en Meta antes de guardar; por seguridad no podrá volver a mostrarse.</span>
          </label>
        </div>

        <div className="mt-4 grid gap-3 rounded-lg bg-muted/40 p-4 text-sm md:grid-cols-2">
          <div className="min-w-0">
            <p className="font-medium text-foreground">OAuth redirect URI</p>
            <code className="mt-1 block overflow-x-auto text-xs text-muted-foreground">{metaConfig?.callbackUrl ?? 'Loading…'}</code>
          </div>
          <div className="min-w-0">
            <p className="font-medium text-foreground">Webhook callback URL</p>
            <code className="mt-1 block overflow-x-auto text-xs text-muted-foreground">{metaConfig?.webhookUrl ?? 'Save the configuration to generate it'}</code>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Usa estas dos URL en el panel de desarrollador de Meta y luego haz clic en Conectar en el canal de abajo.</p>
          <button type="submit" disabled={busy !== null} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {busy === 'meta-config' ? 'Saving…' : metaConfig?.source === 'tenant' ? 'Update configuration' : 'Save configuration'}
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
                  <button type="button" disabled={busy !== null || !metaConfig?.configured} title={metaConfig?.configured ? undefined : 'Save the Meta app configuration first'} onClick={() => void connectMeta(card.channel as 'whatsapp' | 'instagram' | 'messenger')} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                    Connect
                  </button>
                )}
                {card.channel === 'webchat' && <Link href="/portal/inbox" className="rounded-md border border-border px-3 py-2 text-sm font-medium">Gestionar</Link>}
              </div>

              <div className="mt-4 space-y-3">
                {rows.length === 0 && <p className="text-sm text-muted-foreground">No active connection.</p>}
                {rows.map((connection) => (
                  <div key={connection.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{connection.displayName || connection.externalAccountId}</p>
                        <p className="text-xs text-muted-foreground">Last inbound: {stamp(connection.lastInboundAt)}</p>
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
                        <button type="button" disabled={busy !== null} onClick={() => void refresh(connection)} className="rounded border border-border px-2 py-1 text-xs font-medium">Test credentials</button>
                      )}
                      <button type="button" disabled={busy !== null} onClick={() => void disconnect(connection)} className="rounded border border-border px-2 py-1 text-xs font-medium text-destructive">Disconnect</button>
                    </div>
                    {assets[connection.id]?.length === 0 && <p className="mt-3 text-xs text-muted-foreground">No authorized phone numbers were found.</p>}
                    {assets[connection.id]?.map((asset) => (
                      <button key={asset.phoneNumberId} type="button" disabled={busy !== null} onClick={() => void selectAsset(connection, asset.phoneNumberId)} className="mt-3 flex w-full items-center justify-between rounded border border-border p-2 text-left hover:bg-muted/50">
                        <span>{asset.verifiedName || asset.displayPhoneNumber || asset.phoneNumberId}</span>
                        <span className="text-xs text-muted-foreground">{asset.qualityRating || 'Select'}</span>
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
        <h3 className="font-semibold text-foreground">Meta webhook</h3>
        <p className="mt-1 text-sm text-muted-foreground">Copy the generated webhook callback URL above into Meta and subscribe the WhatsApp, Messenger or Instagram message fields. Incoming payloads are checked with this company&apos;s App Secret before they can update the inbox.</p>
      </div>
    </section>
  );
}
