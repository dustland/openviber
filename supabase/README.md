# OpenViber Supabase schema

This folder holds the **full database schema** for the OpenViber web app in a single file. Use it as the source of truth to create or reconcile your project’s database.

## Schema file

| File | Description |
|------|-------------|
| **`schema.sql`** | Full DDL for `public`: all tables, indexes, RLS, and policies. Safe to run on a fresh project (uses `CREATE TABLE IF NOT EXISTS` and `DROP POLICY IF EXISTS` where appropriate). |

Tables (in dependency order): `user_profiles`, `user_settings`, `environments`, `vibers`, `viber_nodes`, `messages`. All require Supabase Auth (`auth.users`).

## Applying the schema

### Option 1: Supabase Dashboard

1. Open your project → [SQL Editor](https://supabase.com/dashboard).
2. Paste the contents of `schema.sql` and run it.

### Option 2: Supabase CLI + psql

1. [Install the Supabase CLI](https://supabase.com/docs/guides/cli) and `psql`.
2. Get your database URL: Dashboard → Project Settings → Database (connection string).
3. From the repo root:
   ```bash
   psql "YOUR_DATABASE_URL" -f supabase/schema.sql
   ```

### Option 3: Local development

With `supabase start`, connect to the local DB and run `schema.sql` the same way (e.g. `psql` with the local connection string).

## Migrations folder

The `migrations/` folder is no longer used. The canonical schema is `schema.sql`. When you change the database (e.g. via Dashboard or MCP), update `schema.sql` so the repo stays in sync with the full schema.
