import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getResendClient } from '@/lib/email';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin') return null;
  return session;
}

async function resolveResendClient() {
  try {
    return await getResendClient();
  } catch {
    return null;
  }
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const resend = await resolveResendClient();
  if (!resend) {
    // Configuration state, not a client error: return an empty list plus a
    // flag so the page can render the actionable message without a failed
    // request in the browser console.
    return NextResponse.json({
      success: true,
      data: [],
      configured: false,
      message: 'Resend API key is not configured (Admin → Email → Ajustes).',
    });
  }

  const { data, error } = await resend.domains.list();
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  return NextResponse.json({ success: true, data: data?.data ?? [] });
}

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const resend = await resolveResendClient();
  if (!resend) {
    return NextResponse.json(
      { success: false, message: 'Resend API key is not configured (Admin → Email → Ajustes).' },
      { status: 400 },
    );
  }

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ success: false, message: 'Domain name is required' }, { status: 400 });

  const { data, error } = await resend.domains.create({ name: name.trim().toLowerCase() });
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  return NextResponse.json({ success: true, data }, { status: 201 });
}
