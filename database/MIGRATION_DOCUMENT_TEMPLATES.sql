-- Migration: Organization Document Templates
-- Description: Core system for custom branded document templates (invoices, receipts, offer letters, etc.)

BEGIN;

CREATE TABLE IF NOT EXISTS public.document_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name text NOT NULL,
    type text NOT NULL CHECK (type IN ('invoice', 'receipt', 'offer_letter', 'experience_letter', 'salary_slip', 'report', 'custom')),
    template_body text NOT NULL,
    header_config jsonb DEFAULT '{}'::jsonb,
    footer_config jsonb DEFAULT '{}'::jsonb,
    styles jsonb DEFAULT '{}'::jsonb,
    logo_url text,
    is_default boolean DEFAULT false,
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authorized users" 
ON public.document_templates FOR SELECT 
USING (public.get_user_role(workspace_id) IN ('super_admin', 'admin', 'manager', 'member'));

CREATE POLICY "Enable write access for super admin" 
ON public.document_templates FOR ALL 
USING (public.get_user_role(workspace_id) = 'super_admin');


CREATE TABLE IF NOT EXISTS public.document_template_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id uuid NOT NULL REFERENCES public.document_templates(id) ON DELETE CASCADE,
    version_number integer NOT NULL,
    name text NOT NULL,
    template_body text NOT NULL,
    header_config jsonb,
    footer_config jsonb,
    styles jsonb,
    logo_url text,
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.document_template_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authorized users" 
ON public.document_template_history FOR SELECT 
USING (public.get_user_role((SELECT workspace_id FROM public.document_templates WHERE id = template_id)) IN ('super_admin', 'admin', 'manager', 'member'));

CREATE POLICY "Enable write access for super admin" 
ON public.document_template_history FOR ALL 
USING (public.get_user_role((SELECT workspace_id FROM public.document_templates WHERE id = template_id)) = 'super_admin');


-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON public.document_templates
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

COMMIT;
