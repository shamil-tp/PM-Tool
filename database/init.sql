CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text UNIQUE
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
BEGIN
    RETURN '00000000-0000-0000-0000-000000000000'::uuid;
END;
$$ LANGUAGE plpgsql;

--
-- PostgreSQL database dump
--

\restrict OyktAfsLl3UaseuGKOu2jv3o8QyfAGp5rtLAuygO4wtcZf4Ldk5Gl2iunpbFaLh

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: audit_gst_invoice_changes(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.audit_gst_invoice_changes() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$

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

$$;


ALTER FUNCTION public.audit_gst_invoice_changes() OWNER TO postgres;

--
-- Name: can_access_entity(text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_access_entity(p_entity_type text, p_entity_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$

DECLARE

    v_role text;

    v_table_name text;

    v_deleted_at timestamptz;

BEGIN

    SELECT role INTO v_role FROM public.users WHERE id = auth.uid();

    IF v_role IS NULL THEN RETURN false; END IF;

    

    -- Determine table name

    v_table_name := p_entity_type || 's';

    IF p_entity_type = 'comment' THEN

        v_table_name := 'universal_comments';

    END IF;



    -- Verify Soft Deletion for supported entities (Super Admin bypasses this)

    BEGIN

        IF p_entity_type IN ('task', 'project', 'epic', 'sprint', 'decision') THEN

            EXECUTE format('SELECT deleted_at FROM public.%I WHERE id = $1', v_table_name) INTO v_deleted_at USING p_entity_id;

            IF v_role != 'super_admin' AND v_deleted_at IS NOT NULL THEN

                RETURN false;

            END IF;

        ELSIF p_entity_type = 'comment' THEN

            DECLARE

                v_comment_entity_type text;

                v_comment_entity_id uuid;

            BEGIN

                SELECT entity_type, entity_id, deleted_at INTO v_comment_entity_type, v_comment_entity_id, v_deleted_at 

                FROM public.universal_comments WHERE id = p_entity_id;

                

                IF v_role != 'super_admin' AND v_deleted_at IS NOT NULL THEN

                    RETURN false;

                END IF;

                

                -- Verify parent entity access

                RETURN public.can_access_entity(v_comment_entity_type, v_comment_entity_id);

            END;

        END IF;

    EXCEPTION WHEN OTHERS THEN

        -- Fallback if table or deleted_at column doesn't exist

    END;



    -- Super Admin & PM can access everything active in their workspace

    IF v_role IN ('super_admin', 'pm') THEN RETURN true; END IF;



    -- Viewer & Developer

    IF p_entity_type = 'task' THEN

        RETURN EXISTS (SELECT 1 FROM public.tasks WHERE id = p_entity_id AND assignee_id = auth.uid());

    END IF;



    -- Project, Epic, Sprint, Decision are visible to the workspace.

    RETURN true;

END;

$_$;


ALTER FUNCTION public.can_access_entity(p_entity_type text, p_entity_id uuid) OWNER TO postgres;

--
-- Name: can_insert_entity_file(text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_insert_entity_file(p_entity_type text, p_entity_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$

DECLARE

    v_role text;

    v_table_name text;

    v_deleted_at timestamptz;

BEGIN

    SELECT role INTO v_role FROM public.users WHERE id = auth.uid();

    IF v_role = 'viewer' THEN RETURN false; END IF;



    -- Determine table name

    v_table_name := p_entity_type || 's';

    IF p_entity_type = 'comment' THEN

        v_table_name := 'universal_comments';

    END IF;



    -- Check Soft Deletion (No one can insert into a deleted entity, not even super admin, logically, but prompt said "Super Admin: can access archived records", not insert. Let's block insert if deleted.)

    BEGIN

        IF p_entity_type IN ('task', 'project', 'epic', 'sprint', 'decision') THEN

            EXECUTE format('SELECT deleted_at FROM public.%I WHERE id = $1', v_table_name) INTO v_deleted_at USING p_entity_id;

            IF v_deleted_at IS NOT NULL THEN RETURN false; END IF;

        ELSIF p_entity_type = 'comment' THEN

            SELECT deleted_at INTO v_deleted_at FROM public.universal_comments WHERE id = p_entity_id;

            IF v_deleted_at IS NOT NULL THEN RETURN false; END IF;

        END IF;

    EXCEPTION WHEN OTHERS THEN

        -- Fallback

    END;



    IF v_role IN ('super_admin', 'pm') THEN RETURN true; END IF;



    IF p_entity_type = 'task' THEN

        RETURN EXISTS (SELECT 1 FROM public.tasks WHERE id = p_entity_id AND assignee_id = auth.uid());

    ELSIF p_entity_type = 'comment' THEN

        RETURN EXISTS (SELECT 1 FROM public.universal_comments WHERE id = p_entity_id AND user_id = auth.uid());

    END IF;



    RETURN false;

END;

$_$;


ALTER FUNCTION public.can_insert_entity_file(p_entity_type text, p_entity_id uuid) OWNER TO postgres;

--
-- Name: can_manage_entity_file(text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_manage_entity_file(p_entity_type text, p_entity_id uuid, p_uploaded_by uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$

DECLARE

    v_role text;

    v_table_name text;

    v_deleted_at timestamptz;

BEGIN

    SELECT role INTO v_role FROM public.users WHERE id = auth.uid();

    

    -- Check Soft Deletion (Block modifications if entity is deleted)

    v_table_name := p_entity_type || 's';

    IF p_entity_type = 'comment' THEN

        v_table_name := 'universal_comments';

    END IF;



    BEGIN

        IF p_entity_type IN ('task', 'project', 'epic', 'sprint', 'decision') THEN

            EXECUTE format('SELECT deleted_at FROM public.%I WHERE id = $1', v_table_name) INTO v_deleted_at USING p_entity_id;

            IF v_deleted_at IS NOT NULL THEN RETURN false; END IF;

        ELSIF p_entity_type = 'comment' THEN

            SELECT deleted_at INTO v_deleted_at FROM public.universal_comments WHERE id = p_entity_id;

            IF v_deleted_at IS NOT NULL THEN RETURN false; END IF;

        END IF;

    EXCEPTION WHEN OTHERS THEN

        -- Fallback

    END;



    -- Uploader check

    IF p_uploaded_by = auth.uid() THEN RETURN true; END IF;



    IF v_role IN ('super_admin', 'pm') THEN RETURN true; END IF;



    IF p_entity_type = 'task' THEN

        RETURN EXISTS (SELECT 1 FROM public.tasks WHERE id = p_entity_id AND assignee_id = auth.uid());

    END IF;



    IF p_entity_type = 'comment' THEN

        RETURN EXISTS (SELECT 1 FROM public.universal_comments WHERE id = p_entity_id AND user_id = auth.uid());

    END IF;



    RETURN false;

END;

$_$;


ALTER FUNCTION public.can_manage_entity_file(p_entity_type text, p_entity_id uuid, p_uploaded_by uuid) OWNER TO postgres;

--
-- Name: check_financial_period_lock(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_financial_period_lock() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$

DECLARE

    v_month integer;

    v_year integer;

    v_status text;

    v_workspace_id uuid;

    v_date date;

BEGIN

    -- Determine the date and workspace based on the operation

    IF TG_TABLE_NAME = 'invoices' THEN

        v_date := COALESCE(NEW.issue_date, OLD.issue_date, CURRENT_DATE);

        v_workspace_id := COALESCE(NEW.workspace_id, OLD.workspace_id);

    ELSIF TG_TABLE_NAME = 'payments' THEN

        v_date := COALESCE(NEW.payment_date, OLD.payment_date, CURRENT_DATE);

        IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN

            SELECT workspace_id INTO v_workspace_id FROM invoices WHERE id = NEW.invoice_id;

        ELSE

            SELECT workspace_id INTO v_workspace_id FROM invoices WHERE id = OLD.invoice_id;

        END IF;

    ELSIF TG_TABLE_NAME = 'expenses' THEN

        v_date := COALESCE(NEW.date, OLD.date, CURRENT_DATE);

        v_workspace_id := COALESCE(NEW.workspace_id, OLD.workspace_id);

    END IF;



    -- Extract month and year

    v_month := EXTRACT(MONTH FROM v_date);

    v_year := EXTRACT(YEAR FROM v_date);



    -- Check if period is closed

    SELECT status INTO v_status FROM public.financial_periods 

    WHERE workspace_id = v_workspace_id AND month = v_month AND year = v_year;



    IF v_status = 'closed' THEN

        RAISE EXCEPTION 'Cannot modify financial records in a closed period. Create a financial adjustment instead.';

    END IF;



    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

END;

$$;


ALTER FUNCTION public.check_financial_period_lock() OWNER TO postgres;

--
-- Name: close_financial_period(uuid, integer, integer, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.close_financial_period(p_workspace_id uuid, p_month integer, p_year integer, p_user_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$

DECLARE

    v_period_id uuid;

    v_total_revenue numeric := 0;

    v_total_salary_expense numeric := 0;

    v_total_other_expenses numeric := 0;

    v_employee_count integer := 0;

    v_client_count integer := 0;

    v_project_count integer := 0;

BEGIN

    -- Check if already exists

    SELECT id INTO v_period_id FROM public.financial_periods 

    WHERE workspace_id = p_workspace_id AND month = p_month AND year = p_year;



    IF v_period_id IS NULL THEN

        INSERT INTO public.financial_periods (workspace_id, month, year, status, closed_by, closed_at)

        VALUES (p_workspace_id, p_month, p_year, 'closed', p_user_id, now())

        RETURNING id INTO v_period_id;

    ELSE

        UPDATE public.financial_periods 

        SET status = 'closed', closed_by = p_user_id, closed_at = now()

        WHERE id = v_period_id;

    END IF;



    -- Calculate Revenue (Payments in month)

    SELECT COALESCE(SUM(amount), 0) INTO v_total_revenue 

    FROM public.payments p

    JOIN public.invoices i ON i.id = p.invoice_id

    WHERE i.workspace_id = p_workspace_id AND EXTRACT(MONTH FROM p.payment_date) = p_month AND EXTRACT(YEAR FROM p.payment_date) = p_year;



    -- Calculate Salary (Active employees from salaries table)

    SELECT COALESCE(SUM(base_salary), 0), COUNT(id) INTO v_total_salary_expense, v_employee_count 

    FROM public.salaries 

    WHERE workspace_id = p_workspace_id;



    -- Calculate Other Expenses

    SELECT COALESCE(SUM(amount), 0) INTO v_total_other_expenses 

    FROM public.expenses 

    WHERE workspace_id = p_workspace_id AND EXTRACT(MONTH FROM date) = p_month AND EXTRACT(YEAR FROM date) = p_year;



    -- Counters

    SELECT COUNT(id) INTO v_client_count FROM public.clients WHERE workspace_id = p_workspace_id AND status = 'active';

    SELECT COUNT(id) INTO v_project_count FROM public.projects WHERE workspace_id = p_workspace_id AND deleted_at IS NULL;



    -- Store Snapshot

    INSERT INTO public.financial_snapshots (

        workspace_id, period_id, total_revenue, total_salary_expense, total_other_expenses, net_profit, 

        employee_count, client_count, project_count

    ) VALUES (

        p_workspace_id, v_period_id, v_total_revenue, v_total_salary_expense, v_total_other_expenses, 

        (v_total_revenue - v_total_salary_expense - v_total_other_expenses),

        v_employee_count, v_client_count, v_project_count

    )

    ON CONFLICT (period_id) DO UPDATE SET 

        total_revenue = EXCLUDED.total_revenue,

        total_salary_expense = EXCLUDED.total_salary_expense,

        total_other_expenses = EXCLUDED.total_other_expenses,

        net_profit = EXCLUDED.net_profit,

        employee_count = EXCLUDED.employee_count,

        client_count = EXCLUDED.client_count,

        project_count = EXCLUDED.project_count;



    -- Log activity

    INSERT INTO public.activity_logs (workspace_id, actor_id, action, metadata)

            VALUES (p_workspace_id, p_user_id, 'period_closed', jsonb_build_object('entity_type', 'financial_period', 'entity_id', v_period_id) || jsonb_build_object('month', p_month, 'year', p_year));



    RETURN v_period_id;

END;

$$;


ALTER FUNCTION public.close_financial_period(p_workspace_id uuid, p_month integer, p_year integer, p_user_id uuid) OWNER TO postgres;

--
-- Name: current_workspace(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.current_workspace() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$

  SELECT workspace_id FROM users WHERE id = auth.uid() LIMIT 1

$$;


ALTER FUNCTION public.current_workspace() OWNER TO postgres;

--
-- Name: enforce_developer_task_restrictions(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.enforce_developer_task_restrictions() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$

DECLARE

  v_role text;

BEGIN

  -- Lookup the role of the current user

  SELECT role INTO v_role FROM public.users WHERE id = auth.uid() LIMIT 1;



  -- Only restrict developers ΓÇö PMs/super_admins have full access

  IF v_role IS DISTINCT FROM 'developer' THEN

    RETURN NEW;

  END IF;



  -- Block 1: Developers cannot reassign tasks

  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN

    RAISE EXCEPTION 'Unauthorized: Developers cannot reassign tasks. Contact your PM.';

  END IF;



  -- Block 2: Developers cannot move tasks between projects

  IF NEW.project_id IS DISTINCT FROM OLD.project_id THEN

    RAISE EXCEPTION 'Unauthorized: Developers cannot move tasks between projects.';

  END IF;



  -- Block 3: Developers cannot modify governance/analytics fields

  IF NEW.confidence IS DISTINCT FROM OLD.confidence THEN

    RAISE EXCEPTION 'Unauthorized: Developers cannot modify confidence ratings.';

  END IF;



  IF NEW.risk IS DISTINCT FROM OLD.risk THEN

    RAISE EXCEPTION 'Unauthorized: Developers cannot modify risk assessments.';

  END IF;



  IF NEW.delay_drift_days IS DISTINCT FROM OLD.delay_drift_days THEN

    RAISE EXCEPTION 'Unauthorized: Developers cannot modify delay drift values.';

  END IF;



  IF NEW.predicted_completion IS DISTINCT FROM OLD.predicted_completion THEN

    RAISE EXCEPTION 'Unauthorized: Developers cannot modify predicted completion dates.';

  END IF;



  -- Block 4: Developers cannot modify priority (only PMs decide priority)

  IF NEW.priority IS DISTINCT FROM OLD.priority THEN

    RAISE EXCEPTION 'Unauthorized: Developers cannot modify task priority.';

  END IF;



  RETURN NEW;

END;

$$;


ALTER FUNCTION public.enforce_developer_task_restrictions() OWNER TO postgres;

--
-- Name: enforce_task_completion_governance(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.enforce_task_completion_governance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$

DECLARE

  active_wait_state_count INT;

  unresolved_dependency_count INT;

BEGIN

  -- Only run checks if the status is being changed to 'done'

  IF NEW.status = 'done' AND OLD.status != 'done' THEN

    

    -- Check for active wait states targeting this task

    SELECT COUNT(*)

    INTO active_wait_state_count

    FROM wait_states

    WHERE target_id = NEW.id

      AND target_type = 'task'

      AND status = 'active';



    IF active_wait_state_count > 0 THEN

      RAISE EXCEPTION 'Governance Violation: Cannot complete task with active wait states.';

    END IF;



    -- Check for unresolved dependencies blocking this task

    SELECT COUNT(*)

    INTO unresolved_dependency_count

    FROM task_dependencies

    WHERE task_id = NEW.id

      AND resolved = false;



    IF unresolved_dependency_count > 0 THEN

      RAISE EXCEPTION 'Governance Violation: Cannot complete task with unresolved dependencies.';

    END IF;

    

  END IF;



  RETURN NEW;

END;

$$;


ALTER FUNCTION public.enforce_task_completion_governance() OWNER TO postgres;

--
-- Name: generate_invoice_number(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.generate_invoice_number(p_workspace_id uuid, p_prefix text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$

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

$$;


ALTER FUNCTION public.generate_invoice_number(p_workspace_id uuid, p_prefix text) OWNER TO postgres;

--
-- Name: get_operational_intelligence(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_operational_intelligence(p_workspace_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$

DECLARE

  v_delivery_confidence NUMERIC;

  v_execution_pressure  NUMERIC;

  v_daily_fatigue       NUMERIC;

  v_risk_forecast       NUMERIC;

  v_total_decay_hours   NUMERIC := 0;

  v_pressure_score      NUMERIC := 0;



  v_active_project      RECORD;

  v_expected            NUMERIC;

  v_spread              NUMERIC;

  v_new_worst           NUMERIC;

  v_new_best            NUMERIC;



  v_active_tasks        INT;

  v_blocked_tasks       INT;



  v_confidence_risk     NUMERIC;

  v_fatigue_risk        NUMERIC;

BEGIN

  -- ΓöÇΓöÇ 1. Delivery Confidence & Daily Fatigue ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

  -- Aggregates task-level PERT from every active, non-archived project.

  FOR v_active_project IN

    SELECT

      p.id,

      COALESCE(SUM((t.pert_best + 4 * t.pert_likely + t.pert_worst) / 6.0), 0) AS expected,

      COALESCE(SUM(POWER((t.pert_worst - t.pert_best) / 6.0, 2)), 0)            AS variance

    FROM projects p

    LEFT JOIN tasks t

      ON t.project_id = p.id

     AND t.pert_best  > 0

     AND t.pert_likely > 0

     AND t.pert_worst > 0

    WHERE p.workspace_id = p_workspace_id

      AND p.status NOT IN ('deployed', 'done', 'archived')

      AND p.deleted_at IS NULL

    GROUP BY p.id

  LOOP

    v_expected  := v_active_project.expected;

    v_new_worst := v_expected + (2.0 * SQRT(v_active_project.variance));



    IF v_new_worst > v_expected THEN

      v_total_decay_hours := v_total_decay_hours + (v_new_worst - v_expected);

    END IF;



    v_new_best := GREATEST(0, v_expected - (2.0 * SQRT(v_active_project.variance)));

    v_spread   := GREATEST(0, v_new_worst - v_new_best);



    IF v_spread > 0 AND v_expected > 0 THEN

      v_pressure_score := v_pressure_score + ((v_spread / GREATEST(v_expected, 1.0)) * 10.0);

    END IF;

  END LOOP;



  v_delivery_confidence := GREATEST(0, 100.0 - (v_total_decay_hours * 0.5));

  v_daily_fatigue       := v_total_decay_hours;



  -- ΓöÇΓöÇ 2. Execution Pressure ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

  -- Uses GLOBAL task counts ΓÇö not paginated, not filtered by visible projects.

  SELECT

    COUNT(*) FILTER (WHERE status IN ('blocked', 'triage')),

    COUNT(*) FILTER (WHERE status <> 'done')

  INTO v_blocked_tasks, v_active_tasks

  FROM tasks

  WHERE workspace_id = p_workspace_id;



  IF v_active_tasks > 0 THEN

    v_pressure_score := v_pressure_score

      + ((v_blocked_tasks::NUMERIC / v_active_tasks::NUMERIC) * 40.0);

  END IF;



  v_execution_pressure := LEAST(100, v_pressure_score);



  -- ΓöÇΓöÇ 3. Risk Forecast ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

  v_confidence_risk := 100.0 - v_delivery_confidence;

  v_fatigue_risk    := LEAST(100, v_daily_fatigue * 2.0);

  v_risk_forecast   := LEAST(100,

    (v_confidence_risk * 0.45) +

    (v_execution_pressure * 0.35) +

    (v_fatigue_risk * 0.20)

  );



  RETURN jsonb_build_object(

    'deliveryConfidence', ROUND(v_delivery_confidence, 1),

    'executionPressure',  ROUND(v_execution_pressure,  1),

    'dailyFatigue',       ROUND(v_daily_fatigue,       1),

    'riskForecast',       ROUND(v_risk_forecast,        1)

  );

END;

$$;


ALTER FUNCTION public.get_operational_intelligence(p_workspace_id uuid) OWNER TO postgres;

--
-- Name: get_user_role(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_user_role(target_workspace_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$ DECLARE v_role text; BEGIN SELECT role INTO v_role FROM public.users WHERE id = auth.uid() AND workspace_id = target_workspace_id; RETURN v_role; END; $$;


ALTER FUNCTION public.get_user_role(target_workspace_id uuid) OWNER TO postgres;

--
-- Name: is_approved_user(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_approved_user() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$

BEGIN

  RETURN EXISTS (

    SELECT 1 FROM profiles

    WHERE id = auth.uid()::text

    AND approved = true

  );

END;

$$;


ALTER FUNCTION public.is_approved_user() OWNER TO postgres;

--
-- Name: log_finance_activity(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.log_finance_activity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$

BEGIN

    IF TG_TABLE_NAME = 'invoices' THEN

        IF TG_OP = 'INSERT' THEN

            INSERT INTO public.activity_logs (workspace_id, actor_id, action, metadata)

            VALUES (NEW.workspace_id, NEW.created_by, 'invoice_created', jsonb_build_object('entity_type', 'invoice', 'entity_id', NEW.id) || jsonb_build_object('invoice_number', NEW.invoice_number, 'amount', NEW.amount));

        ELSIF TG_OP = 'UPDATE' THEN

            IF NEW.status != OLD.status THEN

                INSERT INTO public.activity_logs (workspace_id, actor_id, action, metadata)

            VALUES (NEW.workspace_id, auth.uid(), 'invoice_status_changed', jsonb_build_object('entity_type', 'invoice', 'entity_id', NEW.id) || jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status));

            END IF;

        END IF;

    ELSIF TG_TABLE_NAME = 'payments' THEN

        IF TG_OP = 'INSERT' THEN

            DECLARE

                v_workspace_id uuid;

            BEGIN

                SELECT workspace_id INTO v_workspace_id FROM public.invoices WHERE id = NEW.invoice_id;

                INSERT INTO public.activity_logs (workspace_id, actor_id, action, metadata)

            VALUES (v_workspace_id, NEW.created_by, 'payment_received', jsonb_build_object('entity_type', 'payment', 'entity_id', NEW.id) || jsonb_build_object('amount', NEW.amount, 'reference', NEW.reference_number));

            END;

        END IF;

    ELSIF TG_TABLE_NAME = 'expenses' THEN

        IF TG_OP = 'INSERT' THEN

            INSERT INTO public.activity_logs (workspace_id, actor_id, action, metadata)

            VALUES (NEW.workspace_id, NEW.created_by, 'expense_added', jsonb_build_object('entity_type', 'expense', 'entity_id', NEW.id) || jsonb_build_object('amount', NEW.amount, 'category', NEW.category));

        ELSIF TG_OP = 'DELETE' THEN

            INSERT INTO public.activity_logs (workspace_id, actor_id, action, metadata)

            VALUES (OLD.workspace_id, auth.uid(), 'expense_deleted', jsonb_build_object('entity_type', 'expense', 'entity_id', OLD.id) || jsonb_build_object('amount', OLD.amount, 'category', OLD.category));

        END IF;

    END IF;

    RETURN NULL;

END;

$$;


ALTER FUNCTION public.log_finance_activity() OWNER TO postgres;

--
-- Name: log_financial_adjustment(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.log_financial_adjustment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$

DECLARE

    v_workspace_id uuid;

BEGIN

    SELECT workspace_id INTO v_workspace_id FROM public.financial_periods WHERE id = NEW.period_id;

    

    INSERT INTO public.activity_logs (workspace_id, actor_id, action, metadata)

            VALUES (v_workspace_id, NEW.created_by, 'adjustment_added', jsonb_build_object('entity_type', 'financial_adjustment', 'entity_id', NEW.id) || jsonb_build_object('type', NEW.type, 'amount', NEW.amount, 'reason', NEW.reason));

    

    RETURN NEW;

END;

$$;


ALTER FUNCTION public.log_financial_adjustment() OWNER TO postgres;

--
-- Name: log_recurring_task_activity(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.log_recurring_task_activity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$

BEGIN

    IF TG_OP = 'INSERT' THEN

        INSERT INTO public.activity_logs (workspace_id, actor_id, action, metadata)

            VALUES (NEW.workspace_id, NEW.created_by, 'recurring_task_created', jsonb_build_object('entity_type', 'project', 'entity_id', NEW.project_id) || jsonb_build_object('title', NEW.title, 'type', NEW.recurrence_type));

    ELSIF TG_OP = 'UPDATE' THEN

        IF NEW.is_active != OLD.is_active OR NEW.recurrence_type != OLD.recurrence_type THEN

            INSERT INTO public.activity_logs (workspace_id, actor_id, action, metadata) VALUES (NEW.workspace_id, COALESCE(auth.uid(), NEW.created_by), 'recurring_schedule_changed', jsonb_build_object('entity_type', 'project', 'entity_id', NEW.project_id, 'title', NEW.title, 'type', NEW.recurrence_type, 'is_active', NEW.is_active));

        END IF;

    END IF;

    RETURN NEW;

END;

$$;


ALTER FUNCTION public.log_recurring_task_activity() OWNER TO postgres;

--
-- Name: prevent_role_escalation(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.prevent_role_escalation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$

BEGIN

  -- FIX: Added public. prefix to workspaces

  IF EXISTS (SELECT 1 FROM public.workspaces WHERE id = NEW.workspace_id AND owner_id = NEW.id) THEN

    RETURN NEW;

  END IF;



  IF OLD.workspace_id IS NOT NULL AND NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN

    RAISE EXCEPTION 'Unauthorized: Cannot migrate workspaces.';

  END IF;



  IF OLD.role IS NOT NULL AND NEW.role IS DISTINCT FROM OLD.role THEN

    IF NOT EXISTS (

      SELECT 1 FROM public.users me 

      WHERE me.id = auth.uid() 

        AND me.workspace_id = OLD.workspace_id 

        AND me.role = 'super_admin'

    ) THEN

      RAISE EXCEPTION 'Unauthorized: Only super_admins can modify roles.';

    END IF;

  END IF;



  RETURN NEW;

END;

$$;


ALTER FUNCTION public.prevent_role_escalation() OWNER TO postgres;

--
-- Name: process_recurring_tasks(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.process_recurring_tasks() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$

DECLARE

    t_record RECORD;

    new_task_id uuid;

    next_date timestamptz;

    generated_count integer := 0;

BEGIN

    FOR t_record IN 

        SELECT * FROM recurring_task_templates 

        WHERE is_active = true 

          AND next_run_at <= now() 

          AND deleted_at IS NULL

          AND (end_date IS NULL OR now() <= end_date)

    LOOP

        -- Calculate next run

        IF t_record.recurrence_type = 'daily' THEN

            next_date := t_record.next_run_at + INTERVAL '1 day';

        ELSIF t_record.recurrence_type = 'weekly' THEN

            next_date := t_record.next_run_at + INTERVAL '1 week';

        ELSIF t_record.recurrence_type = 'monthly' THEN

            next_date := t_record.next_run_at + INTERVAL '1 month';

        ELSIF t_record.recurrence_type = 'yearly' THEN

            next_date := t_record.next_run_at + INTERVAL '1 year';

        ELSIF t_record.recurrence_type = 'custom' THEN

            -- Fallback custom interval logic (defaults to 1 week if not properly defined)

            next_date := t_record.next_run_at + (COALESCE((t_record.recurrence_rule->>'interval_days')::integer, 7) || ' days')::interval;

        ELSE

            next_date := t_record.next_run_at + INTERVAL '1 week';

        END IF;



        -- Ensure next_date is in the future (catch up)

        WHILE next_date <= now() LOOP

            IF t_record.recurrence_type = 'daily' THEN next_date := next_date + INTERVAL '1 day';

            ELSIF t_record.recurrence_type = 'weekly' THEN next_date := next_date + INTERVAL '1 week';

            ELSIF t_record.recurrence_type = 'monthly' THEN next_date := next_date + INTERVAL '1 month';

            ELSE next_date := next_date + INTERVAL '1 week';

            END IF;

        END LOOP;



        -- Insert the Task

        INSERT INTO tasks (

            workspace_id, project_id, assignee_id, name, description, status, priority

        ) VALUES (

            t_record.workspace_id, t_record.project_id, t_record.assigned_to, t_record.title, t_record.description, 'backlog', 'medium'

        ) RETURNING id INTO new_task_id;



        -- Log History

        INSERT INTO recurring_task_history (template_id, generated_task_id)

        VALUES (t_record.id, new_task_id);



        -- Insert Activity Log for the generated task

        INSERT INTO workspace_activity (

            workspace_id, entity_type, entity_id, actor_id, action, details

        ) VALUES (

            t_record.workspace_id, 'project', t_record.project_id, t_record.created_by, 'recurring_task_generated',

            jsonb_build_object('task_id', new_task_id, 'title', t_record.title)

        );

        

        -- Generate notification for assignment if assigned

        IF t_record.assigned_to IS NOT NULL THEN

            INSERT INTO notifications (

                workspace_id, user_id, type, title, message, source_entity_type, source_entity_id, route_path, created_at

            ) VALUES (

                t_record.workspace_id, t_record.assigned_to, 'task_assignment', 

                'Recurring Task Generated: ' || t_record.title,

                'You have been assigned a newly generated recurring task.',

                'task', new_task_id, '/execution?task=' || new_task_id, now()

            );

        END IF;



        -- Update Template

        UPDATE recurring_task_templates 

        SET next_run_at = next_date,

            updated_at = now()

        WHERE id = t_record.id;

        

        generated_count := generated_count + 1;

    END LOOP;



    RETURN jsonb_build_object('generated_count', generated_count);

END;

$$;


ALTER FUNCTION public.process_recurring_tasks() OWNER TO postgres;

--
-- Name: search_workspace(text, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.search_workspace(p_query text, p_limit integer DEFAULT 50) RETURNS TABLE(entity_type text, entity_id uuid, title text, context text, last_updated timestamp with time zone, owner_id uuid, rank real)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$

DECLARE

    v_workspace_id uuid;

    v_query text := '%' || p_query || '%';

BEGIN

    v_workspace_id := public.current_workspace();

    

    RETURN QUERY

    -- Projects

    SELECT 

        'project'::text as entity_type,

        id as entity_id,

        name as title,

        status || ' ┬╖ ' || execution_mode as context,

        updated_at as last_updated,

        owner_id as owner_id,

        (CASE WHEN name ILIKE p_query THEN 100 WHEN name ILIKE v_query THEN 50 ELSE 0 END)::real as rank

    FROM public.projects

    WHERE workspace_id = v_workspace_id AND name ILIKE v_query AND deleted_at IS NULL AND public.can_access_entity('project', id)

    

    UNION ALL

    

    -- Tasks

    SELECT 

        'task'::text as entity_type,

        id as entity_id,

        name as title,

        status || ' ┬╖ Priority: ' || priority as context,

        updated_at as last_updated,

        assignee_id as owner_id,

        (CASE 

            WHEN name ILIKE p_query THEN 100 

            WHEN assignee_id = auth.uid() THEN 80 

            WHEN name ILIKE v_query THEN 50 

            ELSE 0 

        END)::real as rank

    FROM public.tasks

    WHERE workspace_id = v_workspace_id AND name ILIKE v_query AND deleted_at IS NULL AND public.can_access_entity('task', id)

    

    UNION ALL

    

    -- Files

    SELECT 

        'file'::text as entity_type,

        id as entity_id,

        file_name as title,

        file_type || ' ┬╖ ' || (file_size/1024) || 'KB' as context,

        updated_at as last_updated,

        uploaded_by as owner_id,

        (CASE WHEN file_name ILIKE p_query THEN 100 WHEN file_name ILIKE v_query THEN 50 ELSE 0 END)::real as rank

    FROM public.workspace_files

    WHERE workspace_id = v_workspace_id AND file_name ILIKE v_query AND deleted_at IS NULL AND public.can_access_entity(entity_type, entity_id)

    

    UNION ALL

    

    -- Comments

    SELECT 

        'comment'::text as entity_type,

        id as entity_id,

        substring(body from 1 for 60) as title,

        'On ' || entity_type as context,

        updated_at as last_updated,

        author_id as owner_id,

        (CASE WHEN body ILIKE p_query THEN 100 WHEN body ILIKE v_query THEN 50 ELSE 0 END)::real as rank

    FROM public.universal_comments

    WHERE workspace_id = v_workspace_id AND body ILIKE v_query AND deleted_at IS NULL AND public.can_access_entity(entity_type, entity_id)

    

    UNION ALL

    

    -- People

    SELECT 

        'user'::text as entity_type,

        id as entity_id,

        full_name as title,

        role || COALESCE(' ┬╖ ' || designation, '') as context,

        created_at as last_updated,

        id as owner_id,

        (CASE WHEN full_name ILIKE p_query THEN 100 WHEN full_name ILIKE v_query THEN 50 ELSE 0 END)::real as rank

    FROM public.users

    WHERE workspace_id = v_workspace_id AND (full_name ILIKE v_query OR email ILIKE v_query)

    

    ORDER BY rank DESC, last_updated DESC

    LIMIT p_limit;

END;

$$;


ALTER FUNCTION public.search_workspace(p_query text, p_limit integer) OWNER TO postgres;

--
-- Name: trigger_set_timestamp(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.trigger_set_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$

BEGIN

  NEW.updated_at = NOW();

  RETURN NEW;

END;

$$;


ALTER FUNCTION public.trigger_set_timestamp() OWNER TO postgres;

--
-- Name: trigger_update_project_pert(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.trigger_update_project_pert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$

DECLARE

  v_proj_id UUID;

  v_total_expected NUMERIC := 0;

  v_total_variance NUMERIC := 0;

  v_new_best NUMERIC;

  v_new_likely NUMERIC;

  v_new_worst NUMERIC;

BEGIN

  IF TG_OP = 'DELETE' THEN

    v_proj_id := OLD.project_id;

  ELSE

    v_proj_id := NEW.project_id;

  END IF;

  

  -- Aggregate active PERT tasks

  SELECT 

    COALESCE(SUM((pert_best + 4 * pert_likely + pert_worst) / 6.0), 0),

    COALESCE(SUM(POWER((pert_worst - pert_best) / 6.0, 2)), 0)

  INTO v_total_expected, v_total_variance

  FROM tasks

  WHERE project_id = v_proj_id 

    AND pert_best > 0 

    AND pert_likely > 0 

    AND pert_worst > 0;

    

  v_new_best := GREATEST(0, v_total_expected - (2 * SQRT(v_total_variance)));

  v_new_likely := v_total_expected;

  v_new_worst := v_total_expected + (2 * SQRT(v_total_variance));

  

  UPDATE projects

  SET 

    pert_best = ROUND(v_new_best, 1),

    pert_likely = ROUND(v_new_likely, 1),

    pert_worst = ROUND(v_new_worst, 1)

  WHERE id = v_proj_id;

  

  -- Handle project reassignment

  IF TG_OP = 'UPDATE' AND OLD.project_id != NEW.project_id THEN

    SELECT 

      COALESCE(SUM((pert_best + 4 * pert_likely + pert_worst) / 6.0), 0),

      COALESCE(SUM(POWER((pert_worst - pert_best) / 6.0, 2)), 0)

    INTO v_total_expected, v_total_variance

    FROM tasks

    WHERE project_id = OLD.project_id 

      AND pert_best > 0 

      AND pert_likely > 0 

      AND pert_worst > 0;

      

    v_new_best := GREATEST(0, v_total_expected - (2 * SQRT(v_total_variance)));

    v_new_likely := v_total_expected;

    v_new_worst := v_total_expected + (2 * SQRT(v_total_variance));

    

    UPDATE projects

    SET 

      pert_best = ROUND(v_new_best, 1),

      pert_likely = ROUND(v_new_likely, 1),

      pert_worst = ROUND(v_new_worst, 1)

    WHERE id = OLD.project_id;

  END IF;

  

  RETURN NULL;

END;

$$;


ALTER FUNCTION public.trigger_update_project_pert() OWNER TO postgres;

--
-- Name: update_invoice_balance(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_invoice_balance() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$

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

$$;


ALTER FUNCTION public.update_invoice_balance() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activity_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    actor_id uuid,
    project_id uuid,
    task_id uuid,
    action text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    hash text,
    previous_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.activity_logs OWNER TO postgres;

--
-- Name: ai_recommendations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ai_recommendations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    recommendation_type text NOT NULL,
    task_id uuid,
    original_assignee_id uuid,
    suggested_assignee_id uuid,
    predicted_eta_improvement numeric,
    risk_delta integer,
    confidence_delta numeric,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_recommendations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text])))
);


ALTER TABLE public.ai_recommendations OWNER TO postgres;

--
-- Name: allocation_periods; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.allocation_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    allocation_percent numeric NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT allocation_periods_allocation_percent_check CHECK (((allocation_percent >= (0)::numeric) AND (allocation_percent <= (100)::numeric))),
    CONSTRAINT allocation_periods_check CHECK ((start_date <= end_date))
);


ALTER TABLE public.allocation_periods OWNER TO postgres;

--
-- Name: approval_chains; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.approval_chains (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    trigger_event text,
    trigger_config jsonb DEFAULT '{}'::jsonb,
    enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.approval_chains OWNER TO postgres;

--
-- Name: approval_instances; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.approval_instances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chain_id uuid NOT NULL,
    target_type text NOT NULL,
    target_id text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    current_step integer DEFAULT 1,
    initiated_by uuid,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE public.approval_instances OWNER TO postgres;

--
-- Name: approval_steps; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.approval_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chain_id uuid NOT NULL,
    step_order integer NOT NULL,
    approver_role text NOT NULL,
    approver_id uuid,
    timeout_hours integer DEFAULT 48,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.approval_steps OWNER TO postgres;

--
-- Name: approvals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    milestone_id uuid,
    task_id uuid,
    phase text NOT NULL,
    approver_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    comment text,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT approvals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


ALTER TABLE public.approvals OWNER TO postgres;

--
-- Name: attendance; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attendance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    date date NOT NULL,
    status text NOT NULL,
    leave_type text,
    availability_factor numeric DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT attendance_leave_type_check CHECK ((leave_type = ANY (ARRAY['casual'::text, 'medical'::text, 'unexcused'::text]))),
    CONSTRAINT attendance_status_check CHECK ((status = ANY (ARRAY['present'::text, 'half_day'::text, 'absent'::text])))
);


ALTER TABLE public.attendance OWNER TO postgres;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_logs (
    id text NOT NULL,
    data jsonb NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now()
);


ALTER TABLE public.audit_logs OWNER TO postgres;

--
-- Name: automation_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.automation_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    trigger_event text NOT NULL,
    trigger_filters jsonb DEFAULT '{}'::jsonb,
    actions jsonb NOT NULL,
    enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.automation_rules OWNER TO postgres;

--
-- Name: automation_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.automation_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    category text NOT NULL,
    trigger_event text NOT NULL,
    actions jsonb NOT NULL,
    icon text DEFAULT 'zap'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.automation_templates OWNER TO postgres;

--
-- Name: calendar_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.calendar_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    event_type text NOT NULL,
    title text NOT NULL,
    description text,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone NOT NULL,
    participants uuid[] DEFAULT '{}'::uuid[],
    capacity_impact numeric DEFAULT 1.0 NOT NULL,
    is_recurring boolean DEFAULT false,
    recurrence_rule text,
    timezone text DEFAULT 'UTC'::text,
    auto_generated boolean DEFAULT false,
    capacity_modifier numeric DEFAULT 1.0,
    source_id text,
    source_table text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    CONSTRAINT calendar_events_capacity_impact_check CHECK (((capacity_impact >= (0)::numeric) AND (capacity_impact <= (1)::numeric))),
    CONSTRAINT calendar_events_capacity_modifier_check CHECK ((capacity_modifier >= (0)::numeric)),
    CONSTRAINT calendar_events_event_type_check CHECK ((event_type = ANY (ARRAY['holiday'::text, 'leave'::text, 'meeting'::text, 'festival'::text, 'regional'::text, 'company'::text, 'sprint'::text, 'deployment'::text, 'client_review'::text, 'approval'::text])))
);


ALTER TABLE public.calendar_events OWNER TO postgres;

--
-- Name: calendar_sync_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.calendar_sync_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    provider text NOT NULL,
    country text NOT NULL,
    region text,
    year integer NOT NULL,
    holidays_found integer DEFAULT 0 NOT NULL,
    holidays_imported integer DEFAULT 0 NOT NULL,
    status text NOT NULL,
    error_message text,
    previous_hash text DEFAULT 'GENESIS_BLOCK'::text NOT NULL,
    hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT calendar_sync_logs_status_check CHECK ((status = ANY (ARRAY['success'::text, 'partial'::text, 'failed'::text, 'skipped'::text, 'unsupported'::text])))
);


ALTER TABLE public.calendar_sync_logs OWNER TO postgres;

--
-- Name: change_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.change_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now(),
    changes text NOT NULL,
    reason text NOT NULL,
    author_name text NOT NULL,
    author_role text NOT NULL,
    previous_hash text,
    hash text
);


ALTER TABLE public.change_logs OWNER TO postgres;

--
-- Name: clients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    company_name text NOT NULL,
    contact_person text,
    email text,
    phone text,
    billing_address text,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    gstin text,
    billing_state text,
    billing_country text DEFAULT 'India'::text,
    tax_type text DEFAULT 'unregistered'::text,
    currency text DEFAULT 'INR'::text,
    CONSTRAINT clients_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text]))),
    CONSTRAINT clients_tax_type_check CHECK ((tax_type = ANY (ARRAY['registered'::text, 'unregistered'::text])))
);


ALTER TABLE public.clients OWNER TO postgres;

--
-- Name: command_usage_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.command_usage_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid,
    command_id text NOT NULL,
    command_type text NOT NULL,
    route text,
    session_id text,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


ALTER TABLE public.command_usage_events OWNER TO postgres;

--
-- Name: comment_versions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.comment_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    comment_id uuid NOT NULL,
    previous_content text,
    new_content text NOT NULL,
    edited_by uuid,
    edited_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.comment_versions OWNER TO postgres;

--
-- Name: comments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    task_id uuid,
    project_id uuid,
    author_id uuid,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.comments OWNER TO postgres;

--
-- Name: company_billing_profile; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.company_billing_profile (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    legal_name text NOT NULL,
    gstin text,
    pan text,
    billing_address text,
    state text NOT NULL,
    country text DEFAULT 'India'::text NOT NULL,
    bank_details jsonb,
    invoice_prefix text DEFAULT 'RPM'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.company_billing_profile OWNER TO postgres;

--
-- Name: compensation_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.compensation_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    base_salary numeric DEFAULT 3000 NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    effective_from timestamp with time zone DEFAULT now() NOT NULL,
    effective_to timestamp with time zone,
    change_reason text,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.compensation_records OWNER TO postgres;

--
-- Name: connected_accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.connected_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid,
    service text NOT NULL,
    access_token text,
    refresh_token text,
    token_expires_at timestamp with time zone,
    scopes text[] DEFAULT '{}'::text[],
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    connected boolean DEFAULT true NOT NULL
);


ALTER TABLE public.connected_accounts OWNER TO postgres;

--
-- Name: doc_annotations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.doc_annotations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    doc_id uuid NOT NULL,
    author_id uuid,
    selection_start integer NOT NULL,
    selection_end integer NOT NULL,
    comment text NOT NULL,
    resolved boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.doc_annotations OWNER TO postgres;

--
-- Name: doc_versions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.doc_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    doc_id uuid NOT NULL,
    version integer NOT NULL,
    content text NOT NULL,
    author_id uuid,
    change_summary text,
    hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.doc_versions OWNER TO postgres;

--
-- Name: document_template_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.document_template_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    version_number integer NOT NULL,
    name text NOT NULL,
    template_body text NOT NULL,
    header_config jsonb,
    footer_config jsonb,
    styles jsonb,
    logo_url text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.document_template_history OWNER TO postgres;

--
-- Name: document_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.document_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    template_body text NOT NULL,
    header_config jsonb DEFAULT '{}'::jsonb,
    footer_config jsonb DEFAULT '{}'::jsonb,
    styles jsonb DEFAULT '{}'::jsonb,
    logo_url text,
    is_default boolean DEFAULT false,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT document_templates_type_check CHECK ((type = ANY (ARRAY['invoice'::text, 'receipt'::text, 'offer_letter'::text, 'experience_letter'::text, 'salary_slip'::text, 'report'::text, 'custom'::text])))
);


ALTER TABLE public.document_templates OWNER TO postgres;

--
-- Name: documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid,
    author_id uuid,
    title text NOT NULL,
    content text DEFAULT ''::text,
    doc_type text DEFAULT 'markdown'::text NOT NULL,
    tags text[] DEFAULT '{}'::text[],
    pinned boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE public.documents OWNER TO postgres;

--
-- Name: employment_change_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.employment_change_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    field_changed text NOT NULL,
    previous_value text,
    new_value text,
    changed_by uuid NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    reason text NOT NULL
);


ALTER TABLE public.employment_change_logs OWNER TO postgres;

--
-- Name: employment_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.employment_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    workspace_id uuid,
    date_of_joining timestamp with time zone NOT NULL,
    employment_status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT employment_records_employment_status_check CHECK ((employment_status = ANY (ARRAY['active'::text, 'resigned'::text, 'terminated'::text])))
);


ALTER TABLE public.employment_records OWNER TO postgres;

--
-- Name: epics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.epics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'backlog'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    start_date timestamp with time zone,
    deadline timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT epics_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT epics_status_check CHECK ((status = ANY (ARRAY['backlog'::text, 'in_progress'::text, 'review'::text, 'done'::text])))
);


ALTER TABLE public.epics OWNER TO postgres;

--
-- Name: escalation_policies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.escalation_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    trigger_condition text NOT NULL,
    steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.escalation_policies OWNER TO postgres;

--
-- Name: expenses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    category text NOT NULL,
    amount numeric NOT NULL,
    date date NOT NULL,
    description text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT expenses_category_check CHECK ((category = ANY (ARRAY['salary'::text, 'software'::text, 'infrastructure'::text, 'office'::text, 'misc'::text])))
);


ALTER TABLE public.expenses OWNER TO postgres;

--
-- Name: file_versions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.file_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_id uuid NOT NULL,
    version_number integer NOT NULL,
    storage_path text NOT NULL,
    file_size bigint NOT NULL,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    change_note text
);


ALTER TABLE public.file_versions OWNER TO postgres;

--
-- Name: files; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid,
    task_id uuid,
    uploaded_by uuid,
    bucket text NOT NULL,
    path text NOT NULL,
    name text NOT NULL,
    mime_type text,
    size_bytes bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.files OWNER TO postgres;

--
-- Name: financial_adjustments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.financial_adjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    period_id uuid NOT NULL,
    type text NOT NULL,
    amount numeric NOT NULL,
    reason text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT financial_adjustments_type_check CHECK ((type = ANY (ARRAY['revenue'::text, 'salary'::text, 'expense'::text])))
);


ALTER TABLE public.financial_adjustments OWNER TO postgres;

--
-- Name: financial_periods; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.financial_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    month integer NOT NULL,
    year integer NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    closed_by uuid,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT financial_periods_month_check CHECK (((month >= 1) AND (month <= 12))),
    CONSTRAINT financial_periods_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);


ALTER TABLE public.financial_periods OWNER TO postgres;

--
-- Name: financial_snapshots; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.financial_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    period_id uuid NOT NULL,
    total_revenue numeric DEFAULT 0 NOT NULL,
    total_salary_expense numeric DEFAULT 0 NOT NULL,
    total_other_expenses numeric DEFAULT 0 NOT NULL,
    net_profit numeric DEFAULT 0 NOT NULL,
    employee_count integer DEFAULT 0 NOT NULL,
    client_count integer DEFAULT 0 NOT NULL,
    project_count integer DEFAULT 0 NOT NULL,
    snapshot_data jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.financial_snapshots OWNER TO postgres;

--
-- Name: generated_reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.generated_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    report_type text NOT NULL,
    generated_by uuid NOT NULL,
    file_path text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT generated_reports_report_type_check CHECK ((report_type = ANY (ARRAY['project'::text, 'team'::text, 'sprint'::text, 'attendance'::text, 'payroll'::text])))
);


ALTER TABLE public.generated_reports OWNER TO postgres;

--
-- Name: impact_simulations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.impact_simulations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    trigger_type text NOT NULL,
    trigger_id text,
    trigger_fingerprint text,
    affected_entities jsonb DEFAULT '[]'::jsonb NOT NULL,
    eta_delta numeric DEFAULT 0 NOT NULL,
    risk_delta numeric DEFAULT 0 NOT NULL,
    confidence_delta numeric DEFAULT 0 NOT NULL,
    capacity_delta numeric DEFAULT 0 NOT NULL,
    release_delta numeric DEFAULT 0 NOT NULL,
    mitigations jsonb DEFAULT '[]'::jsonb NOT NULL,
    severity text DEFAULT 'LOW'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    stale boolean DEFAULT false NOT NULL,
    stale_reason text,
    trigger_snapshot jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval),
    CONSTRAINT impact_simulations_severity_check CHECK ((severity = ANY (ARRAY['LOW'::text, 'MEDIUM'::text, 'HIGH'::text, 'CRITICAL'::text]))),
    CONSTRAINT impact_simulations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'dismissed'::text, 'expired'::text])))
);


