export interface ChatMessageItem {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: { name: string; input: Record<string, unknown>; success?: boolean }[] | null;
  injectedBy?: number | null;
  createdAt?: string;
}

export interface ChatConversation {
  id: number;
  title: string;
  updatedAt: string;
}
