# Workspace Feature — Database Setup

## ⚠️ Adapted for SkillzAge's UUID users table
SkillzAge already has its own `users` table with a UUID primary key
(`001_create_users_table`), unlike InternzBee's INTEGER identity column. This
export has been patched accordingly:
- `schema.sql` no longer creates a `users` table — it only `ALTER TABLE users
  ADD COLUMN IF NOT EXISTS ...`s in the 3 extra columns the workspace code
  needs (`avatar_url`, `last_seen_at`, `is_active`).
- Every `user_id`/`created_by`/`updated_by`/`uploaded_by`/`sent_by`/etc. column
  that used to be `INTEGER REFERENCES users(id)` is now `UUID REFERENCES
  users(id)`, across `schema.sql` and all migration files.
- Run **SkillzAge's own `001_create_users_table` migration first**, then this
  `schema.sql`, then the `migrations/` folder — in that order.
- See `UUID_MIGRATION_NOTES.md` in `workspace-backend-export.zip` for the
  matching Node.js/Python code changes (Number(userId) → UUID string, etc).

## How to run
On a fresh Postgres database, run in this exact order:
1. Your SkillzAge `001_create_users_table` migration (creates `users` with UUID `id`)
2. `backend/sql/schema.sql`
3. Every file in `backend/sql/migrations/` **in filename order** (they are date-prefixed, e.g. `psql -f` each one sorted alphabetically, or point your migration runner at this folder).

Running the full set (not just a subset) is required because many workspace tables have
foreign keys into other tables (`users`, `projects`, `companies`, etc.) and later migrations
add columns to tables created earlier in `schema.sql`. Skipping files will break FK
constraints or leave columns missing that the copied backend code expects.

## Tables relevant to the Workspace feature
(all already included by running schema.sql + migrations above — listed here just so you know
what to look for / verify after running)

**Project/workspace progress**
- project_progress
- project_stage_progress
- project_stage_documents
- stage_document_review_audits

**Project catalog/assignment**
- projects
- project_steps
- project_mentors
- demo_documents
- project_documents
- project_document_links
- document_chunks
- agent_document_access
- global_documents
- global_document_chunks
- project_global_document_access
- project_global_document_access_settings
- project_assignment_requests
- project_recommendation_logs

**GitHub + AI review pipeline**
- github_app_settings
- github_repositories
- github_commit_history
- github_activity_logs
- github_review_jobs
- github_review_job_results
- code_reviews
- scheduler_logs
- notification_history

**Themes/admin appearance**
- themes
- theme_assets
- theme_decorations
- theme_settings
- theme_asset_library

**Core/supporting**
- users
- companies
- app_settings
- admin_credentials

## Notes
- Any table not in the list above but present in schema.sql/migrations is unrelated to the
  workspace feature (payments, coupons, invoices, testimonials, self-intro reports, etc.) —
  safe to ignore/drop later if you want a lean DB, but leaving them is harmless.
- Double-check env vars for DB connection (`DATABASE_URL` / individual PG* vars) match what
  `backend/*/src/config/db.js` and `backend/app/db/database.py` expect in the new project.
