// Server entry for the sandboxed widget iframe. The host-page loader owns the
// public widget reference and creates a session using the browser's real
// Origin; the iframe only receives that session by pinned postMessage.

import ChatBootstrap from './chat-bootstrap';

export const dynamic = 'force-dynamic';

export default async function WidgetChatPage({
  searchParams,
}: {
  searchParams: Promise<{ parentOrigin?: string }>;
}) {
  const { parentOrigin } = await searchParams;
  return <ChatBootstrap parentOrigin={parentOrigin ?? ''} />;
}
