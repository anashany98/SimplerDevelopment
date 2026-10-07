// Canonical money formatter. Input is integer cents (the storage unit across
// billing/storefront/CRM). Default: EUR with es-ES conventions (Spanish
// formatting). Pass fractionDigits:0 for whole-euro display; pass currency
// for storefront multi-currency. For compact "1,2M €"-style output, this is
// the wrong helper.

export function formatMoney(
  cents: number,
  opts: { currency?: string; fractionDigits?: number } = {},
): string {
  const { currency = 'EUR', fractionDigits } = opts;
  // A non-finite amount means a bug upstream (usually a missing field on untyped
  // JSON). Render $0.00 rather than "$NaN" — this formatter feeds client-facing
  // proposals, invoices and storefront checkout, where "$NaN" is unshippable.
  const amount = Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
    ...(fractionDigits != null
      ? { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }
      : {}),
  }).format(amount / 100);
}
