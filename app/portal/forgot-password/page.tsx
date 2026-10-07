'use client';

import { useState } from 'react';
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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/portal/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.success) {
        setSent(true);
      } else {
        setError(data.error || 'Algo salió mal.');
      }
    } catch {
      setError('Algo salió mal. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <AuthShell panelSubtitle="Revisa tu bandeja de entrada. El enlace caduca en una hora.">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
          <span className="material-icons text-3xl text-primary">mark_email_read</span>
        </div>
        <h1 className={`${authHeading} mt-5`}>Revisa tu email.</h1>
        <p className={authSubtext}>
          Si existe una cuenta con <strong className="text-foreground">{email}</strong> exists, te hemos enviado un enlace para restablecer la contraseña
          link. Caduca en una hora.
        </p>
        <a
          href="/portal/login"
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          <span className="material-icons text-sm">arrow_back</span>
          Volver a iniciar sesión
        </a>
      </AuthShell>
    );
  }

  return (
    <AuthShell panelSubtitle="Recuperación segura. El enlace funciona una vez y caduca en una hora.">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
        <span className="material-icons text-3xl text-primary">lock_reset</span>
      </div>
      <div className={authEyebrow}>{'// Recuperación de cuenta'}</div>
      <h1 className={authHeading}>Restablece tu contraseña.</h1>
      <p className={authSubtext}>Introduce el email de tu cuenta y te enviaremos un enlace seguro para establecer una nueva contraseña.</p>

      <div className="mt-7">
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            <span className="material-icons text-base">error_outline</span>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={authLabel}>Correo</label>
            <AuthField icon="mail_outline">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                className={authInput}
                placeholder="tu@empresa.com"
              />
            </AuthField>
          </div>
          <button type="submit" disabled={loading} className={authPrimaryBtn}>
            {loading ? (
              <>
                <span className="material-icons animate-spin text-base">refresh</span>
                Enviando…
              </>
            ) : (
              <>
                Enviar enlace de restablecimiento
                <span className="material-icons text-[19px] transition group-hover:translate-x-0.5">send</span>
              </>
            )}
          </button>
        </form>

        <a
          href="/portal/login"
          className="mt-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="material-icons text-sm">arrow_back</span>
          Volver a iniciar sesión
        </a>
      </div>
    </AuthShell>
  );
}
