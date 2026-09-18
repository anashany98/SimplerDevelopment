'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pCard, pCardPad, pSectionTitle, pInput, pSelect } from '@/components/portal/portal-ui';

interface ShipFromAddress {
  name?: string | null;
  company?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string | null;
}

interface StoreSettings {
  enabled: boolean;
  storeName: string;
  currency: string;
  taxRate: number;
  taxInclusive: boolean;
  requiresShipping: boolean;
  lowStockThreshold: number;
  orderPrefix: string;
  enableReviews: boolean;
  stripeConnected: boolean;
  stripeAccountId?: string | null;
  payoutSchedule?: string | null;
  platformFeePercent?: number | null;
  // Customer portal
  enableCustomerAccounts: boolean;
  enableGuestCheckout: boolean;
  enableWishlist: boolean;
  enableOrderTracking: boolean;
  enableCustomerSupport: boolean;
  customerPortalWelcomeMessage?: string | null;
  supportEmail?: string | null;
  returnPolicyUrl?: string | null;
  shippingPolicyUrl?: string | null;
  // Shipping provider
  shippingProvider: 'manual' | 'easypost';
  easypostApiKeyConfigured: boolean;
  easypostApiKeyLast4: string | null;
  easypostMode: 'test' | 'production' | null;
  easypostWebhookSecret: string | null;
  shipFromAddress: ShipFromAddress | null;
  defaultParcelLengthIn: string | number | null;
  defaultParcelWidthIn: string | number | null;
  defaultParcelHeightIn: string | number | null;
  defaultParcelWeightOz: string | number | null;
  liveRatesFallback: boolean;
  // Stripe BYOK
  stripeMode: 'connect' | 'byok';
  stripeByokAllowed: boolean;
  stripeSecretKeyConfigured: boolean;
  stripeSecretKeyLast4: string | null;
  stripePublishableKey: string | null;
  stripeWebhookSecretConfigured: boolean;
  // Printful fulfillment
  fulfillmentProvider: 'manual' | 'printful';
  printfulApiKeyConfigured: boolean;
  printfulApiKeyLast4: string | null;
  printfulStoreId: string | null;
}

interface StripeTestResultOk {
  account: {
    id: string;
    business_name?: string | null;
    charges_enabled: boolean;
    payouts_enabled: boolean;
  };
}

interface StripeTestResultErr {
  message: string;
  code?: string;
}

type StripeTestResult =
  | { ok: true; data: StripeTestResultOk }
  | { ok: false; error: StripeTestResultErr };

interface TestResultOk {
  ok: true;
  rateCount: number;
  sampleRates: Array<{ carrier: string; service: string; amountCents: number; estDeliveryDays: number | null }>;
}

interface TestResultErr {
  ok: false;
  message: string;
  code?: string;
}

type TestResult = TestResultOk | TestResultErr;

