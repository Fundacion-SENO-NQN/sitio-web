-- Ejecutar en Supabase SQL Editor para agregar la columna 'settings' (preferencias por perfil) a la tabla 'users'.

BEGIN;

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMIT;
