import type { Metadata } from 'next';

// Confirmation page after a click on the one-click-unsubscribe link
// (see app/api/email/unsubscribe/route.ts). Standalone: no marketing chrome.
export const metadata: Metadata = {
  title: 'Baja de la lista',
  robots: { index: false },
};

export default function UnsubscribedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-xl text-center">
        <h1 className="text-2xl font-semibold text-foreground">Te has dado de baja.</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Confirmado: te hemos eliminado de la lista de correo. No recibirás más
          envíos en tu bandeja de entrada.
        </p>
      </div>
    </main>
  );
}