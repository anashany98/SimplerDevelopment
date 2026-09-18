'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DeleteWebsiteButton({
  siteId,
  siteName,
}: {
  siteId: number;
  siteName: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      const res = await fetch(`/api/portal/cms/websites/${siteId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.success) {
        router.push('/portal/websites');
      } else {
        setError(json.message || 'No se pudo eliminar el sitio web.');
        setDeleting(false);
      }
    } catch {
      setError('Algo salió mal.');
      setDeleting(false);
    }
  };

  return (
    <div className="bg-card border border-red-500/30 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <span className="material-icons text-red-500 text-lg">warning</span>
        <h3 className="font-semibold text-sm text-red-500">Zona de peligro</h3>
      </div>

      {!confirming ? (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-foreground font-medium">Eliminar este sitio web</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Elimina {siteName} y todo su contenido de forma permanente. Esta acción no se puede deshacer.
            </p>
          </div>
          <button
            onClick={() => setConfirming(true)}
            className="px-4 py-2 border border-red-500/50 text-red-500 rounded-lg text-sm font-medium hover:bg-red-500/10 transition-colors"
          >
            Eliminar sitio web
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-foreground">Escribe<span className="font-mono font-semibold text-red-500">{siteName}</span> para confirmar la eliminación.
          </p>
          <input
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder={siteName}
            className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-foreground outline-none focus:border-red-500 text-sm"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              onClick={handleDelete}
              disabled={confirmText !== siteName || deleting}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {deleting ? 'Eliminando...' : 'Eliminar definitivamente'}
            </button>
            <button
              onClick={() => { setConfirming(false); setConfirmText(''); setError(''); }}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
