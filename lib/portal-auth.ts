import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients, clientMembers, clientWebsites } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient, resolveClientSite, resolvePortalSite, getPortalRole } from '@/lib/portal-client';
import { resolvePortalFromCurrentRequest, hasScope } from '@/lib/mcp-auth';
import { requiredScopeFor } from '@/lib/oauth/required-scope';
import { NextResponse } from 'next/server';

// OAuth scope enforcement (AUTH79-011): bearer tokens (sd_oauth_/sd_mcp_) carry
// the consented `scopes`; session logins don't (the user IS the user). Scope is
// enforced ONLY on the bearer path. The required scope is derived from the
// (requireService, action) each route already declares — see
// lib/oauth/required-scope.ts.

export type PortalAction = 'read' | 'write' | 'admin' | 'owner';

export type PortalRole = 'owner' | 'admin' | 'member' | 'viewer';

// Exported so the MCP surface enforces the SAME ladder as the REST routes rather
// than growing a second, drifting copy — see lib/mcp/client-scope.ts#roleDenial.
export const ROLE_LEVELS: Record<PortalRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export const ACTION_REQUIRED_LEVEL: Record<PortalAction, number> = {
  read: 0,    // viewer+
  write: 1,   // member+
  admin: 2,   // admin+
  owner: 3,   // owner only
};

interface AuthorizeResult {
  client: typeof clients.$inferSelect;
  userId: number;
  role: PortalRole;
}

interface AuthorizeError {
  response: NextResponse;
}

/**
 * Role/action gate shared by authorizePortal and authorizePortalSite. Returns an
 * AuthorizeError when the role is insufficient, or null when allowed.
 *
 * Enforcement is ON BY DEFAULT. Newly-guarded routes (the AUTH79-020 rollout)
 * pass `observe=true`, which makes them eligible for the log-only opt-out:
 * setting `AUTH_ROLE_ENFORCE=0` logs the would-be denial and allows it. Routes
 * that already enforced roles (the original authorizePortal callers) pass
 * observe=false and always hard-enforce regardless of the env var.
 *
 * Only explicitly-lower roles are denied (a viewer attempting a write, etc.);
 * a role that cannot be resolved never reaches this gate as a denial.
 */
function roleGate(
  role: PortalRole,
  action: PortalAction,
  observe: boolean,
  ctx: { clientId: number; userId: number },
): AuthorizeError | null {
  if (ROLE_LEVELS[role] >= ACTION_REQUIRED_LEVEL[action]) return null;
  if (observe && process.env.AUTH_ROLE_ENFORCE === '0') {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'portal.role.insufficient',
        role,
        action,
        clientId: ctx.clientId,
        userId: ctx.userId,
        enforced: false,
      }),
    );
    return null;
  }
  const actionLabels: Record<PortalAction, string> = {
    read: 'view this resource',
    write: 'create or edit content',
    admin: 'manage team or billing settings',
    owner: 'perform this action (owner only)',
  };
  return {
    response: NextResponse.json(
      {
        success: false,
        message: `Permission denied. Your role (${role}) cannot ${actionLabels[action]}.`,
      },
      { status: 403 },
    ),
  };
}

/**
 * Centralized portal authorization.
 *
 * @param opts.action - Required permission level (default: 'read')
 * @param opts.requireService - Service category that must be subscribed (or bundle)
 * @param opts.scope - Explicit OAuth scope this route requires (for routes with no
 *   requireService). When omitted, the scope is derived from requireService+action.
 * @param opts.observeRole - Marks a newly-guarded route (AUTH79-020) as eligible
 *   for the log-only opt-out: enforcement is on by default, but `AUTH_ROLE_ENFORCE=0`
 *   logs an insufficient role and allows it. Omit on routes that always enforce.
 */
