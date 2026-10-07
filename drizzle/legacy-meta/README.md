The active Drizzle chain is recorded in `../meta/_journal.json` and currently
ends at `0006_snapshot.json`. Snapshots from the source branch's separate
reconciliation chain are intentionally excluded so `drizzle-kit generate`
starts from the private repository's migration history.

`../0032_current_schema_reconciliation.sql` remains an idempotent legacy
upgrade artifact and is verified only against an isolated historical test
database by `../../scripts/verify-reconciliation-upgrade.ts`. New schema
changes belong in the active journaled chain.
