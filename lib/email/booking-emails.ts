import { resend } from './index';
import { db } from '@/lib/db';
import { bookingPages, brandingProfiles, brandingMessaging, clients } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

const BASE_URL = process.env.NEXTAUTH_URL || 'https://simplerdevelopment.com';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'bookings@simplerdevelopment.com';

/**
 * Brand snapshot threaded through the booking emails so confirmations,
 * host-notifications, and cancellations carry the tenant's logo + colors +
 * wordmark instead of the CRM AGENTS house template. Resolved by
 * `loadBookingBrand` from the booking page's `brandingProfileId` (or the
 * client's default brand profile if the booking page doesn't override).
 *
 * Every field is optional — when `loadBookingBrand` returns `null` or a
 * sparse snapshot, the template falls back to neutral defaults so emails
 * still render correctly.
 */
export interface BookingBrand {
  primaryColor?: string | null;
  backgroundColor?: string | null;
  textColor?: string | null;
  accentColor?: string | null;
  logoUrl?: string | null;
  logoAlt?: string | null;
  logoText?: string | null;
  companyName?: string | null;
  tagline?: string | null;
}

interface BookingEmailData {
  guestName: string;
  guestEmail: string;
  pageTitle: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  cancelToken: string;
  bookingSlug: string;
  duration: number;
  meetingLink?: string | null;
  hostEmail?: string;
  /** Optional brand snapshot — call `loadBookingBrand(bookingPageId)` to fetch. */
  brand?: BookingBrand | null;
}

/**
 * Resolve the brand snapshot for a booking page's confirmation emails.
 * Priority:
 *   1. The booking page's `brandingProfileId` if set.
 *   2. The client's `isDefault=true` brand profile.
 *   3. null — caller gets neutral defaults.
 *
 * Combines the profile colors / logos with the per-profile messaging row
 * (companyName, tagline) — falls back to the client's `company` column for
 * companyName if no messaging row exists. Fail-safe: any DB error returns
 * null so the email send isn't blocked by a brand lookup blip.
 */
export async function loadBookingBrand(bookingPageId: number): Promise<BookingBrand | null> {
  try {
    const [page] = await db
      .select({
        id: bookingPages.id,
        clientId: bookingPages.clientId,
        brandingProfileId: bookingPages.brandingProfileId,
      })
      .from(bookingPages)
      .where(eq(bookingPages.id, bookingPageId))
      .limit(1);
    if (!page) return null;

    // Pick the profile: page-level override, else client's isDefault.
    let profile = null as typeof brandingProfiles.$inferSelect | null;
    if (page.brandingProfileId) {
      const [p] = await db.select().from(brandingProfiles)
        .where(eq(brandingProfiles.id, page.brandingProfileId))
        .limit(1);
      profile = p ?? null;
    }
    if (!profile) {
      const [p] = await db.select().from(brandingProfiles)
        .where(and(eq(brandingProfiles.clientId, page.clientId), eq(brandingProfiles.isDefault, true)))
        .limit(1);
      profile = p ?? null;
    }

    // Messaging row keyed by profileId (preferred) or clientId.
    let messaging = null as typeof brandingMessaging.$inferSelect | null;
    if (profile) {
      const [m] = await db.select().from(brandingMessaging)
        .where(eq(brandingMessaging.brandingProfileId, profile.id))
        .limit(1);
      messaging = m ?? null;
    }
    if (!messaging) {
      const [m] = await db.select().from(brandingMessaging)
        .where(eq(brandingMessaging.clientId, page.clientId))
        .limit(1);
      messaging = m ?? null;
    }

    // Company-name final fallback: clients.company.
    let companyName = messaging?.companyName ?? null;
    if (!companyName) {
      const [c] = await db.select({ company: clients.company }).from(clients)
        .where(eq(clients.id, page.clientId)).limit(1);
      companyName = c?.company ?? null;
    }

    if (!profile && !messaging && !companyName) return null;

    return {
      primaryColor: profile?.primaryColor ?? null,
      backgroundColor: profile?.backgroundColor ?? null,
      textColor: profile?.textColor ?? null,
      accentColor: profile?.accentColor ?? null,
      logoUrl: profile?.logoUrl ?? null,
      logoAlt: profile?.logoAlt ?? null,
      logoText: profile?.logoText ?? null,
      companyName,
      tagline: messaging?.tagline ?? null,
    };
  } catch (err) {
    console.warn('[loadBookingBrand] lookup failed; falling back to neutral defaults', err);
    return null;
  }
}

