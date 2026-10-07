# Runbooks operativos

## Canal en error o token expirado

1. Identificar tenant/conexión por ID, estado y timestamps; no copiar ciphertext/log payload.
2. Ejecutar refresh/test desde ajustes. Si Meta no permite refresh, reconectar.
3. Si la revocación remota falla, usar disconnect local forzado solo tras registrar el motivo; elimina credenciales y conserva historial.
4. Validar inbound/outbound TEST y estado de entrega.

## Backlog outbox

1. Medir cantidad y `min(next_attempt_at/created_at)` por estado/tenant.
2. Confirmar cron auth/ejecución y errores 429/5xx.
3. No duplicar filas: reintentar el mismo outbox/idempotency key.
4. Pausar automatizaciones/IA del tenant si crecen envíos no deseados.
5. Escalar al proveedor con IDs externos, nunca access tokens.

## Webhook replay/duplicado

1. Comprobar firma y `external_event_id` en journal.
2. Si ya está `processed`, devolver éxito sin recrear mensaje.
3. Si falló, corregir causa y reejecutar el evento existente en staging primero.
4. Verificar una sola conversación/mensaje/actividad CRM.

## Incidente IA

1. Cambiar tenant o conversación a HUMAN/PAUSED.
2. Conservar AI run, evidencia, decisión y correlación.
3. Revocar/rotar BYOK si hay indicios de exposición.
4. No reactivar autoenvío hasta pasar regresión de grounding, políticas y herramientas.

## Fuga cross-tenant sospechada

Deshabilitar canal/IA afectados, preservar logs y snapshots, rotar credenciales, buscar acceso por `clientId`/correlation ID, notificar conforme al plan legal y bloquear promoción hasta una prueba DB de dos tenants que reproduzca y cierre el vector.
