'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  ticketId: number;
  isStaff: boolean;
}

export default function TicketReplyForm({ ticketId, isStaff }: Props) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setLoading(true);
    setError('');

    const res = await fetch(`/api/portal/tickets/${ticketId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body, isInternal }),
    });

    const data = await res.json();
    setLoading(false);

    if (!data.success) {
      setError(data.message ?? 'No se pudo enviar la respuesta.');
    } else {
      setBody('');
      setIsInternal(false);
      router.refresh();
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <h2 className="text-sm font-semibold text-foreground mb-3">
        {isStaff ? 'Responder al cliente' : 'Responder'}
      </h2>

      {error && (
        <div className="mb-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive flex items-center gap-2">
          <span className="material-icons text-base">error_outline</span>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={4}
          placeholder="Escribe tu respuesta…"
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-y"
        />

        {isStaff && (
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={isInternal}
              onChange={(e) => setIsInternal(e.target.checked)}
              className="rounded border-border"
            />
            <span className="text-muted-foreground">Nota interna (oculta para el cliente)</span>
          </label>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading || !body.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-foreground text-background rounded-lg text-sm font-medium hover:bg-foreground/90 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <><span className="material-icons text-base animate-spin">refresh</span>Enviando...</>
            ) : (
              <><span className="material-icons text-base">send</span>Enviar respuesta</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