/** Format a Date to ICS timestamp (UTC): 20260410T140000Z */
function toIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Generate an .ics calendar file for a booking */
function generateIcs(data: BookingEmailData): string {
  const uid = crypto.randomUUID() + '@simplerdevelopment.com';
  const now = toIcsDate(new Date());
  const dtStart = toIcsDate(data.startTime);
  const dtEnd = toIcsDate(data.endTime);
  const location = data.meetingLink || '';
  const description = data.meetingLink
    ? `Únete: ${data.meetingLink}\\nCancelar o reprogramar: ${BASE_URL}/book/cancel?token=${data.cancelToken}`
    : `Cancelar o reprogramar: ${BASE_URL}/book/cancel?token=${data.cancelToken}`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CRM-AGENTS//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${data.pageTitle}`,
    `DESCRIPTION:${description}`,
    location ? `LOCATION:${location}` : '',
    `ORGANIZER;CN=CRM AGENTS:mailto:${FROM_EMAIL}`,
    `ATTENDEE;CN=${data.guestName};RSVP=TRUE:mailto:${data.guestEmail}`,
    data.hostEmail ? `ATTENDEE;CN=Anfitrión;RSVP=TRUE:mailto:${data.hostEmail}` : '',
    'STATUS:CONFIRMED',
    `BEGIN:VALARM`,
    `TRIGGER:-PT15M`,
    `ACTION:DISPLAY`,
    `DESCRIPTION:Recordatorio: ${data.pageTitle}`,
    `END:VALARM`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

function formatDateTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
    timeZoneName: 'short',
  }).format(date);
}

function formatTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(date);
}

/** Safe HTML escape for any brand-derived value we drop into the email. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function bookingEmailHtml(content: string, previewText: string, brand?: BookingBrand | null): string {
  // Header — wide logo if available, fallback to wordmark in the brand
  // primary color. Skip the header entirely when no brand snapshot is given
  // so legacy callers retain the prior look.
  const headerHtml = (() => {
    if (!brand) return '';
    if (brand.logoUrl) {
      const alt = esc(brand.logoAlt ?? brand.companyName ?? 'Logotipo');
      return `
          <tr>
            <td style="padding:24px 40px 8px;background:#ffffff;text-align:center;">
              <img src="${esc(brand.logoUrl)}" alt="${alt}" height="40" style="max-height:40px;width:auto;display:inline-block;border:0;" />
            </td>
          </tr>`;
    }
    if (brand.logoText) {
      const c = esc(brand.primaryColor ?? '#111827');
      return `
          <tr>
            <td style="padding:24px 40px 8px;background:#ffffff;text-align:center;">
              <p style="margin:0;font-size:18px;font-weight:700;letter-spacing:0.04em;color:${c};">${esc(brand.logoText)}</p>
            </td>
          </tr>`;
    }
    return '';
  })();

  const footerLine = brand?.companyName
    ? `${esc(brand.companyName)}${brand.tagline ? ` &middot; <span style="font-style:italic;">${esc(brand.tagline)}</span>` : ''}`
    : 'Con la tecnología de CRM AGENTS';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${previewText}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">${headerHtml}
          <tr>
            <td style="padding:32px 40px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 40px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                ${footerLine}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Resolve the brand-aware accent (e.g. for buttons + CTAs) with a safe fallback. */
function brandAccent(brand?: BookingBrand | null): string {
  return brand?.primaryColor ?? brand?.accentColor ?? '#2563eb';
}

/**
 * Send booking confirmation email to the guest.
 */
