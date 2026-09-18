'use client';

import Link from 'next/link';

export function OrderSuccess({ orderNumber, basePath }: { orderNumber: string; basePath: string }) {
  return (
    <div className="container mx-auto px-4 py-16 max-w-lg text-center">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
        <span className="material-icons text-3xl text-green-600">check_circle</span>
      </div>
      <h1 className="text-2xl font-bold mb-2">Pedido confirmado</h1>
      <p className="text-muted-foreground mb-1">¡Gracias por tu compra!</p>
      <p className="text-sm font-medium mb-8">Número de pedido: <span className="font-mono">{orderNumber}</span></p>
      <p className="text-sm text-muted-foreground mb-6">
        Recibirás un correo de confirmación en breve. Tu pedido se está procesando.
      </p>
      <Link
        href={`${basePath}/`}
        className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        <span className="material-icons text-base">home</span>
        Volver a la tienda
      </Link>
    </div>
  );
}
