/**
 * Entitlement resolution regression for lib/billing/entitlements.ts.
 *
 * getClientEntitlements is the money gate: it decides which feature domains
 * a client may use. A regression here either gives away paid modules or
 * locks paying clients out — both are billing incidents. Covers:
 *   - agency (legacy) mode bypasses gating entirely
 *   - saas with no services grants nothing
 *   - a single active module row grants exactly that domain
 *   - bundle grants everything
 *   - brain trial grants brain while in the future, nothing once expired
 *   - byokEligibleOverride grants BYOK eligibility without a Scale tier
 *   - isEntitledToDomain mirrors the set membership
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { getClientEntitlements, isEntitledToDomain } from '@/lib/billing/entitlements';
import { FEATURE_DOMAINS } from '@/lib/billing/domain-catalog';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

const ALL_KEYS = FEATURE_DOMAINS.map((d) => d.key);

async function setBillingMode(clientId: number, mode: string): Promise<void> {
  const sql = getTestSql();
  await sql`UPDATE ${sql(TEST_SCHEMA)}.clients SET billing_mode = ${mode} WHERE id = ${clientId}`;
}

async function setBrainTrial(clientId: number, until: Date | null): Promise<void> {
  const sql = getTestSql();
  await sql`UPDATE ${sql(TEST_SCHEMA)}.clients SET brain_trial_until = ${until as unknown as string} WHERE id = ${clientId}`;
}

async function setByokOverride(clientId: number, value: boolean | null): Promise<void> {
  const sql = getTestSql();
  await sql`UPDATE ${sql(TEST_SCHEMA)}.clients SET byok_eligible_override = ${value as unknown as string} WHERE id = ${clientId}`;
}

async function grantService(clientId: number, category: string): Promise<void> {
  const sql = getTestSql();
  const slug = `module-${category}-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
  const [svc] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.services (name, slug, category, price)
    VALUES (${category}, ${slug}, ${category}, 100)
    RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_services (client_id, service_id, status)
    VALUES (${clientId}, ${svc.id}, 'active')
  `;
}

let T: TenantCtx;

beforeEach(async () => {
  T = await sessionForNewClientUser('ent');
});

describe('getClientEntitlements @billing', () => {
  it('agency mode bypasses gating with full access', async () => {
    const ent = await getClientEntitlements(T.client.id);
    expect(ent.mode).toBe('agency');
    expect(ent.gatingBypassed).toBe(true);
    expect(ent.byokEligible).toBe(true);
    for (const key of ALL_KEYS) expect(ent.domains.has(key)).toBe(true);
  });

  it('saas with no services grants nothing and gates', async () => {
    await setBillingMode(T.client.id, 'saas');
    const ent = await getClientEntitlements(T.client.id);
    expect(ent.mode).toBe('saas');
    expect(ent.gatingBypassed).toBe(false);
    expect(ent.hasBundle).toBe(false);
    expect(ent.byokEligible).toBe(false);
    expect(ent.domains.size).toBe(0);
  });

  it('a single active module row grants exactly that domain', async () => {
    await setBillingMode(T.client.id, 'saas');
    await grantService(T.client.id, 'crm');
    const ent = await getClientEntitlements(T.client.id);
    expect(ent.domains.has('crm')).toBe(true);
    expect(ent.domains.has('brain')).toBe(false);
    expect(ent.domains.has('email')).toBe(false);
  });

  it('bundle grants every domain', async () => {
    await setBillingMode(T.client.id, 'saas');
    await grantService(T.client.id, 'bundle');
    const ent = await getClientEntitlements(T.client.id);
    expect(ent.hasBundle).toBe(true);
    for (const key of ALL_KEYS) expect(ent.domains.has(key)).toBe(true);
  });

  it('brain trial grants brain only while in the future', async () => {
    await setBillingMode(T.client.id, 'saas');
    await setBrainTrial(T.client.id, new Date(Date.now() + 24 * 60 * 60 * 1000));
    let ent = await getClientEntitlements(T.client.id);
    expect(ent.domains.has('brain')).toBe(true);
    expect(ent.domains.size).toBe(1);

    await setBrainTrial(T.client.id, new Date(Date.now() - 1000));
    ent = await getClientEntitlements(T.client.id);
    expect(ent.domains.has('brain')).toBe(false);
  });

  it('byokEligibleOverride grants BYOK eligibility without a tier', async () => {
    await setBillingMode(T.client.id, 'saas');
    await setByokOverride(T.client.id, true);
    const ent = await getClientEntitlements(T.client.id);
    expect(ent.byokEligible).toBe(true);
    // Override grants eligibility only — not module access.
    expect(ent.domains.size).toBe(0);
  });

  it('isEntitledToDomain mirrors set membership', async () => {
    await setBillingMode(T.client.id, 'saas');
    await grantService(T.client.id, 'email');
    expect(await isEntitledToDomain(T.client.id, 'email')).toBe(true);
    expect(await isEntitledToDomain(T.client.id, 'crm')).toBe(false);
  });

  it('preloaded client row skips the clients lookup', async () => {
    const ent = await getClientEntitlements(T.client.id, {
      billingMode: 'agency',
      brainTrialUntil: null,
    });
    expect(ent.gatingBypassed).toBe(true);
  });
});
