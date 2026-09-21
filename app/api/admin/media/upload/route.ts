import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clients, media } from '@/lib/db/schema';
import { uploadToS3 } from '@/lib/s3/upload';
import { auth } from '@/lib/auth';
import { getImageDimensions } from '@/lib/media/image-dimensions';
import { eq } from 'drizzle-orm';

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '10485760'); // 10MB default
const ALLOWED_TYPES = (process.env.ALLOWED_FILE_TYPES ?? '')
  .split(',')
  .map((type) => type.trim())
  .filter(Boolean);

/**
 * Staff upload on behalf of a client.
 *
 * Mirrors `/api/media/upload`, but the target tenant comes from the request
 * (`clientId` query or form field) instead of the session — staff sessions
 * have no portal client, which is why the admin media page could not upload.
 */
async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string }).role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = parseInt(session.user.id as string, 10);

    const { searchParams } = new URL(request.url);
    const formData = await request.formData() as unknown as globalThis.FormData;
    const clientIdRaw = searchParams.get('clientId') ?? (formData.get('clientId') as string | null);
    const clientId = clientIdRaw ? parseInt(String(clientIdRaw), 10) : NaN;
    if (!Number.isFinite(clientId) || clientId <= 0) {
      return NextResponse.json(
        { success: false, error: 'clientId is required' },
        { status: 400 },
      );
    }
    const [targetClient] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    if (!targetClient) {
      return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 });
    }

    const file = formData.get('file') as File | null;
    const alt = formData.get('alt') as string | null;
    const caption = formData.get('caption') as string | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    if (ALLOWED_TYPES.length > 0 && !ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: `File type ${file.type} not allowed` },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `File size exceeds ${MAX_FILE_SIZE} bytes` },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const { width, height } = await getImageDimensions(buffer, file.type);
    const uploadResult = await uploadToS3(buffer, file.name, file.type);

    const [newMedia] = await db
      .insert(media)
      .values({
        filename: file.name,
        storedFilename: uploadResult.storedFilename,
        mimeType: uploadResult.mimeType,
        fileSize: uploadResult.fileSize,
        url: uploadResult.url,
        width,
        height,
        alt: alt || null,
        caption: caption || null,
        uploadedBy: userId,
        clientId: targetClient.id,
      })
      .returning();

    return NextResponse.json({ success: true, data: newMedia }, { status: 201 });
  } catch (error) {
    console.error('Admin media upload error:', error);
    return NextResponse.json({ success: false, error: 'Upload failed' }, { status: 500 });
  }
}
