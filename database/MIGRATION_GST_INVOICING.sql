-- Migration: GST Accounting and Invoicing Layer
-- Description: Enhances finance system with company profiles, GST calculation logic, and robust invoicing.

BEGIN;

-- 1. Create company billing profile
CREATE TABLE IF NOT EXISTS public.company_billing_profile (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
    legal_name text NOT NULL,
    gstin text,
    pan text,
    billing_address text,
    state text NOT NULL,
    country text NOT NULL DEFAULT 'India',
    bank_details jsonb,
    invoice_prefix text NOT NULL DEFAULT 'RPM',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_billing_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authorized users" 
ON public.company_billing_profile FOR SELECT 
USING (public.get_user_role(workspace_id) IN ('super_admin', 'admin', 'manager', 'member'));

CREATE POLICY "Enable write access for super admin" 
ON public.company_billing_profile FOR ALL 
USING (public.get_user_role(workspace_id) = 'super_admin');

-- 2. Extend clients table
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS gstin text,
ADD COLUMN IF NOT EXISTS billing_state text,
ADD COLUMN IF NOT EXISTS billing_country text DEFAULT 'India',
ADD COLUMN IF NOT EXISTS tax_type text DEFAULT 'unregistered' CHECK (tax_type IN ('registered', 'unregistered'));

-- 3. Invoice Sequence Mechanism
CREATE TABLE IF NOT EXISTS public.invoice_sequences (
    workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
    last_sequence integer NOT NULL DEFAULT 0,
    current_year integer NOT NULL
);

ALTER TABLE public.invoice_sequences ENABLE ROW LEVEL SECURITY;
-- No direct policies, should be accessed via security definer function if needed, or by super admin

-- Function to generate the next invoice number securely
CREATE OR REPLACE FUNCTION public.generate_invoice_number(p_workspace_id uuid, p_prefix text)
RETURNS text AS $$
DECLARE
    v_year integer;
    v_seq integer;
    v_invoice_number text;
BEGIN
    v_year := extract(year from current_date);
    
    INSERT INTO public.invoice_sequences (workspace_id, last_sequence, current_year)
    VALUES (p_workspace_id, 1, v_year)
    ON CONFLICT (workspace_id) DO UPDATE
    SET 
        last_sequence = CASE WHEN public.invoice_sequences.current_year = v_year THEN public.invoice_sequences.last_sequence + 1 ELSE 1 END,
        current_year = v_year
    RETURNING last_sequence INTO v_seq;
    
    v_invoice_number := p_prefix || '/' || v_year || '/' || lpad(v_seq::text, 3, '0');
    RETURN v_invoice_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Extend invoices table
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS subtotal numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS taxable_amount numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS cgst_amount numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS sgst_amount numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS igst_amount numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_tax numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS grand_total numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS balance_due numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS billing_state_snapshot text;

-- 5. Create invoice line items table
CREATE TABLE IF NOT EXISTS public.invoice_line_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    description text NOT NULL,
    quantity numeric NOT NULL DEFAULT 1,
    rate numeric NOT NULL DEFAULT 0,
    tax_percentage numeric NOT NULL DEFAULT 0,
    amount numeric NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authorized users via invoice" 
ON public.invoice_line_items FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND public.get_user_role(i.workspace_id) IN ('super_admin', 'admin', 'manager', 'member')
  )
);

CREATE POLICY "Enable write access for authorized users via invoice" 
ON public.invoice_line_items FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND public.get_user_role(i.workspace_id) = 'super_admin'
  )
);