ALTER TABLE public.impact_simulations OWNER TO postgres;

--
-- Name: integration_configs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.integration_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid,
    service text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.integration_configs OWNER TO postgres;

--
-- Name: integration_health; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.integration_health (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    service text NOT NULL,
    status text DEFAULT 'disconnected'::text NOT NULL,
    last_sync timestamp with time zone,
    last_error text,
    latency_ms integer,
    retry_count integer DEFAULT 0,
    checked_at timestamp with time zone DEFAULT now() NOT NULL,
    integration_last_checked timestamp with time zone,
    last_sync_attempt timestamp with time zone
);


ALTER TABLE public.integration_health OWNER TO postgres;

--
-- Name: integration_sync_jobs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.integration_sync_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    service text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    next_retry_at timestamp with time zone,
    last_error text,
    created_by uuid
);


ALTER TABLE public.integration_sync_jobs OWNER TO postgres;

--
-- Name: invitations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    workspace_id uuid NOT NULL,
    role text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    invited_by uuid,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    date_of_joining timestamp with time zone,
    CONSTRAINT invitations_role_check CHECK ((role = ANY (ARRAY['super_admin'::text, 'pm'::text, 'developer'::text, 'viewer'::text]))),
    CONSTRAINT invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text])))
);


ALTER TABLE public.invitations OWNER TO postgres;

