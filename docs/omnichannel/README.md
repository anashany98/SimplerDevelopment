# Omnicanal

Esta carpeta documenta la capa omnicanal añadida sobre el core existente de CRM AGENTS. No crea CRMs, RAGs ni motores de reservas por canal: los adapters convierten tráfico externo al mismo modelo de conversaciones, contactos, IA, automatizaciones y MCP.

## Estado

El checkout es un **candidato de integración local, no producción**. El código, typecheck, lint, build y bloque unitario focal están validados; faltan PostgreSQL TEST, credenciales sandbox, E2E de proveedores, aislamiento tenant con DB real, carga, resiliencia y remediar vulnerabilidades de dependencias.

## Mapa documental

- [Arquitectura](architecture.md), [modelo](domain-model.md) y [migración](migration-plan.md).
- [WhatsApp](whatsapp.md), [Instagram](instagram.md), [Facebook Messenger](facebook.md), [WebChat](webchat.md) y [canales](channels.md).
- [Inbox](inbox.md), [IA](ai.md), [MCP](mcp.md), [automatización](automation.md) y [billing](billing.md).
- [Seguridad](security.md), [observabilidad](observability.md), [testing](testing.md), [despliegue](deployment.md), [troubleshooting](troubleshooting.md) y [runbooks](runbooks.md).
- [Auditoría](audit.md) y [criterios de promoción](production-readiness.md).

La fuente de verdad operativa antes de cualquier release es `production-readiness.md`.
