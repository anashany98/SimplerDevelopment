/**
 * Company Brain service entitlement.
 *
 * Brain access resolves through the canonical client-entitlement helper
 * ({@link isEntitledToDomain} → `lib/billing/entitlements.ts`), which covers
 * every lane in one place:
 *   1. `billingMode = 'agency'` (legacy default) bypasses module gating.
 *   2. An active `'bundle'` row grants everything.
 *   3. A legacy `'subscription'` row grants everything.
 *   4. A plan-tier row grants the tier's curated domain set.
 *   5. An active `'brain'` SKU row grants brain.
 *   6. `clients.brainTrialUntil > now()` grants brain (PLG trial).
 *   7. When `PAYMENTS_DISABLED` is true, paid subscriptions do not gate portal modules.
 *
 * Test bypasses (kept for integration specs that don't seed subscriptions):
 *   - `BRAIN_ENTITLEMENT_BYPASS=1`, or
 *   - `process.env.VITEST` / `VITEST_POOL_ID` set.
 *
 * Use {@link isBrainEntitled} at the page/layout level and
 * {@link requireBrainEntitlement} from API routes — the latter returns a
 * `NextResponse` with a `402 Payment Required` envelope when the client is
 * not entitled.
 *
 * Rollout complete: every authenticated `/api/portal/brain/**` route now calls
 * `requireBrainEntitlement` directly. The cron handler at
 * `/api/cron/brain-daily-notes` is intentionally unauthenticated — entitlement
 * is checked per-tenant inside the loop, not at the route boundary.
 */

import { NextResponse } from 'next/server';
import { clients } from '@/lib/db/schema';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { isEntitledToDomain } from '@/lib/billing/entitlements';

type Client = typeof clients.$inferSelect;
type PortalRole = 'owner' | 'admin' | 'member' | 'viewer';

export const BRAIN_SERVICE_CATEGORY = 'brain' as const;

/**
 * True when the test runner is hosting this process. Avoids requiring every
 * brain integration spec to seed a `brain` SKU + `client_services` row.
 */
function isTestRuntime(): boolean {
  if (process.env.BRAIN_ENTITLEMENT_BYPASS === '1') return true;
  if (process.env.VITEST === 'true' || process.env.VITEST === '1') return true;
  if (process.env.VITEST_POOL_ID !== undefined) return true;
  return false;
}

/**
 * Returns true if the client can access Brain: an active `brain` /
 * `bundle` / legacy-subscription row, a plan tier that includes brain, an
 * active self-serve trial (`clients.brainTrialUntil > now()`), an agency-mode
 * client, payments-disabled module access, or a runtime test bypass.
 */
export async function isBrainEntitled(clientId: number): Promise<boolean> {
  if (isTestRuntime()) return true;

  // Canonical resolution — see module docstring. The old hand-rolled check
  // here ignored agency mode and paywalled clients the platform considers
  // fully entitled (the same bug class as app/portal/email/layout.tsx).
  return isEntitledToDomain(clientId, 'brain');
}

/**
 * The shape returned to API callers when they hit a brain endpoint without
 * an active subscription. Mirrors the `{ success, message }` envelope the rest
 * of the portal uses, plus a stable `code` + upsell metadata so the UI can
 * render a "Buy Brain" CTA without parsing strings.
 */
export interface BrainEntitlementError {
  success: false;
  code: 'BRAIN_NOT_ENTITLED';
  message: string;
  requiresService: typeof BRAIN_SERVICE_CATEGORY;
  upsellUrl: string;
}

/**
 * Auth-and-entitlement guard for brain API routes.
 *
 * Usage:
 *   const result = await requireBrainEntitlement();
 *   if ('response' in result) return result.response;
 *   const { client, userId } = result;
 *
 * Layered on top of {@link authorizePortal} — auth + role checks happen first,
 * then we verify the brain SKU. Returns 402 (rather than the 403 that
 * `authorizePortal({requireService})` returns) so the client can distinguish
 * "you can't access this regardless of payment" from "pay to unlock".
 */
export async function requireBrainEntitlement(opts?: {
  action?: 'read' | 'write' | 'admin' | 'owner';
}): Promise<
  | { client: Client; userId: number; role: PortalRole }
  | { response: NextResponse }
> {
  // Brain routes don't set requireService (they gate on the brain SKU below),
  // so pass the brain scope explicitly for OAuth scope enforcement (AUTH79-011).
  const action = opts?.action ?? 'read';
  const authed = await authorizePortal({
    action,
    scope: action === 'read' ? 'brain:read' : 'brain:write',
  });
  if (isAuthError(authed)) return { response: authed.response };

  const entitled = await isBrainEntitled(authed.client.id);
  if (!entitled) {
    const body: BrainEntitlementError = {
      success: false,
      code: 'BRAIN_NOT_ENTITLED',
      message: 'Company Brain requires an active subscription. Visit /portal/services to subscribe.',
      requiresService: BRAIN_SERVICE_CATEGORY,
      upsellUrl: '/portal/brain',
    };
    return { response: NextResponse.json(body, { status: 402 }) };
  }

  return { client: authed.client, userId: authed.userId, role: authed.role as PortalRole };
}
