-- Ejecutar en Supabase SQL Editor para hacer opcionales los campos de domicilio y cobro en la tabla 'bingos'.

BEGIN;

ALTER TABLE public.bingos
    ALTER COLUMN address DROP NOT NULL,
    ALTER COLUMN neighborhood DROP NOT NULL,
    ALTER COLUMN locality DROP NOT NULL,
    ALTER COLUMN collection_locate DROP NOT NULL,
    ALTER COLUMN collection_date DROP NOT NULL;

COMMIT;
