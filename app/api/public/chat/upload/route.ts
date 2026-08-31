import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { chatConversations, chatWidgets } from '@/lib/db/schema';
import { issueChatAttachmentToken, verifyVisitorToken } from '@/lib/chat/token';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';
import { uploadToS3 } from '@/lib/s3/upload';

export const runtime = 'nodejs';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_BYTES + 128 * 1024;
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'text/plain']);

function signatureMatches(bytes: Uint8Array, mime: string): boolean {
  if (mime === 'text/plain') return !bytes.subarray(0, 512).includes(0);
  if (mime === 'image/png') return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/gif') return String.fromCharCode(...bytes.subarray(0, 4)) === 'GIF8';
  if (mime === 'image/webp') return String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP';
  if (mime === 'application/pdf') return String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-';
  return false;
}

export async function POST(req: Request) {
  const contentLength = Number(req.headers.get('content-length'));
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
    return NextResponse.json({ success: false, message: 'Content-Length is required' }, { status: 411 });
  }
  if (contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ success: false, message: 'Upload exceeds the maximum request size' }, { status: 413 });
  }
  const token = verifyVisitorToken(req.headers.get('x-chat-token'));
  const conversationId = Number.parseInt(req.headers.get('x-chat-conversation') ?? '', 10);
  if (!token || token.conversationId !== conversationId) return NextResponse.json({ success: false, message: 'Invalid token' }, { status: 401 });
  if (!(await checkRateLimit(`chat-upload:ip:${getClientIp(req)}`, 10, 60_000))) {
    return NextResponse.json({ success: false, message: 'Too many uploads' }, { status: 429 });
  }
  const [conversation] = await db.select().from(chatConversations).where(eq(chatConversations.id, conversationId)).limit(1);
  if (!conversation?.widgetId) return NextResponse.json({ success: false, message: 'Conversation not found' }, { status: 404 });
  const [widget] = await db.select({ allowAttachments: chatWidgets.allowAttachments }).from(chatWidgets).where(and(
    eq(chatWidgets.id, conversation.widgetId), eq(chatWidgets.clientId, conversation.clientId),
  )).limit(1);
  if (!widget?.allowAttachments) return NextResponse.json({ success: false, message: 'Attachments are disabled' }, { status: 403 });
  if (!(await checkRateLimit(`chat-upload:${conversation.clientId}:${getClientIp(req)}`, 10, 60_000))) {
    return NextResponse.json({ success: false, message: 'Too many uploads' }, { status: 429 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size <= 0 || file.size > MAX_BYTES || !ALLOWED.has(file.type)) {
    return NextResponse.json({ success: false, message: 'Unsupported file or size (maximum 10 MB)' }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!signatureMatches(buffer, file.type)) return NextResponse.json({ success: false, message: 'File content does not match its MIME type' }, { status: 400 });
  const extension = file.name.includes('.') ? file.name.split('.').pop()!.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) : 'bin';
  const result = await uploadToS3(buffer, file.name, file.type, { key: `chat/${conversation.clientId}/${randomUUID()}.${extension}` });
  const attachmentToken = issueChatAttachmentToken(conversationId, result.url);
  return NextResponse.json({ success: true, data: {
    url: `${result.url}?chatAttachment=${encodeURIComponent(attachmentToken)}`,
    name: file.name.slice(0, 255),
    mimeType: result.mimeType,
    size: result.fileSize,
  } });
}
