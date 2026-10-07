import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { storeSettings, discountCodes } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await params;
    const websiteId = parseInt(siteId, 10);
    if (isNaN(websiteId)) {
      return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });
    }

    // Verify store is enabled
    const [store] = await db.select().from(storeSettings)
      .where(and(eq(storeSettings.websiteId, websiteId), eq(storeSettings.enabled, true)))
      .limit(1);

    if (!store) {
      return NextResponse.json({ success: false, message: 'Store not found' }, { status: 404 });
    }

    const body = await req.json();
    const { code, subtotal } = body;

    if (!code) {
      return NextResponse.json({ success: false, message: 'Introduce un código de descuento.' }, { status: 400 });
    }

    const [discount] = await db.select().from(discountCodes)
      .where(and(
        eq(discountCodes.websiteId, websiteId),
        eq(discountCodes.code, code),
        eq(discountCodes.active, true),
        sql`${discountCodes.applicableTo} IN ('store', 'both')`,
      ))
      .limit(1);

    if (!discount) {
      return NextResponse.json({ success: false, message: 'Código de descuento no válido.' }, { status: 400 });
    }

    const now = new Date();

    if (discount.startsAt && now < discount.startsAt) {
      return NextResponse.json({ success: false, message: 'El código de descuento aún no está activo.' }, { status: 400 });
    }

    if (discount.expiresAt && now > discount.expiresAt) {
      return NextResponse.json({ success: false, message: 'El código de descuento ha caducado.' }, { status: 400 });
    }

    if (discount.maxUses && discount.usedCount >= discount.maxUses) {
      return NextResponse.json({ success: false, message: 'El código de descuento ya se ha agotado.' }, { status: 400 });
    }

    if (discount.minOrderAmount && subtotal && subtotal < discount.minOrderAmount) {
      return NextResponse.json({
        success: false,
        message: `El pedido mínimo para este código es ${(discount.minOrderAmount / 100).toFixed(2)}.`,
      }, { status: 400 });
    }

    // Calculate discount amount if subtotal provided
    let discountAmount: number | null = null;
    if (subtotal) {
      if (discount.discountType === 'percent') {
        discountAmount = Math.round(subtotal * (discount.amount / 10000));
      } else if (discount.discountType === 'fixed_amount') {
        discountAmount = Math.min(discount.amount, subtotal);
      } else if (discount.discountType === 'free_shipping') {
        discountAmount = 0; // Applied to shipping, not subtotal
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        code: discount.code,
        description: discount.description,
        discountType: discount.discountType,
        amount: discount.amount,
        minOrderAmount: discount.minOrderAmount,
        discountAmount,
      },
    });
  } catch (err) {
    console.error('Storefront discount validate error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
