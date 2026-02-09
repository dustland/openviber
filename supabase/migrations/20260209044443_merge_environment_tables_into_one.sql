-- Merge environment_vars and environment_secrets into environments (single table).
-- Only runs when public.environments exists. Adds variables + secrets_encrypted, migrates data, drops child tables.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'environments') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'environments' AND column_name = 'variables') THEN
      ALTER TABLE public.environments ADD COLUMN variables jsonb NOT NULL DEFAULT '[]';
      COMMENT ON COLUMN public.environments.variables IS 'Plain env vars: [{ "key": "x", "value": "y" }]';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'environments' AND column_name = 'secrets_encrypted') THEN
      ALTER TABLE public.environments ADD COLUMN secrets_encrypted jsonb NOT NULL DEFAULT '{}';
      COMMENT ON COLUMN public.environments.secrets_encrypted IS 'Encrypted secrets: { "key": "encrypted_value", ... }';
    END IF;
  END IF;
END $$;

-- Migrate from environment_vars
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'environment_vars') THEN
    UPDATE public.environments e
    SET variables = sub.agg
    FROM (
      SELECT environment_id, COALESCE(jsonb_agg(jsonb_build_object('key', key, 'value', value)), '[]') AS agg
      FROM public.environment_vars
      GROUP BY environment_id
    ) sub
    WHERE e.id = sub.environment_id;
  END IF;
END $$;

-- Migrate from environment_secrets
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'environment_secrets') THEN
    FOR r IN
      SELECT environment_id, jsonb_object_agg(key, encrypted_value) AS obj
      FROM public.environment_secrets
      GROUP BY environment_id
    LOOP
      UPDATE public.environments SET secrets_encrypted = COALESCE(secrets_encrypted, '{}') || r.obj WHERE id = r.environment_id;
    END LOOP;
  END IF;
END $$;

DROP TABLE IF EXISTS public.environment_vars;
DROP TABLE IF EXISTS public.environment_secrets;