export async function sendGuestConfirmation(data: BookingEmailData): Promise<void> {
  const cancelUrl = `${BASE_URL}/book/cancel?token=${data.cancelToken}`;
  const formattedStart = formatDateTime(data.startTime, data.timezone);
  const formattedEnd = formatTime(data.endTime, data.timezone);

  const accent = brandAccent(data.brand);
  const heading = data.brand?.textColor ?? '#111827';
  const html = bookingEmailHtml(`
    <h1 style="margin:0 0 8px;font-size:24px;color:${heading};">Reserva confirmada</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">Tu cita ha sido programada.</p>

    <table role="presentation" width="100%" style="background:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:12px 20px;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Qué</p>
          <p style="margin:0;font-size:16px;color:${heading};font-weight:600;">${data.pageTitle}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 20px;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Cuándo</p>
          <p style="margin:0;font-size:16px;color:${heading};font-weight:600;">${formattedStart}</p>
          <p style="margin:4px 0 0;font-size:14px;color:#6b7280;">${data.duration} minutos (hasta las ${formattedEnd})</p>
        </td>
      </tr>
      ${data.meetingLink ? `<tr>
        <td style="padding:12px 20px;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Dónde</p>
          <a href="${data.meetingLink}" style="display:inline-block;padding:10px 24px;background:${accent};color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">Unirse a la videollamada</a>
        </td>
      </tr>` : ''}
    </table>

    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
      ¿Necesitas hacer cambios?
      <a href="${cancelUrl}" style="color:${accent};text-decoration:none;">Cancelar o reprogramar</a>
    </p>
  `, `Tu reserva de ${data.pageTitle} está confirmada para el ${formattedStart}`, data.brand);

  const icsContent = generateIcs(data);

  try {
    await resend.emails.send({
      from: `Confirmación de reserva <${FROM_EMAIL}>`,
      to: data.guestEmail,
      subject: `Confirmada: ${data.pageTitle}`,
      html,
      attachments: [
        {
          filename: 'invite.ics',
          content: Buffer.from(icsContent).toString('base64'),
          contentType: 'text/calendar; method=REQUEST',
        },
      ],
    });
  } catch (err) {
    console.error('Failed to send guest confirmation email:', err);
  }
}

/**
 * Send booking notification email to the host (client).
 */
export async function sendHostNotification(
  hostEmail: string,
  data: BookingEmailData,
): Promise<void> {
  const formattedStart = formatDateTime(data.startTime, data.timezone);
  const formattedEnd = formatTime(data.endTime, data.timezone);
  const portalUrl = `${BASE_URL}/portal/tools/booking`;

  const accent = brandAccent(data.brand);
  const heading = data.brand?.textColor ?? '#111827';
  const fromBrandName = data.brand?.companyName ?? 'CRM AGENTS';
  const html = bookingEmailHtml(`
    <h1 style="margin:0 0 8px;font-size:24px;color:${heading};">Nueva reserva</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">Tienes una nueva cita programada.</p>

    <table role="presentation" width="100%" style="background:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:12px 20px;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Cliente</p>
          <p style="margin:0;font-size:16px;color:${heading};font-weight:600;">${data.guestName}</p>
          <p style="margin:4px 0 0;font-size:14px;color:#6b7280;">${data.guestEmail}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 20px;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Qué</p>
          <p style="margin:0;font-size:16px;color:${heading};font-weight:600;">${data.pageTitle}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 20px;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Cuándo</p>
          <p style="margin:0;font-size:16px;color:${heading};font-weight:600;">${formattedStart}</p>
          <p style="margin:4px 0 0;font-size:14px;color:#6b7280;">${data.duration} minutos (hasta las ${formattedEnd})</p>
        </td>
      </tr>
      ${data.meetingLink ? `<tr>
        <td style="padding:12px 20px;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Videollamada</p>
          <a href="${data.meetingLink}" style="color:${accent};text-decoration:none;font-size:14px;">${data.meetingLink}</a>
        </td>
      </tr>` : ''}
    </table>

    <a href="${portalUrl}" style="display:inline-block;padding:10px 24px;background:${accent};color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">Ver en el portal</a>
  `, `Nueva reserva: ${data.guestName} — ${data.pageTitle}`, data.brand);

  const icsContent = generateIcs({ ...data, hostEmail });

  try {
    await resend.emails.send({
      from: `${fromBrandName} <${FROM_EMAIL}>`,
      to: hostEmail,
      subject: `Nueva reserva: ${data.guestName} — ${data.pageTitle}`,
      html,
      attachments: [
        {
          filename: 'invite.ics',
          content: Buffer.from(icsContent).toString('base64'),
          contentType: 'text/calendar; method=REQUEST',
        },
      ],
    });
  } catch (err) {
    console.error('Failed to send host notification email:', err);
  }
}

/**
 * Send cancellation confirmation to the guest.
 */
