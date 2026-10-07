# WebChat embebible

## Embed

Los widgets nuevos generan una clave pública aleatoria y se insertan con:

```html
<script src="https://portal.example/widget/chat.js" data-widget-key="PUBLIC_KEY" async></script>
```

El loader crea un iframe aislado, pasa el origin padre y usa `postMessage` solo para resize/cierre. Los embeds antiguos por `data-widget-id` funcionan únicamente mientras el widget no tenga clave; al guardar configuración se genera la clave y el ID deja de ser una referencia pública válida.

## Seguridad y comportamiento

- Origin exacto o wildcard explícito; denegación por defecto cuando no coincide.
- Token efímero de conversación firmado; `CHAT_TOKEN_SECRET` es obligatorio en producción.
- Rate limiting local y compartido Upstash cuando se configura despliegue distribuido.
- Adjuntos de hasta 10 MB con MIME y magic-byte, ruta S3 tenant-scoped y proxy validado.
- Visitante anónimo mediante `visitorId`; nombre/email se capturan opcionalmente y se resuelven solo por identidad exacta.
- SSE/realtime para mensajes sin recarga; modo IA/humano usa el mismo Conversation Core.

Configurable: marca, logo, avatar, posición, idioma, bienvenida/away, color, horario, modo IA, adjuntos, branding, privacy link y allowlist de origins.