--
-- Name: invoice_line_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invoice_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    description text NOT NULL,
    quantity numeric DEFAULT 1 NOT NULL,
    unit_price numeric DEFAULT 0 NOT NULL,
    total numeric DEFAULT 0 NOT NULL
);


ALTER TABLE public.invoice_line_items OWNER TO postgres;

--
-- Name: invoice_sequences; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invoice_sequences (
    workspace_id uuid NOT NULL,
    last_sequence integer DEFAULT 0 NOT NULL,
    current_year integer NOT NULL
);


ALTER TABLE public.invoice_sequences OWNER TO postgres;

--
-- Name: invoices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    client_id uuid,
    project_id uuid,
    invoice_number text NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    issue_date date,
    due_date date,
    paid_date date,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    subtotal numeric DEFAULT 0 NOT NULL,
    discount_amount numeric DEFAULT 0 NOT NULL,
    taxable_amount numeric DEFAULT 0 NOT NULL,
    cgst_amount numeric DEFAULT 0 NOT NULL,
    sgst_amount numeric DEFAULT 0 NOT NULL,
    igst_amount numeric DEFAULT 0 NOT NULL,
    total_tax numeric DEFAULT 0 NOT NULL,
    grand_total numeric DEFAULT 0 NOT NULL,
    balance_due numeric DEFAULT 0 NOT NULL,
    billing_state_snapshot text,
    client_currency text DEFAULT 'INR'::text,
    exchange_rate numeric DEFAULT 1.0,
    CONSTRAINT invoices_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'paid'::text, 'overdue'::text, 'cancelled'::text])))
);


ALTER TABLE public.invoices OWNER TO postgres;

--
-- Name: meeting_attendees; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.meeting_attendees (
    meeting_id uuid NOT NULL,
    user_id uuid NOT NULL,
    attended boolean DEFAULT false
);


ALTER TABLE public.meeting_attendees OWNER TO postgres;

--
-- Name: meetings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.meetings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid,
    title text NOT NULL,
    description text,
    meeting_type text DEFAULT 'sync'::text NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    organizer_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT meetings_check CHECK ((start_time <= end_time)),
    CONSTRAINT meetings_meeting_type_check CHECK ((meeting_type = ANY (ARRAY['sync'::text, 'planning'::text, 'review'::text, 'retrospective'::text, 'standup'::text, 'design'::text, 'qa'::text, 'release'::text, 'post-mortem'::text, 'custom'::text])))
);


ALTER TABLE public.meetings OWNER TO postgres;

--
-- Name: mention_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.mention_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    keyword text NOT NULL,
    notify_roles text[] DEFAULT '{}'::text[] NOT NULL,
    notify_users uuid[] DEFAULT '{}'::uuid[],
    channel text DEFAULT 'push'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.mention_rules OWNER TO postgres;

--
-- Name: milestones; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.milestones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    sprint_id uuid,
    title text NOT NULL,
    description text,
    target_date timestamp with time zone NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    owner_id uuid,
    predicted_completion timestamp with time zone,
    CONSTRAINT milestones_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'achieved'::text, 'missed'::text])))
);


ALTER TABLE public.milestones OWNER TO postgres;

--
-- Name: notification_channels; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    channel text NOT NULL,
    enabled boolean DEFAULT true,
    config jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.notification_channels OWNER TO postgres;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid,
    category text NOT NULL,
    title text NOT NULL,
    body text,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    type text,
    source_entity jsonb,
    message text,
    recipient_id uuid,
    source_entity_type text,
    source_entity_id uuid,
    source_anchor_id text,
    opened_at timestamp with time zone,
    dismissed_at timestamp with time zone,
    route_path text,
    CONSTRAINT notifications_category_check CHECK ((category = ANY (ARRAY['assignments'::text, 'deadlines'::text, 'risk'::text, 'attendance'::text, 'system'::text])))
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- Name: oauth_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.oauth_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    provider text NOT NULL,
    state_token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used boolean DEFAULT false,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.oauth_sessions OWNER TO postgres;

--
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    amount numeric NOT NULL,
    payment_date date NOT NULL,
    method text,
    reference_number text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.payments OWNER TO postgres;

--
-- Name: personal_leave; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.personal_leave (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    leave_type text NOT NULL,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone NOT NULL,
    availability_factor numeric DEFAULT 0 NOT NULL,
    CONSTRAINT personal_leave_check CHECK ((start_date <= end_date))
);


ALTER TABLE public.personal_leave OWNER TO postgres;

--
-- Name: prediction_confidence_metrics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.prediction_confidence_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    task_id uuid NOT NULL,
    predicted_confidence numeric NOT NULL,
    actual_error_days integer NOT NULL,
    confidence_error integer NOT NULL,
    confidence_bucket text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.prediction_confidence_metrics OWNER TO postgres;

--
-- Name: prediction_context_metrics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.prediction_context_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    context_type text NOT NULL,
    context_value text NOT NULL,
    historical_accuracy numeric DEFAULT 0 NOT NULL,
    mean_error numeric DEFAULT 0 NOT NULL,
    overconfidence_rate numeric DEFAULT 0 NOT NULL,
    underconfidence_rate numeric DEFAULT 0 NOT NULL,
    sample_size integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.prediction_context_metrics OWNER TO postgres;

