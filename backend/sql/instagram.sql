-- Ejecutar una sola vez en Supabase SQL Editor antes de desplegar el backend.
CREATE TABLE IF NOT EXISTS public.social_connections (
    platform text PRIMARY KEY,
    external_user_id text NOT NULL,
    username text NOT NULL,
    access_token_enc text NOT NULL,
    expires_at timestamptz NOT NULL,
    connected_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.social_oauth_states (
    state uuid PRIMARY KEY,
    platform text NOT NULL,
    initiated_by bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL
);

-- La publicación de Instagram es externa: registrar cada intento evita reintentos ciegos.
CREATE TABLE IF NOT EXISTS public.instagram_publications (
    request_id uuid PRIMARY KEY,
    status text NOT NULL CHECK (status IN ('processing', 'published', 'unknown', 'failed')),
    media_id text,
    message text,
    website_count integer NOT NULL DEFAULT 0,
    temp_cleaned_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
