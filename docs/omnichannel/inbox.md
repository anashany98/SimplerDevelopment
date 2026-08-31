# Inbox unificado

La ruta `/portal/inbox` lista conversaciones por estado, canal, prioridad, modo IA y texto. Cada fila muestra canal, estado, asignación y última actividad; el detalle ordena el timeline normalizado y los estados de entrega.

## Operación

- Responder en canales externos crea mensaje `queued` y outbox; webchat mantiene el canal directo compatible.
- Acciones AI, HUMAN, PAUSED, HYBRID y CLOSED quedan en auditoría.
- Los borradores IA son revisables y no se publican automáticamente si falta evidencia, confianza, ventana o política.
- La búsqueda escapa comodines SQL y todas las queries aplican `clientId`.
- El merge CRM reasigna historial, no lo duplica.

## Widget

El embed existente sigue cargando un iframe. La configuración añade nombre, colores, logo/avatar, idioma, saludo, privacidad, branding, horarios, modo IA, adjuntos y allowlist de origen. El loader pasa el origen padre; la API lo compara por host exacto o wildcard explícito `*.example.com`.

Adjuntos: 10 MiB máximo, MIME permitido, comprobación básica de magic bytes, rate limit compartido y key S3 `chat/{clientId}/{uuid}`. La mensajería solo acepta URLs del proxy tenant-scoped.

## Pendientes de UX

- Vista de conflictos/manual merge dedicada.
- Historial visual completo de consentimientos y audit log.
- Métricas p95 de primera respuesta y cola en dashboard; hoy MCP expone agregados básicos.
