# Billing y packaging

La plataforma reutiliza entitlements, catálogo de dominios, Stripe y el ledger de uso existentes. No se creó un segundo sistema de suscripciones.

## Propuesta de producto

| Plan | Canales | IA | Límites orientativos |
|---|---|---|---|
| Free/Starter | webchat | borradores limitados | 1 widget, retención corta |
| Pro | webchat + 1 canal externo | HYBRID | conversaciones/mensajes/tokens incluidos |
| Business | Meta multi-activo + email | AI/HYBRID, BYOK elegible | mayor volumen, equipos y automatización |
| Enterprise | todos + controles avanzados | BYOK/modelos aprobados | SSO/SLA/retención/región acordada |

## Medición

Dimensiones propuestas: conexiones activas, contactos activos, mensajes inbound/outbound, conversaciones, AI input/output tokens, almacenamiento de adjuntos y ejecuciones de automatización. Nunca contar reintentos deduplicados como uso facturable.

## Estado real

El uso IA llama al ledger existente y la configuración contiene topes diarios/mensuales. No están implementados aún los SKUs/entitlements específicos de omnicanal, overage, prorrateo ni enforcement completo de todos los contadores. La UI y MCP se protegen por permisos, pero eso no sustituye el paywall comercial. Promoción: sembrar productos Stripe TEST, activar/cancelar/cambiar plan, exceder cada límite bajo concurrencia y reconciliar invoice/ledger.