--
-- Name: prediction_errors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.prediction_errors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    task_id uuid NOT NULL,
    task_name text,
    assignee_id uuid,
    predicted_completion date NOT NULL,
    actual_completion date NOT NULL,
    prediction_error_days integer NOT NULL,
    predicted_confidence numeric,
    confidence_error numeric,
    predicted_risk text,
    estimated_hours numeric,
    actual_hours numeric,
    pert_best numeric,
    pert_likely numeric,
    pert_worst numeric,
    delay_drift_days numeric,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.prediction_errors OWNER TO postgres;

--
-- Name: project_allocations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.project_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    allocation_percent numeric DEFAULT 100 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_allocations_allocation_percent_check CHECK (((allocation_percent >= (0)::numeric) AND (allocation_percent <= (1000)::numeric)))
);


ALTER TABLE public.project_allocations OWNER TO postgres;

--
-- Name: project_signoffs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.project_signoffs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    approver_id uuid NOT NULL,
    role text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.project_signoffs OWNER TO postgres;

--
-- Name: projects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    team_id uuid,
    owner_id uuid,
    name text NOT NULL,
    description text,
    status text DEFAULT 'planning'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    template text DEFAULT 'Blank'::text NOT NULL,
    execution_mode text DEFAULT 'KANBAN'::text NOT NULL,
    deadline timestamp with time zone,
    client_deadline timestamp with time zone,
    proposed_start_date timestamp with time zone,
    predicted_completion timestamp with time zone,
    confidence integer,
    risk text,
    delay_drift_days integer DEFAULT 0,
    efficiency numeric DEFAULT 1.0,
    tags text[] DEFAULT '{}'::text[],
    audit_header jsonb DEFAULT '{}'::jsonb,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    client_id uuid,
    CONSTRAINT projects_execution_mode_check CHECK ((execution_mode = ANY (ARRAY['KANBAN'::text, 'SCRUM'::text, 'HYBRID'::text, 'SDLC'::text, 'CUSTOM'::text]))),
    CONSTRAINT projects_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT projects_risk_check CHECK ((risk = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT projects_status_check CHECK ((status = ANY (ARRAY['planning'::text, 'active'::text, 'in-progress'::text, 'review'::text, 'done'::text, 'archived'::text, 'deployed'::text])))
);


ALTER TABLE public.projects OWNER TO postgres;

--
-- Name: recurring_task_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.recurring_task_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    generated_task_id uuid NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.recurring_task_history OWNER TO postgres;

--
-- Name: recurring_task_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.recurring_task_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    created_by uuid NOT NULL,
    assigned_to uuid,
    recurrence_type text NOT NULL,
    recurrence_rule jsonb,
    start_date timestamp with time zone DEFAULT now() NOT NULL,
    end_date timestamp with time zone,
    next_run_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT recurring_task_templates_recurrence_type_check CHECK ((recurrence_type = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text, 'yearly'::text, 'custom'::text])))
);


ALTER TABLE public.recurring_task_templates OWNER TO postgres;

--
-- Name: salaries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.salaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    base_salary numeric DEFAULT 3000 NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.salaries OWNER TO postgres;

--
-- Name: skills; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.skills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    category text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.skills OWNER TO postgres;

--
-- Name: sprints; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sprints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    goal text,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone NOT NULL,
    status text DEFAULT 'planned'::text NOT NULL,
    velocity_committed numeric DEFAULT 0,
    velocity_completed numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT sprints_check CHECK ((start_date <= end_date)),
    CONSTRAINT sprints_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'active'::text, 'completed'::text, 'cancelled'::text])))
);


ALTER TABLE public.sprints OWNER TO postgres;

--
-- Name: system_audit_ledger; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.system_audit_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid,
    task_id uuid,
    actor_id uuid,
    action text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    hash text NOT NULL,
    previous_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.system_audit_ledger OWNER TO postgres;

--
-- Name: tactical_tasks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tactical_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id text NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'triage'::text NOT NULL,
    assigned_to text,
    weight numeric DEFAULT 1.0 NOT NULL,
    due_date text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT tactical_tasks_status_check CHECK ((status = ANY (ARRAY['triage'::text, 'in_flight'::text, 'validation'::text, 'sprint_backlog'::text, 'in_progress'::text, 'code_review'::text, 'merged'::text])))
);


ALTER TABLE public.tactical_tasks OWNER TO postgres;

--
-- Name: task_comments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.task_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    task_id uuid NOT NULL,
    author_id uuid NOT NULL,
    content text NOT NULL,
    parent_comment_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE public.task_comments OWNER TO postgres;

--
-- Name: task_dependencies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.task_dependencies (
    workspace_id uuid NOT NULL,
    task_id uuid NOT NULL,
    depends_on_task_id uuid NOT NULL,
    CONSTRAINT task_dependencies_check CHECK ((task_id <> depends_on_task_id))
);


ALTER TABLE public.task_dependencies OWNER TO postgres;

--
-- Name: task_history_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.task_history_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id text NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now(),
    author_id text,
    author_name text NOT NULL,
    author_role text NOT NULL,
    field_name text NOT NULL,
    old_value text,
    new_value text,
    telemetry_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    previous_hash text,
    hash text
);


ALTER TABLE public.task_history_logs OWNER TO postgres;

--
-- Name: tasks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    assignee_id uuid,
    parent_task_id uuid,
    epic_id uuid,
    sprint_id uuid,
    story_id uuid,
    name text NOT NULL,
    description text,
    definition_of_done text,
    acceptance_criteria text,
    status text DEFAULT 'backlog'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    risk text,
    start_date timestamp with time zone,
    deadline timestamp with time zone,
    due_date timestamp with time zone,
    predicted_completion timestamp with time zone,
    estimated_hours numeric DEFAULT 0 NOT NULL,
    story_points numeric,
    pert_best numeric,
    pert_likely numeric,
    pert_worst numeric,
    confidence integer,
    delay_drift_days integer DEFAULT 0,
    milestone_id uuid,
    work_time_hours numeric DEFAULT 0,
    wait_time_hours numeric DEFAULT 0,
    cycle_time_hours numeric DEFAULT 0,
    last_activity_at timestamp with time zone,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT tasks_risk_check CHECK ((risk = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT tasks_status_check CHECK ((status = ANY (ARRAY['backlog'::text, 'ready'::text, 'in_progress'::text, 'review'::text, 'done'::text])))
);


ALTER TABLE public.tasks OWNER TO postgres;

--
-- Name: team_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.team_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    title text NOT NULL,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone NOT NULL,
    availability_factor numeric DEFAULT 1 NOT NULL,
    CONSTRAINT team_events_check CHECK ((start_date <= end_date))
);


ALTER TABLE public.team_events OWNER TO postgres;

--
-- Name: team_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.team_members (
    workspace_id uuid NOT NULL,
    team_id uuid NOT NULL,
    user_id uuid NOT NULL,
    member_role text
);


ALTER TABLE public.team_members OWNER TO postgres;

--
-- Name: teams; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    capacity_hours_per_week numeric,
    data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.teams OWNER TO postgres;

--
-- Name: universal_comments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.universal_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    author_id uuid,
    body text NOT NULL,
    mentions jsonb DEFAULT '[]'::jsonb,
    attachments jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    edited_at timestamp with time zone
);


ALTER TABLE public.universal_comments OWNER TO postgres;

--
-- Name: user_skills; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_skills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    level text NOT NULL,
    verified_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_skills_level_check CHECK ((level = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text, 'expert'::text])))
);


ALTER TABLE public.user_skills OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    workspace_id uuid,
    email text NOT NULL,
    username text UNIQUE,
    password_hash text,
    refresh_token text,
    full_name text,
    phone text,
    avatar_url text,
    role text DEFAULT 'viewer'::text NOT NULL,
    designation text,
    availability_factor numeric DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    preferences jsonb DEFAULT '{"notifications": {"comments": true, "mentions": true, "status_changes": true, "system_updates": true, "project_updates": true, "task_assignments": true}}'::jsonb,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['super_admin'::text, 'pm'::text, 'developer'::text, 'viewer'::text, 'pending-workspace-setup'::text])))
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: wait_states; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.wait_states (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    category text NOT NULL,
    reason text,
    waiting_on text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    duration_hours numeric DEFAULT 0,
    CONSTRAINT wait_states_category_check CHECK ((category = ANY (ARRAY['client'::text, 'vendor'::text, 'approval'::text, 'compliance'::text, 'infrastructure'::text, 'data'::text, 'internal_cross_team'::text]))),
    CONSTRAINT wait_states_status_check CHECK ((status = ANY (ARRAY['active'::text, 'resolved'::text]))),
    CONSTRAINT wait_states_target_type_check CHECK ((target_type = ANY (ARRAY['project'::text, 'milestone'::text, 'task'::text]))),
    CONSTRAINT wait_states_waiting_on_check CHECK ((waiting_on = ANY (ARRAY['client'::text, 'vendor'::text, 'internal_team'::text, 'pm'::text, 'compliance'::text, 'infrastructure'::text, 'external_partner'::text, 'other'::text])))
);


ALTER TABLE public.wait_states OWNER TO postgres;

--
-- Name: webhooks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.webhooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    secret text,
    events text[] DEFAULT '{}'::text[] NOT NULL,
    enabled boolean DEFAULT true,
    last_triggered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.webhooks OWNER TO postgres;

--
-- Name: workspace_files; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workspace_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    file_name text NOT NULL,
    file_type text NOT NULL,
    mime_type text NOT NULL,
    file_size bigint NOT NULL,
    storage_path text NOT NULL,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE public.workspace_files OWNER TO postgres;

--
-- Name: workspace_holidays; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workspace_holidays (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    date date NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    CONSTRAINT workspace_holidays_type_check CHECK ((type = ANY (ARRAY['public'::text, 'regional'::text, 'festival'::text, 'company'::text])))
);


ALTER TABLE public.workspace_holidays OWNER TO postgres;

--
-- Name: workspace_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workspace_settings (
    workspace_id uuid NOT NULL,
    working_hours numeric DEFAULT 8,
    working_time_from text DEFAULT '09:00'::text,
    working_time_to text DEFAULT '17:00'::text,
    lunch_duration_minutes integer DEFAULT 60,
    settings_blob jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.workspace_settings OWNER TO postgres;

--
-- Name: workspaces; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workspaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    owner_id uuid NOT NULL,
    business_type text DEFAULT 'Software'::text NOT NULL,
    template_id text,
    execution_mode text DEFAULT 'KANBAN'::text NOT NULL,
    default_lanes integer DEFAULT 5 NOT NULL,
    workflow_rules jsonb DEFAULT '{}'::jsonb NOT NULL,
    work_start time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
    work_end time without time zone DEFAULT '17:00:00'::time without time zone NOT NULL,
    lunch_duration integer DEFAULT 60 NOT NULL,
    workdays integer[] DEFAULT ARRAY[1, 2, 3, 4, 5] NOT NULL,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    attendance_enabled boolean DEFAULT true NOT NULL,
    payroll_enabled boolean DEFAULT false NOT NULL,
    productivity_factor numeric DEFAULT 0.8 NOT NULL,
    country text,
    region text,
    completion_policy text DEFAULT 'controlled'::text NOT NULL,
    allow_overallocation boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workspaces_completion_policy_check CHECK ((completion_policy = ANY (ARRAY['flexible'::text, 'controlled'::text, 'strict'::text, 'enterprise'::text])))
);


ALTER TABLE public.workspaces OWNER TO postgres;

--
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);


--
-- Name: ai_recommendations ai_recommendations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_recommendations
    ADD CONSTRAINT ai_recommendations_pkey PRIMARY KEY (id);


--
-- Name: allocation_periods allocation_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.allocation_periods
    ADD CONSTRAINT allocation_periods_pkey PRIMARY KEY (id);


--
-- Name: approval_chains approval_chains_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.approval_chains
    ADD CONSTRAINT approval_chains_pkey PRIMARY KEY (id);


--
-- Name: approval_instances approval_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.approval_instances
    ADD CONSTRAINT approval_instances_pkey PRIMARY KEY (id);


--
-- Name: approval_steps approval_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.approval_steps
    ADD CONSTRAINT approval_steps_pkey PRIMARY KEY (id);


--
-- Name: approvals approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.approvals
    ADD CONSTRAINT approvals_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_workspace_id_user_id_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_workspace_id_user_id_date_key UNIQUE (workspace_id, user_id, date);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: automation_rules automation_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_rules
    ADD CONSTRAINT automation_rules_pkey PRIMARY KEY (id);


--
-- Name: automation_templates automation_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_templates
    ADD CONSTRAINT automation_templates_pkey PRIMARY KEY (id);


--
-- Name: calendar_events calendar_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_pkey PRIMARY KEY (id);


--
-- Name: calendar_sync_logs calendar_sync_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calendar_sync_logs
    ADD CONSTRAINT calendar_sync_logs_pkey PRIMARY KEY (id);


--
-- Name: change_logs change_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.change_logs
    ADD CONSTRAINT change_logs_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: command_usage_events command_usage_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.command_usage_events
    ADD CONSTRAINT command_usage_events_pkey PRIMARY KEY (id);


--
-- Name: comment_versions comment_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comment_versions
    ADD CONSTRAINT comment_versions_pkey PRIMARY KEY (id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: company_billing_profile company_billing_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_billing_profile
    ADD CONSTRAINT company_billing_profile_pkey PRIMARY KEY (id);


--
-- Name: company_billing_profile company_billing_profile_workspace_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_billing_profile
    ADD CONSTRAINT company_billing_profile_workspace_id_key UNIQUE (workspace_id);


--
-- Name: compensation_records compensation_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compensation_records
    ADD CONSTRAINT compensation_records_pkey PRIMARY KEY (id);


--
-- Name: connected_accounts connected_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.connected_accounts
    ADD CONSTRAINT connected_accounts_pkey PRIMARY KEY (id);


--
-- Name: doc_annotations doc_annotations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.doc_annotations
    ADD CONSTRAINT doc_annotations_pkey PRIMARY KEY (id);


--
-- Name: doc_versions doc_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.doc_versions
    ADD CONSTRAINT doc_versions_pkey PRIMARY KEY (id);


--
-- Name: document_template_history document_template_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_template_history
    ADD CONSTRAINT document_template_history_pkey PRIMARY KEY (id);


--
-- Name: document_templates document_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: employment_change_logs employment_change_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employment_change_logs
    ADD CONSTRAINT employment_change_logs_pkey PRIMARY KEY (id);


--
-- Name: employment_records employment_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employment_records
    ADD CONSTRAINT employment_records_pkey PRIMARY KEY (id);


--
-- Name: epics epics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.epics
    ADD CONSTRAINT epics_pkey PRIMARY KEY (id);


--
-- Name: escalation_policies escalation_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.escalation_policies
    ADD CONSTRAINT escalation_policies_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: file_versions file_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_versions
    ADD CONSTRAINT file_versions_pkey PRIMARY KEY (id);


--
-- Name: files files_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);


--
-- Name: financial_adjustments financial_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.financial_adjustments
    ADD CONSTRAINT financial_adjustments_pkey PRIMARY KEY (id);


--
-- Name: financial_periods financial_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.financial_periods
    ADD CONSTRAINT financial_periods_pkey PRIMARY KEY (id);


--
-- Name: financial_periods financial_periods_workspace_id_month_year_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.financial_periods
    ADD CONSTRAINT financial_periods_workspace_id_month_year_key UNIQUE (workspace_id, month, year);


--
-- Name: financial_snapshots financial_snapshots_period_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.financial_snapshots
    ADD CONSTRAINT financial_snapshots_period_id_key UNIQUE (period_id);


--
-- Name: financial_snapshots financial_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.financial_snapshots
    ADD CONSTRAINT financial_snapshots_pkey PRIMARY KEY (id);


--
-- Name: generated_reports generated_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.generated_reports
    ADD CONSTRAINT generated_reports_pkey PRIMARY KEY (id);


--
-- Name: impact_simulations impact_simulations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.impact_simulations
    ADD CONSTRAINT impact_simulations_pkey PRIMARY KEY (id);


--
-- Name: integration_configs integration_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.integration_configs
    ADD CONSTRAINT integration_configs_pkey PRIMARY KEY (id);


--
-- Name: integration_health integration_health_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.integration_health
    ADD CONSTRAINT integration_health_pkey PRIMARY KEY (id);


--
-- Name: integration_sync_jobs integration_sync_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.integration_sync_jobs
    ADD CONSTRAINT integration_sync_jobs_pkey PRIMARY KEY (id);


--
-- Name: invitations invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);


--
-- Name: invitations invitations_workspace_id_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_workspace_id_email_key UNIQUE (workspace_id, email);


--
-- Name: invoice_line_items invoice_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_pkey PRIMARY KEY (id);


--
-- Name: invoice_sequences invoice_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_sequences
    ADD CONSTRAINT invoice_sequences_pkey PRIMARY KEY (workspace_id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_workspace_id_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_workspace_id_invoice_number_key UNIQUE (workspace_id, invoice_number);


--
-- Name: meeting_attendees meeting_attendees_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meeting_attendees
    ADD CONSTRAINT meeting_attendees_pkey PRIMARY KEY (meeting_id, user_id);


--
-- Name: meetings meetings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_pkey PRIMARY KEY (id);


--
-- Name: mention_rules mention_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mention_rules
    ADD CONSTRAINT mention_rules_pkey PRIMARY KEY (id);


--
-- Name: milestones milestones_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.milestones
    ADD CONSTRAINT milestones_pkey PRIMARY KEY (id);


--
-- Name: notification_channels notification_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_channels
    ADD CONSTRAINT notification_channels_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: oauth_sessions oauth_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.oauth_sessions
    ADD CONSTRAINT oauth_sessions_pkey PRIMARY KEY (id);


--
-- Name: oauth_sessions oauth_sessions_state_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.oauth_sessions
    ADD CONSTRAINT oauth_sessions_state_token_key UNIQUE (state_token);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: personal_leave personal_leave_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_leave
    ADD CONSTRAINT personal_leave_pkey PRIMARY KEY (id);


--
-- Name: prediction_confidence_metrics prediction_confidence_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.prediction_confidence_metrics
    ADD CONSTRAINT prediction_confidence_metrics_pkey PRIMARY KEY (id);


--
-- Name: prediction_context_metrics prediction_context_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.prediction_context_metrics
    ADD CONSTRAINT prediction_context_metrics_pkey PRIMARY KEY (id);


--
-- Name: prediction_errors prediction_errors_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.prediction_errors
    ADD CONSTRAINT prediction_errors_pkey PRIMARY KEY (id);


--
-- Name: project_allocations project_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_allocations
    ADD CONSTRAINT project_allocations_pkey PRIMARY KEY (id);


--
-- Name: project_allocations project_allocations_project_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_allocations
    ADD CONSTRAINT project_allocations_project_id_user_id_key UNIQUE (project_id, user_id);


--
-- Name: project_signoffs project_signoffs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_signoffs
    ADD CONSTRAINT project_signoffs_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: recurring_task_history recurring_task_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recurring_task_history
    ADD CONSTRAINT recurring_task_history_pkey PRIMARY KEY (id);


--
-- Name: recurring_task_history recurring_task_history_template_id_generated_task_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recurring_task_history
    ADD CONSTRAINT recurring_task_history_template_id_generated_task_id_key UNIQUE (template_id, generated_task_id);


--
-- Name: recurring_task_templates recurring_task_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recurring_task_templates
    ADD CONSTRAINT recurring_task_templates_pkey PRIMARY KEY (id);


--
-- Name: salaries salaries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salaries
    ADD CONSTRAINT salaries_pkey PRIMARY KEY (id);


--
-- Name: salaries salaries_workspace_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salaries
    ADD CONSTRAINT salaries_workspace_id_user_id_key UNIQUE (workspace_id, user_id);


--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);


