-- Ejecutar en Supabase SQL Editor para agregar la columna 'seller' a la tabla 'bingos'.

ALTER TABLE public.bingos
ADD COLUMN IF NOT EXISTS seller text;
