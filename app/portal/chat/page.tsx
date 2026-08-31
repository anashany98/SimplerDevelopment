import AIChatWidget from '@/components/portal/AIChatWidget';

export const metadata = {
  title: 'Chat',
};

export default function PortalChatPage() {
  return (
    <section className="mx-auto flex h-[calc(100vh-8rem)] max-w-6xl flex-col">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Asistente de IA</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold tracking-[-0.03em] text-foreground">Chat</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Consulta al asistente, selecciona un especialista o encarga un análisis al Agente CEO.
        </p>
      </div>
      <AIChatWidget mode="page" />
    </section>
  );
}
