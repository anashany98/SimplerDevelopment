import { describe, expect, it } from 'vitest';
import {
  enrichPortalHistoryContent,
  getPortalToolError,
  portalToolCallSucceeded,
} from '@/lib/ai/portal-tool-history';

describe('portal tool history', () => {
  it('recognizes object and serialized application errors', () => {
    expect(getPortalToolError({ error: 'Website not found' })).toBe('Website not found');
    expect(getPortalToolError('{"error":"Invalid website ID"}')).toBe('Invalid website ID');
    expect(portalToolCallSucceeded({ websiteId: 12 })).toBe(true);
    expect(portalToolCallSucceeded('not json')).toBe(true);
  });

  it('adds only failed assistant tool calls to later model context', () => {
    const calls = [
      { name: 'get_my_websites', input: {}, result: [] },
      {
        name: 'create_website_page',
        input: { website_id: 0 },
        result: '{"error":"Website not found"}',
      },
    ];

    expect(enrichPortalHistoryContent('assistant', 'I could not create it.', calls))
      .toContain('create_website_page: Website not found');
    expect(enrichPortalHistoryContent('assistant', 'I could not create it.', calls))
      .not.toContain('get_my_websites');
    expect(enrichPortalHistoryContent('user', 'yes', calls)).toBe('yes');
  });

  it('sanitizes error details before they return to model context', () => {
    const content = enrichPortalHistoryContent('assistant', 'Failed.', [
      {
        name: 'unsafe_tool',
        input: {},
        result: { error: 'api_key: sk-1234567890abcdefghijklmnop' }, // pragma: allowlist secret
      },
    ]);

    expect(content).not.toContain('sk-1234567890abcdefghijklmnop'); // pragma: allowlist secret
  });
});
