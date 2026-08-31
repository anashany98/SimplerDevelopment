# Auditoría inicial y resultado

Fecha: 2026-08-25. Baseline: `main` en `6371912c2ebc342d305fa4954b681832bab1a1a7`.

## Fortalezas encontradas

- Monolito Next.js/TypeScript grande pero modular, con Drizzle/PostgreSQL, auth, tenant `clientId`, CRM, reservas, Company Brain, automation engine, MCP, billing, Sentry, S3 y una suite unit extensa.
- Patrones reutilizables de autorización, entitlement, cron fail-closed, cifrado AES-GCM, usage ledger, SSE y provider adapters en otras integraciones.
- Widget e inbox ya existentes, por lo que la evolución aditiva evita una reescritura de alto riesgo.

## Fallos/gaps de partida relevantes

| Prioridad | Hallazgo | Impacto | Corrección aplicada/estado |
|---|---|---|---|
| P0 | chat solo webchat, sin modelo provider-neutral | no omnicanal | esquema y adapters normalizados |
| P0 | sin webhook Meta firmado/routing tenant | spoofing/fuga | raw-body HMAC, activo único, dedupe |
| P0 | envío sin outbox externo/policy central | pérdida/duplicado/incumplimiento | outbox durable y gate 24 h/consent |
| P0 | IA de inbox sin journal/grounding/handoff | alucinación/coste | AI run durable, evidencia y fail-closed |
| P1 | identidad de canal no separada de contacto | merges erróneos | identity provider-scoped + match exacto |
| P1 | widget sin dominio/adjunto hardening suficiente | abuso/PII | allowlist, HMAC, rate limit, S3 tenant |
| P1 | MCP sin superficie omnicanal/booking conversacional | agentes limitados | 40 tools con scopes/entitlements |
| P1 | migración metadata Drizzle obsoleta | SQL masivo/destructivo al generar | baseline aislado regenerado; SQL incremental limpio |
| P2 | email entrante no tiene adapter unificado | cobertura parcial | documentado, no simulado |
| P2 | plan/overage específico ausente | monetización incompleta | diseño; implementación pendiente |

## Validación local

- `bun install --frozen-lockfile`: pasa.
- TypeScript portable: pasa.
- `bun run lint`: 0 errores y 2.699 warnings del repositorio.
- `bun audit --production`: falla con 73 vulnerabilidades (4 críticas, 29 altas, 34 moderadas, 6 bajas); NO-GO de release.
- Build: pasa; las páginas de blog registran el fallo esperado de conexión/autenticación contra la DB local de validación, pero el build maneja la ausencia de datos.
- Bloque afectado: 135/135 tests pasa en 8 suites con el proyecto unitario de Vitest.
- Suite unit completa: 28.409 pasa, 27 falla, 12 omitidos. Los fallos restantes están en ocho suites preexistentes de UI/locale y supuestos POSIX/Windows; deben quedar verdes en CI antes de promoción.
- `bun run test`, `bun test:integration`, `bun test:e2e`, `bun test:tenancy` y `bun test:critical`: no arrancan mediante los scripts oficiales en este host porque el package invoca Bash como ejecutable desde Bun/Windows. Además no hay `DATABASE_URL_TEST` ni credenciales provider. `bun test` sin `run` se probó y no es válido aquí: mezcla specs Playwright y capas DB bajo el runner nativo de Bun.

## Limitación de proceso

La misión pedía crear/mantener tarjetas con MCP Kanban y ejecutar `/grill-me`; esas capacidades no están expuestas en esta sesión. No se falsificó actividad de tablero ni un interrogatorio inexistente. Este documento y `production-readiness.md` conservan el desglose, evidencia y gates.