const currencies = [
  { value: 'USD', label: 'USD - Dólar estadounidense' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - Libra esterlina' },
  { value: 'CAD', label: 'CAD - Dólar canadiense' },
  { value: 'AUD', label: 'AUD - Dólar australiano' },
];

export default function StoreSettingsPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const base = `/api/portal/websites/${siteId}/store`;

  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [connectingStripe, setConnectingStripe] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Stripe BYOK state
  const [stripeSecretInput, setStripeSecretInput] = useState('');
  const [savingStripeSecret, setSavingStripeSecret] = useState(false);
  const [stripeWebhookInput, setStripeWebhookInput] = useState('');
  const [savingStripeWebhook, setSavingStripeWebhook] = useState(false);
  const [testingStripe, setTestingStripe] = useState(false);
  const [stripeTestResult, setStripeTestResult] = useState<StripeTestResult | null>(null);
  const [webhookUrlCopied, setWebhookUrlCopied] = useState(false);

  // Printful state
  const [printfulApiKeyInput, setPrintfulApiKeyInput] = useState('');
  const [savingPrintfulApiKey, setSavingPrintfulApiKey] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${base}/settings`);
      const data = await res.json();
      if (data.success) setSettings(data.data);
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      // Strip read-only / dedicated-flow fields before PUT.
      const {
        easypostApiKeyConfigured: _ro1,
        easypostApiKeyLast4: _ro2,
        stripeConnected: _ro3,
        stripeAccountId: _ro4,
        payoutSchedule: _ro5,
        platformFeePercent: _ro6,
        // Stripe BYOK read-only fields (server-derived or admin-controlled)
        stripeByokAllowed: _ro7,
        stripeSecretKeyConfigured: _ro8,
        stripeSecretKeyLast4: _ro9,
        stripeWebhookSecretConfigured: _ro10,
        // Printful read-only fields (server-derived)
        printfulApiKeyConfigured: _ro11,
        printfulApiKeyLast4: _ro12,
        ...mutable
      } = settings;
      void _ro1; void _ro2; void _ro3; void _ro4; void _ro5; void _ro6;
      void _ro7; void _ro8; void _ro9; void _ro10; void _ro11; void _ro12;
      const payload = {
        ...mutable,
        taxRate: settings.taxRate / 100, // Convert percentage to decimal for API
        defaultParcelLengthIn: settings.defaultParcelLengthIn === '' || settings.defaultParcelLengthIn === null
          ? null
          : Number(settings.defaultParcelLengthIn),
        defaultParcelWidthIn: settings.defaultParcelWidthIn === '' || settings.defaultParcelWidthIn === null
          ? null
          : Number(settings.defaultParcelWidthIn),
        defaultParcelHeightIn: settings.defaultParcelHeightIn === '' || settings.defaultParcelHeightIn === null
          ? null
          : Number(settings.defaultParcelHeightIn),
        defaultParcelWeightOz: settings.defaultParcelWeightOz === '' || settings.defaultParcelWeightOz === null
          ? null
          : Number(settings.defaultParcelWeightOz),
      };
      const res = await fetch(`${base}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Ajustes guardados correctamente.');
        load();
      } else {
        setError(data.message || 'No se pudieron guardar los ajustes.');
      }
    } catch {
      setError('Algo salió mal.');
    } finally {
      setSaving(false);
    }
  };

  const connectStripe = async () => {
    setConnectingStripe(true);
    setError('');
    try {
      const res = await fetch(`${base}/stripe-connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
      } else {
        setError(data.message || 'No se pudo iniciar Stripe Connect.');
      }
    } catch {
      setError('Algo salió mal.');
    } finally {
      setConnectingStripe(false);
    }
  };

  const updateField = <K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
    setError('');
    setSuccess('');
  };

  const updateShipFromField = <K extends keyof ShipFromAddress>(key: K, value: ShipFromAddress[K]) => {
    if (!settings) return;
    const current: ShipFromAddress = settings.shipFromAddress ?? {
      line1: '', city: '', state: '', postalCode: '', country: 'US',
    };
    setSettings({ ...settings, shipFromAddress: { ...current, [key]: value } });
    setError('');
    setSuccess('');
  };

  const saveApiKey = async () => {
    if (!apiKeyInput) return;
    setSavingApiKey(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${base}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ easypostApiKeyPlaintext: apiKeyInput }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Clave API de EasyPost guardada.');
        setApiKeyInput('');
        await load();
      } else {
        setError(data.message || 'No se pudo guardar la clave.');
      }
    } catch {
      setError('Algo salió mal.');
    } finally {
      setSavingApiKey(false);
    }
  };

  const clearApiKey = async () => {
    setSavingApiKey(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${base}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ easypostApiKeyClear: true }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Clave API de EasyPost eliminada.');
        await load();
      } else {
        setError(data.message || 'No se pudo eliminar la clave.');
      }
    } catch {
      setError('Algo salió mal.');
    } finally {
      setSavingApiKey(false);
    }
  };

  const testConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await fetch(`${base}/easypost/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({
          ok: true,
          rateCount: data.data.rateCount,
          sampleRates: data.data.sampleRates,
        });
      } else {
        setTestResult({ ok: false, message: data.message || 'La prueba de conexión falló', code: data.code });
      }
    } catch {
      setTestResult({ ok: false, message: 'Error de red al ejecutar la prueba' });
    } finally {
      setTestingConnection(false);
    }
  };

  const parcelNumber = (v: string | number | null | undefined): string => {
    if (v === null || v === undefined) return '';
    return String(v);
  };

  // Stripe BYOK handlers ──────────────────────────────────────────────
  const saveStripeSecret = async () => {
    if (!stripeSecretInput) return;
    setSavingStripeSecret(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${base}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stripeSecretKeyPlaintext: stripeSecretInput }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Clave secreta de Stripe guardada.');
        setStripeSecretInput('');
        await load();
      } else {
        setError(data.message || 'No se pudo guardar la clave secreta.');
      }
    } catch {
      setError('Algo salió mal.');
    } finally {
      setSavingStripeSecret(false);
    }
  };

  const clearStripeSecret = async () => {
    setSavingStripeSecret(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${base}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stripeSecretKeyClear: true }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Clave secreta de Stripe eliminada.');
        await load();
      } else {
        setError(data.message || 'No se pudo eliminar la clave secreta.');
      }
    } catch {
      setError('Algo salió mal.');
    } finally {
      setSavingStripeSecret(false);
    }
  };

  const saveStripeWebhookSecret = async () => {
    if (!stripeWebhookInput) return;
    setSavingStripeWebhook(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${base}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stripeWebhookSecretPlaintext: stripeWebhookInput }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Secreto del webhook de Stripe guardado.');
        setStripeWebhookInput('');
        await load();
      } else {
        setError(data.message || 'No se pudo guardar el secreto del webhook.');
      }
    } catch {
      setError('Algo salió mal.');
    } finally {
      setSavingStripeWebhook(false);
    }
  };

  const clearStripeWebhookSecret = async () => {
    setSavingStripeWebhook(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${base}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stripeWebhookSecretClear: true }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Secreto del webhook de Stripe eliminado.');
        await load();
      } else {
        setError(data.message || 'No se pudo eliminar el secreto del webhook.');
      }
    } catch {
      setError('Algo salió mal.');
    } finally {
      setSavingStripeWebhook(false);
    }
  };

  const testStripeConnection = async () => {
    setTestingStripe(true);
    setStripeTestResult(null);
    try {
      const res = await fetch(`${base}/stripe/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        setStripeTestResult({ ok: true, data: data.data });
      } else {
        setStripeTestResult({ ok: false, error: { message: data.message || 'La prueba de conexión falló', code: data.code } });
      }
    } catch {
      setStripeTestResult({ ok: false, error: { message: 'Error de red al ejecutar la prueba' } });
    } finally {
      setTestingStripe(false);
    }
  };

  const stripeMode = settings?.stripeMode ?? 'connect';
  const stripeByokAllowed = settings?.stripeByokAllowed ?? false;
  const stripeWebhookUrl = `${
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_APP_URL) || 'https://app.simplerdevelopment.com'
  }/api/stripe/webhook/ecommerce?siteId=${siteId}`;

  const copyWebhookUrl = async () => {
    try {
      await navigator.clipboard.writeText(stripeWebhookUrl);
      setWebhookUrlCopied(true);
      setTimeout(() => setWebhookUrlCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  // Printful API key handlers ─────────────────────────────────────────────
  const savePrintfulApiKey = async () => {
    if (!printfulApiKeyInput) return;
    setSavingPrintfulApiKey(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${base}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printfulApiKeyPlaintext: printfulApiKeyInput }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Clave API de Printful guardada.');
        setPrintfulApiKeyInput('');
        await load();
      } else {
        setError(data.message || 'No se pudo guardar la clave API de Printful.');
      }
    } catch {
      setError('Algo salió mal.');
    } finally {
      setSavingPrintfulApiKey(false);
    }
  };

  const clearPrintfulApiKey = async () => {
    setSavingPrintfulApiKey(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${base}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printfulApiKeyClear: true }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Clave API de Printful eliminada.');
        await load();
      } else {
        setError(data.message || 'No se pudo eliminar la clave API de Printful.');
      }
    } catch {
      setError('Algo salió mal.');
    } finally {
      setSavingPrintfulApiKey(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="max-w-4xl mx-auto text-center py-16">
        <span className="material-icons text-4xl text-muted-foreground/40">error_outline</span>
        <p className="text-muted-foreground mt-2">No se pudieron cargar los ajustes de la tienda.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PortalPageHeader
        eyebrow="Tienda"
        title="Ajustes de la tienda"
        subtitle="Configura las preferencias de tu tienda y la pasarela de pago."
        actions={
          <button onClick={handleSave} disabled={saving} className={pBtnPrimary}>
            {saving && <span className="material-icons text-base animate-spin">refresh</span>}
            {saving ? 'Guardando…' : 'Guardar ajustes'}
          </button>
        }
      />

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          <span className="material-icons text-base">error</span>
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm dark:bg-green-900/20 dark:border-green-800 dark:text-green-400">
          <span className="material-icons text-base">check_circle</span>
          {success}
        </div>
      )}

      {/* General Settings */}
      <div className={`${pCard} p-6 space-y-4`}>
        <h2 className={`${pSectionTitle} flex items-center gap-2`}>
          <span className="material-icons text-lg text-muted-foreground">settings</span>
          General
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Nombre de la tienda</label>
            <input
              value={settings.storeName ?? ''}
              onChange={(e) => updateField('storeName', e.target.value)}
              placeholder="Mi tienda"
              className={pInput}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="store-currency" className="text-sm font-medium text-foreground">Moneda</label>
            <select id="store-currency" value={settings.currency} onChange={(e) => updateField('currency', e.target.value)} className={pSelect}>
              {currencies.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Prefijo de pedidos</label>
            <input
              value={settings.orderPrefix ?? ''}
              onChange={(e) => updateField('orderPrefix', e.target.value)}
              placeholder="ORD-"
              className={pInput}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="store-low-stock-threshold" className="text-sm font-medium text-foreground">Umbral de stock bajo</label>
            <input
              id="store-low-stock-threshold" type="number"
              min="0"
              value={settings.lowStockThreshold ?? 0}
              onChange={(e) => updateField('lowStockThreshold', parseInt(e.target.value) || 0)}
              className={pInput}
            />
          </div>
        </div>
      </div>

      {/* Tax Settings */}
      <div className={`${pCard} p-6 space-y-4`}>
        <h2 className={`${pSectionTitle} flex items-center gap-2`}>
          <span className="material-icons text-lg text-muted-foreground">receipt</span>Impuesto</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Tasa de impuesto (%)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={settings.taxRate ?? 0}
              onChange={(e) => updateField('taxRate', parseFloat(e.target.value) || 0)}
              placeholder="0"
              className={pInput}
            />
            <p className="text-xs text-muted-foreground">Ingresa un porcentaje (p. ej., 8.5 para 8.5%)</p>
          </div>
          <div className="space-y-1.5">
            <label id="tax-inclusive-label" className="text-sm font-medium text-foreground">Con impuesto incluido</label>
            <div className="flex items-center gap-3 pt-1.5">
              <button
                type="button" role="switch" aria-checked={settings.taxInclusive} aria-labelledby="tax-inclusive-label"
                onClick={() => updateField('taxInclusive', !settings.taxInclusive)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.taxInclusive ? 'bg-primary' : 'bg-border'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.taxInclusive ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-sm text-muted-foreground">
                {settings.taxInclusive ? 'Los precios incluyen impuesto' : 'Impuesto agregado al pagar'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Shipping & Reviews Toggles */}
      <div className={`${pCard} p-6 space-y-4`}>
        <h2 className={`${pSectionTitle} flex items-center gap-2`}>
          <span className="material-icons text-lg text-muted-foreground">toggle_on</span>
          Funciones
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <label id="requires-shipping-label" className="text-sm font-medium text-foreground">Requiere envío</label>
            <div className="flex items-center gap-3 pt-1.5">
              <button
                type="button" role="switch" aria-checked={settings.requiresShipping} aria-labelledby="requires-shipping-label"
                onClick={() => updateField('requiresShipping', !settings.requiresShipping)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.requiresShipping ? 'bg-primary' : 'bg-border'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.requiresShipping ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-sm text-muted-foreground">
                {settings.requiresShipping ? 'Los productos requieren envío por defecto' : 'Sin envío por defecto'}
              </span>
            </div>
          </div>
          <div className="space-y-1.5">
            <label id="enable-reviews-feature-label" className="text-sm font-medium text-foreground">Activar reseñas</label>
            <div className="flex items-center gap-3 pt-1.5">
              <button
                type="button" role="switch" aria-checked={settings.enableReviews} aria-labelledby="enable-reviews-feature-label"
                onClick={() => updateField('enableReviews', !settings.enableReviews)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.enableReviews ? 'bg-primary' : 'bg-border'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.enableReviews ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-sm text-muted-foreground">
                {settings.enableReviews ? 'Los clientes pueden dejar reseñas' : 'Reseñas desactivadas'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Customer Portal */}
      <div className={`${pCard} p-6 space-y-4`}>
        <h2 className={`${pSectionTitle} flex items-center gap-2`}>
          <span className="material-icons text-lg text-muted-foreground">person</span>
          Portal de clientes
        </h2>
        <p className="text-sm text-muted-foreground">Configura el portal de cuentas para tus clientes.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {([
            { key: 'enableCustomerAccounts' as const, label: 'Cuentas de clientes', desc: 'Permite que los clientes creen cuentas e inicien sesión' },
            { key: 'enableGuestCheckout' as const, label: 'Compra como invitado', desc: 'Permitir comprar sin crear una cuenta' },
            { key: 'enableWishlist' as const, label: 'Lista de deseos', desc: 'Los clientes pueden guardar productos en una lista de deseos' },
            { key: 'enableOrderTracking' as const, label: 'Seguimiento de pedidos', desc: 'Los clientes pueden ver el estado del pedido y el envío' },
            { key: 'enableCustomerSupport' as const, label: 'Soporte al cliente', desc: 'Los clientes pueden enviar mensajes de soporte' },
            { key: 'enableReviews' as const, label: 'Reseñas de productos', desc: 'Los clientes pueden dejar reseñas de productos' },
          ] as const).map(toggle => (
            <div key={toggle.key} className="space-y-1.5">
              <label id={`customer-portal-${toggle.key}-label`} className="text-sm font-medium text-foreground">{toggle.label}</label>
              <div className="flex items-center gap-3 pt-1.5">
                <button
                  type="button" role="switch" aria-checked={settings[toggle.key]} aria-labelledby={`customer-portal-${toggle.key}-label`}
                  onClick={() => updateField(toggle.key, !settings[toggle.key])}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings[toggle.key] ? 'bg-primary' : 'bg-border'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings[toggle.key] ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-sm text-muted-foreground">{toggle.desc}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Email de soporte</label>
            <input
              value={settings.supportEmail ?? ''}
              onChange={(e) => updateField('supportEmail', e.target.value || null)}
              placeholder="support@yourstore.com"
              className={pInput}
            />
            <p className="text-xs text-muted-foreground">Adonde se reenvían los mensajes de soporte al cliente</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">URL de política de devoluciones</label>
            <input
              value={settings.returnPolicyUrl ?? ''}
              onChange={(e) => updateField('returnPolicyUrl', e.target.value || null)}
              placeholder="https://yourstore.com/returns"
              className={pInput}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">URL de política de envíos</label>
            <input
              value={settings.shippingPolicyUrl ?? ''}
              onChange={(e) => updateField('shippingPolicyUrl', e.target.value || null)}
              placeholder="https://yourstore.com/shipping"
              className={pInput}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium text-foreground">Mensaje de bienvenida</label>
            <textarea
              value={settings.customerPortalWelcomeMessage ?? ''}
              onChange={(e) => updateField('customerPortalWelcomeMessage', e.target.value || null)}
              placeholder="¡Bienvenido a tu cuenta! Aquí puedes seguir tus pedidos, gestionar tu lista de deseos y mucho más."
              rows={3}
              className={pInput}
            />
            <p className="text-xs text-muted-foreground">Se muestra en el panel del portal de clientes</p>
          </div>
        </div>
      </div>

      {/* Stripe Connect */}
      <div className={`${pCard} p-6 space-y-4`}>
        <h2 className={`${pSectionTitle} flex items-center gap-2`}>
          <span className="material-icons text-lg text-muted-foreground">credit_card</span>
          Stripe Connect
        </h2>
        {settings.stripeConnected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="material-icons text-green-600">check_circle</span>
              <span className="text-sm font-medium text-green-700 dark:text-green-400">Stripe conectado</span>
            </div>
            {settings.stripeAccountId && (
              <p className="text-xs text-muted-foreground font-mono">Cuenta: {settings.stripeAccountId}</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {settings.payoutSchedule && (
                <div>
                  <p className="text-xs text-muted-foreground">Calendario de pagos</p>
                  <p className="text-sm text-foreground font-medium">{settings.payoutSchedule}</p>
                </div>
              )}
              {settings.platformFeePercent != null && (
                <div>
                  <p className="text-xs text-muted-foreground">Comisión de la plataforma</p>
                  <p className="text-sm text-foreground font-medium">{settings.platformFeePercent}%</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Conecta tu cuenta de Stripe para aceptar pagos. Te redirigiremos a Stripe para completar el registro.
            </p>
            <button
              onClick={connectStripe}
              disabled={connectingStripe}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#635BFF] text-white rounded-lg text-sm font-medium hover:bg-[#5851DB] transition-colors disabled:opacity-50"
            >
              {connectingStripe ? (
                <span className="material-icons text-base animate-spin">refresh</span>
              ) : (
                <span className="material-icons text-base">link</span>
              )}
              {connectingStripe ? 'Conectando…' : 'Conectar Stripe'}
            </button>
          </div>
        )}
      </div>

      {/* Shipping Provider */}
      <div className={`${pCard} p-6 space-y-4`}>
        <h2 className={`${pSectionTitle} flex items-center gap-2`}>
          <span className="material-icons text-lg text-muted-foreground">local_shipping</span>
          Proveedor de envíos
        </h2>
        <p className="text-sm text-muted-foreground">
          Elige cómo se calculan las tarifas de envío. Manual usa tus tarifas por zonas; EasyPost obtiene tarifas en vivo de las compañías de transporte e imprime etiquetas.
        </p>

        <div className="flex flex-wrap gap-3">
          {(['manual', 'easypost'] as const).map((opt) => (
            <label
              key={opt}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer text-sm ${
                settings.shippingProvider === opt
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              <input
                type="radio"
                name="shippingProvider"
                className="sr-only"
                checked={settings.shippingProvider === opt}
                onChange={() => updateField('shippingProvider', opt)}
              />
              <span className="material-icons text-base">
                {opt === 'manual' ? 'tune' : 'bolt'}
              </span>
              {opt === 'manual' ? 'Manual' : 'EasyPost'}
            </label>
          ))}
        </div>

        {settings.shippingProvider === 'easypost' && (
          <div className="space-y-5 pt-2 border-t border-border">
            {/* API key */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Clave API de EasyPost</label>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="material-icons text-base text-muted-foreground">
                  {settings.easypostApiKeyConfigured ? 'lock' : 'lock_open'}
                </span>
                <span className={settings.easypostApiKeyConfigured ? 'text-foreground' : 'text-muted-foreground'}>
                  {settings.easypostApiKeyConfigured
                    ? `Clave configurada, termina en …${settings.easypostApiKeyLast4 ?? '????'}`
                    : 'Sin clave configurada'}
                </span>
                {settings.easypostApiKeyConfigured && (
                  <button
                    type="button"
                    onClick={clearApiKey}
                    disabled={savingApiKey}
                    className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-muted/40 transition-colors disabled:opacity-50"
                  >
                    <span className="material-icons text-sm">delete</span>
                    Eliminar clave
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="EZAK… o EZTK…"
                  className={pInput}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={saveApiKey}
                  disabled={savingApiKey || !apiKeyInput}
                  className={`${pBtnPrimary} whitespace-nowrap`}
                >
                  {savingApiKey && <span className="material-icons text-base animate-spin">refresh</span>}
                  Guardar clave
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                    Se guarda cifrada en reposo (AES-256-GCM). El texto plano nunca se devuelve al navegador.
              </p>
            </div>

            {/* Mode + Webhook secret */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="store-easypost-mode" className="text-sm font-medium text-foreground">Modo</label>
                <select id="store-easypost-mode"
                  value={settings.easypostMode ?? 'test'}
                  onChange={(e) => updateField('easypostMode', e.target.value as 'test' | 'production')}
                  className={pSelect}
                >
                  <option value="test">Prueba</option>
                  <option value="production">Producción</option>
                </select>
                <p className="text-xs text-muted-foreground">El modo de prueba devuelve tarifas falsas y nunca cobra dinero real.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Secreto del webhook</label>
                <input
                  type="text"
                  value={settings.easypostWebhookSecret ?? ''}
                  onChange={(e) => updateField('easypostWebhookSecret', e.target.value || null)}
                  placeholder="Secreto HMAC de EasyPost"
                  className={pInput}
                />
                <p className="text-xs text-muted-foreground">
                  Configúralo en el panel de EasyPost → Webhooks → secret. URL que debes registrar:{' '}
                  <code className="font-mono text-[11px] bg-muted/40 px-1 py-0.5 rounded">
                    https://&lt;your-site&gt;/api/webhooks/easypost?websiteId={siteId}
                  </code>{' '}
                  (sustitúyela por tu dominio real).
                </p>
              </div>
            </div>

            {/* Ship-from address */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="material-icons text-base text-muted-foreground">place</span>
                Dirección de origen
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Nombre</label>
                  <input
                    value={settings.shipFromAddress?.name ?? ''}
                    onChange={(e) => updateShipFromField('name', e.target.value || null)}
                    className={pInput}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Empresa</label>
                  <input
                    value={settings.shipFromAddress?.company ?? ''}
                    onChange={(e) => updateShipFromField('company', e.target.value || null)}
                    className={pInput}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-sm font-medium text-foreground">Dirección 1</label>
                  <input
                    value={settings.shipFromAddress?.line1 ?? ''}
                    onChange={(e) => updateShipFromField('line1', e.target.value)}
                    className={pInput}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-sm font-medium text-foreground">Dirección 2</label>
                  <input
                    value={settings.shipFromAddress?.line2 ?? ''}
                    onChange={(e) => updateShipFromField('line2', e.target.value || null)}
                    className={pInput}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Ciudad</label>
                  <input
                    value={settings.shipFromAddress?.city ?? ''}
                    onChange={(e) => updateShipFromField('city', e.target.value)}
                    className={pInput}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Estado / Provincia</label>
                  <input
                    value={settings.shipFromAddress?.state ?? ''}
                    onChange={(e) => updateShipFromField('state', e.target.value)}
                    className={pInput}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Código postal</label>
                  <input
                    value={settings.shipFromAddress?.postalCode ?? ''}
                    onChange={(e) => updateShipFromField('postalCode', e.target.value)}
                    className={pInput}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">País (2 letras)</label>
                  <input
                    value={settings.shipFromAddress?.country ?? 'US'}
                    onChange={(e) => updateShipFromField('country', (e.target.value || 'US').toUpperCase())}
                    maxLength={2}
                    className={pInput}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-sm font-medium text-foreground">Teléfono</label>
                  <input
                    value={settings.shipFromAddress?.phone ?? ''}
                    onChange={(e) => updateShipFromField('phone', e.target.value || null)}
                    className={pInput}
                  />
                </div>
              </div>
            </div>

            {/* Default parcel */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="material-icons text-base text-muted-foreground">inventory_2</span>
                Paquete predeterminado
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Largo (pulg)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={parcelNumber(settings.defaultParcelLengthIn)}
                    onChange={(e) => updateField('defaultParcelLengthIn', e.target.value === '' ? null : e.target.value)}
                    className={pInput}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Ancho (pulg)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={parcelNumber(settings.defaultParcelWidthIn)}
                    onChange={(e) => updateField('defaultParcelWidthIn', e.target.value === '' ? null : e.target.value)}
                    className={pInput}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Alto (pulg)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={parcelNumber(settings.defaultParcelHeightIn)}
                    onChange={(e) => updateField('defaultParcelHeightIn', e.target.value === '' ? null : e.target.value)}
                    className={pInput}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Peso (oz)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={parcelNumber(settings.defaultParcelWeightOz)}
                    onChange={(e) => updateField('defaultParcelWeightOz', e.target.value === '' ? null : e.target.value)}
                    className={pInput}
                  />
                </div>
              </div>
            </div>

            {/* Live rates fallback */}
            <div className="space-y-1.5">
              <label id="live-rates-fallback-label" className="text-sm font-medium text-foreground">Respaldo de tarifas en vivo</label>
              <div className="flex items-center gap-3 pt-1.5">
                <button
                  type="button" role="switch" aria-checked={settings.liveRatesFallback} aria-labelledby="live-rates-fallback-label"
                  onClick={() => updateField('liveRatesFallback', !settings.liveRatesFallback)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.liveRatesFallback ? 'bg-primary' : 'bg-border'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.liveRatesFallback ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-sm text-muted-foreground">Mostrar tarifas manuales cuando fallen las tarifas en vivo</span>
              </div>
            </div>

            {/* Test connection */}
            <div className="space-y-3 pt-2 border-t border-border">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Probar conexión</h3>
                  <p className="text-xs text-muted-foreground">
                    Envía un envío sintético desde tu dirección de origen a San Francisco y cotiza tarifas.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={testConnection}
                  disabled={testingConnection}
                  className={`${pBtnGhost} whitespace-nowrap`}
                >
                  {testingConnection ? (
                    <span className="material-icons text-base animate-spin">refresh</span>
                  ) : (
                    <span className="material-icons text-base">network_check</span>
                  )}
                  {testingConnection ? 'Probando…' : 'Probar conexión'}
                </button>
              </div>
              {testResult && (testResult.ok ? (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300">
                  <div className="flex items-center gap-2 font-medium">
                    <span className="material-icons text-base">check_circle</span>
                    Resultados: {testResult.rateCount} tarifa{testResult.rateCount === 1 ? '' : 's'}
                  </div>
                  {testResult.sampleRates.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs">
                      {testResult.sampleRates.map((r, i) => (
                        <li key={i} className="font-mono">
                          {r.carrier} · {r.service} · ${(r.amountCents / 100).toFixed(2)}
                          {r.estDeliveryDays != null ? ` · ${r.estDeliveryDays}d` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                  <div className="flex items-center gap-2 font-medium">
                    <span className="material-icons text-base">error</span>
                    {testResult.message}
                  </div>
                  {testResult.code && (
                    <p className="mt-1 text-xs font-mono opacity-80">code: {testResult.code}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Fulfillment Provider */}
      <div className={`${pCard} p-6 space-y-4`}>
        <h2 className={`${pSectionTitle} flex items-center gap-2`}>
          <span className="material-icons text-lg text-muted-foreground">print</span>
          Logística
        </h2>
        <p className="text-sm text-muted-foreground">
          Elige cómo se preparan los pedidos. Manual significa que gestionas la preparación tú mismo; Printful envía automáticamente los pedidos de impresión bajo demanda.
        </p>

        <div className="flex flex-wrap gap-3">
          {(['manual', 'printful'] as const).map((opt) => (
            <label
              key={opt}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer text-sm ${
                settings.fulfillmentProvider === opt
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              <input
                type="radio"
                name="fulfillmentProvider"
                className="sr-only"
                checked={settings.fulfillmentProvider === opt}
                onChange={() => updateField('fulfillmentProvider', opt)}
              />
              <span className="material-icons text-base">
                {opt === 'manual' ? 'tune' : 'print'}
              </span>
              {opt === 'manual' ? 'Manual' : 'Printful (impresión bajo demanda)'}
            </label>
          ))}
        </div>

        {settings.fulfillmentProvider === 'printful' && (
          <div className="space-y-5 pt-2 border-t border-border">
            {/* API key */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Clave API de Printful</label>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="material-icons text-base text-muted-foreground">
                  {settings.printfulApiKeyConfigured ? 'lock' : 'lock_open'}
                </span>
                <span className={settings.printfulApiKeyConfigured ? 'text-foreground' : 'text-muted-foreground'}>
                  {settings.printfulApiKeyConfigured
                    ? `Clave configurada, termina en …${settings.printfulApiKeyLast4 ?? '????'}`
                    : 'Sin clave configurada'}
                </span>
                {settings.printfulApiKeyConfigured && (
                  <button
                    type="button"
                    onClick={clearPrintfulApiKey}
                    disabled={savingPrintfulApiKey}
                    className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-muted/40 transition-colors disabled:opacity-50"
                  >
                    <span className="material-icons text-sm">delete</span>
                    Eliminar clave
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={printfulApiKeyInput}
                  onChange={(e) => setPrintfulApiKeyInput(e.target.value)}
                  placeholder="Clave API de Printful"
                  className={pInput}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={savePrintfulApiKey}
                  disabled={savingPrintfulApiKey || !printfulApiKeyInput}
                  className={`${pBtnPrimary} whitespace-nowrap`}
                >
                  {savingPrintfulApiKey && <span className="material-icons text-base animate-spin">refresh</span>}
                  Guardar clave
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Introduce tu clave API de Printful desde Printful &rarr; Dashboard &rarr; API &rarr; Keys. Se guarda cifrada en reposo (AES-256-GCM).
              </p>
            </div>

            {/* Printful Store ID */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">ID de tienda en Printful</label>
              <input
                type="text"
                value={settings.printfulStoreId ?? ''}
                onChange={(e) => updateField('printfulStoreId', e.target.value || null)}
                placeholder="p. ej. 12345678"
                className={pInput}
              />
              <p className="text-xs text-muted-foreground">Se encuentra en la URL de tu panel de Printful o en los ajustes de la tienda. Se guarda con el botón principal &quot;Guardar ajustes&quot;.</p>
            </div>
          </div>
        )}
      </div>

      {/* Stripe Payment Provider (BYOK) */}
      <div className={`${pCard} p-6 space-y-4`}>
        <h2 className={`${pSectionTitle} flex items-center gap-2`}>
          <span className="material-icons text-lg text-muted-foreground">account_balance</span>
          Proveedor de pagos Stripe
        </h2>

        {!stripeByokAllowed ? (
          <div className="flex items-start gap-3 p-4 bg-muted/30 border border-border rounded-lg text-sm">
            <span className="material-icons text-base text-muted-foreground mt-0.5">info</span>
            <div>
              <p className="text-foreground font-medium">Stripe BYOK no está activado para este sitio.</p>
              <p className="text-muted-foreground mt-1">
                Contacta con CRM AGENTS para activar el uso de tu propia cuenta de Stripe.
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Elige si los pagos pasan por CRM AGENTS Connect o por tu propia cuenta de Stripe (BYOK).
            </p>

            {/* Mode radio */}
            <div className="flex flex-wrap gap-3">
              {([
                { value: 'connect' as const, label: 'Conectar', icon: 'hub', desc: 'Predeterminado — CRM AGENTS Connect' },
                { value: 'byok' as const, label: 'BYOK', icon: 'vpn_key', desc: 'Tu propia cuenta de Stripe' },
              ]).map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer text-sm ${
                    stripeMode === opt.value
                      ? 'border-primary bg-primary/5 text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <input
                    type="radio"
                    name="stripeMode"
                    className="sr-only"
                    checked={stripeMode === opt.value}
                    onChange={() => updateField('stripeMode', opt.value)}
                  />
                  <span className="material-icons text-base">{opt.icon}</span>
                  {opt.label}
                  <span className="text-xs text-muted-foreground hidden sm:inline">— {opt.desc}</span>
                </label>
              ))}
            </div>

            {stripeMode === 'byok' && (
              <div className="space-y-5 pt-2 border-t border-border">
                {/* Secret Key */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Clave secreta</label>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="material-icons text-base text-muted-foreground">
                      {settings.stripeSecretKeyConfigured ? 'lock' : 'lock_open'}
                    </span>
                    <span className={settings.stripeSecretKeyConfigured ? 'text-foreground' : 'text-muted-foreground'}>
                      {settings.stripeSecretKeyConfigured
                        ? `Configurada (termina en …${settings.stripeSecretKeyLast4 ?? '????'})`
                        : 'Sin clave configurada'}
                    </span>
                    {settings.stripeSecretKeyConfigured && (
                      <button
                        type="button"
                        onClick={clearStripeSecret}
                        disabled={savingStripeSecret}
                        className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-muted/40 transition-colors disabled:opacity-50"
                      >
                        <span className="material-icons text-sm">delete</span>
                        Eliminar clave
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={stripeSecretInput}
                      onChange={(e) => setStripeSecretInput(e.target.value)}
                      placeholder="sk_test_… o sk_live_…"
                      className={pInput}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={saveStripeSecret}
                      disabled={savingStripeSecret || !stripeSecretInput}
                      className={`${pBtnPrimary} whitespace-nowrap`}
                    >
                      {savingStripeSecret && <span className="material-icons text-base animate-spin">refresh</span>}
                      Guardar clave
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                Se guarda cifrada en reposo (AES-256-GCM). El texto plano nunca se devuelve al navegador.
                  </p>
                </div>

                {/* Publishable Key */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Clave publicable</label>
                  <input
                    type="text"
                    value={settings.stripePublishableKey ?? ''}
                    onChange={(e) => updateField('stripePublishableKey', e.target.value || null)}
                    placeholder="pk_test_… o pk_live_…"
                    className={pInput}
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">Clave pública usada por Stripe.js. Se guarda con el botón principal &quot;Guardar ajustes&quot;.</p>
                </div>

                {/* Webhook Endpoint Secret */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Secreto del endpoint del webhook</label>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="material-icons text-base text-muted-foreground">
                      {settings.stripeWebhookSecretConfigured ? 'lock' : 'lock_open'}
                    </span>
                    <span className={settings.stripeWebhookSecretConfigured ? 'text-foreground' : 'text-muted-foreground'}>
                      {settings.stripeWebhookSecretConfigured ? 'Configurado' : 'No configurado'}
                    </span>
                    {settings.stripeWebhookSecretConfigured && (
                      <button
                        type="button"
                        onClick={clearStripeWebhookSecret}
                        disabled={savingStripeWebhook}
                        className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-muted/40 transition-colors disabled:opacity-50"
                      >
                        <span className="material-icons text-sm">delete</span>
                        Eliminar secreto
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={stripeWebhookInput}
                      onChange={(e) => setStripeWebhookInput(e.target.value)}
                      placeholder="whsec_…"
                      className={pInput}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={saveStripeWebhookSecret}
                      disabled={savingStripeWebhook || !stripeWebhookInput}
                      className={`${pBtnPrimary} whitespace-nowrap`}
                    >
                      {savingStripeWebhook && <span className="material-icons text-base animate-spin">refresh</span>}
                      Guardar secreto
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Secreto de firma del panel de Stripe → Developers → Webhooks. Se guarda cifrado en reposo.
                  </p>
                </div>

                {/* Webhook URL (read-only / copyable) */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">URL del webhook</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={stripeWebhookUrl}
                      className={`${pInput} font-mono text-xs bg-muted/30`}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <button
                      type="button"
                      onClick={copyWebhookUrl}
                      className={`${pBtnGhost} whitespace-nowrap`}
                    >
                      <span className="material-icons text-base">
                        {webhookUrlCopied ? 'check' : 'content_copy'}
                      </span>
                      {webhookUrlCopied ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Pega esto en tu panel de Stripe → Developers → Webhooks → Add endpoint. Escucha los eventos{' '}
                    <code className="font-mono text-[11px] bg-muted/40 px-1 py-0.5 rounded">payment_intent.succeeded</code>,{' '}
                    <code className="font-mono text-[11px] bg-muted/40 px-1 py-0.5 rounded">payment_intent.payment_failed</code>,{' '}
                    <code className="font-mono text-[11px] bg-muted/40 px-1 py-0.5 rounded">charge.refunded</code>.
                  </p>
                </div>

                {/* Test Connection */}
                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Probar conexión</h3>
                      <p className="text-xs text-muted-foreground">
                        Verifica la clave secreta obteniendo tu cuenta de Stripe.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={testStripeConnection}
                      disabled={testingStripe || !settings.stripeSecretKeyConfigured}
                      className={`${pBtnGhost} whitespace-nowrap`}
                    >
                      {testingStripe ? (
                        <span className="material-icons text-base animate-spin">refresh</span>
                      ) : (
                        <span className="material-icons text-base">network_check</span>
                      )}
                      {testingStripe ? 'Probando…' : 'Probar conexión'}
                    </button>
                  </div>
                  {stripeTestResult && (stripeTestResult.ok ? (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300">
                      <div className="flex items-center gap-2 font-medium">
                        <span className="material-icons text-base">check_circle</span>
                        Conectado a Stripe
                      </div>
                      <ul className="mt-2 space-y-1 text-xs font-mono">
                        <li>Cuenta: {stripeTestResult.data.account.id}</li>
                        {stripeTestResult.data.account.business_name && (
                          <li>Empresa: {stripeTestResult.data.account.business_name}</li>
                        )}
                        <li>
                          Cargos: {stripeTestResult.data.account.charges_enabled ? 'habilitados' : 'deshabilitados'} · Pagos:{' '}
                          {stripeTestResult.data.account.payouts_enabled ? 'habilitados' : 'deshabilitados'}
                        </li>
                      </ul>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                      <div className="flex items-center gap-2 font-medium">
                        <span className="material-icons text-base">error</span>
                        {stripeTestResult.error.message}
                      </div>
                      {stripeTestResult.error.code && (
                        <p className="mt-1 text-xs font-mono opacity-80">code: {stripeTestResult.error.code}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom save */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className={pBtnPrimary}>
          {saving && <span className="material-icons text-base animate-spin">refresh</span>}
          {saving ? 'Guardando…' : 'Guardar ajustes'}
        </button>
      </div>
    </div>
  );
}
