-- Migration: Add Multi-currency support to Clients
BEGIN;

ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS currency text DEFAULT 'INR';

ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS client_currency text DEFAULT 'INR',
ADD COLUMN IF NOT EXISTS exchange_rate numeric DEFAULT 1.0;

COMMIT;
