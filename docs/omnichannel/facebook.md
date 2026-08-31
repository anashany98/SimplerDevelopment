# Facebook Messenger

## Implementación

Messenger se integra mediante la API oficial de Meta para Pages. `MetaChannelAdapter` reutiliza OAuth, Graph client y verificación de webhook, pero normaliza los eventos con `channel=messenger`. El `entry.id` identifica la Page para routing; inbound, replies y media terminan en el mismo Conversation Core y Shared Inbox.

Cada conexión es tenant-scoped y puede representar una Page distinta. Las credenciales se guardan con el tipo cifrado existente y nunca se devuelven al navegador ni por MCP.

## Configuración

1. Configurar Facebook Login for Business y variables Meta.
2. Registrar `/api/webhooks/meta` y suscribir la Page a los eventos vigentes requeridos.
3. Conectar desde **Settings → Channels** y seleccionar una Page autorizada.
4. Completar revisión/permisos y probar con usuarios/activos TEST antes de producción.

## Gate real

Validar inbound/outbound de texto y media, reply, asociación de Page, dedupe, solicitud de humano, handoff, error/retry, revocación y reconexión. Los receipts solo se presentan cuando la API/capability aplicable los ofrece.
