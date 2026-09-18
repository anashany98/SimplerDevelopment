'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCustomerAuth } from '@/components/storefront/account/CustomerAuthContext';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { siteId } = useCustomerAuth();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!token) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <span className="material-icons text-4xl text-red-400 mb-4 block">error_outline</span>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Enlace de restablecimiento no válido</h1>
        <p className="text-gray-500 text-sm mb-6">Este enlace de restablecimiento de contraseña no es válido o ha caducado.</p>
        <Link href="/account/login" className="text-gray-900 font-medium hover:underline">Volver al inicio de sesión</Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <span className="material-icons text-4xl text-green-500 mb-4 block">check_circle</span>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Contraseña restablecida</h1>
        <p className="text-gray-500 text-sm mb-6">Tu contraseña se restableció correctamente. Ya puedes iniciar sesión con tu nueva contraseña.</p>
        <Link href="/account/login"
          className="inline-block bg-gray-900 text-white rounded-lg px-6 py-2.5 text-sm font-medium hover:bg-gray-800 transition-colors">
          Iniciar sesión
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/storefront/${siteId}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset-password', token, password }),
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(true);
      } else {
        setError(data.message || 'No se pudo restablecer la contraseña. Puede que el enlace haya caducado.');
      }
    } catch {
      setError('Algo salió mal. Inténtalo de nuevo.');
    }
    setSubmitting(false);
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">Restablece tu contraseña</h1>
      <p className="text-gray-500 text-center text-sm mb-8">Introduce tu nueva contraseña a continuación.</p>

      <form method="post" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nueva contraseña</label>
          <input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            placeholder="Mínimo 8 caracteres" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar contraseña</label>
          <input type="password" required minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            placeholder="Repite tu contraseña" />
        </div>
        <button type="submit" disabled={submitting}
          className="w-full bg-gray-900 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors">
          {submitting ? 'Restableciendo...' : 'Restablecer contraseña'}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        ¿Recuerdas tu contraseña? <Link href="/account/login" className="text-gray-900 font-medium hover:underline">Inicia sesión</Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><span className="material-icons animate-spin text-3xl text-gray-400">autorenew</span></div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
