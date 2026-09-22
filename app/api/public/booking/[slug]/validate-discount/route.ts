import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookingPages, discountCodes, clientWebsites } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const [page] = await db.select().from(bookingPages)
      .where(and(eq(bookingPages.slug, slug), eq(bookingPages.active, true)))
      .limit(1);

    if (!page) {
      return NextResponse.json({ success: false, message: 'Página de reservas no encontrada.' }, { status: 404 });
    }

    if (!page.enableDiscountCodes) {
      return NextResponse.json({ success: false, message: 'Los códigos de descuento no están habilitados.' }, { status: 400 });
    }

    // Resolve websiteId from the booking page
    let websiteId = page.websiteId;
    if (!websiteId) {
      // Fall back: find the first website for this client
      const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.clientId, page.clientId), eq(clientWebsites.active, true)))
        .limit(1);
      websiteId = site?.id ?? null;
    }

    if (!websiteId) {
      return NextResponse.json({ success: false, message: 'No hay una web configurada para los códigos de descuento.' }, { status: 400 });
    }

    const body = await req.json();
    const { code, subtotal } = body;

    if (!code) {
      return NextResponse.json({ success: false, message: 'Introduce un código de descuento.' }, { status: 400 });
    }

    const [discount] = await db.select().from(discountCodes)
      .where(and(
        eq(discountCodes.websiteId, websiteId),
        eq(discountCodes.code, code.toUpperCase()),
        eq(discountCodes.active, true),
        sql`${discountCodes.applicableTo} IN ('booking', 'both')`,
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
    console.error('Booking discount validate error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
