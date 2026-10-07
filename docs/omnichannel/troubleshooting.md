# Troubleshooting omnicanal

## Webhook Meta devuelve 401

Confirmar el App Secret guardado en **Settings → Channels** (o `META_APP_SECRET` si se usa el fallback), el encabezado `X-Hub-Signature-256` y que proxy/CDN no transforme el body. La firma se calcula sobre bytes crudos; no reserializar JSON.

## Verificación GET falla

Comparar exactamente `hub.verify_token` con el token guardado y copiar de nuevo la URL completa mostrada en **Settings → Channels**; la URL tenant-scoped incluye `?config=...`.

## Activo no aparece o queda incomplete

Revisar permisos vigentes, App Review, vínculo Business/Page/Instagram/WABA y el Login configuration ID guardado. Volver a conectar; nunca pegar access tokens en el frontend.

## Mensaje queda queued/retry

Consultar conexión, `channel_outbox`, `lastError`, evento webhook y logs por correlation ID. Verificar cron `/api/cron/process-channel-outbox`, `CRON_SECRET`, token expirado, 429/5xx y ventana/template/consentimiento.

## IA no responde

Comprobar plan, budget, configuración AI, modo de conversación y worker `/api/cron/process-conversation-ai`. Un run sin evidencia grounded debe terminar en draft/handoff, no en auto-send.

## Widget devuelve 403/404

403 indica origin no permitido. 404 suele ser widget desactivado, clave desconocida o embed heredado cuyo widget ya migró a clave pública. Copiar nuevamente el snippet desde ajustes.

## Validación local en Windows

Los scripts oficiales `test:tenancy` y `test:critical` invocan Bash y no arrancan desde Bun/PowerShell en este host. Ejecutarlos en CI Linux/Git Bash/WSL con PostgreSQL TEST y credenciales sandbox; no sustituirlos por health checks.

Consultar también [runbooks](runbooks.md), [testing](testing.md) y [criterios de promoción](production-readiness.md).
