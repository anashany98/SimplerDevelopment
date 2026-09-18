'use client';

import { useState } from 'react';

type Stage = 'idle' | 'enrolling' | 'enabled';

export function MfaSettings({ initialEnabled }: { initialEnabled: boolean }) {
  const [stage, setStage] = useState<Stage>(initialEnabled ? 'enabled' : 'idle');
  const [secret, setSecret] = useState('');
  const [otpauthUri, setOtpauthUri] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function beginSetup() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/portal/settings/mfa/setup', { method: 'POST' });
      const data = await res.json();
      if (!data.success) throw new Error(data.message ?? 'No se pudo iniciar la configuración.');
      setSecret(data.data.secret);
      setOtpauthUri(data.data.otpauthUri);
      setStage('enrolling');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo salió mal.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/portal/settings/mfa/verify-and-enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message ?? 'Ese código no funcionó.');
      setStage('enabled');
      setCode('');
      setSecret('');
      setOtpauthUri('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo salió mal.');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/portal/settings/mfa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message ?? 'No se pudo desactivar.');
      setStage('idle');
      setPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo salió mal.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      {error && (
        <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}

      {stage === 'enabled' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-green-600">
            <span className="material-icons text-base">verified_user</span>
            La autenticación en dos pasos está activada.
          </div>
          <p className="text-sm text-muted-foreground">Para desactivarlo, confirma tu contraseña.</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Tu contraseña"
            autoComplete="current-password"
            className="w-full max-w-xs rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <div>
            <button
              onClick={disable}
              disabled={busy || !password}
              className="rounded-md border border-destructive px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              Desactivar 2FA
            </button>
          </div>
        </div>
      )}

      {stage === 'idle' && (
        <button
          onClick={beginSetup}
          disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Iniciando…' : 'Configurar app de autenticación'}
        </button>
      )}

      {stage === 'enrolling' && (
        <div className="space-y-4">
          <ol className="list-decimal space-y-3 pl-5 text-sm text-muted-foreground">
            <li>
              En tu app de autenticación, añade una cuenta: escanea el enlace de abajo o introduce esta clave secreta manualmente:
              <div className="mt-2 select-all break-all rounded-md bg-muted px-3 py-2 font-mono text-xs text-foreground">
                {secret}
              </div>
              <a href={otpauthUri} className="mt-1 inline-block text-xs font-medium text-primary hover:underline">
                Abrir en la app de autenticación
              </a>
            </li>
            <li>
              Introduce el código de 6 dígitos que muestra tu app:
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="mt-2 block w-32 rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </li>
          </ol>
          <div className="flex gap-2">
            <button
              onClick={confirmEnable}
              disabled={busy || code.length !== 6}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Verificando…' : 'Verificar y activar'}
            </button>
            <button
              onClick={() => { setStage('idle'); setCode(''); setError(''); }}
              disabled={busy}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
