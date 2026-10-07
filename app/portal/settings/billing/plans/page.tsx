import { redirect } from 'next/navigation';

// Self-serve module pricing page — /portal/settings/billing/plans
//
// Fetches GET /api/portal/billing/modules, renders:
//   - Hero bundle card with savings badge
//   - Responsive grid of per-domain module cards
//   - Checkout and cancellation actions when customer payments are enabled
//   - ?highlight=<key>   → scroll-to + ring highlight
//   - ?status=success    → green toast
//   - ?status=cancelled  → neutral banner
//
// Material Icons only — no emoji per repo convention.

import { type ReactNode, Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BillingPlansNotices } from './BillingPlansNotices';
import { formatMoney } from '@/lib/utils/money';
import { pBtnPrimary, pBtnGhost } from '@/components/portal/portal-ui';
import { verifyCheckoutSession } from '@/components/portal/billing/verify-checkout-session';

// Where BYOK ("bring your own AI key") enquiries go — no self-serve price.
const BYOK_MAILTO =
  'mailto:sales@simplerdevelopment.com?subject=BYOK%20pricing%20—%20bring%20your%20own%20AI%20key';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DomainMeter {
  resource: string;
  label: string;
  unit: string;
  includedPerMonth: number;
  overageRateCents: number;
  overageUnitSize: number;
  waivedForByok: boolean;
}

interface ModuleInfo {
  key: string;
  slug: string;
  name: string;
  tagline: string;
  icon: string;
  features: string[];
  meters: DomainMeter[];
  byokProviders: string[];
  monthlyPriceCents: number;
  serviceId: number | null;
  stripePriceId: string | null;
  purchasable: boolean;
  clientServiceId: number | null;
  status: string | null;
  renewalDate: string | null;
  selfServe: boolean;
}

interface BundleInfo {
  slug: string;
  name: string;
  tagline: string;
  icon: string;
  monthlyPriceCents: number;
  serviceId: number | null;
  stripePriceId: string | null;
  purchasable: boolean;
  clientServiceId: number | null;
  status: string | null;
  renewalDate: string | null;
  selfServe: boolean;
}

interface EntitlementsInfo {
  domains: string[];
  hasBundle: boolean;
  gatingBypassed: boolean;
}

interface SeatsInfo {
  count: number;
  included: number;
  additional: number;
  capCents: number;
  perSeatCents: number;
  seatTotalCents: number;
  moduleSubtotalCents: number;
}

