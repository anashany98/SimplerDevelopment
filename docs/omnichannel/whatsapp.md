# WhatsApp Business Platform

## Implementación

Se usa exclusivamente Meta WhatsApp Business Platform / Cloud API. `MetaChannelAdapter` normaliza mensajes y estados, conserva `wamid`, soporta contexto de respuesta y envía texto, media y templates mediante el outbox común. El webhook único verifica `X-Hub-Signature-256` sobre el body crudo antes de parsear JSON y enruta por `phone_number_id`.

La política determinista permite respuestas libres dentro de la ventana de atención de 24 horas. Fuera de ella exige template aprobado; marketing exige además consentimiento registrado. La IA nunca puede saltarse esta decisión.

## Configuración

1. Configurar una clave estable `WORKSPACE_TENANT_SECRETS_KEY` en el despliegue y guardar App ID, App Secret, Login configuration ID y verify token en **Settings → Channels**. Las variables `META_*` equivalentes solo son el fallback de plataforma.
2. Publicar HTTPS y registrar las URLs OAuth/webhook generadas en esa pantalla; el webhook incluye un identificador público que lo vincula a la empresa.
3. Suscribir los campos de mensajes/estados requeridos en la app Meta y completar permisos/App Review.
4. Pulsar **Connect** desde **Settings → Channels**, seleccionar el WABA/número y ejecutar una prueba en activos TEST.

`META_GRAPH_VERSION` es configurable; el valor por defecto del checkout es `v26.0`. Antes de desplegar se debe reconfirmar versión, permisos, tipos de mensaje, templates y límites en la documentación oficial de Meta.

## Gate real

Debe probarse connect → inbound → dedupe → respuesta/template → sent/delivered/read/failure → retry → disconnect/reconnect. Los fixtures unitarios no sustituyen este E2E.