--
-- Name: skills skills_workspace_id_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_workspace_id_name_key UNIQUE (workspace_id, name);


--
-- Name: sprints sprints_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sprints
    ADD CONSTRAINT sprints_pkey PRIMARY KEY (id);


--
-- Name: system_audit_ledger system_audit_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_audit_ledger
    ADD CONSTRAINT system_audit_ledger_pkey PRIMARY KEY (id);


--
-- Name: tactical_tasks tactical_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tactical_tasks
    ADD CONSTRAINT tactical_tasks_pkey PRIMARY KEY (id);


--
-- Name: task_comments task_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_comments
    ADD CONSTRAINT task_comments_pkey PRIMARY KEY (id);


--
-- Name: task_dependencies task_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_pkey PRIMARY KEY (task_id, depends_on_task_id);


--
-- Name: task_dependencies task_dependencies_workspace_id_task_id_depends_on_task_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_workspace_id_task_id_depends_on_task_id_key UNIQUE (workspace_id, task_id, depends_on_task_id);


--
-- Name: task_history_logs task_history_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_history_logs
    ADD CONSTRAINT task_history_logs_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: team_events team_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_events
    ADD CONSTRAINT team_events_pkey PRIMARY KEY (id);


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (team_id, user_id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: employment_records unique_profile_workspace_employment; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employment_records
    ADD CONSTRAINT unique_profile_workspace_employment UNIQUE (profile_id, workspace_id);


--
-- Name: universal_comments universal_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.universal_comments
    ADD CONSTRAINT universal_comments_pkey PRIMARY KEY (id);


--
-- Name: user_skills user_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_skills
    ADD CONSTRAINT user_skills_pkey PRIMARY KEY (id);


--
-- Name: user_skills user_skills_user_id_skill_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_skills
    ADD CONSTRAINT user_skills_user_id_skill_id_key UNIQUE (user_id, skill_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_workspace_id_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_workspace_id_email_key UNIQUE (workspace_id, email);


--
-- Name: wait_states wait_states_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wait_states
    ADD CONSTRAINT wait_states_pkey PRIMARY KEY (id);


--
-- Name: webhooks webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_pkey PRIMARY KEY (id);


--
-- Name: workspace_files workspace_files_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_files
    ADD CONSTRAINT workspace_files_pkey PRIMARY KEY (id);


--
-- Name: workspace_holidays workspace_holidays_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_holidays
    ADD CONSTRAINT workspace_holidays_pkey PRIMARY KEY (id);


--
-- Name: workspace_holidays workspace_holidays_workspace_id_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_holidays
    ADD CONSTRAINT workspace_holidays_workspace_id_date_key UNIQUE (workspace_id, date);


--
-- Name: workspace_settings workspace_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_settings
    ADD CONSTRAINT workspace_settings_pkey PRIMARY KEY (workspace_id);


--
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);


--
-- Name: compensation_records_active_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX compensation_records_active_idx ON public.compensation_records USING btree (workspace_id, employee_id) WHERE (effective_to IS NULL);


--
-- Name: idx_activity_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_workspace ON public.activity_logs USING btree (workspace_id);


--
-- Name: idx_approval_instances_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_approval_instances_status ON public.approval_instances USING btree (chain_id, status);


--
-- Name: idx_attendance_ws_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attendance_ws_user ON public.attendance USING btree (workspace_id, user_id);


--
-- Name: idx_automation_rules_event; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_automation_rules_event ON public.automation_rules USING btree (workspace_id, trigger_event);


--
-- Name: idx_calendar_events_auto_gen; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_calendar_events_auto_gen ON public.calendar_events USING btree (auto_generated) WHERE (auto_generated = true);


--
-- Name: idx_calendar_events_date_range; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_calendar_events_date_range ON public.calendar_events USING btree (workspace_id, start_date, end_date);


--
-- Name: idx_calendar_events_deleted; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_calendar_events_deleted ON public.calendar_events USING btree (deleted_at) WHERE (deleted_at IS NULL);


--
-- Name: idx_calendar_events_event_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_calendar_events_event_type ON public.calendar_events USING btree (event_type);


--
-- Name: idx_calendar_events_holiday_provider_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_calendar_events_holiday_provider_key ON public.calendar_events USING btree (workspace_id, source_table, source_id) WHERE ((source_table = 'holiday_provider'::text) AND (source_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: idx_calendar_events_recurring; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_calendar_events_recurring ON public.calendar_events USING btree (is_recurring) WHERE (is_recurring = true);


--
-- Name: idx_calendar_events_source; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_calendar_events_source ON public.calendar_events USING btree (source_table, source_id);


--
-- Name: idx_calendar_events_workspace_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_calendar_events_workspace_id ON public.calendar_events USING btree (workspace_id);


--
-- Name: idx_calendar_sync_logs_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_calendar_sync_logs_created ON public.calendar_sync_logs USING btree (workspace_id, created_at DESC);


--
-- Name: idx_calendar_sync_logs_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_calendar_sync_logs_workspace ON public.calendar_sync_logs USING btree (workspace_id);


--
-- Name: idx_command_usage_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_command_usage_type ON public.command_usage_events USING btree (workspace_id, command_type);


--
-- Name: idx_command_usage_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_command_usage_user ON public.command_usage_events USING btree (workspace_id, user_id);


--
-- Name: idx_command_usage_workspace_ts; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_command_usage_workspace_ts ON public.command_usage_events USING btree (workspace_id, "timestamp" DESC);


--
-- Name: idx_comments_task; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_comments_task ON public.comments USING btree (task_id);


--
-- Name: idx_connected_accounts_service; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_connected_accounts_service ON public.connected_accounts USING btree (workspace_id, service);


--
-- Name: idx_doc_versions_doc; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_doc_versions_doc ON public.doc_versions USING btree (doc_id, version DESC);


--
-- Name: idx_documents_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_documents_workspace ON public.documents USING btree (workspace_id, updated_at DESC);


--
-- Name: idx_impact_simulations_expires; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_impact_simulations_expires ON public.impact_simulations USING btree (expires_at) WHERE (status = 'pending'::text);


--
-- Name: idx_impact_simulations_trigger; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_impact_simulations_trigger ON public.impact_simulations USING btree (trigger_type, trigger_id);


--
-- Name: idx_impact_simulations_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_impact_simulations_workspace ON public.impact_simulations USING btree (workspace_id, status);


--
-- Name: idx_integration_configs_project; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_integration_configs_project ON public.integration_configs USING btree (workspace_id, project_id);


--
-- Name: idx_integration_health_checked; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_integration_health_checked ON public.integration_health USING btree (workspace_id, integration_last_checked);


--
-- Name: idx_integration_health_service; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_integration_health_service ON public.integration_health USING btree (workspace_id, service);


--
-- Name: idx_notifications_ws; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_ws ON public.notifications USING btree (workspace_id);


--
-- Name: idx_oauth_sessions_expires; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_oauth_sessions_expires ON public.oauth_sessions USING btree (expires_at);


--
-- Name: idx_oauth_sessions_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_oauth_sessions_token ON public.oauth_sessions USING btree (state_token);


--
-- Name: idx_pcm_bucket; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pcm_bucket ON public.prediction_confidence_metrics USING btree (confidence_bucket);


--
-- Name: idx_pcm_context; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_pcm_context ON public.prediction_context_metrics USING btree (workspace_id, context_type, context_value);


--
-- Name: idx_pcm_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pcm_type ON public.prediction_context_metrics USING btree (workspace_id, context_type, historical_accuracy DESC);


--
-- Name: idx_pcm_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pcm_workspace ON public.prediction_confidence_metrics USING btree (workspace_id, confidence_bucket);


--
-- Name: idx_prediction_errors_error; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_prediction_errors_error ON public.prediction_errors USING btree (prediction_error_days);


--
-- Name: idx_prediction_errors_task; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_prediction_errors_task ON public.prediction_errors USING btree (task_id);


--
-- Name: idx_prediction_errors_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_prediction_errors_workspace ON public.prediction_errors USING btree (workspace_id, created_at DESC);


--
-- Name: idx_projects_composite; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_projects_composite ON public.projects USING btree (workspace_id, status) WHERE (deleted_at IS NULL);


--
-- Name: idx_projects_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_projects_status ON public.projects USING btree (status);


--
-- Name: idx_projects_team; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_projects_team ON public.projects USING btree (team_id);


--
-- Name: idx_projects_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_projects_workspace ON public.projects USING btree (workspace_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_sal_hash; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sal_hash ON public.system_audit_ledger USING btree (hash);


--
-- Name: idx_sal_project; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sal_project ON public.system_audit_ledger USING btree (project_id);


--
-- Name: idx_sal_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sal_workspace ON public.system_audit_ledger USING btree (workspace_id);


--
-- Name: idx_sync_jobs_retry; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sync_jobs_retry ON public.integration_sync_jobs USING btree (status, next_retry_at);


--
-- Name: idx_sync_jobs_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sync_jobs_status ON public.integration_sync_jobs USING btree (status);


--
-- Name: idx_sync_jobs_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sync_jobs_workspace ON public.integration_sync_jobs USING btree (workspace_id, status);


--
-- Name: idx_task_deps_depends; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_task_deps_depends ON public.task_dependencies USING btree (depends_on_task_id);


--
-- Name: idx_tasks_assignee; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_assignee ON public.tasks USING btree (assignee_id);


--
-- Name: idx_tasks_project; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_project ON public.tasks USING btree (project_id);


--
-- Name: idx_tasks_sprint; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_sprint ON public.tasks USING btree (sprint_id);


--
-- Name: idx_tasks_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_status ON public.tasks USING btree (status);


--
-- Name: idx_tasks_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_workspace ON public.tasks USING btree (workspace_id);


--
-- Name: idx_teams_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_teams_workspace ON public.teams USING btree (workspace_id);


--
-- Name: idx_users_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_workspace ON public.users USING btree (workspace_id);


--
-- Name: universal_comments_entity_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX universal_comments_entity_idx ON public.universal_comments USING btree (entity_type, entity_id);


--
-- Name: universal_comments_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX universal_comments_workspace_idx ON public.universal_comments USING btree (workspace_id);


--
-- Name: workspace_files_entity_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX workspace_files_entity_idx ON public.workspace_files USING btree (entity_type, entity_id);


--
-- Name: workspace_files_name_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX workspace_files_name_idx ON public.workspace_files USING gin (file_name public.gin_trgm_ops);


--
-- Name: workspace_files_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX workspace_files_workspace_idx ON public.workspace_files USING btree (workspace_id);


--
-- Name: tasks check_developer_task_restrictions; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER check_developer_task_restrictions BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.enforce_developer_task_restrictions();


--
-- Name: users check_role_escalation; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER check_role_escalation BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();


--
-- Name: expenses enforce_expense_lock; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER enforce_expense_lock BEFORE INSERT OR DELETE OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.check_financial_period_lock();


--
-- Name: invoices enforce_invoice_lock; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER enforce_invoice_lock BEFORE INSERT OR DELETE OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.check_financial_period_lock();


--
-- Name: payments enforce_payment_lock; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER enforce_payment_lock BEFORE INSERT OR DELETE OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.check_financial_period_lock();


--
-- Name: recurring_task_templates on_recurring_task_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER on_recurring_task_change AFTER INSERT OR UPDATE ON public.recurring_task_templates FOR EACH ROW EXECUTE FUNCTION public.log_recurring_task_activity();


--
-- Name: document_templates set_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_timestamp BEFORE UPDATE ON public.document_templates FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- Name: invoices trg_audit_gst_invoices; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_audit_gst_invoices AFTER INSERT OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.audit_gst_invoice_changes();


--
-- Name: payments trg_update_invoice_balance; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_update_invoice_balance AFTER INSERT OR DELETE OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_invoice_balance();


--
-- Name: expenses trigger_log_expense_activity; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_log_expense_activity AFTER INSERT OR DELETE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.log_finance_activity();


--
-- Name: financial_adjustments trigger_log_financial_adjustment; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_log_financial_adjustment AFTER INSERT ON public.financial_adjustments FOR EACH ROW EXECUTE FUNCTION public.log_financial_adjustment();


--
-- Name: invoices trigger_log_invoice_activity; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_log_invoice_activity AFTER INSERT OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.log_finance_activity();


--
-- Name: payments trigger_log_payment_activity; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_log_payment_activity AFTER INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION public.log_finance_activity();


--
-- Name: activity_logs activity_logs_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: activity_logs activity_logs_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: activity_logs activity_logs_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: activity_logs activity_logs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: allocation_periods allocation_periods_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.allocation_periods
    ADD CONSTRAINT allocation_periods_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: allocation_periods allocation_periods_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.allocation_periods
    ADD CONSTRAINT allocation_periods_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: allocation_periods allocation_periods_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.allocation_periods
    ADD CONSTRAINT allocation_periods_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: approval_instances approval_instances_chain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.approval_instances
    ADD CONSTRAINT approval_instances_chain_id_fkey FOREIGN KEY (chain_id) REFERENCES public.approval_chains(id) ON DELETE CASCADE;


--
-- Name: approval_steps approval_steps_chain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.approval_steps
    ADD CONSTRAINT approval_steps_chain_id_fkey FOREIGN KEY (chain_id) REFERENCES public.approval_chains(id) ON DELETE CASCADE;


--
-- Name: approvals approvals_milestone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.approvals
    ADD CONSTRAINT approvals_milestone_id_fkey FOREIGN KEY (milestone_id) REFERENCES public.milestones(id) ON DELETE SET NULL;


--
-- Name: attendance attendance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: attendance attendance_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: clients clients_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: comment_versions comment_versions_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comment_versions
    ADD CONSTRAINT comment_versions_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.universal_comments(id) ON DELETE CASCADE;


--
-- Name: comment_versions comment_versions_edited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comment_versions
    ADD CONSTRAINT comment_versions_edited_by_fkey FOREIGN KEY (edited_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: comments comments_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: comments comments_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: comments comments_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: comments comments_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: company_billing_profile company_billing_profile_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_billing_profile
    ADD CONSTRAINT company_billing_profile_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: compensation_records compensation_records_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compensation_records
    ADD CONSTRAINT compensation_records_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: compensation_records compensation_records_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compensation_records
    ADD CONSTRAINT compensation_records_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: compensation_records compensation_records_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compensation_records
    ADD CONSTRAINT compensation_records_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: compensation_records compensation_records_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compensation_records
    ADD CONSTRAINT compensation_records_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: doc_annotations doc_annotations_doc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.doc_annotations
    ADD CONSTRAINT doc_annotations_doc_id_fkey FOREIGN KEY (doc_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: doc_versions doc_versions_doc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.doc_versions
    ADD CONSTRAINT doc_versions_doc_id_fkey FOREIGN KEY (doc_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: document_template_history document_template_history_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_template_history
    ADD CONSTRAINT document_template_history_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: document_template_history document_template_history_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_template_history
    ADD CONSTRAINT document_template_history_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.document_templates(id) ON DELETE CASCADE;


--
-- Name: document_templates document_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: document_templates document_templates_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: employment_change_logs employment_change_logs_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employment_change_logs
    ADD CONSTRAINT employment_change_logs_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: employment_change_logs employment_change_logs_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employment_change_logs
    ADD CONSTRAINT employment_change_logs_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: employment_records employment_records_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employment_records
    ADD CONSTRAINT employment_records_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: employment_records employment_records_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employment_records
    ADD CONSTRAINT employment_records_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: employment_records employment_records_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employment_records
    ADD CONSTRAINT employment_records_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: employment_records employment_records_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employment_records
    ADD CONSTRAINT employment_records_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;


--
-- Name: expenses expenses_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: expenses expenses_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: file_versions file_versions_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_versions
    ADD CONSTRAINT file_versions_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.workspace_files(id) ON DELETE CASCADE;


--
-- Name: file_versions file_versions_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_versions
    ADD CONSTRAINT file_versions_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: files files_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: files files_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: files files_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: files files_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: financial_adjustments financial_adjustments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.financial_adjustments
    ADD CONSTRAINT financial_adjustments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: financial_adjustments financial_adjustments_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.financial_adjustments
    ADD CONSTRAINT financial_adjustments_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.financial_periods(id) ON DELETE CASCADE;


--
-- Name: financial_periods financial_periods_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.financial_periods
    ADD CONSTRAINT financial_periods_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: financial_periods financial_periods_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.financial_periods
    ADD CONSTRAINT financial_periods_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: financial_snapshots financial_snapshots_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.financial_snapshots
    ADD CONSTRAINT financial_snapshots_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.financial_periods(id) ON DELETE CASCADE;


--
-- Name: financial_snapshots financial_snapshots_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.financial_snapshots
    ADD CONSTRAINT financial_snapshots_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: generated_reports generated_reports_generated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.generated_reports
    ADD CONSTRAINT generated_reports_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: generated_reports generated_reports_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.generated_reports
    ADD CONSTRAINT generated_reports_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: invitations invitations_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: invitations invitations_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: invoice_line_items invoice_line_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoice_sequences invoice_sequences_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_sequences
    ADD CONSTRAINT invoice_sequences_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE RESTRICT;


--
-- Name: invoices invoices_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: meeting_attendees meeting_attendees_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meeting_attendees
    ADD CONSTRAINT meeting_attendees_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;


--
-- Name: milestones milestones_sprint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.milestones
    ADD CONSTRAINT milestones_sprint_id_fkey FOREIGN KEY (sprint_id) REFERENCES public.sprints(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: payments payments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: payments payments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE RESTRICT;


--
-- Name: personal_leave personal_leave_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_leave
    ADD CONSTRAINT personal_leave_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: project_allocations project_allocations_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_allocations
    ADD CONSTRAINT project_allocations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_allocations project_allocations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_allocations
    ADD CONSTRAINT project_allocations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: project_allocations project_allocations_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_allocations
    ADD CONSTRAINT project_allocations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: project_signoffs project_signoffs_approver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_signoffs
    ADD CONSTRAINT project_signoffs_approver_id_fkey FOREIGN KEY (approver_id) REFERENCES public.users(id);


--
-- Name: project_signoffs project_signoffs_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_signoffs
    ADD CONSTRAINT project_signoffs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_signoffs project_signoffs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_signoffs
    ADD CONSTRAINT project_signoffs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: projects projects_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: projects projects_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: projects projects_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;


--
-- Name: projects projects_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: recurring_task_history recurring_task_history_generated_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recurring_task_history
    ADD CONSTRAINT recurring_task_history_generated_task_id_fkey FOREIGN KEY (generated_task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: recurring_task_history recurring_task_history_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recurring_task_history
    ADD CONSTRAINT recurring_task_history_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.recurring_task_templates(id) ON DELETE CASCADE;


--
-- Name: recurring_task_templates recurring_task_templates_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recurring_task_templates
    ADD CONSTRAINT recurring_task_templates_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: recurring_task_templates recurring_task_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recurring_task_templates
    ADD CONSTRAINT recurring_task_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: recurring_task_templates recurring_task_templates_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recurring_task_templates
    ADD CONSTRAINT recurring_task_templates_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: recurring_task_templates recurring_task_templates_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recurring_task_templates
    ADD CONSTRAINT recurring_task_templates_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: salaries salaries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salaries
    ADD CONSTRAINT salaries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: salaries salaries_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salaries
    ADD CONSTRAINT salaries_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: skills skills_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: system_audit_ledger system_audit_ledger_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_audit_ledger
    ADD CONSTRAINT system_audit_ledger_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: system_audit_ledger system_audit_ledger_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_audit_ledger
    ADD CONSTRAINT system_audit_ledger_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: system_audit_ledger system_audit_ledger_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_audit_ledger
    ADD CONSTRAINT system_audit_ledger_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: system_audit_ledger system_audit_ledger_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_audit_ledger
    ADD CONSTRAINT system_audit_ledger_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: task_comments task_comments_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_comments
    ADD CONSTRAINT task_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: task_comments task_comments_parent_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_comments
    ADD CONSTRAINT task_comments_parent_comment_id_fkey FOREIGN KEY (parent_comment_id) REFERENCES public.task_comments(id) ON DELETE CASCADE;


--
-- Name: task_comments task_comments_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_comments
    ADD CONSTRAINT task_comments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_comments task_comments_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_comments
    ADD CONSTRAINT task_comments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: task_dependencies task_dependencies_depends_on_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_depends_on_task_id_fkey FOREIGN KEY (depends_on_task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_dependencies task_dependencies_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_dependencies task_dependencies_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_assignee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_parent_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_parent_task_id_fkey FOREIGN KEY (parent_task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: team_events team_events_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_events
    ADD CONSTRAINT team_events_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: team_members team_members_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: team_members team_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: team_members team_members_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: teams teams_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: universal_comments universal_comments_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.universal_comments
    ADD CONSTRAINT universal_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: universal_comments universal_comments_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.universal_comments
    ADD CONSTRAINT universal_comments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: user_skills user_skills_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_skills
    ADD CONSTRAINT user_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;


--
-- Name: user_skills user_skills_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_skills
    ADD CONSTRAINT user_skills_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_skills user_skills_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_skills
    ADD CONSTRAINT user_skills_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: users users_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: users users_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: wait_states wait_states_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wait_states
    ADD CONSTRAINT wait_states_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_files workspace_files_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_files
    ADD CONSTRAINT workspace_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: workspace_files workspace_files_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_files
    ADD CONSTRAINT workspace_files_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_holidays workspace_holidays_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_holidays
    ADD CONSTRAINT workspace_holidays_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_settings workspace_settings_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_settings
    ADD CONSTRAINT workspace_settings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspaces workspaces_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: activity_logs Activity logs are readable by workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Activity logs are readable by workspace" ON public.activity_logs FOR SELECT USING ((workspace_id = public.current_workspace()));


--
-- Name: activity_logs Activity logs can be inserted with verified actor; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Activity logs can be inserted with verified actor" ON public.activity_logs FOR INSERT WITH CHECK (((workspace_id = public.current_workspace()) AND ((actor_id IS NULL) OR (actor_id = auth.uid()))));


--
-- Name: calendar_sync_logs Allow authenticated insert to calendar_sync_logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow authenticated insert to calendar_sync_logs" ON public.calendar_sync_logs FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: calendar_sync_logs Allow authenticated select to calendar_sync_logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow authenticated select to calendar_sync_logs" ON public.calendar_sync_logs FOR SELECT TO authenticated USING (true);


--
-- Name: attendance Attendance can be managed by PMs and Admins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Attendance can be managed by PMs and Admins" ON public.attendance USING (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text]))))))) WITH CHECK (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text])))))));


--
-- Name: attendance Attendance is visible to workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Attendance is visible to workspace" ON public.attendance FOR SELECT USING ((workspace_id = public.current_workspace()));


--
-- Name: change_logs Authenticated users can insert change logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can insert change logs" ON public.change_logs FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: task_history_logs Authenticated users can insert task history logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can insert task history logs" ON public.task_history_logs FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: universal_comments Authors and admins can delete universal_comments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authors and admins can delete universal_comments" ON public.universal_comments FOR DELETE USING (((author_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.workspace_id = universal_comments.workspace_id) AND (users.role = ANY (ARRAY['super_admin'::text, 'admin'::text])))))));


--
-- Name: universal_comments Authors can update their own universal_comments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authors can update their own universal_comments" ON public.universal_comments FOR UPDATE USING ((author_id = auth.uid())) WITH CHECK ((author_id = auth.uid()));


--
-- Name: automation_templates Automation templates are public; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Automation templates are public" ON public.automation_templates USING (true) WITH CHECK (true);


--
-- Name: change_logs Change logs viewable by authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Change logs viewable by authenticated users" ON public.change_logs FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: comments Comments are visible to workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Comments are visible to workspace" ON public.comments FOR SELECT USING ((workspace_id = public.current_workspace()));


--
-- Name: comments Comments can be created by authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Comments can be created by authenticated users" ON public.comments FOR INSERT WITH CHECK (((workspace_id = public.current_workspace()) AND (author_id = auth.uid())));


--
-- Name: comments Comments can be moderated by PMs and Admins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Comments can be moderated by PMs and Admins" ON public.comments USING (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text]))))))) WITH CHECK (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text])))))));


--
-- Name: tasks Developers can update their assigned tasks; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Developers can update their assigned tasks" ON public.tasks FOR UPDATE USING (((workspace_id = public.current_workspace()) AND (assignee_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = 'developer'::text))))));


--
-- Name: invoice_line_items Enable access for authorized users via invoice; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable access for authorized users via invoice" ON public.invoice_line_items USING ((EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = invoice_line_items.invoice_id) AND (public.get_user_role(i.workspace_id) = 'super_admin'::text)))));


--
-- Name: payments Enable access for authorized users via invoice; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable access for authorized users via invoice" ON public.payments USING ((EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = payments.invoice_id) AND (public.get_user_role(i.workspace_id) = 'super_admin'::text)))));


--
-- Name: skills Enable read access for all workspace members; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for all workspace members" ON public.skills FOR SELECT USING ((public.get_user_role(workspace_id) IS NOT NULL));


--
-- Name: clients Enable read access for authorized users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for authorized users" ON public.clients FOR SELECT USING ((public.get_user_role(workspace_id) = 'super_admin'::text));


--
-- Name: company_billing_profile Enable read access for authorized users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for authorized users" ON public.company_billing_profile FOR SELECT USING ((public.get_user_role(workspace_id) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'manager'::text, 'member'::text])));


--
-- Name: document_template_history Enable read access for authorized users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for authorized users" ON public.document_template_history FOR SELECT USING ((public.get_user_role(( SELECT document_templates.workspace_id
   FROM public.document_templates
  WHERE (document_templates.id = document_template_history.template_id))) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'manager'::text, 'member'::text])));


--
-- Name: document_templates Enable read access for authorized users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for authorized users" ON public.document_templates FOR SELECT USING ((public.get_user_role(workspace_id) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'manager'::text, 'member'::text])));


--
-- Name: expenses Enable read access for authorized users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for authorized users" ON public.expenses FOR SELECT USING ((public.get_user_role(workspace_id) = 'super_admin'::text));


--
-- Name: financial_adjustments Enable read access for authorized users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for authorized users" ON public.financial_adjustments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.financial_periods p
  WHERE ((p.id = financial_adjustments.period_id) AND (public.get_user_role(p.workspace_id) = 'super_admin'::text)))));


--
-- Name: financial_periods Enable read access for authorized users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for authorized users" ON public.financial_periods FOR SELECT USING ((public.get_user_role(workspace_id) = 'super_admin'::text));


--
-- Name: financial_snapshots Enable read access for authorized users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for authorized users" ON public.financial_snapshots FOR SELECT USING ((public.get_user_role(workspace_id) = 'super_admin'::text));


--
-- Name: invoices Enable read access for authorized users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for authorized users" ON public.invoices FOR SELECT USING ((public.get_user_role(workspace_id) = 'super_admin'::text));


--
-- Name: invoice_line_items Enable read access for authorized users via invoice; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for authorized users via invoice" ON public.invoice_line_items FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = invoice_line_items.invoice_id) AND (public.get_user_role(i.workspace_id) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'manager'::text, 'member'::text]))))));


--
-- Name: recurring_task_history Enable read access for history; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for history" ON public.recurring_task_history FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.recurring_task_templates t
  WHERE ((t.id = recurring_task_history.template_id) AND public.can_access_entity('project'::text, t.project_id)))));


