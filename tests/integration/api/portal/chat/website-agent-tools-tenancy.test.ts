import { describe, expect, it } from 'vitest';
import { cmsHandlers } from '@/lib/ai/portal-tools/cms';
import { sessionForNewClientUser } from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';

describe('portal Website agent tools @chat @agent @tenancy', () => {
  it('creates separate tenant websites and rejects cross-tenant page creation', async () => {
    const tenantA = await sessionForNewClientUser('agent-website-a');
    const tenantB = await sessionForNewClientUser('agent-website-b');
    const name = `Orange Juicers ${crypto.randomUUID()}`;

    const siteA = await cmsHandlers.create_website(
      { name, description: 'Tenant A catalogue' },
      tenantA.client.id,
      tenantA.user.id,
    ) as { websiteId: number; created: boolean };
    const siteB = await cmsHandlers.create_website(
      { name, description: 'Tenant B catalogue' },
      tenantB.client.id,
      tenantB.user.id,
    ) as { websiteId: number; created: boolean };

    expect(siteA.created).toBe(true);
    expect(siteB.created).toBe(true);
    expect(siteA.websiteId).not.toBe(siteB.websiteId);

    await expect(cmsHandlers.create_website_page(
      {
        website_id: siteA.websiteId,
        title: 'Foreign page',
        slug: 'foreign-page',
        post_type: 'page',
      },
      tenantB.client.id,
      tenantB.user.id,
    )).resolves.toEqual({ error: 'Website not found' });

    const ownPage = await cmsHandlers.create_website_page(
      {
        website_id: siteA.websiteId,
        title: 'Orange Juicing Machines',
        slug: 'orange-juicing-machines',
        post_type: 'landing',
        published: true,
      },
      tenantA.client.id,
      tenantA.user.id,
    ) as { success: boolean; postId: number; message: string };

    expect(ownPage).toMatchObject({ success: true });
    expect(ownPage.message).toContain('as draft');

    const sql = getTestSql();
    const [storedSite] = await sql<{ client_id: number }[]>`
      SELECT client_id
      FROM ${sql(TEST_SCHEMA)}.client_websites
      WHERE id = ${siteA.websiteId}
    `;
    const [storedPage] = await sql<{ published: boolean; published_at: Date | null }[]>`
      SELECT published, published_at
      FROM ${sql(TEST_SCHEMA)}.posts
      WHERE id = ${ownPage.postId}
    `;

    expect(storedSite.client_id).toBe(tenantA.client.id);
    expect(storedPage).toEqual({ published: false, published_at: null });
  });
});
