// @vitest-environment node
/**
 * Unit tests for lib/billing/domain-catalog.ts — the pricing/math core.
 *
 * Pure module (no DB): sum/volume/seat math, tier resolution, domain
 * lookups, BYOK provider sets, plus catalog-integrity invariants (unique
 * keys/slugs, slug convention). Money math — rounding and tier thresholds
 * are pinned exactly.
 */
import { describe, it, expect } from 'vitest';
import {
  FEATURE_DOMAINS,
  BUNDLE,
  VOLUME_TIERS,
  TIERS,
  sumOfModulePricesCents,
  volumeTierFor,
  nextVolumeTier,
  applyVolumeDiscount,
  discountedModuleCents,
  computeAccountBilling,
  getTierByCategory,
  tierDomainKeys,
  getDomainByKey,
  getDomainForPath,
  requiredByokProviders,
  allByokProviders,
  SEAT_PRICE_CAP_CENTS,
  INCLUDED_SEATS,
} from '@/lib/billing/domain-catalog';

describe('sumOfModulePricesCents', () => {
  it('equals the sum of all module prices and sits above the bundle price', () => {
    const sum = sumOfModulePricesCents();
    expect(sum).toBe(FEATURE_DOMAINS.reduce((s, d) => s + d.monthlyPriceCents, 0));
    expect(sum).toBeGreaterThan(0);
    // Bundle bakes in ~40% off buying separately.
    expect(BUNDLE.monthlyPriceCents).toBeLessThan(sum);
  });
});

describe('volumeTierFor / nextVolumeTier', () => {
  it('returns null below the first threshold', () => {
    expect(volumeTierFor(0)).toBeNull();
    expect(volumeTierFor(3)).toBeNull();
  });
  it.each([
    [4, 10],
    [7, 10],
    [8, 20],
    [11, 20],
    [12, 40],
    [13, 46],
    [100, 46],
  ])('grants %i%% off at %i modules', (count, pct) => {
    expect(volumeTierFor(count)?.percentOff).toBe(pct);
  });
  it('points at the next threshold for upgrade nudges', () => {
    expect(nextVolumeTier(0)?.minModules).toBe(4);
    expect(nextVolumeTier(4)?.minModules).toBe(8);
    expect(nextVolumeTier(12)?.minModules).toBe(13);
    expect(nextVolumeTier(13)).toBeNull();
    expect(nextVolumeTier(100)).toBeNull();
  });
  it('keeps thresholds sorted highest-first', () => {
    const mins = VOLUME_TIERS.map((t) => t.minModules);
    expect(mins).toEqual([...mins].sort((a, b) => b - a));
  });
});

describe('applyVolumeDiscount / discountedModuleCents', () => {
  it('discounts the subtotal by the unlocked tier', () => {
    expect(applyVolumeDiscount(10_000, 4)).toEqual({ discountPercent: 10, discountCents: 1_000, totalCents: 9_000 });
    expect(applyVolumeDiscount(10_000, 0)).toEqual({ discountPercent: 0, discountCents: 0, totalCents: 10_000 });
  });
  it('rounds per-module charges to whole cents', () => {
    expect(discountedModuleCents(2_500, 10)).toBe(2_250);
    expect(discountedModuleCents(199, 10)).toBe(179); // 179.1 → 179
    expect(discountedModuleCents(1_900, 0)).toBe(1_900);
  });
});

describe('computeAccountBilling', () => {
  it('bills modules only with a single (included) seat', () => {
    const b = computeAccountBilling([2_500, 1_900], 1);
    expect(b.discountPercent).toBe(0);
    expect(b.moduleSubtotalCents).toBe(4_400);
    expect(b.additionalSeats).toBe(0);
    expect(b.seatTotalCents).toBe(0);
    expect(b.totalCents).toBe(4_400);
  });
  it('charges additional seats at min(M, cap)', () => {
    const b = computeAccountBilling([2_500, 1_900], 3);
    expect(b.seatUnitCents).toBe(Math.min(4_400, SEAT_PRICE_CAP_CENTS));
    expect(b.additionalSeats).toBe(2);
    expect(b.seatTotalCents).toBe(3_000 * 2);
    expect(b.totalCents).toBe(4_400 + 6_000);
  });
  it('caps the seat unit when the module subtotal is large', () => {
    const b = computeAccountBilling([15_900], 2);
    expect(b.seatUnitCents).toBe(SEAT_PRICE_CAP_CENTS);
  });
  it('applies the volume discount before seating', () => {
    const prices = [2_900, 2_500, 1_900, 1_500]; // 4 modules → 10%
    const b = computeAccountBilling(prices, 1);
    expect(b.discountPercent).toBe(10);
    expect(b.discountedModuleCents).toEqual(prices.map((c) => Math.round(c * 0.9)));
    expect(b.moduleSubtotalCents).toBe(b.discountedModuleCents.reduce((s, c) => s + c, 0));
  });
  it('handles empty modules and zero/negative seat edge cases', () => {
    expect(computeAccountBilling([], 1).totalCents).toBe(0);
    expect(computeAccountBilling([2_500], 0).additionalSeats).toBe(0);
    expect(INCLUDED_SEATS).toBe(1);
  });
});

describe('tiers', () => {
  it('resolves tiers by SKU category and nothing else', () => {
    expect(getTierByCategory('plan-growth')?.key).toBe('growth');
    expect(getTierByCategory('plan-scale')?.byokEligible).toBe(true);
    expect(getTierByCategory('plan-starter')?.byokEligible).toBe(false);
    expect(getTierByCategory('crm')).toBeUndefined();
    expect(getTierByCategory('nope')).toBeUndefined();
  });
  it('expands scale to every module key', () => {
    const scale = TIERS.find((t) => t.key === 'scale')!;
    expect(tierDomainKeys(scale)).toEqual(FEATURE_DOMAINS.map((d) => d.key));
    const starter = TIERS.find((t) => t.key === 'starter')!;
    expect(tierDomainKeys(starter)).toEqual(['websites', 'crm', 'projects']);
  });
});

describe('domain lookups', () => {
  it('finds domains by key', () => {
    expect(getDomainByKey('crm')?.slug).toBe('module-crm');
    expect(getDomainByKey('nope')).toBeUndefined();
  });
  it('matches portal paths by nav prefix', () => {
    expect(getDomainForPath('/portal/crm')?.key).toBe('crm');
    expect(getDomainForPath('/portal/crm/deals/1')?.key).toBe('crm');
    expect(getDomainForPath('/portal/definitely-not-a-module')).toBeUndefined();
  });
});

describe('BYOK providers', () => {
  it('unions providers across subscribed domains', () => {
    expect(requiredByokProviders(['brain', 'email']).sort()).toEqual(
      ['anthropic', 'openai', 'resend'].sort(),
    );
    expect(requiredByokProviders(['crm'])).toEqual([]);
    expect(requiredByokProviders(['unknown-key'])).toEqual([]);
  });
  it('covers every domain in the full checklist', () => {
    const all = allByokProviders();
    for (const d of FEATURE_DOMAINS) {
      for (const p of d.byokProviders) expect(all).toContain(p);
    }
  });
});

describe('catalog integrity', () => {
  it('has unique keys and module slugs following the module-<key> convention', () => {
    const keys = FEATURE_DOMAINS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    const slugs = FEATURE_DOMAINS.map((d) => d.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const d of FEATURE_DOMAINS) {
      expect(d.slug).toBe(`module-${d.key}`);
      expect(d.monthlyPriceCents).toBeGreaterThan(0);
      for (const href of d.navHrefs) expect(href.startsWith('/')).toBe(true);
    }
  });
});
