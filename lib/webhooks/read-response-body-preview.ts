/**
 * Read only a bounded UTF-8 preview from an outbound HTTP response. Webhook
 * destinations are untrusted and may return arbitrarily large bodies.
 */
export async function readResponseBodyPreview(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<string | undefined> {
  if (!body || maxBytes <= 0) return undefined;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let preview = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        preview += decoder.decode();
        return preview || undefined;
      }

      const remaining = maxBytes - bytesRead;
      const chunk = value.subarray(0, Math.max(remaining, 0));
      bytesRead += chunk.byteLength;
      preview += decoder.decode(chunk, { stream: true });

      if (chunk.byteLength < value.byteLength || bytesRead >= maxBytes) {
        // Do not buffer an arbitrarily large body just to persist a short
        // delivery-log preview. Cancelling also stops further network transfer.
        void reader.cancel().catch(() => {});
        preview += decoder.decode();
        return preview || undefined;
      }
    }
  } catch {
    void reader.cancel().catch(() => {});
    try {
      preview += decoder.decode();
    } catch {
      // Preserve the readable portion when a remote stream ends abruptly.
    }
    return preview || undefined;
  } finally {
    reader.releaseLock();
  }
}