export async function authorizePortal(opts?: {
  action?: PortalAction;
  requireService?: string;
  scope?: string;
  observeRole?: boolean;
}): Promise<AuthorizeResult | AuthorizeError> {
  // ── Bearer-token path (mobile / API clients) ────────────────────────────
  // The mobile client sends `Authorization: Bearer sd_mcp_…` after a
  // successful /api/portal/auth/mobile-sign-in. Bearer tokens are bound to a
  // specific client at issuance time, so we skip the multi-tenant
  // `getPortalClient(userId)` lookup and use whichever client the key was
  // minted against — same shape the legacy session path returns.
  const bearer = await resolvePortalFromCurrentRequest();
  let userId: number;
  let client: typeof clients.$inferSelect;
  if (bearer) {
    userId = bearer.userId;
    client = bearer.client;
  } else {
    const session = await auth();
    if (!session?.user?.id) {
      return { response: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
    }
    userId = parseInt(session.user.id, 10);
    const resolved = await getPortalClient(userId);
    if (!resolved) {
      return { response: NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 }) };
    }
    client = resolved;
  }

  // A bearer key remains usable only while its user is active and still belongs
  // to this client. MCP target selection has its own membership intersection;
  // this check closes the legacy REST paths that previously fell back to viewer.
  if (bearer && !(await getPortalRole(userId, client.id))) {
    return { response: NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 }) };
  }

  // OAuth consent scopes are enforced by default in production. AUTH_SCOPE_ENFORCE=0
  // is an explicit temporary rollback switch; local/dev remains log-only unless
  // AUTH_SCOPE_ENFORCE=1. OAuth routes without a declared scope fail closed in
  // production, so they cannot silently become unrestricted during rollout.
  if (bearer) {
    const requiredScope = requiredScopeFor(opts);
    const oauthScopeMissing =
      bearer.credentialKind === 'oauth_access_token' && requiredScope === null;
    const insufficientScope = requiredScope !== null && !hasScope(bearer.scopes, requiredScope);
    const enforceScopes = process.env.AUTH_SCOPE_ENFORCE === '1' ||
      (process.env.NODE_ENV === 'production' && process.env.AUTH_SCOPE_ENFORCE !== '0');

    if (oauthScopeMissing || insufficientScope) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: oauthScopeMissing ? 'oauth.scope.unconfigured' : 'oauth.scope.insufficient',
          keyId: bearer.keyId,
          required_scope: requiredScope,
          granted_scopes: bearer.scopes,
          clientId: client.id,
          userId,
          enforced: enforceScopes,
        }),
      );
      if (enforceScopes) {
        return {
          response: NextResponse.json(
            {
              success: false,
              error: oauthScopeMissing ? 'route_scope_unconfigured' : 'insufficient_scope',
              ...(requiredScope ? { required_scope: requiredScope } : {}),
            },
            { status: 403 },
          ),
        };
      }
    }
  }

  // Resolve role + gate the action (enforced by default; observeRole routes can
  // be relaxed to log-only with AUTH_ROLE_ENFORCE=0).
  const role = await resolveRole(userId, client);
  const gate = roleGate(role, opts?.action ?? 'read', opts?.observeRole ?? false, {
    clientId: client.id,
    userId,
  });
  if (gate) return gate;

  // Check service subscription
  if (opts?.requireService) {
    const hasAccess = await hasServiceAccess(client.id, opts.requireService);
    if (!hasAccess) {
      return {
        response: NextResponse.json({
          success: false,
          message: `This feature requires an active ${opts.requireService} subscription.`,
          requiresService: opts.requireService,
          upsellUrl: '/portal/services',
        }, { status: 403 }),
      };
    }
  }

  return { client, userId, role };
}

/**
 * Type guard to check if authorizePortal returned an error.
 */
export function isAuthError<T extends object>(result: T | AuthorizeError): result is AuthorizeError {
  return 'response' in result;
}

interface AuthorizeSiteResult {
  site: typeof clientWebsites.$inferSelect;
  userId: number;
  role: PortalRole;
}

