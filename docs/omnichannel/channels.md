# Canales y contratos

## Contrato estable

Todo canal implementa `connect`, `disconnect`, `refreshCredentials`, `verifyWebhook`, `handleWebhook`, `sendMessage`, `uploadMedia` y `getCapabilities`. El núcleo consume solo eventos/mensajes normalizados.

| Canal | Conexión | Entrada | Salida | Estado actual |
|---|---|---|---|---|
| Webchat | widget existente | API pública + SSE | respuesta portal directa | funcional; adjuntos S3 seguros |
| WhatsApp | Facebook Login for Business + selección WABA/teléfono | webhook Meta firmado | Cloud API + templates | implementado; requiere credenciales/activos reales |
| Messenger | Facebook Login for Business + Page | webhook Meta firmado | Send API | implementado; requiere revisión/permisos Meta |
| Instagram | Page vinculada a cuenta profesional | webhook Meta firmado | Messenger Platform | implementado; requiere revisión/permisos Meta |
| Email | configuración de transporte existente | sin adapter inbound nuevo | transporte Resend/Mailpit existente | base saliente; inbound pendiente de proveedor |

## Meta

- Versión Graph fijada por `META_GRAPH_VERSION`, default `v26.0`.
- GET de verificación usa `hub.mode`, `hub.verify_token` y devuelve `hub.challenge`.
- POST exige `X-Hub-Signature-256` HMAC SHA-256 sobre el cuerpo crudo.
- WhatsApp se enruta por `metadata.phone_number_id`; Messenger/Instagram por `entry.id`.
- Un activo que coincide con cero o más de un tenant se rechaza; nunca se adivina.
- Los `wamid`/`mid` y eventos de estado se deduplican. Un error interno devuelve 503 para permitir reintento del proveedor.

Referencias oficiales: [WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform), [webhooks WhatsApp](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview), [endpoint y firma](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint), [Messenger Platform](https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview), [Send API](https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages) y [Facebook Login for Business](https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business).

## Ventanas y consentimiento

- WhatsApp fuera de 24 h exige template aprobado.
- Messenger/Instagram fuera de la ventana de 24 h se bloquean.
- Marketing exige consentimiento `granted`, incluso en webchat/email.
- La IA y las automatizaciones pasan por el mismo gate; no pueden saltarlo.
