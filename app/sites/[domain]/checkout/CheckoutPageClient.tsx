'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Stripe as StripeClient } from '@stripe/stripe-js';
import Link from 'next/link';
import type { CartItem, ShippingRate, CheckoutResult, ContactForm, CheckoutPageClientProps } from './checkout-types';
import { formatPrice, getStripePromise } from './checkout-types';
import { OrderSuccess } from './CheckoutSuccess';
import { CheckoutPaymentSection } from './CheckoutPaymentSection';
import { CheckoutOrderSummary } from './CheckoutOrderSummary';

export function CheckoutPageClient({ siteId, domain }: CheckoutPageClientProps) {
  const basePath = `/sites/${domain}`;

  // Cart
  const [items, setItems] = useState<CartItem[]>([]);
  const [cartSubtotal, setCartSubtotal] = useState(0);

  // Shipping
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [shippingRateId, setShippingRateId] = useState<number | string | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingFetched, setShippingFetched] = useState(false);

  // Payment
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResult | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<StripeClient | null> | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');

  // Confirmation from Stripe redirect (rare with 'if_required' but handle it).
  // Initialized lazily from ?order= so we never call setState inside an effect.
  const [successOrderNumber, setSuccessOrderNumber] = useState<string | null>(() =>
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('order') : null
  );

  // Contact form
  const [form, setForm] = useState<ContactForm>({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    customerNote: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
    discountCode: '',
  });

  // Step: 'contact' | 'shipping' | 'payment'
  const [step, setStep] = useState<'contact' | 'shipping' | 'payment'>('contact');

  // Lazy initializer: read localStorage once at mount so we never call
  // setState synchronously inside an effect (triggers the ESLint rule).
  const [sessionId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('cart_session_id') : null
  );
  // Only start in loading=true when there is a session to fetch and we are
  // not already on the Stripe redirect-back path (?order=…).
  const [cartLoading, setCartLoading] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (new URLSearchParams(window.location.search).get('order')) return false;
    return !!localStorage.getItem('cart_session_id');
  });

  // Load cart on mount (successOrderNumber already covers the redirect path)
  useEffect(() => {
    if (successOrderNumber || !sessionId) return;

    fetch(`/api/storefront/${siteId}/cart?sessionId=${sessionId}`)
      .then(r => r.json())
      .then(json => {
        if (json.success && json.data) {
          setItems(json.data.items || []);
          setCartSubtotal(json.data.subtotal || 0);
        }
      })
      .catch(console.error)
      .finally(() => setCartLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, sessionId]);

  // Fetch shipping rates when address is complete enough
  const fetchShippingRates = useCallback(async () => {
    if (!form.country || !form.postalCode) return;
    setShippingLoading(true);
    try {
      const variantIds = items.filter(i => i.variantId).map(i => i.variantId!).join(',');
      const productIds = items.filter(i => !i.variantId).map(i => i.productId).join(',');
      const qs = new URLSearchParams({
        country: form.country,
        ...(form.state ? { state: form.state } : {}),
        ...(form.postalCode ? { postalCode: form.postalCode } : {}),
        ...(form.city ? { city: form.city } : {}),
        ...(variantIds ? { variantIds } : {}),
        ...(productIds ? { productIds } : {}),
        ...(form.customerName ? { recipientName: form.customerName } : {}),
      });
      const res = await fetch(`/api/storefront/${siteId}/shipping?${qs}`);
      const json = await res.json();
      if (json.success) {
        setShippingRates(json.data || []);
        setShippingFetched(true);
        // Auto-select the first rate if none chosen
        if (json.data?.length > 0) {
          setShippingRateId(json.data[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setShippingLoading(false);
    }
  }, [form.country, form.state, form.postalCode, form.city, form.customerName, siteId, items]);

  function updateForm(key: keyof ContactForm, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function validateContact(): string | null {
    if (!form.customerName.trim()) return 'El nombre es obligatorio';
    if (!form.customerEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customerEmail)) return 'Introduce un correo válido';
    if (!form.line1.trim()) return 'La dirección es obligatoria';
    if (!form.city.trim()) return 'La ciudad es obligatoria';
    if (!form.postalCode.trim()) return 'El código postal es obligatorio';
    if (!form.country.trim()) return 'El país es obligatorio';
    return null;
  }

  async function handleContactNext(e: React.FormEvent) {
    e.preventDefault();
    const err = validateContact();
    if (err) { setCheckoutError(err); return; }
    setCheckoutError('');
    await fetchShippingRates();
    setStep('shipping');
  }

  async function handleShippingNext(e: React.FormEvent) {
    e.preventDefault();
    if (!shippingRateId && shippingRates.length > 0) {
      setCheckoutError('Selecciona un método de envío');
      return;
    }
    setCheckoutError('');
    setStep('payment');
    await initiateCheckout();
  }

  async function initiateCheckout() {
    if (!sessionId) return;
    setCheckoutLoading(true);
    setCheckoutError('');
    try {
      const shippingAddress = {
        line1: form.line1,
        line2: form.line2,
        city: form.city,
        state: form.state,
        postalCode: form.postalCode,
        country: form.country,
      };

      const res = await fetch(`/api/storefront/${siteId}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          customerEmail: form.customerEmail,
          customerName: form.customerName,
          customerPhone: form.customerPhone || undefined,
          shippingAddress,
          billingAddress: shippingAddress,
          shippingRateId: shippingRateId || undefined,
          discountCode: form.discountCode || undefined,
          customerNote: form.customerNote || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        const result: CheckoutResult = json.data;
        setCheckoutResult(result);
        if (result.publishableKey) {
          setStripePromise(getStripePromise(result.publishableKey));
        }
      } else {
        setCheckoutError(json.message || 'No se pudo crear el pedido. Inténtalo de nuevo.');
        setStep('shipping');
      }
    } catch {
      setCheckoutError('Error de red. Inténtalo de nuevo.');
      setStep('shipping');
    } finally {
      setCheckoutLoading(false);
    }
  }

  // ── Render: redirect-back success ─────────────────────────────────────────

  if (successOrderNumber) {
    return <OrderSuccess orderNumber={successOrderNumber} basePath={basePath} />;
  }

  // ── Render: loading ────────────────────────────────────────────────────────

  if (cartLoading) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted/40 rounded w-1/3" />
          <div className="h-48 bg-muted/20 rounded" />
        </div>
      </div>
    );
  }

  // ── Render: empty cart ─────────────────────────────────────────────────────

  if (items.length === 0 && !successOrderNumber) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-lg text-center">
        <span className="material-icons text-5xl text-muted-foreground/30 mb-3 block">shopping_cart</span>
        <p className="text-muted-foreground mb-6">Tu carrito está vacío.</p>
        <Link
          href={`${basePath}/`}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <span className="material-icons text-base">arrow_back</span>
          Seguir comprando
        </Link>
      </div>
    );
  }

  // Shipping cost for selected rate
  const selectedRate = shippingRates.find(r => r.id === shippingRateId);
  const shippingCost = selectedRate
    ? (selectedRate.rateType === 'free' || (selectedRate.freeAbove != null && cartSubtotal >= selectedRate.freeAbove) ? 0 : selectedRate.price)
    : 0;
  const displayTotal = checkoutResult?.total ?? (cartSubtotal + shippingCost);
  const displayCurrency = checkoutResult?.currency ?? 'USD';

  return (
    <div className="container mx-auto px-4 py-10 max-w-4xl">
      <h1 className="text-2xl font-bold mb-8 flex items-center gap-2">
        <span className="material-icons">lock</span>
        Finalizar compra
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* ── Left: steps ───────────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-6">

          {/* Step indicators */}
          <div className="flex items-center gap-2 text-sm mb-2">
            {(['contact', 'shipping', 'payment'] as const).map((s, idx) => (
              <div key={s} className="flex items-center gap-2">
                {idx > 0 && <span className="material-icons text-muted-foreground/50 text-base">chevron_right</span>}
                <span className={`font-medium capitalize ${step === s ? 'text-primary' : step === 'payment' && s !== 'payment' ? 'text-muted-foreground line-through' : 'text-muted-foreground'}`}>
                  {s === 'contact' ? 'Contacto y dirección' : s === 'shipping' ? 'Envío' : 'Pago'}
                </span>
              </div>
            ))}
          </div>

          {/* ── Step 1: Contact & Address ─────────────────────────────── */}
          {step === 'contact' && (
            <form onSubmit={handleContactNext} className="space-y-4">
              <div className="border border-border rounded-xl bg-card p-5 space-y-4">
                <h2 className="font-semibold flex items-center gap-2">
                  <span className="material-icons text-base">person</span>
                  Información de contacto
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="customerName">Nombre completo *</label>
                    <input
                      id="customerName"
                      type="text"
                      required
                      autoComplete="name"
                      value={form.customerName}
                      onChange={e => updateForm('customerName', e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="customerEmail">Correo electrónico *</label>
                    <input
                      id="customerEmail"
                      type="email"
                      required
                      autoComplete="email"
                      value={form.customerEmail}
                      onChange={e => updateForm('customerEmail', e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="customerPhone">Teléfono (opcional)</label>
                  <input
                    id="customerPhone"
                    type="tel"
                    autoComplete="tel"
                    value={form.customerPhone}
                    onChange={e => updateForm('customerPhone', e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>

              <div className="border border-border rounded-xl bg-card p-5 space-y-4">
                <h2 className="font-semibold flex items-center gap-2">
                  <span className="material-icons text-base">local_shipping</span>
                  Dirección de envío
                </h2>

                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="country">País *</label>
                  <select
                    id="country"
                    required
                    value={form.country}
                    onChange={e => updateForm('country', e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="US">Estados Unidos</option>
                    <option value="CA">Canadá</option>
                    <option value="GB">Reino Unido</option>
                    <option value="AU">Australia</option>
                    <option value="DE">Alemania</option>
                    <option value="FR">Francia</option>
                    <option value="NL">Países Bajos</option>
                    <option value="JP">Japón</option>
                    <option value="MX">México</option>
                    <option value="BR">Brasil</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="line1">Dirección *</label>
                  <input
                    id="line1"
                    type="text"
                    required
                    autoComplete="address-line1"
                    value={form.line1}
                    onChange={e => updateForm('line1', e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="line2">Piso, puerta, etc. (opcional)</label>
                  <input
                    id="line2"
                    type="text"
                    autoComplete="address-line2"
                    value={form.line2}
                    onChange={e => updateForm('line2', e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-1">
                    <label className="block text-sm font-medium mb-1" htmlFor="city">Ciudad *</label>
                    <input
                      id="city"
                      type="text"
                      required
                      autoComplete="address-level2"
                      value={form.city}
                      onChange={e => updateForm('city', e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="state">Provincia/Estado</label>
                    <input
                      id="state"
                      type="text"
                      autoComplete="address-level1"
                      value={form.state}
                      onChange={e => updateForm('state', e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="postalCode">Código postal *</label>
                    <input
                      id="postalCode"
                      type="text"
                      required
                      autoComplete="postal-code"
                      value={form.postalCode}
                      onChange={e => updateForm('postalCode', e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
              </div>

              <div className="border border-border rounded-xl bg-card p-5 space-y-3">
                <h2 className="font-semibold flex items-center gap-2">
                  <span className="material-icons text-base">discount</span>
                  Código de descuento (opcional)
                </h2>
                <input
                  id="discountCode"
                  type="text"
                  placeholder="Introduce el código"
                  value={form.discountCode}
                  onChange={e => updateForm('discountCode', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              {checkoutError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  <span className="material-icons text-base">error</span>
                  {checkoutError}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                Continuar al envío
                <span className="material-icons text-base">chevron_right</span>
              </button>
            </form>
          )}

          {/* ── Step 2: Shipping ─────────────────────────────────────────── */}
          {step === 'shipping' && (
            <form onSubmit={handleShippingNext} className="space-y-4">
              {/* Contact summary */}
              <div className="border border-border rounded-xl bg-card p-4 text-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{form.customerName}</p>
                    <p className="text-muted-foreground">{form.customerEmail}</p>
                    <p className="text-muted-foreground mt-1">{form.line1}{form.line2 ? `, ${form.line2}` : ''}, {form.city}, {form.state} {form.postalCode}, {form.country}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setStep('contact'); setCheckoutResult(null); setStripePromise(null); }}
                    className="text-primary text-xs hover:underline flex-shrink-0"
                  >Editar</button>
                </div>
              </div>

              <div className="border border-border rounded-xl bg-card p-5 space-y-3">
                <h2 className="font-semibold flex items-center gap-2">
                  <span className="material-icons text-base">local_shipping</span>
                  Método de envío
                </h2>

                {shippingLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-primary/30" style={{ borderTopColor: 'currentColor' }} />
                    Calculando tarifas...
                  </div>
                )}

                {!shippingLoading && shippingFetched && shippingRates.length === 0 && (
                  <p className="text-sm text-muted-foreground py-2">No hay tarifas de envío disponibles para esta dirección.</p>
                )}

                {shippingRates.map(rate => {
                  const isFree = rate.rateType === 'free' || (rate.freeAbove != null && cartSubtotal >= rate.freeAbove);
                  const cost = isFree ? 0 : rate.price;
                  return (
                    <label
                      key={rate.id}
                      className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${shippingRateId === rate.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'}`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="shippingRate"
                          value={String(rate.id)}
                          checked={shippingRateId === rate.id}
                          onChange={() => setShippingRateId(rate.id)}
                          className="accent-primary"
                        />
                        <div>
                          <p className="text-sm font-medium">{rate.name}</p>
                          {(rate.minDeliveryDays || rate.maxDeliveryDays) && (
                            <p className="text-xs text-muted-foreground">
                              {rate.minDeliveryDays === rate.maxDeliveryDays
                                ? `${rate.minDeliveryDays} días laborables`
                                : `${rate.minDeliveryDays}–${rate.maxDeliveryDays} días laborables`}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-sm font-medium">
                        {isFree ? 'Gratis' : formatPrice(cost)}
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="border border-border rounded-xl bg-card p-5 space-y-3">
                <h2 className="font-semibold flex items-center gap-2">
                  <span className="material-icons text-base">notes</span>
                  Nota del pedido (opcional)
                </h2>
                <textarea
                  rows={2}
                  placeholder="Instrucciones especiales..."
                  value={form.customerNote}
                  onChange={e => updateForm('customerNote', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>

              {checkoutError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  <span className="material-icons text-base">error</span>
                  {checkoutError}
                </div>
              )}

              <button
                type="submit"
                disabled={shippingLoading}
                className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                Continuar al pago
                <span className="material-icons text-base">chevron_right</span>
              </button>
            </form>
          )}

          {/* ── Step 3: Payment ───────────────────────────────────────────── */}
          {step === 'payment' && (
            <div className="space-y-4">
              {/* Contact + shipping summary */}
              <div className="border border-border rounded-xl bg-card p-4 text-sm space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{form.customerName} · {form.customerEmail}</p>
                    <p className="text-muted-foreground">{form.line1}, {form.city} {form.postalCode}</p>
                    {selectedRate && (
                      <p className="text-muted-foreground">
                        {selectedRate.name} ·{' '}
                        {shippingCost === 0 ? 'Gratis' : formatPrice(shippingCost)}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setStep('shipping'); setCheckoutResult(null); setStripePromise(null); }}
                    className="text-primary text-xs hover:underline flex-shrink-0"
                  >Editar</button>
                </div>
              </div>

              <CheckoutPaymentSection
                checkoutResult={checkoutResult}
                stripePromise={stripePromise}
                checkoutLoading={checkoutLoading}
                checkoutError={checkoutError}
                onSuccess={(orderNumber) => {
                  // Clear cart session so the cart block shows empty on next load
                  if (typeof window !== 'undefined') {
                    localStorage.removeItem('cart_session_id');
                  }
                  setSuccessOrderNumber(orderNumber);
                }}
                basePath={basePath}
              />
            </div>
          )}
        </div>

        {/* ── Right: order summary ───────────────────────────────────────── */}
        <CheckoutOrderSummary
          items={items}
          cartSubtotal={cartSubtotal}
          selectedRate={selectedRate}
          shippingCost={shippingCost}
          displayTotal={displayTotal}
          displayCurrency={displayCurrency}
        />
      </div>
    </div>
  );
}
