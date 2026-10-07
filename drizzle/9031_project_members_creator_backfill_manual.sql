-- Give every existing project's creator an explicit owner row when missing.
--
-- Two creation paths skipped the project_members insert:
--   1. lib/publishing/bootstrap.ts (the auto-created "Publishing" board)
--   2. app/api/admin/portal/projects/route.ts (staff-created projects)
-- Projects from either path were invisible in the portal's Projects list
-- (that endpoint only surfaces rows the caller is a member of) while still
-- counting in dashboard widgets and the list's `total` field.
--
-- Both paths are fixed in code; this backfills the rows they missed.
-- Safe to re-run (ON CONFLICT DO NOTHING on the (project_id, user_id) index).

INSERT INTO project_members (project_id, user_id, role, added_by)
SELECT p.id, p.created_by, 'owner', p.created_by
FROM projects p
WHERE p.created_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM project_members m
    WHERE m.project_id = p.id AND m.user_id = p.created_by
  )
ON CONFLICT DO NOTHING;
