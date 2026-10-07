# Plan de migración

## Artefactos

- `drizzle/0001_omnichannel_platform.sql`: migración incremental generada por Drizzle.
- `drizzle/meta/0000_snapshot.json`: baseline regenerado porque el snapshot versionado no representaba el esquema TypeScript actual.
- `drizzle/meta/0001_snapshot.json`: estado posterior.
- `drizzle/meta/_journal.json`: nueva entrada `0001_omnichannel_platform`.
- Se retiró `drizzle/meta/0011_snapshot.json`: era un snapshot huérfano no citado por el journal y Drizzle lo prefería por nombre, reintroduciendo drift (`api_keys.key`). Es recuperable desde Git.

La migración no contiene `DROP TABLE`, `DROP COLUMN`, `DELETE` ni `TRUNCATE`. Crea ocho tablas, hace nullable `widget_id`/`visitor_id`, amplía el tamaño de `visitor_id` y añade columnas, FKs e índices del dominio.
Una ejecución posterior de `bun run db:generate` devuelve `No schema changes, nothing to migrate`.

## Despliegue seguro

1. Backup lógico y snapshot administrado; probar restauración antes del cambio.
2. Aplicar en staging con la misma versión PostgreSQL/extensiones.
3. Ejecutar `bun run db:verify-target` y `bun run db:migrate` con una URL explícita de staging.
4. Verificar conteos de conversaciones/mensajes antiguos, FKs e índices.
5. Desplegar código con IA deshabilitada por defecto y sin conexiones activas.
6. Conectar un activo TEST, validar webhook duplicado y entrega; luego canary por tenant.

## Compatibilidad y backfill

- Filas antiguas reciben `channel=webchat`, `provider=native` y `ai_mode=hybrid` por defecto.
- Los roles históricos de mensajes no se reescriben en SQL para evitar una inferencia destructiva. Antes de analítica direccional histórica se debe ejecutar un backfill revisado que derive `direction` de `role`.
- Widgets con allowlist vacío mantienen compatibilidad. En producción deben configurarse orígenes explícitos y entonces el endpoint falla cerrado para otros hosts.

## Rollback

El rollback operativo es bajar el código y dejar las columnas/tablas aditivas: evita pérdida. No se recomienda un `down` que borre historial. Si la migración falla antes de commit, PostgreSQL revierte la transacción; si el proveedor falla, desconectar el activo conserva conversación/auditoría y elimina credenciales locales.