/**
 * Site-scoped authorization for `app/api/portal/websites/[siteId]/**` routes.
 * Resolves the `[siteId]` with ownership (existing behavior, via resolveClientSite)
 * AND gates the caller's role (new — AUTH79-020). Session-only: these routes don't
 * accept bearer tokens. Every caller is a newly-guarded route, so they default to
 * observeRole=true — eligible for the AUTH_ROLE_ENFORCE=0 log-only opt-out;
 * enforcement is the default.
 */
export async function authorizePortalSite(opts: {
  siteId: number;
  action?: PortalAction;
  observeRole?: boolean;
}): Promise<AuthorizeSiteResult | AuthorizeError> {
  const session = await auth();
  if (!session?.user?.id) {
    return { response: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
  }
  const userId = parseInt(session.user.id, 10);

  // resolvePortalSite resolves the site across ALL of the user's clients (not just
  // the active one), so a cross-client deep-link still works. Role is checked
  // against the OWNING client, not the active one.
  const resolved = await resolvePortalSite(userId, opts.siteId);
  if (!resolved) {
    return { response: NextResponse.json({ success: false, message: 'Website not found' }, { status: 404 }) };
  }
  const { site, client } = resolved;

  const role = await getPortalRole(userId, client.id);
  if (!role) {
    return { response: NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 }) };
  }

  const gate = roleGate(role, opts.action ?? 'read', opts.observeRole ?? true, {
    clientId: client.id,
    userId,
  });
  if (gate) return gate;

  return { site, userId, role };
}

/**
 * Resolve a user's site like `resolveClientSite`, but ALSO require the owning
 * client to have an active `store` subscription (bundle-aware via
 * `hasServiceAccess`). Returns null if the site isn't the user's OR the client
 * isn't store-entitled — so store sub-resource routes that swap
 * `resolveClientSite` → `resolveStoreSite` get a billing gate for free: an
 * unsubscribed client falls through the route's existing not-found path.
 * Closes the broad store-REST entitlement gap (distill finding #1, part 3).
 */
export async function resolveStoreSite(userId: number, siteId: number, preferredClientId?: number) {
  const site = await resolveClientSite(userId, siteId, preferredClientId);
  if (!site) return null;
  if (!(await hasServiceAccess(site.clientId, 'store'))) return null;
  return site;
}

/**
 * Resolve the user's role for a given client.
 */
async function resolveRole(userId: number, client: typeof clients.$inferSelect): Promise<PortalRole> {
  // Direct owner check
  if (client.userId === userId) return 'owner';

  // Team membership check
  const [membership] = await db
    .select({ role: clientMembers.role })
    .from(clientMembers)
    .where(and(eq(clientMembers.clientId, client.id), eq(clientMembers.userId, userId)))
    .limit(1);

  return (membership?.role as PortalRole) ?? 'viewer';
}

/**
 * Keep the service-gate call signature while platform billing is disabled.
 * Subscription status does not currently restrict access to product modules.
 */
export async function hasServiceAccess(_clientId: number, _category: string): Promise<boolean> {
  // Payments and subscription gates are disabled by product policy. Keep this
  // explicit so callers and customer-facing docs do not imply paid access.
  return true;
}

/**
 * OBQA-021: 'booking' (the gate literal at every booking/gift-certificate
 * route and MCP tool) and 'bookings' (the billed catalog row from
 * seed-domain-modules) name the same module — a paying 'bookings' subscriber
 * must clear a `requireService: 'booking'` gate. Alias the pair here, where
 * every gate routes through, rather than flipping 42 call-site literals
 * (legacy dev seeds still mint the singular row).
 */
export function serviceCategoryMatches(subscribed: string, wanted: string): boolean {
  if (subscribed === 'bundle') return true;
  const norm = (c: string) => (c === 'booking' ? 'bookings' : c);
  return norm(subscribed) === norm(wanted);
}