--
-- Name: recurring_task_templates Enable read access for project members on recurring_task_templa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for project members on recurring_task_templa" ON public.recurring_task_templates FOR SELECT USING ((public.can_access_entity('project'::text, project_id) AND (deleted_at IS NULL)));


--
-- Name: user_skills Enable read access for workspace members; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for workspace members" ON public.user_skills FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.skills s
  WHERE ((s.id = user_skills.skill_id) AND (public.get_user_role(s.workspace_id) IS NOT NULL)))));


--
-- Name: clients Enable write access for authorized users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable write access for authorized users" ON public.clients USING ((public.get_user_role(workspace_id) = 'super_admin'::text));


--
-- Name: expenses Enable write access for authorized users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable write access for authorized users" ON public.expenses USING ((public.get_user_role(workspace_id) = 'super_admin'::text));


--
-- Name: financial_adjustments Enable write access for authorized users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable write access for authorized users" ON public.financial_adjustments USING ((EXISTS ( SELECT 1
   FROM public.financial_periods p
  WHERE ((p.id = financial_adjustments.period_id) AND (public.get_user_role(p.workspace_id) = 'super_admin'::text)))));


--
-- Name: financial_periods Enable write access for authorized users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable write access for authorized users" ON public.financial_periods USING ((public.get_user_role(workspace_id) = 'super_admin'::text));


--
-- Name: financial_snapshots Enable write access for authorized users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable write access for authorized users" ON public.financial_snapshots USING ((public.get_user_role(workspace_id) = 'super_admin'::text));


--
-- Name: invoices Enable write access for authorized users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable write access for authorized users" ON public.invoices USING ((public.get_user_role(workspace_id) = 'super_admin'::text));


--
-- Name: recurring_task_templates Enable write access for authorized users on recurring_task_temp; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable write access for authorized users on recurring_task_temp" ON public.recurring_task_templates USING ((public.can_access_entity('project'::text, project_id) AND ((public.get_user_role(workspace_id) = ANY (ARRAY['super_admin'::text, 'pm'::text])) OR (created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = recurring_task_templates.project_id) AND (p.owner_id = auth.uid())))))));


--
-- Name: invoice_line_items Enable write access for authorized users via invoice; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable write access for authorized users via invoice" ON public.invoice_line_items USING ((EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = invoice_line_items.invoice_id) AND (public.get_user_role(i.workspace_id) = 'super_admin'::text)))));


--
-- Name: skills Enable write access for managers and admins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable write access for managers and admins" ON public.skills USING ((public.get_user_role(workspace_id) = ANY (ARRAY['super_admin'::text, 'pm'::text])));


--
-- Name: company_billing_profile Enable write access for super admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable write access for super admin" ON public.company_billing_profile USING ((public.get_user_role(workspace_id) = 'super_admin'::text));


--
-- Name: document_template_history Enable write access for super admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable write access for super admin" ON public.document_template_history USING ((public.get_user_role(( SELECT document_templates.workspace_id
   FROM public.document_templates
  WHERE (document_templates.id = document_template_history.template_id))) = 'super_admin'::text));


--
-- Name: document_templates Enable write access for super admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable write access for super admin" ON public.document_templates USING ((public.get_user_role(workspace_id) = 'super_admin'::text));


--
-- Name: calendar_events Exclude soft-deleted calendar_events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Exclude soft-deleted calendar_events" ON public.calendar_events FOR SELECT USING ((deleted_at IS NULL));


--
-- Name: meetings Exclude soft-deleted meetings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Exclude soft-deleted meetings" ON public.meetings FOR SELECT USING ((deleted_at IS NULL));


--
-- Name: sprints Exclude soft-deleted sprints; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Exclude soft-deleted sprints" ON public.sprints FOR SELECT USING ((deleted_at IS NULL));


--
-- Name: files Files are visible to workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Files are visible to workspace" ON public.files FOR SELECT USING ((workspace_id = public.current_workspace()));


--
-- Name: files Files can be managed by PMs and Admins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Files can be managed by PMs and Admins" ON public.files USING (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text]))))))) WITH CHECK (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text])))))));


--
-- Name: files Files can be uploaded by authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Files can be uploaded by authenticated users" ON public.files FOR INSERT WITH CHECK (((workspace_id = public.current_workspace()) AND (uploaded_by = auth.uid())));


--
-- Name: change_logs Forbid DELETE on change logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Forbid DELETE on change logs" ON public.change_logs FOR DELETE USING (false);


--
-- Name: task_history_logs Forbid DELETE on task history logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Forbid DELETE on task history logs" ON public.task_history_logs FOR DELETE USING (false);


--
-- Name: change_logs Forbid UPDATE on change logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Forbid UPDATE on change logs" ON public.change_logs FOR UPDATE USING (false);


--
-- Name: task_history_logs Forbid UPDATE on task history logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Forbid UPDATE on task history logs" ON public.task_history_logs FOR UPDATE USING (false);


--
-- Name: invitations Invitations are readable by the invited email or workspace memb; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Invitations are readable by the invited email or workspace memb" ON public.invitations FOR SELECT USING (((lower(email) = lower(auth.email())) OR (workspace_id = public.current_workspace())));


--
-- Name: invitations Invited users can accept their own invitation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Invited users can accept their own invitation" ON public.invitations FOR UPDATE USING (((lower(email) = lower(auth.email())) AND (status = 'pending'::text))) WITH CHECK (((lower(email) = lower(auth.email())) AND (status = 'accepted'::text)));


--
-- Name: users Invited users can bootstrap their own user row; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Invited users can bootstrap their own user row" ON public.users FOR INSERT WITH CHECK (((id = auth.uid()) AND (lower(email) = lower(auth.email())) AND (EXISTS ( SELECT 1
   FROM public.invitations
  WHERE ((lower(invitations.email) = lower(auth.email())) AND (invitations.workspace_id = users.workspace_id) AND (invitations.role = users.role) AND (invitations.status = 'pending'::text))))));


--
-- Name: user_skills Managers can verify and manage team skills; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Managers can verify and manage team skills" ON public.user_skills USING ((EXISTS ( SELECT 1
   FROM public.skills s
  WHERE ((s.id = user_skills.skill_id) AND (public.get_user_role(s.workspace_id) = ANY (ARRAY['super_admin'::text, 'pm'::text]))))));


--
-- Name: notifications Notifications are visible to workspace members; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Notifications are visible to workspace members" ON public.notifications FOR SELECT USING ((workspace_id = public.current_workspace()));


--
-- Name: notifications Notifications can be managed by PMs and Admins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Notifications can be managed by PMs and Admins" ON public.notifications USING (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text]))))))) WITH CHECK (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text])))))));


--
-- Name: notifications Notifications can be self-targeted; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Notifications can be self-targeted" ON public.notifications FOR INSERT WITH CHECK (((workspace_id = public.current_workspace()) AND (user_id = auth.uid())));


--
-- Name: personal_leave PMs and Admins can manage all leave; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "PMs and Admins can manage all leave" ON public.personal_leave USING (((user_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.workspace_id = public.current_workspace()))) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text]))))))) WITH CHECK (((user_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.workspace_id = public.current_workspace()))) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text])))))));


--
-- Name: personal_leave Personal leave is visible to workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Personal leave is visible to workspace" ON public.personal_leave FOR SELECT USING ((user_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.workspace_id = public.current_workspace()))));


--
-- Name: projects Projects are visible to workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Projects are visible to workspace" ON public.projects FOR SELECT USING (((workspace_id = public.current_workspace()) AND (deleted_at IS NULL)));


--
-- Name: projects Projects can be mutated by PMs and Admins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Projects can be mutated by PMs and Admins" ON public.projects USING (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text]))))))) WITH CHECK (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text])))))));


--
-- Name: salaries Salaries are visible to admins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Salaries are visible to admins" ON public.salaries FOR SELECT USING (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text])))))));


--
-- Name: salaries Salaries can be managed by PMs and Admins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Salaries can be managed by PMs and Admins" ON public.salaries USING (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text]))))))) WITH CHECK (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text])))))));


--
-- Name: compensation_records Super Admins have full access to compensation_records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Super Admins have full access to compensation_records" ON public.compensation_records USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.workspace_id = compensation_records.workspace_id) AND (users.role = 'super_admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.workspace_id = compensation_records.workspace_id) AND (users.role = 'super_admin'::text)))));


--
-- Name: employment_change_logs Super Admins have full access to employment_change_logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Super Admins have full access to employment_change_logs" ON public.employment_change_logs USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'super_admin'::text)))));


--
-- Name: employment_records Super Admins have full access to employment_records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Super Admins have full access to employment_records" ON public.employment_records USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'super_admin'::text)))));


--
-- Name: system_audit_ledger System audit ledger is insertable by authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "System audit ledger is insertable by authenticated users" ON public.system_audit_ledger FOR INSERT WITH CHECK ((workspace_id = public.current_workspace()));


--
-- Name: system_audit_ledger System audit ledger is viewable by workspace admins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "System audit ledger is viewable by workspace admins" ON public.system_audit_ledger FOR SELECT USING (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.workspace_id = public.current_workspace()) AND (users.role = ANY (ARRAY['super_admin'::text, 'pm'::text])))))));


