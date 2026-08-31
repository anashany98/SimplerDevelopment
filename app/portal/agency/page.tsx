'use client';

// Agency settings hub for the white-label / SaaS Mode tier. Orientation
// page: shows current state at a glance, links to the deeper config pages
// (custom domain, agency branding), and exposes the white-label kill-
// switch which gates on a verified custom domain.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';

interface AgencyStatus {
  customDomain: string | null;
  verifiedAt: string | null;
  whiteLabelEnabled: boolean;
  agencyName: string | null;
  agencyLogoUrl: string | null;
}

export default function AgencyHubPage() {
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [status, setStatus] = useState<AgencyStatus>({
    customDomain: null,
    verifiedAt: null,
    whiteLabelEnabled: false,
    agencyName: null,
    agencyLogoUrl: null,
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [domainRes, brandingRes] = await Promise.all([
        fetch('/api/portal/agency/custom-domain').then(r => r.json()),
        fetch('/api/portal/agency/branding').then(r => r.json()),
      ]);
      setStatus({
        customDomain: domainRes?.data?.customDomain ?? null,
        verifiedAt: domainRes?.data?.verifiedAt ?? null,
        whiteLabelEnabled: domainRes?.data?.whiteLabelEnabled ?? false,
        agencyName: brandingRes?.data?.agencyName ?? null,
        agencyLogoUrl: brandingRes?.data?.agencyLogoUrl ?? null,
      });
    } catch {
      setMessage({ type: 'error', text: 'No se pudieron cargar los ajustes de la agencia.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function toggleWhiteLabel(next: boolean) {
    setToggling(true);
    setMessage(null);
    try {
      const res = await fetch('/api/portal/agency/white-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus(s => ({ ...s, whiteLabelEnabled: next }));
        setMessage({ type: 'success', text: next ? 'Marca blanca activada.' : 'Marca blanca desactivada.' });
      } else {
        setMessage({ type: 'error', text: data.error || 'No se pudo actualizar la marca blanca.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error de red.' });
    } finally {
      setToggling(false);
    }
  }

  const verified = !!status.verifiedAt;
  const canEnable = verified && !!status.agencyName;

  return (
    <div className="max-w-3xl">
      <PortalPageHeader
        eyebrow="Marca blanca"
        title="Agencia / Marca blanca"
        subtitle="Configura el portal de tu agencia. Asocia un dominio personalizado, personaliza la marca y revende la plataforma con tu propia identidad."
      />

      {message && (
        <div
          className={`mb-4 p-3 rounded-xl flex items-center gap-2 text-sm ${
            message.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
              : 'bg-destructive/10 text-destructive border border-destructive/20'
          }`}
        >
          <span className="material-icons text-base">
            {message.type === 'success' ? 'check_circle' : 'error_outline'}
          </span>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
        </div>
      ) : (
        <div className="space-y-4">
          {/* White-label toggle card */}
          <section className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-display font-extrabold tracking-[-0.01em] text-foreground flex items-center gap-2">
                  <span className="material-icons text-primary">campaign</span>
                  Modo marca blanca
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Al activarlo, la interfaz del portal muestra el nombre y logo de tu agencia en lugar de
                  &quot;CRM AGENTS&quot;. Disponible en el plan Scale.
                </p>
                {!canEnable && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-2 flex items-center gap-1">
                    <span className="material-icons text-sm">info</span>
                    {!verified
                      ? 'Verifica un dominio personalizado para desbloquear este interruptor.'
                      : 'Establece un nombre de agencia para desbloquear este interruptor.'}
                  </p>
                )}
              </div>
              <label
                className={`relative inline-flex items-center cursor-pointer ${
                  !canEnable && !status.whiteLabelEnabled ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                title={!canEnable && !status.whiteLabelEnabled ? 'Primero verifica un dominio personalizado y establece un nombre de agencia' : ''}
              >
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={status.whiteLabelEnabled}
                  disabled={toggling || (!canEnable && !status.whiteLabelEnabled)}
                  onChange={e => toggleWhiteLabel(e.target.checked)}
                />
                <div className="w-11 h-6 bg-muted rounded-full peer-checked:bg-primary peer-disabled:opacity-50 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-5"></div>
              </label>
            </div>
          </section>

          {/* Custom domain card */}
          <Link
            href="/portal/agency/custom-domain"
            className="block bg-card border border-border rounded-2xl p-6 hover:border-primary/50 transition-colors"
          >
            <div className="flex items-start gap-4">
              <span className="material-icons text-primary text-3xl">dns</span>
              <div className="flex-1">
                <h3 className="text-lg font-display font-extrabold tracking-[-0.01em] text-foreground">Dominio personalizado del portal</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Asocia tu propio dominio (p. ej. portal.tu-agencia.com) a este portal.
                </p>
                <div className="mt-2 text-sm flex items-center gap-2">
                  {status.customDomain ? (
                    <>
                      <code className="px-2 py-0.5 rounded bg-muted text-foreground">{status.customDomain}</code>
                      {verified ? (
                        <span className="text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                          <span className="material-icons text-sm">verified</span>
                          Verificado
                        </span>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1">
                          <span className="material-icons text-sm">schedule</span>
                          Verificación pendiente
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground italic">No hay dominio personalizado configurado</span>
                  )}
                </div>
              </div>
              <span className="material-icons text-muted-foreground">chevron_right</span>
            </div>
          </Link>

          {/* Agency branding card */}
          <Link
            href="/portal/agency/branding"
            className="block bg-card border border-border rounded-2xl p-6 hover:border-primary/50 transition-colors"
          >
            <div className="flex items-start gap-4">
              <span className="material-icons text-primary text-3xl">palette</span>
              <div className="flex-1">
                <h3 className="text-lg font-display font-extrabold tracking-[-0.01em] text-foreground">Marca de la agencia</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Personaliza la interfaz del portal con tu propio nombre, logo y color de acento.
                </p>
                <div className="mt-2 text-sm flex items-center gap-2">
                  {status.agencyName ? (
                    <span className="text-foreground">{status.agencyName}</span>
                  ) : (
                    <span className="text-muted-foreground italic">Sin configurar</span>
                  )}
                  {status.agencyLogoUrl && (
                    <span className="text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                      <span className="material-icons text-sm">image</span>
                      Logo configurado
                    </span>
                  )}
                </div>
              </div>
              <span className="material-icons text-muted-foreground">chevron_right</span>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}
