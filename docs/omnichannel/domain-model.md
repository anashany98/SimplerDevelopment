# Modelo de dominio

## Entidades

| Tabla | Propósito | Clave de aislamiento/idempotencia |
|---|---|---|
| `channel_connections` | activo externo y credenciales cifradas | único `(client_id, provider, channel, external_account_id)` |
| `channel_identities` | identidad provider-scoped y vínculo CRM opcional | único `(client_id, provider, external_account_id, external_user_id)` |
| `chat_conversations` | hilo normalizado | único `(client_id, provider, channel_connection_id, external_conversation_id)` |
| `chat_messages` | mensaje canónico, dirección y entrega | únicos `(client_id, provider, external_message_id)` e idempotency key |
| `channel_webhook_events` | journal de ingreso/reintento | único `(connection_id, external_event_id)` |
| `channel_outbox` | entrega duradera | único `(client_id, idempotency_key)` |
| `channel_consents` | consentimiento y evidencia | lookup por tenant/canal/contacto |
| `conversation_audit_logs` | acciones usuario/IA/sistema | tenant, conversación, correlación |
| `channel_ai_configs` | proveedor/política por tenant | único `client_id` |
| `channel_ai_runs` | decisión IA durable por mensaje | único `(client_id, message_id)` |

`chat_widgets`, `chat_conversations` y `chat_messages` se ampliaron de forma aditiva. `widget_id` y `visitor_id` pasan a ser opcionales para hilos de proveedores externos; las columnas antiguas se conservan.

## Estados

- Conexión: `incomplete → connected → token_expired|error|disconnected`.
- Conversación: `open|assigned|closed`, ortogonal a `ai|human|paused|hybrid|closed`.
- Mensaje: `received|queued|sent|delivered|read|failed`.
- Outbox/AI: `pending → processing → processed|failed`, con reintentos y `next_attempt_at`.

## Identidad y CRM

1. Siempre se crea/recupera la identidad exacta del proveedor dentro del tenant.
2. Se normalizan email y teléfono.
3. Solo un match exacto y no ambiguo enlaza automáticamente un contacto.
4. Sin email/teléfono no se inventa un contacto: la conversación sigue con identidad de canal.
5. La fusión es explícita y transaccional; reasigna identidades, conversaciones y relaciones CRM antes de retirar el secundario.

No se hace fuzzy match ni merge entre tenants.
