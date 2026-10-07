# Instagram Messaging

## Implementación

Instagram usa la capa Meta común, pero conserva `channel=instagram`, cuenta profesional, identidad externa y metadata propias. Los webhooks de mensajería se normalizan en Conversation Core; los echoes se descartan y las respuestas de texto/media salen por el outbox y policy engine.

No se asume que cualquier cuenta de Instagram sea compatible. El onboarding debe ofrecer únicamente cuentas Business/Professional y activos que Meta devuelva para el usuario y Page conectados.

## Configuración

1. Completar las variables Meta descritas en [WhatsApp](whatsapp.md).
2. Configurar Facebook Login for Business y solicitar solo los permisos vigentes necesarios para Pages e Instagram Messaging.
3. Vincular la cuenta profesional con su Page/Business según los requisitos actuales de Meta.
4. Registrar `/api/webhooks/meta`, suscribir eventos y elegir el activo desde **Settings → Channels**.

## Gate real

En activos TEST: DM entrante con texto y adjunto, reply context, identidad, salida, error/expiración de token y reconexión. Disponibilidad de estados y formatos debe tratarse según capacidades retornadas, no inventarse.