export async function sendCancellationEmail(
  guestEmail: string,
  guestName: string,
  pageTitle: string,
  startTime: Date,
  timezone: string,
  bookingSlug: string,
  brand?: BookingBrand | null,
): Promise<void> {
  const formattedStart = formatDateTime(startTime, timezone);
  const rebookUrl = `${BASE_URL}/book/${bookingSlug}`;
  const accent = brandAccent(brand);
  const heading = brand?.textColor ?? '#111827';

  const html = bookingEmailHtml(`
    <h1 style="margin:0 0 8px;font-size:24px;color:${heading};">Reserva cancelada</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">Tu cita ha sido cancelada.</p>

    <table role="presentation" width="100%" style="background:#fef2f2;border-radius:8px;padding:20px;margin-bottom:24px;" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:12px 20px;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Cancelada</p>
          <p style="margin:0;font-size:16px;color:${heading};font-weight:600;">${pageTitle}</p>
          <p style="margin:4px 0 0;font-size:14px;color:#6b7280;">${formattedStart}</p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
      ¿Quieres reservar otro horario?
      <a href="${rebookUrl}" style="color:${accent};text-decoration:none;">Reservar de nuevo</a>
    </p>
  `, `Tu cita de ${pageTitle} ha sido cancelada`, brand);

  try {
    await resend.emails.send({
      from: `Actualización de reserva <${FROM_EMAIL}>`,
      to: guestEmail,
      subject: `Cancelada: ${pageTitle} — ${formattedStart}`,
      html,
    });
  } catch (err) {
    console.error('Failed to send cancellation email:', err);
  }
}

/**
 * Send rescheduled-booking confirmation to the guest and, optionally, the host.
 * Mirrors `sendGuestConfirmation` / `sendCancellationEmail` shape — brand-aware,
 * best-effort (errors are logged and swallowed so the reschedule POST can continue).
 */
export async function sendRescheduleEmail(data: {
  guestName: string;
  guestEmail: string;
  pageTitle: string;
  newStartTime: Date;
  newEndTime: Date;
  previousStartTime: Date;
  timezone: string;
  cancelToken: string;
  rescheduleToken: string;
  bookingSlug: string;
  duration: number;
  meetingLink?: string | null;
  hostEmail?: string | null;
  brand?: BookingBrand | null;
}): Promise<void> {
  const cancelUrl = `${BASE_URL}/book/cancel?token=${data.cancelToken}`;
  const formattedNew = formatDateTime(data.newStartTime, data.timezone);
  const formattedNewEnd = formatTime(data.newEndTime, data.timezone);
  const formattedPrevious = formatDateTime(data.previousStartTime, data.timezone);
  const accent = brandAccent(data.brand);
  const heading = data.brand?.textColor ?? '#111827';
  const fromBrandName = data.brand?.companyName ?? 'CRM AGENTS';

  const guestHtml = bookingEmailHtml(`
    <h1 style="margin:0 0 8px;font-size:24px;color:${heading};">Reserva reprogramada</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">Tu cita se ha movido a un nuevo horario.</p>

    <table role="presentation" width="100%" style="background:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:12px 20px;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Qué</p>
          <p style="margin:0;font-size:16px;color:${heading};font-weight:600;">${esc(data.pageTitle)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 20px;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Nuevo horario</p>
          <p style="margin:0;font-size:16px;color:${heading};font-weight:600;">${formattedNew}</p>
          <p style="margin:4px 0 0;font-size:14px;color:#6b7280;">${data.duration} minutos (hasta las ${formattedNewEnd})</p>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 20px;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Horario anterior</p>
          <p style="margin:0;font-size:14px;color:#6b7280;text-decoration:line-through;">${formattedPrevious}</p>
        </td>
      </tr>
      ${data.meetingLink ? `<tr>
        <td style="padding:12px 20px;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Dónde</p>
          <a href="${esc(data.meetingLink)}" style="display:inline-block;padding:10px 24px;background:${accent};color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">Unirse a la videollamada</a>
        </td>
      </tr>` : ''}
    </table>

    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
      ¿Necesitas hacer cambios?
      <a href="${cancelUrl}" style="color:${accent};text-decoration:none;">Cancelar</a>
    </p>
  `, `Tu cita de ${data.pageTitle} ha sido reprogramada para el ${formattedNew}`, data.brand);

  try {
    await resend.emails.send({
      from: `${fromBrandName} <${FROM_EMAIL}>`,
      to: data.guestEmail,
      subject: `Reprogramada: ${data.pageTitle} — ${formattedNew}`,
      html: guestHtml,
    });
  } catch (err) {
    console.error('Failed to send reschedule confirmation to guest:', err);
  }

  if (data.hostEmail) {
    const hostHtml = bookingEmailHtml(`
      <h1 style="margin:0 0 8px;font-size:24px;color:${heading};">Reserva reprogramada</h1>
      <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">${esc(data.guestName)} ha reprogramado su cita.</p>

      <table role="presentation" width="100%" style="background:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:12px 20px;">
            <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Cliente</p>
            <p style="margin:0;font-size:16px;color:${heading};font-weight:600;">${esc(data.guestName)}</p>
            <p style="margin:4px 0 0;font-size:14px;color:#6b7280;">${esc(data.guestEmail)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 20px;">
            <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Nuevo horario</p>
            <p style="margin:0;font-size:16px;color:${heading};font-weight:600;">${formattedNew}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 20px;">
            <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Horario anterior</p>
            <p style="margin:0;font-size:14px;color:#6b7280;text-decoration:line-through;">${formattedPrevious}</p>
          </td>
        </tr>
      </table>
    `, `${data.guestName} ha reprogramado su ${data.pageTitle} para el ${formattedNew}`, data.brand);

    try {
      await resend.emails.send({
        from: `${fromBrandName} <${FROM_EMAIL}>`,
        to: data.hostEmail,
        subject: `Reprogramada: ${data.guestName} — ${data.pageTitle}`,
        html: hostHtml,
      });
    } catch (err) {
      console.error('Failed to send reschedule notification to host:', err);
    }
  }
}

