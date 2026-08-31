# Estrategia de pruebas

## Ejecutado en este checkout

- Instalación reproducible: `bun install --frozen-lockfile`.
- TypeScript: comando equivalente portable `node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit`.
- Unit focal: 135/135 en 8 suites; cubre firma/tamper, routing Meta, allowlist, políticas 24 h/consentimiento, normalización y media Meta, widget por clave pública y baseline MCP.
- Baseline chat preexistente: token, rate limit, realtime y MCP registry.

## Comandos oficiales

```bash
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run test
bun test:tenancy
bun test:critical
bun run build
```

En Windows, los scripts oficiales que invocan `scripts/*.sh` necesitan Git Bash/WSL; `bun run typecheck` referencia `node_modules/.bin/tsc` con semántica Unix. Usar `bun test` sin `run` activa el runner nativo de Bun y mezcla por error unit, integración y specs Playwright; no es equivalente al script del proyecto. La validación CI sigue siendo la autoridad.

## Matriz obligatoria antes de producción

| Capa | Casos |
|---|---|
| Unit | adapter fixtures, firma, idempotencia, policy, identity, SSRF, output IA |
| DB integration | dos tenants, constraints, merge, duplicate webhook/outbox, lock recovery |
| API | RBAC/scopes, OAuth state, origins, upload, desconexión/revocación |
| Provider TEST | WhatsApp/Messenger/IG inbound, reply, delivery/read/failure, template fuera de ventana |
| AI E2E | plataforma y BYOK, grounding/abstención/handoff, agotamiento de tokens |
| Booking | disponibilidad real, concurrencia, grupo, cancel/reschedule, pago sin bypass |
| Resilience | provider 429/5xx/timeout, DB restart, worker kill/recovery, replay |
| Performance | carga y soak; p50/p95/p99, backlog, pool DB, memoria y coste |

Los health checks, mocks, compilación o tests unitarios no certifican el producto completo. Se requiere base PostgreSQL TEST desechable y credenciales sandbox de proveedores.
