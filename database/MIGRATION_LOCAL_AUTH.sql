-- Add local authentication fields to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username text UNIQUE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS refresh_token text;
