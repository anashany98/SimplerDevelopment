'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pCardPad, pInput, pSelect } from '@/components/portal/portal-ui';

const durationOptions = [
  { value: 15, label: '15 minutos' },
  { value: 30, label: '30 minutos' },
  { value: 45, label: '45 minutos' },
  { value: 60, label: '60 minutos' },
  { value: 90, label: '90 minutos' },
  { value: 120, label: '120 minutos' },
];

export default function NewBookingPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(30);
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/portal/tools/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          duration,
          timezone,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.message || 'No se pudo crear la página de reservas');
        setLoading(false);
        return;
      }

      router.push(`/portal/tools/booking/${data.data.id}`);
    } catch {
      setError('Algo salió mal. Inténtalo de nuevo.');
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link
        href="/portal/tools/booking"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
      >
        <span className="material-icons text-lg">arrow_back</span>Volver a las páginas de reservas</Link>
      <PortalPageHeader
        eyebrow="Reservas"
        title="Crear página de reservas"
        subtitle="Configura una nueva página de agenda para que tus clientes reserven tiempo contigo"
      />

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
            <span className="material-icons">error</span>
            {error}
          </div>
        )}

        <div className={`${pCardPad} space-y-4`}>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Título</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="p. ej., Consulta de 30 minutos"
              className={pInput}
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Descripción<span className="font-normal text-muted-foreground ml-1">(opcional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción breve que verán las personas que reserven contigo"
              rows={3}
              className={`${pInput} resize-none`}
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="booking-duration" className="block text-sm font-medium text-foreground mb-1.5">Duración</label>
            <select
              id="booking-duration"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className={pSelect}
              disabled={loading}
            >
              {durationOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Zona horaria</label>
            <input
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="America/New_York"
              className={pInput}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Identificador de zona horaria IANA (p. ej. America/Chicago, Europe/London)
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !title.trim()}
          className={`w-full ${pBtnPrimary}`}
        >
          {loading ? (
            <>
              <span className="material-icons animate-spin text-lg">autorenew</span>
              Creando...
            </>
          ) : (
            <>
              <span className="material-icons text-lg">add_circle</span>Crear página de reservas</>
          )}
        </button>
      </form>
    </div>
  );
}
