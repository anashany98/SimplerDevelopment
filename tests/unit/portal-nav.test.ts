// @vitest-environment node
/**
 * Pure unit tests for `lib/portal-nav.ts` — specifically the `apps` injection
 * branch added by Worker 3C of the plugin-registry rollout. No DB, no
 * network: every fixture is constructed in-process so a CI failure here
 * narrowly indicts the nav builder.
 */

import { describe, it, expect } from 'vitest';
import { buildPortalNavItems, flattenPortalNav } from '@/lib/portal-nav';
import type { UserAppNavMeta } from '@/lib/plugins/load-user-apps';

const APP_FIXTURE: UserAppNavMeta = {
  slug: 'content-tools',
  name: 'Content Tools',
  icon: 'science',
  manifestStale: false,
  navItems: [
    { label: 'Dashboard', href: '/', icon: 'dashboard' },
    { label: 'Research briefs', href: '/briefs', icon: 'biotech', keywords: ['research'] },
    { label: 'Schedules', href: '/schedules', icon: 'schedule' },
  ],
};

const SECOND_APP_FIXTURE: UserAppNavMeta = {
  slug: 'analytics-pro',
  name: 'Analytics Pro',
  icon: 'analytics',
  manifestStale: false,
  navItems: [{ label: 'Overview', href: '/overview', icon: 'dashboard' }],
};

describe('buildPortalNavItems — no apps arg (legacy callers)', () => {
  it('includes a direct Chat entry for the AI assistant', () => {
    const items = buildPortalNavItems(null, null);
    expect(items).toContainEqual(expect.objectContaining({
      href: '/portal/chat',
      label: 'Chat',
      icon: 'chat',
      exact: true,
    }));
  });

  it('returns the existing nav tree unmodified when called with 2 args', () => {
    const items = buildPortalNavItems(null, null);
    expect(items.some((i) => i.label === 'Aplicaciones')).toBe(false);
    expect(items.at(-1)?.href).toBe('/portal/settings');
  });

  it('returns the existing nav tree unmodified when apps is undefined', () => {
    const items = buildPortalNavItems(null, null, undefined);
    expect(items.some((i) => i.label === 'Aplicaciones')).toBe(false);
  });

  it('returns the existing nav tree unmodified when apps is an empty array', () => {
    const items = buildPortalNavItems(null, null, []);
    expect(items.some((i) => i.label === 'Aplicaciones')).toBe(false);
  });
});

describe('buildPortalNavItems — apps injection', () => {
  it('inserts an "Apps" top-level item when apps are supplied', () => {
    const items = buildPortalNavItems(null, null, [APP_FIXTURE]);
    const appsItem = items.find((i) => i.label === 'Aplicaciones');
    expect(appsItem).toBeDefined();
    expect(appsItem!.href).toBe('/portal/apps');
    expect(appsItem!.icon).toBe('apps');
  });

  it('places "Apps" directly before "Settings"', () => {
    const items = buildPortalNavItems(null, null, [APP_FIXTURE]);
    const appsIdx = items.findIndex((i) => i.label === 'Aplicaciones');
    const settingsIdx = items.findIndex((i) => i.href === '/portal/settings');
    expect(appsIdx).toBeGreaterThan(-1);
    expect(settingsIdx).toBeGreaterThan(-1);
    expect(settingsIdx - appsIdx).toBe(1);
  });

  it('Settings remains the final item after injection', () => {
    const items = buildPortalNavItems(null, null, [APP_FIXTURE, SECOND_APP_FIXTURE]);
    expect(items.at(-1)?.href).toBe('/portal/settings');
  });

  it("each app appears as a child of 'Aplicaciones' with the slug-root href", () => {
    const items = buildPortalNavItems(null, null, [APP_FIXTURE, SECOND_APP_FIXTURE]);
    const apps = items.find((i) => i.label === 'Aplicaciones');
    expect(apps?.children).toHaveLength(2);
    const slugs = apps!.children!.map((c) => c.href);
    expect(slugs).toContain('/portal/apps/content-tools');
    expect(slugs).toContain('/portal/apps/analytics-pro');
  });

  it("each app's children include the slug-root AND the manifest nav items as grandchildren", () => {
    const items = buildPortalNavItems(null, null, [APP_FIXTURE]);
    const apps = items.find((i) => i.label === 'Aplicaciones');
    const pc = apps!.children!.find((c) => c.href === '/portal/apps/content-tools');
    expect(pc).toBeDefined();
    expect(pc!.label).toBe('Content Tools');
    expect(pc!.icon).toBe('science');

    // The grandchildren are the manifest nav items, rewritten under /portal/apps/<slug>
    const grandchildren = pc!.children ?? [];
    expect(grandchildren).toHaveLength(3);
    const hrefs = grandchildren.map((g) => g.href);
    // Bare '/' collapses to just the slug root rather than '/content-tools/'
    expect(hrefs).toContain('/portal/apps/content-tools');
    expect(hrefs).toContain('/portal/apps/content-tools/briefs');
    expect(hrefs).toContain('/portal/apps/content-tools/schedules');
  });

  it('preserves manifest icons + keywords on the grandchildren', () => {
    const items = buildPortalNavItems(null, null, [APP_FIXTURE]);
    const apps = items.find((i) => i.label === 'Aplicaciones');
    const pc = apps!.children!.find((c) => c.href === '/portal/apps/content-tools');
    const briefs = pc!.children!.find((g) => g.href === '/portal/apps/content-tools/briefs');
    expect(briefs?.icon).toBe('biotech');
    expect(briefs?.keywords).toEqual(['research']);
  });

  it('does not remove or rename any existing nav item', () => {
    const baseline = buildPortalNavItems(null, null);
    const withApps = buildPortalNavItems(null, null, [APP_FIXTURE]);

    // Every baseline href still exists after injection
    const baselineHrefs = baseline.map((i) => i.href);
    const withAppsHrefs = withApps.map((i) => i.href);
    for (const href of baselineHrefs) {
      expect(withAppsHrefs).toContain(href);
    }

    // Net change is exactly +1 top-level item (the Apps group)
    expect(withApps.length - baseline.length).toBe(1);
  });

  it('uses the app slug as a cmd-K keyword on the app-level child', () => {
    const items = buildPortalNavItems(null, null, [APP_FIXTURE]);
    const apps = items.find((i) => i.label === 'Aplicaciones');
    const pc = apps!.children!.find((c) => c.href === '/portal/apps/content-tools');
    expect(pc?.keywords).toContain('content-tools');
  });

  it('"Aplicaciones" top-level entry carries cmd-K keywords for discoverability', () => {
    const items = buildPortalNavItems(null, null, [APP_FIXTURE]);
    const apps = items.find((i) => i.label === 'Aplicaciones');
    expect(apps?.keywords).toEqual(expect.arrayContaining(['plugins', 'integrations']));
  });
});

