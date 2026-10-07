# Automatización

El dominio usa el `event-bus` y `automation_rules` existentes. Se añadieron eventos `conversation.created`, `conversation.message_received`, `conversation.message_sent`, `conversation.assigned`, `conversation.closed`, `conversation.ai_handoff`, `channel.connected`, `channel.disconnected` y `channel.error`.

## Acciones conversacionales

- `send_message` y `send_template`: entran en el outbox y en el mismo gate de políticas.
- `assign_conversation`, `close_conversation`, `reopen_conversation` y `set_ai_mode`.
- `add_conversation_tags`.

Los scopes requeridos se derivan de las acciones, se evalúan con el mecanismo actual y la regla queda tenant-scoped. Las acciones deben ser idempotentes mediante claves naturales del evento/outbox.

## Reservas

Las herramientas MCP reutilizan disponibilidad, capacidad, round-robin, asistentes y restricciones del Booking Engine. La acción genérica `create_booking` del editor de reglas todavía no llama a ese servicio compartido; por seguridad no se añadió un segundo flujo incompleto. Es una brecha funcional explícita para una iteración posterior.

## Ejemplos

1. `conversation.message_received` + palabra “cita” → cambiar a HYBRID y notificar al equipo; la creación se ejecuta mediante MCP o UI con disponibilidad real.
2. `conversation.ai_handoff` → asignar equipo soporte y prioridad alta.
3. `channel.error` → alerta interna; nunca reenvía secretos ni payload crudo.

La aceptación productiva requiere reintento real tras caída del worker, deduplicación del mismo evento y prueba de que una regla del tenant A no lee/muta tenant B.