--
-- Name: tactical_tasks Tactical tasks viewable by authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Tactical tasks viewable by authenticated users" ON public.tactical_tasks FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: task_dependencies Task dependencies are visible to workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Task dependencies are visible to workspace" ON public.task_dependencies FOR SELECT USING ((workspace_id = public.current_workspace()));


--
-- Name: task_dependencies Task dependencies can be managed by PMs and Admins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Task dependencies can be managed by PMs and Admins" ON public.task_dependencies USING (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text]))))))) WITH CHECK (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text])))))));


--
-- Name: task_history_logs Task history logs viewable by authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Task history logs viewable by authenticated users" ON public.task_history_logs FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: tasks Tasks are visible to workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Tasks are visible to workspace" ON public.tasks FOR SELECT USING ((workspace_id = public.current_workspace()));


--
-- Name: tasks Tasks can be created by PMs and Admins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Tasks can be created by PMs and Admins" ON public.tasks FOR INSERT WITH CHECK (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text])))))));


--
-- Name: tasks Tasks can be deleted by PMs and Admins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Tasks can be deleted by PMs and Admins" ON public.tasks FOR DELETE USING (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text])))))));


--
-- Name: tasks Tasks can be fully updated by PMs and Admins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Tasks can be fully updated by PMs and Admins" ON public.tasks FOR UPDATE USING (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text])))))));


--
-- Name: team_events Team events are visible to workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Team events are visible to workspace" ON public.team_events FOR SELECT USING ((team_id IN ( SELECT teams.id
   FROM public.teams
  WHERE (teams.workspace_id = public.current_workspace()))));


--
-- Name: team_events Team events can be managed by PMs and Admins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Team events can be managed by PMs and Admins" ON public.team_events USING (((team_id IN ( SELECT teams.id
   FROM public.teams
  WHERE (teams.workspace_id = public.current_workspace()))) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text]))))))) WITH CHECK (((team_id IN ( SELECT teams.id
   FROM public.teams
  WHERE (teams.workspace_id = public.current_workspace()))) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text])))))));


--
-- Name: team_members Team members are visible to workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Team members are visible to workspace" ON public.team_members FOR SELECT USING ((workspace_id = public.current_workspace()));


--
-- Name: team_members Team members can be managed by PMs and Admins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Team members can be managed by PMs and Admins" ON public.team_members USING (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text]))))))) WITH CHECK (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text])))))));


--
-- Name: teams Teams are visible to workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Teams are visible to workspace" ON public.teams FOR SELECT USING ((workspace_id = public.current_workspace()));


--
-- Name: teams Teams can be managed by PMs and Admins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Teams can be managed by PMs and Admins" ON public.teams USING (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text]))))))) WITH CHECK (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text])))))));


--
-- Name: file_versions Users can delete file versions if they can manage the file; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete file versions if they can manage the file" ON public.file_versions FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.workspace_files wf
  WHERE ((wf.id = file_versions.file_id) AND (wf.workspace_id = public.current_workspace()) AND public.can_manage_entity_file(wf.entity_type, wf.entity_id, wf.uploaded_by)))));


--
-- Name: workspace_files Users can delete their files or if they have permission; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete their files or if they have permission" ON public.workspace_files FOR DELETE USING (((workspace_id = public.current_workspace()) AND public.can_manage_entity_file(entity_type, entity_id, uploaded_by)));


--
-- Name: comments Users can delete their own comments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete their own comments" ON public.comments FOR DELETE USING (((workspace_id = public.current_workspace()) AND (author_id = auth.uid())));


--
-- Name: comments Users can edit their own comments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can edit their own comments" ON public.comments FOR UPDATE USING (((workspace_id = public.current_workspace()) AND (author_id = auth.uid())));


--
-- Name: file_versions Users can insert file versions if they can manage the file; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert file versions if they can manage the file" ON public.file_versions FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.workspace_files wf
  WHERE ((wf.id = file_versions.file_id) AND (wf.workspace_id = public.current_workspace()) AND public.can_manage_entity_file(wf.entity_type, wf.entity_id, wf.uploaded_by)))));


--
-- Name: workspace_files Users can insert files to accessible entities; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert files to accessible entities" ON public.workspace_files FOR INSERT WITH CHECK (((workspace_id = public.current_workspace()) AND public.can_insert_entity_file(entity_type, entity_id)));


--
-- Name: generated_reports Users can insert reports; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert reports" ON public.generated_reports FOR INSERT WITH CHECK ((public.get_user_role(workspace_id) IS NOT NULL));


--
-- Name: users Users can insert their own pending user row; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert their own pending user row" ON public.users FOR INSERT WITH CHECK (((id = auth.uid()) AND (role = 'pending-workspace-setup'::text) AND (workspace_id IS NULL)));


--
-- Name: personal_leave Users can manage their own leave; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own leave" ON public.personal_leave USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: user_skills Users can manage their own skills; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own skills" ON public.user_skills USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: notifications Users can update own notifications; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (((workspace_id = public.current_workspace()) AND (user_id = auth.uid())));


--
-- Name: workspace_files Users can update their files or if they have permission; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their files or if they have permission" ON public.workspace_files FOR UPDATE USING (((workspace_id = public.current_workspace()) AND public.can_manage_entity_file(entity_type, entity_id, uploaded_by)));


--
-- Name: users Users can update their own safe profile fields; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own safe profile fields" ON public.users FOR UPDATE USING ((id = auth.uid())) WITH CHECK (((id = auth.uid()) AND (((NOT (role IS DISTINCT FROM ( SELECT users_1.role
   FROM public.users users_1
  WHERE (users_1.id = auth.uid())))) AND (NOT (workspace_id IS DISTINCT FROM ( SELECT users_1.workspace_id
   FROM public.users users_1
  WHERE (users_1.id = auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM public.workspaces
  WHERE ((workspaces.id = users.workspace_id) AND (workspaces.owner_id = auth.uid())))))));


--
-- Name: workspace_files Users can view accessible entity files; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view accessible entity files" ON public.workspace_files FOR SELECT USING (((workspace_id = public.current_workspace()) AND public.can_access_entity(entity_type, entity_id)));


--
-- Name: file_versions Users can view accessible file versions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view accessible file versions" ON public.file_versions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.workspace_files wf
  WHERE ((wf.id = file_versions.file_id) AND (wf.workspace_id = public.current_workspace()) AND public.can_access_entity(wf.entity_type, wf.entity_id)))));


--
-- Name: generated_reports Users can view reports they generated or if they are admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view reports they generated or if they are admin" ON public.generated_reports FOR SELECT USING (((generated_by = auth.uid()) OR (public.get_user_role(workspace_id) = ANY (ARRAY['super_admin'::text, 'pm'::text]))));


--
-- Name: employment_change_logs Users can view their own change logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own change logs" ON public.employment_change_logs FOR SELECT USING ((employee_id = auth.uid()));


--
-- Name: employment_records Users can view their own employment_records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own employment_records" ON public.employment_records FOR SELECT USING ((profile_id = auth.uid()));


--
-- Name: notifications Users can view their own notifications; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT USING (((recipient_id = auth.uid()) OR (user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.workspace_id = notifications.workspace_id) AND (u.role = 'super_admin'::text))))));


--
-- Name: users Users visible within workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users visible within workspace" ON public.users FOR SELECT USING (((id = auth.uid()) OR (workspace_id = public.current_workspace())));


--
-- Name: users Workspace admins can delete users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Workspace admins can delete users" ON public.users FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = users.workspace_id) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text]))))));


--
-- Name: users Workspace admins can insert users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Workspace admins can insert users" ON public.users FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = users.workspace_id) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text]))))));


--
-- Name: users Workspace admins can update users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Workspace admins can update users" ON public.users FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = users.workspace_id) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text]))))));


--
-- Name: workspace_holidays Workspace holidays are visible to workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Workspace holidays are visible to workspace" ON public.workspace_holidays FOR SELECT USING ((workspace_id = public.current_workspace()));


--
-- Name: workspace_holidays Workspace holidays can be managed by PMs and Admins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Workspace holidays can be managed by PMs and Admins" ON public.workspace_holidays USING (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text]))))))) WITH CHECK (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text])))))));


--
-- Name: employment_records Workspace managers can view employment_records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Workspace managers can view employment_records" ON public.employment_records FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.workspace_id = employment_records.workspace_id) AND (users.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'manager'::text, 'editor'::text]))))));


--
-- Name: workspaces Workspace members can view their workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Workspace members can view their workspace" ON public.workspaces FOR SELECT USING (((id = public.current_workspace()) OR (owner_id = auth.uid())));


--
-- Name: users Workspace owner can create first super admin user; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Workspace owner can create first super admin user" ON public.users FOR INSERT WITH CHECK (((id = auth.uid()) AND (role = 'super_admin'::text) AND (EXISTS ( SELECT 1
   FROM public.workspaces
  WHERE ((workspaces.id = users.workspace_id) AND (workspaces.owner_id = auth.uid()))))));


--
-- Name: workspaces Workspace owner can create workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Workspace owner can create workspace" ON public.workspaces FOR INSERT WITH CHECK ((owner_id = auth.uid()));


--
-- Name: workspaces Workspace owner can update workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Workspace owner can update workspace" ON public.workspaces FOR UPDATE USING ((owner_id = auth.uid()));


--
-- Name: workspace_settings Workspace settings are visible to workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Workspace settings are visible to workspace" ON public.workspace_settings FOR SELECT USING ((workspace_id = public.current_workspace()));


--
-- Name: workspace_settings Workspace settings can be managed by PMs and Admins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Workspace settings can be managed by PMs and Admins" ON public.workspace_settings USING (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text]))))))) WITH CHECK (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE ((me.id = auth.uid()) AND (me.workspace_id = public.current_workspace()) AND (me.role = ANY (ARRAY['super_admin'::text, 'pm'::text])))))));


--
-- Name: invitations Workspace super admins can manage invitations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Workspace super admins can manage invitations" ON public.invitations USING (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'super_admin'::text)))))) WITH CHECK (((workspace_id = public.current_workspace()) AND (EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'super_admin'::text))))));


--
-- Name: universal_comments Workspace users can insert universal_comments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Workspace users can insert universal_comments" ON public.universal_comments FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.workspace_id = universal_comments.workspace_id)))));


--
-- Name: comment_versions Workspace users can view comment_versions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Workspace users can view comment_versions" ON public.comment_versions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.universal_comments uc
     JOIN public.users u ON ((u.workspace_id = uc.workspace_id)))
  WHERE ((uc.id = comment_versions.comment_id) AND (u.id = auth.uid())))));


--
-- Name: universal_comments Workspace users can view universal_comments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Workspace users can view universal_comments" ON public.universal_comments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.workspace_id = universal_comments.workspace_id)))));


--
-- Name: activity_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_recommendations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.ai_recommendations ENABLE ROW LEVEL SECURITY;

--
-- Name: allocation_periods; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.allocation_periods ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_chains; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.approval_chains ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_instances; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.approval_instances ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_steps; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.approval_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: approvals; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: automation_rules; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: automation_templates; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.automation_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_sync_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.calendar_sync_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: change_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.change_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: clients; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

--
-- Name: command_usage_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.command_usage_events ENABLE ROW LEVEL SECURITY;

--
-- Name: comment_versions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.comment_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: comments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

--
-- Name: company_billing_profile; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.company_billing_profile ENABLE ROW LEVEL SECURITY;

--
-- Name: compensation_records; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.compensation_records ENABLE ROW LEVEL SECURITY;

--
-- Name: connected_accounts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.connected_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: doc_annotations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.doc_annotations ENABLE ROW LEVEL SECURITY;

--
-- Name: doc_versions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.doc_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: document_template_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.document_template_history ENABLE ROW LEVEL SECURITY;

--
-- Name: document_templates; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: documents; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

--
-- Name: employment_change_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.employment_change_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: employment_records; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.employment_records ENABLE ROW LEVEL SECURITY;

--
-- Name: epics; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.epics ENABLE ROW LEVEL SECURITY;

--
-- Name: escalation_policies; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.escalation_policies ENABLE ROW LEVEL SECURITY;

--
-- Name: expenses; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: file_versions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.file_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: files; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

--
-- Name: financial_adjustments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.financial_adjustments ENABLE ROW LEVEL SECURITY;

--
-- Name: financial_periods; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.financial_periods ENABLE ROW LEVEL SECURITY;

--
-- Name: financial_snapshots; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.financial_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: generated_reports; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.generated_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: impact_simulations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.impact_simulations ENABLE ROW LEVEL SECURITY;

--
-- Name: integration_configs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.integration_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: integration_health; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.integration_health ENABLE ROW LEVEL SECURITY;

--
-- Name: integration_sync_jobs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.integration_sync_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: invitations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_line_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_sequences; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.invoice_sequences ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: meeting_attendees; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.meeting_attendees ENABLE ROW LEVEL SECURITY;

--
-- Name: meetings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

--
-- Name: mention_rules; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.mention_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: milestones; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_channels; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.notification_channels ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: oauth_sessions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.oauth_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: personal_leave; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.personal_leave ENABLE ROW LEVEL SECURITY;

--
-- Name: prediction_confidence_metrics; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.prediction_confidence_metrics ENABLE ROW LEVEL SECURITY;

--
-- Name: prediction_context_metrics; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.prediction_context_metrics ENABLE ROW LEVEL SECURITY;

--
-- Name: prediction_errors; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.prediction_errors ENABLE ROW LEVEL SECURITY;

--
-- Name: project_allocations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.project_allocations ENABLE ROW LEVEL SECURITY;

--
-- Name: project_signoffs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.project_signoffs ENABLE ROW LEVEL SECURITY;

--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: recurring_task_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.recurring_task_history ENABLE ROW LEVEL SECURITY;

--
-- Name: recurring_task_templates; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.recurring_task_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: salaries; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.salaries ENABLE ROW LEVEL SECURITY;

--
-- Name: skills; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

--
-- Name: sprints; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.sprints ENABLE ROW LEVEL SECURITY;

--
-- Name: system_audit_ledger; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.system_audit_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: tactical_tasks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.tactical_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: task_comments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: task_dependencies; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;

--
-- Name: task_history_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.task_history_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: team_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.team_events ENABLE ROW LEVEL SECURITY;

--
-- Name: team_members; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

--
-- Name: teams; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

--
-- Name: universal_comments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.universal_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: user_skills; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.user_skills ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: wait_states; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.wait_states ENABLE ROW LEVEL SECURITY;

