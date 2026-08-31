import type { Channel, ChannelAdapter } from '../types';
import { EmailChannelAdapter } from './email';
import { MetaChannelAdapter } from './meta';
import { WebChatAdapter } from './webchat';

const adapters = new Map<Channel, ChannelAdapter>([
  ['whatsapp', new MetaChannelAdapter('whatsapp')],
  ['instagram', new MetaChannelAdapter('instagram')],
  ['messenger', new MetaChannelAdapter('messenger')],
  ['webchat', new WebChatAdapter()],
  ['email', new EmailChannelAdapter()],
]);

export function getChannelAdapter(channel: Channel): ChannelAdapter {
  const adapter = adapters.get(channel);
  if (!adapter) throw new Error(`Unsupported channel: ${channel}`);
  return adapter;
}

export { MetaChannelAdapter, WebChatAdapter, EmailChannelAdapter };
