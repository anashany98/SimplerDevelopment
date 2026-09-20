import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { auth } from '@/lib/auth';
import { getEmailPlatformConfig } from '@/lib/email';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin') return null;
  return session;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Send a real test email through Resend with the CURRENT platform config.
 * Deliberately bypasses the mailpit capture switch — the point of the test
 * is to prove the Resend key + sender domain work; Resend's own errors
 * (invalid key, unverified domain, …) surface verbatim so the UI can show
 * exactly what to fix.
 */
export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  let to = '';
  try {
    const body = (await req.json()) as { to?: unknown };
    if (typeof body?.to === 'string') to = body.to.trim();
  } catch {
    // empty body is fine — fall back to the admin's own address
  }
  if (!to) to = (session.user as { email?: string | null }).email ?? '';
  if (!to) return NextResponse.json({ success: false, message: 'Provide a recipient address.' }, { status: 400 });
  if (!EMAIL_RE.test(to)) return NextResponse.json({ success: false, message: 'Invalid recipient address.' }, { status: 400 });

  const cfg = await getEmailPlatformConfig();
  if (!cfg.resendApiKey) {
    return NextResponse.json(
      { success: false, message: 'Resend API key is not configured (Admin → Email → Ajustes, or RESEND_API_KEY).' },
      { status: 400 },
    );
  }

  const resend = new Resend(cfg.resendApiKey);
  const result = await resend.emails.send({
    from: `CRM AGENTS <${cfg.fromEmail}>`,
    to,
    subject: 'Prueba de configuración — CRM AGENTS',
    text: 'Si ves este correo, tu configuración de Resend funciona correctamente.\n\n— CRM AGENTS',
    html: '<p>Si ves este correo, tu configuración de Resend funciona correctamente.</p><p>— CRM AGENTS</p>',
  });

  if (result.error) {
    return NextResponse.json({ success: false, message: result.error.message }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    data: { id: result.data?.id ?? null, from: cfg.fromEmail, to },
  });
}
