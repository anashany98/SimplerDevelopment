type UnknownRecord = Record<string, unknown>;

const record = (value: unknown): UnknownRecord => value && typeof value === 'object' ? value as UnknownRecord : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

/**
 * Extract the tenant-routing asset from a Meta webhook envelope.
 * WhatsApp entry.id is a WABA id while onboarding stores the selected phone
 * number id, so phone_number_id must take precedence over entry.id.
 */
export function extractMetaExternalAccountIds(payload: UnknownRecord): string[] {
  const entryIds = new Set<string>();
  const phoneNumberIds = new Set<string>();
  for (const entryValue of array(payload.entry)) {
    const entry = record(entryValue);
    if (typeof entry.id === 'string' && entry.id) entryIds.add(entry.id);
    for (const changeValue of array(entry.changes)) {
      const metadata = record(record(record(changeValue).value).metadata);
      if (typeof metadata.phone_number_id === 'string' && metadata.phone_number_id) {
        phoneNumberIds.add(metadata.phone_number_id);
      }
    }
  }
  return phoneNumberIds.size > 0 ? [...phoneNumberIds] : [...entryIds];
}
