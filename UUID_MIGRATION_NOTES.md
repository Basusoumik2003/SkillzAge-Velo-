# UUID user_id migration — what was changed for SkillzAge

SkillzAge's `users.id` is `UUID DEFAULT gen_random_uuid()` (not an auto-increment
INTEGER like InternzBee's). These files were adjusted so the workspace feature
works against a UUID-keyed users table.

## SQL (see workspace-db-export.zip)
- `backend/sql/schema.sql`: removed the `CREATE TABLE users ...` block (SkillzAge
  already owns this table) and replaced it with `ALTER TABLE users ADD COLUMN IF
  NOT EXISTS ...` for the 3 extra columns the workspace code needs
  (`avatar_url`, `last_seen_at`, `is_active`) that SkillzAge's users table
  doesn't have yet.
- Every `user_id` / `created_by` / `updated_by` / `uploaded_by` / `sent_by` /
  `resolved_by` / `admin_user_id` / `initiated_by_user_id` column that is a
  foreign key into `users(id)` was changed from `INTEGER` to `UUID` across
  `schema.sql` and all 73 files in `migrations/`.
- Each table's *own* primary key (e.g. `project_progress.id`) was left as
  `INTEGER GENERATED ALWAYS AS IDENTITY` — only columns that reference the
  `users` table were changed.

## Python (backend/app)
- `db/models.py`:
  - `User` model: `id` is now `UUID(as_uuid=True)`; `name` is aliased to the
    real column `full_name` (`Column("full_name", ...)`); dropped
    `resume_text` (doesn't exist in SkillzAge's users table).
  - `ProjectProgress.user_id`, `MentorChatMessage.user_id`,
    `AIUsageEvent.user_id`, `Subscription.user_id` → all now
    `UUID(as_uuid=True)`.
- `db/github_models.py`:
  - `GitHubRepository.user_id`, `CodeReview.user_id`,
    `GitHubAppSettings.updated_by` → all now `UUID(as_uuid=True)`.

## Node.js
- `adminService/src/routes/dashboardRoutes.js` and
  `userService/src/routes/userRoutes.js` (`POST /dashboard/presence/heartbeat`):
  replaced `Number(req.auth?.userId)` + integer validation with a UUID-format
  regex check on the string id.
- `adminService/src/routes/adminRoutes.js`
  (`POST /admin/project-assign/users/:userId/revert-abandoned`): same fix —
  `req.params.userId` is now validated/used as a UUID string, not `Number()`.

## Still needs your attention (not changed — out of workspace scope / too broad to safely auto-edit)
- `adminService/src/routes/adminRoutes.js` lines ~4998 and ~5043
  (admin "deactivate account" endpoints) still do
  `Number(req.params.id)` / `Number(req.auth.userId)`. These are
  coin/account-management endpoints bundled in the same file, not part of the
  workspace feature itself — fix the same way (UUID regex, no `Number()`) if
  you end up using them.
- **JWT/auth**: whichever service issues your login JWTs must put the UUID
  string as the token's user-id claim (not cast to a number). This export
  doesn't include `authenticationService`, since SkillzAge presumably has its
  own auth service — just make sure its token payload's user id is the UUID
  string, since every route above reads `req.auth.userId` directly.
- Every other Node.js query in these files that does
  `pool.query('... WHERE user_id = $1', [userId])` needs no change — `pg`
  passes UUID strings through fine as long as `userId` isn't coerced with
  `Number()`/`parseInt()` first (only the spots above did that).
- Frontend (`workspace-feature-export.zip`) stores/sends whatever id string
  the login API returns in `localStorage` via `lib/authStorage.js` — no code
  change needed there, it never assumes an integer id.
