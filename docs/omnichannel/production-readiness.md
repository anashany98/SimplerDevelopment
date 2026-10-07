# Estado y criterios de promoción

## Resultado actual

**Candidato de integración local, no producción.** El núcleo modular está implementado y las comprobaciones unitarias focales pasan, pero faltan credenciales, PostgreSQL TEST, App Review Meta, E2E reales, resiliencia, carga/soak y métricas p95/p99.

Además, `bun audit --production` reporta **73 vulnerabilidades (4 críticas, 29 altas)** en el árbol actual. Es un NO-GO independiente del módulo omnicanal.

## Cobertura de la misión

| Fase | Estado | Evidencia/límite |
|---|---|---|
| Auditoría/arquitectura | completa a nivel repo | inventario y decisiones documentados |
| Esquema/migración | implementada, no aplicada | migración Drizzle aditiva generada |
| Adapter framework | implementado | Meta/webchat/email saliente |
| Meta login/webhooks | implementado | falta sandbox/app review real |
| Inbox/widget | implementado | falta browser E2E multirol y carga |
| CRM/identidad | implementado | merge explícito; falta DB tenancy real |
| IA/BYOK | implementado con gates | falta eval de calidad/coste y límites concurrentes |
| MCP | 40 tools registradas | baseline unit; falta llamadas reales con API keys |
| Automatización | eventos/acciones conversacionales | acción rule `create_booking` diferida |
| Booking MCP | implementado | pago rechazado deliberadamente; falta E2E |
| Email | parcial | outbound sí, inbound adapter no |
| Billing/packaging | diseño parcial | SKUs/overage/paywall omnicanal pendientes |
| Observabilidad/runbooks | base + documentación | alertas/dashboards/SLO medidos pendientes |
| Seguridad/compliance | controles core | DSAR/retención/AV/red-team pendientes |

## Gate GO/NO-GO

GO solo si todos cumplen:

1. `typecheck`, lint, unit, `test:tenancy`, `test:critical` y build verdes en CI Linux.
2. Migración + rollback operativo + restore íntegro en PostgreSQL staging.
3. Dos tenants reales no cruzan conexiones, identities, inbox, CRM, AI runs, outbox, MCP ni bookings.
4. WhatsApp, Messenger e Instagram TEST completan connect → inbound → dedupe → reply/template → sent/delivered/read/failure → disconnect/reconnect.
5. Kill/restart de worker y fallos 429/5xx/timeout recuperan sin pérdida/duplicado.
6. Carga y soak cumplen SLO/capacidad/coste definidos con p95/p99.
7. Red-team de webhook, OAuth, SSRF, prompt injection, uploads y scopes sin hallazgos críticos/altos abiertos.
8. Billing TEST reconcilia plan, límites, overage/cancelación; legal aprueba consentimiento/retención/DSAR.
9. Cero críticos/altos explotables sin excepción formal: actualizar Auth.js y dependencias transitivas, generar SBOM y escanear dependencias/contenedor.
10. Runbooks, alertas, on-call y release manifest están firmados.

Hasta entonces el despliegue permitido es staging o canary controlado con datos/activos TEST, IA por defecto apagada y rollback probado.
