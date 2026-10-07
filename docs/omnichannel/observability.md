# Observabilidad y SLO

## Señales

- Logs estructurados: `channel.webhook.processing_failed` y errores redacted con `clientId`, `connectionId` y correlación, nunca credenciales.
- Sentry: spans de inferencia IA y la infraestructura existente para excepciones.
- Persistencia operativa: `last_inbound_at`, `last_outbound_at`, `last_webhook_at`, `last_error`, estado/attempts/next-attempt en outbox y AI runs.
- Auditoría: canal conectado/desconectado, cambios de conversación, IA/handoff y merge CRM.
- MCP: telemetría y rollups existentes; métricas básicas por inbox/canal están expuestas como tools.

## SLO propuestos, no certificados

| Indicador | Objetivo inicial | Alerta |
|---|---:|---:|
| webhook válido → 2xx | p95 < 500 ms | p95 > 1 s 10 min |
| ingreso → visible inbox | p95 < 2 s | p95 > 5 s |
| outbox ready → provider accepted | p95 < 10 s | backlog oldest > 60 s |
| error terminal outbound | < 1% excluyendo 4xx de política | > 2% 15 min |
| AI run ready → decisión | p95 < 20 s | p95 > 45 s |
| dedupe violation | 0 | cualquier caso |

No hay mediciones de p95/p99, throughput, capacidad ni soak en este entorno. Estos números son gates de campaña, no resultados.

## Alertas/runbooks requeridos

- Conexión `token_expired|error`, firma inválida anómala, activo ambiguo.
- Backlog/edad de outbox y AI, ratio de reintentos, créditos/tokens y fallos de proveedor.
- Error rate por canal/tenant sin etiquetas de alta cardinalidad que contengan PII.
- Runbooks: rotación/reconexión, replay seguro por external event, requeue de outbox, pausa IA tenant y rollback de deploy.
