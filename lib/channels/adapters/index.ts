// Channel adapter registry. The gateway resolves adapters by key; upper layers
// never import a provider SDK directly. Meta (WhatsApp/Instagram/Messenger) and
// email adapters are placeholders that fail closed until their provider phase
// lands (Phases 6–8); the WebChat adapter is the reference implementation.

import type {
  ChannelAdapter,
  ChannelAdapterKey,
  ChannelCapabilities,
  LegacyChannelAdapter,
  Channel,
  NormalizedMessage,
  OutboundMessageRequest,
} from '../types';
import { getCapabilities } from '../capabilities';
import { EmailChannelAdapter } from './email';
import { MetaChannelAdapter } from './meta';
import { WebChatAdapter } from './webchat';

export { getCapabilities, PROVIDER_CAPABILITIES } from '../capabilities';

/** A not-yet-wired provider. Fails closed so nothing silently no-ops. */
class PendingAdapter implements ChannelAdapter {
  readonly key: ChannelAdapterKey;
  readonly capabilities: ChannelCapabilities;

  constructor(key: ChannelAdapterKey) {
    this.key = key;
    this.capabilities = getCapabilities(key);
  }

  async receiveEvent(_payload: unknown): Promise<NormalizedMessage[]> {
    throw new Error(`adapter ${this.key} is not implemented yet`);
  }

  async sendMessage(_request: OutboundMessageRequest): Promise<{ externalMessageId: string }> {
    throw new Error(`adapter ${this.key} is not implemented yet`);
  }
}

export const pendingAdapters: ChannelAdapter[] = [
  new PendingAdapter('meta-whatsapp'),
  new PendingAdapter('meta-instagram'),
  new PendingAdapter('meta-messenger'),
  new PendingAdapter('resend'),
];

export function createAdapterRegistry(adapters: ChannelAdapter[]): {
  get(key: ChannelAdapterKey): ChannelAdapter | null;
} {
  const map = new Map<ChannelAdapterKey, ChannelAdapter>();
  for (const a of adapters) map.set(a.key, a);
  return {
    get: (key) => map.get(key) ?? null,
  };
}

// Portal connection-management routes still use the provider asset contract.
// Keep that adapter lookup alongside the newer gateway registry so both flows
// share the provider implementations without conflating their message types.
const portalAdapters = new Map<Channel, LegacyChannelAdapter>([
  ['whatsapp', new MetaChannelAdapter('whatsapp')],
  ['instagram', new MetaChannelAdapter('instagram')],
  ['messenger', new MetaChannelAdapter('messenger')],
  ['webchat', new WebChatAdapter()],
  ['email', new EmailChannelAdapter()],
]);

export function getChannelAdapter(channel: Channel): LegacyChannelAdapter {
  const adapter = portalAdapters.get(channel);
  if (!adapter) throw new Error(`Unsupported channel: ${channel}`);
  return adapter;
}

export { MetaChannelAdapter, WebChatAdapter, EmailChannelAdapter };