/**
 * Send a pre-booking reminder. Triggered by `/api/cron/booking-reminders` on
 * rows whose `reminder_sent_at` is NULL and whose `start_time` is inside the
 * send window (≈ 24h ahead). One reminder per booking — the cron updates
 * `reminder_sent_at` after a successful send so subsequent runs skip.
 *
 * Brand-aware via `data.brand` (callers should pass the result of
 * `loadBookingBrand(bookingPageId)`). Cancellation token is included so the
 * guest can still cancel from inside the reminder.
 */
export async function sendBookingReminder(data: BookingEmailData): Promise<void> {
  const cancelUrl = `${BASE_URL}/book/cancel?token=${data.cancelToken}`;
  const formattedStart = formatDateTime(data.startTime, data.timezone);
  const formattedEnd = formatTime(data.endTime, data.timezone);
  const accent = brandAccent(data.brand);
  const heading = data.brand?.textColor ?? '#111827';
  const fromBrandName = data.brand?.companyName ?? 'CRM AGENTS';

  const html = bookingEmailHtml(`
    <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.18em;color:${accent};text-transform:uppercase;">Recordatorio</p>
    <h1 style="margin:0 0 8px;font-size:24px;color:${heading};">Tu cita se acerca</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">Hola ${esc(data.guestName)}: te esperamos el ${formattedStart}.</p>

    <table role="presentation" width="100%" style="background:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:12px 20px;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Qué</p>
          <p style="margin:0;font-size:16px;color:${heading};font-weight:600;">${esc(data.pageTitle)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 20px;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Cuándo</p>
          <p style="margin:0;font-size:16px;color:${heading};font-weight:600;">${formattedStart}</p>
          <p style="margin:4px 0 0;font-size:14px;color:#6b7280;">${data.duration} minutos (hasta las ${formattedEnd})</p>
        </td>
      </tr>
      ${data.meetingLink ? `<tr>
        <td style="padding:12px 20px;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Dónde</p>
          <a href="${esc(data.meetingLink)}" style="display:inline-block;padding:10px 24px;background:${accent};color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">Unirse a la videollamada</a>
        </td>
      </tr>` : ''}
    </table>

    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
      ¿No puedes asistir?
      <a href="${cancelUrl}" style="color:${accent};text-decoration:none;">Cancelar o reprogramar</a>
    </p>
  `, `Recordatorio: tu cita de ${data.pageTitle} es el ${formattedStart}`, data.brand);

  try {
    await resend.emails.send({
      from: `${fromBrandName} <${FROM_EMAIL}>`,
      to: data.guestEmail,
      subject: `Recordatorio: ${data.pageTitle} — ${formattedStart}`,
      html,
    });
  } catch (err) {
    console.error('Failed to send booking reminder email:', err);
    throw err; // Re-throw so the cron records a failure instead of a silent skip.
  }
}
