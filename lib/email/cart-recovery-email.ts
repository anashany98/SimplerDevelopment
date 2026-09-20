import { resend } from './index';
import { getConfiguredFromEmail } from './config';

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://simplerdevelopment.com';

/**
 * Send an abandoned-cart recovery email with a one-click recovery link.
 * Best-effort — the caller swallows failures (and stamps recovery_email_sent_at
 * regardless so we don't re-email the same cart every cron tick).
 */
export async function sendCartRecoveryEmail(opts: {
  to: string;
  websiteId: number;
  recoveryToken: string;
  itemCount: number;
  cartValue: number;
}): Promise<void> {
  const link = `${BASE_URL}/api/storefront/${opts.websiteId}/cart/recover?token=${encodeURIComponent(opts.recoveryToken)}`;
  const dollars = (opts.cartValue / 100).toFixed(2);
  await resend.emails.send({
    from: `Tu carrito <${(await getConfiguredFromEmail()) || 'store@simplerdevelopment.com'}>`,
    to: opts.to,
    subject: 'Dejaste artículos en tu carrito',
    html: `<p>Todavía tienes ${opts.itemCount} ${opts.itemCount === 1 ? 'artículo' : 'artículos'} esperando en tu carrito (total $${dollars}).</p>
<p><a href="${link}">Vuelve a tu carrito</a> para terminar la compra.</p>`,
  });
}
