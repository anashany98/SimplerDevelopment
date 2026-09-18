'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AuthShell,
  AuthField,
  authEyebrow,
  authHeading,
  authSubtext,
  authLabel,
  authInput,
  authPrimaryBtn,
} from '@/components/portal/AuthShell';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  if (!token) {
    return (
      <AuthShell panelSubtitle="Establece una nueva contraseña para tu cuenta.">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10">
          <span className="material-icons text-3xl text-destructive">link_off</span>
        </div>
        <h1 className={`${authHeading} mt-5`}>Enlace de restablecimiento no válido.</h1>
        <p className={authSubtext}>Este enlace de restablecimiento de contraseña no es válido o ha caducado.</p>
        <a
          href="/portal/forgot-password"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          <span className="material-icons text-sm">refresh</span>
          Solicitar un enlace nuevo
        </a>
      </AuthShell>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/portal/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(true);
      } else {
        setError(data.error || 'Algo salió mal.');
      }
    } catch {
      setError('Algo salió mal. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <AuthShell panelSubtitle="La contraseña de tu cuenta se ha actualizado.">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10">
          <span className="material-icons text-3xl text-emerald-500">check_circle</span>
        </div>
        <h1 className={`${authHeading} mt-5`}>Contraseña restablecida.</h1>
        <p className={authSubtext}>
          Tu contraseña se ha actualizado. Ya puedes iniciar sesión con tu nueva contraseña.
        </p>
        <a
          href="/portal/login"
          className={`${authPrimaryBtn} mt-6`}
        >
          Iniciar sesión
          <span className="material-icons text-[19px] transition group-hover:translate-x-0.5">arrow_forward</span>
        </a>
      </AuthShell>
    );
  }

  return (
    <AuthShell panelSubtitle="Establece una nueva contraseña: que sea fuerte y única.">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
        <span className="material-icons text-3xl text-primary">lock_reset</span>
      </div>
      <div className={authEyebrow}>{'// Recuperación de cuenta'}</div>
      <h1 className={authHeading}>Establece una nueva contraseña.</h1>
      <p className={authSubtext}>Introduce tu nueva contraseña a continuación. Debe tener al menos 8 caracteres.</p>

      <div className="mt-7">
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            <span className="material-icons text-base">error_outline</span>
            {error}
          </div>
        )}

        <form method="post" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={authLabel}>Nueva contraseña</label>
            <AuthField icon="lock">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                autoFocus
                className={authInput}
                placeholder="Al menos 8 caracteres"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground/70 transition-colors hover:text-foreground"
                tabIndex={-1}
              >
                <span className="material-icons text-[20px]">{showPassword ? 'visibility_off' : 'visibility'}</span>
              </button>
            </AuthField>
          </div>
          <div>
            <label className={authLabel}>Confirmar contraseña</label>
            <AuthField icon="lock_outline">
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className={authInput}
                placeholder="Confirma tu contraseña"
              />
            </AuthField>
          </div>
          <button type="submit" disabled={loading} className={authPrimaryBtn}>
            {loading ? (
              <>
                <span className="material-icons animate-spin text-base">refresh</span>
                Restableciendo…
              </>
            ) : (
              <>
                Restablecer contraseña
                <span className="material-icons text-[19px] transition group-hover:translate-x-0.5">lock_open</span>
              </>
            )}
          </button>
        </form>

        <a
          href="/portal/login"
          className="mt-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="material-icons text-sm">arrow_back</span>
          Volver al inicio de sesión
        </a>
      </div>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <span className="material-icons animate-spin text-muted-foreground">refresh</span>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