--
-- Name: webhooks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_files; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.workspace_files ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_holidays; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.workspace_holidays ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.workspace_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: workspaces; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION audit_gst_invoice_changes(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.audit_gst_invoice_changes() TO anon;
GRANT ALL ON FUNCTION public.audit_gst_invoice_changes() TO authenticated;
GRANT ALL ON FUNCTION public.audit_gst_invoice_changes() TO service_role;


--
-- Name: FUNCTION can_access_entity(p_entity_type text, p_entity_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_access_entity(p_entity_type text, p_entity_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_access_entity(p_entity_type text, p_entity_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_entity(p_entity_type text, p_entity_id uuid) TO service_role;


--
-- Name: FUNCTION can_insert_entity_file(p_entity_type text, p_entity_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_insert_entity_file(p_entity_type text, p_entity_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_insert_entity_file(p_entity_type text, p_entity_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_insert_entity_file(p_entity_type text, p_entity_id uuid) TO service_role;


--
-- Name: FUNCTION can_manage_entity_file(p_entity_type text, p_entity_id uuid, p_uploaded_by uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_manage_entity_file(p_entity_type text, p_entity_id uuid, p_uploaded_by uuid) TO anon;
GRANT ALL ON FUNCTION public.can_manage_entity_file(p_entity_type text, p_entity_id uuid, p_uploaded_by uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_manage_entity_file(p_entity_type text, p_entity_id uuid, p_uploaded_by uuid) TO service_role;


--
-- Name: FUNCTION check_financial_period_lock(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.check_financial_period_lock() TO anon;
GRANT ALL ON FUNCTION public.check_financial_period_lock() TO authenticated;
GRANT ALL ON FUNCTION public.check_financial_period_lock() TO service_role;


--
-- Name: FUNCTION close_financial_period(p_workspace_id uuid, p_month integer, p_year integer, p_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.close_financial_period(p_workspace_id uuid, p_month integer, p_year integer, p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.close_financial_period(p_workspace_id uuid, p_month integer, p_year integer, p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.close_financial_period(p_workspace_id uuid, p_month integer, p_year integer, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION current_workspace(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.current_workspace() TO anon;
GRANT ALL ON FUNCTION public.current_workspace() TO authenticated;
GRANT ALL ON FUNCTION public.current_workspace() TO service_role;


--
-- Name: FUNCTION enforce_developer_task_restrictions(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.enforce_developer_task_restrictions() TO anon;
GRANT ALL ON FUNCTION public.enforce_developer_task_restrictions() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_developer_task_restrictions() TO service_role;


--
-- Name: FUNCTION enforce_task_completion_governance(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.enforce_task_completion_governance() TO anon;
GRANT ALL ON FUNCTION public.enforce_task_completion_governance() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_task_completion_governance() TO service_role;


--
-- Name: FUNCTION generate_invoice_number(p_workspace_id uuid, p_prefix text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.generate_invoice_number(p_workspace_id uuid, p_prefix text) TO anon;
GRANT ALL ON FUNCTION public.generate_invoice_number(p_workspace_id uuid, p_prefix text) TO authenticated;
GRANT ALL ON FUNCTION public.generate_invoice_number(p_workspace_id uuid, p_prefix text) TO service_role;


--
-- Name: FUNCTION get_operational_intelligence(p_workspace_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_operational_intelligence(p_workspace_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_operational_intelligence(p_workspace_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_operational_intelligence(p_workspace_id uuid) TO service_role;


--
-- Name: FUNCTION get_user_role(target_workspace_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_user_role(target_workspace_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_user_role(target_workspace_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_user_role(target_workspace_id uuid) TO service_role;


--
-- Name: FUNCTION is_approved_user(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_approved_user() TO anon;
GRANT ALL ON FUNCTION public.is_approved_user() TO authenticated;
GRANT ALL ON FUNCTION public.is_approved_user() TO service_role;


--
-- Name: FUNCTION log_finance_activity(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.log_finance_activity() TO anon;
GRANT ALL ON FUNCTION public.log_finance_activity() TO authenticated;
GRANT ALL ON FUNCTION public.log_finance_activity() TO service_role;


--
-- Name: FUNCTION log_financial_adjustment(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.log_financial_adjustment() TO anon;
GRANT ALL ON FUNCTION public.log_financial_adjustment() TO authenticated;
GRANT ALL ON FUNCTION public.log_financial_adjustment() TO service_role;


--
-- Name: FUNCTION log_recurring_task_activity(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.log_recurring_task_activity() TO anon;
GRANT ALL ON FUNCTION public.log_recurring_task_activity() TO authenticated;
GRANT ALL ON FUNCTION public.log_recurring_task_activity() TO service_role;


--
-- Name: FUNCTION prevent_role_escalation(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.prevent_role_escalation() TO anon;
GRANT ALL ON FUNCTION public.prevent_role_escalation() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_role_escalation() TO service_role;


--
-- Name: FUNCTION process_recurring_tasks(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.process_recurring_tasks() TO anon;
GRANT ALL ON FUNCTION public.process_recurring_tasks() TO authenticated;
GRANT ALL ON FUNCTION public.process_recurring_tasks() TO service_role;


--
-- Name: FUNCTION search_workspace(p_query text, p_limit integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.search_workspace(p_query text, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.search_workspace(p_query text, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.search_workspace(p_query text, p_limit integer) TO service_role;


--
-- Name: FUNCTION trigger_set_timestamp(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.trigger_set_timestamp() TO anon;
GRANT ALL ON FUNCTION public.trigger_set_timestamp() TO authenticated;
GRANT ALL ON FUNCTION public.trigger_set_timestamp() TO service_role;


--
-- Name: FUNCTION trigger_update_project_pert(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.trigger_update_project_pert() TO anon;
GRANT ALL ON FUNCTION public.trigger_update_project_pert() TO authenticated;
GRANT ALL ON FUNCTION public.trigger_update_project_pert() TO service_role;


--
-- Name: FUNCTION update_invoice_balance(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_invoice_balance() TO anon;
GRANT ALL ON FUNCTION public.update_invoice_balance() TO authenticated;
GRANT ALL ON FUNCTION public.update_invoice_balance() TO service_role;


--
-- Name: TABLE activity_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.activity_logs TO anon;
GRANT ALL ON TABLE public.activity_logs TO authenticated;
GRANT ALL ON TABLE public.activity_logs TO service_role;


--
-- Name: TABLE ai_recommendations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ai_recommendations TO anon;
GRANT ALL ON TABLE public.ai_recommendations TO authenticated;
GRANT ALL ON TABLE public.ai_recommendations TO service_role;


--
-- Name: TABLE allocation_periods; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.allocation_periods TO anon;
GRANT ALL ON TABLE public.allocation_periods TO authenticated;
GRANT ALL ON TABLE public.allocation_periods TO service_role;


--
-- Name: TABLE approval_chains; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.approval_chains TO anon;
GRANT ALL ON TABLE public.approval_chains TO authenticated;
GRANT ALL ON TABLE public.approval_chains TO service_role;


--
-- Name: TABLE approval_instances; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.approval_instances TO anon;
GRANT ALL ON TABLE public.approval_instances TO authenticated;
GRANT ALL ON TABLE public.approval_instances TO service_role;


--
-- Name: TABLE approval_steps; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.approval_steps TO anon;
GRANT ALL ON TABLE public.approval_steps TO authenticated;
GRANT ALL ON TABLE public.approval_steps TO service_role;


--
-- Name: TABLE approvals; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.approvals TO anon;
GRANT ALL ON TABLE public.approvals TO authenticated;
GRANT ALL ON TABLE public.approvals TO service_role;


--
-- Name: TABLE attendance; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.attendance TO anon;
GRANT ALL ON TABLE public.attendance TO authenticated;
GRANT ALL ON TABLE public.attendance TO service_role;


--
-- Name: TABLE audit_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.audit_logs TO anon;
GRANT ALL ON TABLE public.audit_logs TO authenticated;
GRANT ALL ON TABLE public.audit_logs TO service_role;


--
-- Name: TABLE automation_rules; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.automation_rules TO anon;
GRANT ALL ON TABLE public.automation_rules TO authenticated;
GRANT ALL ON TABLE public.automation_rules TO service_role;


--
-- Name: TABLE automation_templates; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.automation_templates TO anon;
GRANT ALL ON TABLE public.automation_templates TO authenticated;
GRANT ALL ON TABLE public.automation_templates TO service_role;


--
-- Name: TABLE calendar_events; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.calendar_events TO anon;
GRANT ALL ON TABLE public.calendar_events TO authenticated;
GRANT ALL ON TABLE public.calendar_events TO service_role;


--
-- Name: TABLE calendar_sync_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.calendar_sync_logs TO anon;
GRANT ALL ON TABLE public.calendar_sync_logs TO authenticated;
GRANT ALL ON TABLE public.calendar_sync_logs TO service_role;


--
-- Name: TABLE change_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.change_logs TO anon;
GRANT ALL ON TABLE public.change_logs TO authenticated;
GRANT ALL ON TABLE public.change_logs TO service_role;


--
-- Name: TABLE clients; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.clients TO anon;
GRANT ALL ON TABLE public.clients TO authenticated;
GRANT ALL ON TABLE public.clients TO service_role;


--
-- Name: TABLE command_usage_events; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.command_usage_events TO anon;
GRANT ALL ON TABLE public.command_usage_events TO authenticated;
GRANT ALL ON TABLE public.command_usage_events TO service_role;


--
-- Name: TABLE comment_versions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.comment_versions TO anon;
GRANT ALL ON TABLE public.comment_versions TO authenticated;
GRANT ALL ON TABLE public.comment_versions TO service_role;


--
-- Name: TABLE comments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.comments TO anon;
GRANT ALL ON TABLE public.comments TO authenticated;
GRANT ALL ON TABLE public.comments TO service_role;


--
-- Name: TABLE company_billing_profile; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.company_billing_profile TO anon;
GRANT ALL ON TABLE public.company_billing_profile TO authenticated;
GRANT ALL ON TABLE public.company_billing_profile TO service_role;


--
-- Name: TABLE compensation_records; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.compensation_records TO anon;
GRANT ALL ON TABLE public.compensation_records TO authenticated;
GRANT ALL ON TABLE public.compensation_records TO service_role;


--
-- Name: TABLE connected_accounts; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.connected_accounts TO anon;
GRANT ALL ON TABLE public.connected_accounts TO authenticated;
GRANT ALL ON TABLE public.connected_accounts TO service_role;


--
-- Name: TABLE doc_annotations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.doc_annotations TO anon;
GRANT ALL ON TABLE public.doc_annotations TO authenticated;
GRANT ALL ON TABLE public.doc_annotations TO service_role;


--
-- Name: TABLE doc_versions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.doc_versions TO anon;
GRANT ALL ON TABLE public.doc_versions TO authenticated;
GRANT ALL ON TABLE public.doc_versions TO service_role;


--
-- Name: TABLE document_template_history; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.document_template_history TO anon;
GRANT ALL ON TABLE public.document_template_history TO authenticated;
GRANT ALL ON TABLE public.document_template_history TO service_role;


--
-- Name: TABLE document_templates; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.document_templates TO anon;
GRANT ALL ON TABLE public.document_templates TO authenticated;
GRANT ALL ON TABLE public.document_templates TO service_role;


--
-- Name: TABLE documents; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.documents TO anon;
GRANT ALL ON TABLE public.documents TO authenticated;
GRANT ALL ON TABLE public.documents TO service_role;


--
-- Name: TABLE employment_change_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.employment_change_logs TO anon;
GRANT ALL ON TABLE public.employment_change_logs TO authenticated;
GRANT ALL ON TABLE public.employment_change_logs TO service_role;


--
-- Name: TABLE employment_records; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.employment_records TO anon;
GRANT ALL ON TABLE public.employment_records TO authenticated;
GRANT ALL ON TABLE public.employment_records TO service_role;


--
-- Name: TABLE epics; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.epics TO anon;
GRANT ALL ON TABLE public.epics TO authenticated;
GRANT ALL ON TABLE public.epics TO service_role;


--
-- Name: TABLE escalation_policies; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.escalation_policies TO anon;
GRANT ALL ON TABLE public.escalation_policies TO authenticated;
GRANT ALL ON TABLE public.escalation_policies TO service_role;


--
-- Name: TABLE expenses; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.expenses TO anon;
GRANT ALL ON TABLE public.expenses TO authenticated;
GRANT ALL ON TABLE public.expenses TO service_role;


--
-- Name: TABLE file_versions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.file_versions TO anon;
GRANT ALL ON TABLE public.file_versions TO authenticated;
GRANT ALL ON TABLE public.file_versions TO service_role;


--
-- Name: TABLE files; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.files TO anon;
GRANT ALL ON TABLE public.files TO authenticated;
GRANT ALL ON TABLE public.files TO service_role;


--
-- Name: TABLE financial_adjustments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.financial_adjustments TO anon;
GRANT ALL ON TABLE public.financial_adjustments TO authenticated;
GRANT ALL ON TABLE public.financial_adjustments TO service_role;


--
-- Name: TABLE financial_periods; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.financial_periods TO anon;
GRANT ALL ON TABLE public.financial_periods TO authenticated;
GRANT ALL ON TABLE public.financial_periods TO service_role;


--
-- Name: TABLE financial_snapshots; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.financial_snapshots TO anon;
GRANT ALL ON TABLE public.financial_snapshots TO authenticated;
GRANT ALL ON TABLE public.financial_snapshots TO service_role;


--
-- Name: TABLE generated_reports; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.generated_reports TO anon;
GRANT ALL ON TABLE public.generated_reports TO authenticated;
GRANT ALL ON TABLE public.generated_reports TO service_role;


--
-- Name: TABLE impact_simulations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.impact_simulations TO anon;
GRANT ALL ON TABLE public.impact_simulations TO authenticated;
GRANT ALL ON TABLE public.impact_simulations TO service_role;


--
-- Name: TABLE integration_configs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.integration_configs TO anon;
GRANT ALL ON TABLE public.integration_configs TO authenticated;
GRANT ALL ON TABLE public.integration_configs TO service_role;


--
-- Name: TABLE integration_health; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.integration_health TO anon;
GRANT ALL ON TABLE public.integration_health TO authenticated;
GRANT ALL ON TABLE public.integration_health TO service_role;


--
-- Name: TABLE integration_sync_jobs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.integration_sync_jobs TO anon;
GRANT ALL ON TABLE public.integration_sync_jobs TO authenticated;
GRANT ALL ON TABLE public.integration_sync_jobs TO service_role;


--
-- Name: TABLE invitations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.invitations TO anon;
GRANT ALL ON TABLE public.invitations TO authenticated;
GRANT ALL ON TABLE public.invitations TO service_role;


--
-- Name: TABLE invoice_line_items; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.invoice_line_items TO anon;
GRANT ALL ON TABLE public.invoice_line_items TO authenticated;
GRANT ALL ON TABLE public.invoice_line_items TO service_role;


--
-- Name: TABLE invoice_sequences; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.invoice_sequences TO anon;
GRANT ALL ON TABLE public.invoice_sequences TO authenticated;
GRANT ALL ON TABLE public.invoice_sequences TO service_role;


--
-- Name: TABLE invoices; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.invoices TO anon;
GRANT ALL ON TABLE public.invoices TO authenticated;
GRANT ALL ON TABLE public.invoices TO service_role;


--
-- Name: TABLE meeting_attendees; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.meeting_attendees TO anon;
GRANT ALL ON TABLE public.meeting_attendees TO authenticated;
GRANT ALL ON TABLE public.meeting_attendees TO service_role;


--
-- Name: TABLE meetings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.meetings TO anon;
GRANT ALL ON TABLE public.meetings TO authenticated;
GRANT ALL ON TABLE public.meetings TO service_role;


--
-- Name: TABLE mention_rules; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.mention_rules TO anon;
GRANT ALL ON TABLE public.mention_rules TO authenticated;
GRANT ALL ON TABLE public.mention_rules TO service_role;


--
-- Name: TABLE milestones; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.milestones TO anon;
GRANT ALL ON TABLE public.milestones TO authenticated;
GRANT ALL ON TABLE public.milestones TO service_role;


--
-- Name: TABLE notification_channels; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notification_channels TO anon;
GRANT ALL ON TABLE public.notification_channels TO authenticated;
GRANT ALL ON TABLE public.notification_channels TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE oauth_sessions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.oauth_sessions TO anon;
GRANT ALL ON TABLE public.oauth_sessions TO authenticated;
GRANT ALL ON TABLE public.oauth_sessions TO service_role;


--
-- Name: TABLE payments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.payments TO anon;
GRANT ALL ON TABLE public.payments TO authenticated;
GRANT ALL ON TABLE public.payments TO service_role;


--
-- Name: TABLE personal_leave; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.personal_leave TO anon;
GRANT ALL ON TABLE public.personal_leave TO authenticated;
GRANT ALL ON TABLE public.personal_leave TO service_role;


--
-- Name: TABLE prediction_confidence_metrics; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.prediction_confidence_metrics TO anon;
GRANT ALL ON TABLE public.prediction_confidence_metrics TO authenticated;
GRANT ALL ON TABLE public.prediction_confidence_metrics TO service_role;


--
-- Name: TABLE prediction_context_metrics; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.prediction_context_metrics TO anon;
GRANT ALL ON TABLE public.prediction_context_metrics TO authenticated;
GRANT ALL ON TABLE public.prediction_context_metrics TO service_role;


--
-- Name: TABLE prediction_errors; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.prediction_errors TO anon;
GRANT ALL ON TABLE public.prediction_errors TO authenticated;
GRANT ALL ON TABLE public.prediction_errors TO service_role;


--
-- Name: TABLE project_allocations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.project_allocations TO anon;
GRANT ALL ON TABLE public.project_allocations TO authenticated;
GRANT ALL ON TABLE public.project_allocations TO service_role;


--
-- Name: TABLE project_signoffs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.project_signoffs TO anon;
GRANT ALL ON TABLE public.project_signoffs TO authenticated;
GRANT ALL ON TABLE public.project_signoffs TO service_role;


--
-- Name: TABLE projects; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.projects TO anon;
GRANT ALL ON TABLE public.projects TO authenticated;
GRANT ALL ON TABLE public.projects TO service_role;


--
-- Name: TABLE recurring_task_history; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.recurring_task_history TO anon;
GRANT ALL ON TABLE public.recurring_task_history TO authenticated;
GRANT ALL ON TABLE public.recurring_task_history TO service_role;


--
-- Name: TABLE recurring_task_templates; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.recurring_task_templates TO anon;
GRANT ALL ON TABLE public.recurring_task_templates TO authenticated;
GRANT ALL ON TABLE public.recurring_task_templates TO service_role;


--
-- Name: TABLE salaries; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.salaries TO anon;
GRANT ALL ON TABLE public.salaries TO authenticated;
GRANT ALL ON TABLE public.salaries TO service_role;


--
-- Name: TABLE skills; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.skills TO anon;
GRANT ALL ON TABLE public.skills TO authenticated;
GRANT ALL ON TABLE public.skills TO service_role;


--
-- Name: TABLE sprints; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.sprints TO anon;
GRANT ALL ON TABLE public.sprints TO authenticated;
GRANT ALL ON TABLE public.sprints TO service_role;


--
-- Name: TABLE system_audit_ledger; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.system_audit_ledger TO anon;
GRANT ALL ON TABLE public.system_audit_ledger TO authenticated;
GRANT ALL ON TABLE public.system_audit_ledger TO service_role;


--
-- Name: TABLE tactical_tasks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.tactical_tasks TO anon;
GRANT ALL ON TABLE public.tactical_tasks TO authenticated;
GRANT ALL ON TABLE public.tactical_tasks TO service_role;


--
-- Name: TABLE task_comments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.task_comments TO anon;
GRANT ALL ON TABLE public.task_comments TO authenticated;
GRANT ALL ON TABLE public.task_comments TO service_role;


--
-- Name: TABLE task_dependencies; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.task_dependencies TO anon;
GRANT ALL ON TABLE public.task_dependencies TO authenticated;
GRANT ALL ON TABLE public.task_dependencies TO service_role;


--
-- Name: TABLE task_history_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.task_history_logs TO anon;
GRANT ALL ON TABLE public.task_history_logs TO authenticated;
GRANT ALL ON TABLE public.task_history_logs TO service_role;


--
-- Name: TABLE tasks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.tasks TO anon;
GRANT ALL ON TABLE public.tasks TO authenticated;
GRANT ALL ON TABLE public.tasks TO service_role;


--
-- Name: TABLE team_events; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.team_events TO anon;
GRANT ALL ON TABLE public.team_events TO authenticated;
GRANT ALL ON TABLE public.team_events TO service_role;


--
-- Name: TABLE team_members; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.team_members TO anon;
GRANT ALL ON TABLE public.team_members TO authenticated;
GRANT ALL ON TABLE public.team_members TO service_role;


--
-- Name: TABLE teams; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.teams TO anon;
GRANT ALL ON TABLE public.teams TO authenticated;
GRANT ALL ON TABLE public.teams TO service_role;


--
-- Name: TABLE universal_comments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.universal_comments TO anon;
GRANT ALL ON TABLE public.universal_comments TO authenticated;
GRANT ALL ON TABLE public.universal_comments TO service_role;


--
-- Name: TABLE user_skills; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_skills TO anon;
GRANT ALL ON TABLE public.user_skills TO authenticated;
GRANT ALL ON TABLE public.user_skills TO service_role;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.users TO anon;
GRANT ALL ON TABLE public.users TO authenticated;
GRANT ALL ON TABLE public.users TO service_role;


--
-- Name: TABLE wait_states; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.wait_states TO anon;
GRANT ALL ON TABLE public.wait_states TO authenticated;
GRANT ALL ON TABLE public.wait_states TO service_role;


--
-- Name: TABLE webhooks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.webhooks TO anon;
GRANT ALL ON TABLE public.webhooks TO authenticated;
GRANT ALL ON TABLE public.webhooks TO service_role;


--
-- Name: TABLE workspace_files; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.workspace_files TO anon;
GRANT ALL ON TABLE public.workspace_files TO authenticated;
GRANT ALL ON TABLE public.workspace_files TO service_role;


--
-- Name: TABLE workspace_holidays; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.workspace_holidays TO anon;
GRANT ALL ON TABLE public.workspace_holidays TO authenticated;
GRANT ALL ON TABLE public.workspace_holidays TO service_role;


--
-- Name: TABLE workspace_settings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.workspace_settings TO anon;
GRANT ALL ON TABLE public.workspace_settings TO authenticated;
GRANT ALL ON TABLE public.workspace_settings TO service_role;


--
-- Name: TABLE workspaces; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.workspaces TO anon;
GRANT ALL ON TABLE public.workspaces TO authenticated;
GRANT ALL ON TABLE public.workspaces TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict OyktAfsLl3UaseuGKOu2jv3o8QyfAGp5rtLAuygO4wtcZf4Ldk5Gl2iunpbFaLh


