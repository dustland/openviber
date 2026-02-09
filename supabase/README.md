# OpenViber Supabase migrations

These migrations create and update tables used by the OpenViber web app. Run them against your OpenViber Supabase project.

## Option 1: Supabase CLI (recommended)

1. Install the [Supabase CLI](https://supabase.com/docs/guides/cli).
2. Link your project:
   ```bash
   cd /path/to/openviber
   supabase link --project-ref YOUR_PROJECT_REF
   ```
3. Push migrations:
   ```bash
   supabase db push
   ```

## Option 2: SQL in Dashboard

1. Open your project in [Supabase Dashboard](https://supabase.com/dashboard) → SQL Editor.
2. Run the contents of each migration file in order (oldest timestamp first):
   - `20260209043856_create_openviber_user_settings.sql`
   - `20260209044443_merge_environment_tables_into_one.sql`

## Migrations

| Migration | Description |
|-----------|-------------|
| `20260209043856_create_openviber_user_settings` | Creates `user_settings` (skill sources, primary coding CLI). RLS for own row. |
| `20260209044443_merge_environment_tables_into_one` | Adds `variables` and `secrets_encrypted` to `environments`, migrates from `environment_vars` / `environment_secrets`, drops those tables. Safe if `environments` or child tables don’t exist. |

Other OpenViber tables (`environments`, `vibers`, `threads`, `messages`, `viber_nodes`) are not created by these migrations. Create them in your project if you need a fresh schema, or ensure they already exist with the columns the app expects.
