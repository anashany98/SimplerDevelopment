# Seguridad y privacidad

## Controles implementados

- Auth/RBAC/scopes existentes en portal y MCP; cada operación id-addressed combina `id` y `clientId`.
- Credenciales de canal y API key IA usan `encryptedText` AES-256-GCM con `WORKSPACE_TENANT_SECRETS_KEY`; no se seleccionan en respuestas ni logs.
- OAuth state HMAC, expiración 10 minutos y vínculo tenant/usuario/canal.
- Webhook Meta: URL pública tenant-scoped, token de verificación constante, HMAC del cuerpo crudo con el App Secret de esa empresa, conexión única y deduplicación.
- Outbox y AI journal con clave de idempotencia, claim, reintento y recuperación de locks.
- Políticas deterministas: consentimiento, ventana de servicio, template y pago de reserva.
- BYOK OpenAI-compatible con rechazo SSRF de HTTP, loopback en producción y redes privadas no allowlisted.
- Widget: token HMAC fail-closed en producción, allowlist de host, rate limiting, validación de fichero y ruta S3 tenant-scoped.
- Errores de proveedor redactados; payloads/secretos no se escriben en logs de aplicación.

## Threat model resumido

| Amenaza | Mitigación | Evidencia pendiente |
|---|---|---|
| webhook forjado/replay | firma raw-body + journal único | replay contra staging real |
| fuga cross-tenant | filtros compuestos + activos únicos | suite DB con dos tenants |
| robo de token | cifrado, no retorno, disconnect/reconnect | rotación real y KMS gestionado |
| prompt/tool injection | salida estructurada, allowlist y gates deterministas | red-team con corpus adversarial |
| SSRF BYOK | URL/host validation | DNS rebinding test |
| spam/coste | Upstash, ventanas, consent, usage ledger | carga distribuida y límites concurrentes |
| MIME spoofing | tipo/tamaño/magic bytes básico | antivirus/CDR antes de ficheros no confiables |

## Dependencias

`bun audit --production` del 2026-08-25 devuelve 73 hallazgos: 4 críticos, 29 altos, 34 moderados y 6 bajos. Entre los bloqueantes aparecen Auth.js/`next-auth` beta y cadenas transitivas de `tar`; también hay avisos en Hono/MCP, Undici, Vite, ws y sharp/libvips. Las dependencias directas `tar` y `sharp` ya están en versiones superiores a algunos rangos afectados, pero el árbol conserva versiones transitivas vulnerables.

No se aplicó un `bun update --latest` ciego: mezclar una actualización transversal potencialmente breaking con el cambio de dominio invalidaría la atribución de regresiones. Release NO-GO hasta actualizar/overridear el árbol en una rama dedicada, revisar los advisories aplicables al runtime, pasar auth/security regression y obtener un audit sin críticos/altos explotables aceptados.

## GDPR/CCPA

Consentimiento guarda propósito, estado, fuente, evidencia y revocación. La implementación conserva auditoría y trazabilidad, pero no añade todavía export/delete específicos para todas las tablas nuevas ni una política automática de retención. Antes de producción deben definirse DPA, región, retención por clase, legal hold, borrado verificable y procedimiento DSAR.

## Rotación

Rotar el App Secret desde **Settings → Channels** coordinando la verificación de Meta; reconectar activos para tokens sin refresh grant. Rotar `WORKSPACE_TENANT_SECRETS_KEY` exige un proceso dual-key/backfill probado: cambiarla directamente haría ilegibles los ciphertexts actuales.
