-- Ejecutar en Supabase SQL Editor ANTES de desplegar este backend.
BEGIN;

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS auth_version bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
    token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    email_snapshot text NOT NULL,
    auth_version bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    used_at timestamptz
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_created_idx
    ON public.password_reset_tokens (user_id, created_at DESC);

-- Acceso exclusivo del backend, nunca desde el cliente de Supabase del navegador.
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.password_reset_tokens FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON public.password_reset_tokens FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON public.password_reset_tokens FROM authenticated;
    END IF;
END $$;

COMMIT;
