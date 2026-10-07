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

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  let resend;
  try {
    resend = await getResendClient();
  } catch (err) {
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : 'Resend is not configured' },
      { status: 400 },
    );
  }

  const { id } = await params;
  const { data, error } = await resend.domains.verify(id);
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  return NextResponse.json({ success: true, data });
}
