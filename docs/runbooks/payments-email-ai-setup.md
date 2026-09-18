# Runbook: go live with payments, email and AI

**Unlocks:** real charges (Stripe), real outbound email (Resend), AI features (Anthropic/OpenAI).
**Risk:** money + customer-visible email — wire everything in **test mode first**.
**Suggested order:** domain → email → AI → payments last.

## 0. Prerequisites

- A public **HTTPS domain** pointing at the server. Stripe webhooks and Resend domain
  verification cannot target `IP:3000`. Set it in Coolify → Application → Domains, then
  update `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SITE_URL` and redeploy
  (`NEXT_PUBLIC_*` bakes in at build time — a full redeploy is required, not a restart).
- Coolify → Application → **Environment Variables** access. Env changes apply on
  **redeploy**; pushes to the deploy branch auto-deploy.

## 1. Payments (Stripe)

### What's gated today

`lib/billing/disabled.ts` holds the single switch:

```ts
export const PAYMENTS_DISABLED = true;
```

While `true`, every charging entry point returns `403 {"message":"Payments are disabled."}`:
portal billing (customer portal, modules, payment methods, credits, invoices, services),
booking refunds, store Stripe Connect + test, public booking pay/book, gift certificates,
and the three webhooks:

- `app/api/stripe/webhook/route.ts` — platform subscriptions (`checkout.session.completed`,
  `customer.subscription.updated|deleted|trial_will_end`, `invoice.paid|payment_failed`)
- `app/api/stripe/webhook/booking/route.ts` — bookings, gift certificates, booking quotes
- `app/api/stripe/webhook/ecommerce/route.ts` — store orders (BYOK stores use their own
  signing secret)

### 1.1 Coolify env vars

| Var | Value | Where to get it |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` first, `sk_live_…` later | Stripe → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` | signing secret of `/api/stripe/webhook` |
| `STRIPE_BOOKING_WEBHOOK_SECRET` | `whsec_…` | signing secret of `/api/stripe/webhook/booking` |
| `STRIPE_ECOMMERCE_WEBHOOK_SECRET` | `whsec_…` | signing secret of `/api/stripe/webhook/ecommerce` |

The sync script detects the mode from the key prefix (`sk_test_` → TEST), so test and live
each keep their own product/price IDs.

### 1.2 Create the three webhook endpoints

Stripe → Developers → Webhooks → Add endpoint, target `https://<domain>/api/stripe/webhook`
(and `…/booking`, `…/ecommerce`), subscribing to:

| Endpoint | Events |
|---|---|
| `/api/stripe/webhook` | `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`, `invoice.paid`, `invoice.payment_failed` |
| `/api/stripe/webhook/booking` | `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded` |
| `/api/stripe/webhook/ecommerce` | `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded` |

Each endpoint prints its own `whsec_…` → paste into the matching env var, redeploy.

### 1.3 Provision products and prices

With `STRIPE_SECRET_KEY` + `DATABASE_URL` pointed at the target environment:

```
bun scripts/billing/sync-stripe-products.ts
```

Idempotent: matches products by `metadata.moduleSlug` and prices by (recurring monthly,
unit_amount); writes the resulting IDs onto the matching `services` rows.
Optional seats: `bun scripts/billing/create-seat-product.ts`, then paste the printed
product id into `SEAT_SKU.stripeProductId` in `lib/billing/domain-catalog.ts` — until
then seats simply don't charge (modules bill fine).

### 1.4 Flip the switch

1. Edit `lib/billing/disabled.ts` → `PAYMENTS_DISABLED = false`.
2. Commit + push (auto-deploys).
3. Run `bun test`; update any expectation that asserted the disabled 403s.

### 1.5 Verify

- Stripe → Webhooks: endpoints receive `200`s.
- Test-mode purchase with card `4242 4242 4242 4242`: booking with payment, store
  checkout, module subscription.
- When ready for real money: repeat 1.1–1.3 in live mode (`sk_live_…` + live webhooks).

## 2. Email (Resend)

### Current state

`EMAIL_TRANSPORT=mailpit` → Mailpit captures everything; **nothing leaves the server**.
`lib/email/transport.ts` selects `resend` for any other value.

### Steps

1. Resend → add + verify the sending **domain** (SPF + DKIM DNS records; a subdomain like
   `mail.<domain>` keeps root DNS untouched).
2. Coolify env vars:

| Var | Value |
|---|---|
| `RESEND_API_KEY` | `re_…` |
| `RESEND_FROM_EMAIL` | `no-reply@<verified domain>` |
| `EMAIL_TRANSPORT` | `resend` |

3. Redeploy.
4. Optional — inbound replies: point Resend's inbound webhook at `/api/email/inbound`
   (`app/api/email/inbound/route.ts`) with `INBOUND_EMAIL_SECRET`.

### Verify

- Trigger a booking confirmation / invite / password reset to a real inbox; check
  Resend → Emails (delivered) and that SPF/DKIM pass.
- Transactional mail always uses the platform key by design; campaign sends can be BYOK
  (client-supplied key).

## 3. AI (Anthropic / OpenAI)

### What each key unlocks

- `OPENAI_API_KEY` — Brain embeddings (`text-embedding-3-small` via
  `lib/brain/embeddings.ts`) → semantic search/RAG. Optional realtime voice:
  `OPENAI_REALTIME_MODEL`, `OPENAI_REALTIME_VOICE`.
- `ANTHROPIC_API_KEY` — Claude for AI chat/automations; BYOK-aware fallback resolved in
  `lib/ai/resolve-client-key.ts`.
- Tenants can store their own keys (BYOK) per provider; the platform key is the fallback
  for everyone else.
- `ANTHROPIC_GATEWAY_KEY` is set in Coolify but **not referenced anywhere in the repo** —
  harmless leftover; delete if you like.

### Steps

1. Create keys: console.anthropic.com / platform.openai.com.
2. Set `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY` in Coolify → redeploy.

### Verify

- The `process-embeddings` cron (every minute) drains pending items by itself once a key
  exists.
- Ask the portal Brain a question → grounded answer, no provider 401s in the logs.

## 4. Rollback

| Switch | Rollback |
|---|---|
| Payments | `PAYMENTS_DISABLED = true` (edit + push) |
| Email | `EMAIL_TRANSPORT=mailpit` (env + redeploy) |
| AI | Remove the key (env + redeploy) |

## Current state (checked 2026-09-18)

- `PAYMENTS_DISABLED=true`; no `STRIPE_*` env vars set.
- `EMAIL_TRANSPORT=mailpit`; `RESEND_API_KEY` / `RESEND_FROM_EMAIL` empty.
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` empty; `ANTHROPIC_GATEWAY_KEY` set (unused).
- Domain: not configured yet (Coolify fqdn empty) — prerequisite for §1.2.
