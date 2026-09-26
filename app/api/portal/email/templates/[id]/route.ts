import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailTemplates } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { renderBlocksToEmailHtml } from '@/lib/email';
import { EmailHtmlTooLargeError, sanitizeEmailHtml } from '@/lib/email/sanitize-email-html';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await authorizePortal({ action: 'write', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const { id } = await params;
  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.category !== undefined) updates.category = body.category;
  if (body.subject !== undefined) updates.subject = body.subject;
  if (body.htmlContent !== undefined) updates.htmlContent = body.htmlContent;
  if (body.blockContent !== undefined) {
    updates.blockContent = body.blockContent;
    if (body.blockContent?.blocks) {
      updates.htmlContent = renderBlocksToEmailHtml(body.blockContent.blocks);
    }
  }
  // Sanitize whichever htmlContent value will be persisted (raw user HTML
  // or freshly rendered block HTML) before previewing or sending it.
  if (typeof updates.htmlContent === 'string') {
    try {
      updates.htmlContent = sanitizeEmailHtml(updates.htmlContent);
    } catch (error) {
      if (error instanceof EmailHtmlTooLargeError) {
        return NextResponse.json({ success: false, message: error.message }, { status: 413 });
      }
      throw error;
    }
  }

  const [updated] = await db.update(emailTemplates)
    .set(updates)
    .where(and(eq(emailTemplates.id, parseInt(id, 10)), eq(emailTemplates.clientId, client.id)))
    .returning();

  if (!updated) return NextResponse.json({ success: false, message: 'Template not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await authorizePortal({ action: 'write', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const { id } = await params;
  await db.delete(emailTemplates)
    .where(and(eq(emailTemplates.id, parseInt(id, 10)), eq(emailTemplates.clientId, client.id)));

  return NextResponse.json({ success: true });
}
