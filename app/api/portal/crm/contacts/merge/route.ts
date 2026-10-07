import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { crmEntitlementError } from '@/lib/crm/entitlement';
import { ContactMergeNotFoundError, mergeCrmContacts } from '@/lib/crm/merge-contacts';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const userId = Number.parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
  const entitlementError = await crmEntitlementError(client.id);
  if (entitlementError) return entitlementError;
  const body = await req.json().catch(() => ({})) as { primaryId?: number; secondaryId?: number };
  if (!Number.isInteger(body.primaryId) || !Number.isInteger(body.secondaryId)) {
    return NextResponse.json({ success: false, message: 'primaryId and secondaryId are required' }, { status: 400 });
  }
  if (body.primaryId === body.secondaryId) {
    return NextResponse.json({ success: false, message: 'primaryId and secondaryId must be different' }, { status: 400 });
  }
  try {
    const merged = await mergeCrmContacts({
      clientId: client.id, primaryId: body.primaryId!, secondaryId: body.secondaryId!, actorUserId: userId,
    });
    return NextResponse.json({ success: true, data: merged });
  } catch (error) {
    if (error instanceof ContactMergeNotFoundError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 404 });
    }
    throw error;
  }
}
