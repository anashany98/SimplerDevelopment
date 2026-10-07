# Despliegue y configuración

## Variables

Obligatorias para core: `DATABASE_URL`, `AUTH_SECRET`/`NEXTAUTH_SECRET`, `CRON_SECRET`, `WORKSPACE_TENANT_SECRETS_KEY`, `CHAT_TOKEN_SECRET`. `META_OAUTH_STATE_SECRET` (con fallback a `NEXTAUTH_SECRET`) y `META_GRAPH_VERSION=v26.0` siguen siendo configuración del despliegue. `META_APP_ID`, `META_APP_SECRET`, `META_LOGIN_CONFIG_ID` y `META_WEBHOOK_VERIFY_TOKEN` pueden guardarse cifrados por empresa desde **Settings → Channels**; las variables homónimas quedan como fallback de plataforma. Producción distribuida debe configurar Upstash y S3.

## Meta Business app

1. Crear Business app y Facebook Login for Business; pedir solo permisos necesarios.
2. Guardar App ID, App Secret, Login configuration ID y verify token en **Settings → Channels**.
3. Copiar desde esa pantalla el callback OAuth y la URL de webhook tenant-scoped generada.
4. Suscribir objetos/campos de WhatsApp y Messenger/Instagram según productos aprobados.
5. Completar App Review/Advanced Access y opt-in antes de usuarios reales.
6. En el portal conectar Page/IG o seleccionar WABA/número; enviar/recibir con activos TEST.

## Runtime

`vercel.json` agenda cada minuto `/api/cron/process-channel-outbox` y `/api/cron/process-conversation-ai`. Ambos fallan cerrados si falta cron auth. En otro hosting debe programarse el mismo bearer `CRON_SECRET`.

## Release

1. Migrar staging y ejecutar unit/integration/E2E.
2. Configurar secrets en el gestor, nunca en repositorio o logs.
3. Desplegar con canales/IA desactivados por defecto.
4. Canary a un tenant TEST; observar backlog, errores y coste 24 h.
5. Activación gradual con rollback de código, pause IA y disconnect por tenant.

## Backup/restore

Backups automáticos no bastan: restaurar un snapshot en otra instancia, validar conteos/constraints y simular replay de webhook/outbox sin duplicación. Conservar cifrado y la clave correspondiente en escrow seguro; una restauración sin la clave no recupera tokens.
