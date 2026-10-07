# Conectar el CRM a ChatGPT y Claude vía MCP

Tu CRM expone un servidor **MCP (Model Context Protocol)** con **521 herramientas** sobre tus datos: CRM, inbox omnicanal, Company Brain (búsqueda semántica), proyectos/kanban, email, encuestas, reservas, webs, etc. Al conectarlo, ChatGPT o Claude pueden **leer tu CRM, crear contactos/tareas/notas, buscar en tu conocimiento y generar informes** desde el chat.

Ya está todo construido y probado. Solo hay que "conectarlo".

---

## 0. Necesitas una URL pública (obligatorio para el chat web de ChatGPT/Claude)

Los chat web de ChatGPT y Claude viven en la nube y no pueden alcanzar tu `localhost`. Necesitas exponer la app con HTTPS. Ya tienes `cloudflared` instalado.

### Opción rápida (temporal, cambia al reiniciar)
```bash
cloudflared tunnel --url http://localhost:3000
```
Imprime una URL tipo `https://xxxx.trycloudflare.com`. Úsala como `<URL_PUBLICA>` abajo. Sirve para probar ya.

### Opción estable (recomendada para uso diario)
Túnel con nombre + tu dominio propio (URL fija, no cambia):
```bash
cloudflared tunnel login
cloudflared tunnel create crm
cloudflared tunnel route dns crm crm.tudominio.com
# config en ~/.cloudflared/config.yml: tunnel con "service: http://localhost:3000"
cloudflared tunnel run crm
```
Entonces tu URL pública fija sería `https://crm.tudominio.com`.

> La app ya reconoce hosts `*.trycloudflare.com` y tu dominio como "app" (middleware actualizado), así que el login, el consentimiento OAuth y el MCP funcionan por el túnel sin configuración extra. Mantén tu PC encendido con `docker compose up -d` y el túnel corriendo.

---

## 1. Claude.ai (el más simple — "añadir como app/conector")

1. En Claude.ai → **Settings → Connectors → Add custom connector**.
2. URL: `https://<URL_PUBLICA>/api/mcp`
3. Deja los campos OAuth vacíos — Claude se autorregistra.
4. **Add** → te pedirá iniciar sesión en tu portal y **aprobar el consentimiento**. Listo: verás las 521 herramientas.

Prueba a preguntarle: *"Dame un informe de mis deals y próximos vencimientos"* o *"Crea un contacto para Juan Pérez, juan@x.com"*.

## 2. ChatGPT

**ChatGPT (conectores / Developer MCP):** URL `https://<URL_PUBLICA>/api/mcp`, autenticación OAuth 2.1 automática (igual que Claude). Inicia sesión en el portal y aprueba.

**ChatGPT de escritorio** (si te aparece la opción de servidor MCP local), crea `%USERPROFILE%\.chatgpt\mcp.json`:
```json
{
  "mcpServers": {
    "mi-crm": { "type": "http", "url": "https://<URL_PUBLICA>/api/mcp" }
  }
}
```
Reinicia ChatGPT y activa el servidor "mi-crm" en Ajustes → MCP.

## 3. Claude Desktop (config local con tu dominio público)

`%APPDATA%\Claude\claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "mi-crm": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://<URL_PUBLICA>/api/mcp"]
    }
  }
}
```

## 4. Conexión con API key (sin OAuth — para scripts o clientes sin navegador)

1. En el portal: **Ajustes → Claves API → Nueva clave** → copia el valor `sd_mcp_…`.
2. Encabézala como Bearer:
```bash
curl -X POST https://<URL_PUBLICA>/api/mcp \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -H "Authorization: Bearer sd_mcp_TU_CLAVE" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

---

## Qué puede hacer la IA conectada (ejemplos de "informes y cosas")
- *"Resume las conversaciones abiertas del inbox de esta semana."*
- *"¿Qué deals llevan más de 20 días estancados? Crea una tarea para cada uno."*
- *"Busca en el Brain la política de envíos y respóndeme al cliente."* (usa tu conocimiento local)
- *"Genera un informe ejecutivo del estado del CRM en 5 puntos."*
- *"Crea una campaña de email para la lista de clientes."*

Los tokens consumidos por estas consultas salen de **tu IA local (LM Studio)** — sin coste por API. La exposición pública del túnel es lo único a proteger: usa la opción con nombre + dominio y mantenla privada (no compartas la URL).
