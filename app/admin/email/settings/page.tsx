'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface SettingMeta {
  source: 'db' | 'env' | 'default' | 'none';
  hasDbOverride: boolean;
}

interface EmailSettingsSnapshot {
  resendApiKey: SettingMeta & { configured: boolean; masked: string | null };
  fromEmail: SettingMeta & { value: string };
  transport: SettingMeta & { value: 'resend' | 'mailpit' };
  webhookSecret: SettingMeta & { configured: boolean };
  inboundSecret: SettingMeta & { configured: boolean };
}

function sourceLabel(source: SettingMeta['source']): string {
  switch (source) {
    case 'db': return 'configurado en este panel';
    case 'env': return 'desde variable de entorno';
    case 'default': return 'valor por defecto';
    default: return 'sin configurar';
  }
}

const inputClass =
  'flex-1 border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary';
const clearButtonClass =
  'px-3 py-2 border border-border rounded-md text-sm text-muted-foreground hover:bg-accent whitespace-nowrap';

export default function EmailSettingsPage() {
  const [snap, setSnap] = useState<EmailSettingsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [resendApiKey, setResendApiKey] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [transport, setTransport] = useState<'resend' | 'mailpit'>('resend');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [inboundSecret, setInboundSecret] = useState('');

  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/email/settings');
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? 'No se pudo cargar la configuración');
      const data = json.data as EmailSettingsSnapshot;
      setSnap(data);
      setFromEmail(data.fromEmail.value);
      setTransport(data.transport.value);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando la configuración');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const put = useCallback(async (payload: Record<string, unknown>): Promise<boolean> => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/email/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? 'No se pudo guardar');
      const data = json.data as EmailSettingsSnapshot;
      setSnap(data);
      setFromEmail(data.fromEmail.value);
      setTransport(data.transport.value);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardando');
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  async function save() {
    if (!snap) return;
    const payload: Record<string, unknown> = {};
    if (resendApiKey.trim()) payload.resendApiKey = resendApiKey.trim();
    if (fromEmail.trim() && fromEmail.trim() !== snap.fromEmail.value) payload.fromEmail = fromEmail.trim();
    if (transport !== snap.transport.value) payload.transport = transport;
    if (webhookSecret.trim()) payload.webhookSecret = webhookSecret.trim();
    if (inboundSecret.trim()) payload.inboundSecret = inboundSecret.trim();
    if (Object.keys(payload).length === 0) {
      setMessage('No hay cambios que guardar.');
      return;
    }
    const ok = await put(payload);
    if (ok) {
      setMessage('Configuración guardada.');
      setResendApiKey('');
      setWebhookSecret('');
      setInboundSecret('');
    }
  }

  async function clearOverride(field: 'resendApiKey' | 'fromEmail' | 'transport' | 'webhookSecret' | 'inboundSecret') {
    const ok = await put({ [field]: null });
    if (ok) setMessage('Override eliminado: se usará la variable de entorno o el valor por defecto.');
  }

  async function sendTest() {
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      const res = await fetch('/api/admin/email/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testTo.trim() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? 'Fallo al enviar');
      setTestResult(
        `Enviado a ${json.data.to} desde ${json.data.from} (id: ${json.data.id ?? '—'}). Revisa la bandeja de entrada y el spam.`,
      );
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Fallo al enviar');
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Cargando ajustes…</div>;
  }
  if (!snap) {
    return <div className="p-8 text-sm text-red-600">{error ?? 'No se pudo cargar la configuración.'}</div>;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ajustes de email</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Configura Resend desde el panel. La clave se guarda cifrada y tiene prioridad sobre las variables de entorno.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/email/domains" className="text-sm text-primary hover:underline flex items-center gap-1">
            <span className="material-icons text-base">dns</span>
            Dominios de envío
          </Link>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <span className="material-icons text-base">save</span>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {message && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">{message}</p>}
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}

      <section className="bg-card border border-border rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <span className="material-icons text-base">key</span>
            Conexión con Resend
          </h2>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${snap.resendApiKey.configured ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}
          >
            {snap.resendApiKey.configured
              ? `API key configurada (${sourceLabel(snap.resendApiKey.source)})`
              : 'Sin API key'}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Pega tu API key de Resend (empieza por <code className="bg-muted px-1 rounded text-xs">re_</code>). Déjala
          vacía para no cambiarla.
          {snap.resendApiKey.masked && (
            <>
              {' '}Actual: <code className="bg-muted px-1 rounded text-xs">{snap.resendApiKey.masked}</code>.
            </>
          )}
        </p>
        <div className="flex gap-3">
          <input
            type="password"
            value={resendApiKey}
            onChange={(e) => setResendApiKey(e.target.value)}
            placeholder="re_…"
            autoComplete="off"
            className={inputClass}
          />
          {snap.resendApiKey.hasDbOverride && (
            <button type="button" onClick={() => clearOverride('resendApiKey')} className={clearButtonClass}>
              Quitar del panel
            </button>
          )}
        </div>
      </section>

      <section className="bg-card border border-border rounded-lg p-5 space-y-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-base">mail</span>
          Remitente (De:)
        </h2>
        <p className="text-sm text-muted-foreground">
          Dirección desde la que salen los correos de la plataforma. Debe pertenecer a un dominio verificado en Resend
          (o el envío fallará con un aviso).
        </p>
        <div className="flex gap-3">
          <input
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            placeholder="noreply@tudominio.com"
            className={inputClass}
          />
          {snap.fromEmail.hasDbOverride && (
            <button type="button" onClick={() => clearOverride('fromEmail')} className={clearButtonClass}>
              Quitar del panel
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Origen: {sourceLabel(snap.fromEmail.source)}.</p>
      </section>

      <section className="bg-card border border-border rounded-lg p-5 space-y-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-base">swap_horiz</span>
          Modo de envío
        </h2>
        <select
          value={transport}
          onChange={(e) => setTransport(e.target.value as 'resend' | 'mailpit')}
          className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="resend">Envío real (Resend)</option>
          <option value="mailpit">Modo pruebas — capturar en Mailpit (no salen a internet)</option>
        </select>
        <p className="text-xs text-muted-foreground">Origen: {sourceLabel(snap.transport.source)}.</p>
        {snap.transport.hasDbOverride && (
          <button type="button" onClick={() => clearOverride('transport')} className={clearButtonClass}>
            Usar valor por defecto
          </button>
        )}
      </section>

      <section className="bg-card border border-border rounded-lg p-5 space-y-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-base">lock</span>
          Secretos de integración
        </h2>
        <div className="space-y-2">
          <p className="text-sm text-foreground">Webhook de Resend (aperturas, clics y rebotes)</p>
          <p className="text-xs text-muted-foreground">
            {snap.webhookSecret.configured
              ? `Configurado (${sourceLabel(snap.webhookSecret.source)}).`
              : 'Sin configurar — las métricas de aperturas y clics no se registran hasta que lo definas.'}
          </p>
          <div className="flex gap-3">
            <input
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder="whsec_…"
              autoComplete="off"
              className={inputClass}
            />
            {snap.webhookSecret.hasDbOverride && (
              <button type="button" onClick={() => clearOverride('webhookSecret')} className={clearButtonClass}>
                Quitar del panel
              </button>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm text-foreground">Email entrante (firma del worker inbound)</p>
          <p className="text-xs text-muted-foreground">
            {snap.inboundSecret.configured
              ? `Configurado (${sourceLabel(snap.inboundSecret.source)}).`
              : 'Sin configurar — el correo entrante al CRM/Brain no funcionará.'}
            {' '}Si lo cambias, actualiza también el worker de inbound.
          </p>
          <div className="flex gap-3">
            <input
              type="password"
              value={inboundSecret}
              onChange={(e) => setInboundSecret(e.target.value)}
              placeholder="Secreto compartido"
              autoComplete="off"
              className={inputClass}
            />
            {snap.inboundSecret.hasDbOverride && (
              <button type="button" onClick={() => clearOverride('inboundSecret')} className={clearButtonClass}>
                Quitar del panel
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="bg-card border border-border rounded-lg p-5 space-y-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-base">outbox</span>
          Probar envío
        </h2>
        <p className="text-sm text-muted-foreground">
          Manda un correo real de prueba con la configuración actual (ignora el modo pruebas). Si tu dominio aún no
          está verificado, aquí verás el aviso exacto de Resend.
        </p>
        <div className="flex gap-3">
          <input
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="tu@email.com"
            className={inputClass}
          />
          <button
            onClick={sendTest}
            disabled={testing}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 whitespace-nowrap"
          >
            {testing ? 'Enviando…' : 'Enviar prueba'}
          </button>
        </div>
        {testResult && <p className="text-sm text-green-700">{testResult}</p>}
        {testError && <p className="text-sm text-red-600">{testError}</p>}
      </section>
    </div>
  );
}
