-- OpenViber full database schema (public)
-- Apply this file to a fresh Supabase project to create all tables, RLS, and policies.
-- Requires: auth.users (Supabase Auth). Table order respects foreign keys.

-- =============================================================================
-- User profiles (synced from auth)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
  auth_user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text,
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
CREATE POLICY "Users can view own profile"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = auth_user_id);

DROP POLICY IF EXISTS "Service role can manage profiles" ON public.user_profiles;
CREATE POLICY "Service role can manage profiles"
  ON public.user_profiles FOR ALL
  USING (auth.role() = 'service_role');

-- =============================================================================
-- User settings (Supabase = source of truth; ~/.openviber/settings.yaml = cache)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_sources jsonb NOT NULL DEFAULT '{}',
  primary_coding_cli text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_settings_user_id_key UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS user_settings_user_id_idx ON public.user_settings(user_id);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own settings" ON public.user_settings;
CREATE POLICY "Users can read own settings"
  ON public.user_settings FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own settings" ON public.user_settings;
CREATE POLICY "Users can insert own settings"
  ON public.user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own settings" ON public.user_settings;
CREATE POLICY "Users can update own settings"
  ON public.user_settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- Environments (per-user; vibers are linked to an environment)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.environments (
  id text NOT NULL PRIMARY KEY,
  user_id text NOT NULL,
  name text NOT NULL,
  description text,
  type text NOT NULL DEFAULT 'github',
  repo_url text,
  repo_org text,
  repo_name text,
  repo_branch text,
  container_image text,
  working_dir text,
  setup_script text,
  network_access boolean NOT NULL DEFAULT true,
  persist_volume boolean NOT NULL DEFAULT true,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  variables jsonb NOT NULL DEFAULT '[]',
  secrets_encrypted jsonb NOT NULL DEFAULT '{}'
);

ALTER TABLE public.environments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own environments" ON public.environments;
CREATE POLICY "Users can select own environments"
  ON public.environments FOR SELECT
  USING ((user_id)::uuid = auth.uid());

DROP POLICY IF EXISTS "Users can insert own environments" ON public.environments;
CREATE POLICY "Users can insert own environments"
  ON public.environments FOR INSERT
  WITH CHECK ((user_id)::uuid = auth.uid());

DROP POLICY IF EXISTS "Users can update own environments" ON public.environments;
CREATE POLICY "Users can update own environments"
  ON public.environments FOR UPDATE
  USING ((user_id)::uuid = auth.uid())
  WITH CHECK ((user_id)::uuid = auth.uid());

DROP POLICY IF EXISTS "Users can delete own environments" ON public.environments;
CREATE POLICY "Users can delete own environments"
  ON public.environments FOR DELETE
  USING ((user_id)::uuid = auth.uid());

-- =============================================================================
-- Vibers (agents; optional link to environment)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.vibers (
  id text NOT NULL PRIMARY KEY,
  name text NOT NULL,
  platform text,
  version text,
  capabilities jsonb,
  last_connected timestamptz,
  last_disconnected timestamptz,
  total_tasks integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  environment_id text REFERENCES public.environments(id),
  node_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

ALTER TABLE public.vibers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select vibers for own environments" ON public.vibers;
CREATE POLICY "Users can select vibers for own environments"
  ON public.vibers FOR SELECT
  USING (
    environment_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.environments e
      WHERE e.id = vibers.environment_id AND (e.user_id)::uuid = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert vibers for own environments" ON public.vibers;
CREATE POLICY "Users can insert vibers for own environments"
  ON public.vibers FOR INSERT
  WITH CHECK (
    environment_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.environments e
      WHERE e.id = environment_id AND (e.user_id)::uuid = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update vibers for own environments" ON public.vibers;
CREATE POLICY "Users can update vibers for own environments"
  ON public.vibers FOR UPDATE
  USING (
    environment_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.environments e
      WHERE e.id = vibers.environment_id AND (e.user_id)::uuid = auth.uid()
    )
  )
  WITH CHECK (
    environment_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.environments e
      WHERE e.id = environment_id AND (e.user_id)::uuid = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete vibers for own environments" ON public.vibers;
CREATE POLICY "Users can delete vibers for own environments"
  ON public.vibers FOR DELETE
  USING (
    environment_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.environments e
      WHERE e.id = vibers.environment_id AND (e.user_id)::uuid = auth.uid()
    )
  );

-- =============================================================================
-- Viber nodes (onboarded devices; one per user)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.viber_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'My Viber',
  node_id text,
  onboard_token text UNIQUE,
  token_expires_at timestamptz,
  hub_url text,
  auth_token text,
  config jsonb DEFAULT '{}',
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.viber_nodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own nodes" ON public.viber_nodes;
CREATE POLICY "Users can view own nodes"
  ON public.viber_nodes FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own nodes" ON public.viber_nodes;
CREATE POLICY "Users can create own nodes"
  ON public.viber_nodes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own nodes" ON public.viber_nodes;
CREATE POLICY "Users can update own nodes"
  ON public.viber_nodes FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own nodes" ON public.viber_nodes;
CREATE POLICY "Users can delete own nodes"
  ON public.viber_nodes FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- Messages (chat/task messages per viber)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.messages (
  id text NOT NULL PRIMARY KEY,
  task_id text,
  thread_id text,
  viber_id text NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select messages for own vibers" ON public.messages;
CREATE POLICY "Users can select messages for own vibers"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vibers v
      JOIN public.environments e ON e.id = v.environment_id
      WHERE v.id = messages.viber_id AND (e.user_id)::uuid = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert messages for own vibers" ON public.messages;
CREATE POLICY "Users can insert messages for own vibers"
  ON public.messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vibers v
      JOIN public.environments e ON e.id = v.environment_id
      WHERE v.id = viber_id AND (e.user_id)::uuid = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update messages for own vibers" ON public.messages;
CREATE POLICY "Users can update messages for own vibers"
  ON public.messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.vibers v
      JOIN public.environments e ON e.id = v.environment_id
      WHERE v.id = messages.viber_id AND (e.user_id)::uuid = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vibers v
      JOIN public.environments e ON e.id = v.environment_id
      WHERE v.id = viber_id AND (e.user_id)::uuid = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete messages for own vibers" ON public.messages;
CREATE POLICY "Users can delete messages for own vibers"
  ON public.messages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.vibers v
      JOIN public.environments e ON e.id = v.environment_id
      WHERE v.id = messages.viber_id AND (e.user_id)::uuid = auth.uid()
    )
  );
