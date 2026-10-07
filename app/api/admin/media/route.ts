import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients, media } from '@/lib/db/schema';
import { and, desc, eq, like, or, sql, type SQL } from 'drizzle-orm';

/**
 * Staff-scoped media library — the cross-tenant counterpart of `/api/media`.
 *
 * The admin "Medios" page previously called the client-scoped `/api/media`,
 * which 403s for staff sessions (staff have no portal client) and left the
 * page silently empty. Admin routes are global by design (see
 * app/admin/CLAUDE.md), so this endpoint lists media across every client with
 * an optional `clientId` filter.
 */
async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string }).role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);
    const search = searchParams.get('search') || '';
    const mimeType = searchParams.get('mimeType') || '';
    const clientIdRaw = searchParams.get('clientId');
    const clientId = clientIdRaw ? parseInt(clientIdRaw, 10) : NaN;

    const conditions: SQL[] = [];
    if (Number.isFinite(clientId)) conditions.push(eq(media.clientId, clientId));
    if (search) {
      conditions.push(
        or(
          like(media.filename, `%${search}%`),
          like(media.alt, `%${search}%`),
          like(media.caption, `%${search}%`),
        )!,
      );
    }
    if (mimeType && mimeType !== 'all') conditions.push(like(media.mimeType, `${mimeType}%`));
    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [{ count }]] = await Promise.all([
      db
        .select({
          id: media.id,
          filename: media.filename,
          url: media.url,
          mimeType: media.mimeType,
          fileSize: media.fileSize,
          width: media.width,
          height: media.height,
          alt: media.alt,
          caption: media.caption,
          createdAt: media.createdAt,
          clientId: media.clientId,
          clientName: clients.company,
        })
        .from(media)
        .leftJoin(clients, eq(clients.id, media.clientId))
        .where(where)
        .orderBy(desc(media.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(media).where(where),
    ]);

    return NextResponse.json({
      success: true,
      data: rows,
      pagination: { limit, offset, total: count },
    });
  } catch (error) {
    console.error('Error fetching admin media:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch media' }, { status: 500 });
  }
}
