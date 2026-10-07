# Informe de pruebas de IA — 30/08/2026

Alcance: verificación de la infraestructura de IA local (LM Studio / gateway), pruebas de chat y embeddings en vivo, y la suite de tests unitarios relacionados con IA del proyecto.

---

## 1. Infraestructura

| Componente | Endpoint | Estado |
|---|---|---|
| LM Studio (servidor OpenAI-compatible) | `http://localhost:1234/v1` | ✅ Activo |
| Gateway LiteLLM | `http://localhost:4100/v1` | ⚠️ Activo pero responde **401** (requiere API key; no hay key configurada en `.env.local`) |
| App Next.js (dev) | `http://localhost:3000` | ✅ 200 OK |
| PostgreSQL (docker `simplerdev-omnichannel-dev-db`, puerto 55434) | `DATABASE_URL` de `.env.local` | ✅ Conectando sin errores de auth (28P01 resuelto en sesión anterior) |

### Modelos cargados en LM Studio

- **Chat**: `qwen3-8b`, `qwen3-14b`, `qwen3-0.6b`, `qwen3-vl-8b-instruct` (+ variante `:2`), `qwen3-vl-30b-a3b-thinking`, `muse-glimmer-30b`, `supergemma4-26b-uncensored-v2`, `microsoft/phi-4-mini-reasoning`
- **Embeddings**: `text-embedding-nomic-embed-text-v1.5@f32` / `@q4_k_m`, `second-state/jina-embeddings-v2-base-es`, `piaopiao0095/jina-embeddings-v2-base-es`, `text-embedding-qwen3-embedding-0.6b`, `text-embedding-all-minilm-l6-v2-embedding`
- **Rerank**: `qwen3-reranker-0.6b`

## 2. Pruebas en vivo

### 2.1 Chat directo (LM Studio, `qwen3-8b`)

- ✅ `POST /v1/chat/completions` responde correctamente (HTTP 200, formato OpenAI válido).
- ⚠️ Nota: el modelo `qwen3-8b` es *reasoning*: gasta los tokens en `reasoning_content` antes del contenido (`finish_reason: "length"` con `max_tokens` bajos). Para uso productivo conviene subir `max_tokens` o desactivar el modo thinking.

### 2.2 Embeddings

| Modelo | Dimensión | Estado |
|---|---|---|
| `text-embedding-nomic-embed-text-v1.5@f32` | **768** | ✅ |
| `second-state/jina-embeddings-v2-base-es` | **768** | ✅ |

Ambos coinciden con el esquema: `brain_embeddings.vector` está fijado a **768 dims** (`lib/db/schema/brain.ts`, comentario "LM Studio nomic-embed-text"), con validación estricta en `lib/brain/embeddings.ts` (`EMBEDDINGS_DIM` debe ser 768 o lanza error).

### 2.3 Configuración de la app (hallazgo)

- `.env.local` **no define** `EMBEDDINGS_BASE_URL` / `EMBEDDINGS_MODEL` ni `OPENAI_BASE_URL` / `ANTHROPIC_API_KEY`.
- Consecuencia: en runtime la app intentaría embeddings contra `https://api.openai.com/v1` con `text-embedding-3-small` (1536 dims → incompatible con el esquema de 768) y los tasks de chat contra Anthropic sin key.
- **Recomendación**: añadir a `.env.local` para desarrollo local con IA funcional:
  ```
  EMBEDDINGS_BASE_URL=http://localhost:1234/v1
  EMBEDDINGS_MODEL=text-embedding-nomic-embed-text-v1.5@f32
  OPENAI_BASE_URL=http://localhost:1234/v1
  AI_MODEL__chat=openai:qwen3-8b            # ejemplo de override por task
  AI_MODEL__brainClassify=openai:qwen3-0.6b
  ```
  (El registro `lib/ai/models.ts` soporta overrides por aspecto vía `AI_MODEL__<task>=<provider>:<model>`.)

## 3. Suite de tests unitarios (vitest)

Todos ejecutados con `bunx vitest run` sobre el conjunto de archivos `tests/unit/` relacionados con IA:

| Grupo | Archivos | Tests | Resultado |
|---|---|---|---|
| Núcleo IA (resolve-client-key, audit, credits, evals, block-schemas, meeting-processor, plan-gate, slide-*) | 10 | **228** | ✅ Todos pasan |
| Portal tools + chat routes (crm, crm-2, domains, inbox, projects, projects-2, registry-baseline, sanitizer, agents-client, evals-depth, chat route, chat stream, brain agent dual-path, rate-limit, token, realtime) | 16 | **362 pasan / 2 skip** | ✅ |
| Brain (embeddings, embedding-queue, embedding-extractors, rerank, search, classify-notes, classify-crm, analyze-attachment, process-meeting, meetings, mcp-tools-ai, mcpToolDomains, mcp-sdk-adapter) | 13 | **655** | ✅ Todos pasan |
| Rutas y gates (chat-router-active, review-routing, entitlement, entitlement-trial, mcp-entitlement-gate, cron brain agent, survey ai-summary, chat widget, widget bootstrap) | 10 | **159** | ✅ Todos pasan |
| Re-confirmación embeddings/rerank | 3 | 48 | ✅ |

**Total: ~1.404 tests ejecutados — 0 fallos** (2 skips intencionales).

Logs completos en `/tmp/ai-report/` (`vitest-core.txt`, `vitest-tools.txt`, `vitest-brain.txt`, `vitest-routes.txt`, `vitest-embed.txt`, `direct-tests.txt`).

## 4. Conclusiones

1. **Infraestructura local de IA operativa**: LM Studio sirve chat y embeddings (768-dim) correctamente y es compatible con lo que espera el esquema de `brain_embeddings`.
2. **Suite de IA en verde**: los ~1.400 tests unitarios del stack de IA (portal chat, brain agent, embeddings, rerank, clasificadores, entitlements, audit) pasan sin fallos.
3. **Gap de configuración** (acción recomendada): sin `EMBEDDINGS_BASE_URL`/`EMBEDDINGS_MODEL` en `.env.local`, el runtime apunta a OpenAI por defecto, que es incompatible con el esquema local de 768 dims. Añadir las variables de la sección 2.3 deja el desarrollo 100% local.
4. **Gateway LiteLLM** (puerto 4100) responde 401 sin API key: no está integrado en la configuración actual de la app (ninguna referencia en `lib/`); solo relevante si se quiere un proxy unificado.
5. Los modelos por defecto de la app siguen siendo Anthropic (`claude-sonnet-4-6` / `claude-haiku-4-5`); los modelos locales solo se usan si se añaden los overrides `AI_MODEL__*` o keys BYOK por cliente.