// ─── Reorganized IA (Brain subgroups + cross-group moves) ───────────────────

describe('buildPortalNavItems — reorganized IA', () => {
  const items = buildPortalNavItems(null, null);
  const byLabel = (label: string) => items.find((i) => i.label === label);

  it('sub-groups Brain children with non-clickable section headers', () => {
    const brain = byLabel('Cerebro de empresa');
    const headers = brain!.children!.filter((c) => c.groupHeader).map((c) => c.label);
    expect(headers).toEqual(['Trabajo', 'Conocimiento', 'Equipo', 'IA y automatización']);
    for (const h of brain!.children!.filter((c) => c.groupHeader)) {
      expect(h.href).toBe('');
      expect(h.groupHeader).toBe(true);
    }
  });

  it('keeps knowledge items inside the Conocimiento section (not Equipo)', () => {
    const kids = byLabel('Cerebro de empresa')!.children!;
    const start = kids.findIndex((c) => c.groupHeader && c.label === 'Conocimiento');
    const end = kids.findIndex((c) => c.groupHeader && c.label === 'Equipo');
    expect(kids.slice(start + 1, end).map((c) => c.href)).toEqual([
      '/portal/brain/knowledge',
      '/portal/brain/decisions',
      '/portal/brain/topics',
      '/portal/brain/glossary',
      '/portal/brain/documents',
      '/portal/brain/documents/queue',
      '/portal/brain/templates',
    ]);
  });

  it('shortens the playbook-runs label to avoid sidebar truncation', () => {
    const brain = byLabel('Cerebro de empresa');
    const runs = brain!.children!.find((c) => c.href === '/portal/brain/playbook-runs');
    expect(runs?.label).toBe('Ejecuciones');
  });

  it('moves Propuestas + Pitch decks into CRM (sales surfaces)', () => {
    const crmHrefs = byLabel('CRM')!.children!.map((c) => c.href);
    expect(crmHrefs).toContain('/portal/crm/proposals');
    expect(crmHrefs).toContain('/portal/tools/pitch-decks');
    const marketingHrefs = byLabel('Marketing')!.children!.map((c) => c.href);
    expect(marketingHrefs).not.toContain('/portal/crm/proposals');
    expect(marketingHrefs).not.toContain('/portal/tools/pitch-decks');
  });

  it('moves Marca y mensajes from Brain into Marketing', () => {
    expect(byLabel('Cerebro de empresa')!.children!.some((c) => c.href === '/portal/branding')).toBe(false);
    expect(byLabel('Marketing')!.children!.some((c) => c.href === '/portal/branding')).toBe(true);
  });

  it('renames the inbox entry to "Bandeja de entrada"', () => {
    const inbox = byLabel('Soporte')!.children!.find((c) => c.href === '/portal/inbox');
    expect(inbox?.label).toBe('Bandeja de entrada');
  });

  it('moves Servicios + Hosting from Facturación into Agencia', () => {
    const billingHrefs = byLabel('Facturación')!.children!.map((c) => c.href);
    expect(billingHrefs).not.toContain('/portal/services');
    expect(billingHrefs).not.toContain('/portal/hosting');
    const agencyHrefs = byLabel('Agencia')!.children!.map((c) => c.href);
    expect(agencyHrefs).toContain('/portal/services');
    expect(agencyHrefs).toContain('/portal/hosting');
  });
});

describe('flattenPortalNav — skips section labels', () => {
  it('never emits groupHeader entries as palette targets', () => {
    const targets = flattenPortalNav(buildPortalNavItems(null, null));
    expect(targets.some((t) => t.label === 'Trabajo' || t.label === 'IA y automatización')).toBe(false);
    expect(targets.every((t) => t.href.startsWith('/'))).toBe(true);
  });
});
