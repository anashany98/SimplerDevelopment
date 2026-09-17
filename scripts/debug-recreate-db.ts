// TEMPORARY debug helper (used by scripts/debug-boot.sh).
// The earlier failed deploy attempts left the (never-seeded) simplerdev
// database half-migrated: the drizzle baseline keeps re-running and failing on
// objects that already exist. This drops and recreates the empty database so
// migrations can apply cleanly on a fresh one. Delete together with
// docker-compose.debug.yml / scripts/debug-boot.sh after the investigation.
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[recreate-db] DATABASE_URL is not set');
  process.exit(1);
}
const adminUrl = url.replace(/\/simplerdev(\?.*)?$/, '/postgres');
const sql = postgres(adminUrl, { max: 1 });
try {
  await sql.unsafe('DROP DATABASE IF EXISTS simplerdev WITH (FORCE)');
  await sql.unsafe('CREATE DATABASE simplerdev');
  console.log('[recreate-db] database "simplerdev" dropped and recreated (empty)');
} finally {
  await sql.end();
}

// A freshly created database has NO extensions — the volume's initdb script
// (docker/initdb/01-extensions.sql) only runs on first cluster init, and the
// drop above wiped the ones it had created. Re-create them, or the drizzle
// baseline fails on its vector(1536) column / gin_trgm_ops indexes.
const app = postgres(url, { max: 1 });
try {
  await app.unsafe('CREATE EXTENSION IF NOT EXISTS vector');
  await app.unsafe('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  await app.unsafe('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  console.log('[recreate-db] extensions re-created (vector, pg_trgm, pgcrypto)');
} finally {
  await app.end();
}
