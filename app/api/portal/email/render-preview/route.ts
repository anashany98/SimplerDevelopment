import { NextRequest, NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { renderBlocksToEmailHtml, buildCampaignHtml } from '@/lib/email';
import { EmailHtmlTooLargeError, sanitizeEmailHtml } from '@/lib/email/sanitize-email-html';

export async function POST(req: NextRequest) {
  const authResult = await authorizePortal({ action: 'read', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const body = await req.json();
  const { blockContent, htmlContent } = body;

  if (typeof htmlContent === 'string') {
    try {
      const html = buildCampaignHtml(
        sanitizeEmailHtml(htmlContent),
        '#',
        typeof body.previewText === 'string' ? body.previewText : null,
      );
      return NextResponse.json({ success: true, data: { html } });
    } catch (error) {
      if (error instanceof EmailHtmlTooLargeError) {
        return NextResponse.json({ success: false, message: error.message }, { status: 413 });
      }
      throw error;
    }
  }

  if (!blockContent?.blocks) {
    return NextResponse.json({ success: false, message: 'Provide htmlContent or blockContent.blocks' }, { status: 400 });
  }

  try {
    const innerHtml = sanitizeEmailHtml(renderBlocksToEmailHtml(blockContent.blocks));
    const html = buildCampaignHtml(innerHtml, '#', blockContent.previewText);
    return NextResponse.json({ success: true, data: { html } });
  } catch (error) {
    if (error instanceof EmailHtmlTooLargeError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 413 });
    }
    throw error;
  }
}