interface ModulesResponse {
  success: boolean;
  data?: {
    paymentsEnabled: boolean;
    billingMode: string;
    entitlements: EntitlementsInfo;
    bundle: BundleInfo;
    modules: ModuleInfo[];
    seats: SeatsInfo;
  };
  message?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCents(cents: number): string { return formatMoney(cents, { fractionDigits: 0 }); }

function formatMeterLabel(meter: DomainMeter): string {
  const included = meter.includedPerMonth.toLocaleString('es-ES');
  const overageUnit = meter.overageUnitSize === 1
    ? meter.unit
    : `${meter.overageUnitSize.toLocaleString('es-ES')} ${meter.unit}`;
  const overageDollars = (meter.overageRateCents / 100).toFixed(2).replace('.', ',');
  return `${included} ${meter.unit}/mes incluidos, luego ${overageDollars} € por ${overageUnit}`;
}

// ── Module Card ───────────────────────────────────────────────────────────────

interface ModuleCardProps {
  mod: ModuleInfo;
  hasBundle: boolean;
  billingMode: string;
  paymentsEnabled: boolean;
  highlight: boolean;
  onSubscribe: (slug: string) => void;
  onCancel: (clientServiceId: number) => void;
  subscribing: string | null;
  cancelling: number | null;
}

function ModuleCard({
  mod,
  hasBundle,
  billingMode,
  paymentsEnabled,
  highlight,
  onSubscribe,
  onCancel,
  subscribing,
  cancelling,
}: ModuleCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const isActive = mod.status === 'active';
  const isAgency = billingMode === 'agency';

  useEffect(() => {
    if (highlight && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlight]);

  // Determine state label + button
  let stateLabel: ReactNode = null;
  let actionButton: ReactNode = null;

  if (isActive && hasBundle) {
    stateLabel = (
      <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
        <span className="material-icons text-sm">all_inclusive</span>
        Incluido en el pack
      </span>
    );
  } else if (isActive && mod.selfServe) {
    stateLabel = (
      <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">
        <span className="material-icons text-sm">check_circle</span>Activo</span>
    );
    if (!isAgency && paymentsEnabled) {
      actionButton = (
        <button
          onClick={() => mod.clientServiceId && onCancel(mod.clientServiceId)}
          disabled={cancelling === mod.clientServiceId}
          className={`${pBtnGhost} w-full mt-3`}
        >
          {cancelling === mod.clientServiceId ? 'Quitando…' : 'Quitar'}
        </button>
      );
    }
  } else if (isActive) {
    stateLabel = (
      <span className="inline-flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">
        <span className="material-icons text-sm">manage_accounts</span>
        Gestionado
      </span>
    );
  } else if (paymentsEnabled && !isAgency && mod.purchasable) {
    actionButton = (
      <button
        onClick={() => onSubscribe(mod.slug)}
        disabled={subscribing === mod.slug}
        className={`${pBtnPrimary} w-full mt-3`}
      >
        {subscribing === mod.slug ? 'Redirigiendo…' : 'Suscribirse'}
      </button>
    );
  } else if (paymentsEnabled && !isAgency && !mod.purchasable) {
    actionButton = (
      <p
        className="text-xs text-amber-600 dark:text-amber-500 mt-3 flex items-center gap-1"
        title="Aún no está disponible para la contratación autónoma: contáctanos"
      >
        <span className="material-icons text-sm">info</span>Aún no está disponible para la contratación autónoma: contáctanos</p>
    );
  }

  // BYOK waiver note
  const byokMeterNote =
    billingMode === 'byok' &&
    mod.meters.length > 0 &&
    mod.meters.every((m) => m.waivedForByok)
      ? 'El uso va con tus propias claves de API, sin costes de uso.'
      : null;

  return (
    <div
      ref={cardRef}
      className={`relative bg-card border rounded-2xl p-5 flex flex-col transition-all ${
        highlight ? 'ring-2 ring-primary border-primary' : 'border-border'
      } ${isActive ? 'border-green-500/40' : ''}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="material-icons text-2xl text-primary">{mod.icon}</span>
          <div>
            <h3 className="text-base font-display font-extrabold tracking-[-0.01em] text-foreground leading-tight">{mod.name}</h3>
          </div>
        </div>
        {stateLabel && <div className="shrink-0">{stateLabel}</div>}
      </div>

      <p className="text-sm text-muted-foreground mb-3">{mod.tagline}</p>

      {/* Price */}
      <div className="flex items-baseline gap-1 mb-4">
        <span className="text-2xl font-display font-extrabold tracking-[-0.02em] text-foreground">{formatCents(mod.monthlyPriceCents)}</span>
        <span className="text-sm text-muted-foreground">/mes</span>
      </div>

      {/* Feature bullets */}
      <ul className="space-y-1.5 mb-4 flex-1">
        {mod.features.map((feat, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-foreground">
            <span className="material-icons text-sm text-primary mt-0.5 shrink-0">check_circle</span>
            <span>{feat}</span>
          </li>
        ))}
      </ul>

      {/* Meters */}
      {mod.meters.length > 0 && (
        <div className="border-t border-border pt-3 mb-3 space-y-1">
          {mod.meters.map((m) => (
            <p key={m.resource} className="text-xs text-muted-foreground">
              <span className="material-icons text-xs align-middle mr-1">speed</span>
              {formatMeterLabel(m)}
            </p>
          ))}
        </div>
      )}

      {/* BYOK note */}
      {byokMeterNote && (
        <p className="text-xs text-blue-600 dark:text-blue-400 mb-2">
          <span className="material-icons text-xs align-middle mr-1">key</span>
          {byokMeterNote}
        </p>
      )}

      {/* Action */}
      {actionButton}
    </div>
  );
}

// ── Main Page (inner — needs Suspense for useSearchParams) ───────────────────

function BillingPlansInner() {
  const searchParams = useSearchParams();
  const highlight = searchParams.get('highlight') ?? '';
  const statusParam = searchParams.get('status');

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ModulesResponse['data'] | null>(null);
  const [error, setError] = useState('');
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadModules = async () => {
      try {
        let response = await fetch('/api/portal/billing/modules');
        let result = await response.json() as ModulesResponse;

        // Verify a returned Checkout session only while portal payments are enabled.
        if (result.success && result.data?.paymentsEnabled && statusParam === 'success') {
          await verifyCheckoutSession(searchParams.get('session_id'));
          response = await fetch('/api/portal/billing/modules');
          result = await response.json() as ModulesResponse;
        }

        if (cancelled) return;
        if (!result.success) {
          setError(result.message ?? 'No se pudieron cargar los módulos');
          setLoading(false);
          return;
        }
        setData(result.data ?? null);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      }
    };
    void loadModules();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubscribe(slug: string) {
    if (!data?.paymentsEnabled) return;
    setSubscribing(slug);
    setActionError('');
    try {
      // Prefer add-item: append to the client's existing subscription so every
      // module shares ONE subscription and the volume discount re-syncs as the
      // count crosses a threshold. Falls back to a fresh Checkout only when
      // there's no subscription yet (the first purchase, which carries the trial).
      const addRes = await fetch('/api/portal/billing/modules/add-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const addJson = await addRes.json();
      if (addJson.success) {
        // Added in place — refresh state without leaving the page.
        const refreshed = await fetch('/api/portal/billing/modules').then((r) => r.json() as Promise<ModulesResponse>);
        if (refreshed.success && refreshed.data) setData(refreshed.data);
        setSubscribing(null);
        return;
      }
      if (addRes.status === 409 && addJson.useCheckout) {
        // No subscription yet → full Stripe Checkout (handles the 14-day trial).
        const res = await fetch('/api/portal/billing/modules/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug }),
        });
        const json = await res.json();
        if (!json.success) { setActionError(json.message ?? 'El pago ha fallado.'); setSubscribing(null); return; }
        window.location.href = json.data.url;
        return;
      }
      setActionError(addJson.message ?? 'No se pudo completar la suscripción.');
      setSubscribing(null);
    } catch (err) {
      setActionError(String(err));
      setSubscribing(null);
    }
  }

  async function handleCancel(clientServiceId: number) {
    if (!data?.paymentsEnabled) return;
    setCancelling(clientServiceId);
    setActionError('');
    try {
      const res = await fetch(`/api/portal/billing/modules/${clientServiceId}/cancel`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!json.success) { setActionError(json.message ?? 'No se pudo cancelar.'); setCancelling(null); return; }
      // Refresh data
      const refreshed = await fetch('/api/portal/billing/modules').then((r) => r.json() as Promise<ModulesResponse>);
      if (refreshed.success && refreshed.data) setData(refreshed.data);
    } catch (err) {
      setActionError(String(err));
    } finally {
      setCancelling(null);
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Cargando planes…</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">
          <span className="material-icons text-base">error_outline</span>
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { paymentsEnabled, billingMode, entitlements, bundle, modules, seats } = data;
  const isAgency = billingMode === 'agency';
  const { hasBundle, gatingBypassed } = entitlements;

  // Live sum of individual module prices for savings badge
  const sumModulePrices = modules.reduce((sum, m) => sum + m.monthlyPriceCents, 0);
  const bundleSavings = sumModulePrices - bundle.monthlyPriceCents;

  const bundleActive = bundle.status === 'active';

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <BillingPlansNotices
        paymentsEnabled={paymentsEnabled}
        statusParam={statusParam}
        actionError={actionError}
        billingMode={billingMode}
        gatingBypassed={gatingBypassed}
        hasBundle={hasBundle}
        bundleActive={bundleActive}
        modules={modules}
        seats={seats}
      />
      {/* Hero bundle card */}
      <div className={`bg-card border rounded-2xl p-6 ${bundleActive ? 'border-primary ring-2 ring-primary/20' : 'border-border'}`}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex items-start gap-4">
            <span className="material-icons text-4xl text-primary">{bundle.icon}</span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-display font-extrabold tracking-[-0.01em] text-foreground">{bundle.name}</h2>
                {bundleActive && (
                  <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                    <span className="material-icons text-sm">check</span>Activo</span>
                )}
                {bundleSavings > 0 && !bundleActive && (
                  <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">
                    <span className="material-icons text-sm">savings</span>
                    Ahorra {formatCents(bundleSavings)}/mes frente a comprarlos por separado
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">{bundle.tagline}</p>
            </div>
          </div>

          <div className="flex items-center gap-6 shrink-0">
            <div className="text-right">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-display font-extrabold tracking-[-0.02em] text-foreground">{formatCents(bundle.monthlyPriceCents)}</span>
                <span className="text-sm text-muted-foreground">/mes</span>
              </div>
              {bundleSavings > 0 && (
                <p className="text-xs text-muted-foreground line-through">{formatCents(sumModulePrices)}/mes</p>
              )}
            </div>

            {!isAgency && !gatingBypassed && (
              bundleActive ? (
                bundle.selfServe && bundle.clientServiceId ? (
                  paymentsEnabled ? (
                    <button
                      onClick={() => handleCancel(bundle.clientServiceId!)}
                      disabled={cancelling === bundle.clientServiceId}
                      className={pBtnGhost}
                    >
                      {cancelling === bundle.clientServiceId ? 'Cancelando…' : 'Cancelar al final del periodo'}
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Gestión en línea desactivada</span>
                  )
                ) : (
                  <span className="text-sm text-muted-foreground">Gestionado</span>
                )
              ) : !paymentsEnabled ? (
                <span className="text-xs text-muted-foreground">Contratación en línea desactivada</span>
              ) : bundle.purchasable ? (
                <button
                  onClick={() => handleSubscribe(bundle.slug)}
                  disabled={subscribing === bundle.slug}
                  className={pBtnPrimary}
                >
                  {subscribing === bundle.slug ? 'Redirigiendo…' : 'Suscribirse a todo'}
                </button>
              ) : (
                <p
                  className="text-xs text-amber-600 dark:text-amber-500 flex items-center gap-1"
                  title="Aún no está disponible para la contratación autónoma: contáctanos"
                >
                  <span className="material-icons text-sm">info</span>Aún no está disponible para la contratación autónoma: contáctanos</p>
              )
            )}
          </div>
        </div>
      </div>

      {/* Bundle active: note about included modules */}
      {bundleActive && (
        <div className="flex items-center gap-2 text-sm text-primary bg-primary/5 border border-primary/20 rounded-md px-4 py-3">
          <span className="material-icons text-base">all_inclusive</span>
          Todos los módulos están incluidos en tu suscripción al pack.
        </div>
      )}

      {/* Module grid */}
      <div>
        <h2 className="text-lg font-display font-extrabold tracking-[-0.01em] text-foreground mb-4">Módulos individuales</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {modules.map((mod) => (
            <ModuleCard
              key={mod.key}
              mod={mod}
              hasBundle={hasBundle || bundleActive}
              billingMode={billingMode}
              paymentsEnabled={paymentsEnabled}
              highlight={highlight === mod.key}
              onSubscribe={handleSubscribe}
              onCancel={handleCancel}
              subscribing={subscribing}
              cancelling={cancelling}
            />
          ))}
        </div>
      </div>

      {/* BYOK — contact sales, not self-serve */}
      {!isAgency && (
        <a
          href={BYOK_MAILTO}
          className="flex items-start gap-3 rounded-xl border-2 border-dashed border-border p-5 hover:border-primary/50 transition-colors"
        >
          <span className="material-icons text-2xl text-primary">vpn_key</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold text-foreground">Usa tu propia clave de IA (BYOK)</h3>
              <span className="text-xs font-medium text-primary">Habla con ventas →</span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Gasta tokens de IA a coste con tu propia clave de proveedor, además de marca blanca y gobernanza. Precio personalizado: escríbenos para configurarlo.
            </p>
          </div>
        </a>
      )}

      <p className="text-xs text-muted-foreground pb-4">
        {paymentsEnabled
          ? 'Las suscripciones se facturan mensualmente a través de Stripe. Puedes cancelar en cualquier momento; el acceso continúa hasta el final del periodo de facturación.'
          : 'Los precios mostrados son de referencia. Para consultar la disponibilidad de contratación, contacta con la administración de la plataforma.'}
      </p>
    </div>
  );
}

// useSearchParams() requires a Suspense boundary in App Router.
export default function BillingPlansPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Cargando planes…</div>}>
      <BillingPlansInner />
    </Suspense>
  );
}
