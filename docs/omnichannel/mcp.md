# MCP omnicanal

El servidor existente registra las herramientas solo si la API key posee el scope y vuelve a comprobarlo al ejecutar. Todas usan el `clientId` del contexto MCP, no un tenant aportado como argumento.

## Superficie

- Canales: `list_channels`, `get_channel_status`, `connect_channel`, `disconnect_channel`.
- Inbox: `list_conversations`, `get_conversation`, `list_messages`, `search_conversations`, `send_message`, `send_media`, `send_template_message`, `mark_read`, `assign_conversation`, `take_over_conversation`, `return_conversation_to_ai`, `pause_ai`, `close_conversation`, `reopen_conversation`, `set_ai_mode`.
- IA: `get_ai_config`, `update_ai_config`.
- CRM: `search_contacts`, `get_contact`, `create_contact`, `update_contact`, `upsert_contact`, `merge_contacts`, `get_pipeline`, `move_deal`.
- Booking: `list_booking_services`, `get_availability`, `create_booking`, `cancel_booking`, `reschedule_booking`.
- Automatización: `list_automations`, `create_automation`, `update_automation`, `delete_automation`.
- Métricas: `get_inbox_metrics`, `get_channel_metrics`.

## Scopes y reglas

| Dominio | Lectura | Escritura/borrado |
|---|---|---|
| Canales/inbox/IA/métricas | `chat:read` | `chat:write` |
| Contactos | — | `crm:write` + entitlement CRM |
| Reservas | `bookings:read` | `bookings:write` + entitlement Booking |
| Automatizaciones | `automations:read` | `automations:write`, `automations:delete` |

Crear reservas de pago se rechaza: debe pasar por checkout. Conectar canal manual almacena cifrado y nunca devuelve credenciales. Las llamadas heredan la telemetría/auditoría MCP existentes.

Para exponer este MCP como servidor remoto a clientes externos se requiere un endpoint HTTPS público y el OAuth/API-key del repositorio. La Responses API puede consumir un servidor MCP remoto mediante `type: "mcp"`, `server_url` y, cuando corresponda, OAuth; las acciones sensibles deben conservar approvals. Referencia: [OpenAI MCP and connectors](https://developers.openai.com/api/docs/guides/tools-connectors-mcp).
