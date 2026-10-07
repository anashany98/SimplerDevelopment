'use client';

import Link from 'next/link';
import {
  INCLUDED_SEATS,
  nextVolumeTier,
  SEAT_PRICE_CAP_CENTS,
  VOLUME_TIERS,
  volumeTierFor,
} from '@/lib/billing/domain-catalog';
import { formatMoney } from '@/lib/utils/money';

interface BillingPlansNoticesProps {
  paymentsEnabled: boolean;
  statusParam: string | null;
  actionError: string;
  billingMode: string;
  gatingBypassed: boolean;
  hasBundle: boolean;
  bundleActive: boolean;
  modules: Array<{ status: string | null; selfServe: boolean }>;
  seats: {
    count: number;
    additional: number;
    perSeatCents: number;
    seatTotalCents: number;
    moduleSubtotalCents: number;
  } | null;
}

function formatCents(cents: number): string {
  return formatMoney(cents, { fractionDigits: 0 });
}

export function BillingPlansNotices({
  paymentsEnabled,
  statusParam,
  actionError,
  billingMode,
  gatingBypassed,
  hasBundle,
  bundleActive,
  modules,
  seats,
}: BillingPlansNoticesProps) {
  const isAgency = billingMode === 'agency';
  const activeModuleCount = modules.filter((m) => m.status === 'active' && m.selfServe).length;
  const currentVolumeTier = volumeTierFor(activeModuleCount);
  const upcomingVolumeTier = nextVolumeTier(activeModuleCount);
  const showVolumeStrip = !isAgency && !gatingBypassed && !hasBundle && !bundleActive;

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href="/portal/settings/billing" className="text-muted-foreground hover:text-foreground">
          <span className="material-icons text-base align-middle">arrow_back</span>
        </Link>
        <div>
          <h1 className="text-2xl font-display font-extrabold tracking-[-0.01em] text-foreground">Planes y módulos</h1>
          <p className="text-sm text-muted-foreground">
            {paymentsEnabled
              ? 'Suscríbete a módulos individuales o consigue todo de una vez.'
              : 'Consulta los módulos y sus precios de referencia. La contratación en línea está desactivada.'}
          </p>
        </div>
      </div>

      {/* Status banners */}
      {!paymentsEnabled && (
        <div className="flex items-center gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-4 py-3 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300">
          <span className="material-icons text-base">info</span>
          Los pagos y la gestión de suscripciones desde el portal están desactivados actualmente.
        </div>
      )}
      {paymentsEnabled && statusParam === 'success' && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-4 py-3">
          <span className="material-icons text-base">check_circle</span>
          Suscripción activa: ¡te damos la bienvenida!
        </div>
      )}
      {paymentsEnabled && statusParam === 'cancelled' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted border border-border rounded-md px-4 py-3">
          <span className="material-icons text-base">info</span>
          Pago cancelado. No se ha hecho ningún cambio.
        </div>
      )}
      {actionError && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">
          <span className="material-icons text-base">error_outline</span>
          {actionError}
        </div>
      )}

      {/* Agency managed banner */}
      {(isAgency || (paymentsEnabled && gatingBypassed)) && (
        <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-2xl px-5 py-4">
          <span className="material-icons text-2xl text-primary">verified</span>
          <div>
            <p className="font-display font-extrabold tracking-[-0.01em] text-foreground">Todo está incluido en tu plan gestionado</p>
            <p className="text-sm text-muted-foreground">
              Tu plan lo gestiona CRM AGENTS. Contacta con nosotros para hacer cambios.
            </p>
          </div>
        </div>
      )}

      {/* Volume-discount strip — the more modules you run, the bigger the % off */}
      {showVolumeStrip && (
        <div className="rounded-2xl border border-border bg-muted/30 px-5 py-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-icons text-base text-primary">savings</span>
            <h2 className="text-sm font-display font-extrabold tracking-[-0.01em] text-foreground">
              {paymentsEnabled ? 'Precios por volumen — paga solo por lo que usas' : 'Descuentos por volumen de referencia'}
            </h2>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            {VOLUME_TIERS.slice().reverse().map((t) => {
              const unlocked = activeModuleCount >= t.minModules;
              return (
                <span
                  key={t.minModules}
                  className={[
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
                    unlocked ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                  ].join(' ')}
                >
                  <span className="material-icons text-sm">{unlocked ? 'check_circle' : 'lock'}</span>
                  {t.minModules}+ módulos → {t.percentOff}% dto.
                </span>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {currentVolumeTier ? (
              <span className="text-primary font-medium">
                Tienes {activeModuleCount} módulos: descuento por volumen del {currentVolumeTier.percentOff}% desbloqueado.
              </span>
            ) : (
              <span>Tienes {activeModuleCount} módulo{activeModuleCount === 1 ? '' : 's'}.</span>
            )}
            {upcomingVolumeTier && (
              <>
                {' '}Añade{' '}
                <strong className="text-foreground">{upcomingVolumeTier.minModules - activeModuleCount} más</strong>{' '}
                para alcanzar el {upcomingVolumeTier.percentOff}% dto.
              </>
            )}
          </p>
        </div>
      )}

      {/* Team seats — only for self-serve accounts */}
      {!isAgency && !gatingBypassed && seats && (
        <div className="rounded-2xl border border-border bg-muted/30 px-5 py-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-icons text-base text-primary">groups</span>
            <h2 className="text-sm font-display font-extrabold tracking-[-0.01em] text-foreground">Asientos de equipo</h2>
          </div>
          <p className="text-sm text-foreground mb-1">
            {seats.count} asiento{seats.count !== 1 ? 's' : ''} —{' '}
            {INCLUDED_SEATS} incluidos
            {seats.additional > 0 && `, ${seats.additional} de más`}
          </p>
          <div className="flex items-baseline gap-4 text-xs text-muted-foreground flex-wrap">
            <span>
              Por asiento adicional:{' '}
              <span className="font-medium text-foreground">{formatCents(seats.perSeatCents)}/mes</span>
              {seats.perSeatCents < seats.moduleSubtotalCents && (
                <span className="ml-1">(limitado a {formatCents(SEAT_PRICE_CAP_CENTS)}/asiento)</span>
              )}
            </span>
            {seats.additional > 0 && (
              <span>
                Total de asientos:{' '}
                <span className="font-semibold text-foreground">{formatCents(seats.seatTotalCents)}/mes</span>
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Cada{' '}
            <Link href="/portal/settings/team" className="underline hover:text-foreground transition-colors">
              miembro del equipo
            </Link>{' '}
            {paymentsEnabled
              ? ` adicional se factura al total de tus módulos, con un límite de ${SEAT_PRICE_CAP_CENTS / 100} €/asiento, desde que acepta su invitación.`
              : ` adicional tendría un coste de referencia de hasta ${SEAT_PRICE_CAP_CENTS / 100} €/asiento; la facturación en línea está desactivada.`}
          </p>
        </div>
      )}
    </>
  );
}