-- 6. Trigger for Payment Accounting (Auto update balance and status)
CREATE OR REPLACE FUNCTION public.update_invoice_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_invoice_amount numeric;
    v_total_paid numeric;
    v_new_balance numeric;
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Calculate total payments for this invoice
        SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
        FROM public.payments
        WHERE invoice_id = NEW.invoice_id;
        
        -- Get grand total of invoice
        SELECT grand_total INTO v_invoice_amount
        FROM public.invoices
        WHERE id = NEW.invoice_id;
        
        -- Update invoice balance and status
        v_new_balance := GREATEST(0, v_invoice_amount - v_total_paid);
        
        UPDATE public.invoices
        SET 
            balance_due = v_new_balance,
            status = CASE 
                        WHEN v_new_balance <= 0 THEN 'paid'
                        WHEN v_total_paid > 0 THEN 'partial'
                        ELSE status -- keep existing status (e.g. sent, overdue) if no payments
                     END
        WHERE id = NEW.invoice_id;
        
    ELSIF TG_OP = 'DELETE' THEN
        -- Calculate total payments after deletion
        SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
        FROM public.payments
        WHERE invoice_id = OLD.invoice_id;
        
        SELECT grand_total INTO v_invoice_amount
        FROM public.invoices
        WHERE id = OLD.invoice_id;
        
        v_new_balance := GREATEST(0, v_invoice_amount - v_total_paid);
        
        UPDATE public.invoices
        SET 
            balance_due = v_new_balance,
            status = CASE 
                        WHEN v_new_balance <= 0 THEN 'paid'
                        WHEN v_total_paid > 0 THEN 'partial'
                        WHEN v_total_paid = 0 THEN 'sent' -- Reset to sent if no payments left
                        ELSE status
                     END
        WHERE id = OLD.invoice_id;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_invoice_balance ON public.payments;
CREATE TRIGGER trg_update_invoice_balance
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.update_invoice_balance();

-- Apply trigger logic to existing invoices manually
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN SELECT id, COALESCE(amount, 0) as invoice_amount FROM public.invoices LOOP
        -- For legacy compatibility, assume amount is grand_total if grand_total is 0
        UPDATE public.invoices 
        SET grand_total = invoice_amount, 
            subtotal = invoice_amount, 
            taxable_amount = invoice_amount
        WHERE id = rec.id AND grand_total = 0;
    
        UPDATE public.invoices i
        SET balance_due = GREATEST(0, i.grand_total - COALESCE((SELECT SUM(amount) FROM public.payments WHERE invoice_id = i.id), 0))
        WHERE i.id = rec.id;
        
        UPDATE public.invoices i
        SET status = CASE WHEN i.balance_due <= 0 THEN 'paid' WHEN i.balance_due < i.grand_total THEN 'partial' ELSE i.status END
        WHERE i.id = rec.id;
    END LOOP;
END;
$$;

-- 7. Audit Logging integration
CREATE OR REPLACE FUNCTION public.audit_gst_invoice_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.audit_logs (workspace_id, action, entity_type, entity_id, user_id, details)
        VALUES (NEW.workspace_id, 'invoice_generated', 'invoice', NEW.id, NEW.created_by, 
            jsonb_build_object('invoice_number', NEW.invoice_number, 'grand_total', NEW.grand_total, 'total_tax', NEW.total_tax));
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status != NEW.status AND NEW.status = 'cancelled' THEN
            INSERT INTO public.audit_logs (workspace_id, action, entity_type, entity_id, user_id, details)
            VALUES (NEW.workspace_id, 'invoice_cancelled', 'invoice', NEW.id, auth.uid(), 
                jsonb_build_object('invoice_number', NEW.invoice_number));
        END IF;
        
        IF OLD.total_tax != NEW.total_tax THEN
            INSERT INTO public.audit_logs (workspace_id, action, entity_type, entity_id, user_id, details)
            VALUES (NEW.workspace_id, 'gst_values_changed', 'invoice', NEW.id, auth.uid(), 
                jsonb_build_object('old_tax', OLD.total_tax, 'new_tax', NEW.total_tax));
        END IF;
    END IF;
    RETURN NULL; -- AFTER trigger
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_gst_invoices ON public.invoices;
CREATE TRIGGER trg_audit_gst_invoices
AFTER INSERT OR UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.audit_gst_invoice_changes();

COMMIT;
