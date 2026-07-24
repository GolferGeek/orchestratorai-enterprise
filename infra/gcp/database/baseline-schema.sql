--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

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
-- Name: ambient; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA ambient;


--
-- Name: authz; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA authz;


--
-- Name: code_ops; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA code_ops;


--
-- Name: company; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA company;


--
-- Name: crawler; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA crawler;


--
-- Name: engineering; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA engineering;


--
-- Name: law; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA law;


--
-- Name: leads; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA leads;


--
-- Name: marketing; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA marketing;


--
-- Name: orch_flow; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA orch_flow;


--
-- Name: prediction; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA prediction;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: rag_data; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS rag_data;


--
-- Name: risk; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA risk;


--
-- Name: task_status; Type: TYPE; Schema: orch_flow; Owner: -
--

CREATE TYPE orch_flow.task_status AS ENUM (
    'projects',
    'this_week',
    'today',
    'in_progress',
    'done'
);


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: ambient; Owner: -
--

CREATE FUNCTION ambient.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: rbac_get_organization_users(character varying); Type: FUNCTION; Schema: authz; Owner: -
--

CREATE FUNCTION authz.rbac_get_organization_users(p_organization_slug character varying) RETURNS TABLE(user_id uuid, email text, display_name text, role_id uuid, role_name character varying, role_display_name character varying, is_global boolean, assigned_at timestamp with time zone, expires_at timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
      SELECT DISTINCT
          u.id AS user_id,
          u.email,
          u.display_name,
          r.id AS role_id,
          r.name AS role_name,
          r.display_name AS role_display_name,
          (uor.organization_slug = '*') AS is_global,
          uor.assigned_at,
          uor.expires_at
      FROM authz.rbac_user_org_roles uor
      JOIN authz.users u ON uor.user_id = u.id
      JOIN authz.rbac_roles r ON uor.role_id = r.id
      WHERE (uor.organization_slug = p_organization_slug OR uor.organization_slug = '*')
        AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
      ORDER BY u.email, r.name;
  $$;


--
-- Name: rbac_get_user_organizations(uuid); Type: FUNCTION; Schema: authz; Owner: -
--

CREATE FUNCTION authz.rbac_get_user_organizations(p_user_id uuid) RETURNS TABLE(organization_slug character varying, organization_name text, role_name character varying, is_global boolean)
    LANGUAGE sql STABLE
    SET search_path TO 'authz', 'public'
    AS $$
    WITH user_has_global AS (
        SELECT EXISTS(
            SELECT 1
            FROM rbac_user_org_roles
            WHERE user_id = p_user_id
              AND organization_slug = '*'
              AND (expires_at IS NULL OR expires_at > NOW())
        ) AS has_global
    ),
    global_role AS (
        SELECT r.name AS role_name
        FROM rbac_user_org_roles uor
        JOIN rbac_roles r ON uor.role_id = r.id
        WHERE uor.user_id = p_user_id
          AND uor.organization_slug = '*'
          AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
        LIMIT 1
    )
    SELECT DISTINCT
        CASE
            WHEN (SELECT has_global FROM user_has_global) THEN o.slug
            ELSE uor.organization_slug
        END AS organization_slug,
        CASE
            WHEN (SELECT has_global FROM user_has_global) THEN o.name
            ELSE o.name
        END AS organization_name,
        CASE
            WHEN (SELECT has_global FROM user_has_global) THEN (SELECT role_name FROM global_role)
            ELSE r.name
        END AS role_name,
        (SELECT has_global FROM user_has_global) AS is_global
    FROM (
        SELECT has_global FROM user_has_global
    ) ug
    CROSS JOIN public.organizations o
    LEFT JOIN rbac_user_org_roles uor ON uor.organization_slug = o.slug AND uor.user_id = p_user_id
    LEFT JOIN rbac_roles r ON uor.role_id = r.id
    WHERE (SELECT has_global FROM user_has_global)
       OR (uor.user_id = p_user_id AND (uor.expires_at IS NULL OR uor.expires_at > NOW()))
    ORDER BY organization_slug;
$$;


--
-- Name: rbac_get_user_permissions(uuid, character varying); Type: FUNCTION; Schema: authz; Owner: -
--

CREATE FUNCTION authz.rbac_get_user_permissions(p_user_id uuid, p_organization_slug character varying) RETURNS TABLE(permission_name character varying, resource_type character varying, resource_id uuid)
    LANGUAGE sql STABLE
    SET search_path TO 'authz', 'public'
    AS $$
    SELECT DISTINCT
        p.name AS permission_name,
        rp.resource_type,
        rp.resource_id
    FROM rbac_user_org_roles uor
    JOIN rbac_role_permissions rp ON uor.role_id = rp.role_id
    JOIN rbac_permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = p_user_id
      AND (uor.organization_slug = p_organization_slug OR uor.organization_slug = '*')
      AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    ORDER BY p.name;
$$;


--
-- Name: rbac_get_user_roles(uuid, character varying); Type: FUNCTION; Schema: authz; Owner: -
--

CREATE FUNCTION authz.rbac_get_user_roles(p_user_id uuid, p_organization_slug character varying) RETURNS TABLE(role_id uuid, role_name character varying, role_display_name character varying, is_global boolean, assigned_at timestamp with time zone, expires_at timestamp with time zone)
    LANGUAGE sql STABLE
    SET search_path TO 'authz', 'public'
    AS $$
    SELECT
        r.id AS role_id,
        r.name AS role_name,
        r.display_name AS role_display_name,
        (uor.organization_slug = '*') AS is_global,
        uor.assigned_at,
        uor.expires_at
    FROM rbac_user_org_roles uor
    JOIN rbac_roles r ON uor.role_id = r.id
    WHERE uor.user_id = p_user_id
      AND (uor.organization_slug = p_organization_slug OR uor.organization_slug = '*')
      AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    ORDER BY r.name;
$$;


--
-- Name: rbac_has_permission(uuid, character varying, character varying, character varying, uuid); Type: FUNCTION; Schema: authz; Owner: -
--

CREATE FUNCTION authz.rbac_has_permission(p_user_id uuid, p_organization_slug character varying, p_permission character varying, p_resource_type character varying DEFAULT NULL::character varying, p_resource_id uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE
    SET search_path TO 'authz', 'public'
    AS $$
DECLARE
    v_has_permission BOOLEAN := FALSE;
    v_permission_parts TEXT[];
    v_permission_category TEXT;
BEGIN
    v_permission_parts := string_to_array(p_permission, ':');
    v_permission_category := v_permission_parts[1];

    SELECT EXISTS(
        SELECT 1
        FROM rbac_user_org_roles uor
        JOIN rbac_role_permissions rp ON uor.role_id = rp.role_id
        JOIN rbac_permissions p ON rp.permission_id = p.id
        WHERE uor.user_id = p_user_id
          AND (uor.organization_slug = p_organization_slug OR uor.organization_slug = '*')
          AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
          AND (
              p.name = p_permission
              OR p.name = v_permission_category || ':*'
              OR p.name = '*:*'
          )
          AND (
              rp.resource_type IS NULL
              OR (
                  rp.resource_type = p_resource_type
                  AND (rp.resource_id IS NULL OR rp.resource_id = p_resource_id)
              )
          )
    ) INTO v_has_permission;

    RETURN v_has_permission;
END;
$$;


--
-- Name: update_rbac_roles_updated_at(); Type: FUNCTION; Schema: authz; Owner: -
--

CREATE FUNCTION authz.update_rbac_roles_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_users_updated_at(); Type: FUNCTION; Schema: authz; Owner: -
--

CREATE FUNCTION authz.update_users_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: claim_issues_for_file(text, text, timestamp with time zone); Type: FUNCTION; Schema: code_ops; Owner: -
--

CREATE FUNCTION code_ops.claim_issues_for_file(p_file_path text, p_claimed_by text, p_now timestamp with time zone DEFAULT now()) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  claimed_count INT;
BEGIN
  -- Release stale claims first (keeps locking semantics simple)
  PERFORM code_ops.release_stale_claims();

  WITH to_claim AS (
    SELECT id
    FROM code_ops.quality_issues
    WHERE status = 'open'
      AND file_path = p_file_path
    FOR UPDATE SKIP LOCKED
  )
  UPDATE code_ops.quality_issues qi
  SET status = 'claimed',
      claimed_by = p_claimed_by,
      claimed_at = p_now
  FROM to_claim
  WHERE qi.id = to_claim.id;

  GET DIAGNOSTICS claimed_count = ROW_COUNT;
  RETURN claimed_count;
END;
$$;


--
-- Name: release_stale_claims(); Type: FUNCTION; Schema: code_ops; Owner: -
--

CREATE FUNCTION code_ops.release_stale_claims() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  released_count INT;
BEGIN
  UPDATE code_ops.quality_issues
  SET status = 'open', claimed_by = NULL, claimed_at = NULL
  WHERE status = 'claimed'
    AND claimed_at < NOW() - INTERVAL '6 hours';

  GET DIAGNOSTICS released_count = ROW_COUNT;
  RETURN released_count;
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: company; Owner: -
--

CREATE FUNCTION company.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: calculate_total_duplicates(integer, integer, integer, integer); Type: FUNCTION; Schema: crawler; Owner: -
--

CREATE FUNCTION crawler.calculate_total_duplicates(p_exact integer, p_cross_source integer, p_fuzzy_title integer, p_phrase_overlap integer) RETURNS integer
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  RETURN COALESCE(p_exact, 0) +
         COALESCE(p_cross_source, 0) +
         COALESCE(p_fuzzy_title, 0) +
         COALESCE(p_phrase_overlap, 0);
END;
$$;


--
-- Name: check_content_hash_exists(text, text, uuid); Type: FUNCTION; Schema: crawler; Owner: -
--

CREATE FUNCTION crawler.check_content_hash_exists(p_organization_slug text, p_content_hash text, p_exclude_source_id uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT EXISTS(
    SELECT 1 FROM crawler.articles a
    WHERE a.organization_slug = p_organization_slug
    AND a.content_hash = p_content_hash
    AND (p_exclude_source_id IS NULL OR a.source_id != p_exclude_source_id)
  );
$$;


--
-- Name: find_articles_by_phrase_overlap(text, text[], integer, integer); Type: FUNCTION; Schema: crawler; Owner: -
--

CREATE FUNCTION crawler.find_articles_by_phrase_overlap(p_organization_slug text, p_key_phrases text[], p_hours_back integer DEFAULT 72, p_limit integer DEFAULT 50) RETURNS TABLE(article_id uuid, source_id uuid, title_normalized text, key_phrases text[], overlap_count integer, first_seen_at timestamp with time zone)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.source_id,
    a.title_normalized,
    a.key_phrases,
    (SELECT COUNT(*)::INTEGER FROM unnest(a.key_phrases) kp WHERE kp = ANY(p_key_phrases)) as overlap_count,
    a.first_seen_at
  FROM crawler.articles a
  WHERE a.organization_slug = p_organization_slug
    AND a.first_seen_at > NOW() - (p_hours_back || ' hours')::INTERVAL
    AND a.key_phrases && p_key_phrases  -- Array overlap operator (fast with GIN index)
  ORDER BY overlap_count DESC, a.first_seen_at DESC
  LIMIT p_limit;
END;
$$;


--
-- Name: find_or_create_source(text, text, text, text, text, jsonb, jsonb, integer); Type: FUNCTION; Schema: crawler; Owner: -
--

CREATE FUNCTION crawler.find_or_create_source(p_organization_slug text, p_url text, p_name text, p_source_type text DEFAULT 'web'::text, p_description text DEFAULT NULL::text, p_crawl_config jsonb DEFAULT '{}'::jsonb, p_auth_config jsonb DEFAULT NULL::jsonb, p_crawl_frequency_minutes integer DEFAULT 15) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_source_id UUID;
BEGIN
  -- Try to find existing source
  SELECT id INTO v_source_id
  FROM crawler.sources
  WHERE organization_slug = p_organization_slug
    AND url = p_url;

  -- If found, return existing
  IF v_source_id IS NOT NULL THEN
    RETURN v_source_id;
  END IF;

  -- Create new source
  INSERT INTO crawler.sources (
    organization_slug,
    url,
    name,
    source_type,
    description,
    crawl_config,
    auth_config,
    crawl_frequency_minutes
  ) VALUES (
    p_organization_slug,
    p_url,
    p_name,
    p_source_type,
    p_description,
    COALESCE(p_crawl_config, '{}'::jsonb),
    p_auth_config,
    p_crawl_frequency_minutes
  )
  RETURNING id INTO v_source_id;

  RETURN v_source_id;
END;
$$;


--
-- Name: find_recent_article_fingerprints(text, integer, integer); Type: FUNCTION; Schema: crawler; Owner: -
--

CREATE FUNCTION crawler.find_recent_article_fingerprints(p_organization_slug text, p_hours_back integer DEFAULT 72, p_limit integer DEFAULT 100) RETURNS TABLE(article_id uuid, source_id uuid, title_normalized text, key_phrases text[], fingerprint_hash text, first_seen_at timestamp with time zone)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.source_id,
    a.title_normalized,
    a.key_phrases,
    a.fingerprint_hash,
    a.first_seen_at
  FROM crawler.articles a
  WHERE a.organization_slug = p_organization_slug
    AND a.first_seen_at > NOW() - (p_hours_back || ' hours')::INTERVAL
    AND a.title_normalized IS NOT NULL
  ORDER BY a.first_seen_at DESC
  LIMIT p_limit;
END;
$$;


--
-- Name: get_crawl_stats_by_source(text, integer); Type: FUNCTION; Schema: crawler; Owner: -
--

CREATE FUNCTION crawler.get_crawl_stats_by_source(p_organization_slug text, p_days integer DEFAULT 7) RETURNS TABLE(source_id uuid, total_crawls integer, successful_crawls integer, total_articles_found integer, total_articles_new integer, total_duplicates integer, avg_duration_ms double precision)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    sc.source_id,
    COUNT(*)::INTEGER as total_crawls,
    COUNT(*) FILTER (WHERE sc.status = 'success')::INTEGER as successful_crawls,
    COALESCE(SUM(sc.articles_found) FILTER (WHERE sc.status = 'success'), 0)::INTEGER as total_articles_found,
    COALESCE(SUM(sc.articles_new) FILTER (WHERE sc.status = 'success'), 0)::INTEGER as total_articles_new,
    COALESCE(SUM(
      sc.duplicates_exact + 
      sc.duplicates_cross_source + 
      sc.duplicates_fuzzy_title + 
      sc.duplicates_phrase_overlap
    ) FILTER (WHERE sc.status = 'success'), 0)::INTEGER as total_duplicates,
    COALESCE(AVG(sc.crawl_duration_ms) FILTER (WHERE sc.status = 'success'), 0)::DOUBLE PRECISION as avg_duration_ms
  FROM crawler.source_crawls sc
  JOIN crawler.sources s ON sc.source_id = s.id
  WHERE s.organization_slug = p_organization_slug
    AND sc.started_at > NOW() - (p_days || ' days')::INTERVAL
  GROUP BY sc.source_id;
END;
$$;


--
-- Name: get_source_article_counts(text); Type: FUNCTION; Schema: crawler; Owner: -
--

CREATE FUNCTION crawler.get_source_article_counts(p_organization_slug text) RETURNS TABLE(source_id uuid, article_count integer)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.source_id,
    COUNT(*)::INTEGER as article_count
  FROM crawler.articles a
  WHERE a.organization_slug = p_organization_slug
  GROUP BY a.source_id;
END;
$$;


--
-- Name: get_sources_due_for_crawl(integer); Type: FUNCTION; Schema: crawler; Owner: -
--

CREATE FUNCTION crawler.get_sources_due_for_crawl(p_frequency_minutes integer DEFAULT NULL::integer) RETURNS TABLE(source_id uuid, organization_slug text, name text, source_type text, url text, crawl_config jsonb, auth_config jsonb, crawl_frequency_minutes integer, last_crawl_at timestamp with time zone)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.organization_slug,
    s.name,
    s.source_type,
    s.url,
    s.crawl_config,
    s.auth_config,
    s.crawl_frequency_minutes,
    s.last_crawl_at
  FROM crawler.sources s
  WHERE s.is_active = true
    AND s.is_test = false
    AND (p_frequency_minutes IS NULL OR s.crawl_frequency_minutes = p_frequency_minutes)
    AND (
      s.last_crawl_at IS NULL
      OR s.last_crawl_at < NOW() - (s.crawl_frequency_minutes || ' minutes')::INTERVAL
    )
  ORDER BY s.last_crawl_at NULLS FIRST
  LIMIT 100;
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: crawler; Owner: -
--

CREATE FUNCTION crawler.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: get_drawing_progress(uuid); Type: FUNCTION; Schema: engineering; Owner: -
--

CREATE FUNCTION engineering.get_drawing_progress(p_drawing_id uuid) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'drawing_id', p_drawing_id,
        'status', d.status,
        'steps', (
            SELECT jsonb_agg(jsonb_build_object(
                'step_type', el.step_type,
                'message', el.message,
                'duration_ms', el.duration_ms,
                'created_at', el.created_at
            ) ORDER BY el.created_at)
            FROM engineering.execution_log el
            WHERE el.drawing_id = p_drawing_id
        ),
        'outputs', (
            SELECT jsonb_agg(jsonb_build_object(
                'format', co.format,
                'storage_path', co.storage_path,
                'file_size_bytes', co.file_size_bytes
            ))
            FROM engineering.cad_outputs co
            WHERE co.drawing_id = p_drawing_id
        )
    )
    INTO result
    FROM engineering.drawings d
    WHERE d.id = p_drawing_id;

    RETURN result;
END;
$$;


--
-- Name: get_effective_constraints(uuid); Type: FUNCTION; Schema: engineering; Owner: -
--

CREATE FUNCTION engineering.get_effective_constraints(p_drawing_id uuid) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    project_constraints JSONB;
    drawing_overrides JSONB;
BEGIN
    SELECT p.constraints, d.constraints_override
    INTO project_constraints, drawing_overrides
    FROM engineering.drawings d
    JOIN engineering.projects p ON p.id = d.project_id
    WHERE d.id = p_drawing_id;

    -- Merge: drawing overrides take precedence
    IF drawing_overrides IS NULL THEN
        RETURN project_constraints;
    ELSE
        RETURN project_constraints || drawing_overrides;
    END IF;
END;
$$;


--
-- Name: get_analysis_progress(uuid); Type: FUNCTION; Schema: law; Owner: -
--

CREATE FUNCTION law.get_analysis_progress(p_analysis_task_id uuid) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    result JSONB;
    specialist_progress JSONB;
BEGIN
    -- Get specialist progress
    SELECT jsonb_agg(
        jsonb_build_object(
            'specialist', specialist_slug,
            'status', status,
            'hasOutput', extracted_data IS NOT NULL
        )
    ) INTO specialist_progress
    FROM law.specialist_outputs
    WHERE analysis_task_id = p_analysis_task_id;

    -- Build full progress object
    SELECT jsonb_build_object(
        'status', at.status,
        'riskLevel', at.risk_level,
        'specialists', COALESCE(specialist_progress, '[]'::jsonb),
        'hasReport', at.synthesized_report IS NOT NULL,
        'approvalStatus', at.approval_status
    ) INTO result
    FROM law.analysis_tasks at
    WHERE at.id = p_analysis_task_id;

    RETURN result;
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: leads; Owner: -
--

CREATE FUNCTION leads.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: calculate_final_rankings(uuid); Type: FUNCTION; Schema: marketing; Owner: -
--

CREATE FUNCTION marketing.calculate_final_rankings(p_task_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Sum weighted scores and calculate final ranks
  WITH total_scores AS (
    SELECT
      output_id,
      SUM(COALESCE(weighted_score, 0))::INTEGER as total_score,
      ROW_NUMBER() OVER (ORDER BY SUM(COALESCE(weighted_score, 0)) DESC) as rank
    FROM marketing.evaluations
    WHERE task_id = p_task_id
      AND stage = 'final'
      AND status = 'completed'
    GROUP BY output_id
  )
  UPDATE marketing.outputs o
  SET
    final_total_score = t.total_score,
    final_rank = t.rank,
    updated_at = NOW()
  FROM total_scores t
  WHERE o.id = t.output_id;
END;
$$;


--
-- Name: calculate_initial_rankings(uuid); Type: FUNCTION; Schema: marketing; Owner: -
--

CREATE FUNCTION marketing.calculate_initial_rankings(p_task_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Calculate average scores and ranks
  WITH avg_scores AS (
    SELECT
      output_id,
      AVG(score)::DECIMAL(3,1) as avg_score,
      ROW_NUMBER() OVER (ORDER BY AVG(score) DESC) as rank
    FROM marketing.evaluations
    WHERE task_id = p_task_id
      AND stage = 'initial'
      AND status = 'completed'
    GROUP BY output_id
  )
  UPDATE marketing.outputs o
  SET
    initial_avg_score = a.avg_score,
    initial_rank = a.rank,
    updated_at = NOW()
  FROM avg_scores a
  WHERE o.id = a.output_id;
END;
$$;


--
-- Name: get_next_outputs(uuid, boolean, integer); Type: FUNCTION; Schema: marketing; Owner: -
--

CREATE FUNCTION marketing.get_next_outputs(p_task_id uuid, p_is_local boolean, p_max_count integer DEFAULT 10) RETURNS TABLE(output_id uuid, status text, writer_agent_slug text, writer_llm_provider text, writer_llm_model text, editor_agent_slug text, editor_llm_provider text, editor_llm_model text, edit_cycle integer)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.status,
    o.writer_agent_slug,
    o.writer_llm_provider,
    o.writer_llm_model,
    o.editor_agent_slug,
    o.editor_llm_provider,
    o.editor_llm_model,
    o.edit_cycle
  FROM marketing.outputs o
  WHERE o.task_id = p_task_id
    AND o.status IN ('pending_write', 'pending_edit', 'pending_rewrite')
    -- Determine if local based on provider name
    AND (
      (p_is_local = true AND o.writer_llm_provider = 'ollama')
      OR
      (p_is_local = false AND o.writer_llm_provider != 'ollama')
    )
  ORDER BY o.created_at
  LIMIT p_max_count;
END;
$$;


--
-- Name: get_next_pending_step(uuid); Type: FUNCTION; Schema: marketing; Owner: -
--

CREATE FUNCTION marketing.get_next_pending_step(p_task_id uuid) RETURNS TABLE(step_id uuid, step_type text, sequence integer, agent_slug text, llm_config_id uuid, provider text, input_output_id uuid)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        eq.id,
        eq.step_type,
        eq.sequence,
        eq.agent_slug,
        eq.llm_config_id,
        eq.provider,
        eq.input_output_id
    FROM marketing.execution_queue eq
    WHERE eq.task_id = p_task_id
      AND eq.status = 'pending'
      AND NOT EXISTS (
          -- Check all dependencies are completed
          SELECT 1 FROM unnest(eq.depends_on) dep_id
          JOIN marketing.execution_queue dep ON dep.id = dep_id
          WHERE dep.status NOT IN ('completed', 'skipped')
      )
    ORDER BY eq.sequence
    LIMIT 1;
END;
$$;


--
-- Name: get_running_counts(uuid); Type: FUNCTION; Schema: marketing; Owner: -
--

CREATE FUNCTION marketing.get_running_counts(p_task_id uuid) RETURNS TABLE(is_local boolean, running_count bigint)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    (o.writer_llm_provider = 'ollama') as is_local,
    COUNT(*)::BIGINT as running_count
  FROM marketing.outputs o
  WHERE o.task_id = p_task_id
    AND o.status IN ('writing', 'editing', 'rewriting')
  GROUP BY (o.writer_llm_provider = 'ollama');
END;
$$;


--
-- Name: get_task_progress(uuid); Type: FUNCTION; Schema: marketing; Owner: -
--

CREATE FUNCTION marketing.get_task_progress(p_task_id uuid) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total', COUNT(*),
        'pending', COUNT(*) FILTER (WHERE status = 'pending'),
        'processing', COUNT(*) FILTER (WHERE status = 'processing'),
        'completed', COUNT(*) FILTER (WHERE status = 'completed'),
        'failed', COUNT(*) FILTER (WHERE status = 'failed'),
        'skipped', COUNT(*) FILTER (WHERE status = 'skipped'),
        'percentage', ROUND(
            (COUNT(*) FILTER (WHERE status IN ('completed', 'skipped'))::NUMERIC /
             NULLIF(COUNT(*), 0)) * 100
        )
    ) INTO result
    FROM marketing.execution_queue
    WHERE task_id = p_task_id;

    RETURN result;
END;
$$;


--
-- Name: rank_to_weighted_score(integer); Type: FUNCTION; Schema: marketing; Owner: -
--

CREATE FUNCTION marketing.rank_to_weighted_score(p_rank integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN CASE p_rank
    WHEN 1 THEN 100
    WHEN 2 THEN 60
    WHEN 3 THEN 30
    WHEN 4 THEN 10
    WHEN 5 THEN 5
    ELSE 0
  END;
END;
$$;


--
-- Name: select_finalists(uuid, integer); Type: FUNCTION; Schema: marketing; Owner: -
--

CREATE FUNCTION marketing.select_finalists(p_task_id uuid, p_top_n integer DEFAULT 10) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  finalist_count INTEGER;
BEGIN
  -- Mark top N as finalists
  WITH ranked AS (
    SELECT id
    FROM marketing.outputs
    WHERE task_id = p_task_id
      AND initial_rank IS NOT NULL
    ORDER BY initial_rank
    LIMIT p_top_n
  )
  UPDATE marketing.outputs o
  SET is_finalist = true, updated_at = NOW()
  FROM ranked r
  WHERE o.id = r.id;

  GET DIAGNOSTICS finalist_count = ROW_COUNT;
  RETURN finalist_count;
END;
$$;


--
-- Name: update_outputs_updated_at(); Type: FUNCTION; Schema: marketing; Owner: -
--

CREATE FUNCTION marketing.update_outputs_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: get_user_team_ids(uuid); Type: FUNCTION; Schema: orch_flow; Owner: -
--

CREATE FUNCTION orch_flow.get_user_team_ids(_user_id uuid) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'orch_flow'
    AS $$
  SELECT team_id
  FROM orch_flow.team_members
  WHERE user_id = _user_id
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: orch_flow; Owner: -
--

CREATE FUNCTION orch_flow.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'orch_flow'
    AS $$
BEGIN
  INSERT INTO orch_flow.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: is_team_member(uuid, uuid); Type: FUNCTION; Schema: orch_flow; Owner: -
--

CREATE FUNCTION orch_flow.is_team_member(_user_id uuid, _team_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members
    WHERE user_id = _user_id
      AND team_id = _team_id
  );
$$;


--
-- Name: set_team_files_updated_at(); Type: FUNCTION; Schema: orch_flow; Owner: -
--

CREATE FUNCTION orch_flow.set_team_files_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: auto_create_test_mirror(); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.auto_create_test_mirror() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  test_symbol TEXT;
  test_target_id UUID;
  mirror_exists BOOLEAN;
BEGIN
  -- Only create mirrors for non-test targets (symbols NOT starting with T_)
  IF NEW.symbol NOT LIKE 'T_%' THEN
    -- Check if mirror already exists
    SELECT EXISTS(
      SELECT 1 FROM prediction.test_target_mirrors
      WHERE real_target_id = NEW.id
    ) INTO mirror_exists;

    IF NOT mirror_exists THEN
      -- Generate test symbol
      test_symbol := 'T_' || NEW.symbol;

      -- Check if test target already exists (might have been created manually)
      SELECT id INTO test_target_id
      FROM prediction.targets
      WHERE symbol = test_symbol AND universe_id = NEW.universe_id;

      -- Create test target if it doesn't exist
      IF test_target_id IS NULL THEN
        INSERT INTO prediction.targets (
          universe_id,
          symbol,
          name,
          target_type,
          context,
          is_active,
          metadata
        ) VALUES (
          NEW.universe_id,
          test_symbol,
          'TEST: ' || COALESCE(NEW.name, NEW.symbol),
          NEW.target_type,
          'Test mirror of ' || NEW.symbol || '. ' || COALESCE(NEW.context, ''),
          COALESCE(NEW.is_active, true),
          jsonb_build_object(
            'is_test_mirror', true,
            'real_target_id', NEW.id,
            'real_symbol', NEW.symbol
          )
        )
        RETURNING id INTO test_target_id;
      END IF;

      -- Create the mirror mapping
      INSERT INTO prediction.test_target_mirrors (real_target_id, test_target_id)
      VALUES (NEW.id, test_target_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: calculate_position_pnl(text, numeric, numeric, numeric); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.calculate_position_pnl(p_direction text, p_entry_price numeric, p_current_price numeric, p_quantity numeric) RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  IF p_direction = 'long' THEN
    RETURN (p_current_price - p_entry_price) * p_quantity;
  ELSE  -- short
    RETURN (p_entry_price - p_current_price) * p_quantity;
  END IF;
END;
$$;


--
-- Name: cleanup_all_test_data(); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.cleanup_all_test_data() RETURNS TABLE(table_name text, rows_deleted bigint)
    LANGUAGE plpgsql
    AS $$
DECLARE
  tbl RECORD;
  deleted_count BIGINT;
BEGIN
  -- Delete from all tables that have is_test_data column
  FOR tbl IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'prediction'
      AND c.column_name = 'is_test_data'
      AND c.table_name != 'test_scenarios'
    ORDER BY c.table_name
  LOOP
    EXECUTE format(
      'DELETE FROM prediction.%I WHERE is_test_data = TRUE',
      tbl.table_name
    );

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    IF deleted_count > 0 THEN
      table_name := tbl.table_name;
      rows_deleted := deleted_count;
      RETURN NEXT;
    END IF;
  END LOOP;

  -- Delete all test scenarios
  DELETE FROM prediction.test_scenarios;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count > 0 THEN
    table_name := 'test_scenarios';
    rows_deleted := deleted_count;
    RETURN NEXT;
  END IF;
END;
$$;


--
-- Name: cleanup_replay_test(uuid); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.cleanup_replay_test(p_replay_test_id uuid) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_results JSONB := '[]'::jsonb;
  v_count INTEGER;
BEGIN
  -- Delete results
  DELETE FROM prediction.replay_test_results
  WHERE replay_test_id = p_replay_test_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_results := v_results || jsonb_build_object('table', 'replay_test_results', 'deleted', v_count);

  -- Delete snapshots
  DELETE FROM prediction.replay_test_snapshots
  WHERE replay_test_id = p_replay_test_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_results := v_results || jsonb_build_object('table', 'replay_test_snapshots', 'deleted', v_count);

  -- Note: We don't delete the replay_test itself, just mark it as cleaned
  UPDATE prediction.replay_tests
  SET status = 'restored'
  WHERE id = p_replay_test_id;

  RETURN v_results;
END;
$$;


--
-- Name: cleanup_test_scenario(uuid); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.cleanup_test_scenario(p_scenario_id uuid) RETURNS TABLE(table_name text, rows_deleted bigint)
    LANGUAGE plpgsql
    AS $_$
DECLARE
  tbl RECORD;
  deleted_count BIGINT;
BEGIN
  -- Delete from all tables that have test_scenario_id column
  FOR tbl IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'prediction'
      AND c.column_name = 'test_scenario_id'
      AND c.table_name != 'test_scenarios'
    ORDER BY c.table_name
  LOOP
    EXECUTE format(
      'DELETE FROM prediction.%I WHERE test_scenario_id = $1',
      tbl.table_name
    ) USING p_scenario_id;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    IF deleted_count > 0 THEN
      table_name := tbl.table_name;
      rows_deleted := deleted_count;
      RETURN NEXT;
    END IF;
  END LOOP;

  -- Finally, delete the scenario itself
  DELETE FROM prediction.test_scenarios WHERE id = p_scenario_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count > 0 THEN
    table_name := 'test_scenarios';
    rows_deleted := deleted_count;
    RETURN NEXT;
  END IF;
END;
$_$;


--
-- Name: create_analyst_context_version(uuid, text, text, jsonb, numeric, text, text, text); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.create_analyst_context_version(p_analyst_id uuid, p_fork_type text, p_perspective text, p_tier_instructions jsonb, p_default_weight numeric, p_agent_journal text DEFAULT NULL::text, p_change_reason text DEFAULT NULL::text, p_changed_by text DEFAULT 'system'::text) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_next_version INTEGER;
  v_new_id UUID;
BEGIN
  -- Mark previous version as not current
  UPDATE prediction.analyst_context_versions
  SET is_current = FALSE
  WHERE analyst_id = p_analyst_id
    AND fork_type = p_fork_type
    AND is_current = TRUE;

  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
  FROM prediction.analyst_context_versions
  WHERE analyst_id = p_analyst_id
    AND fork_type = p_fork_type;

  -- Insert new version
  INSERT INTO prediction.analyst_context_versions (
    analyst_id, fork_type, version_number,
    perspective, tier_instructions, default_weight,
    agent_journal, change_reason, changed_by, is_current
  ) VALUES (
    p_analyst_id, p_fork_type, v_next_version,
    p_perspective, p_tier_instructions, p_default_weight,
    p_agent_journal, p_change_reason, p_changed_by, TRUE
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;


--
-- Name: create_replay_snapshot(uuid, text, uuid[]); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.create_replay_snapshot(p_replay_test_id uuid, p_table_name text, p_record_ids uuid[]) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_snapshot_id UUID;
  v_data JSONB;
  v_count INTEGER;
BEGIN
  -- Get the data based on table name
  IF p_table_name = 'predictions' THEN
    SELECT jsonb_agg(row_to_json(p)::jsonb), COUNT(*)
    INTO v_data, v_count
    FROM prediction.predictions p
    WHERE p.id = ANY(p_record_ids);

  ELSIF p_table_name = 'predictors' THEN
    SELECT jsonb_agg(row_to_json(p)::jsonb), COUNT(*)
    INTO v_data, v_count
    FROM prediction.predictors p
    WHERE p.id = ANY(p_record_ids);

  ELSIF p_table_name = 'signals' THEN
    SELECT jsonb_agg(row_to_json(s)::jsonb), COUNT(*)
    INTO v_data, v_count
    FROM prediction.signals s
    WHERE s.id = ANY(p_record_ids);

  ELSIF p_table_name = 'analyst_assessments' THEN
    SELECT jsonb_agg(row_to_json(a)::jsonb), COUNT(*)
    INTO v_data, v_count
    FROM prediction.analyst_assessments a
    WHERE a.id = ANY(p_record_ids);

  ELSE
    RAISE EXCEPTION 'Unknown table name: %', p_table_name;
  END IF;

  -- Insert snapshot
  INSERT INTO prediction.replay_test_snapshots (
    replay_test_id,
    table_name,
    original_data,
    record_ids,
    row_count
  ) VALUES (
    p_replay_test_id,
    p_table_name,
    COALESCE(v_data, '[]'::jsonb),
    p_record_ids,
    COALESCE(v_count, 0)
  )
  RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;


--
-- Name: enforce_prediction_direction(); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.enforce_prediction_direction() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT prediction.validate_prediction_direction(NEW.direction, NEW.target_id) THEN
    RAISE EXCEPTION 'Invalid prediction direction "%" for target domain', NEW.direction;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: enforce_predictor_direction(); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.enforce_predictor_direction() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT prediction.validate_signal_direction(NEW.direction, NEW.target_id) THEN
    RAISE EXCEPTION 'Invalid predictor direction "%" for target domain', NEW.direction;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: enforce_predictor_is_test(); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.enforce_predictor_is_test() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  target_is_test BOOLEAN;
BEGIN
  -- Check if the target is test data
  SELECT t.is_test_data INTO target_is_test
  FROM prediction.targets t
  WHERE t.id = NEW.target_id;

  -- If target is test, predictor must be test
  IF target_is_test = true AND NEW.is_test = false THEN
    RAISE EXCEPTION 'INV-03 Violation: Predictor must have is_test=true when target is test data. Target ID: %, Predictor is_test: %',
      NEW.target_id, NEW.is_test;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enforce_signal_direction(); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.enforce_signal_direction() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT prediction.validate_signal_direction(NEW.direction, NEW.target_id) THEN
    RAISE EXCEPTION 'Invalid signal direction "%" for target domain', NEW.direction;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: enforce_signal_is_test(); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.enforce_signal_is_test() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  source_is_test BOOLEAN;
BEGIN
  -- Check source's is_test status from crawler.sources (migrated from prediction.sources)
  SELECT is_test INTO source_is_test
  FROM crawler.sources
  WHERE id = NEW.source_id;

  -- If source not found in crawler.sources, allow the insert (source may be optional)
  IF source_is_test IS NULL THEN
    RETURN NEW;
  END IF;

  -- If source is test, signal must be test
  IF source_is_test = true AND NEW.is_test = false THEN
    RAISE EXCEPTION 'INV-02 Violation: Signal must have is_test=true when source has is_test=true. Source ID: %, Signal is_test: %',
      NEW.source_id, NEW.is_test;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enforce_target_domain_type(); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.enforce_target_domain_type() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  universe_domain TEXT;
  expected_type TEXT;
BEGIN
  -- Get universe domain
  SELECT domain INTO universe_domain
  FROM prediction.universes
  WHERE id = NEW.universe_id;

  -- Map domain to expected target_type
  expected_type := CASE universe_domain
    WHEN 'stocks' THEN 'stock'
    WHEN 'crypto' THEN 'crypto'
    WHEN 'elections' THEN 'election'
    WHEN 'polymarket' THEN 'polymarket'
    ELSE NULL
  END;

  -- Validate
  IF NEW.target_type != expected_type THEN
    RAISE EXCEPTION 'target_type "%" does not match universe domain "%" (expected "%")',
      NEW.target_type, universe_domain, expected_type;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enforce_test_target_isolation(); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.enforce_test_target_isolation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  target_symbol TEXT;
BEGIN
  -- If predictor is test data, target must be T_ prefixed
  IF NEW.is_test = true THEN
    SELECT symbol INTO target_symbol
    FROM prediction.targets
    WHERE id = NEW.target_id;

    IF target_symbol IS NULL THEN
      RAISE EXCEPTION 'INV-04 Violation: Target not found for predictor. Target ID: %', NEW.target_id;
    END IF;

    IF target_symbol NOT LIKE 'T_%' THEN
      RAISE EXCEPTION 'INV-04 Violation: is_test=true predictor can only affect T_ prefixed targets. Target symbol: %. Expected: T_* prefix',
        target_symbol;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: get_active_analysts(uuid, text); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.get_active_analysts(p_target_id uuid, p_tier text DEFAULT NULL::text) RETURNS TABLE(analyst_id uuid, slug text, name text, perspective text, effective_weight numeric, effective_tier text, tier_instructions jsonb, learned_patterns jsonb, scope_level text)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  v_target RECORD;
BEGIN
  -- Get target and universe info
  SELECT t.id, t.universe_id, u.domain, u.id as universe_id
  INTO v_target
  FROM prediction.targets t
  JOIN prediction.universes u ON t.universe_id = u.id
  WHERE t.id = p_target_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target not found: %', p_target_id;
  END IF;

  RETURN QUERY
  WITH analyst_candidates AS (
    -- Get all applicable analysts by scope hierarchy
    SELECT
      a.id,
      a.slug,
      a.name,
      a.perspective,
      a.default_weight,
      a.tier_instructions,
      a.learned_patterns,
      a.scope_level,
      a.is_enabled,
      -- Priority: target > universe > domain > runner
      CASE a.scope_level
        WHEN 'target' THEN 1
        WHEN 'universe' THEN 2
        WHEN 'domain' THEN 3
        WHEN 'runner' THEN 4
      END AS scope_priority
    FROM prediction.analysts a
    WHERE a.is_enabled = true
      AND (
        -- Runner-level (global)
        a.scope_level = 'runner'
        -- Domain-level
        OR (a.scope_level = 'domain' AND a.domain = v_target.domain)
        -- Universe-level
        OR (a.scope_level = 'universe' AND a.universe_id = v_target.universe_id)
        -- Target-level
        OR (a.scope_level = 'target' AND a.target_id = p_target_id)
      )
  ),
  with_overrides AS (
    -- Apply overrides (target > universe)
    -- Use DISTINCT ON to pick the most specific scope per analyst slug
    SELECT DISTINCT ON (ac.slug)
      ac.id AS analyst_id,
      ac.slug,
      ac.name,
      ac.perspective,
      COALESCE(
        tao.weight_override,
        uao.weight_override,
        ac.default_weight
      ) AS effective_weight,
      COALESCE(
        tao.tier_override,
        uao.tier_override,
        COALESCE(p_tier, 'silver')
      ) AS effective_tier,
      ac.tier_instructions,
      ac.learned_patterns,
      ac.scope_level,
      COALESCE(
        tao.is_enabled_override,
        uao.is_enabled_override,
        ac.is_enabled
      ) AS is_enabled
    FROM analyst_candidates ac
    LEFT JOIN prediction.analyst_overrides tao
      ON tao.analyst_id = ac.id AND tao.target_id = p_target_id
    LEFT JOIN prediction.analyst_overrides uao
      ON uao.analyst_id = ac.id AND uao.universe_id = v_target.universe_id AND uao.target_id IS NULL
    ORDER BY ac.slug, ac.scope_priority
  )
  SELECT
    wo.analyst_id,
    wo.slug,
    wo.name,
    wo.perspective,
    wo.effective_weight,
    wo.effective_tier,
    wo.tier_instructions,
    wo.learned_patterns,
    wo.scope_level
  FROM with_overrides wo
  WHERE wo.is_enabled = true
    AND wo.effective_weight > 0
  ORDER BY wo.effective_weight DESC;
END;
$$;


--
-- Name: get_active_learnings(uuid, text, uuid); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.get_active_learnings(p_target_id uuid, p_tier text DEFAULT NULL::text, p_analyst_id uuid DEFAULT NULL::uuid) RETURNS TABLE(learning_id uuid, learning_type text, title text, description text, config jsonb, scope_level text, times_applied integer, times_helpful integer)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  v_target RECORD;
BEGIN
  -- Get target info
  SELECT t.id, t.universe_id, u.domain
  INTO v_target
  FROM prediction.targets t
  JOIN prediction.universes u ON t.universe_id = u.id
  WHERE t.id = p_target_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target not found: %', p_target_id;
  END IF;

  RETURN QUERY
  SELECT
    l.id AS learning_id,
    l.learning_type,
    l.title,
    l.description,
    l.config,
    l.scope_level,
    l.times_applied,
    l.times_helpful
  FROM prediction.learnings l
  WHERE l.status = 'active'
    AND (
      -- Runner-level (global)
      l.scope_level = 'runner'
      -- Domain-level
      OR (l.scope_level = 'domain' AND l.domain = v_target.domain)
      -- Universe-level
      OR (l.scope_level = 'universe' AND l.universe_id = v_target.universe_id)
      -- Target-level
      OR (l.scope_level = 'target' AND l.target_id = p_target_id)
    )
    -- Analyst filter (if specified)
    AND (p_analyst_id IS NULL OR l.analyst_id IS NULL OR l.analyst_id = p_analyst_id)
  ORDER BY
    -- Broader scope first (runner -> target)
    CASE l.scope_level
      WHEN 'runner' THEN 1
      WHEN 'domain' THEN 2
      WHEN 'universe' THEN 3
      WHEN 'target' THEN 4
    END,
    l.times_helpful DESC,
    l.created_at ASC;
END;
$$;


--
-- Name: get_analyst_effective_settings(uuid, uuid, text); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.get_analyst_effective_settings(p_analyst_id uuid, p_target_id uuid, p_tier text DEFAULT NULL::text) RETURNS TABLE(effective_weight numeric, effective_tier text, is_enabled boolean, tier_instructions jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  v_analyst RECORD;
  v_target RECORD;
  v_target_override RECORD;
  v_universe_override RECORD;
BEGIN
  -- Get analyst info
  SELECT a.*, a.default_weight, a.is_enabled, a.tier_instructions
  INTO v_analyst
  FROM prediction.analysts a
  WHERE a.id = p_analyst_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Analyst not found: %', p_analyst_id;
  END IF;

  -- Get target info
  SELECT t.id, t.universe_id
  INTO v_target
  FROM prediction.targets t
  WHERE t.id = p_target_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target not found: %', p_target_id;
  END IF;

  -- Get target-level override (if exists)
  SELECT ao.*
  INTO v_target_override
  FROM prediction.analyst_overrides ao
  WHERE ao.analyst_id = p_analyst_id
    AND ao.target_id = p_target_id;

  -- Get universe-level override (if exists and no target override)
  SELECT ao.*
  INTO v_universe_override
  FROM prediction.analyst_overrides ao
  WHERE ao.analyst_id = p_analyst_id
    AND ao.universe_id = v_target.universe_id
    AND ao.target_id IS NULL;

  -- Return effective settings
  RETURN QUERY
  SELECT
    COALESCE(
      v_target_override.weight_override,
      v_universe_override.weight_override,
      v_analyst.default_weight
    ) AS effective_weight,
    COALESCE(
      v_target_override.tier_override,
      v_universe_override.tier_override,
      COALESCE(p_tier, 'silver')
    ) AS effective_tier,
    COALESCE(
      v_target_override.is_enabled_override,
      v_universe_override.is_enabled_override,
      v_analyst.is_enabled
    ) AS is_enabled,
    v_analyst.tier_instructions;
END;
$$;


--
-- Name: get_context_for_target(uuid); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.get_context_for_target(p_target_id uuid) RETURNS TABLE(scope_level text, slug text, name text, perspective text, tier_instructions jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  v_target RECORD;
BEGIN
  -- Get target and universe info
  SELECT t.id, t.universe_id, u.domain
  INTO v_target
  FROM prediction.targets t
  JOIN prediction.universes u ON t.universe_id = u.id
  WHERE t.id = p_target_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target not found: %', p_target_id;
  END IF;

  -- Return context providers in scope order: runner -> domain -> universe -> target
  RETURN QUERY
  SELECT
    a.scope_level,
    a.slug,
    a.name,
    a.perspective,
    a.tier_instructions
  FROM prediction.analysts a
  WHERE a.analyst_type = 'context_provider'
    AND a.is_enabled = true
    AND (
      -- Runner-level (always included)
      a.scope_level = 'runner'
      -- Domain-level (if matches)
      OR (a.scope_level = 'domain' AND a.domain = v_target.domain)
      -- Universe-level (if matches)
      OR (a.scope_level = 'universe' AND a.universe_id = v_target.universe_id)
      -- Target-level (if matches)
      OR (a.scope_level = 'target' AND a.target_id = p_target_id)
    )
  ORDER BY
    CASE a.scope_level
      WHEN 'runner' THEN 1
      WHEN 'domain' THEN 2
      WHEN 'universe' THEN 3
      WHEN 'target' THEN 4
    END;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: analyst_context_versions; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.analyst_context_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    analyst_id uuid NOT NULL,
    fork_type text DEFAULT 'user'::text NOT NULL,
    version_number integer DEFAULT 1 NOT NULL,
    perspective text NOT NULL,
    tier_instructions jsonb DEFAULT '{}'::jsonb NOT NULL,
    default_weight numeric(5,4) DEFAULT 1.0000 NOT NULL,
    agent_journal text,
    change_reason text,
    changed_by text DEFAULT 'system'::text NOT NULL,
    is_current boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT analyst_context_versions_changed_by_check CHECK ((changed_by = ANY (ARRAY['system'::text, 'user'::text, 'learning_loop'::text, 'agent_self'::text]))),
    CONSTRAINT analyst_context_versions_default_weight_check CHECK (((default_weight >= 0.0000) AND (default_weight <= 2.0000))),
    CONSTRAINT analyst_context_versions_fork_type_check CHECK ((fork_type = ANY (ARRAY['user'::text, 'ai'::text, 'arbitrator'::text])))
);


--
-- Name: get_current_analyst_context(uuid, text); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.get_current_analyst_context(p_analyst_id uuid, p_fork_type text DEFAULT 'user'::text) RETURNS prediction.analyst_context_versions
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_result prediction.analyst_context_versions;
BEGIN
  SELECT * INTO v_result
  FROM prediction.analyst_context_versions
  WHERE analyst_id = p_analyst_id
    AND fork_type = p_fork_type
    AND is_current = TRUE
  LIMIT 1;

  RETURN v_result;
END;
$$;


--
-- Name: get_default_model_for_tier(text, text); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.get_default_model_for_tier(p_tier text, p_provider text DEFAULT NULL::text) RETURNS TABLE(provider text, model text)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT ltm.provider, ltm.model
  FROM prediction.llm_tier_mapping ltm
  WHERE ltm.prediction_tier = p_tier
    AND (p_provider IS NULL OR ltm.provider = p_provider)
  ORDER BY
    CASE ltm.provider
      WHEN 'anthropic' THEN 1
      WHEN 'openai' THEN 2
      ELSE 3
    END
  LIMIT 1;
END;
$$;


--
-- Name: get_models_for_tier(text, text); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.get_models_for_tier(p_tier text, p_provider text DEFAULT NULL::text) RETURNS TABLE(id uuid, provider text, model text, model_tier text, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    ltm.id,
    ltm.provider,
    ltm.model,
    ltm.model_tier,
    ltm.metadata
  FROM prediction.llm_tier_mapping ltm
  WHERE ltm.prediction_tier = p_tier
    AND (p_provider IS NULL OR ltm.provider = p_provider)
  ORDER BY
    CASE ltm.model_tier
      WHEN 'flagship' THEN 1
      WHEN 'standard' THEN 2
      WHEN 'economy' THEN 3
      WHEN 'local' THEN 4
      ELSE 5
    END;
END;
$$;


--
-- Name: get_new_articles_for_subscription(uuid, integer); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.get_new_articles_for_subscription(p_subscription_id uuid, p_limit integer DEFAULT 100) RETURNS TABLE(article_id uuid, source_id uuid, url text, title text, content text, summary text, content_hash text, title_normalized text, key_phrases text[], published_at timestamp with time zone, first_seen_at timestamp with time zone, raw_data jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  v_subscription RECORD;
BEGIN
  -- Get subscription details
  SELECT ps.source_id, ps.last_processed_at, ps.filter_config
  INTO v_subscription
  FROM prediction.source_subscriptions ps
  WHERE ps.id = p_subscription_id
    AND ps.is_active = true;

  IF v_subscription IS NULL THEN
    RETURN;
  END IF;

  -- Return new articles since last processed
  RETURN QUERY
  SELECT
    a.id,
    a.source_id,
    a.url,
    a.title,
    a.content,
    a.summary,
    a.content_hash,
    a.title_normalized,
    a.key_phrases,
    a.published_at,
    a.first_seen_at,
    a.raw_data
  FROM crawler.articles a
  WHERE a.source_id = v_subscription.source_id
    AND a.first_seen_at > v_subscription.last_processed_at
    AND a.is_test = false
  ORDER BY a.first_seen_at ASC
  LIMIT p_limit;
END;
$$;


--
-- Name: get_new_articles_for_target(uuid, integer); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.get_new_articles_for_target(p_target_id uuid, p_limit integer DEFAULT 100) RETURNS TABLE(article_id uuid, subscription_id uuid, source_id uuid, url text, title text, content text, summary text, content_hash text, title_normalized text, key_phrases text[], published_at timestamp with time zone, first_seen_at timestamp with time zone, raw_data jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    ps.id as subscription_id,
    a.source_id,
    a.url,
    a.title,
    a.content,
    a.summary,
    a.content_hash,
    a.title_normalized,
    a.key_phrases,
    a.published_at,
    a.first_seen_at,
    a.raw_data
  FROM prediction.source_subscriptions ps
  JOIN crawler.articles a ON a.source_id = ps.source_id
  WHERE ps.target_id = p_target_id
    AND ps.is_active = true
    AND a.first_seen_at > ps.last_processed_at
    AND a.is_test = false
  ORDER BY a.first_seen_at ASC
  LIMIT p_limit;
END;
$$;


--
-- Name: get_personality_analysts(); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.get_personality_analysts() RETURNS TABLE(analyst_id uuid, slug text, name text, perspective text, default_weight numeric, tier_instructions jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id AS analyst_id,
    a.slug,
    a.name,
    a.perspective,
    a.default_weight,
    a.tier_instructions
  FROM prediction.analysts a
  WHERE a.analyst_type = 'personality'
    AND a.is_enabled = true
  ORDER BY a.name;
END;
$$;


--
-- Name: get_records_for_replay(text, timestamp with time zone, uuid, uuid[]); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.get_records_for_replay(p_rollback_depth text, p_rollback_to timestamp with time zone, p_universe_id uuid, p_target_ids uuid[] DEFAULT NULL::uuid[]) RETURNS TABLE(table_name text, record_ids uuid[], row_count integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_target_ids UUID[];
BEGIN
  -- Get target IDs
  IF p_target_ids IS NOT NULL AND array_length(p_target_ids, 1) > 0 THEN
    v_target_ids := p_target_ids;
  ELSE
    SELECT array_agg(id) INTO v_target_ids
    FROM prediction.targets
    WHERE universe_id = p_universe_id;
  END IF;

  -- Always return predictions
  RETURN QUERY
  SELECT
    'predictions'::TEXT,
    array_agg(p.id),
    COUNT(*)::INTEGER
  FROM prediction.predictions p
  WHERE p.target_id = ANY(v_target_ids)
    AND p.predicted_at >= p_rollback_to
    AND (p.is_test_data IS NULL OR p.is_test_data = false);

  -- Return predictors if depth is 'predictors' or 'signals'
  IF p_rollback_depth IN ('predictors', 'signals') THEN
    RETURN QUERY
    SELECT
      'predictors'::TEXT,
      array_agg(pr.id),
      COUNT(*)::INTEGER
    FROM prediction.predictors pr
    WHERE pr.target_id = ANY(v_target_ids)
      AND pr.created_at >= p_rollback_to
      AND (pr.is_test_data IS NULL OR pr.is_test_data = false);

    RETURN QUERY
    SELECT
      'analyst_assessments'::TEXT,
      array_agg(aa.id),
      COUNT(*)::INTEGER
    FROM prediction.analyst_assessments aa
    JOIN prediction.predictors pr ON aa.predictor_id = pr.id
    WHERE pr.target_id = ANY(v_target_ids)
      AND pr.created_at >= p_rollback_to
      AND (pr.is_test_data IS NULL OR pr.is_test_data = false);
  END IF;

  -- Return signals if depth is 'signals'
  IF p_rollback_depth = 'signals' THEN
    RETURN QUERY
    SELECT
      'signals'::TEXT,
      array_agg(s.id),
      COUNT(*)::INTEGER
    FROM prediction.signals s
    WHERE s.target_id = ANY(v_target_ids)
      AND s.created_at >= p_rollback_to
      AND (s.is_test_data IS NULL OR s.is_test_data = false);
  END IF;
END;
$$;


--
-- Name: increment_learning_application(uuid, boolean); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.increment_learning_application(p_learning_id uuid, p_was_helpful boolean DEFAULT NULL::boolean) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE prediction.learnings
  SET
    times_applied = times_applied + 1,
    times_helpful = CASE
      WHEN p_was_helpful = true THEN times_helpful + 1
      ELSE times_helpful
    END,
    updated_at = NOW()
  WHERE id = p_learning_id;
END;
$$;


--
-- Name: log_test_audit(text, uuid, text, text, uuid, jsonb); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.log_test_audit(p_organization_slug text, p_user_id uuid, p_action text, p_resource_type text, p_resource_id uuid, p_details jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO prediction.test_audit_log (
    organization_slug, user_id, action, resource_type, resource_id, details
  ) VALUES (
    p_organization_slug, p_user_id, p_action, p_resource_type, p_resource_id, p_details
  )
  RETURNING id INTO log_id;

  RETURN log_id;
END;
$$;


--
-- Name: map_sentiment_to_outcome(text, text); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.map_sentiment_to_outcome(p_sentiment text, p_domain text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  IF p_domain IN ('stocks', 'crypto') THEN
    RETURN CASE p_sentiment
      WHEN 'bullish' THEN 'up'
      WHEN 'bearish' THEN 'down'
      WHEN 'neutral' THEN 'flat'
      ELSE NULL
    END;
  ELSIF p_domain IN ('elections', 'polymarket') THEN
    -- For elections/polymarket, sentiment maps to yes/no
    RETURN CASE p_sentiment
      WHEN 'bullish' THEN 'yes'
      WHEN 'bearish' THEN 'no'
      WHEN 'neutral' THEN 'uncertain'
      WHEN 'yes' THEN 'yes'
      WHEN 'no' THEN 'no'
      ELSE NULL
    END;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: restore_replay_snapshot(uuid); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.restore_replay_snapshot(p_snapshot_id uuid) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_snapshot RECORD;
  v_item JSONB;
  v_restored INTEGER := 0;
BEGIN
  -- Get the snapshot
  SELECT * INTO v_snapshot
  FROM prediction.replay_test_snapshots
  WHERE id = p_snapshot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snapshot not found: %', p_snapshot_id;
  END IF;

  -- Restore based on table name
  IF v_snapshot.table_name = 'predictions' THEN
    INSERT INTO prediction.predictions
    SELECT * FROM jsonb_populate_recordset(null::prediction.predictions, v_snapshot.original_data)
    ON CONFLICT (id) DO UPDATE SET
      target_id = EXCLUDED.target_id,
      direction = EXCLUDED.direction,
      confidence = EXCLUDED.confidence,
      magnitude = EXCLUDED.magnitude,
      reasoning = EXCLUDED.reasoning,
      status = EXCLUDED.status,
      predicted_at = EXCLUDED.predicted_at;
    GET DIAGNOSTICS v_restored = ROW_COUNT;

  ELSIF v_snapshot.table_name = 'predictors' THEN
    INSERT INTO prediction.predictors
    SELECT * FROM jsonb_populate_recordset(null::prediction.predictors, v_snapshot.original_data)
    ON CONFLICT (id) DO UPDATE SET
      target_id = EXCLUDED.target_id,
      direction = EXCLUDED.direction,
      confidence = EXCLUDED.confidence,
      analysis = EXCLUDED.analysis,
      status = EXCLUDED.status;
    GET DIAGNOSTICS v_restored = ROW_COUNT;

  ELSIF v_snapshot.table_name = 'signals' THEN
    INSERT INTO prediction.signals
    SELECT * FROM jsonb_populate_recordset(null::prediction.signals, v_snapshot.original_data)
    ON CONFLICT (id) DO UPDATE SET
      target_id = EXCLUDED.target_id,
      source_id = EXCLUDED.source_id,
      content = EXCLUDED.content,
      signal_type = EXCLUDED.signal_type,
      sentiment = EXCLUDED.sentiment;
    GET DIAGNOSTICS v_restored = ROW_COUNT;

  ELSIF v_snapshot.table_name = 'analyst_assessments' THEN
    INSERT INTO prediction.analyst_assessments
    SELECT * FROM jsonb_populate_recordset(null::prediction.analyst_assessments, v_snapshot.original_data)
    ON CONFLICT (id) DO UPDATE SET
      analyst_id = EXCLUDED.analyst_id,
      predictor_id = EXCLUDED.predictor_id,
      direction = EXCLUDED.direction,
      confidence = EXCLUDED.confidence,
      analysis = EXCLUDED.analysis;
    GET DIAGNOSTICS v_restored = ROW_COUNT;

  END IF;

  RETURN v_restored;
END;
$$;


--
-- Name: set_test_scenarios_updated_at(); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.set_test_scenarios_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_analyst_portfolio_status(); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.update_analyst_portfolio_status() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_balance_percent NUMERIC;
  v_new_status TEXT;
BEGIN
  -- Only applies to agent fork
  IF NEW.fork_type != 'agent' THEN
    RETURN NEW;
  END IF;

  -- Calculate balance as percentage of initial
  v_balance_percent := (NEW.current_balance / NEW.initial_balance) * 100;

  -- Determine new status based on thresholds
  IF v_balance_percent >= 80 THEN
    v_new_status := 'active';
  ELSIF v_balance_percent >= 60 THEN
    v_new_status := 'warning';
  ELSIF v_balance_percent >= 40 THEN
    v_new_status := 'probation';
  ELSE
    v_new_status := 'suspended';
  END IF;

  -- Update status if changed
  IF NEW.status != v_new_status THEN
    NEW.status := v_new_status;
    NEW.status_changed_at := NOW();
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: update_daily_postmortem_recommendations_timestamp(); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.update_daily_postmortem_recommendations_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_daily_postmortem_runs_timestamp(); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.update_daily_postmortem_runs_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_subscription_watermark(uuid, timestamp with time zone); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.update_subscription_watermark(p_subscription_id uuid, p_last_processed_at timestamp with time zone DEFAULT now()) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE prediction.source_subscriptions
  SET last_processed_at = p_last_processed_at
  WHERE id = p_subscription_id;
END;
$$;


--
-- Name: user_has_org_access(text); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.user_has_org_access(p_org_slug text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'authz', 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM authz.rbac_get_user_organizations(auth.uid())
    WHERE organization_slug = p_org_slug
  );
END;
$$;


--
-- Name: validate_learning_lineage(); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.validate_learning_lineage() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  test_is_test BOOLEAN;
  prod_is_test BOOLEAN;
BEGIN
  -- Check test learning is_test flag
  SELECT is_test INTO test_is_test
  FROM prediction.learnings
  WHERE id = NEW.test_learning_id;

  -- Check production learning is_test flag
  SELECT is_test INTO prod_is_test
  FROM prediction.learnings
  WHERE id = NEW.production_learning_id;

  -- Validate test learning has is_test=true
  IF test_is_test != true THEN
    RAISE EXCEPTION 'INV-09 Violation: test_learning_id must reference a learning with is_test=true. Learning ID: %, is_test: %',
      NEW.test_learning_id, test_is_test;
  END IF;

  -- Validate production learning has is_test=false
  IF prod_is_test != false THEN
    RAISE EXCEPTION 'INV-09 Violation: production_learning_id must reference a learning with is_test=false. Learning ID: %, is_test: %',
      NEW.production_learning_id, prod_is_test;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: validate_prediction_direction(text, uuid); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.validate_prediction_direction(p_direction text, p_target_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  v_domain TEXT;
BEGIN
  -- Get target's domain via universe
  SELECT u.domain INTO v_domain
  FROM prediction.targets t
  JOIN prediction.universes u ON t.universe_id = u.id
  WHERE t.id = p_target_id;

  -- For stocks/crypto: up, down, flat (outcome vocabulary)
  IF v_domain IN ('stocks', 'crypto') THEN
    RETURN p_direction IN ('up', 'down', 'flat');
  END IF;

  -- For elections/polymarket: yes/no/uncertain
  IF v_domain IN ('elections', 'polymarket') THEN
    RETURN p_direction IN ('yes', 'no', 'uncertain');
  END IF;

  -- Unknown domain
  RETURN FALSE;
END;
$$;


--
-- Name: validate_prediction_status_transition(); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.validate_prediction_status_transition() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Only validate if status is changing
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Valid transitions
  IF OLD.status = 'active' AND NEW.status IN ('resolved', 'expired', 'cancelled') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid prediction status transition from "%" to "%"', OLD.status, NEW.status;
END;
$$;


--
-- Name: validate_signal_direction(text, uuid); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.validate_signal_direction(p_direction text, p_target_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  v_domain TEXT;
BEGIN
  -- Get target's domain via universe
  SELECT u.domain INTO v_domain
  FROM prediction.targets t
  JOIN prediction.universes u ON t.universe_id = u.id
  WHERE t.id = p_target_id;

  -- For stocks/crypto: bullish, bearish, neutral
  IF v_domain IN ('stocks', 'crypto') THEN
    RETURN p_direction IN ('bullish', 'bearish', 'neutral');
  END IF;

  -- For elections/polymarket: can also use yes/no
  -- Allow bullish/bearish/neutral as fallback
  IF v_domain IN ('elections', 'polymarket') THEN
    RETURN p_direction IN ('bullish', 'bearish', 'neutral', 'yes', 'no');
  END IF;

  -- Unknown domain
  RETURN FALSE;
END;
$$;


--
-- Name: validate_test_article_symbols(); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.validate_test_article_symbols() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Check that all target_symbols start with T_
  IF EXISTS (
    SELECT 1 FROM unnest(NEW.target_symbols) AS symbol
    WHERE symbol NOT LIKE 'T_%'
  ) THEN
    RAISE EXCEPTION 'All target_symbols must start with T_ prefix (INV-08)';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: validate_test_target_symbols(); Type: FUNCTION; Schema: prediction; Owner: -
--

CREATE FUNCTION prediction.validate_test_target_symbols() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Check that all target_symbols start with T_ (only if array is not empty)
  IF array_length(NEW.target_symbols, 1) > 0 AND EXISTS (
    SELECT 1 FROM unnest(NEW.target_symbols) AS symbol
    WHERE symbol NOT LIKE 'T_%'
  ) THEN
    RAISE EXCEPTION 'All target_symbols must start with T_ prefix (INV-08)';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: cleanup_expired_pii_mappings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_pii_mappings() RETURNS TABLE(deleted_count bigint, oldest_deleted timestamp with time zone, newest_deleted timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_deleted_count BIGINT;
    v_oldest TIMESTAMPTZ;
    v_newest TIMESTAMPTZ;
BEGIN
    -- Get stats on what will be deleted
    SELECT COUNT(*), MIN(expires_at), MAX(expires_at)
    INTO v_deleted_count, v_oldest, v_newest
    FROM public.pseudonym_dictionaries
    WHERE expires_at < CURRENT_TIMESTAMP;

    -- Delete expired entries
    DELETE FROM public.pseudonym_dictionaries
    WHERE expires_at < CURRENT_TIMESTAMP;

    -- Log the cleanup
    INSERT INTO public.system_settings (key, value)
    VALUES (
        'pii_cleanup_last_run',
        jsonb_build_object(
            'timestamp', CURRENT_TIMESTAMP,
            'deleted_count', v_deleted_count,
            'oldest_deleted', v_oldest,
            'newest_deleted', v_newest
        )
    )
    ON CONFLICT (key) DO UPDATE
    SET value = jsonb_build_object(
        'timestamp', CURRENT_TIMESTAMP,
        'deleted_count', v_deleted_count,
        'oldest_deleted', v_oldest,
        'newest_deleted', v_newest
    ),
    updated_at = CURRENT_TIMESTAMP;

    RETURN QUERY SELECT v_deleted_count, v_oldest, v_newest;
END;
$$;


--
-- Name: decrypt_pii_value(bytea); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decrypt_pii_value(ciphertext bytea) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Check if pgsodium is available
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgsodium') THEN
    RAISE WARNING 'pgsodium extension not enabled - cannot decrypt';
    RETURN NULL;
  END IF;

  -- Use pgsodium's crypto_secretbox_open for decryption
  RETURN convert_from(
    pgsodium.crypto_secretbox_open(
      ciphertext,
      (SELECT key_id FROM pgsodium.key WHERE name = 'pii_encryption_key' LIMIT 1)
    ),
    'UTF8'
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Decryption failed: %. Returning null.', SQLERRM;
    RETURN NULL;
END;
$$;


--
-- Name: delete_user_pii_data(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_user_pii_data(p_user_id uuid) RETURNS TABLE(deleted_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_deleted_count BIGINT;
BEGIN
    -- Delete all PII mappings for this user
    DELETE FROM public.pseudonym_dictionaries
    WHERE user_id = p_user_id;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- Log the deletion for audit
    INSERT INTO public.system_settings (key, value)
    VALUES (
        'pii_user_deletion_' || p_user_id::TEXT,
        jsonb_build_object(
            'timestamp', CURRENT_TIMESTAMP,
            'user_id', p_user_id,
            'deleted_count', v_deleted_count,
            'reason', 'user_request'
        )
    )
    ON CONFLICT (key) DO UPDATE
    SET value = jsonb_build_object(
        'timestamp', CURRENT_TIMESTAMP,
        'user_id', p_user_id,
        'deleted_count', v_deleted_count,
        'reason', 'user_request'
    ),
    updated_at = CURRENT_TIMESTAMP;

    RETURN QUERY SELECT v_deleted_count;
END;
$$;


--
-- Name: encrypt_pii_value(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.encrypt_pii_value(plaintext text) RETURNS bytea
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Check if pgsodium is available
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgsodium') THEN
    RAISE WARNING 'pgsodium extension not enabled - returning null for encryption';
    RETURN NULL;
  END IF;

  -- Use pgsodium's crypto_secretbox for symmetric encryption
  -- The key is managed by Supabase's Vault
  RETURN pgsodium.crypto_secretbox(
    convert_to(plaintext, 'UTF8'),
    pgsodium.crypto_secretbox_noncegen(),
    (SELECT key_id FROM pgsodium.key WHERE name = 'pii_encryption_key' LIMIT 1)
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Encryption failed: %. Returning null.', SQLERRM;
    RETURN NULL;
END;
$$;


--
-- Name: extend_pii_expiration(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.extend_pii_expiration(p_id uuid, p_extension_days integer DEFAULT 30) RETURNS timestamp with time zone
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_new_expires_at TIMESTAMPTZ;
BEGIN
    -- Extend expiration from current time, not from old expires_at
    v_new_expires_at := CURRENT_TIMESTAMP + (p_extension_days || ' days')::INTERVAL;

    UPDATE public.pseudonym_dictionaries
    SET
        expires_at = v_new_expires_at,
        last_used_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN v_new_expires_at;
END;
$$;


--
-- Name: get_global_model_config(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_global_model_config() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  -- First try to get from system_settings table
  -- If not found, return a fallback default (Ollama/llama3.2:1b)
  SELECT COALESCE(
    (SELECT value FROM public.system_settings WHERE key = 'model_config_global'),
    jsonb_build_object(
      'provider', 'ollama',
      'model', 'llama3.2:1b',
      'parameters', jsonb_build_object(
        'temperature', 0.7,
        'maxTokens', 8000
      )
    )
  );
$$;


--
-- Name: get_team_member_count(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_team_member_count(p_team_id uuid) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
  SELECT COUNT(*)::INTEGER FROM public.team_members WHERE team_id = p_team_id;
$$;


--
-- Name: get_user_teams(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_teams(p_user_id uuid) RETURNS TABLE(team_id uuid, team_name text, team_description text, org_slug text, member_role text, joined_at timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    t.id AS team_id,
    t.name AS team_name,
    t.description AS team_description,
    t.org_slug,  -- Will be NULL for global teams
    tm.role AS member_role,
    tm.joined_at
  FROM public.teams t
  JOIN public.team_members tm ON t.id = tm.team_id
  WHERE tm.user_id = p_user_id
  ORDER BY COALESCE(t.org_slug, ''), t.name;
$$;


--
-- Name: rbac_get_user_organizations(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rbac_get_user_organizations(p_user_id uuid) RETURNS TABLE(organization_slug character varying, organization_name text, role_name character varying, is_global boolean)
    LANGUAGE sql STABLE
    AS $$
    -- If user has global access (*), return all actual organizations
    WITH user_has_global AS (
        SELECT EXISTS(
            SELECT 1
            FROM rbac_user_org_roles
            WHERE user_id = p_user_id
              AND organization_slug = '*'
              AND (expires_at IS NULL OR expires_at > NOW())
        ) AS has_global
    ),
    global_role AS (
        SELECT r.name AS role_name
        FROM rbac_user_org_roles uor
        JOIN rbac_roles r ON uor.role_id = r.id
        WHERE uor.user_id = p_user_id
          AND uor.organization_slug = '*'
          AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
        LIMIT 1
    )
    SELECT DISTINCT
        CASE
            WHEN (SELECT has_global FROM user_has_global) THEN o.slug
            ELSE uor.organization_slug
        END AS organization_slug,
        CASE
            WHEN (SELECT has_global FROM user_has_global) THEN o.name
            ELSE o.name
        END AS organization_name,
        CASE
            WHEN (SELECT has_global FROM user_has_global) THEN (SELECT role_name FROM global_role)
            ELSE r.name
        END AS role_name,
        (SELECT has_global FROM user_has_global) AS is_global
    FROM (
        SELECT has_global FROM user_has_global
    ) ug
    CROSS JOIN organizations o
    LEFT JOIN rbac_user_org_roles uor ON uor.organization_slug = o.slug AND uor.user_id = p_user_id
    LEFT JOIN rbac_roles r ON uor.role_id = r.id
    WHERE (SELECT has_global FROM user_has_global)
       OR (uor.user_id = p_user_id AND (uor.expires_at IS NULL OR uor.expires_at > NOW()))
    ORDER BY organization_slug;
$$;


--
-- Name: set_teams_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_teams_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_auth_identity_links_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_auth_identity_links_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_llm_models_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_llm_models_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_llm_providers_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_llm_providers_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_redaction_patterns_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_redaction_patterns_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: rag_collections; Type: TABLE; Schema: rag_data; Owner: -
--

CREATE TABLE rag_data.rag_collections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_slug text NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    description text,
    embedding_model character varying(100) DEFAULT 'nomic-embed-text'::character varying NOT NULL,
    embedding_dimensions integer DEFAULT 768 NOT NULL,
    chunk_size integer DEFAULT 1000 NOT NULL,
    chunk_overlap integer DEFAULT 200 NOT NULL,
    status character varying(50) DEFAULT 'active'::character varying NOT NULL,
    required_role text,
    allowed_users uuid[],
    document_count integer DEFAULT 0 NOT NULL,
    chunk_count integer DEFAULT 0 NOT NULL,
    total_tokens integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    complexity_type character varying(50) DEFAULT 'basic'::character varying,
    CONSTRAINT valid_complexity_type CHECK (((complexity_type)::text = ANY (ARRAY[('basic'::character varying)::text, ('attributed'::character varying)::text, ('hybrid'::character varying)::text, ('cross-reference'::character varying)::text, ('temporal'::character varying)::text])))
);


--
-- Name: rag_create_collection(text, character varying, character varying, text, character varying, integer, integer, integer, uuid, text, uuid[]); Type: FUNCTION; Schema: rag_data; Owner: -
--

CREATE FUNCTION rag_data.rag_create_collection(p_organization_slug text, p_name character varying, p_slug character varying, p_description text DEFAULT NULL::text, p_embedding_model character varying DEFAULT 'nomic-embed-text'::character varying, p_embedding_dimensions integer DEFAULT 768, p_chunk_size integer DEFAULT 1000, p_chunk_overlap integer DEFAULT 200, p_created_by uuid DEFAULT NULL::uuid, p_required_role text DEFAULT NULL::text, p_allowed_users uuid[] DEFAULT NULL::uuid[]) RETURNS rag_data.rag_collections
    LANGUAGE sql
    AS $$
    INSERT INTO rag_data.rag_collections (
        organization_slug,
        name,
        slug,
        description,
        embedding_model,
        embedding_dimensions,
        chunk_size,
        chunk_overlap,
        created_by,
        required_role,
        allowed_users
    ) VALUES (
        p_organization_slug,
        p_name,
        p_slug,
        p_description,
        p_embedding_model,
        p_embedding_dimensions,
        p_chunk_size,
        p_chunk_overlap,
        p_created_by,
        p_required_role,
        p_allowed_users
    )
    RETURNING *;
$$;


--
-- Name: rag_create_collection(text, character varying, character varying, text, character varying, integer, integer, integer, uuid, text, uuid[], character varying); Type: FUNCTION; Schema: rag_data; Owner: -
--

CREATE FUNCTION rag_data.rag_create_collection(p_organization_slug text, p_name character varying, p_slug character varying, p_description text, p_embedding_model character varying, p_embedding_dimensions integer, p_chunk_size integer, p_chunk_overlap integer, p_created_by uuid, p_required_role text DEFAULT NULL::text, p_allowed_users uuid[] DEFAULT NULL::uuid[], p_complexity_type character varying DEFAULT 'basic'::character varying) RETURNS rag_data.rag_collections
    LANGUAGE sql
    AS $$
    INSERT INTO rag_data.rag_collections (
        organization_slug, name, slug, description,
        embedding_model, embedding_dimensions, chunk_size, chunk_overlap,
        created_by, required_role, allowed_users, complexity_type
    )
    VALUES (
        p_organization_slug, p_name, p_slug, p_description,
        p_embedding_model, p_embedding_dimensions, p_chunk_size, p_chunk_overlap,
        p_created_by, p_required_role, p_allowed_users, p_complexity_type
    )
    RETURNING *;
$$;


--
-- Name: rag_delete_collection(uuid, text); Type: FUNCTION; Schema: rag_data; Owner: -
--

CREATE FUNCTION rag_data.rag_delete_collection(p_collection_id uuid, p_organization_slug text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
BEGIN
    DELETE FROM rag_data.rag_collections
    WHERE id = p_collection_id
      AND organization_slug = p_organization_slug;
    RETURN FOUND;
END;
$$;


--
-- Name: rag_delete_document(uuid, text); Type: FUNCTION; Schema: rag_data; Owner: -
--

CREATE FUNCTION rag_data.rag_delete_document(p_document_id uuid, p_organization_slug text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_collection_id UUID;
    v_chunk_count INTEGER;
BEGIN
    -- Get collection and chunk count before delete
    SELECT collection_id, chunk_count INTO v_collection_id, v_chunk_count
    FROM rag_data.rag_documents
    WHERE id = p_document_id AND organization_slug = p_organization_slug;

    IF v_collection_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Delete document (chunks deleted via CASCADE)
    DELETE FROM rag_data.rag_documents
    WHERE id = p_document_id AND organization_slug = p_organization_slug;

    -- Update collection stats
    UPDATE rag_data.rag_collections
    SET document_count = document_count - 1,
        chunk_count = chunk_count - COALESCE(v_chunk_count, 0),
        updated_at = NOW()
    WHERE id = v_collection_id;

    RETURN TRUE;
END;
$$;


--
-- Name: rag_get_collection(uuid, text); Type: FUNCTION; Schema: rag_data; Owner: -
--

CREATE FUNCTION rag_data.rag_get_collection(p_collection_id uuid, p_organization_slug text) RETURNS TABLE(id uuid, organization_slug text, name character varying, slug character varying, description text, embedding_model character varying, embedding_dimensions integer, chunk_size integer, chunk_overlap integer, status character varying, required_role text, allowed_users uuid[], complexity_type character varying, document_count integer, chunk_count integer, total_tokens integer, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid)
    LANGUAGE sql STABLE
    AS $$
    SELECT id, organization_slug, name, slug, description, embedding_model,
           embedding_dimensions, chunk_size, chunk_overlap, status, required_role,
           allowed_users, complexity_type, document_count, chunk_count, total_tokens,
           created_at, updated_at, created_by
    FROM rag_data.rag_collections
    WHERE id = p_collection_id
      AND organization_slug = p_organization_slug;
$$;


--
-- Name: rag_get_collection_by_slug(character varying, text); Type: FUNCTION; Schema: rag_data; Owner: -
--

CREATE FUNCTION rag_data.rag_get_collection_by_slug(p_collection_slug character varying, p_organization_slug text) RETURNS TABLE(id uuid, organization_slug text, name character varying, slug character varying, description text, embedding_model character varying, embedding_dimensions integer, chunk_size integer, chunk_overlap integer, status character varying, required_role text, allowed_users uuid[], complexity_type character varying, document_count integer, chunk_count integer, total_tokens integer, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid)
    LANGUAGE sql STABLE
    AS $$
    SELECT id, organization_slug, name, slug, description, embedding_model,
           embedding_dimensions, chunk_size, chunk_overlap, status, required_role,
           allowed_users, complexity_type, document_count, chunk_count, total_tokens,
           created_at, updated_at, created_by
    FROM rag_data.rag_collections
    WHERE slug = p_collection_slug
      AND organization_slug = p_organization_slug;
$$;


--
-- Name: rag_get_collections(text, uuid); Type: FUNCTION; Schema: rag_data; Owner: -
--

CREATE FUNCTION rag_data.rag_get_collections(p_organization_slug text, p_user_id uuid DEFAULT NULL::uuid) RETURNS SETOF rag_data.rag_collections
    LANGUAGE sql STABLE
    AS $$
    SELECT *
    FROM rag_data.rag_collections
    WHERE organization_slug = p_organization_slug
      AND (
          -- No user filter = return all (for admin queries)
          p_user_id IS NULL
          -- Or user has access
          OR allowed_users IS NULL
          OR created_by = p_user_id
          OR p_user_id = ANY(allowed_users)
      )
    ORDER BY created_at DESC;
$$;


--
-- Name: rag_get_document(uuid, text); Type: FUNCTION; Schema: rag_data; Owner: -
--

CREATE FUNCTION rag_data.rag_get_document(p_document_id uuid, p_organization_slug text) RETURNS TABLE(id uuid, collection_id uuid, filename character varying, file_type character varying, file_size integer, file_hash character varying, storage_path text, status character varying, error_message text, chunk_count integer, token_count integer, metadata jsonb, content text, created_at timestamp with time zone, updated_at timestamp with time zone, processed_at timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
    SELECT d.id, d.collection_id, d.filename, d.file_type, d.file_size,
           d.file_hash, d.storage_path, d.status, d.error_message,
           d.chunk_count, d.token_count, d.metadata, d.content,
           d.created_at, d.updated_at, d.processed_at
    FROM rag_data.rag_documents d
    WHERE d.id = p_document_id
      AND d.organization_slug = p_organization_slug;
$$;


--
-- Name: rag_get_document_chunks(uuid, text); Type: FUNCTION; Schema: rag_data; Owner: -
--

CREATE FUNCTION rag_data.rag_get_document_chunks(p_document_id uuid, p_organization_slug text) RETURNS TABLE(id uuid, content text, chunk_index integer, token_count integer, page_number integer, metadata jsonb)
    LANGUAGE sql STABLE
    AS $$
    SELECT c.id, c.content, c.chunk_index, c.token_count, c.page_number, c.metadata
    FROM rag_data.rag_document_chunks c
    WHERE c.document_id = p_document_id
      AND c.organization_slug = p_organization_slug
    ORDER BY c.chunk_index;
$$;


--
-- Name: rag_get_document_content(uuid, text); Type: FUNCTION; Schema: rag_data; Owner: -
--

CREATE FUNCTION rag_data.rag_get_document_content(p_document_id uuid, p_organization_slug text) RETURNS TABLE(id uuid, filename character varying, file_type character varying, content text, chunk_count integer)
    LANGUAGE sql STABLE
    AS $$
    SELECT d.id, d.filename, d.file_type, d.content, d.chunk_count
    FROM rag_data.rag_documents d
    WHERE d.id = p_document_id
      AND d.organization_slug = p_organization_slug;
$$;


--
-- Name: rag_get_documents(uuid, text); Type: FUNCTION; Schema: rag_data; Owner: -
--

CREATE FUNCTION rag_data.rag_get_documents(p_collection_id uuid, p_organization_slug text) RETURNS TABLE(id uuid, collection_id uuid, filename character varying, file_type character varying, file_size integer, status character varying, error_message text, chunk_count integer, token_count integer, metadata jsonb, created_at timestamp with time zone, processed_at timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
    SELECT d.id, d.collection_id, d.filename, d.file_type, d.file_size, d.status,
           d.error_message, d.chunk_count, d.token_count, d.metadata,
           d.created_at, d.processed_at
    FROM rag_data.rag_documents d
    JOIN rag_data.rag_collections c ON d.collection_id = c.id
    WHERE d.collection_id = p_collection_id
      AND c.organization_slug = p_organization_slug
    ORDER BY d.created_at DESC;
$$;


--
-- Name: rag_insert_chunks(uuid, text, jsonb); Type: FUNCTION; Schema: rag_data; Owner: -
--

CREATE FUNCTION rag_data.rag_insert_chunks(p_document_id uuid, p_organization_slug text, p_chunks jsonb) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_collection_id UUID;
    v_inserted INTEGER := 0;
    v_total_tokens INTEGER := 0;
    v_chunk JSONB;
BEGIN
    -- Get collection_id and verify org ownership
    SELECT d.collection_id INTO v_collection_id
    FROM rag_data.rag_documents d
    JOIN rag_data.rag_collections c ON d.collection_id = c.id
    WHERE d.id = p_document_id
      AND c.organization_slug = p_organization_slug;

    IF v_collection_id IS NULL THEN
        RETURN 0;
    END IF;

    -- Insert all chunks
    FOR v_chunk IN SELECT * FROM jsonb_array_elements(p_chunks)
    LOOP
        INSERT INTO rag_data.rag_document_chunks (
            document_id, collection_id, organization_slug, content, chunk_index,
            embedding, token_count, page_number, char_offset, metadata
        )
        VALUES (
            p_document_id,
            v_collection_id,
            p_organization_slug,
            v_chunk->>'content',
            (v_chunk->>'chunk_index')::INTEGER,
            CASE
                WHEN v_chunk ? 'embedding' AND v_chunk->>'embedding' IS NOT NULL
                THEN (v_chunk->>'embedding')::vector
                ELSE NULL
            END,
            COALESCE((v_chunk->>'token_count')::INTEGER, 0),
            (v_chunk->>'page_number')::INTEGER,
            (v_chunk->>'char_offset')::INTEGER,
            COALESCE(v_chunk->'metadata', '{}'::JSONB)
        );
        v_inserted := v_inserted + 1;
        v_total_tokens := v_total_tokens + COALESCE((v_chunk->>'token_count')::INTEGER, 0);
    END LOOP;

    -- Update document stats
    UPDATE rag_data.rag_documents
    SET chunk_count = v_inserted,
        token_count = v_total_tokens,
        status = 'completed',
        processed_at = NOW()
    WHERE id = p_document_id;

    -- Update collection stats
    UPDATE rag_data.rag_collections
    SET chunk_count = chunk_count + v_inserted,
        document_count = document_count + 1,
        total_tokens = total_tokens + v_total_tokens,
        updated_at = NOW()
    WHERE id = v_collection_id;

    RETURN v_inserted;
END;
$$;


--
-- Name: rag_documents; Type: TABLE; Schema: rag_data; Owner: -
--

CREATE TABLE rag_data.rag_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    collection_id uuid NOT NULL,
    organization_slug text NOT NULL,
    filename character varying(500) NOT NULL,
    file_type character varying(50) NOT NULL,
    file_size integer NOT NULL,
    file_hash character varying(64),
    storage_path text,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    error_message text,
    chunk_count integer DEFAULT 0,
    token_count integer DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    created_by uuid,
    content text
);


--
-- Name: rag_insert_document(uuid, text, character varying, character varying, integer, character varying, text, uuid); Type: FUNCTION; Schema: rag_data; Owner: -
--

CREATE FUNCTION rag_data.rag_insert_document(p_collection_id uuid, p_organization_slug text, p_filename character varying, p_file_type character varying, p_file_size integer, p_file_hash character varying DEFAULT NULL::character varying, p_storage_path text DEFAULT NULL::text, p_created_by uuid DEFAULT NULL::uuid) RETURNS rag_data.rag_documents
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_collection_exists BOOLEAN;
    v_result rag_data.rag_documents;
BEGIN
    -- Verify collection belongs to organization
    SELECT EXISTS(
        SELECT 1 FROM rag_data.rag_collections
        WHERE id = p_collection_id AND organization_slug = p_organization_slug
    ) INTO v_collection_exists;

    IF NOT v_collection_exists THEN
        RETURN NULL;
    END IF;

    INSERT INTO rag_data.rag_documents (
        collection_id, organization_slug, filename, file_type, file_size,
        file_hash, storage_path, created_by
    )
    VALUES (
        p_collection_id, p_organization_slug, p_filename, p_file_type, p_file_size,
        p_file_hash, p_storage_path, p_created_by
    )
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;


--
-- Name: rag_insert_document(uuid, text, character varying, character varying, integer, character varying, text, uuid, text); Type: FUNCTION; Schema: rag_data; Owner: -
--

CREATE FUNCTION rag_data.rag_insert_document(p_collection_id uuid, p_organization_slug text, p_filename character varying, p_file_type character varying, p_file_size integer, p_file_hash character varying DEFAULT NULL::character varying, p_storage_path text DEFAULT NULL::text, p_created_by uuid DEFAULT NULL::uuid, p_content text DEFAULT NULL::text) RETURNS rag_data.rag_documents
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_collection_exists BOOLEAN;
    v_result rag_documents;
BEGIN
    -- Verify collection belongs to organization
    SELECT EXISTS(
        SELECT 1 FROM rag_data.rag_collections
        WHERE id = p_collection_id AND organization_slug = p_organization_slug
    ) INTO v_collection_exists;

    IF NOT v_collection_exists THEN
        RETURN NULL;
    END IF;

    INSERT INTO rag_data.rag_documents (
        collection_id, organization_slug, filename, file_type, file_size,
        file_hash, storage_path, created_by, content
    )
    VALUES (
        p_collection_id, p_organization_slug, p_filename, p_file_type, p_file_size,
        p_file_hash, p_storage_path, p_created_by, p_content
    )
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;


--
-- Name: rag_search(uuid, text, rag_data.vector, integer, double precision); Type: FUNCTION; Schema: rag_data; Owner: -
--

CREATE FUNCTION rag_data.rag_search(p_collection_id uuid, p_organization_slug text, p_query_embedding rag_data.vector, p_top_k integer DEFAULT 5, p_similarity_threshold double precision DEFAULT 0.5) RETURNS TABLE(chunk_id uuid, document_id uuid, document_filename character varying, content text, score double precision, page_number integer, chunk_index integer, char_offset integer, metadata jsonb)
    LANGUAGE sql STABLE
    SET search_path TO 'rag_data', 'public'
    AS $$
    SELECT
        c.id AS chunk_id,
        c.document_id,
        d.filename AS document_filename,
        c.content,
        1 - (c.embedding <=> p_query_embedding) AS score,
        c.page_number,
        c.chunk_index,
        c.char_offset,
        c.metadata
    FROM rag_document_chunks c
    JOIN rag_documents d ON c.document_id = d.id
    JOIN rag_collections col ON c.collection_id = col.id
    WHERE c.collection_id = p_collection_id
      AND col.organization_slug = p_organization_slug
      AND c.embedding IS NOT NULL
      AND 1 - (c.embedding <=> p_query_embedding) >= p_similarity_threshold
    ORDER BY c.embedding <=> p_query_embedding
    LIMIT p_top_k;
$$;


--
-- Name: rag_update_collection(uuid, text, character varying, text, text, uuid[], boolean); Type: FUNCTION; Schema: rag_data; Owner: -
--

CREATE FUNCTION rag_data.rag_update_collection(p_collection_id uuid, p_organization_slug text, p_name character varying DEFAULT NULL::character varying, p_description text DEFAULT NULL::text, p_required_role text DEFAULT NULL::text, p_allowed_users uuid[] DEFAULT NULL::uuid[], p_clear_allowed_users boolean DEFAULT false) RETURNS rag_data.rag_collections
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_result rag_data.rag_collections;
BEGIN
    UPDATE rag_data.rag_collections
    SET
        name = COALESCE(p_name, name),
        description = COALESCE(p_description, description),
        required_role = COALESCE(p_required_role, required_role),
        -- Handle allowed_users: explicit NULL clears, array updates, or keep existing
        allowed_users = CASE
            WHEN p_clear_allowed_users THEN NULL
            WHEN p_allowed_users IS NOT NULL THEN p_allowed_users
            ELSE allowed_users
        END,
        updated_at = NOW()
    WHERE id = p_collection_id
      AND organization_slug = p_organization_slug
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;


--
-- Name: rag_update_collection(uuid, text, character varying, text, text, uuid[], boolean, character varying); Type: FUNCTION; Schema: rag_data; Owner: -
--

CREATE FUNCTION rag_data.rag_update_collection(p_collection_id uuid, p_organization_slug text, p_name character varying DEFAULT NULL::character varying, p_description text DEFAULT NULL::text, p_required_role text DEFAULT NULL::text, p_allowed_users uuid[] DEFAULT NULL::uuid[], p_clear_allowed_users boolean DEFAULT false, p_complexity_type character varying DEFAULT NULL::character varying) RETURNS rag_data.rag_collections
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_result rag_data.rag_collections;
BEGIN
    UPDATE rag_data.rag_collections
    SET
        name = COALESCE(p_name, name),
        description = COALESCE(p_description, description),
        required_role = COALESCE(p_required_role, required_role),
        -- Handle allowed_users: explicit NULL clears, array updates, or keep existing
        allowed_users = CASE
            WHEN p_clear_allowed_users THEN NULL
            WHEN p_allowed_users IS NOT NULL THEN p_allowed_users
            ELSE allowed_users
        END,
        -- Handle complexity_type: update if provided, otherwise keep existing
        complexity_type = COALESCE(p_complexity_type, complexity_type),
        updated_at = NOW()
    WHERE id = p_collection_id
      AND organization_slug = p_organization_slug
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;


--
-- Name: rag_update_document_status(uuid, text, character varying, text, integer, integer); Type: FUNCTION; Schema: rag_data; Owner: -
--

CREATE FUNCTION rag_data.rag_update_document_status(p_document_id uuid, p_organization_slug text, p_status character varying, p_error_message text DEFAULT NULL::text, p_chunk_count integer DEFAULT NULL::integer, p_token_count integer DEFAULT NULL::integer) RETURNS rag_data.rag_documents
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_result rag_data.rag_documents;
BEGIN
    UPDATE rag_data.rag_documents
    SET
        status = p_status,
        error_message = p_error_message,
        chunk_count = COALESCE(p_chunk_count, chunk_count),
        token_count = COALESCE(p_token_count, token_count),
        processed_at = CASE WHEN p_status = 'completed' THEN NOW() ELSE processed_at END,
        updated_at = NOW()
    WHERE id = p_document_id
      AND organization_slug = p_organization_slug
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;


--
-- Name: rag_user_can_access_collection(uuid, uuid); Type: FUNCTION; Schema: rag_data; Owner: -
--

CREATE FUNCTION rag_data.rag_user_can_access_collection(p_collection_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_collection RECORD;
BEGIN
    SELECT allowed_users, created_by
    INTO v_collection
    FROM rag_data.rag_collections
    WHERE id = p_collection_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- NULL allowed_users = everyone in org can access
    IF v_collection.allowed_users IS NULL THEN
        RETURN TRUE;
    END IF;

    -- User is the creator
    IF v_collection.created_by = p_user_id THEN
        RETURN TRUE;
    END IF;

    -- User is in allowed_users array
    IF p_user_id = ANY(v_collection.allowed_users) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: rag_data; Owner: -
--

CREATE FUNCTION rag_data.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: calculate_correlations(uuid); Type: FUNCTION; Schema: risk; Owner: -
--

CREATE FUNCTION risk.calculate_correlations(p_scope_id uuid) RETURNS TABLE(dimension1_id uuid, dimension1_slug text, dimension1_name text, dimension2_id uuid, dimension2_slug text, dimension2_name text, correlation numeric, sample_size integer)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  WITH dimension_scores AS (
    SELECT
      a.subject_id,
      d.id AS dimension_id,
      d.slug AS dimension_slug,
      d.display_name AS dimension_name,
      a.score
    FROM risk.assessments a
    JOIN risk.dimensions d ON d.id = a.dimension_id
    WHERE d.scope_id = p_scope_id
      AND d.is_active = true
      AND d.is_test = false
      AND a.is_test = false
      -- Get latest assessment per subject-dimension
      AND a.id = (
        SELECT a2.id FROM risk.assessments a2
        WHERE a2.subject_id = a.subject_id
          AND a2.dimension_id = a.dimension_id
          AND a2.is_test = false
        ORDER BY a2.created_at DESC
        LIMIT 1
      )
  )
  SELECT
    ds1.dimension_id AS dimension1_id,
    ds1.dimension_slug AS dimension1_slug,
    ds1.dimension_name AS dimension1_name,
    ds2.dimension_id AS dimension2_id,
    ds2.dimension_slug AS dimension2_slug,
    ds2.dimension_name AS dimension2_name,
    ROUND(CORR(ds1.score, ds2.score)::NUMERIC, 3) AS correlation,
    COUNT(*)::INTEGER AS sample_size
  FROM dimension_scores ds1
  JOIN dimension_scores ds2 ON ds1.subject_id = ds2.subject_id
  WHERE ds1.dimension_slug < ds2.dimension_slug  -- Only upper triangle to avoid duplicates
  GROUP BY ds1.dimension_id, ds1.dimension_slug, ds1.dimension_name,
           ds2.dimension_id, ds2.dimension_slug, ds2.dimension_name
  HAVING COUNT(*) >= 3  -- Minimum sample size for meaningful correlation
  ORDER BY ABS(CORR(ds1.score, ds2.score)) DESC NULLS LAST;
END;
$$;


--
-- Name: get_articles_for_dimension(uuid, text, timestamp with time zone, integer); Type: FUNCTION; Schema: risk; Owner: -
--

CREATE FUNCTION risk.get_articles_for_dimension(p_scope_id uuid, p_dimension_slug text, p_since timestamp with time zone DEFAULT (now() - '24:00:00'::interval), p_limit integer DEFAULT 100) RETURNS TABLE(article_id uuid, source_id uuid, title text, content text, url text, published_at timestamp with time zone, confidence numeric, sentiment numeric, sentiment_label text, risk_indicators jsonb, subject_identifiers text[], classified_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id AS article_id,
    a.source_id,
    a.title,
    a.content,
    a.url,
    a.published_at,
    c.confidence,
    c.sentiment,
    c.sentiment_label,
    c.risk_indicators,
    c.subject_identifiers,
    c.created_at AS classified_at
  FROM crawler.articles a
  JOIN risk.article_classifications c ON c.article_id = a.id
  WHERE c.scope_id = p_scope_id
    AND p_dimension_slug = ANY(c.dimension_slugs)
    AND c.status = 'classified'
    AND c.created_at >= p_since
  ORDER BY a.published_at DESC NULLS LAST
  LIMIT p_limit;
END;
$$;


--
-- Name: get_articles_for_subject(uuid, text, timestamp with time zone, integer); Type: FUNCTION; Schema: risk; Owner: -
--

CREATE FUNCTION risk.get_articles_for_subject(p_scope_id uuid, p_subject_identifier text, p_since timestamp with time zone DEFAULT (now() - '24:00:00'::interval), p_limit integer DEFAULT 100) RETURNS TABLE(article_id uuid, source_id uuid, title text, content text, url text, published_at timestamp with time zone, dimension_slugs text[], confidence numeric, sentiment numeric, sentiment_label text, risk_indicators jsonb, subject_identifiers text[], classified_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id AS article_id,
    a.source_id,
    a.title,
    a.content,
    a.url,
    a.published_at,
    c.dimension_slugs,
    c.confidence,
    c.sentiment,
    c.sentiment_label,
    c.risk_indicators,
    c.subject_identifiers,
    c.created_at AS classified_at
  FROM crawler.articles a
  JOIN risk.article_classifications c ON c.article_id = a.id
  WHERE c.scope_id = p_scope_id
    AND (
      p_subject_identifier = ANY(c.subject_identifiers)
      OR UPPER(p_subject_identifier) = ANY(SELECT UPPER(unnest(c.subject_identifiers)))
    )
    AND c.status = 'classified'
    AND c.created_at >= p_since
  ORDER BY a.published_at DESC NULLS LAST
  LIMIT p_limit;
END;
$$;


--
-- Name: get_articles_for_subject_dimension(uuid, text, text, timestamp with time zone, integer); Type: FUNCTION; Schema: risk; Owner: -
--

CREATE FUNCTION risk.get_articles_for_subject_dimension(p_scope_id uuid, p_subject_identifier text, p_dimension_slug text, p_since timestamp with time zone DEFAULT (now() - '24:00:00'::interval), p_limit integer DEFAULT 100) RETURNS TABLE(article_id uuid, source_id uuid, title text, content text, url text, published_at timestamp with time zone, confidence numeric, sentiment numeric, sentiment_label text, risk_indicators jsonb, subject_identifiers text[], classified_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id AS article_id,
    a.source_id,
    a.title,
    a.content,
    a.url,
    a.published_at,
    c.confidence,
    c.sentiment,
    c.sentiment_label,
    c.risk_indicators,
    c.subject_identifiers,
    c.created_at AS classified_at
  FROM crawler.articles a
  JOIN risk.article_classifications c ON c.article_id = a.id
  WHERE c.scope_id = p_scope_id
    AND p_dimension_slug = ANY(c.dimension_slugs)
    AND (
      -- Match subject identifier (case-insensitive)
      p_subject_identifier = ANY(c.subject_identifiers)
      OR UPPER(p_subject_identifier) = ANY(SELECT UPPER(unnest(c.subject_identifiers)))
    )
    AND c.status = 'classified'
    AND c.created_at >= p_since
  ORDER BY a.published_at DESC NULLS LAST
  LIMIT p_limit;
END;
$$;


--
-- Name: get_classification_stats(uuid); Type: FUNCTION; Schema: risk; Owner: -
--

CREATE FUNCTION risk.get_classification_stats(p_scope_id uuid) RETURNS TABLE(total_articles bigint, classified_articles bigint, unclassified_articles bigint, classification_rate numeric, avg_dimensions_per_article numeric, sentiment_distribution jsonb, top_dimensions jsonb)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  WITH scope_articles AS (
    SELECT DISTINCT a.id
    FROM crawler.articles a
    JOIN risk.source_subscriptions ss ON ss.source_id = a.source_id
    WHERE ss.scope_id = p_scope_id
      AND ss.is_active = true
      AND a.is_duplicate = false
  ),
  stats AS (
    SELECT
      COUNT(DISTINCT sa.id) AS total,
      COUNT(DISTINCT c.article_id) AS classified
    FROM scope_articles sa
    LEFT JOIN risk.article_classifications c ON c.article_id = sa.id AND c.scope_id = p_scope_id
  ),
  sentiment_stats AS (
    SELECT jsonb_object_agg(sentiment_label, cnt) AS dist
    FROM (
      SELECT sentiment_label, COUNT(*) AS cnt
      FROM risk.article_classifications
      WHERE scope_id = p_scope_id AND sentiment_label IS NOT NULL
      GROUP BY sentiment_label
    ) s
  ),
  dimension_stats AS (
    SELECT jsonb_agg(jsonb_build_object('dimension', dim, 'count', cnt) ORDER BY cnt DESC) AS dims
    FROM (
      SELECT unnest(dimension_slugs) AS dim, COUNT(*) AS cnt
      FROM risk.article_classifications
      WHERE scope_id = p_scope_id
      GROUP BY unnest(dimension_slugs)
      ORDER BY cnt DESC
      LIMIT 10
    ) d
  )
  SELECT
    s.total,
    s.classified,
    s.total - s.classified,
    CASE WHEN s.total > 0 THEN ROUND(s.classified::NUMERIC / s.total * 100, 2) ELSE 0 END,
    (SELECT ROUND(AVG(array_length(dimension_slugs, 1)), 2) FROM risk.article_classifications WHERE scope_id = p_scope_id),
    COALESCE(ss.dist, '{}'::JSONB),
    COALESCE(ds.dims, '[]'::JSONB)
  FROM stats s
  CROSS JOIN sentiment_stats ss
  CROSS JOIN dimension_stats ds;
END;
$$;


--
-- Name: get_heatmap_data(uuid, text); Type: FUNCTION; Schema: risk; Owner: -
--

CREATE FUNCTION risk.get_heatmap_data(p_scope_id uuid, p_risk_level text DEFAULT NULL::text) RETURNS TABLE(subject_id uuid, subject_name text, subject_identifier text, subject_type text, dimensions jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id AS subject_id,
    s.name AS subject_name,
    s.identifier AS subject_identifier,
    s.subject_type,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'dimensionId', hd.dimension_id,
          'dimensionSlug', hd.dimension_slug,
          'dimensionName', hd.dimension_name,
          'icon', hd.dimension_icon,
          'color', hd.dimension_color,
          'score', hd.score,
          'confidence', hd.confidence,
          'riskLevel', hd.risk_level,
          'riskColor', hd.risk_color
        ) ORDER BY hd.display_order
      )
      FROM risk.heatmap_data hd
      WHERE hd.subject_id = s.id
        AND (p_risk_level IS NULL OR hd.risk_level = p_risk_level)
    ) AS dimensions
  FROM risk.subjects s
  WHERE s.scope_id = p_scope_id
    AND s.is_active = true
    AND s.is_test = false
  ORDER BY s.name;
END;
$$;


--
-- Name: get_new_articles_for_scope(uuid, integer); Type: FUNCTION; Schema: risk; Owner: -
--

CREATE FUNCTION risk.get_new_articles_for_scope(p_scope_id uuid, p_limit integer DEFAULT 100) RETURNS TABLE(article_id uuid, subscription_id uuid, source_id uuid, url text, title text, content text, summary text, content_hash text, published_at timestamp with time zone, first_seen_at timestamp with time zone, raw_data jsonb, dimension_mapping jsonb, subject_filter jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    rs.id as subscription_id,
    a.source_id,
    a.url,
    a.title,
    a.content,
    a.summary,
    a.content_hash,
    a.published_at,
    a.first_seen_at,
    a.raw_data,
    rs.dimension_mapping,
    rs.subject_filter
  FROM risk.source_subscriptions rs
  JOIN crawler.articles a ON a.source_id = rs.source_id
  WHERE rs.scope_id = p_scope_id
    AND rs.is_active = true
    AND a.first_seen_at > rs.last_processed_at
    AND a.is_test = false
  ORDER BY a.first_seen_at ASC
  LIMIT p_limit;
END;
$$;


--
-- Name: get_new_articles_for_subscription(uuid, integer); Type: FUNCTION; Schema: risk; Owner: -
--

CREATE FUNCTION risk.get_new_articles_for_subscription(p_subscription_id uuid, p_limit integer DEFAULT 100) RETURNS TABLE(article_id uuid, source_id uuid, url text, title text, content text, summary text, content_hash text, published_at timestamp with time zone, first_seen_at timestamp with time zone, raw_data jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  v_subscription RECORD;
BEGIN
  -- Get subscription details
  SELECT rs.source_id, rs.last_processed_at
  INTO v_subscription
  FROM risk.source_subscriptions rs
  WHERE rs.id = p_subscription_id
    AND rs.is_active = true;

  IF v_subscription IS NULL THEN
    RETURN;
  END IF;

  -- Return new articles since last processed
  RETURN QUERY
  SELECT
    a.id,
    a.source_id,
    a.url,
    a.title,
    a.content,
    a.summary,
    a.content_hash,
    a.published_at,
    a.first_seen_at,
    a.raw_data
  FROM crawler.articles a
  WHERE a.source_id = v_subscription.source_id
    AND a.first_seen_at > v_subscription.last_processed_at
    AND a.is_test = false
  ORDER BY a.first_seen_at ASC
  LIMIT p_limit;
END;
$$;


--
-- Name: get_scope_score_history(uuid, integer); Type: FUNCTION; Schema: risk; Owner: -
--

CREATE FUNCTION risk.get_scope_score_history(p_scope_id uuid, p_days integer DEFAULT 30) RETURNS TABLE(subject_id uuid, subject_name text, subject_identifier text, scores jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id AS subject_id,
    s.name AS subject_name,
    s.identifier AS subject_identifier,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'score', sh.overall_score,
          'confidence', sh.confidence,
          'change', sh.score_change,
          'created_at', sh.created_at
        ) ORDER BY sh.created_at DESC
      )
      FROM risk.score_history sh
      WHERE sh.subject_id = s.id
        AND sh.is_test = false
        AND sh.created_at >= NOW() - (p_days || ' days')::INTERVAL
    ) AS scores
  FROM risk.subjects s
  WHERE s.scope_id = p_scope_id
    AND s.is_active = true
    AND s.is_test = false;
END;
$$;


--
-- Name: get_score_history(uuid, integer, integer); Type: FUNCTION; Schema: risk; Owner: -
--

CREATE FUNCTION risk.get_score_history(p_subject_id uuid, p_days integer DEFAULT 30, p_limit integer DEFAULT 100) RETURNS TABLE(id uuid, overall_score integer, dimension_scores jsonb, confidence numeric, previous_score integer, score_change integer, score_change_percent numeric, debate_adjustment integer, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    sh.id,
    sh.overall_score,
    sh.dimension_scores,
    sh.confidence,
    sh.previous_score,
    sh.score_change,
    sh.score_change_percent,
    sh.debate_adjustment,
    sh.created_at
  FROM risk.score_history sh
  WHERE sh.subject_id = p_subject_id
    AND sh.is_test = false
    AND sh.created_at >= NOW() - (p_days || ' days')::INTERVAL
  ORDER BY sh.created_at DESC
  LIMIT p_limit;
END;
$$;


--
-- Name: get_subject_coverage(uuid, timestamp with time zone); Type: FUNCTION; Schema: risk; Owner: -
--

CREATE FUNCTION risk.get_subject_coverage(p_scope_id uuid, p_since timestamp with time zone DEFAULT (now() - '7 days'::interval)) RETURNS TABLE(subject_identifier text, article_count bigint, avg_sentiment numeric, dimension_coverage text[], latest_article timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  WITH subject_articles AS (
    SELECT
      unnest(c.subject_identifiers) AS subject,
      c.article_id,
      c.sentiment,
      c.dimension_slugs,
      c.created_at
    FROM risk.article_classifications c
    WHERE c.scope_id = p_scope_id
      AND c.status = 'classified'
      AND c.created_at >= p_since
      AND array_length(c.subject_identifiers, 1) > 0
  )
  SELECT
    sa.subject AS subject_identifier,
    COUNT(DISTINCT sa.article_id) AS article_count,
    ROUND(AVG(sa.sentiment), 3) AS avg_sentiment,
    ARRAY_AGG(DISTINCT unnest_dim ORDER BY unnest_dim) AS dimension_coverage,
    MAX(sa.created_at) AS latest_article
  FROM subject_articles sa,
       LATERAL unnest(sa.dimension_slugs) AS unnest_dim
  GROUP BY sa.subject
  ORDER BY COUNT(DISTINCT sa.article_id) DESC;
END;
$$;


--
-- Name: get_unclassified_articles(uuid, integer); Type: FUNCTION; Schema: risk; Owner: -
--

CREATE FUNCTION risk.get_unclassified_articles(p_scope_id uuid, p_limit integer DEFAULT 50) RETURNS TABLE(article_id uuid, source_id uuid, title text, content text, url text, published_at timestamp with time zone, first_seen_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id AS article_id,
    a.source_id,
    a.title,
    a.content,
    a.url,
    a.published_at,
    a.first_seen_at
  FROM crawler.articles a
  JOIN risk.source_subscriptions ss ON ss.source_id = a.source_id
  LEFT JOIN risk.article_classifications c ON c.article_id = a.id AND c.scope_id = p_scope_id
  WHERE c.id IS NULL
    AND ss.scope_id = p_scope_id
    AND ss.is_active = true
    AND a.is_duplicate = false
  ORDER BY a.published_at DESC NULLS LAST, a.first_seen_at DESC
  LIMIT p_limit;
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: risk; Owner: -
--

CREATE FUNCTION risk.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_data_sources_updated_at(); Type: FUNCTION; Schema: risk; Owner: -
--

CREATE FUNCTION risk.update_data_sources_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_executive_summaries_updated_at(); Type: FUNCTION; Schema: risk; Owner: -
--

CREATE FUNCTION risk.update_executive_summaries_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_reports_updated_at(); Type: FUNCTION; Schema: risk; Owner: -
--

CREATE FUNCTION risk.update_reports_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_scenarios_updated_at(); Type: FUNCTION; Schema: risk; Owner: -
--

CREATE FUNCTION risk.update_scenarios_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_subscription_watermark(uuid, timestamp with time zone); Type: FUNCTION; Schema: risk; Owner: -
--

CREATE FUNCTION risk.update_subscription_watermark(p_subscription_id uuid, p_last_processed_at timestamp with time zone DEFAULT now()) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE risk.source_subscriptions
  SET last_processed_at = p_last_processed_at
  WHERE id = p_subscription_id;
END;
$$;


--
-- Name: validate_dimension_weights(); Type: FUNCTION; Schema: risk; Owner: -
--

CREATE FUNCTION risk.validate_dimension_weights() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  total_weight NUMERIC;
BEGIN
  -- Calculate sum of all active dimension weights
  SELECT SUM(weight) INTO total_weight
  FROM risk.dimensions
  WHERE is_active = true;

  -- Allow small floating point tolerance (0.99 to 1.01)
  IF total_weight < 0.99 OR total_weight > 1.01 THEN
    RAISE EXCEPTION 'Dimension weights must sum to 1.0 (100%%). Current sum: %', total_weight;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: a2a_messages; Type: TABLE; Schema: ambient; Owner: -
--

CREATE TABLE ambient.a2a_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    direction text NOT NULL,
    external_agent_id text,
    method text,
    request_id text,
    request_payload jsonb,
    response_payload jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    rejection_reason text,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT a2a_messages_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))),
    CONSTRAINT a2a_messages_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'success'::text, 'error'::text, 'rejected'::text, 'rate_limited'::text])))
);


--
-- Name: adapter_state; Type: TABLE; Schema: ambient; Owner: -
--

CREATE TABLE ambient.adapter_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trigger_id uuid NOT NULL,
    adapter_type text NOT NULL,
    state jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: external_agents; Type: TABLE; Schema: ambient; Owner: -
--

CREATE TABLE ambient.external_agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    agent_id text NOT NULL,
    name text,
    description text,
    url text NOT NULL,
    version text DEFAULT '0.0.0'::text,
    agent_card jsonb,
    capabilities jsonb DEFAULT '[]'::jsonb,
    trust_score integer DEFAULT 0 NOT NULL,
    trust_level text DEFAULT 'unknown'::text NOT NULL,
    interactions_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'offline'::text NOT NULL,
    last_heartbeat timestamp with time zone,
    allowed_origin boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT external_agents_status_check CHECK ((status = ANY (ARRAY['online'::text, 'offline'::text, 'unknown'::text]))),
    CONSTRAINT external_agents_trust_level_check CHECK ((trust_level = ANY (ARRAY['unknown'::text, 'neutral'::text, 'trusted'::text, 'untrusted'::text]))),
    CONSTRAINT external_agents_trust_score_range CHECK (((trust_score >= 0) AND (trust_score <= 100)))
);


--
-- Name: trigger_executions; Type: TABLE; Schema: ambient; Owner: -
--

CREATE TABLE ambient.trigger_executions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trigger_id uuid NOT NULL,
    trigger_name text NOT NULL,
    source_type text NOT NULL,
    fired_at timestamp with time zone DEFAULT now() NOT NULL,
    source_event jsonb,
    condition_met boolean,
    action_taken boolean DEFAULT false NOT NULL,
    skip_reason text,
    execution_context jsonb,
    a2a_response jsonb,
    duration_ms integer,
    status text DEFAULT 'pending'::text NOT NULL,
    dedupe_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    product text DEFAULT 'pulse'::text NOT NULL,
    CONSTRAINT trigger_executions_skip_reason_check CHECK (((skip_reason IS NULL) OR (skip_reason = ANY (ARRAY['cooldown'::text, 'rate_limit'::text, 'condition_not_met'::text, 'duplicate'::text])))),
    CONSTRAINT trigger_executions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'fired'::text, 'skipped'::text, 'failed'::text, 'failed_permanent'::text, 'completed'::text, 'error'::text])))
);


--
-- Name: triggers; Type: TABLE; Schema: ambient; Owner: -
--

CREATE TABLE ambient.triggers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    name text NOT NULL,
    description text,
    source_type text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    source_config jsonb NOT NULL,
    condition jsonb,
    action_config jsonb NOT NULL,
    cooldown_seconds integer DEFAULT 0 NOT NULL,
    max_fires_per_hour integer,
    last_fired_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    product text DEFAULT 'pulse'::text NOT NULL,
    CONSTRAINT triggers_source_type_check CHECK ((source_type = ANY (ARRAY['cron'::text, 'database'::text, 'filesystem'::text, 'infrastructure'::text, 'log_pattern'::text, 'email'::text, 'browser'::text, 'external_data'::text, 'custom'::text, 'internal-a2a'::text, 'external-a2a'::text])))
);


--
-- Name: auth_identity_links; Type: TABLE; Schema: authz; Owner: -
--

CREATE TABLE authz.auth_identity_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    issuer text NOT NULL,
    subject text NOT NULL,
    email text,
    raw_claims jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: org_entitlements; Type: TABLE; Schema: authz; Owner: -
--

CREATE TABLE authz.org_entitlements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug character varying(255) NOT NULL,
    product character varying(100) NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    granted_by uuid,
    CONSTRAINT org_entitlements_product_check CHECK (((product)::text = ANY (ARRAY[('forge'::character varying)::text, ('compose'::character varying)::text, ('flow'::character varying)::text, ('pulse'::character varying)::text, ('bridge'::character varying)::text, ('assistant'::character varying)::text])))
);


--
-- Name: rbac_audit_log; Type: TABLE; Schema: authz; Owner: -
--

CREATE TABLE authz.rbac_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action character varying(50) NOT NULL,
    actor_id uuid,
    target_user_id uuid,
    target_role_id uuid,
    organization_slug character varying(255),
    details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rbac_permissions; Type: TABLE; Schema: authz; Owner: -
--

CREATE TABLE authz.rbac_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    display_name character varying(255) NOT NULL,
    description text,
    category character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rbac_role_permissions; Type: TABLE; Schema: authz; Owner: -
--

CREATE TABLE authz.rbac_role_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL,
    resource_type character varying(100),
    resource_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rbac_roles; Type: TABLE; Schema: authz; Owner: -
--

CREATE TABLE authz.rbac_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    display_name character varying(255) NOT NULL,
    description text,
    is_system boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rbac_user_org_roles; Type: TABLE; Schema: authz; Owner: -
--

CREATE TABLE authz.rbac_user_org_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organization_slug character varying(255) NOT NULL,
    role_id uuid NOT NULL,
    assigned_by uuid,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone
);


--
-- Name: users; Type: TABLE; Schema: authz; Owner: -
--

CREATE TABLE authz.users (
    id uuid NOT NULL,
    email character varying(255) NOT NULL,
    display_name character varying(255),
    organization_slug character varying(255),
    status character varying(50) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: quality_issues; Type: TABLE; Schema: code_ops; Owner: -
--

CREATE TABLE code_ops.quality_issues (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    app text NOT NULL,
    file_path text NOT NULL,
    line_number integer,
    column_number integer,
    issue_fingerprint text NOT NULL,
    error_type text NOT NULL,
    error_code text,
    rule_name text,
    message text NOT NULL,
    severity text DEFAULT 'error'::text,
    priority text DEFAULT 'medium'::text,
    is_auto_fixable boolean DEFAULT false,
    error_category text,
    status text DEFAULT 'open'::text,
    claimed_by text,
    claimed_at timestamp with time zone,
    fixed_at timestamp with time zone,
    fix_commit text,
    fix_approach text,
    scan_id uuid,
    last_seen_at timestamp with time zone,
    CONSTRAINT valid_app CHECK ((app = ANY (ARRAY['api'::text, 'web'::text, 'langgraph'::text, 'orch-flow'::text, 'notebook'::text]))),
    CONSTRAINT valid_error_type CHECK ((error_type = ANY (ARRAY['build'::text, 'lint'::text, 'test'::text]))),
    CONSTRAINT valid_priority CHECK ((priority = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text]))),
    CONSTRAINT valid_status CHECK ((status = ANY (ARRAY['open'::text, 'claimed'::text, 'fixing'::text, 'fixed'::text, 'wont_fix'::text])))
);


--
-- Name: codebase_health_daily; Type: VIEW; Schema: code_ops; Owner: -
--

CREATE VIEW code_ops.codebase_health_daily AS
 SELECT date(created_at) AS date,
    app,
    count(*) FILTER (WHERE ((error_type = 'build'::text) AND (status = 'open'::text))) AS open_build_errors,
    count(*) FILTER (WHERE ((error_type = 'lint'::text) AND (status = 'open'::text))) AS open_lint_errors,
    count(*) FILTER (WHERE ((error_type = 'test'::text) AND (status = 'open'::text))) AS open_test_failures,
    count(*) FILTER (WHERE ((status = 'fixed'::text) AND (date(fixed_at) = date(created_at)))) AS fixed_today
   FROM code_ops.quality_issues
  GROUP BY (date(created_at)), app;


--
-- Name: fix_attempts; Type: TABLE; Schema: code_ops; Owner: -
--

CREATE TABLE code_ops.fix_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    issue_id uuid,
    scan_id uuid,
    approach text NOT NULL,
    diff text,
    succeeded boolean,
    verified boolean,
    verification_output text,
    failure_reason text,
    will_retry boolean DEFAULT false
);


--
-- Name: pivot_learnings; Type: TABLE; Schema: code_ops; Owner: -
--

CREATE TABLE code_ops.pivot_learnings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    agent_type text NOT NULL,
    task_description text,
    file_path text,
    issue_id uuid,
    approach_tried text NOT NULL,
    tool_used text,
    failure_type text,
    failure_message text,
    new_approach text NOT NULL,
    why_pivot text,
    new_approach_worked boolean,
    lesson_learned text,
    applies_to text[]
);


--
-- Name: pivot_insights; Type: VIEW; Schema: code_ops; Owner: -
--

CREATE VIEW code_ops.pivot_insights AS
 SELECT failure_type,
    count(*) AS total_pivots,
    sum(
        CASE
            WHEN new_approach_worked THEN 1
            ELSE 0
        END) AS successful_pivots,
    round((avg(
        CASE
            WHEN new_approach_worked THEN 1.0
            ELSE 0.0
        END) * (100)::numeric), 1) AS success_rate_pct,
    ( SELECT array_agg(DISTINCT tags.tag) AS array_agg
           FROM ( SELECT unnest(pl2.applies_to) AS tag
                   FROM code_ops.pivot_learnings pl2
                  WHERE ((pl2.failure_type = pl.failure_type) AND (pl2.applies_to IS NOT NULL))) tags) AS common_tags
   FROM code_ops.pivot_learnings pl
  GROUP BY failure_type;


--
-- Name: scan_runs; Type: TABLE; Schema: code_ops; Owner: -
--

CREATE TABLE code_ops.scan_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    scan_type text NOT NULL,
    apps_scanned text[],
    repo text,
    branch text,
    commit_sha text,
    is_dirty boolean DEFAULT false,
    runner_id text,
    os text,
    node_version text,
    package_manager text,
    package_manager_version text,
    scanner_version text,
    build_errors_found integer DEFAULT 0,
    lint_errors_found integer DEFAULT 0,
    test_failures_found integer DEFAULT 0,
    total_issues integer DEFAULT 0,
    new_issues integer DEFAULT 0,
    fixed_since_last integer DEFAULT 0,
    duration_ms integer,
    triggered_by text
);


--
-- Name: companies; Type: TABLE; Schema: company; Owner: -
--

CREATE TABLE company.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    website text,
    industry text,
    size text,
    employee_count_range text,
    location text,
    founded_date date,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT companies_size_check CHECK ((size = ANY (ARRAY['startup'::text, 'small'::text, 'medium'::text, 'large'::text, 'enterprise'::text])))
);


--
-- Name: discovery_signals; Type: TABLE; Schema: company; Owner: -
--

CREATE TABLE company.discovery_signals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    signal_type text NOT NULL,
    signal_source text,
    signal_date date,
    signal_summary text,
    score_contribution integer DEFAULT 0,
    batch_date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT discovery_signals_signal_type_check CHECK ((signal_type = ANY (ARRAY['hiring'::text, 'funding'::text, 'press'::text, 'tech_stack'::text, 'executive_statement'::text, 'partnership'::text])))
);


--
-- Name: outreach; Type: TABLE; Schema: company; Owner: -
--

CREATE TABLE company.outreach (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    relevance_score integer,
    score_breakdown jsonb,
    company_fit_notes text,
    stretch_goal text,
    stretch_goal_source text,
    key_contact_name text,
    key_contact_title text,
    key_contact_linkedin text,
    key_contact_email text,
    status text DEFAULT 'discovered'::text NOT NULL,
    email_angle text,
    outreach_date date,
    response_summary text,
    research_file_id uuid,
    email_draft_file_id uuid,
    batch_date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT outreach_email_angle_check CHECK ((email_angle = ANY (ARRAY['process_automation'::text, 'stretch_goal'::text, 'the_unlock'::text]))),
    CONSTRAINT outreach_relevance_score_check CHECK (((relevance_score >= 1) AND (relevance_score <= 10))),
    CONSTRAINT outreach_status_check CHECK ((status = ANY (ARRAY['discovered'::text, 'researched'::text, 'drafted'::text, 'sent'::text, 'replied'::text, 'meeting'::text, 'qualified'::text, 'closed_won'::text, 'closed_lost'::text])))
);


--
-- Name: agent_article_outputs; Type: TABLE; Schema: crawler; Owner: -
--

CREATE TABLE crawler.agent_article_outputs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    article_id uuid NOT NULL,
    agent_type text NOT NULL,
    output_type text,
    output_id uuid,
    processed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: articles; Type: TABLE; Schema: crawler; Owner: -
--

CREATE TABLE crawler.articles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_slug text NOT NULL,
    source_id uuid NOT NULL,
    url text NOT NULL,
    title text,
    content text,
    summary text,
    author text,
    published_at timestamp with time zone,
    content_hash text NOT NULL,
    title_normalized text,
    key_phrases text[],
    fingerprint_hash text,
    raw_data jsonb,
    is_test boolean DEFAULT false NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    is_duplicate boolean DEFAULT false NOT NULL
);


--
-- Name: source_crawls; Type: TABLE; Schema: crawler; Owner: -
--

CREATE TABLE crawler.source_crawls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    crawl_duration_ms integer,
    status text DEFAULT 'running'::text NOT NULL,
    articles_found integer DEFAULT 0,
    articles_new integer DEFAULT 0,
    duplicates_exact integer DEFAULT 0,
    duplicates_cross_source integer DEFAULT 0,
    duplicates_fuzzy_title integer DEFAULT 0,
    duplicates_phrase_overlap integer DEFAULT 0,
    error_message text,
    retry_count integer DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT source_crawls_duplicates_cross_source_check CHECK ((duplicates_cross_source >= 0)),
    CONSTRAINT source_crawls_duplicates_exact_check CHECK ((duplicates_exact >= 0)),
    CONSTRAINT source_crawls_duplicates_fuzzy_title_check CHECK ((duplicates_fuzzy_title >= 0)),
    CONSTRAINT source_crawls_duplicates_phrase_overlap_check CHECK ((duplicates_phrase_overlap >= 0)),
    CONSTRAINT source_crawls_status_check CHECK ((status = ANY (ARRAY['running'::text, 'success'::text, 'error'::text, 'timeout'::text])))
);


--
-- Name: sources; Type: TABLE; Schema: crawler; Owner: -
--

CREATE TABLE crawler.sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_slug text NOT NULL,
    name text NOT NULL,
    description text,
    source_type text NOT NULL,
    url text NOT NULL,
    crawl_config jsonb DEFAULT '{"filters": {}, "selector": null, "extract_rules": {}, "wait_for_element": null}'::jsonb NOT NULL,
    auth_config jsonb,
    crawl_frequency_minutes integer DEFAULT 15 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_test boolean DEFAULT false NOT NULL,
    last_crawl_at timestamp with time zone,
    last_crawl_status text,
    last_error text,
    consecutive_errors integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sources_crawl_frequency_minutes_check CHECK ((crawl_frequency_minutes = ANY (ARRAY[5, 10, 15, 30, 60]))),
    CONSTRAINT sources_source_type_check CHECK ((source_type = ANY (ARRAY['web'::text, 'rss'::text, 'twitter_search'::text, 'api'::text, 'test_db'::text])))
);


--
-- Name: crawl_dedup_stats; Type: VIEW; Schema: crawler; Owner: -
--

CREATE VIEW crawler.crawl_dedup_stats AS
 SELECT sc.id AS crawl_id,
    sc.source_id,
    s.name AS source_name,
    s.organization_slug,
    sc.started_at,
    sc.completed_at,
    sc.status,
    sc.articles_found,
    sc.articles_new,
    sc.duplicates_exact,
    sc.duplicates_cross_source,
    sc.duplicates_fuzzy_title,
    sc.duplicates_phrase_overlap,
    crawler.calculate_total_duplicates(sc.duplicates_exact, sc.duplicates_cross_source, sc.duplicates_fuzzy_title, sc.duplicates_phrase_overlap) AS duplicates_total,
        CASE
            WHEN (sc.articles_found > 0) THEN round(((100.0 * (crawler.calculate_total_duplicates(sc.duplicates_exact, sc.duplicates_cross_source, sc.duplicates_fuzzy_title, sc.duplicates_phrase_overlap))::numeric) / (sc.articles_found)::numeric), 1)
            ELSE (0)::numeric
        END AS dedup_rate_percent,
    sc.crawl_duration_ms
   FROM (crawler.source_crawls sc
     JOIN crawler.sources s ON ((sc.source_id = s.id)));


--
-- Name: source_stats; Type: VIEW; Schema: crawler; Owner: -
--

CREATE VIEW crawler.source_stats AS
 SELECT id AS source_id,
    organization_slug,
    name,
    source_type,
    url,
    is_active,
    crawl_frequency_minutes,
    last_crawl_at,
    last_crawl_status,
    consecutive_errors,
    ( SELECT count(*) AS count
           FROM crawler.articles a
          WHERE (a.source_id = s.id)) AS article_count,
    ( SELECT count(*) AS count
           FROM crawler.source_crawls sc
          WHERE (sc.source_id = s.id)) AS crawl_count,
    ( SELECT count(*) AS count
           FROM crawler.source_crawls sc
          WHERE ((sc.source_id = s.id) AND (sc.status = 'success'::text))) AS successful_crawl_count
   FROM crawler.sources s;


--
-- Name: cad_outputs; Type: TABLE; Schema: engineering; Owner: -
--

CREATE TABLE engineering.cad_outputs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    drawing_id uuid NOT NULL,
    generated_code_id uuid,
    format text NOT NULL,
    storage_path text NOT NULL,
    file_size_bytes bigint,
    mesh_stats jsonb,
    export_time_ms integer,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT cad_outputs_format_check CHECK ((format = ANY (ARRAY['step'::text, 'stl'::text, 'gltf'::text, 'dxf'::text, 'thumbnail'::text])))
);


--
-- Name: drawings; Type: TABLE; Schema: engineering; Owner: -
--

CREATE TABLE engineering.drawings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    task_id uuid,
    conversation_id uuid,
    name text NOT NULL,
    description text,
    prompt text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    parent_drawing_id uuid,
    status text DEFAULT 'pending'::text,
    constraints_override jsonb,
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    created_by uuid,
    CONSTRAINT drawings_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'generating'::text, 'validating'::text, 'executing'::text, 'exporting'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: execution_log; Type: TABLE; Schema: engineering; Owner: -
--

CREATE TABLE engineering.execution_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    drawing_id uuid NOT NULL,
    step_type text NOT NULL,
    message text,
    details jsonb DEFAULT '{}'::jsonb,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT execution_log_step_type_check CHECK ((step_type = ANY (ARRAY['prompt_received'::text, 'constraints_applied'::text, 'llm_started'::text, 'llm_completed'::text, 'code_validation'::text, 'execution_started'::text, 'execution_completed'::text, 'execution_failed'::text, 'export_started'::text, 'export_completed'::text, 'error'::text])))
);


--
-- Name: generated_code; Type: TABLE; Schema: engineering; Owner: -
--

CREATE TABLE engineering.generated_code (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    drawing_id uuid NOT NULL,
    code text NOT NULL,
    code_type text DEFAULT 'opencascade-js'::text NOT NULL,
    llm_provider text NOT NULL,
    llm_model text NOT NULL,
    prompt_tokens integer,
    completion_tokens integer,
    generation_time_ms integer,
    is_valid boolean,
    validation_errors jsonb DEFAULT '[]'::jsonb,
    attempt_number integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT generated_code_code_type_check CHECK ((code_type = ANY (ARRAY['opencascade-js'::text, 'cadquery'::text])))
);


--
-- Name: part_library; Type: TABLE; Schema: engineering; Owner: -
--

CREATE TABLE engineering.part_library (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    name text NOT NULL,
    description text,
    category text NOT NULL,
    tags text[] DEFAULT ARRAY[]::text[],
    template_code text NOT NULL,
    parameters_schema jsonb NOT NULL,
    default_parameters jsonb NOT NULL,
    thumbnail_path text,
    preview_gltf_path text,
    use_count integer DEFAULT 0,
    is_public boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid
);


--
-- Name: projects; Type: TABLE; Schema: engineering; Owner: -
--

CREATE TABLE engineering.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    name text NOT NULL,
    description text,
    constraints jsonb DEFAULT '{"units": "mm", "material": "Aluminum 6061", "tolerance_class": "standard", "wall_thickness_min": 2.0, "manufacturing_method": "CNC"}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid
);


--
-- Name: analysis_tasks; Type: TABLE; Schema: law; Owner: -
--

CREATE TABLE law.analysis_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    organization_slug text NOT NULL,
    user_id uuid,
    document_type text,
    user_request text,
    clo_routing jsonb,
    status text DEFAULT 'pending'::text,
    risk_level text,
    synthesized_report text,
    approval_status text DEFAULT 'pending'::text,
    approver_id uuid,
    approval_notes text,
    approved_at timestamp with time zone,
    error_message text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT analysis_tasks_approval_status_check CHECK ((approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'changes_requested'::text]))),
    CONSTRAINT analysis_tasks_risk_level_check CHECK ((risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT analysis_tasks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'extracting'::text, 'routing'::text, 'analyzing'::text, 'synthesizing'::text, 'awaiting_approval'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: document_extractions; Type: TABLE; Schema: law; Owner: -
--

CREATE TABLE law.document_extractions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    analysis_task_id uuid NOT NULL,
    original_filename text NOT NULL,
    storage_path text NOT NULL,
    file_type text NOT NULL,
    file_size_bytes integer,
    mime_type text,
    page_count integer,
    extraction_method text NOT NULL,
    extracted_text text NOT NULL,
    confidence double precision,
    extraction_warnings text[],
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now(),
    document_type text,
    document_type_confidence numeric(5,4),
    detected_sections jsonb,
    has_signatures boolean DEFAULT false,
    signature_blocks jsonb,
    extracted_dates jsonb,
    extracted_parties jsonb,
    extraction_confidence numeric(5,4),
    extracted_amounts jsonb,
    detected_clauses jsonb,
    extracted_jurisdiction jsonb,
    document_language text DEFAULT 'en'::text,
    language_confidence numeric(5,4),
    has_redactions boolean DEFAULT false,
    redaction_regions jsonb,
    CONSTRAINT document_extractions_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision))),
    CONSTRAINT document_extractions_document_type_check CHECK ((document_type = ANY (ARRAY['contract'::text, 'nda'::text, 'msa'::text, 'sow'::text, 'employment'::text, 'lease'::text, 'license'::text, 'pleading'::text, 'motion'::text, 'brief'::text, 'correspondence'::text, 'memo'::text, 'policy'::text, 'compliance'::text, 'regulatory'::text, 'other'::text, 'unknown'::text]))),
    CONSTRAINT document_extractions_document_type_confidence_check CHECK (((document_type_confidence >= (0)::numeric) AND (document_type_confidence <= (1)::numeric))),
    CONSTRAINT document_extractions_extraction_confidence_check CHECK (((extraction_confidence >= (0)::numeric) AND (extraction_confidence <= (1)::numeric))),
    CONSTRAINT document_extractions_extraction_method_check CHECK ((extraction_method = ANY (ARRAY['pdf_text'::text, 'docx_parse'::text, 'vision_model'::text, 'ocr'::text, 'direct_read'::text]))),
    CONSTRAINT document_extractions_file_type_check CHECK ((file_type = ANY (ARRAY['pdf'::text, 'pdf_scanned'::text, 'docx'::text, 'doc'::text, 'image'::text, 'txt'::text, 'md'::text]))),
    CONSTRAINT document_extractions_language_confidence_check CHECK (((language_confidence >= (0)::numeric) AND (language_confidence <= (1)::numeric)))
);


--
-- Name: execution_steps; Type: TABLE; Schema: law; Owner: -
--

CREATE TABLE law.execution_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    analysis_task_id uuid NOT NULL,
    step_type text NOT NULL,
    step_name text NOT NULL,
    sequence integer NOT NULL,
    depends_on uuid[],
    status text DEFAULT 'pending'::text,
    input_data jsonb,
    output_data jsonb,
    error_message text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT execution_steps_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'skipped'::text]))),
    CONSTRAINT execution_steps_step_type_check CHECK ((step_type = ANY (ARRAY['document_upload'::text, 'document_extraction'::text, 'clo_routing'::text, 'specialist_analysis'::text, 'synthesis'::text, 'hitl_checkpoint'::text, 'report_generation'::text])))
);


--
-- Name: playbooks; Type: TABLE; Schema: law; Owner: -
--

CREATE TABLE law.playbooks (
    slug text NOT NULL,
    organization_slug text NOT NULL,
    name text NOT NULL,
    description text,
    document_type text NOT NULL,
    specialist_slug text NOT NULL,
    rules jsonb NOT NULL,
    is_active boolean DEFAULT true,
    version integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: specialist_outputs; Type: TABLE; Schema: law; Owner: -
--

CREATE TABLE law.specialist_outputs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    analysis_task_id uuid NOT NULL,
    specialist_slug text NOT NULL,
    status text DEFAULT 'pending'::text,
    extracted_data jsonb,
    risk_flags jsonb,
    recommendations jsonb,
    summary text,
    confidence double precision,
    llm_metadata jsonb,
    error_message text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT specialist_outputs_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision))),
    CONSTRAINT specialist_outputs_specialist_slug_check CHECK ((specialist_slug = ANY (ARRAY['contract'::text, 'compliance'::text, 'ip'::text, 'privacy'::text, 'employment'::text, 'corporate'::text, 'litigation'::text, 'real_estate'::text]))),
    CONSTRAINT specialist_outputs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'skipped'::text])))
);


--
-- Name: agent_idea_submissions; Type: TABLE; Schema: leads; Owner: -
--

CREATE TABLE leads.agent_idea_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    name text,
    company text,
    phone text,
    industry_input text NOT NULL,
    normalized_industry text,
    industry_description text,
    selected_agents jsonb DEFAULT '[]'::jsonb NOT NULL,
    all_recommendations jsonb,
    is_fallback boolean DEFAULT false,
    processing_time_ms integer,
    status text DEFAULT 'new'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    contacted_at timestamp with time zone,
    CONSTRAINT agent_idea_submissions_status_check CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'qualified'::text, 'converted'::text, 'closed'::text])))
);


--
-- Name: agent_llm_configs; Type: TABLE; Schema: marketing; Owner: -
--

CREATE TABLE marketing.agent_llm_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_slug text NOT NULL,
    llm_provider text NOT NULL,
    llm_model text NOT NULL,
    display_name text,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    is_local boolean DEFAULT false
);


--
-- Name: agents; Type: TABLE; Schema: marketing; Owner: -
--

CREATE TABLE marketing.agents (
    slug text NOT NULL,
    organization_slug text NOT NULL,
    role text NOT NULL,
    name text NOT NULL,
    personality jsonb NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT agents_role_check CHECK ((role = ANY (ARRAY['writer'::text, 'editor'::text, 'evaluator'::text])))
);


--
-- Name: content_types; Type: TABLE; Schema: marketing; Owner: -
--

CREATE TABLE marketing.content_types (
    slug text NOT NULL,
    organization_slug text NOT NULL,
    name text NOT NULL,
    description text,
    system_context text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: evaluations; Type: TABLE; Schema: marketing; Owner: -
--

CREATE TABLE marketing.evaluations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    output_id uuid NOT NULL,
    evaluator_agent_slug text,
    score integer,
    reasoning text,
    criteria_scores jsonb,
    llm_metadata jsonb,
    created_at timestamp with time zone DEFAULT now(),
    stage text DEFAULT 'initial'::text,
    status text DEFAULT 'pending'::text,
    rank integer,
    weighted_score integer,
    evaluator_llm_provider text,
    evaluator_llm_model text,
    CONSTRAINT evaluations_eval_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text]))),
    CONSTRAINT evaluations_rank_check CHECK (((rank IS NULL) OR ((rank >= 1) AND (rank <= 5)))),
    CONSTRAINT evaluations_score_check CHECK (((score >= 1) AND (score <= 10))),
    CONSTRAINT evaluations_stage_check CHECK ((stage = ANY (ARRAY['initial'::text, 'final'::text]))),
    CONSTRAINT evaluations_weighted_score_check CHECK (((weighted_score IS NULL) OR (weighted_score = ANY (ARRAY[100, 60, 30, 10, 5, 0]))))
);


--
-- Name: execution_queue; Type: TABLE; Schema: marketing; Owner: -
--

CREATE TABLE marketing.execution_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    step_type text NOT NULL,
    sequence integer NOT NULL,
    agent_slug text,
    depends_on uuid[],
    input_output_id uuid,
    status text DEFAULT 'pending'::text,
    result_id uuid,
    error_message text,
    provider text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    llm_provider text,
    llm_model text,
    CONSTRAINT execution_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'skipped'::text]))),
    CONSTRAINT execution_queue_step_type_check CHECK ((step_type = ANY (ARRAY['write'::text, 'edit'::text, 'evaluate'::text])))
);


--
-- Name: output_versions; Type: TABLE; Schema: marketing; Owner: -
--

CREATE TABLE marketing.output_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    output_id uuid NOT NULL,
    task_id uuid NOT NULL,
    version_number integer DEFAULT 1 NOT NULL,
    content text NOT NULL,
    action_type text NOT NULL,
    editor_feedback text,
    llm_metadata jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT output_versions_action_type_check CHECK ((action_type = ANY (ARRAY['write'::text, 'rewrite'::text])))
);


--
-- Name: outputs; Type: TABLE; Schema: marketing; Owner: -
--

CREATE TABLE marketing.outputs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    writer_agent_slug text,
    editor_agent_slug text,
    content text,
    edit_cycle integer DEFAULT 0,
    status text DEFAULT 'draft'::text,
    editor_feedback text,
    editor_approved boolean,
    llm_metadata jsonb,
    created_at timestamp with time zone DEFAULT now(),
    initial_avg_score numeric(3,1),
    initial_rank integer,
    is_finalist boolean DEFAULT false,
    final_total_score integer,
    final_rank integer,
    updated_at timestamp with time zone DEFAULT now(),
    writer_llm_provider text,
    writer_llm_model text,
    editor_llm_provider text,
    editor_llm_model text,
    CONSTRAINT outputs_status_check CHECK ((status = ANY (ARRAY['pending_write'::text, 'writing'::text, 'pending_edit'::text, 'editing'::text, 'pending_rewrite'::text, 'rewriting'::text, 'approved'::text, 'failed'::text, 'max_cycles_reached'::text])))
);


--
-- Name: swarm_tasks; Type: TABLE; Schema: marketing; Owner: -
--

CREATE TABLE marketing.swarm_tasks (
    task_id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_slug text NOT NULL,
    user_id uuid,
    conversation_id uuid,
    content_type_slug text,
    prompt_data jsonb NOT NULL,
    config jsonb NOT NULL,
    status text DEFAULT 'pending'::text,
    progress jsonb DEFAULT '{}'::jsonb,
    error_message text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT swarm_tasks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: channel_messages; Type: TABLE; Schema: orch_flow; Owner: -
--

CREATE TABLE orch_flow.channel_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel_id uuid NOT NULL,
    content text NOT NULL,
    user_id uuid,
    guest_name text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: channels; Type: TABLE; Schema: orch_flow; Owner: -
--

CREATE TABLE orch_flow.channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid,
    name text NOT NULL,
    description text,
    created_by_user_id uuid,
    created_by_guest text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: efforts; Type: TABLE; Schema: orch_flow; Owner: -
--

CREATE TABLE orch_flow.efforts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_slug text,
    name text NOT NULL,
    description text,
    status text DEFAULT 'not_started'::text,
    order_index integer DEFAULT 0 NOT NULL,
    icon text,
    color text,
    estimated_days integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    team_id uuid,
    CONSTRAINT efforts_status_check CHECK ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text])))
);


--
-- Name: journey_templates; Type: TABLE; Schema: orch_flow; Owner: -
--

CREATE TABLE orch_flow.journey_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    icon text,
    template_data jsonb NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: learning_progress; Type: TABLE; Schema: orch_flow; Owner: -
--

CREATE TABLE orch_flow.learning_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organization_slug text NOT NULL,
    milestone_key text NOT NULL,
    completed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: notifications; Type: TABLE; Schema: orch_flow; Owner: -
--

CREATE TABLE orch_flow.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    guest_name text,
    type text NOT NULL,
    task_id uuid,
    message text NOT NULL,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT notification_recipient CHECK (((user_id IS NOT NULL) OR (guest_name IS NOT NULL)))
);


--
-- Name: profiles; Type: TABLE; Schema: orch_flow; Owner: -
--

CREATE TABLE orch_flow.profiles (
    id uuid NOT NULL,
    display_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: projects; Type: TABLE; Schema: orch_flow; Owner: -
--

CREATE TABLE orch_flow.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    effort_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'not_started'::text,
    order_index integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT projects_status_check CHECK ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text, 'blocked'::text])))
);


--
-- Name: shared_tasks; Type: TABLE; Schema: orch_flow; Owner: -
--

CREATE TABLE orch_flow.shared_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid,
    title text NOT NULL,
    is_completed boolean DEFAULT false,
    assigned_to text,
    user_id uuid,
    status orch_flow.task_status DEFAULT 'today'::orch_flow.task_status NOT NULL,
    parent_task_id uuid,
    pomodoro_count integer DEFAULT 0,
    project_id uuid,
    sprint_id uuid,
    due_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    description text,
    channel_id uuid,
    source_channel_user_id uuid,
    external_provider text,
    external_task_id text
);


--
-- Name: sprints; Type: TABLE; Schema: orch_flow; Owner: -
--

CREATE TABLE orch_flow.sprints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid,
    name text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    is_active boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: task_collaborators; Type: TABLE; Schema: orch_flow; Owner: -
--

CREATE TABLE orch_flow.task_collaborators (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    user_id uuid,
    guest_name text,
    joined_at timestamp with time zone DEFAULT now(),
    CONSTRAINT collaborator_identity CHECK (((user_id IS NOT NULL) OR (guest_name IS NOT NULL)))
);


--
-- Name: task_update_requests; Type: TABLE; Schema: orch_flow; Owner: -
--

CREATE TABLE orch_flow.task_update_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    requested_by_user_id uuid,
    requested_by_guest text,
    message text,
    is_resolved boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT requester_identity CHECK (((requested_by_user_id IS NOT NULL) OR (requested_by_guest IS NOT NULL)))
);


--
-- Name: task_watchers; Type: TABLE; Schema: orch_flow; Owner: -
--

CREATE TABLE orch_flow.task_watchers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    user_id uuid,
    guest_name text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT watcher_identity CHECK (((user_id IS NOT NULL) OR (guest_name IS NOT NULL)))
);


--
-- Name: tasks; Type: TABLE; Schema: orch_flow; Owner: -
--

CREATE TABLE orch_flow.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'pending'::text,
    assignee_id uuid,
    due_date date,
    order_index integer DEFAULT 0 NOT NULL,
    documentation_url text,
    is_milestone boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT tasks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'blocked'::text, 'skipped'::text])))
);


--
-- Name: team_files; Type: TABLE; Schema: orch_flow; Owner: -
--

CREATE TABLE orch_flow.team_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    parent_id uuid,
    name text NOT NULL,
    is_folder boolean DEFAULT false NOT NULL,
    content text,
    file_type text DEFAULT 'markdown'::text NOT NULL,
    size_bytes integer DEFAULT 0 NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: timer_state; Type: TABLE; Schema: orch_flow; Owner: -
--

CREATE TABLE orch_flow.timer_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid,
    end_time timestamp with time zone,
    is_running boolean DEFAULT false,
    is_break boolean DEFAULT false,
    duration_seconds integer DEFAULT 1500,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_presence; Type: TABLE; Schema: orch_flow; Owner: -
--

CREATE TABLE orch_flow.user_presence (
    user_id uuid NOT NULL,
    last_active_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_self_modification_log; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.agent_self_modification_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    analyst_id uuid NOT NULL,
    modification_type text NOT NULL,
    summary text NOT NULL,
    details jsonb NOT NULL,
    trigger_reason text,
    performance_context jsonb,
    acknowledged boolean DEFAULT false NOT NULL,
    acknowledged_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_self_modification_log_modification_type_check CHECK ((modification_type = ANY (ARRAY['rule_added'::text, 'rule_removed'::text, 'rule_modified'::text, 'weight_changed'::text, 'journal_entry'::text, 'status_change'::text])))
);


--
-- Name: analyst_adaptation_diffs; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.analyst_adaptation_diffs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    analyst_id uuid NOT NULL,
    user_version_id uuid NOT NULL,
    agent_version_id uuid NOT NULL,
    diff_summary text NOT NULL,
    performance_comparison jsonb NOT NULL,
    adoption_status text DEFAULT 'pending'::text NOT NULL,
    adopted_changes jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT analyst_adaptation_diffs_adoption_status_check CHECK ((adoption_status = ANY (ARRAY['pending'::text, 'adopted'::text, 'rejected'::text, 'partial'::text])))
);


--
-- Name: analyst_assessments; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.analyst_assessments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    predictor_id uuid,
    prediction_id uuid,
    analyst_id uuid NOT NULL,
    llm_tier text NOT NULL,
    direction text NOT NULL,
    confidence numeric(3,2) NOT NULL,
    reasoning text NOT NULL,
    learnings_applied jsonb DEFAULT '[]'::jsonb,
    llm_usage_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    fork_type text DEFAULT 'user'::text,
    context_version_id uuid,
    CONSTRAINT analyst_assessments_check CHECK (((predictor_id IS NOT NULL) OR (prediction_id IS NOT NULL))),
    CONSTRAINT analyst_assessments_confidence_check CHECK (((confidence >= 0.00) AND (confidence <= 1.00))),
    CONSTRAINT analyst_assessments_llm_tier_check CHECK ((llm_tier = ANY (ARRAY['gold'::text, 'silver'::text, 'bronze'::text]))),
    CONSTRAINT chk_analyst_assessments_fork_type CHECK (((fork_type IS NULL) OR (fork_type = ANY (ARRAY['user'::text, 'agent'::text]))))
);


--
-- Name: analyst_overrides; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.analyst_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    analyst_id uuid NOT NULL,
    universe_id uuid,
    target_id uuid,
    weight_override numeric(3,2),
    tier_override text,
    is_enabled_override boolean,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT analyst_overrides_check CHECK (((universe_id IS NOT NULL) OR (target_id IS NOT NULL))),
    CONSTRAINT analyst_overrides_tier_override_check CHECK (((tier_override IS NULL) OR (tier_override = ANY (ARRAY['gold'::text, 'silver'::text, 'bronze'::text])))),
    CONSTRAINT analyst_overrides_weight_override_check CHECK (((weight_override IS NULL) OR ((weight_override >= 0.00) AND (weight_override <= 2.00))))
);


--
-- Name: analyst_performance_metrics; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.analyst_performance_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    analyst_id uuid NOT NULL,
    fork_type text NOT NULL,
    metric_date date NOT NULL,
    solo_pnl numeric(20,8) DEFAULT 0 NOT NULL,
    contribution_pnl numeric(20,8) DEFAULT 0 NOT NULL,
    dissent_accuracy numeric(5,4),
    dissent_count integer DEFAULT 0 NOT NULL,
    rank_in_portfolio integer,
    total_analysts integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT analyst_performance_metrics_fork_type_check CHECK ((fork_type = ANY (ARRAY['user'::text, 'agent'::text])))
);


--
-- Name: analyst_portfolios; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.analyst_portfolios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    analyst_id uuid NOT NULL,
    fork_type text DEFAULT 'user'::text NOT NULL,
    initial_balance numeric(20,8) DEFAULT 1000000.00 NOT NULL,
    current_balance numeric(20,8) DEFAULT 1000000.00 NOT NULL,
    total_realized_pnl numeric(20,8) DEFAULT 0 NOT NULL,
    total_unrealized_pnl numeric(20,8) DEFAULT 0 NOT NULL,
    win_count integer DEFAULT 0 NOT NULL,
    loss_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    status_changed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT analyst_portfolios_fork_type_check CHECK ((fork_type = ANY (ARRAY['user'::text, 'ai'::text, 'arbitrator'::text]))),
    CONSTRAINT analyst_portfolios_status_check CHECK ((status = ANY (ARRAY['active'::text, 'warning'::text, 'probation'::text, 'suspended'::text])))
);


--
-- Name: analyst_positions; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.analyst_positions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    portfolio_id uuid NOT NULL,
    analyst_assessment_id uuid,
    prediction_id uuid,
    target_id uuid NOT NULL,
    symbol text NOT NULL,
    direction text NOT NULL,
    quantity numeric(20,8) NOT NULL,
    entry_price numeric(20,8) NOT NULL,
    current_price numeric(20,8) NOT NULL,
    exit_price numeric(20,8),
    unrealized_pnl numeric(20,8) DEFAULT 0 NOT NULL,
    realized_pnl numeric(20,8),
    is_paper_only boolean DEFAULT false NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    fork_type text DEFAULT 'user'::text,
    CONSTRAINT analyst_positions_direction_check CHECK ((direction = ANY (ARRAY['long'::text, 'short'::text]))),
    CONSTRAINT analyst_positions_fork_type_check CHECK ((fork_type = ANY (ARRAY['user'::text, 'ai'::text, 'arbitrator'::text]))),
    CONSTRAINT analyst_positions_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT analyst_positions_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);


--
-- Name: analysts; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.analysts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope_level text DEFAULT 'runner'::text NOT NULL,
    domain text,
    universe_id uuid,
    target_id uuid,
    slug text NOT NULL,
    name text NOT NULL,
    perspective text NOT NULL,
    tier_instructions jsonb DEFAULT '{}'::jsonb,
    default_weight numeric(3,2) DEFAULT 1.00 NOT NULL,
    learned_patterns jsonb DEFAULT '[]'::jsonb,
    agent_id uuid,
    is_enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_test_data boolean DEFAULT false,
    test_scenario_id uuid,
    analyst_type text DEFAULT 'context_provider'::text NOT NULL,
    CONSTRAINT analysts_analyst_type_check CHECK ((analyst_type = ANY (ARRAY['personality'::text, 'context_provider'::text]))),
    CONSTRAINT analysts_check CHECK (((scope_level = 'runner'::text) OR (domain IS NOT NULL))),
    CONSTRAINT analysts_check1 CHECK (((scope_level = ANY (ARRAY['runner'::text, 'domain'::text])) OR (universe_id IS NOT NULL))),
    CONSTRAINT analysts_check2 CHECK (((scope_level <> 'target'::text) OR (target_id IS NOT NULL))),
    CONSTRAINT analysts_default_weight_check CHECK (((default_weight >= 0.00) AND (default_weight <= 2.00))),
    CONSTRAINT analysts_scope_level_check CHECK ((scope_level = ANY (ARRAY['runner'::text, 'domain'::text, 'universe'::text, 'target'::text])))
);


--
-- Name: daily_postmortem_recommendations; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.daily_postmortem_recommendations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    recommendation_type text NOT NULL,
    scope_level text NOT NULL,
    target_id uuid,
    target_symbol text,
    title text NOT NULL,
    rationale text NOT NULL,
    proposed_change jsonb DEFAULT '{}'::jsonb NOT NULL,
    confidence numeric(4,3) DEFAULT 0.5 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    action_source text,
    action_note text,
    actioned_by text,
    actioned_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: daily_postmortem_runs; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.daily_postmortem_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    agent_slug text NOT NULL,
    run_date date NOT NULL,
    status text DEFAULT 'completed'::text NOT NULL,
    summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    report_markdown text DEFAULT ''::text NOT NULL,
    report_html text DEFAULT ''::text NOT NULL,
    report_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: eod_settlement_log; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.eod_settlement_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    settlement_date date NOT NULL,
    queued_trades_executed integer DEFAULT 0 NOT NULL,
    analyst_positions_created integer DEFAULT 0 NOT NULL,
    predictions_resolved integer DEFAULT 0 NOT NULL,
    positions_closed integer DEFAULT 0 NOT NULL,
    unrealized_pnl_updated integer DEFAULT 0 NOT NULL,
    total_realized_pnl numeric(20,8) DEFAULT 0 NOT NULL,
    errors jsonb DEFAULT '[]'::jsonb NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: evaluations; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.evaluations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prediction_id uuid NOT NULL,
    direction_correct boolean NOT NULL,
    direction_score numeric(3,2) NOT NULL,
    magnitude_accuracy numeric(3,2),
    actual_magnitude text,
    timing_score numeric(3,2),
    analyst_scores jsonb NOT NULL,
    llm_tier_scores jsonb NOT NULL,
    overall_score numeric(3,2) NOT NULL,
    analysis text,
    suggested_learnings jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_test_data boolean DEFAULT false,
    test_scenario_id uuid,
    is_test boolean DEFAULT false NOT NULL
);


--
-- Name: fork_learning_exchanges; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.fork_learning_exchanges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    analyst_id uuid NOT NULL,
    initiated_by text NOT NULL,
    question text NOT NULL,
    response text,
    context_diff jsonb,
    performance_evidence jsonb,
    outcome text DEFAULT 'pending'::text NOT NULL,
    adoption_details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fork_learning_exchanges_initiated_by_check CHECK ((initiated_by = ANY (ARRAY['user'::text, 'agent'::text]))),
    CONSTRAINT fork_learning_exchanges_outcome_check CHECK ((outcome = ANY (ARRAY['adopted'::text, 'rejected'::text, 'noted'::text, 'pending'::text])))
);


--
-- Name: learning_lineage; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.learning_lineage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_slug text NOT NULL,
    test_learning_id uuid NOT NULL,
    production_learning_id uuid NOT NULL,
    scenario_runs uuid[] DEFAULT '{}'::uuid[],
    validation_metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    backtest_result jsonb,
    promoted_by uuid NOT NULL,
    promoted_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_learning_lineage_different CHECK ((test_learning_id <> production_learning_id))
);


--
-- Name: learning_queue; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.learning_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    suggested_scope_level text NOT NULL,
    suggested_domain text,
    suggested_universe_id uuid,
    suggested_target_id uuid,
    suggested_analyst_id uuid,
    suggested_learning_type text NOT NULL,
    suggested_title text NOT NULL,
    suggested_description text NOT NULL,
    suggested_config jsonb DEFAULT '{}'::jsonb,
    source_evaluation_id uuid,
    source_missed_opportunity_id uuid,
    ai_reasoning text NOT NULL,
    ai_confidence numeric(3,2) NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by_user_id uuid,
    reviewer_notes text,
    final_scope_level text,
    final_domain text,
    final_universe_id uuid,
    final_target_id uuid,
    final_analyst_id uuid,
    learning_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_test_data boolean DEFAULT false,
    test_scenario_id uuid,
    is_test boolean DEFAULT false NOT NULL,
    CONSTRAINT learning_queue_ai_confidence_check CHECK (((ai_confidence >= 0.00) AND (ai_confidence <= 1.00))),
    CONSTRAINT learning_queue_check CHECK (((status <> 'approved'::text) OR (learning_id IS NOT NULL))),
    CONSTRAINT learning_queue_final_scope_level_check CHECK (((final_scope_level IS NULL) OR (final_scope_level = ANY (ARRAY['runner'::text, 'domain'::text, 'universe'::text, 'target'::text])))),
    CONSTRAINT learning_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'modified'::text]))),
    CONSTRAINT learning_queue_suggested_learning_type_check CHECK ((suggested_learning_type = ANY (ARRAY['rule'::text, 'pattern'::text, 'weight_adjustment'::text, 'threshold'::text, 'avoid'::text]))),
    CONSTRAINT learning_queue_suggested_scope_level_check CHECK ((suggested_scope_level = ANY (ARRAY['runner'::text, 'domain'::text, 'universe'::text, 'target'::text])))
);


--
-- Name: learnings; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.learnings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope_level text DEFAULT 'runner'::text NOT NULL,
    domain text,
    universe_id uuid,
    target_id uuid,
    analyst_id uuid,
    learning_type text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb,
    source_type text DEFAULT 'human'::text NOT NULL,
    source_evaluation_id uuid,
    source_missed_opportunity_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    superseded_by uuid,
    version integer DEFAULT 1 NOT NULL,
    times_applied integer DEFAULT 0 NOT NULL,
    times_helpful integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_test_data boolean DEFAULT false,
    test_scenario_id uuid,
    is_test boolean DEFAULT false NOT NULL,
    CONSTRAINT learnings_check CHECK (((scope_level = 'runner'::text) OR (domain IS NOT NULL))),
    CONSTRAINT learnings_check1 CHECK (((scope_level = ANY (ARRAY['runner'::text, 'domain'::text])) OR (universe_id IS NOT NULL))),
    CONSTRAINT learnings_check2 CHECK (((scope_level <> 'target'::text) OR (target_id IS NOT NULL))),
    CONSTRAINT learnings_check3 CHECK (((status <> 'superseded'::text) OR (superseded_by IS NOT NULL))),
    CONSTRAINT learnings_check4 CHECK ((times_helpful <= times_applied)),
    CONSTRAINT learnings_learning_type_check CHECK ((learning_type = ANY (ARRAY['rule'::text, 'pattern'::text, 'weight_adjustment'::text, 'threshold'::text, 'avoid'::text]))),
    CONSTRAINT learnings_scope_level_check CHECK ((scope_level = ANY (ARRAY['runner'::text, 'domain'::text, 'universe'::text, 'target'::text]))),
    CONSTRAINT learnings_source_type_check CHECK ((source_type = ANY (ARRAY['human'::text, 'ai_suggested'::text, 'ai_approved'::text]))),
    CONSTRAINT learnings_status_check CHECK ((status = ANY (ARRAY['active'::text, 'superseded'::text, 'disabled'::text])))
);


--
-- Name: llm_models; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.llm_models (
    model_name text NOT NULL,
    provider_name text NOT NULL,
    display_name text,
    model_type text DEFAULT 'text-generation'::text,
    model_version text,
    context_window integer DEFAULT 4096,
    max_output_tokens integer DEFAULT 2048,
    model_parameters_json jsonb DEFAULT '{}'::jsonb,
    pricing_info_json jsonb DEFAULT '{}'::jsonb,
    capabilities jsonb DEFAULT '[]'::jsonb,
    model_tier text,
    speed_tier text DEFAULT 'medium'::text,
    loading_priority integer DEFAULT 5,
    is_local boolean DEFAULT false,
    is_currently_loaded boolean DEFAULT false,
    is_active boolean DEFAULT true,
    training_data_cutoff date,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    deprecation_reason text,
    deprecated_at timestamp with time zone,
    last_validated_at timestamp with time zone
);


--
-- Name: llm_tier_mapping; Type: VIEW; Schema: prediction; Owner: -
--

CREATE VIEW prediction.llm_tier_mapping AS
 SELECT model_name,
    provider_name AS provider,
    model_name AS model,
    model_tier,
        CASE model_tier
            WHEN 'flagship'::text THEN 'gold'::text
            WHEN 'standard'::text THEN 'silver'::text
            WHEN 'economy'::text THEN 'bronze'::text
            WHEN 'local'::text THEN 'bronze'::text
            ELSE 'bronze'::text
        END AS prediction_tier,
    is_active AS is_enabled,
    model_parameters_json AS metadata,
    created_at,
    updated_at
   FROM public.llm_models
  WHERE (is_active = true);


--
-- Name: missed_opportunities; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.missed_opportunities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_id uuid NOT NULL,
    move_type text NOT NULL,
    move_start_at timestamp with time zone NOT NULL,
    move_end_at timestamp with time zone NOT NULL,
    start_value numeric(20,8) NOT NULL,
    end_value numeric(20,8) NOT NULL,
    percent_change numeric(10,4) NOT NULL,
    detected_at timestamp with time zone DEFAULT now() NOT NULL,
    detection_method text NOT NULL,
    discovered_drivers jsonb DEFAULT '[]'::jsonb,
    signals_we_had jsonb DEFAULT '[]'::jsonb,
    signals_we_missed jsonb DEFAULT '[]'::jsonb,
    source_gaps jsonb DEFAULT '[]'::jsonb,
    suggested_learnings jsonb DEFAULT '[]'::jsonb,
    analysis_status text DEFAULT 'pending'::text NOT NULL,
    analysis_error text,
    llm_usage_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_test_data boolean DEFAULT false,
    test_scenario_id uuid,
    is_test boolean DEFAULT false NOT NULL,
    CONSTRAINT missed_opportunities_analysis_status_check CHECK ((analysis_status = ANY (ARRAY['pending'::text, 'analyzing'::text, 'complete'::text, 'failed'::text]))),
    CONSTRAINT missed_opportunities_move_type_check CHECK ((move_type = ANY (ARRAY['significant_up'::text, 'significant_down'::text, 'breakout'::text, 'breakdown'::text])))
);


--
-- Name: position_sizing_config; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.position_sizing_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text DEFAULT '*'::text NOT NULL,
    tier_name text NOT NULL,
    min_confidence numeric(4,2) NOT NULL,
    max_confidence numeric(4,2) NOT NULL,
    position_percent numeric(4,2) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: predictions; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.predictions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_id uuid NOT NULL,
    task_id uuid,
    direction text NOT NULL,
    confidence numeric(3,2) NOT NULL,
    magnitude text,
    reasoning text NOT NULL,
    timeframe_hours integer NOT NULL,
    predicted_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    entry_price numeric(20,8),
    target_price numeric(20,8),
    stop_loss numeric(20,8),
    analyst_ensemble jsonb NOT NULL,
    llm_ensemble jsonb NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    outcome_value numeric(20,8),
    outcome_captured_at timestamp with time zone,
    resolution_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_test_data boolean DEFAULT false,
    test_scenario_id uuid,
    is_test boolean DEFAULT false NOT NULL,
    scenario_run_id uuid,
    recommended_quantity numeric(20,8),
    quantity_reasoning text,
    runner_context_version_id uuid,
    analyst_context_version_ids jsonb DEFAULT '{}'::jsonb,
    universe_context_version_id uuid,
    target_context_version_id uuid,
    analyst_slug text,
    is_arbitrator boolean DEFAULT false,
    context_mode text DEFAULT 'combined'::text,
    CONSTRAINT predictions_confidence_check CHECK (((confidence >= 0.00) AND (confidence <= 1.00))),
    CONSTRAINT predictions_context_mode_check CHECK ((context_mode = ANY (ARRAY['user'::text, 'ai'::text, 'arbitrator'::text, 'combined'::text]))),
    CONSTRAINT predictions_magnitude_check CHECK (((magnitude IS NULL) OR (magnitude = ANY (ARRAY['small'::text, 'medium'::text, 'large'::text])))),
    CONSTRAINT predictions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'resolved'::text, 'expired'::text, 'cancelled'::text])))
);


--
-- Name: predictors; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.predictors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_id uuid NOT NULL,
    direction text NOT NULL,
    strength integer NOT NULL,
    confidence numeric(3,2) NOT NULL,
    reasoning text NOT NULL,
    analyst_slug text NOT NULL,
    analyst_assessment jsonb NOT NULL,
    llm_usage_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    consumed_at timestamp with time zone,
    consumed_by_prediction_id uuid,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_test_data boolean DEFAULT false,
    test_scenario_id uuid,
    is_test boolean DEFAULT false NOT NULL,
    scenario_run_id uuid,
    article_id uuid,
    fork_type text,
    CONSTRAINT predictors_check CHECK (((status <> 'consumed'::text) OR ((consumed_at IS NOT NULL) AND (consumed_by_prediction_id IS NOT NULL)))),
    CONSTRAINT predictors_confidence_check CHECK (((confidence >= 0.00) AND (confidence <= 1.00))),
    CONSTRAINT predictors_status_check CHECK ((status = ANY (ARRAY['active'::text, 'consumed'::text, 'expired'::text, 'invalidated'::text]))),
    CONSTRAINT predictors_strength_check CHECK (((strength >= 1) AND (strength <= 10)))
);


--
-- Name: replay_test_results; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.replay_test_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    replay_test_id uuid NOT NULL,
    target_id uuid,
    original_prediction_id uuid,
    original_direction text,
    original_confidence numeric(5,4),
    original_magnitude text,
    original_predicted_at timestamp with time zone,
    replay_prediction_id uuid,
    replay_direction text,
    replay_confidence numeric(5,4),
    replay_magnitude text,
    replay_predicted_at timestamp with time zone,
    direction_match boolean,
    confidence_diff numeric(5,4),
    evaluation_id uuid,
    actual_outcome text,
    actual_outcome_value numeric(20,8),
    original_correct boolean,
    replay_correct boolean,
    improvement boolean,
    pnl_original numeric(20,8),
    pnl_replay numeric(20,8),
    pnl_diff numeric(20,8),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: replay_test_snapshots; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.replay_test_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    replay_test_id uuid NOT NULL,
    table_name text NOT NULL,
    original_data jsonb NOT NULL,
    record_ids uuid[] NOT NULL,
    row_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT replay_test_snapshots_table_name_check CHECK ((table_name = ANY (ARRAY['signals'::text, 'predictors'::text, 'predictions'::text, 'analyst_assessments'::text])))
);


--
-- Name: replay_test_summary; Type: VIEW; Schema: prediction; Owner: -
--

CREATE VIEW prediction.replay_test_summary AS
SELECT
    NULL::uuid AS id,
    NULL::text AS organization_slug,
    NULL::text AS name,
    NULL::text AS description,
    NULL::text AS status,
    NULL::text AS rollback_depth,
    NULL::timestamp with time zone AS rollback_to,
    NULL::uuid AS universe_id,
    NULL::uuid[] AS target_ids,
    NULL::text AS created_by,
    NULL::timestamp with time zone AS created_at,
    NULL::timestamp with time zone AS started_at,
    NULL::timestamp with time zone AS completed_at,
    NULL::text AS error_message,
    NULL::bigint AS total_comparisons,
    NULL::bigint AS direction_matches,
    NULL::bigint AS original_correct_count,
    NULL::bigint AS replay_correct_count,
    NULL::bigint AS improvements,
    NULL::numeric AS original_accuracy_pct,
    NULL::numeric AS replay_accuracy_pct,
    NULL::numeric AS total_pnl_original,
    NULL::numeric AS total_pnl_replay,
    NULL::numeric AS total_pnl_improvement,
    NULL::numeric AS avg_confidence_diff;


--
-- Name: replay_tests; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.replay_tests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_slug text NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'pending'::text NOT NULL,
    rollback_depth text DEFAULT 'predictions'::text NOT NULL,
    rollback_to timestamp with time zone NOT NULL,
    universe_id uuid,
    target_ids uuid[],
    config jsonb DEFAULT '{}'::jsonb,
    results jsonb,
    error_message text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    CONSTRAINT replay_tests_rollback_depth_check CHECK ((rollback_depth = ANY (ARRAY['predictions'::text, 'predictors'::text, 'signals'::text]))),
    CONSTRAINT replay_tests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'snapshot_created'::text, 'running'::text, 'completed'::text, 'failed'::text, 'restored'::text])))
);


--
-- Name: review_queue; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.review_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    signal_id uuid NOT NULL,
    original_direction text NOT NULL,
    original_confidence numeric(3,2) NOT NULL,
    original_reasoning text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by_user_id uuid,
    response_direction text,
    response_strength integer,
    response_notes text,
    create_learning boolean DEFAULT false,
    predictor_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_test_data boolean DEFAULT false,
    test_scenario_id uuid,
    CONSTRAINT review_queue_original_confidence_check CHECK (((original_confidence >= 0.00) AND (original_confidence <= 1.00))),
    CONSTRAINT review_queue_response_strength_check CHECK (((response_strength IS NULL) OR ((response_strength >= 1) AND (response_strength <= 10)))),
    CONSTRAINT review_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'modified'::text])))
);


--
-- Name: runner_context_versions; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.runner_context_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    runner_type text NOT NULL,
    version_number integer DEFAULT 1 NOT NULL,
    context text,
    model_config jsonb DEFAULT '{}'::jsonb,
    learning_config jsonb DEFAULT '{}'::jsonb,
    risk_profile text DEFAULT 'moderate'::text,
    change_reason text,
    changed_by text DEFAULT 'system'::text NOT NULL,
    is_current boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT runner_context_versions_changed_by_check CHECK ((changed_by = ANY (ARRAY['system'::text, 'user'::text, 'learning_loop'::text])))
);


--
-- Name: scenario_runs; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.scenario_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_slug text NOT NULL,
    scenario_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    triggered_by uuid,
    version_info jsonb DEFAULT '{}'::jsonb NOT NULL,
    outcome_expected jsonb DEFAULT '{}'::jsonb NOT NULL,
    outcome_actual jsonb,
    outcome_match boolean,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_scenario_runs_completed CHECK ((((status = ANY (ARRAY['completed'::text, 'failed'::text])) AND (completed_at IS NOT NULL)) OR (status <> ALL (ARRAY['completed'::text, 'failed'::text])))),
    CONSTRAINT chk_scenario_runs_status CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: signals; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.signals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_id uuid NOT NULL,
    source_id uuid NOT NULL,
    content text NOT NULL,
    direction text NOT NULL,
    detected_at timestamp with time zone DEFAULT now() NOT NULL,
    url text,
    metadata jsonb DEFAULT '{}'::jsonb,
    disposition text DEFAULT 'pending'::text NOT NULL,
    urgency text,
    processing_worker uuid,
    processing_started_at timestamp with time zone,
    evaluation_result jsonb,
    review_queue_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expired_at timestamp with time zone,
    is_test_data boolean DEFAULT false,
    test_scenario_id uuid,
    is_test boolean DEFAULT false NOT NULL,
    scenario_run_id uuid,
    CONSTRAINT signals_disposition_check CHECK ((disposition = ANY (ARRAY['pending'::text, 'processing'::text, 'predictor_created'::text, 'rejected'::text, 'review_pending'::text, 'expired'::text]))),
    CONSTRAINT signals_urgency_check CHECK (((urgency IS NULL) OR (urgency = ANY (ARRAY['urgent'::text, 'notable'::text, 'routine'::text]))))
);


--
-- Name: snapshots; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prediction_id uuid NOT NULL,
    predictors jsonb NOT NULL,
    rejected_signals jsonb DEFAULT '[]'::jsonb,
    analyst_predictions jsonb NOT NULL,
    llm_ensemble jsonb NOT NULL,
    learnings_applied jsonb DEFAULT '[]'::jsonb,
    threshold_evaluation jsonb NOT NULL,
    timeline jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_test_data boolean DEFAULT false,
    test_scenario_id uuid
);


--
-- Name: source_subscriptions; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.source_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_id uuid NOT NULL,
    target_id uuid NOT NULL,
    universe_id uuid NOT NULL,
    filter_config jsonb DEFAULT '{"keywords_exclude": [], "keywords_include": [], "min_relevance_score": 0.5}'::jsonb,
    last_processed_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: strategies; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.strategies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    risk_level text NOT NULL,
    thresholds jsonb DEFAULT '{"min_predictors": 3, "signal_ttl_hours": 48, "predictor_ttl_hours": 72, "min_combined_strength": 15, "review_confidence_max": 0.70, "review_confidence_min": 0.40, "min_direction_consensus": 0.7, "urgent_confidence_threshold": 0.90, "notable_confidence_threshold": 0.70}'::jsonb NOT NULL,
    analyst_weights jsonb DEFAULT '{}'::jsonb,
    is_system boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_test_data boolean DEFAULT false,
    test_scenario_id uuid,
    CONSTRAINT strategies_risk_level_check CHECK ((risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])))
);


--
-- Name: targets; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.targets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    universe_id uuid NOT NULL,
    symbol text NOT NULL,
    name text NOT NULL,
    target_type text NOT NULL,
    context text,
    metadata jsonb DEFAULT '{}'::jsonb,
    llm_config_override jsonb,
    is_active boolean DEFAULT true NOT NULL,
    is_archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_test_data boolean DEFAULT false,
    test_scenario_id uuid,
    current_price numeric,
    price_updated_at timestamp with time zone
);


--
-- Name: universes; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.universes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_slug text NOT NULL,
    agent_slug text NOT NULL,
    name text NOT NULL,
    description text,
    domain text NOT NULL,
    strategy_id uuid,
    llm_config jsonb,
    thresholds jsonb,
    notification_config jsonb DEFAULT '{"channels": ["push", "email"], "urgent_enabled": true, "outcome_enabled": true, "new_prediction_enabled": true}'::jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_test_data boolean DEFAULT false,
    test_scenario_id uuid,
    CONSTRAINT universes_domain_check CHECK ((domain = ANY (ARRAY['stocks'::text, 'crypto'::text, 'elections'::text, 'polymarket'::text])))
);


--
-- Name: subscription_stats; Type: VIEW; Schema: prediction; Owner: -
--

CREATE VIEW prediction.subscription_stats AS
 SELECT ps.id AS subscription_id,
    ps.source_id,
    cs.name AS source_name,
    cs.url AS source_url,
    ps.target_id,
    t.symbol AS target_symbol,
    t.name AS target_name,
    ps.universe_id,
    u.name AS universe_name,
    ps.is_active,
    ps.last_processed_at,
    ( SELECT count(*) AS count
           FROM crawler.articles a
          WHERE ((a.source_id = ps.source_id) AND (a.first_seen_at > ps.last_processed_at))) AS pending_articles,
    ( SELECT count(*) AS count
           FROM (crawler.agent_article_outputs aao
             JOIN crawler.articles a ON ((aao.article_id = a.id)))
          WHERE ((a.source_id = ps.source_id) AND (aao.agent_type = 'prediction'::text))) AS processed_articles
   FROM (((prediction.source_subscriptions ps
     JOIN crawler.sources cs ON ((ps.source_id = cs.id)))
     JOIN prediction.targets t ON ((ps.target_id = t.id)))
     JOIN prediction.universes u ON ((ps.universe_id = u.id)));


--
-- Name: target_context_versions; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.target_context_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_id uuid NOT NULL,
    version_number integer DEFAULT 1 NOT NULL,
    context text,
    metadata jsonb DEFAULT '{}'::jsonb,
    llm_config_override jsonb,
    change_reason text,
    changed_by text DEFAULT 'system'::text NOT NULL,
    is_current boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT target_context_versions_changed_by_check CHECK ((changed_by = ANY (ARRAY['system'::text, 'user'::text, 'learning_loop'::text])))
);


--
-- Name: target_snapshots; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.target_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_id uuid NOT NULL,
    value numeric(20,8) NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_test_data boolean DEFAULT false,
    test_scenario_id uuid,
    is_test boolean DEFAULT false NOT NULL,
    value_type text DEFAULT 'price'::text NOT NULL,
    source text DEFAULT 'other'::text NOT NULL,
    CONSTRAINT chk_target_snapshots_source CHECK ((source = ANY (ARRAY['polygon'::text, 'coingecko'::text, 'coinmarketcap'::text, 'polymarket'::text, 'manual'::text, 'other'::text]))),
    CONSTRAINT chk_target_snapshots_value_type CHECK ((value_type = ANY (ARRAY['price'::text, 'probability'::text, 'index'::text, 'other'::text])))
);


--
-- Name: test_articles; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.test_articles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_slug text NOT NULL,
    scenario_id uuid,
    title text NOT NULL,
    content text NOT NULL,
    source_name text DEFAULT 'synthetic_news'::text NOT NULL,
    published_at timestamp with time zone NOT NULL,
    target_symbols text[] DEFAULT '{}'::text[] NOT NULL,
    sentiment_expected text,
    strength_expected numeric(3,2),
    is_synthetic boolean DEFAULT true NOT NULL,
    synthetic_marker text DEFAULT '[SYNTHETIC TEST CONTENT]'::text,
    processed boolean DEFAULT false NOT NULL,
    processed_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT chk_test_articles_sentiment CHECK (((sentiment_expected IS NULL) OR (sentiment_expected = ANY (ARRAY['positive'::text, 'negative'::text, 'neutral'::text])))),
    CONSTRAINT chk_test_articles_strength CHECK (((strength_expected IS NULL) OR ((strength_expected >= 0.00) AND (strength_expected <= 1.00))))
);


--
-- Name: test_audit_log; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.test_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_slug text NOT NULL,
    user_id uuid NOT NULL,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id uuid NOT NULL,
    details jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_test_audit_log_action CHECK ((action = ANY (ARRAY['scenario_created'::text, 'scenario_updated'::text, 'scenario_deleted'::text, 'scenario_run_started'::text, 'scenario_run_completed'::text, 'scenario_run_failed'::text, 'article_created'::text, 'article_updated'::text, 'article_deleted'::text, 'article_generated'::text, 'price_data_created'::text, 'price_data_bulk_imported'::text, 'learning_promoted'::text, 'learning_rejected'::text, 'learning_validation_started'::text, 'backtest_started'::text, 'backtest_completed'::text, 'test_mode_enabled'::text, 'test_mode_disabled'::text, 'test_data_purged'::text]))),
    CONSTRAINT chk_test_audit_log_resource_type CHECK ((resource_type = ANY (ARRAY['test_scenario'::text, 'scenario_run'::text, 'test_article'::text, 'test_price_data'::text, 'learning'::text, 'backtest'::text, 'test_mode'::text, 'bulk_operation'::text])))
);


--
-- Name: test_price_data; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.test_price_data (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_slug text NOT NULL,
    scenario_id uuid,
    symbol text NOT NULL,
    price_timestamp timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume bigint DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT chk_test_price_data_high_low CHECK ((high >= low)),
    CONSTRAINT chk_test_price_data_ohlc CHECK (((high >= open) AND (high >= close) AND (low <= open) AND (low <= close))),
    CONSTRAINT chk_test_price_data_symbol CHECK ((symbol ~~ 'T_%'::text))
);


--
-- Name: test_scenarios; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.test_scenarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    injection_points text[] NOT NULL,
    target_id uuid,
    organization_slug text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb,
    created_by text,
    status text DEFAULT 'active'::text NOT NULL,
    results jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    scenario_type text DEFAULT 'custom'::text,
    expected_outcome jsonb DEFAULT '{}'::jsonb,
    target_symbols text[] DEFAULT '{}'::text[],
    tags text[] DEFAULT '{}'::text[],
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chk_test_scenarios_type CHECK ((scenario_type = ANY (ARRAY['earnings_beat'::text, 'earnings_miss'::text, 'macro_shock'::text, 'mixed_news'::text, 'ambiguous_language'::text, 'entity_collision'::text, 'noisy_irrelevant'::text, 'price_only'::text, 'multi_target'::text, 'scheduled_ingestion'::text, 'leakage_attempt'::text, 'promotion_happy'::text, 'promotion_rejection'::text, 'mirror_creation'::text, 'custom'::text]))),
    CONSTRAINT test_scenarios_status_check CHECK ((status = ANY (ARRAY['active'::text, 'running'::text, 'completed'::text, 'failed'::text, 'archived'::text])))
);


--
-- Name: test_scenario_summary; Type: VIEW; Schema: prediction; Owner: -
--

CREATE VIEW prediction.test_scenario_summary AS
 WITH counts AS (
         SELECT signals.test_scenario_id,
            'signals'::text AS table_name,
            count(*) AS row_count
           FROM prediction.signals
          WHERE (signals.is_test_data = true)
          GROUP BY signals.test_scenario_id
        UNION ALL
         SELECT predictors.test_scenario_id,
            'predictors'::text AS table_name,
            count(*) AS row_count
           FROM prediction.predictors
          WHERE (predictors.is_test_data = true)
          GROUP BY predictors.test_scenario_id
        UNION ALL
         SELECT predictions.test_scenario_id,
            'predictions'::text AS table_name,
            count(*) AS row_count
           FROM prediction.predictions
          WHERE (predictions.is_test_data = true)
          GROUP BY predictions.test_scenario_id
        UNION ALL
         SELECT evaluations.test_scenario_id,
            'evaluations'::text AS table_name,
            count(*) AS row_count
           FROM prediction.evaluations
          WHERE (evaluations.is_test_data = true)
          GROUP BY evaluations.test_scenario_id
        )
 SELECT ts.id,
    ts.name,
    ts.organization_slug,
    ts.status,
    ts.created_at,
    ts.started_at,
    ts.completed_at,
    COALESCE(jsonb_object_agg(c.table_name, c.row_count) FILTER (WHERE (c.table_name IS NOT NULL)), '{}'::jsonb) AS data_counts
   FROM (prediction.test_scenarios ts
     LEFT JOIN counts c ON ((c.test_scenario_id = ts.id)))
  GROUP BY ts.id, ts.name, ts.organization_slug, ts.status, ts.created_at, ts.started_at, ts.completed_at;


--
-- Name: test_target_mirrors; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.test_target_mirrors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    real_target_id uuid NOT NULL,
    test_target_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_different_targets CHECK ((real_target_id <> test_target_id))
);


--
-- Name: tool_requests; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.tool_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    universe_id uuid NOT NULL,
    tool_type text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    source_type text,
    suggested_config jsonb,
    missed_opportunity_id uuid,
    status text DEFAULT 'wishlist'::text NOT NULL,
    user_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_test_data boolean DEFAULT false,
    test_scenario_id uuid,
    priority text DEFAULT 'medium'::text NOT NULL,
    rationale text,
    resolved_at timestamp with time zone,
    resolved_by_user_id uuid,
    resolution_notes text,
    name text NOT NULL,
    CONSTRAINT tool_requests_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT tool_requests_status_check CHECK ((status = ANY (ARRAY['wishlist'::text, 'planned'::text, 'in_progress'::text, 'done'::text, 'rejected'::text]))),
    CONSTRAINT tool_requests_tool_type_check CHECK ((tool_type = ANY (ARRAY['source'::text, 'integration'::text, 'analyst'::text, 'other'::text])))
);


--
-- Name: universe_context_versions; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.universe_context_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    universe_id uuid NOT NULL,
    version_number integer DEFAULT 1 NOT NULL,
    description text,
    llm_config jsonb DEFAULT '{}'::jsonb,
    thresholds jsonb DEFAULT '{}'::jsonb,
    change_reason text,
    changed_by text DEFAULT 'system'::text NOT NULL,
    is_current boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT universe_context_versions_changed_by_check CHECK ((changed_by = ANY (ARRAY['system'::text, 'user'::text, 'learning_loop'::text])))
);


--
-- Name: user_portfolios; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.user_portfolios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    org_slug text NOT NULL,
    initial_balance numeric(20,8) DEFAULT 1000000.00 NOT NULL,
    current_balance numeric(20,8) DEFAULT 1000000.00 NOT NULL,
    total_realized_pnl numeric(20,8) DEFAULT 0 NOT NULL,
    total_unrealized_pnl numeric(20,8) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_positions; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.user_positions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    portfolio_id uuid NOT NULL,
    prediction_id uuid NOT NULL,
    target_id uuid NOT NULL,
    symbol text NOT NULL,
    direction text NOT NULL,
    quantity numeric(20,8) NOT NULL,
    entry_price numeric(20,8) NOT NULL,
    current_price numeric(20,8) NOT NULL,
    exit_price numeric(20,8),
    unrealized_pnl numeric(20,8) DEFAULT 0 NOT NULL,
    realized_pnl numeric(20,8),
    status text DEFAULT 'open'::text NOT NULL,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_positions_direction_check CHECK ((direction = ANY (ARRAY['long'::text, 'short'::text]))),
    CONSTRAINT user_positions_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT user_positions_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);


--
-- Name: user_trade_queue; Type: TABLE; Schema: prediction; Owner: -
--

CREATE TABLE prediction.user_trade_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    org_slug text NOT NULL,
    portfolio_id uuid NOT NULL,
    prediction_id uuid NOT NULL,
    target_id uuid NOT NULL,
    symbol text NOT NULL,
    direction text NOT NULL,
    quantity numeric(20,8) NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    executed_position_id uuid,
    execution_price numeric(20,8),
    executed_at timestamp with time zone,
    queued_at timestamp with time zone DEFAULT now() NOT NULL,
    cancelled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_trade_queue_direction_check CHECK ((direction = ANY (ARRAY['long'::text, 'short'::text]))),
    CONSTRAINT user_trade_queue_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT user_trade_queue_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'executed'::text, 'cancelled'::text])))
);


--
-- Name: v_agent_activity_feed; Type: VIEW; Schema: prediction; Owner: -
--

CREATE VIEW prediction.v_agent_activity_feed AS
 SELECT m.id,
    m.analyst_id,
    a.slug AS analyst_slug,
    a.name AS analyst_name,
    m.modification_type,
    m.summary,
    m.trigger_reason,
    m.performance_context,
    m.created_at,
    m.acknowledged
   FROM (prediction.agent_self_modification_log m
     JOIN prediction.analysts a ON ((a.id = m.analyst_id)))
  ORDER BY m.created_at DESC;


--
-- Name: v_analyst_fork_comparison; Type: VIEW; Schema: prediction; Owner: -
--

CREATE VIEW prediction.v_analyst_fork_comparison AS
 SELECT a.id AS analyst_id,
    a.slug,
    a.name,
    a.perspective,
    up.current_balance AS user_balance,
    up.total_realized_pnl AS user_realized_pnl,
    up.total_unrealized_pnl AS user_unrealized_pnl,
    up.win_count AS user_wins,
    up.loss_count AS user_losses,
    ap.current_balance AS agent_balance,
    ap.total_realized_pnl AS agent_realized_pnl,
    ap.total_unrealized_pnl AS agent_unrealized_pnl,
    ap.win_count AS agent_wins,
    ap.loss_count AS agent_losses,
    ap.status AS agent_status,
    arb.current_balance AS arbitrator_balance,
    arb.total_realized_pnl AS arbitrator_realized_pnl,
    arb.total_unrealized_pnl AS arbitrator_unrealized_pnl,
    arb.win_count AS arbitrator_wins,
    arb.loss_count AS arbitrator_losses,
    arb.status AS arbitrator_status,
    (ap.current_balance - up.current_balance) AS balance_diff,
        CASE
            WHEN (up.current_balance > (0)::numeric) THEN (((ap.current_balance - up.current_balance) / up.current_balance) * (100)::numeric)
            ELSE (0)::numeric
        END AS balance_diff_percent
   FROM (((prediction.analysts a
     LEFT JOIN prediction.analyst_portfolios up ON (((up.analyst_id = a.id) AND (up.fork_type = 'user'::text))))
     LEFT JOIN prediction.analyst_portfolios ap ON (((ap.analyst_id = a.id) AND (ap.fork_type = 'ai'::text))))
     LEFT JOIN prediction.analyst_portfolios arb ON (((arb.analyst_id = a.id) AND (arb.fork_type = 'arbitrator'::text))))
  WHERE ((a.analyst_type = 'personality'::text) AND (a.is_enabled = true));


--
-- Name: v_analytics_accuracy_comparison; Type: VIEW; Schema: prediction; Owner: -
--

CREATE VIEW prediction.v_analytics_accuracy_comparison AS
 WITH daily_predictions AS (
         SELECT (date_trunc('day'::text, p.predicted_at))::date AS period_date,
            p.is_test,
            p.id AS prediction_id,
            p.confidence,
            e.direction_correct,
            e.overall_score,
            p.status
           FROM (prediction.predictions p
             LEFT JOIN prediction.evaluations e ON ((e.prediction_id = p.id)))
          WHERE (p.predicted_at IS NOT NULL)
        ), aggregated_stats AS (
         SELECT daily_predictions.period_date,
            daily_predictions.is_test,
            count(*) AS total_predictions,
            count(*) FILTER (WHERE (daily_predictions.status = 'resolved'::text)) AS resolved_predictions,
            count(*) FILTER (WHERE (daily_predictions.direction_correct = true)) AS correct_predictions,
            avg(daily_predictions.confidence) AS avg_confidence,
            avg(daily_predictions.overall_score) AS avg_overall_score
           FROM daily_predictions
          GROUP BY daily_predictions.period_date, daily_predictions.is_test
        )
 SELECT period_date,
    is_test,
    total_predictions,
    resolved_predictions,
    correct_predictions,
        CASE
            WHEN (resolved_predictions > 0) THEN round((((correct_predictions)::numeric / (NULLIF(resolved_predictions, 0))::numeric) * (100)::numeric), 2)
            ELSE NULL::numeric
        END AS accuracy_pct,
    round(avg_confidence, 4) AS avg_confidence,
    round(avg_overall_score, 4) AS avg_overall_score
   FROM aggregated_stats
  ORDER BY period_date DESC, is_test;


--
-- Name: v_analytics_learning_velocity; Type: VIEW; Schema: prediction; Owner: -
--

CREATE VIEW prediction.v_analytics_learning_velocity AS
 WITH daily_learnings AS (
         SELECT (date_trunc('day'::text, l.created_at))::date AS period_date,
            l.is_test,
            l.id AS learning_id
           FROM prediction.learnings l
          WHERE (l.created_at IS NOT NULL)
        ), daily_promotions AS (
         SELECT (date_trunc('day'::text, ll.promoted_at))::date AS period_date,
            ll.id AS promotion_id,
            ll.test_learning_id,
            ll.promoted_at,
            tl.created_at AS test_learning_created_at
           FROM (prediction.learning_lineage ll
             JOIN prediction.learnings tl ON ((ll.test_learning_id = tl.id)))
          WHERE (ll.promoted_at IS NOT NULL)
        ), learning_counts AS (
         SELECT daily_learnings.period_date,
            count(*) FILTER (WHERE (daily_learnings.is_test = true)) AS test_learnings_created,
            count(*) FILTER (WHERE (daily_learnings.is_test = false)) AS production_learnings_created
           FROM daily_learnings
          GROUP BY daily_learnings.period_date
        ), promotion_counts AS (
         SELECT daily_promotions.period_date,
            count(*) AS learnings_promoted,
            avg((EXTRACT(epoch FROM (daily_promotions.promoted_at - daily_promotions.test_learning_created_at)) / (86400)::numeric)) AS avg_days_to_promotion
           FROM daily_promotions
          GROUP BY daily_promotions.period_date
        )
 SELECT COALESCE(lc.period_date, pc.period_date) AS period_date,
    COALESCE(lc.test_learnings_created, (0)::bigint) AS test_learnings_created,
    COALESCE(lc.production_learnings_created, (0)::bigint) AS production_learnings_created,
    COALESCE(pc.learnings_promoted, (0)::bigint) AS learnings_promoted,
    round(pc.avg_days_to_promotion, 2) AS avg_days_to_promotion
   FROM (learning_counts lc
     FULL JOIN promotion_counts pc ON ((lc.period_date = pc.period_date)))
  ORDER BY COALESCE(lc.period_date, pc.period_date) DESC;


--
-- Name: v_analytics_promotion_funnel; Type: VIEW; Schema: prediction; Owner: -
--

CREATE VIEW prediction.v_analytics_promotion_funnel AS
 WITH test_learnings_created AS (
         SELECT count(*) AS count
           FROM prediction.learnings
          WHERE (learnings.is_test = true)
        ), validated_learnings AS (
         SELECT count(DISTINCT l.id) AS count
           FROM prediction.learnings l
          WHERE ((l.is_test = true) AND (l.times_applied > 0))
        ), backtested_learnings AS (
         SELECT count(DISTINCT ll.test_learning_id) AS count
           FROM prediction.learning_lineage ll
          WHERE (ll.backtest_result IS NOT NULL)
        ), promoted_learnings AS (
         SELECT count(*) AS count
           FROM prediction.learning_lineage
        ), total_base AS (
         SELECT test_learnings_created.count
           FROM test_learnings_created
        ), funnel_data AS (
         SELECT 'test_created'::text AS stage,
            tc.count,
            1 AS sort_order
           FROM test_learnings_created tc
        UNION ALL
         SELECT 'validated'::text AS stage,
            vl.count,
            2 AS sort_order
           FROM validated_learnings vl
        UNION ALL
         SELECT 'backtested'::text AS stage,
            bl.count,
            3 AS sort_order
           FROM backtested_learnings bl
        UNION ALL
         SELECT 'promoted'::text AS stage,
            pl.count,
            4 AS sort_order
           FROM promoted_learnings pl
        )
 SELECT fd.stage,
    fd.count,
        CASE
            WHEN (tb.count > 0) THEN round((((fd.count)::numeric / (NULLIF(tb.count, 0))::numeric) * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS pct_of_total
   FROM (funnel_data fd
     CROSS JOIN total_base tb)
  ORDER BY fd.sort_order;


--
-- Name: v_analytics_scenario_effectiveness; Type: VIEW; Schema: prediction; Owner: -
--

CREATE VIEW prediction.v_analytics_scenario_effectiveness AS
 WITH scenario_runs_summary AS (
         SELECT ts_1.scenario_type,
            sr.id AS run_id,
            sr.outcome_match,
            sr.started_at,
            sr.completed_at,
                CASE
                    WHEN ((sr.completed_at IS NOT NULL) AND (sr.started_at IS NOT NULL)) THEN (EXTRACT(epoch FROM (sr.completed_at - sr.started_at)) / (60)::numeric)
                    ELSE NULL::numeric
                END AS run_duration_minutes
           FROM (prediction.test_scenarios ts_1
             JOIN prediction.scenario_runs sr ON ((ts_1.id = sr.scenario_id)))
          WHERE (sr.status = ANY (ARRAY['completed'::text, 'failed'::text]))
        ), scenario_learnings AS (
         SELECT ts_1.scenario_type,
            count(l.id) AS learnings_count
           FROM (prediction.test_scenarios ts_1
             LEFT JOIN prediction.learnings l ON ((ts_1.id = l.test_scenario_id)))
          GROUP BY ts_1.scenario_type
        )
 SELECT srs.scenario_type,
    count(DISTINCT ts.id) AS total_scenarios,
    count(srs.run_id) AS total_runs,
    count(*) FILTER (WHERE (srs.outcome_match = true)) AS successful_runs,
        CASE
            WHEN (count(srs.run_id) > 0) THEN round((((count(*) FILTER (WHERE (srs.outcome_match = true)))::numeric / (NULLIF(count(srs.run_id), 0))::numeric) * (100)::numeric), 2)
            ELSE NULL::numeric
        END AS success_rate_pct,
    COALESCE(sl.learnings_count, (0)::bigint) AS learnings_generated,
    round(avg(srs.run_duration_minutes), 2) AS avg_run_duration_minutes
   FROM ((prediction.test_scenarios ts
     LEFT JOIN scenario_runs_summary srs ON ((ts.scenario_type = srs.scenario_type)))
     LEFT JOIN scenario_learnings sl ON ((ts.scenario_type = sl.scenario_type)))
  GROUP BY srs.scenario_type, sl.learnings_count
  ORDER BY (count(srs.run_id)) DESC,
        CASE
            WHEN (count(srs.run_id) > 0) THEN round((((count(*) FILTER (WHERE (srs.outcome_match = true)))::numeric / (NULLIF(count(srs.run_id), 0))::numeric) * (100)::numeric), 2)
            ELSE NULL::numeric
        END DESC;


--
-- Name: v_test_data_stats; Type: VIEW; Schema: prediction; Owner: -
--

CREATE VIEW prediction.v_test_data_stats AS
 WITH scenario_stats AS (
         SELECT count(*) AS total_scenarios,
            count(*) FILTER (WHERE (test_scenarios.status = 'draft'::text)) AS draft_scenarios,
            count(*) FILTER (WHERE (test_scenarios.status = 'ready'::text)) AS ready_scenarios,
            count(*) FILTER (WHERE (test_scenarios.status = 'archived'::text)) AS archived_scenarios
           FROM prediction.test_scenarios
        ), article_stats AS (
         SELECT count(*) AS total_articles,
            count(*) FILTER (WHERE (test_articles.processed = true)) AS processed_articles,
            count(*) FILTER (WHERE (test_articles.processed = false)) AS unprocessed_articles
           FROM prediction.test_articles
        ), price_stats AS (
         SELECT count(*) AS total_price_records,
            count(DISTINCT test_price_data.symbol) AS distinct_symbols
           FROM prediction.test_price_data
        ), run_stats AS (
         SELECT count(*) AS total_runs,
            count(*) FILTER (WHERE (scenario_runs.status = 'pending'::text)) AS pending_runs,
            count(*) FILTER (WHERE (scenario_runs.status = 'running'::text)) AS running_runs,
            count(*) FILTER (WHERE (scenario_runs.status = 'completed'::text)) AS completed_runs,
            count(*) FILTER (WHERE (scenario_runs.status = 'failed'::text)) AS failed_runs,
            count(*) FILTER (WHERE (scenario_runs.outcome_match = true)) AS successful_runs,
            count(*) FILTER (WHERE (scenario_runs.outcome_match = false)) AS failed_outcome_runs
           FROM prediction.scenario_runs
        ), signal_stats AS (
         SELECT count(*) FILTER (WHERE (signals.is_test = true)) AS test_signals,
            count(*) FILTER (WHERE (signals.is_test = false)) AS production_signals
           FROM prediction.signals
        ), predictor_stats AS (
         SELECT count(*) FILTER (WHERE (predictors.is_test = true)) AS test_predictors,
            count(*) FILTER (WHERE (predictors.is_test = false)) AS production_predictors
           FROM prediction.predictors
        ), prediction_stats AS (
         SELECT count(*) FILTER (WHERE (predictions.is_test = true)) AS test_predictions,
            count(*) FILTER (WHERE (predictions.is_test = false)) AS production_predictions
           FROM prediction.predictions
        ), learning_stats AS (
         SELECT count(*) FILTER (WHERE (learnings.is_test = true)) AS test_learnings,
            count(*) FILTER (WHERE (learnings.is_test = false)) AS production_learnings,
            count(*) AS total_learnings
           FROM prediction.learnings
        ), lineage_stats AS (
         SELECT count(*) AS total_promotions
           FROM prediction.learning_lineage
        ), mirror_stats AS (
         SELECT count(*) AS total_mirrors
           FROM prediction.test_target_mirrors
        )
 SELECT s.total_scenarios,
    s.draft_scenarios,
    s.ready_scenarios,
    s.archived_scenarios,
    a.total_articles,
    a.processed_articles,
    a.unprocessed_articles,
    p.total_price_records,
    p.distinct_symbols AS price_symbols,
    r.total_runs,
    r.pending_runs,
    r.running_runs,
    r.completed_runs,
    r.failed_runs,
    r.successful_runs,
    r.failed_outcome_runs,
    sig.test_signals,
    sig.production_signals,
    pred.test_predictors,
    pred.production_predictors,
    prd.test_predictions,
    prd.production_predictions,
    l.test_learnings,
    l.production_learnings,
    l.total_learnings,
    lin.total_promotions,
    m.total_mirrors,
        CASE
            WHEN (r.total_runs > 0) THEN round((((r.successful_runs)::numeric / (r.total_runs)::numeric) * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS run_success_rate_pct,
        CASE
            WHEN (l.test_learnings > 0) THEN round((((lin.total_promotions)::numeric / (l.test_learnings)::numeric) * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS promotion_rate_pct,
    now() AS stats_generated_at
   FROM (((((((((scenario_stats s
     CROSS JOIN article_stats a)
     CROSS JOIN price_stats p)
     CROSS JOIN run_stats r)
     CROSS JOIN signal_stats sig)
     CROSS JOIN predictor_stats pred)
     CROSS JOIN prediction_stats prd)
     CROSS JOIN learning_stats l)
     CROSS JOIN lineage_stats lin)
     CROSS JOIN mirror_stats m);


--
-- Name: agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agents (
    slug text NOT NULL,
    organization_slug text[] DEFAULT ARRAY['demo-org'::text] NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    agent_type text NOT NULL,
    department text NOT NULL,
    tags text[] DEFAULT ARRAY[]::text[],
    context text NOT NULL,
    endpoint jsonb,
    llm_config jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    require_local_model boolean DEFAULT false,
    output_type text DEFAULT 'text'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    CONSTRAINT agents_agent_type_check CHECK ((agent_type = ANY (ARRAY['context'::text, 'rag'::text, 'api'::text, 'external'::text, 'media'::text, 'langgraph'::text, 'prediction'::text, 'risk'::text]))),
    CONSTRAINT agents_output_type_check CHECK ((output_type = ANY (ARRAY['text'::text, 'markdown'::text, 'json'::text, 'image'::text, 'video'::text, 'audio'::text, 'artifact-ref'::text]))),
    CONSTRAINT agents_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'disabled'::text, 'archived'::text])))
);


--
-- Name: assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assets (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    conversation_id uuid,
    filename text,
    file_path text,
    file_size integer,
    mime_type text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    storage text DEFAULT 'supabase'::text,
    bucket text,
    object_key text,
    mime text,
    size integer,
    width integer,
    height integer
);


--
-- Name: auth_identity_links; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.auth_identity_links AS
 SELECT id,
    user_id,
    issuer,
    subject,
    email,
    raw_claims,
    created_at,
    updated_at
   FROM authz.auth_identity_links;


--
-- Name: channel_message_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_message_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel_user_id uuid,
    channel text NOT NULL,
    direction text NOT NULL,
    message_text text,
    channel_message_id text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: channel_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    channel text NOT NULL,
    channel_user_id text NOT NULL,
    display_name text,
    is_allowed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: checkpoint_blobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkpoint_blobs (
    thread_id text NOT NULL,
    checkpoint_ns text DEFAULT ''::text NOT NULL,
    channel text NOT NULL,
    version text NOT NULL,
    type text NOT NULL,
    blob bytea
);


--
-- Name: checkpoint_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkpoint_migrations (
    v integer NOT NULL
);


--
-- Name: checkpoint_writes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkpoint_writes (
    thread_id text NOT NULL,
    checkpoint_ns text DEFAULT ''::text NOT NULL,
    checkpoint_id text NOT NULL,
    task_id text NOT NULL,
    idx integer NOT NULL,
    channel text NOT NULL,
    type text,
    blob bytea NOT NULL
);


--
-- Name: checkpoints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkpoints (
    thread_id text NOT NULL,
    checkpoint_ns text DEFAULT ''::text NOT NULL,
    checkpoint_id text NOT NULL,
    parent_checkpoint_id text,
    type text,
    checkpoint jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: cidafm_commands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cidafm_commands (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    command_name text NOT NULL,
    description text,
    prompt_template text NOT NULL,
    example_usage text,
    category text,
    is_active boolean DEFAULT true,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    is_builtin boolean DEFAULT true,
    name text,
    type text DEFAULT '^'::text,
    default_active boolean DEFAULT false
);


--
-- Name: conversation_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    output_type text DEFAULT 'text'::text,
    metadata jsonb DEFAULT '{}'::jsonb,
    attachments jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT conversation_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])))
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    agent_name character varying(255),
    agent_type character varying(100),
    started_at timestamp with time zone,
    last_active_at timestamp with time zone,
    ended_at timestamp with time zone,
    primary_work_product_type character varying(100),
    primary_work_product_id uuid,
    organization_slug text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    last_output_type text,
    message_count integer DEFAULT 0
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    conversation_id uuid,
    method character varying(255),
    params jsonb DEFAULT '{}'::jsonb,
    prompt text,
    response text,
    status character varying(50) DEFAULT 'pending'::character varying,
    progress integer DEFAULT 0,
    error_code text,
    error_message text,
    error_data jsonb,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    timeout_seconds integer DEFAULT 300,
    metadata jsonb DEFAULT '{}'::jsonb,
    llm_metadata jsonb DEFAULT '{}'::jsonb,
    response_metadata jsonb DEFAULT '{}'::jsonb,
    evaluation jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    hitl_pending boolean DEFAULT false,
    hitl_pending_since timestamp with time zone
);


--
-- Name: conversations_with_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.conversations_with_stats AS
 SELECT c.id,
    c.user_id,
    c.agent_name,
    c.agent_type,
    c.ended_at,
    c.started_at,
    c.last_active_at,
    c.metadata,
    c.created_at,
    c.updated_at,
    c.organization_slug,
    c.primary_work_product_type,
    c.primary_work_product_id,
    COALESCE(task_stats.task_count, (0)::bigint) AS task_count,
    COALESCE(task_stats.completed_tasks, (0)::bigint) AS completed_tasks,
    COALESCE(task_stats.failed_tasks, (0)::bigint) AS failed_tasks,
    COALESCE(task_stats.active_tasks, (0)::bigint) AS active_tasks
   FROM (public.conversations c
     LEFT JOIN ( SELECT t.conversation_id,
            count(*) AS task_count,
            count(
                CASE
                    WHEN ((t.status)::text = 'completed'::text) THEN 1
                    ELSE NULL::integer
                END) AS completed_tasks,
            count(
                CASE
                    WHEN ((t.status)::text = 'failed'::text) THEN 1
                    ELSE NULL::integer
                END) AS failed_tasks,
            count(
                CASE
                    WHEN ((t.status)::text = ANY (ARRAY[('pending'::character varying)::text, ('running'::character varying)::text])) THEN 1
                    ELSE NULL::integer
                END) AS active_tasks
           FROM public.tasks t
          GROUP BY t.conversation_id) task_stats ON ((c.id = task_stats.conversation_id)));


--
-- Name: human_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.human_approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_slug text,
    agent_slug text NOT NULL,
    conversation_id uuid,
    task_id text,
    orchestration_run_id uuid,
    orchestration_step_id uuid,
    mode text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    approved_by text,
    decision_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: llm_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.llm_providers (
    name text NOT NULL,
    display_name text NOT NULL,
    api_base_url text,
    configuration_json jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    is_local boolean DEFAULT false
);


--
-- Name: llm_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.llm_usage (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    run_id text NOT NULL,
    user_id uuid,
    conversation_id uuid,
    provider_name text,
    model_name text,
    route text,
    input_tokens integer,
    output_tokens integer,
    input_cost numeric,
    output_cost numeric,
    total_cost numeric,
    duration_ms integer,
    status text DEFAULT 'completed'::text,
    caller_type text,
    agent_name text,
    is_local boolean DEFAULT false,
    model_tier text,
    fallback_used boolean DEFAULT false,
    routing_reason text,
    complexity_level text,
    complexity_score integer,
    data_classification text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    error_message text,
    data_sanitization_applied boolean DEFAULT false,
    sanitization_level text DEFAULT 'none'::text,
    pii_detected boolean DEFAULT false,
    pii_types jsonb DEFAULT '[]'::jsonb,
    pseudonyms_used integer DEFAULT 0,
    pseudonym_types jsonb DEFAULT '[]'::jsonb,
    pseudonym_mappings jsonb DEFAULT '[]'::jsonb,
    redactions_applied integer DEFAULT 0,
    redaction_types jsonb DEFAULT '[]'::jsonb,
    source_blinding_applied boolean DEFAULT false,
    headers_stripped boolean DEFAULT false,
    custom_user_agent_used boolean DEFAULT false,
    proxy_used boolean DEFAULT false,
    no_train_header_sent boolean DEFAULT false,
    no_retain_header_sent boolean DEFAULT false,
    sanitization_time_ms integer DEFAULT 0,
    reversal_context_size integer DEFAULT 0,
    policy_profile text,
    sovereign_mode boolean DEFAULT false,
    compliance_flags jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    showstopper_detected boolean DEFAULT false,
    CONSTRAINT llm_usage_route_check CHECK (((route IS NULL) OR (route = ANY (ARRAY['local'::text, 'remote'::text]))))
);


--
-- Name: observability_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.observability_events (
    id bigint NOT NULL,
    source_app text DEFAULT 'orchestrator-ai'::text NOT NULL,
    session_id text,
    hook_event_type text NOT NULL,
    user_id uuid,
    username text,
    conversation_id uuid,
    task_id text NOT NULL,
    agent_slug text,
    organization_slug text,
    mode text,
    status text,
    message text,
    progress integer,
    step text,
    sequence integer,
    total_steps integer,
    payload jsonb NOT NULL,
    "timestamp" bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: observability_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.observability_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: observability_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.observability_events_id_seq OWNED BY public.observability_events.id;


--
-- Name: organization_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_credentials (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    organization_slug text NOT NULL,
    credential_type text NOT NULL,
    credential_key text NOT NULL,
    credential_value text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    url text,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pseudonym_dictionaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pseudonym_dictionaries (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    conversation_id uuid,
    entity_type text NOT NULL,
    original_value text NOT NULL,
    pseudonym text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    data_type text DEFAULT 'text'::text,
    category text DEFAULT 'general'::text,
    is_active boolean DEFAULT true,
    organization_slug text,
    agent_slug text,
    original_value_encrypted bytea,
    is_encrypted boolean DEFAULT false,
    expires_at timestamp with time zone DEFAULT (CURRENT_TIMESTAMP + '90 days'::interval),
    last_used_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: redaction_patterns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.redaction_patterns (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    pattern_regex text NOT NULL,
    replacement text NOT NULL,
    description text,
    category character varying(100) DEFAULT 'pii_custom'::character varying,
    priority integer DEFAULT 50,
    is_active boolean DEFAULT true,
    severity character varying(50),
    data_type character varying(50),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: task_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_messages (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    task_id uuid NOT NULL,
    user_id uuid,
    content text NOT NULL,
    message_type text DEFAULT 'info'::text NOT NULL,
    progress_percentage numeric,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    output_type text,
    structured_content jsonb,
    CONSTRAINT task_messages_output_type_check CHECK (((output_type IS NULL) OR (output_type = ANY (ARRAY['text'::text, 'markdown'::text, 'json'::text, 'image'::text, 'video'::text, 'audio'::text, 'artifact-ref'::text]))))
);


--
-- Name: team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text,
    name text NOT NULL,
    description text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_cidafm_commands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_cidafm_commands (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    command_id uuid NOT NULL,
    custom_prompt text,
    usage_count integer DEFAULT 0,
    last_used_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: rag_document_chunks; Type: TABLE; Schema: rag_data; Owner: -
--

CREATE TABLE rag_data.rag_document_chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    collection_id uuid NOT NULL,
    organization_slug text NOT NULL,
    content text NOT NULL,
    chunk_index integer NOT NULL,
    embedding rag_data.vector(768),
    token_count integer DEFAULT 0 NOT NULL,
    page_number integer,
    char_offset integer,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: composite_scores; Type: TABLE; Schema: risk; Owner: -
--

CREATE TABLE risk.composite_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject_id uuid NOT NULL,
    task_id uuid,
    overall_score integer,
    dimension_scores jsonb DEFAULT '{}'::jsonb,
    debate_id uuid,
    debate_adjustment integer DEFAULT 0,
    pre_debate_score integer,
    confidence numeric(3,2),
    status text DEFAULT 'active'::text,
    valid_until timestamp with time zone,
    is_test boolean DEFAULT false,
    test_scenario_id text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT composite_scores_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT composite_scores_overall_score_check CHECK (((overall_score >= 0) AND (overall_score <= 100))),
    CONSTRAINT composite_scores_pre_debate_score_check CHECK (((pre_debate_score >= 0) AND (pre_debate_score <= 100))),
    CONSTRAINT composite_scores_status_check CHECK ((status = ANY (ARRAY['active'::text, 'superseded'::text, 'expired'::text])))
);


--
-- Name: scopes; Type: TABLE; Schema: risk; Owner: -
--

CREATE TABLE risk.scopes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_slug text NOT NULL,
    agent_slug text NOT NULL,
    name text NOT NULL,
    description text,
    domain text NOT NULL,
    llm_config jsonb DEFAULT '{}'::jsonb,
    thresholds jsonb DEFAULT '{}'::jsonb,
    analysis_config jsonb DEFAULT '{"redTeam": {"enabled": false}, "riskRadar": {"enabled": true}}'::jsonb,
    is_active boolean DEFAULT true,
    is_test boolean DEFAULT false,
    test_scenario_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: subjects; Type: TABLE; Schema: risk; Owner: -
--

CREATE TABLE risk.subjects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope_id uuid NOT NULL,
    identifier text NOT NULL,
    name text,
    subject_type text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    is_test boolean DEFAULT false,
    test_scenario_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: active_composite_scores; Type: VIEW; Schema: risk; Owner: -
--

CREATE VIEW risk.active_composite_scores AS
 SELECT DISTINCT ON (cs.subject_id) cs.id,
    cs.subject_id,
    cs.task_id,
    cs.overall_score,
    cs.dimension_scores,
    cs.debate_id,
    cs.debate_adjustment,
    cs.pre_debate_score,
    cs.confidence,
    cs.status,
    cs.valid_until,
    cs.is_test,
    cs.test_scenario_id,
    cs.created_at,
    s.scope_id,
    s.identifier AS subject_identifier,
    s.name AS subject_name,
    s.subject_type,
    sc.name AS scope_name,
    sc.domain AS scope_domain
   FROM ((risk.composite_scores cs
     JOIN risk.subjects s ON ((s.id = cs.subject_id)))
     JOIN risk.scopes sc ON ((sc.id = s.scope_id)))
  WHERE ((cs.status = 'active'::text) AND (cs.is_test = false))
  ORDER BY cs.subject_id, cs.created_at DESC;


--
-- Name: alerts; Type: TABLE; Schema: risk; Owner: -
--

CREATE TABLE risk.alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject_id uuid NOT NULL,
    composite_score_id uuid,
    alert_type text NOT NULL,
    severity text NOT NULL,
    title text NOT NULL,
    message text,
    details jsonb DEFAULT '{}'::jsonb,
    triggered_value numeric,
    threshold_value numeric,
    is_acknowledged boolean DEFAULT false,
    acknowledged_at timestamp with time zone,
    acknowledged_by uuid,
    is_test boolean DEFAULT false,
    test_scenario_id text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT alerts_alert_type_check CHECK ((alert_type = ANY (ARRAY['threshold_breach'::text, 'rapid_change'::text, 'dimension_spike'::text, 'stale_assessment'::text]))),
    CONSTRAINT alerts_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text])))
);


--
-- Name: article_classifications; Type: TABLE; Schema: risk; Owner: -
--

CREATE TABLE risk.article_classifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope_id uuid NOT NULL,
    article_id uuid NOT NULL,
    dimension_slugs text[] DEFAULT '{}'::text[] NOT NULL,
    confidence numeric(3,2),
    subject_identifiers text[] DEFAULT '{}'::text[],
    sentiment numeric(3,2),
    sentiment_label text,
    risk_indicators jsonb DEFAULT '[]'::jsonb,
    llm_provider text,
    llm_model text,
    classification_prompt_version integer DEFAULT 1,
    status text DEFAULT 'classified'::text,
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT article_classifications_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT article_classifications_sentiment_check CHECK (((sentiment >= ('-1'::integer)::numeric) AND (sentiment <= (1)::numeric))),
    CONSTRAINT article_classifications_sentiment_label_check CHECK ((sentiment_label = ANY (ARRAY['very_negative'::text, 'negative'::text, 'neutral'::text, 'positive'::text, 'very_positive'::text]))),
    CONSTRAINT article_classifications_status_check CHECK ((status = ANY (ARRAY['classified'::text, 'failed'::text, 'needs_reclassification'::text])))
);


--
-- Name: assessments; Type: TABLE; Schema: risk; Owner: -
--

CREATE TABLE risk.assessments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject_id uuid NOT NULL,
    dimension_id uuid NOT NULL,
    dimension_context_id uuid,
    task_id uuid,
    score integer,
    confidence numeric(3,2),
    reasoning text,
    evidence jsonb DEFAULT '[]'::jsonb,
    signals jsonb DEFAULT '[]'::jsonb,
    analyst_response jsonb DEFAULT '{}'::jsonb,
    llm_provider text,
    llm_model text,
    is_test boolean DEFAULT false,
    test_scenario_id text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT assessments_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT assessments_score_check CHECK (((score >= 0) AND (score <= 100)))
);


--
-- Name: classified_articles_by_dimension; Type: VIEW; Schema: risk; Owner: -
--

CREATE VIEW risk.classified_articles_by_dimension AS
 SELECT c.id AS classification_id,
    c.scope_id,
    a.id AS article_id,
    a.source_id,
    a.title,
    a.content,
    a.url,
    a.published_at,
    unnest(c.dimension_slugs) AS dimension_slug,
    c.confidence,
    c.sentiment,
    c.sentiment_label,
    c.risk_indicators,
    c.subject_identifiers,
    c.created_at AS classified_at
   FROM (crawler.articles a
     JOIN risk.article_classifications c ON ((c.article_id = a.id)))
  WHERE (c.status = 'classified'::text);


--
-- Name: classified_articles_by_subject; Type: VIEW; Schema: risk; Owner: -
--

CREATE VIEW risk.classified_articles_by_subject AS
 SELECT c.id AS classification_id,
    c.scope_id,
    a.id AS article_id,
    a.source_id,
    a.title,
    a.url,
    a.published_at,
    unnest(c.subject_identifiers) AS subject_identifier,
    c.dimension_slugs,
    c.confidence,
    c.sentiment,
    c.sentiment_label,
    c.risk_indicators,
    c.created_at AS classified_at
   FROM (crawler.articles a
     JOIN risk.article_classifications c ON ((c.article_id = a.id)))
  WHERE ((c.status = 'classified'::text) AND (array_length(c.subject_identifiers, 1) > 0));


--
-- Name: comparisons; Type: TABLE; Schema: risk; Owner: -
--

CREATE TABLE risk.comparisons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    subject_ids uuid[] NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: data_source_fetch_history; Type: TABLE; Schema: risk; Owner: -
--

CREATE TABLE risk.data_source_fetch_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    data_source_id uuid NOT NULL,
    status character varying(20) NOT NULL,
    fetch_duration_ms integer,
    raw_response jsonb,
    parsed_data jsonb,
    error_message text,
    dimensions_updated text[],
    subjects_affected uuid[],
    reanalysis_triggered boolean DEFAULT false,
    reanalysis_task_ids uuid[],
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT valid_fetch_status CHECK (((status)::text = ANY (ARRAY[('success'::character varying)::text, ('failed'::character varying)::text, ('timeout'::character varying)::text, ('rate_limited'::character varying)::text])))
);


--
-- Name: data_sources; Type: TABLE; Schema: risk; Owner: -
--

CREATE TABLE risk.data_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    source_type character varying(50) NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    schedule character varying(50),
    dimension_mapping jsonb DEFAULT '{}'::jsonb NOT NULL,
    subject_filter jsonb,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    error_message text,
    error_count integer DEFAULT 0,
    last_fetch_at timestamp with time zone,
    last_fetch_status character varying(20),
    last_fetch_data jsonb,
    next_fetch_at timestamp with time zone,
    auto_reanalyze boolean DEFAULT true,
    reanalyze_threshold numeric(3,2) DEFAULT 0.1,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    migrated_to_crawler boolean DEFAULT false,
    CONSTRAINT valid_source_type CHECK (((source_type)::text = ANY (ARRAY[('firecrawl'::character varying)::text, ('api'::character varying)::text, ('rss'::character varying)::text, ('webhook'::character varying)::text, ('manual'::character varying)::text]))),
    CONSTRAINT valid_status CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('paused'::character varying)::text, ('error'::character varying)::text, ('disabled'::character varying)::text])))
);


--
-- Name: debate_contexts; Type: TABLE; Schema: risk; Owner: -
--

CREATE TABLE risk.debate_contexts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope_id uuid NOT NULL,
    role text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    system_prompt text NOT NULL,
    output_schema jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    is_test boolean DEFAULT false,
    test_scenario_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT debate_contexts_role_check CHECK ((role = ANY (ARRAY['blue'::text, 'red'::text, 'arbiter'::text])))
);


--
-- Name: debates; Type: TABLE; Schema: risk; Owner: -
--

CREATE TABLE risk.debates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject_id uuid NOT NULL,
    composite_score_id uuid,
    task_id uuid,
    blue_assessment jsonb DEFAULT '{}'::jsonb,
    red_challenges jsonb DEFAULT '{}'::jsonb,
    arbiter_synthesis jsonb DEFAULT '{}'::jsonb,
    original_score integer,
    final_score integer,
    score_adjustment integer DEFAULT 0,
    transcript jsonb DEFAULT '[]'::jsonb,
    status text DEFAULT 'pending'::text,
    is_test boolean DEFAULT false,
    test_scenario_id text,
    created_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    CONSTRAINT debates_final_score_check CHECK (((final_score >= 0) AND (final_score <= 100))),
    CONSTRAINT debates_original_score_check CHECK (((original_score >= 0) AND (original_score <= 100))),
    CONSTRAINT debates_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: dimension_contexts; Type: TABLE; Schema: risk; Owner: -
--

CREATE TABLE risk.dimension_contexts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dimension_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    system_prompt text NOT NULL,
    output_schema jsonb DEFAULT '{"type": "object", "required": ["score", "confidence", "reasoning"], "properties": {"score": {"type": "integer", "maximum": 100, "minimum": 0}, "signals": {"type": "array", "items": {"type": "object"}}, "evidence": {"type": "array", "items": {"type": "string"}}, "reasoning": {"type": "string"}, "confidence": {"type": "number", "maximum": 1, "minimum": 0}}}'::jsonb,
    examples jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    is_test boolean DEFAULT false,
    test_scenario_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: dimension_contribution; Type: VIEW; Schema: risk; Owner: -
--

CREATE VIEW risk.dimension_contribution AS
SELECT
    NULL::uuid AS scope_id,
    NULL::uuid AS dimension_id,
    NULL::text AS dimension_slug,
    NULL::character varying(100) AS dimension_name,
    NULL::character varying(50) AS dimension_icon,
    NULL::character varying(7) AS dimension_color,
    NULL::numeric(3,2) AS weight,
    NULL::bigint AS assessment_count,
    NULL::numeric AS avg_score,
    NULL::numeric AS avg_confidence,
    NULL::integer AS max_score,
    NULL::integer AS min_score,
    NULL::numeric AS weighted_contribution;


--
-- Name: dimensions; Type: TABLE; Schema: risk; Owner: -
--

CREATE TABLE risk.dimensions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope_id uuid NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    weight numeric(3,2) DEFAULT 1.0,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    is_test boolean DEFAULT false,
    test_scenario_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    display_name character varying(100),
    icon character varying(50),
    color character varying(7),
    CONSTRAINT dimensions_weight_check CHECK (((weight >= (0)::numeric) AND (weight <= (2)::numeric)))
);


--
-- Name: evaluations; Type: TABLE; Schema: risk; Owner: -
--

CREATE TABLE risk.evaluations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    composite_score_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    evaluation_window text NOT NULL,
    actual_outcome jsonb DEFAULT '{}'::jsonb,
    outcome_severity integer,
    score_accuracy numeric(3,2),
    dimension_accuracy jsonb DEFAULT '{}'::jsonb,
    calibration_error numeric(5,4),
    learnings_suggested text[],
    notes text,
    is_test boolean DEFAULT false,
    test_scenario_id text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT evaluations_outcome_severity_check CHECK (((outcome_severity >= 0) AND (outcome_severity <= 100))),
    CONSTRAINT evaluations_score_accuracy_check CHECK (((score_accuracy >= (0)::numeric) AND (score_accuracy <= (1)::numeric)))
);


--
-- Name: executive_summaries; Type: TABLE; Schema: risk; Owner: -
--

CREATE TABLE risk.executive_summaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope_id uuid NOT NULL,
    summary_type character varying(50) DEFAULT 'ad-hoc'::character varying NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    risk_snapshot jsonb DEFAULT '{}'::jsonb,
    generated_by character varying(100),
    generated_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: heatmap_data; Type: VIEW; Schema: risk; Owner: -
--

CREATE VIEW risk.heatmap_data AS
 SELECT s.id AS subject_id,
    s.name AS subject_name,
    s.identifier AS subject_identifier,
    s.subject_type,
    d.id AS dimension_id,
    d.slug AS dimension_slug,
    d.display_name AS dimension_name,
    d.icon AS dimension_icon,
    d.color AS dimension_color,
    d.weight AS dimension_weight,
    d.display_order,
    a.id AS assessment_id,
    a.score,
    a.confidence,
    a.created_at AS assessment_date,
        CASE
            WHEN (a.score >= 70) THEN 'critical'::text
            WHEN (a.score >= 50) THEN 'high'::text
            WHEN (a.score >= 30) THEN 'medium'::text
            ELSE 'low'::text
        END AS risk_level,
        CASE
            WHEN (a.score >= 70) THEN '#DC2626'::text
            WHEN (a.score >= 50) THEN '#F97316'::text
            WHEN (a.score >= 30) THEN '#EAB308'::text
            ELSE '#22C55E'::text
        END AS risk_color,
    sc.id AS scope_id,
    sc.name AS scope_name
   FROM (((risk.subjects s
     CROSS JOIN risk.dimensions d)
     LEFT JOIN LATERAL ( SELECT a_1.id,
            a_1.subject_id,
            a_1.dimension_id,
            a_1.dimension_context_id,
            a_1.task_id,
            a_1.score,
            a_1.confidence,
            a_1.reasoning,
            a_1.evidence,
            a_1.signals,
            a_1.analyst_response,
            a_1.llm_provider,
            a_1.llm_model,
            a_1.is_test,
            a_1.test_scenario_id,
            a_1.created_at
           FROM risk.assessments a_1
          WHERE ((a_1.subject_id = s.id) AND (a_1.dimension_id = d.id) AND (a_1.is_test = false))
          ORDER BY a_1.created_at DESC
         LIMIT 1) a ON (true))
     JOIN risk.scopes sc ON ((sc.id = s.scope_id)))
  WHERE ((s.scope_id = d.scope_id) AND (s.is_active = true) AND (s.is_test = false) AND (d.is_active = true) AND (d.is_test = false))
  ORDER BY s.name, d.display_order;


--
-- Name: learning_queue; Type: TABLE; Schema: risk; Owner: -
--

CREATE TABLE risk.learning_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope_id uuid,
    subject_id uuid,
    evaluation_id uuid,
    suggested_scope_level text,
    suggested_learning_type text,
    suggested_title text NOT NULL,
    suggested_description text,
    suggested_config jsonb DEFAULT '{}'::jsonb,
    ai_reasoning text,
    ai_confidence numeric(3,2),
    status text DEFAULT 'pending'::text,
    reviewed_by_user_id uuid,
    reviewer_notes text,
    reviewed_at timestamp with time zone,
    learning_id uuid,
    is_test boolean DEFAULT false,
    test_scenario_id text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT learning_queue_ai_confidence_check CHECK (((ai_confidence >= (0)::numeric) AND (ai_confidence <= (1)::numeric))),
    CONSTRAINT learning_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'modified'::text])))
);


--
-- Name: learnings; Type: TABLE; Schema: risk; Owner: -
--

CREATE TABLE risk.learnings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope_level text NOT NULL,
    domain text,
    scope_id uuid,
    subject_id uuid,
    dimension_id uuid,
    learning_type text NOT NULL,
    title text NOT NULL,
    description text,
    config jsonb DEFAULT '{}'::jsonb,
    times_applied integer DEFAULT 0,
    times_helpful integer DEFAULT 0,
    effectiveness_score numeric(3,2),
    status text DEFAULT 'active'::text,
    is_test boolean DEFAULT true,
    source_type text,
    parent_learning_id uuid,
    is_production boolean DEFAULT false,
    test_scenario_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT learnings_learning_type_check CHECK ((learning_type = ANY (ARRAY['rule'::text, 'pattern'::text, 'avoid'::text, 'weight_adjustment'::text, 'threshold'::text]))),
    CONSTRAINT learnings_scope_level_check CHECK ((scope_level = ANY (ARRAY['runner'::text, 'domain'::text, 'scope'::text, 'subject'::text, 'dimension'::text]))),
    CONSTRAINT learnings_source_type_check CHECK ((source_type = ANY (ARRAY['human'::text, 'ai_suggested'::text, 'ai_approved'::text]))),
    CONSTRAINT learnings_status_check CHECK ((status = ANY (ARRAY['active'::text, 'testing'::text, 'retired'::text, 'superseded'::text])))
);


--
-- Name: pending_learnings; Type: VIEW; Schema: risk; Owner: -
--

CREATE VIEW risk.pending_learnings AS
 SELECT lq.id,
    lq.scope_id,
    lq.subject_id,
    lq.evaluation_id,
    lq.suggested_scope_level,
    lq.suggested_learning_type,
    lq.suggested_title,
    lq.suggested_description,
    lq.suggested_config,
    lq.ai_reasoning,
    lq.ai_confidence,
    lq.status,
    lq.reviewed_by_user_id,
    lq.reviewer_notes,
    lq.reviewed_at,
    lq.learning_id,
    lq.is_test,
    lq.test_scenario_id,
    lq.created_at,
    s.identifier AS subject_identifier,
    s.name AS subject_name,
    sc.name AS scope_name
   FROM ((risk.learning_queue lq
     LEFT JOIN risk.subjects s ON ((s.id = lq.subject_id)))
     LEFT JOIN risk.scopes sc ON ((sc.id = lq.scope_id)))
  WHERE ((lq.status = 'pending'::text) AND (lq.is_test = false))
  ORDER BY lq.created_at DESC;


--
-- Name: portfolio_aggregate; Type: VIEW; Schema: risk; Owner: -
--

CREATE VIEW risk.portfolio_aggregate AS
 SELECT sc.id AS scope_id,
    sc.name AS scope_name,
    sc.domain,
    count(DISTINCT cs.subject_id) AS subject_count,
    round(avg(cs.overall_score), 2) AS avg_score,
    max(cs.overall_score) AS max_score,
    min(cs.overall_score) AS min_score,
    round(stddev(cs.overall_score), 2) AS score_stddev,
    round(avg(cs.confidence), 3) AS avg_confidence,
    count(*) FILTER (WHERE (cs.overall_score >= 70)) AS critical_count,
    count(*) FILTER (WHERE ((cs.overall_score >= 50) AND (cs.overall_score < 70))) AS high_count,
    count(*) FILTER (WHERE ((cs.overall_score >= 30) AND (cs.overall_score < 50))) AS medium_count,
    count(*) FILTER (WHERE (cs.overall_score < 30)) AS low_count,
    max(cs.created_at) AS latest_assessment,
    min(cs.created_at) AS oldest_assessment
   FROM ((risk.scopes sc
     LEFT JOIN risk.subjects s ON (((s.scope_id = sc.id) AND (s.is_active = true) AND (s.is_test = false))))
     LEFT JOIN LATERAL ( SELECT cs_1.id,
            cs_1.subject_id,
            cs_1.task_id,
            cs_1.overall_score,
            cs_1.dimension_scores,
            cs_1.debate_id,
            cs_1.debate_adjustment,
            cs_1.pre_debate_score,
            cs_1.confidence,
            cs_1.status,
            cs_1.valid_until,
            cs_1.is_test,
            cs_1.test_scenario_id,
            cs_1.created_at
           FROM risk.composite_scores cs_1
          WHERE ((cs_1.subject_id = s.id) AND (cs_1.status = 'active'::text) AND (cs_1.is_test = false))
          ORDER BY cs_1.created_at DESC
         LIMIT 1) cs ON (true))
  WHERE ((sc.is_active = true) AND (sc.is_test = false))
  GROUP BY sc.id, sc.name, sc.domain;


--
-- Name: reports; Type: TABLE; Schema: risk; Owner: -
--

CREATE TABLE risk.reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    report_type character varying(50) DEFAULT 'comprehensive'::character varying,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    file_path character varying(500),
    file_size integer,
    download_url character varying(1000),
    download_expires_at timestamp with time zone,
    error_message text,
    generated_at timestamp with time zone,
    created_by character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: risk_distribution; Type: VIEW; Schema: risk; Owner: -
--

CREATE VIEW risk.risk_distribution AS
 SELECT sc.id AS scope_id,
    sc.name AS scope_name,
    'critical'::text AS risk_level,
    '#DC2626'::text AS color,
    count(*) FILTER (WHERE (cs.overall_score >= 70)) AS count,
    round((((count(*) FILTER (WHERE (cs.overall_score >= 70)))::numeric / (NULLIF(count(*), 0))::numeric) * (100)::numeric), 1) AS percentage
   FROM ((risk.scopes sc
     LEFT JOIN risk.subjects s ON (((s.scope_id = sc.id) AND (s.is_active = true) AND (s.is_test = false))))
     LEFT JOIN LATERAL ( SELECT cs_1.id,
            cs_1.subject_id,
            cs_1.task_id,
            cs_1.overall_score,
            cs_1.dimension_scores,
            cs_1.debate_id,
            cs_1.debate_adjustment,
            cs_1.pre_debate_score,
            cs_1.confidence,
            cs_1.status,
            cs_1.valid_until,
            cs_1.is_test,
            cs_1.test_scenario_id,
            cs_1.created_at
           FROM risk.composite_scores cs_1
          WHERE ((cs_1.subject_id = s.id) AND (cs_1.status = 'active'::text) AND (cs_1.is_test = false))
          ORDER BY cs_1.created_at DESC
         LIMIT 1) cs ON (true))
  WHERE ((sc.is_active = true) AND (sc.is_test = false))
  GROUP BY sc.id, sc.name
UNION ALL
 SELECT sc.id AS scope_id,
    sc.name AS scope_name,
    'high'::text AS risk_level,
    '#F97316'::text AS color,
    count(*) FILTER (WHERE ((cs.overall_score >= 50) AND (cs.overall_score < 70))) AS count,
    round((((count(*) FILTER (WHERE ((cs.overall_score >= 50) AND (cs.overall_score < 70))))::numeric / (NULLIF(count(*), 0))::numeric) * (100)::numeric), 1) AS percentage
   FROM ((risk.scopes sc
     LEFT JOIN risk.subjects s ON (((s.scope_id = sc.id) AND (s.is_active = true) AND (s.is_test = false))))
     LEFT JOIN LATERAL ( SELECT cs_1.id,
            cs_1.subject_id,
            cs_1.task_id,
            cs_1.overall_score,
            cs_1.dimension_scores,
            cs_1.debate_id,
            cs_1.debate_adjustment,
            cs_1.pre_debate_score,
            cs_1.confidence,
            cs_1.status,
            cs_1.valid_until,
            cs_1.is_test,
            cs_1.test_scenario_id,
            cs_1.created_at
           FROM risk.composite_scores cs_1
          WHERE ((cs_1.subject_id = s.id) AND (cs_1.status = 'active'::text) AND (cs_1.is_test = false))
          ORDER BY cs_1.created_at DESC
         LIMIT 1) cs ON (true))
  WHERE ((sc.is_active = true) AND (sc.is_test = false))
  GROUP BY sc.id, sc.name
UNION ALL
 SELECT sc.id AS scope_id,
    sc.name AS scope_name,
    'medium'::text AS risk_level,
    '#EAB308'::text AS color,
    count(*) FILTER (WHERE ((cs.overall_score >= 30) AND (cs.overall_score < 50))) AS count,
    round((((count(*) FILTER (WHERE ((cs.overall_score >= 30) AND (cs.overall_score < 50))))::numeric / (NULLIF(count(*), 0))::numeric) * (100)::numeric), 1) AS percentage
   FROM ((risk.scopes sc
     LEFT JOIN risk.subjects s ON (((s.scope_id = sc.id) AND (s.is_active = true) AND (s.is_test = false))))
     LEFT JOIN LATERAL ( SELECT cs_1.id,
            cs_1.subject_id,
            cs_1.task_id,
            cs_1.overall_score,
            cs_1.dimension_scores,
            cs_1.debate_id,
            cs_1.debate_adjustment,
            cs_1.pre_debate_score,
            cs_1.confidence,
            cs_1.status,
            cs_1.valid_until,
            cs_1.is_test,
            cs_1.test_scenario_id,
            cs_1.created_at
           FROM risk.composite_scores cs_1
          WHERE ((cs_1.subject_id = s.id) AND (cs_1.status = 'active'::text) AND (cs_1.is_test = false))
          ORDER BY cs_1.created_at DESC
         LIMIT 1) cs ON (true))
  WHERE ((sc.is_active = true) AND (sc.is_test = false))
  GROUP BY sc.id, sc.name
UNION ALL
 SELECT sc.id AS scope_id,
    sc.name AS scope_name,
    'low'::text AS risk_level,
    '#22C55E'::text AS color,
    count(*) FILTER (WHERE (cs.overall_score < 30)) AS count,
    round((((count(*) FILTER (WHERE (cs.overall_score < 30)))::numeric / (NULLIF(count(*), 0))::numeric) * (100)::numeric), 1) AS percentage
   FROM ((risk.scopes sc
     LEFT JOIN risk.subjects s ON (((s.scope_id = sc.id) AND (s.is_active = true) AND (s.is_test = false))))
     LEFT JOIN LATERAL ( SELECT cs_1.id,
            cs_1.subject_id,
            cs_1.task_id,
            cs_1.overall_score,
            cs_1.dimension_scores,
            cs_1.debate_id,
            cs_1.debate_adjustment,
            cs_1.pre_debate_score,
            cs_1.confidence,
            cs_1.status,
            cs_1.valid_until,
            cs_1.is_test,
            cs_1.test_scenario_id,
            cs_1.created_at
           FROM risk.composite_scores cs_1
          WHERE ((cs_1.subject_id = s.id) AND (cs_1.status = 'active'::text) AND (cs_1.is_test = false))
          ORDER BY cs_1.created_at DESC
         LIMIT 1) cs ON (true))
  WHERE ((sc.is_active = true) AND (sc.is_test = false))
  GROUP BY sc.id, sc.name
  ORDER BY 1, 3;


--
-- Name: scenarios; Type: TABLE; Schema: risk; Owner: -
--

CREATE TABLE risk.scenarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    adjustments jsonb DEFAULT '{}'::jsonb NOT NULL,
    baseline_snapshot jsonb DEFAULT '{}'::jsonb,
    results jsonb DEFAULT '{}'::jsonb,
    is_template boolean DEFAULT false,
    created_by character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: score_history; Type: VIEW; Schema: risk; Owner: -
--

CREATE VIEW risk.score_history AS
 SELECT id,
    subject_id,
    overall_score,
    dimension_scores,
    confidence,
    debate_id,
    debate_adjustment,
    pre_debate_score,
    status,
    created_at,
    is_test,
    lag(overall_score) OVER (PARTITION BY subject_id ORDER BY created_at) AS previous_score,
    (overall_score - COALESCE(lag(overall_score) OVER (PARTITION BY subject_id ORDER BY created_at), overall_score)) AS score_change,
        CASE
            WHEN (lag(overall_score) OVER (PARTITION BY subject_id ORDER BY created_at) > 0) THEN round(((((overall_score - lag(overall_score) OVER (PARTITION BY subject_id ORDER BY created_at)))::numeric / (lag(overall_score) OVER (PARTITION BY subject_id ORDER BY created_at))::numeric) * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS score_change_percent,
    row_number() OVER (PARTITION BY subject_id ORDER BY created_at DESC) AS history_rank
   FROM risk.composite_scores cs
  ORDER BY subject_id, created_at DESC;


--
-- Name: score_trends; Type: VIEW; Schema: risk; Owner: -
--

CREATE VIEW risk.score_trends AS
 SELECT subject_id,
    ( SELECT cs2.overall_score
           FROM risk.composite_scores cs2
          WHERE ((cs2.subject_id = cs.subject_id) AND (cs2.is_test = false))
          ORDER BY cs2.created_at DESC
         LIMIT 1) AS current_score,
    (( SELECT cs2.overall_score
           FROM risk.composite_scores cs2
          WHERE ((cs2.subject_id = cs.subject_id) AND (cs2.is_test = false))
          ORDER BY cs2.created_at DESC
         LIMIT 1) - COALESCE(( SELECT cs2.overall_score
           FROM risk.composite_scores cs2
          WHERE ((cs2.subject_id = cs.subject_id) AND (cs2.is_test = false) AND (cs2.created_at < (now() - '7 days'::interval)))
          ORDER BY cs2.created_at DESC
         LIMIT 1), ( SELECT cs2.overall_score
           FROM risk.composite_scores cs2
          WHERE ((cs2.subject_id = cs.subject_id) AND (cs2.is_test = false))
          ORDER BY cs2.created_at
         LIMIT 1))) AS change_7d,
    (( SELECT cs2.overall_score
           FROM risk.composite_scores cs2
          WHERE ((cs2.subject_id = cs.subject_id) AND (cs2.is_test = false))
          ORDER BY cs2.created_at DESC
         LIMIT 1) - COALESCE(( SELECT cs2.overall_score
           FROM risk.composite_scores cs2
          WHERE ((cs2.subject_id = cs.subject_id) AND (cs2.is_test = false) AND (cs2.created_at < (now() - '30 days'::interval)))
          ORDER BY cs2.created_at DESC
         LIMIT 1), ( SELECT cs2.overall_score
           FROM risk.composite_scores cs2
          WHERE ((cs2.subject_id = cs.subject_id) AND (cs2.is_test = false))
          ORDER BY cs2.created_at
         LIMIT 1))) AS change_30d,
    count(*) AS total_assessments,
    avg(overall_score) AS avg_score,
    max(overall_score) AS max_score,
    min(overall_score) AS min_score,
    stddev(overall_score) AS score_stddev,
    min(created_at) AS first_assessment,
    max(created_at) AS latest_assessment
   FROM risk.composite_scores cs
  WHERE (is_test = false)
  GROUP BY subject_id;


--
-- Name: simulations; Type: TABLE; Schema: risk; Owner: -
--

CREATE TABLE risk.simulations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope_id uuid NOT NULL,
    subject_id uuid,
    name character varying(255) NOT NULL,
    description text,
    iterations integer DEFAULT 10000 NOT NULL,
    parameters jsonb DEFAULT '{}'::jsonb NOT NULL,
    results jsonb,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    error_message text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT valid_status CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('running'::character varying)::text, ('completed'::character varying)::text, ('failed'::character varying)::text])))
);


--
-- Name: source_subscriptions; Type: TABLE; Schema: risk; Owner: -
--

CREATE TABLE risk.source_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_id uuid NOT NULL,
    scope_id uuid NOT NULL,
    dimension_mapping jsonb DEFAULT '{"weight": 1.0, "auto_apply": true, "dimensions": []}'::jsonb,
    subject_filter jsonb DEFAULT '{"subject_ids": [], "apply_to_all": false, "subject_types": [], "identifier_pattern": null}'::jsonb,
    last_processed_at timestamp with time zone DEFAULT now(),
    auto_reanalyze boolean DEFAULT true,
    reanalyze_threshold numeric(3,2) DEFAULT 0.10,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: subscription_stats; Type: VIEW; Schema: risk; Owner: -
--

CREATE VIEW risk.subscription_stats AS
 SELECT rs.id AS subscription_id,
    rs.source_id,
    cs.name AS source_name,
    cs.url AS source_url,
    rs.scope_id,
    s.name AS scope_name,
    rs.is_active,
    rs.auto_reanalyze,
    rs.last_processed_at,
    ( SELECT count(*) AS count
           FROM crawler.articles a
          WHERE ((a.source_id = rs.source_id) AND (a.first_seen_at > rs.last_processed_at))) AS pending_articles,
    ( SELECT count(*) AS count
           FROM (crawler.agent_article_outputs aao
             JOIN crawler.articles a ON ((aao.article_id = a.id)))
          WHERE ((a.source_id = rs.source_id) AND (aao.agent_type = 'risk'::text))) AS processed_articles
   FROM ((risk.source_subscriptions rs
     JOIN crawler.sources cs ON ((rs.source_id = cs.id)))
     JOIN risk.scopes s ON ((rs.scope_id = s.id)));


--
-- Name: unacknowledged_alerts; Type: VIEW; Schema: risk; Owner: -
--

CREATE VIEW risk.unacknowledged_alerts AS
 SELECT a.id,
    a.subject_id,
    a.composite_score_id,
    a.alert_type,
    a.severity,
    a.title,
    a.message,
    a.details,
    a.triggered_value,
    a.threshold_value,
    a.is_acknowledged,
    a.acknowledged_at,
    a.acknowledged_by,
    a.is_test,
    a.test_scenario_id,
    a.created_at,
    s.identifier AS subject_identifier,
    s.name AS subject_name,
    sc.name AS scope_name
   FROM ((risk.alerts a
     JOIN risk.subjects s ON ((s.id = a.subject_id)))
     JOIN risk.scopes sc ON ((sc.id = s.scope_id)))
  WHERE ((a.acknowledged_at IS NULL) AND (a.is_test = false))
  ORDER BY
        CASE a.severity
            WHEN 'critical'::text THEN 1
            WHEN 'warning'::text THEN 2
            ELSE 3
        END, a.created_at DESC;


--
-- Name: unclassified_articles; Type: VIEW; Schema: risk; Owner: -
--

CREATE VIEW risk.unclassified_articles AS
 SELECT a.id,
    a.organization_slug,
    a.source_id,
    a.url,
    a.title,
    a.content,
    a.summary,
    a.author,
    a.published_at,
    a.content_hash,
    a.title_normalized,
    a.key_phrases,
    a.fingerprint_hash,
    a.raw_data,
    a.is_test,
    a.first_seen_at,
    a.metadata,
    a.is_duplicate,
    ss.scope_id
   FROM ((crawler.articles a
     JOIN risk.source_subscriptions ss ON ((ss.source_id = a.source_id)))
     LEFT JOIN risk.article_classifications c ON (((c.article_id = a.id) AND (c.scope_id = ss.scope_id))))
  WHERE ((c.id IS NULL) AND (a.is_duplicate = false) AND (ss.is_active = true))
  ORDER BY a.published_at DESC NULLS LAST, a.first_seen_at DESC;


--
-- Name: observability_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.observability_events ALTER COLUMN id SET DEFAULT nextval('public.observability_events_id_seq'::regclass);


--
-- Name: a2a_messages a2a_messages_pkey; Type: CONSTRAINT; Schema: ambient; Owner: -
--

ALTER TABLE ONLY ambient.a2a_messages
    ADD CONSTRAINT a2a_messages_pkey PRIMARY KEY (id);


--
-- Name: adapter_state adapter_state_pkey; Type: CONSTRAINT; Schema: ambient; Owner: -
--

ALTER TABLE ONLY ambient.adapter_state
    ADD CONSTRAINT adapter_state_pkey PRIMARY KEY (id);


--
-- Name: adapter_state adapter_state_trigger_id_key; Type: CONSTRAINT; Schema: ambient; Owner: -
--

ALTER TABLE ONLY ambient.adapter_state
    ADD CONSTRAINT adapter_state_trigger_id_key UNIQUE (trigger_id);


--
-- Name: external_agents external_agents_agent_id_org_unique; Type: CONSTRAINT; Schema: ambient; Owner: -
--

ALTER TABLE ONLY ambient.external_agents
    ADD CONSTRAINT external_agents_agent_id_org_unique UNIQUE (org_slug, agent_id);


--
-- Name: external_agents external_agents_pkey; Type: CONSTRAINT; Schema: ambient; Owner: -
--

ALTER TABLE ONLY ambient.external_agents
    ADD CONSTRAINT external_agents_pkey PRIMARY KEY (id);


--
-- Name: trigger_executions trigger_executions_pkey; Type: CONSTRAINT; Schema: ambient; Owner: -
--

ALTER TABLE ONLY ambient.trigger_executions
    ADD CONSTRAINT trigger_executions_pkey PRIMARY KEY (id);


--
-- Name: triggers triggers_pkey; Type: CONSTRAINT; Schema: ambient; Owner: -
--

ALTER TABLE ONLY ambient.triggers
    ADD CONSTRAINT triggers_pkey PRIMARY KEY (id);


--
-- Name: auth_identity_links auth_identity_links_issuer_subject_key; Type: CONSTRAINT; Schema: authz; Owner: -
--

ALTER TABLE ONLY authz.auth_identity_links
    ADD CONSTRAINT auth_identity_links_issuer_subject_key UNIQUE (issuer, subject);


--
-- Name: auth_identity_links auth_identity_links_pkey; Type: CONSTRAINT; Schema: authz; Owner: -
--

ALTER TABLE ONLY authz.auth_identity_links
    ADD CONSTRAINT auth_identity_links_pkey PRIMARY KEY (id);


--
-- Name: org_entitlements org_entitlements_pkey; Type: CONSTRAINT; Schema: authz; Owner: -
--

ALTER TABLE ONLY authz.org_entitlements
    ADD CONSTRAINT org_entitlements_pkey PRIMARY KEY (id);


--
-- Name: org_entitlements org_entitlements_unique; Type: CONSTRAINT; Schema: authz; Owner: -
--

ALTER TABLE ONLY authz.org_entitlements
    ADD CONSTRAINT org_entitlements_unique UNIQUE (org_slug, product);


--
-- Name: rbac_audit_log rbac_audit_log_pkey; Type: CONSTRAINT; Schema: authz; Owner: -
--

ALTER TABLE ONLY authz.rbac_audit_log
    ADD CONSTRAINT rbac_audit_log_pkey PRIMARY KEY (id);


--
-- Name: rbac_permissions rbac_permissions_name_key; Type: CONSTRAINT; Schema: authz; Owner: -
--

ALTER TABLE ONLY authz.rbac_permissions
    ADD CONSTRAINT rbac_permissions_name_key UNIQUE (name);


--
-- Name: rbac_permissions rbac_permissions_pkey; Type: CONSTRAINT; Schema: authz; Owner: -
--

ALTER TABLE ONLY authz.rbac_permissions
    ADD CONSTRAINT rbac_permissions_pkey PRIMARY KEY (id);


--
-- Name: rbac_role_permissions rbac_role_permissions_pkey; Type: CONSTRAINT; Schema: authz; Owner: -
--

ALTER TABLE ONLY authz.rbac_role_permissions
    ADD CONSTRAINT rbac_role_permissions_pkey PRIMARY KEY (id);


--
-- Name: rbac_role_permissions rbac_role_permissions_role_id_permission_id_resource_type_r_key; Type: CONSTRAINT; Schema: authz; Owner: -
--

ALTER TABLE ONLY authz.rbac_role_permissions
    ADD CONSTRAINT rbac_role_permissions_role_id_permission_id_resource_type_r_key UNIQUE (role_id, permission_id, resource_type, resource_id);


--
-- Name: rbac_roles rbac_roles_name_key; Type: CONSTRAINT; Schema: authz; Owner: -
--

ALTER TABLE ONLY authz.rbac_roles
    ADD CONSTRAINT rbac_roles_name_key UNIQUE (name);


--
-- Name: rbac_roles rbac_roles_pkey; Type: CONSTRAINT; Schema: authz; Owner: -
--

ALTER TABLE ONLY authz.rbac_roles
    ADD CONSTRAINT rbac_roles_pkey PRIMARY KEY (id);


--
-- Name: rbac_user_org_roles rbac_user_org_roles_pkey; Type: CONSTRAINT; Schema: authz; Owner: -
--

ALTER TABLE ONLY authz.rbac_user_org_roles
    ADD CONSTRAINT rbac_user_org_roles_pkey PRIMARY KEY (id);


--
-- Name: rbac_user_org_roles rbac_user_org_roles_user_id_organization_slug_role_id_key; Type: CONSTRAINT; Schema: authz; Owner: -
--

ALTER TABLE ONLY authz.rbac_user_org_roles
    ADD CONSTRAINT rbac_user_org_roles_user_id_organization_slug_role_id_key UNIQUE (user_id, organization_slug, role_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: authz; Owner: -
--

ALTER TABLE ONLY authz.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: authz; Owner: -
--

ALTER TABLE ONLY authz.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: fix_attempts fix_attempts_pkey; Type: CONSTRAINT; Schema: code_ops; Owner: -
--

ALTER TABLE ONLY code_ops.fix_attempts
    ADD CONSTRAINT fix_attempts_pkey PRIMARY KEY (id);


--
-- Name: pivot_learnings pivot_learnings_pkey; Type: CONSTRAINT; Schema: code_ops; Owner: -
--

ALTER TABLE ONLY code_ops.pivot_learnings
    ADD CONSTRAINT pivot_learnings_pkey PRIMARY KEY (id);


--
-- Name: quality_issues quality_issues_pkey; Type: CONSTRAINT; Schema: code_ops; Owner: -
--

ALTER TABLE ONLY code_ops.quality_issues
    ADD CONSTRAINT quality_issues_pkey PRIMARY KEY (id);


--
-- Name: scan_runs scan_runs_pkey; Type: CONSTRAINT; Schema: code_ops; Owner: -
--

ALTER TABLE ONLY code_ops.scan_runs
    ADD CONSTRAINT scan_runs_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: company; Owner: -
--

ALTER TABLE ONLY company.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: discovery_signals discovery_signals_pkey; Type: CONSTRAINT; Schema: company; Owner: -
--

ALTER TABLE ONLY company.discovery_signals
    ADD CONSTRAINT discovery_signals_pkey PRIMARY KEY (id);


--
-- Name: outreach outreach_pkey; Type: CONSTRAINT; Schema: company; Owner: -
--

ALTER TABLE ONLY company.outreach
    ADD CONSTRAINT outreach_pkey PRIMARY KEY (id);


--
-- Name: agent_article_outputs agent_article_outputs_article_id_agent_type_key; Type: CONSTRAINT; Schema: crawler; Owner: -
--

ALTER TABLE ONLY crawler.agent_article_outputs
    ADD CONSTRAINT agent_article_outputs_article_id_agent_type_key UNIQUE (article_id, agent_type);


--
-- Name: agent_article_outputs agent_article_outputs_pkey; Type: CONSTRAINT; Schema: crawler; Owner: -
--

ALTER TABLE ONLY crawler.agent_article_outputs
    ADD CONSTRAINT agent_article_outputs_pkey PRIMARY KEY (id);


--
-- Name: articles articles_organization_slug_content_hash_key; Type: CONSTRAINT; Schema: crawler; Owner: -
--

ALTER TABLE ONLY crawler.articles
    ADD CONSTRAINT articles_organization_slug_content_hash_key UNIQUE (organization_slug, content_hash);


--
-- Name: articles articles_pkey; Type: CONSTRAINT; Schema: crawler; Owner: -
--

ALTER TABLE ONLY crawler.articles
    ADD CONSTRAINT articles_pkey PRIMARY KEY (id);


--
-- Name: source_crawls source_crawls_pkey; Type: CONSTRAINT; Schema: crawler; Owner: -
--

ALTER TABLE ONLY crawler.source_crawls
    ADD CONSTRAINT source_crawls_pkey PRIMARY KEY (id);


--
-- Name: sources sources_organization_slug_url_key; Type: CONSTRAINT; Schema: crawler; Owner: -
--

ALTER TABLE ONLY crawler.sources
    ADD CONSTRAINT sources_organization_slug_url_key UNIQUE (organization_slug, url);


--
-- Name: sources sources_pkey; Type: CONSTRAINT; Schema: crawler; Owner: -
--

ALTER TABLE ONLY crawler.sources
    ADD CONSTRAINT sources_pkey PRIMARY KEY (id);


--
-- Name: cad_outputs cad_outputs_pkey; Type: CONSTRAINT; Schema: engineering; Owner: -
--

ALTER TABLE ONLY engineering.cad_outputs
    ADD CONSTRAINT cad_outputs_pkey PRIMARY KEY (id);


--
-- Name: drawings drawings_pkey; Type: CONSTRAINT; Schema: engineering; Owner: -
--

ALTER TABLE ONLY engineering.drawings
    ADD CONSTRAINT drawings_pkey PRIMARY KEY (id);


--
-- Name: execution_log execution_log_pkey; Type: CONSTRAINT; Schema: engineering; Owner: -
--

ALTER TABLE ONLY engineering.execution_log
    ADD CONSTRAINT execution_log_pkey PRIMARY KEY (id);


--
-- Name: generated_code generated_code_pkey; Type: CONSTRAINT; Schema: engineering; Owner: -
--

ALTER TABLE ONLY engineering.generated_code
    ADD CONSTRAINT generated_code_pkey PRIMARY KEY (id);


--
-- Name: part_library part_library_pkey; Type: CONSTRAINT; Schema: engineering; Owner: -
--

ALTER TABLE ONLY engineering.part_library
    ADD CONSTRAINT part_library_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: engineering; Owner: -
--

ALTER TABLE ONLY engineering.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: analysis_tasks analysis_tasks_pkey; Type: CONSTRAINT; Schema: law; Owner: -
--

ALTER TABLE ONLY law.analysis_tasks
    ADD CONSTRAINT analysis_tasks_pkey PRIMARY KEY (id);


--
-- Name: document_extractions document_extractions_pkey; Type: CONSTRAINT; Schema: law; Owner: -
--

ALTER TABLE ONLY law.document_extractions
    ADD CONSTRAINT document_extractions_pkey PRIMARY KEY (id);


--
-- Name: execution_steps execution_steps_pkey; Type: CONSTRAINT; Schema: law; Owner: -
--

ALTER TABLE ONLY law.execution_steps
    ADD CONSTRAINT execution_steps_pkey PRIMARY KEY (id);


--
-- Name: playbooks playbooks_pkey; Type: CONSTRAINT; Schema: law; Owner: -
--

ALTER TABLE ONLY law.playbooks
    ADD CONSTRAINT playbooks_pkey PRIMARY KEY (slug);


--
-- Name: specialist_outputs specialist_outputs_pkey; Type: CONSTRAINT; Schema: law; Owner: -
--

ALTER TABLE ONLY law.specialist_outputs
    ADD CONSTRAINT specialist_outputs_pkey PRIMARY KEY (id);


--
-- Name: agent_idea_submissions agent_idea_submissions_pkey; Type: CONSTRAINT; Schema: leads; Owner: -
--

ALTER TABLE ONLY leads.agent_idea_submissions
    ADD CONSTRAINT agent_idea_submissions_pkey PRIMARY KEY (id);


--
-- Name: agent_llm_configs agent_llm_configs_agent_slug_llm_provider_llm_model_key; Type: CONSTRAINT; Schema: marketing; Owner: -
--

ALTER TABLE ONLY marketing.agent_llm_configs
    ADD CONSTRAINT agent_llm_configs_agent_slug_llm_provider_llm_model_key UNIQUE (agent_slug, llm_provider, llm_model);


--
-- Name: agent_llm_configs agent_llm_configs_pkey; Type: CONSTRAINT; Schema: marketing; Owner: -
--

ALTER TABLE ONLY marketing.agent_llm_configs
    ADD CONSTRAINT agent_llm_configs_pkey PRIMARY KEY (id);


--
-- Name: agents agents_pkey; Type: CONSTRAINT; Schema: marketing; Owner: -
--

ALTER TABLE ONLY marketing.agents
    ADD CONSTRAINT agents_pkey PRIMARY KEY (slug);


--
-- Name: content_types content_types_pkey; Type: CONSTRAINT; Schema: marketing; Owner: -
--

ALTER TABLE ONLY marketing.content_types
    ADD CONSTRAINT content_types_pkey PRIMARY KEY (slug);


--
-- Name: evaluations evaluations_pkey; Type: CONSTRAINT; Schema: marketing; Owner: -
--

ALTER TABLE ONLY marketing.evaluations
    ADD CONSTRAINT evaluations_pkey PRIMARY KEY (id);


--
-- Name: execution_queue execution_queue_pkey; Type: CONSTRAINT; Schema: marketing; Owner: -
--

ALTER TABLE ONLY marketing.execution_queue
    ADD CONSTRAINT execution_queue_pkey PRIMARY KEY (id);


--
-- Name: output_versions output_versions_output_id_version_number_key; Type: CONSTRAINT; Schema: marketing; Owner: -
--

ALTER TABLE ONLY marketing.output_versions
    ADD CONSTRAINT output_versions_output_id_version_number_key UNIQUE (output_id, version_number);


--
-- Name: output_versions output_versions_pkey; Type: CONSTRAINT; Schema: marketing; Owner: -
--

ALTER TABLE ONLY marketing.output_versions
    ADD CONSTRAINT output_versions_pkey PRIMARY KEY (id);


--
-- Name: outputs outputs_pkey; Type: CONSTRAINT; Schema: marketing; Owner: -
--

ALTER TABLE ONLY marketing.outputs
    ADD CONSTRAINT outputs_pkey PRIMARY KEY (id);


--
-- Name: swarm_tasks swarm_tasks_pkey; Type: CONSTRAINT; Schema: marketing; Owner: -
--

ALTER TABLE ONLY marketing.swarm_tasks
    ADD CONSTRAINT swarm_tasks_pkey PRIMARY KEY (task_id);


--
-- Name: channel_messages channel_messages_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.channel_messages
    ADD CONSTRAINT channel_messages_pkey PRIMARY KEY (id);


--
-- Name: channels channels_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.channels
    ADD CONSTRAINT channels_pkey PRIMARY KEY (id);


--
-- Name: efforts efforts_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.efforts
    ADD CONSTRAINT efforts_pkey PRIMARY KEY (id);


--
-- Name: journey_templates journey_templates_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.journey_templates
    ADD CONSTRAINT journey_templates_pkey PRIMARY KEY (id);


--
-- Name: journey_templates journey_templates_slug_key; Type: CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.journey_templates
    ADD CONSTRAINT journey_templates_slug_key UNIQUE (slug);


--
-- Name: learning_progress learning_progress_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.learning_progress
    ADD CONSTRAINT learning_progress_pkey PRIMARY KEY (id);


--
-- Name: learning_progress learning_progress_user_id_organization_slug_milestone_key_key; Type: CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.learning_progress
    ADD CONSTRAINT learning_progress_user_id_organization_slug_milestone_key_key UNIQUE (user_id, organization_slug, milestone_key);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: shared_tasks shared_tasks_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.shared_tasks
    ADD CONSTRAINT shared_tasks_pkey PRIMARY KEY (id);


--
-- Name: sprints sprints_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.sprints
    ADD CONSTRAINT sprints_pkey PRIMARY KEY (id);


--
-- Name: task_collaborators task_collaborators_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.task_collaborators
    ADD CONSTRAINT task_collaborators_pkey PRIMARY KEY (id);


--
-- Name: task_update_requests task_update_requests_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.task_update_requests
    ADD CONSTRAINT task_update_requests_pkey PRIMARY KEY (id);


--
-- Name: task_watchers task_watchers_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.task_watchers
    ADD CONSTRAINT task_watchers_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: team_files team_files_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.team_files
    ADD CONSTRAINT team_files_pkey PRIMARY KEY (id);


--
-- Name: timer_state timer_state_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.timer_state
    ADD CONSTRAINT timer_state_pkey PRIMARY KEY (id);


--
-- Name: user_presence user_presence_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.user_presence
    ADD CONSTRAINT user_presence_pkey PRIMARY KEY (user_id);


--
-- Name: agent_self_modification_log agent_self_modification_log_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.agent_self_modification_log
    ADD CONSTRAINT agent_self_modification_log_pkey PRIMARY KEY (id);


--
-- Name: analyst_adaptation_diffs analyst_adaptation_diffs_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analyst_adaptation_diffs
    ADD CONSTRAINT analyst_adaptation_diffs_pkey PRIMARY KEY (id);


--
-- Name: analyst_assessments analyst_assessments_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analyst_assessments
    ADD CONSTRAINT analyst_assessments_pkey PRIMARY KEY (id);


--
-- Name: analyst_context_versions analyst_context_versions_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analyst_context_versions
    ADD CONSTRAINT analyst_context_versions_pkey PRIMARY KEY (id);


--
-- Name: analyst_overrides analyst_overrides_analyst_id_universe_id_target_id_key; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analyst_overrides
    ADD CONSTRAINT analyst_overrides_analyst_id_universe_id_target_id_key UNIQUE (analyst_id, universe_id, target_id);


--
-- Name: analyst_overrides analyst_overrides_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analyst_overrides
    ADD CONSTRAINT analyst_overrides_pkey PRIMARY KEY (id);


--
-- Name: analyst_performance_metrics analyst_performance_metrics_analyst_id_fork_type_metric_dat_key; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analyst_performance_metrics
    ADD CONSTRAINT analyst_performance_metrics_analyst_id_fork_type_metric_dat_key UNIQUE (analyst_id, fork_type, metric_date);


--
-- Name: analyst_performance_metrics analyst_performance_metrics_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analyst_performance_metrics
    ADD CONSTRAINT analyst_performance_metrics_pkey PRIMARY KEY (id);


--
-- Name: analyst_portfolios analyst_portfolios_analyst_id_fork_type_key; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analyst_portfolios
    ADD CONSTRAINT analyst_portfolios_analyst_id_fork_type_key UNIQUE (analyst_id, fork_type);


--
-- Name: analyst_portfolios analyst_portfolios_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analyst_portfolios
    ADD CONSTRAINT analyst_portfolios_pkey PRIMARY KEY (id);


--
-- Name: analyst_positions analyst_positions_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analyst_positions
    ADD CONSTRAINT analyst_positions_pkey PRIMARY KEY (id);


--
-- Name: analysts analysts_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analysts
    ADD CONSTRAINT analysts_pkey PRIMARY KEY (id);


--
-- Name: daily_postmortem_recommendations daily_postmortem_recommendations_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.daily_postmortem_recommendations
    ADD CONSTRAINT daily_postmortem_recommendations_pkey PRIMARY KEY (id);


--
-- Name: daily_postmortem_runs daily_postmortem_runs_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.daily_postmortem_runs
    ADD CONSTRAINT daily_postmortem_runs_pkey PRIMARY KEY (id);


--
-- Name: eod_settlement_log eod_settlement_log_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.eod_settlement_log
    ADD CONSTRAINT eod_settlement_log_pkey PRIMARY KEY (id);


--
-- Name: eod_settlement_log eod_settlement_log_settlement_date_key; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.eod_settlement_log
    ADD CONSTRAINT eod_settlement_log_settlement_date_key UNIQUE (settlement_date);


--
-- Name: evaluations evaluations_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.evaluations
    ADD CONSTRAINT evaluations_pkey PRIMARY KEY (id);


--
-- Name: evaluations evaluations_prediction_id_key; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.evaluations
    ADD CONSTRAINT evaluations_prediction_id_key UNIQUE (prediction_id);


--
-- Name: fork_learning_exchanges fork_learning_exchanges_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.fork_learning_exchanges
    ADD CONSTRAINT fork_learning_exchanges_pkey PRIMARY KEY (id);


--
-- Name: learning_lineage learning_lineage_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.learning_lineage
    ADD CONSTRAINT learning_lineage_pkey PRIMARY KEY (id);


--
-- Name: learning_queue learning_queue_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.learning_queue
    ADD CONSTRAINT learning_queue_pkey PRIMARY KEY (id);


--
-- Name: learnings learnings_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.learnings
    ADD CONSTRAINT learnings_pkey PRIMARY KEY (id);


--
-- Name: missed_opportunities missed_opportunities_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.missed_opportunities
    ADD CONSTRAINT missed_opportunities_pkey PRIMARY KEY (id);


--
-- Name: position_sizing_config position_sizing_config_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.position_sizing_config
    ADD CONSTRAINT position_sizing_config_pkey PRIMARY KEY (id);


--
-- Name: position_sizing_config position_sizing_config_tier_unique; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.position_sizing_config
    ADD CONSTRAINT position_sizing_config_tier_unique UNIQUE (org_slug, tier_name);


--
-- Name: predictions predictions_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.predictions
    ADD CONSTRAINT predictions_pkey PRIMARY KEY (id);


--
-- Name: predictors predictors_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.predictors
    ADD CONSTRAINT predictors_pkey PRIMARY KEY (id);


--
-- Name: replay_test_results replay_test_results_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.replay_test_results
    ADD CONSTRAINT replay_test_results_pkey PRIMARY KEY (id);


--
-- Name: replay_test_snapshots replay_test_snapshots_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.replay_test_snapshots
    ADD CONSTRAINT replay_test_snapshots_pkey PRIMARY KEY (id);


--
-- Name: replay_tests replay_tests_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.replay_tests
    ADD CONSTRAINT replay_tests_pkey PRIMARY KEY (id);


--
-- Name: review_queue review_queue_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.review_queue
    ADD CONSTRAINT review_queue_pkey PRIMARY KEY (id);


--
-- Name: review_queue review_queue_signal_id_key; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.review_queue
    ADD CONSTRAINT review_queue_signal_id_key UNIQUE (signal_id);


--
-- Name: runner_context_versions runner_context_versions_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.runner_context_versions
    ADD CONSTRAINT runner_context_versions_pkey PRIMARY KEY (id);


--
-- Name: scenario_runs scenario_runs_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.scenario_runs
    ADD CONSTRAINT scenario_runs_pkey PRIMARY KEY (id);


--
-- Name: signals signals_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.signals
    ADD CONSTRAINT signals_pkey PRIMARY KEY (id);


--
-- Name: snapshots snapshots_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.snapshots
    ADD CONSTRAINT snapshots_pkey PRIMARY KEY (id);


--
-- Name: source_subscriptions source_subscriptions_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.source_subscriptions
    ADD CONSTRAINT source_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: source_subscriptions source_subscriptions_source_id_target_id_key; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.source_subscriptions
    ADD CONSTRAINT source_subscriptions_source_id_target_id_key UNIQUE (source_id, target_id);


--
-- Name: strategies strategies_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.strategies
    ADD CONSTRAINT strategies_pkey PRIMARY KEY (id);


--
-- Name: strategies strategies_slug_key; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.strategies
    ADD CONSTRAINT strategies_slug_key UNIQUE (slug);


--
-- Name: target_context_versions target_context_versions_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.target_context_versions
    ADD CONSTRAINT target_context_versions_pkey PRIMARY KEY (id);


--
-- Name: target_snapshots target_snapshots_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.target_snapshots
    ADD CONSTRAINT target_snapshots_pkey PRIMARY KEY (id);


--
-- Name: targets targets_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.targets
    ADD CONSTRAINT targets_pkey PRIMARY KEY (id);


--
-- Name: targets targets_universe_id_symbol_key; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.targets
    ADD CONSTRAINT targets_universe_id_symbol_key UNIQUE (universe_id, symbol);


--
-- Name: test_articles test_articles_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.test_articles
    ADD CONSTRAINT test_articles_pkey PRIMARY KEY (id);


--
-- Name: test_audit_log test_audit_log_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.test_audit_log
    ADD CONSTRAINT test_audit_log_pkey PRIMARY KEY (id);


--
-- Name: test_price_data test_price_data_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.test_price_data
    ADD CONSTRAINT test_price_data_pkey PRIMARY KEY (id);


--
-- Name: test_scenarios test_scenarios_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.test_scenarios
    ADD CONSTRAINT test_scenarios_pkey PRIMARY KEY (id);


--
-- Name: test_target_mirrors test_target_mirrors_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.test_target_mirrors
    ADD CONSTRAINT test_target_mirrors_pkey PRIMARY KEY (id);


--
-- Name: tool_requests tool_requests_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.tool_requests
    ADD CONSTRAINT tool_requests_pkey PRIMARY KEY (id);


--
-- Name: universe_context_versions universe_context_versions_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.universe_context_versions
    ADD CONSTRAINT universe_context_versions_pkey PRIMARY KEY (id);


--
-- Name: universes universes_organization_slug_agent_slug_name_key; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.universes
    ADD CONSTRAINT universes_organization_slug_agent_slug_name_key UNIQUE (organization_slug, agent_slug, name);


--
-- Name: universes universes_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.universes
    ADD CONSTRAINT universes_pkey PRIMARY KEY (id);


--
-- Name: test_price_data uq_test_price_data_symbol_timestamp; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.test_price_data
    ADD CONSTRAINT uq_test_price_data_symbol_timestamp UNIQUE (organization_slug, symbol, price_timestamp);


--
-- Name: test_target_mirrors uq_test_target_mirrors_real; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.test_target_mirrors
    ADD CONSTRAINT uq_test_target_mirrors_real UNIQUE (real_target_id);


--
-- Name: test_target_mirrors uq_test_target_mirrors_test; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.test_target_mirrors
    ADD CONSTRAINT uq_test_target_mirrors_test UNIQUE (test_target_id);


--
-- Name: user_portfolios user_portfolios_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.user_portfolios
    ADD CONSTRAINT user_portfolios_pkey PRIMARY KEY (id);


--
-- Name: user_portfolios user_portfolios_user_id_org_slug_key; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.user_portfolios
    ADD CONSTRAINT user_portfolios_user_id_org_slug_key UNIQUE (user_id, org_slug);


--
-- Name: user_positions user_positions_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.user_positions
    ADD CONSTRAINT user_positions_pkey PRIMARY KEY (id);


--
-- Name: user_trade_queue user_trade_queue_pkey; Type: CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.user_trade_queue
    ADD CONSTRAINT user_trade_queue_pkey PRIMARY KEY (id);


--
-- Name: agents agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_pkey PRIMARY KEY (slug);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: channel_message_log channel_message_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_message_log
    ADD CONSTRAINT channel_message_log_pkey PRIMARY KEY (id);


--
-- Name: channel_users channel_users_channel_channel_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_users
    ADD CONSTRAINT channel_users_channel_channel_user_id_key UNIQUE (channel, channel_user_id);


--
-- Name: channel_users channel_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_users
    ADD CONSTRAINT channel_users_pkey PRIMARY KEY (id);


--
-- Name: checkpoint_blobs checkpoint_blobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoint_blobs
    ADD CONSTRAINT checkpoint_blobs_pkey PRIMARY KEY (thread_id, checkpoint_ns, channel, version);


--
-- Name: checkpoint_migrations checkpoint_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoint_migrations
    ADD CONSTRAINT checkpoint_migrations_pkey PRIMARY KEY (v);


--
-- Name: checkpoint_writes checkpoint_writes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoint_writes
    ADD CONSTRAINT checkpoint_writes_pkey PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx);


--
-- Name: checkpoints checkpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoints
    ADD CONSTRAINT checkpoints_pkey PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id);


--
-- Name: cidafm_commands cidafm_commands_command_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cidafm_commands
    ADD CONSTRAINT cidafm_commands_command_name_key UNIQUE (command_name);


--
-- Name: cidafm_commands cidafm_commands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cidafm_commands
    ADD CONSTRAINT cidafm_commands_pkey PRIMARY KEY (id);


--
-- Name: conversation_messages conversation_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_messages
    ADD CONSTRAINT conversation_messages_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: human_approvals human_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.human_approvals
    ADD CONSTRAINT human_approvals_pkey PRIMARY KEY (id);


--
-- Name: llm_models llm_models_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_models
    ADD CONSTRAINT llm_models_pkey PRIMARY KEY (model_name, provider_name);


--
-- Name: llm_providers llm_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_providers
    ADD CONSTRAINT llm_providers_pkey PRIMARY KEY (name);


--
-- Name: llm_usage llm_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_usage
    ADD CONSTRAINT llm_usage_pkey PRIMARY KEY (id);


--
-- Name: observability_events observability_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.observability_events
    ADD CONSTRAINT observability_events_pkey PRIMARY KEY (id);


--
-- Name: organization_credentials organization_credentials_organization_slug_credential_type__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_credentials
    ADD CONSTRAINT organization_credentials_organization_slug_credential_type__key UNIQUE (organization_slug, credential_type, credential_key);


--
-- Name: organization_credentials organization_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_credentials
    ADD CONSTRAINT organization_credentials_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (slug);


--
-- Name: pseudonym_dictionaries pseudonym_dictionaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pseudonym_dictionaries
    ADD CONSTRAINT pseudonym_dictionaries_pkey PRIMARY KEY (id);


--
-- Name: pseudonym_dictionaries pseudonym_dictionaries_user_id_conversation_id_entity_type__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pseudonym_dictionaries
    ADD CONSTRAINT pseudonym_dictionaries_user_id_conversation_id_entity_type__key UNIQUE (user_id, conversation_id, entity_type, original_value);


--
-- Name: redaction_patterns redaction_patterns_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redaction_patterns
    ADD CONSTRAINT redaction_patterns_name_key UNIQUE (name);


--
-- Name: redaction_patterns redaction_patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redaction_patterns
    ADD CONSTRAINT redaction_patterns_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (key);


--
-- Name: task_messages task_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_messages
    ADD CONSTRAINT task_messages_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);


--
-- Name: team_members team_members_team_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_team_id_user_id_key UNIQUE (team_id, user_id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: user_cidafm_commands user_cidafm_commands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_cidafm_commands
    ADD CONSTRAINT user_cidafm_commands_pkey PRIMARY KEY (id);


--
-- Name: user_cidafm_commands user_cidafm_commands_user_id_command_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_cidafm_commands
    ADD CONSTRAINT user_cidafm_commands_user_id_command_id_key UNIQUE (user_id, command_id);


--
-- Name: rag_collections rag_collections_organization_slug_slug_key; Type: CONSTRAINT; Schema: rag_data; Owner: -
--

ALTER TABLE ONLY rag_data.rag_collections
    ADD CONSTRAINT rag_collections_organization_slug_slug_key UNIQUE (organization_slug, slug);


--
-- Name: rag_collections rag_collections_pkey; Type: CONSTRAINT; Schema: rag_data; Owner: -
--

ALTER TABLE ONLY rag_data.rag_collections
    ADD CONSTRAINT rag_collections_pkey PRIMARY KEY (id);


--
-- Name: rag_document_chunks rag_document_chunks_pkey; Type: CONSTRAINT; Schema: rag_data; Owner: -
--

ALTER TABLE ONLY rag_data.rag_document_chunks
    ADD CONSTRAINT rag_document_chunks_pkey PRIMARY KEY (id);


--
-- Name: rag_documents rag_documents_pkey; Type: CONSTRAINT; Schema: rag_data; Owner: -
--

ALTER TABLE ONLY rag_data.rag_documents
    ADD CONSTRAINT rag_documents_pkey PRIMARY KEY (id);


--
-- Name: alerts alerts_pkey; Type: CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.alerts
    ADD CONSTRAINT alerts_pkey PRIMARY KEY (id);


--
-- Name: article_classifications article_classifications_pkey; Type: CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.article_classifications
    ADD CONSTRAINT article_classifications_pkey PRIMARY KEY (id);


--
-- Name: article_classifications article_classifications_scope_id_article_id_key; Type: CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.article_classifications
    ADD CONSTRAINT article_classifications_scope_id_article_id_key UNIQUE (scope_id, article_id);


--
-- Name: assessments assessments_pkey; Type: CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.assessments
    ADD CONSTRAINT assessments_pkey PRIMARY KEY (id);


--
-- Name: assessments assessments_subject_dimension_unique; Type: CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.assessments
    ADD CONSTRAINT assessments_subject_dimension_unique UNIQUE (subject_id, dimension_id);


--
-- Name: comparisons comparisons_pkey; Type: CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.comparisons
    ADD CONSTRAINT comparisons_pkey PRIMARY KEY (id);


--
-- Name: composite_scores composite_scores_pkey; Type: CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.composite_scores
    ADD CONSTRAINT composite_scores_pkey PRIMARY KEY (id);


--
-- Name: data_source_fetch_history data_source_fetch_history_pkey; Type: CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.data_source_fetch_history
    ADD CONSTRAINT data_source_fetch_history_pkey PRIMARY KEY (id);


--
-- Name: data_sources data_sources_pkey; Type: CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.data_sources
    ADD CONSTRAINT data_sources_pkey PRIMARY KEY (id);


--
-- Name: debate_contexts debate_contexts_pkey; Type: CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.debate_contexts
    ADD CONSTRAINT debate_contexts_pkey PRIMARY KEY (id);


--
-- Name: debate_contexts debate_contexts_scope_id_role_version_key; Type: CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.debate_contexts
    ADD CONSTRAINT debate_contexts_scope_id_role_version_key UNIQUE (scope_id, role, version);


--
-- Name: debates debates_pkey; Type: CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.debates
    ADD CONSTRAINT debates_pkey PRIMARY KEY (id);


--
-- Name: dimension_contexts dimension_contexts_dimension_id_version_key; Type: CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.dimension_contexts
    ADD CONSTRAINT dimension_contexts_dimension_id_version_key UNIQUE (dimension_id, version);


--
-- Name: dimension_contexts dimension_contexts_pkey; Type: CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.dimension_contexts
    ADD CONSTRAINT dimension_contexts_pkey PRIMARY KEY (id);


--
-- Name: dimensions dimensions_pkey; Type: CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.dimensions
    ADD CONSTRAINT dimensions_pkey PRIMARY KEY (id);


--
-- Name: dimensions dimensions_scope_id_slug_key; Type: CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.dimensions
    ADD CONSTRAINT dimensions_scope_id_slug_key UNIQUE (scope_id, slug);


--
-- Name: evaluations evaluations_pkey; Type: CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.evaluations
    ADD CONSTRAINT evaluations_pkey PRIMARY KEY (id);


--
-- Name: executive_summaries executive_summaries_pkey; Type: CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.executive_summaries
    ADD CONSTRAINT executive_summaries_pkey PRIMARY KEY (id);


--
-- Name: learning_queue learning_queue_pkey; Type: CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.learning_queue
    ADD CONSTRAINT learning_queue_pkey PRIMARY KEY (id);


--
-- Name: learnings learnings_pkey; Type: CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.learnings
    ADD CONSTRAINT learnings_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: scenarios scenarios_pkey; Type: CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.scenarios
    ADD CONSTRAINT scenarios_pkey PRIMARY KEY (id);


--
-- Name: scopes scopes_pkey; Type: CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.scopes
    ADD CONSTRAINT scopes_pkey PRIMARY KEY (id);


--
-- Name: simulations simulations_pkey; Type: CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.simulations
    ADD CONSTRAINT simulations_pkey PRIMARY KEY (id);


--
-- Name: source_subscriptions source_subscriptions_pkey; Type: CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.source_subscriptions
    ADD CONSTRAINT source_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: source_subscriptions source_subscriptions_source_id_scope_id_key; Type: CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.source_subscriptions
    ADD CONSTRAINT source_subscriptions_source_id_scope_id_key UNIQUE (source_id, scope_id);


--
-- Name: subjects subjects_pkey; Type: CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.subjects
    ADD CONSTRAINT subjects_pkey PRIMARY KEY (id);


--
-- Name: subjects subjects_scope_id_identifier_key; Type: CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.subjects
    ADD CONSTRAINT subjects_scope_id_identifier_key UNIQUE (scope_id, identifier);


--
-- Name: idx_a2a_messages_created_at; Type: INDEX; Schema: ambient; Owner: -
--

CREATE INDEX idx_a2a_messages_created_at ON ambient.a2a_messages USING btree (created_at);


--
-- Name: idx_a2a_messages_direction; Type: INDEX; Schema: ambient; Owner: -
--

CREATE INDEX idx_a2a_messages_direction ON ambient.a2a_messages USING btree (direction);


--
-- Name: idx_a2a_messages_external_agent; Type: INDEX; Schema: ambient; Owner: -
--

CREATE INDEX idx_a2a_messages_external_agent ON ambient.a2a_messages USING btree (external_agent_id);


--
-- Name: idx_a2a_messages_org_direction_created; Type: INDEX; Schema: ambient; Owner: -
--

CREATE INDEX idx_a2a_messages_org_direction_created ON ambient.a2a_messages USING btree (org_slug, direction, created_at DESC);


--
-- Name: idx_a2a_messages_org_slug; Type: INDEX; Schema: ambient; Owner: -
--

CREATE INDEX idx_a2a_messages_org_slug ON ambient.a2a_messages USING btree (org_slug);


--
-- Name: idx_a2a_messages_status; Type: INDEX; Schema: ambient; Owner: -
--

CREATE INDEX idx_a2a_messages_status ON ambient.a2a_messages USING btree (status);


--
-- Name: idx_ambient_adapter_state_trigger_id; Type: INDEX; Schema: ambient; Owner: -
--

CREATE UNIQUE INDEX idx_ambient_adapter_state_trigger_id ON ambient.adapter_state USING btree (trigger_id);


--
-- Name: idx_ambient_executions_dedupe_key; Type: INDEX; Schema: ambient; Owner: -
--

CREATE UNIQUE INDEX idx_ambient_executions_dedupe_key ON ambient.trigger_executions USING btree (dedupe_key) WHERE (dedupe_key IS NOT NULL);


--
-- Name: idx_ambient_executions_fired_at; Type: INDEX; Schema: ambient; Owner: -
--

CREATE INDEX idx_ambient_executions_fired_at ON ambient.trigger_executions USING btree (fired_at);


--
-- Name: idx_ambient_executions_product; Type: INDEX; Schema: ambient; Owner: -
--

CREATE INDEX idx_ambient_executions_product ON ambient.trigger_executions USING btree (product);


--
-- Name: idx_ambient_executions_status; Type: INDEX; Schema: ambient; Owner: -
--

CREATE INDEX idx_ambient_executions_status ON ambient.trigger_executions USING btree (status);


--
-- Name: idx_ambient_executions_trigger_fired_at; Type: INDEX; Schema: ambient; Owner: -
--

CREATE INDEX idx_ambient_executions_trigger_fired_at ON ambient.trigger_executions USING btree (trigger_id, fired_at);


--
-- Name: idx_ambient_executions_trigger_id; Type: INDEX; Schema: ambient; Owner: -
--

CREATE INDEX idx_ambient_executions_trigger_id ON ambient.trigger_executions USING btree (trigger_id);


--
-- Name: idx_ambient_executions_trigger_status; Type: INDEX; Schema: ambient; Owner: -
--

CREATE INDEX idx_ambient_executions_trigger_status ON ambient.trigger_executions USING btree (trigger_id, status);


--
-- Name: idx_ambient_triggers_org_enabled; Type: INDEX; Schema: ambient; Owner: -
--

CREATE INDEX idx_ambient_triggers_org_enabled ON ambient.triggers USING btree (org_slug, enabled);


--
-- Name: idx_ambient_triggers_org_slug; Type: INDEX; Schema: ambient; Owner: -
--

CREATE INDEX idx_ambient_triggers_org_slug ON ambient.triggers USING btree (org_slug);


--
-- Name: idx_ambient_triggers_org_source_type; Type: INDEX; Schema: ambient; Owner: -
--

CREATE INDEX idx_ambient_triggers_org_source_type ON ambient.triggers USING btree (org_slug, source_type);


--
-- Name: idx_ambient_triggers_product; Type: INDEX; Schema: ambient; Owner: -
--

CREATE INDEX idx_ambient_triggers_product ON ambient.triggers USING btree (product);


--
-- Name: idx_ambient_triggers_source_type; Type: INDEX; Schema: ambient; Owner: -
--

CREATE INDEX idx_ambient_triggers_source_type ON ambient.triggers USING btree (source_type);


--
-- Name: idx_external_agents_org_slug; Type: INDEX; Schema: ambient; Owner: -
--

CREATE INDEX idx_external_agents_org_slug ON ambient.external_agents USING btree (org_slug);


--
-- Name: idx_external_agents_status; Type: INDEX; Schema: ambient; Owner: -
--

CREATE INDEX idx_external_agents_status ON ambient.external_agents USING btree (status);


--
-- Name: idx_external_agents_trust_level; Type: INDEX; Schema: ambient; Owner: -
--

CREATE INDEX idx_external_agents_trust_level ON ambient.external_agents USING btree (org_slug, trust_level);


--
-- Name: idx_auth_identity_links_user_id; Type: INDEX; Schema: authz; Owner: -
--

CREATE INDEX idx_auth_identity_links_user_id ON authz.auth_identity_links USING btree (user_id);


--
-- Name: idx_rbac_audit_actor; Type: INDEX; Schema: authz; Owner: -
--

CREATE INDEX idx_rbac_audit_actor ON authz.rbac_audit_log USING btree (actor_id);


--
-- Name: idx_rbac_audit_created; Type: INDEX; Schema: authz; Owner: -
--

CREATE INDEX idx_rbac_audit_created ON authz.rbac_audit_log USING btree (created_at DESC);


--
-- Name: idx_rbac_audit_target; Type: INDEX; Schema: authz; Owner: -
--

CREATE INDEX idx_rbac_audit_target ON authz.rbac_audit_log USING btree (target_user_id);


--
-- Name: idx_role_permissions_resource; Type: INDEX; Schema: authz; Owner: -
--

CREATE INDEX idx_role_permissions_resource ON authz.rbac_role_permissions USING btree (resource_type, resource_id) WHERE (resource_type IS NOT NULL);


--
-- Name: idx_role_permissions_role; Type: INDEX; Schema: authz; Owner: -
--

CREATE INDEX idx_role_permissions_role ON authz.rbac_role_permissions USING btree (role_id);


--
-- Name: idx_user_org_roles_org; Type: INDEX; Schema: authz; Owner: -
--

CREATE INDEX idx_user_org_roles_org ON authz.rbac_user_org_roles USING btree (organization_slug);


--
-- Name: idx_user_org_roles_user; Type: INDEX; Schema: authz; Owner: -
--

CREATE INDEX idx_user_org_roles_user ON authz.rbac_user_org_roles USING btree (user_id);


--
-- Name: idx_user_org_roles_user_org; Type: INDEX; Schema: authz; Owner: -
--

CREATE INDEX idx_user_org_roles_user_org ON authz.rbac_user_org_roles USING btree (user_id, organization_slug);


--
-- Name: org_entitlements_org_slug_idx; Type: INDEX; Schema: authz; Owner: -
--

CREATE INDEX org_entitlements_org_slug_idx ON authz.org_entitlements USING btree (org_slug);


--
-- Name: users_email_idx; Type: INDEX; Schema: authz; Owner: -
--

CREATE INDEX users_email_idx ON authz.users USING btree (email);


--
-- Name: users_organization_slug_idx; Type: INDEX; Schema: authz; Owner: -
--

CREATE INDEX users_organization_slug_idx ON authz.users USING btree (organization_slug);


--
-- Name: users_status_idx; Type: INDEX; Schema: authz; Owner: -
--

CREATE INDEX users_status_idx ON authz.users USING btree (status);


--
-- Name: idx_fix_attempts_issue; Type: INDEX; Schema: code_ops; Owner: -
--

CREATE INDEX idx_fix_attempts_issue ON code_ops.fix_attempts USING btree (issue_id);


--
-- Name: idx_fix_attempts_scan; Type: INDEX; Schema: code_ops; Owner: -
--

CREATE INDEX idx_fix_attempts_scan ON code_ops.fix_attempts USING btree (scan_id);


--
-- Name: idx_pivot_learnings_agent; Type: INDEX; Schema: code_ops; Owner: -
--

CREATE INDEX idx_pivot_learnings_agent ON code_ops.pivot_learnings USING btree (agent_type);


--
-- Name: idx_pivot_learnings_applies; Type: INDEX; Schema: code_ops; Owner: -
--

CREATE INDEX idx_pivot_learnings_applies ON code_ops.pivot_learnings USING gin (applies_to);


--
-- Name: idx_pivot_learnings_failure; Type: INDEX; Schema: code_ops; Owner: -
--

CREATE INDEX idx_pivot_learnings_failure ON code_ops.pivot_learnings USING btree (failure_type);


--
-- Name: idx_quality_issues_app; Type: INDEX; Schema: code_ops; Owner: -
--

CREATE INDEX idx_quality_issues_app ON code_ops.quality_issues USING btree (app);


--
-- Name: idx_quality_issues_claimed; Type: INDEX; Schema: code_ops; Owner: -
--

CREATE INDEX idx_quality_issues_claimed ON code_ops.quality_issues USING btree (claimed_at) WHERE (status = 'claimed'::text);


--
-- Name: idx_quality_issues_file; Type: INDEX; Schema: code_ops; Owner: -
--

CREATE INDEX idx_quality_issues_file ON code_ops.quality_issues USING btree (file_path);


--
-- Name: idx_quality_issues_priority; Type: INDEX; Schema: code_ops; Owner: -
--

CREATE INDEX idx_quality_issues_priority ON code_ops.quality_issues USING btree (priority);


--
-- Name: idx_quality_issues_status; Type: INDEX; Schema: code_ops; Owner: -
--

CREATE INDEX idx_quality_issues_status ON code_ops.quality_issues USING btree (status);


--
-- Name: idx_quality_issues_type; Type: INDEX; Schema: code_ops; Owner: -
--

CREATE INDEX idx_quality_issues_type ON code_ops.quality_issues USING btree (error_type);


--
-- Name: idx_scan_runs_started; Type: INDEX; Schema: code_ops; Owner: -
--

CREATE INDEX idx_scan_runs_started ON code_ops.scan_runs USING btree (started_at);


--
-- Name: idx_scan_runs_type; Type: INDEX; Schema: code_ops; Owner: -
--

CREATE INDEX idx_scan_runs_type ON code_ops.scan_runs USING btree (scan_type);


--
-- Name: uq_quality_issues_fingerprint; Type: INDEX; Schema: code_ops; Owner: -
--

CREATE UNIQUE INDEX uq_quality_issues_fingerprint ON code_ops.quality_issues USING btree (issue_fingerprint);


--
-- Name: idx_companies_industry; Type: INDEX; Schema: company; Owner: -
--

CREATE INDEX idx_companies_industry ON company.companies USING btree (industry);


--
-- Name: idx_companies_name; Type: INDEX; Schema: company; Owner: -
--

CREATE INDEX idx_companies_name ON company.companies USING btree (name);


--
-- Name: idx_companies_size; Type: INDEX; Schema: company; Owner: -
--

CREATE INDEX idx_companies_size ON company.companies USING btree (size);


--
-- Name: idx_discovery_signals_batch; Type: INDEX; Schema: company; Owner: -
--

CREATE INDEX idx_discovery_signals_batch ON company.discovery_signals USING btree (batch_date DESC);


--
-- Name: idx_discovery_signals_company; Type: INDEX; Schema: company; Owner: -
--

CREATE INDEX idx_discovery_signals_company ON company.discovery_signals USING btree (company_id);


--
-- Name: idx_discovery_signals_type; Type: INDEX; Schema: company; Owner: -
--

CREATE INDEX idx_discovery_signals_type ON company.discovery_signals USING btree (signal_type);


--
-- Name: idx_outreach_batch; Type: INDEX; Schema: company; Owner: -
--

CREATE INDEX idx_outreach_batch ON company.outreach USING btree (batch_date DESC);


--
-- Name: idx_outreach_company; Type: INDEX; Schema: company; Owner: -
--

CREATE INDEX idx_outreach_company ON company.outreach USING btree (company_id);


--
-- Name: idx_outreach_score; Type: INDEX; Schema: company; Owner: -
--

CREATE INDEX idx_outreach_score ON company.outreach USING btree (relevance_score DESC);


--
-- Name: idx_outreach_status; Type: INDEX; Schema: company; Owner: -
--

CREATE INDEX idx_outreach_status ON company.outreach USING btree (status);


--
-- Name: idx_crawler_agent_outputs_article; Type: INDEX; Schema: crawler; Owner: -
--

CREATE INDEX idx_crawler_agent_outputs_article ON crawler.agent_article_outputs USING btree (article_id);


--
-- Name: idx_crawler_agent_outputs_processed; Type: INDEX; Schema: crawler; Owner: -
--

CREATE INDEX idx_crawler_agent_outputs_processed ON crawler.agent_article_outputs USING btree (processed_at DESC);


--
-- Name: idx_crawler_agent_outputs_type; Type: INDEX; Schema: crawler; Owner: -
--

CREATE INDEX idx_crawler_agent_outputs_type ON crawler.agent_article_outputs USING btree (agent_type);


--
-- Name: idx_crawler_articles_content_hash; Type: INDEX; Schema: crawler; Owner: -
--

CREATE INDEX idx_crawler_articles_content_hash ON crawler.articles USING btree (content_hash);


--
-- Name: idx_crawler_articles_fingerprint; Type: INDEX; Schema: crawler; Owner: -
--

CREATE INDEX idx_crawler_articles_fingerprint ON crawler.articles USING btree (fingerprint_hash) WHERE (fingerprint_hash IS NOT NULL);


--
-- Name: idx_crawler_articles_first_seen; Type: INDEX; Schema: crawler; Owner: -
--

CREATE INDEX idx_crawler_articles_first_seen ON crawler.articles USING btree (first_seen_at DESC);


--
-- Name: idx_crawler_articles_is_duplicate; Type: INDEX; Schema: crawler; Owner: -
--

CREATE INDEX idx_crawler_articles_is_duplicate ON crawler.articles USING btree (is_duplicate) WHERE (is_duplicate = false);


--
-- Name: idx_crawler_articles_key_phrases; Type: INDEX; Schema: crawler; Owner: -
--

CREATE INDEX idx_crawler_articles_key_phrases ON crawler.articles USING gin (key_phrases) WHERE (key_phrases IS NOT NULL);


--
-- Name: idx_crawler_articles_org; Type: INDEX; Schema: crawler; Owner: -
--

CREATE INDEX idx_crawler_articles_org ON crawler.articles USING btree (organization_slug);


--
-- Name: idx_crawler_articles_published; Type: INDEX; Schema: crawler; Owner: -
--

CREATE INDEX idx_crawler_articles_published ON crawler.articles USING btree (published_at DESC) WHERE (published_at IS NOT NULL);


--
-- Name: idx_crawler_articles_source; Type: INDEX; Schema: crawler; Owner: -
--

CREATE INDEX idx_crawler_articles_source ON crawler.articles USING btree (source_id);


--
-- Name: idx_crawler_articles_title_normalized; Type: INDEX; Schema: crawler; Owner: -
--

CREATE INDEX idx_crawler_articles_title_normalized ON crawler.articles USING btree (title_normalized) WHERE (title_normalized IS NOT NULL);


--
-- Name: idx_crawler_articles_url; Type: INDEX; Schema: crawler; Owner: -
--

CREATE INDEX idx_crawler_articles_url ON crawler.articles USING btree (url);


--
-- Name: idx_crawler_source_crawls_source; Type: INDEX; Schema: crawler; Owner: -
--

CREATE INDEX idx_crawler_source_crawls_source ON crawler.source_crawls USING btree (source_id);


--
-- Name: idx_crawler_source_crawls_started; Type: INDEX; Schema: crawler; Owner: -
--

CREATE INDEX idx_crawler_source_crawls_started ON crawler.source_crawls USING btree (started_at DESC);


--
-- Name: idx_crawler_source_crawls_status; Type: INDEX; Schema: crawler; Owner: -
--

CREATE INDEX idx_crawler_source_crawls_status ON crawler.source_crawls USING btree (status);


--
-- Name: idx_crawler_sources_active; Type: INDEX; Schema: crawler; Owner: -
--

CREATE INDEX idx_crawler_sources_active ON crawler.sources USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_crawler_sources_crawl_config; Type: INDEX; Schema: crawler; Owner: -
--

CREATE INDEX idx_crawler_sources_crawl_config ON crawler.sources USING gin (crawl_config);


--
-- Name: idx_crawler_sources_due_for_crawl; Type: INDEX; Schema: crawler; Owner: -
--

CREATE INDEX idx_crawler_sources_due_for_crawl ON crawler.sources USING btree (last_crawl_at, crawl_frequency_minutes) WHERE (is_active = true);


--
-- Name: idx_crawler_sources_frequency; Type: INDEX; Schema: crawler; Owner: -
--

CREATE INDEX idx_crawler_sources_frequency ON crawler.sources USING btree (crawl_frequency_minutes);


--
-- Name: idx_crawler_sources_last_crawl; Type: INDEX; Schema: crawler; Owner: -
--

CREATE INDEX idx_crawler_sources_last_crawl ON crawler.sources USING btree (last_crawl_at DESC);


--
-- Name: idx_crawler_sources_org; Type: INDEX; Schema: crawler; Owner: -
--

CREATE INDEX idx_crawler_sources_org ON crawler.sources USING btree (organization_slug);


--
-- Name: idx_crawler_sources_type; Type: INDEX; Schema: crawler; Owner: -
--

CREATE INDEX idx_crawler_sources_type ON crawler.sources USING btree (source_type);


--
-- Name: idx_crawler_sources_url; Type: INDEX; Schema: crawler; Owner: -
--

CREATE INDEX idx_crawler_sources_url ON crawler.sources USING btree (url);


--
-- Name: idx_engineering_cad_outputs_code; Type: INDEX; Schema: engineering; Owner: -
--

CREATE INDEX idx_engineering_cad_outputs_code ON engineering.cad_outputs USING btree (generated_code_id);


--
-- Name: idx_engineering_cad_outputs_drawing; Type: INDEX; Schema: engineering; Owner: -
--

CREATE INDEX idx_engineering_cad_outputs_drawing ON engineering.cad_outputs USING btree (drawing_id);


--
-- Name: idx_engineering_cad_outputs_format; Type: INDEX; Schema: engineering; Owner: -
--

CREATE INDEX idx_engineering_cad_outputs_format ON engineering.cad_outputs USING btree (format);


--
-- Name: idx_engineering_drawings_conversation; Type: INDEX; Schema: engineering; Owner: -
--

CREATE INDEX idx_engineering_drawings_conversation ON engineering.drawings USING btree (conversation_id);


--
-- Name: idx_engineering_drawings_created_at; Type: INDEX; Schema: engineering; Owner: -
--

CREATE INDEX idx_engineering_drawings_created_at ON engineering.drawings USING btree (created_at DESC);


--
-- Name: idx_engineering_drawings_parent; Type: INDEX; Schema: engineering; Owner: -
--

CREATE INDEX idx_engineering_drawings_parent ON engineering.drawings USING btree (parent_drawing_id);


--
-- Name: idx_engineering_drawings_project; Type: INDEX; Schema: engineering; Owner: -
--

CREATE INDEX idx_engineering_drawings_project ON engineering.drawings USING btree (project_id);


--
-- Name: idx_engineering_drawings_status; Type: INDEX; Schema: engineering; Owner: -
--

CREATE INDEX idx_engineering_drawings_status ON engineering.drawings USING btree (status);


--
-- Name: idx_engineering_drawings_task; Type: INDEX; Schema: engineering; Owner: -
--

CREATE INDEX idx_engineering_drawings_task ON engineering.drawings USING btree (task_id);


--
-- Name: idx_engineering_execution_log_created; Type: INDEX; Schema: engineering; Owner: -
--

CREATE INDEX idx_engineering_execution_log_created ON engineering.execution_log USING btree (drawing_id, created_at);


--
-- Name: idx_engineering_execution_log_drawing; Type: INDEX; Schema: engineering; Owner: -
--

CREATE INDEX idx_engineering_execution_log_drawing ON engineering.execution_log USING btree (drawing_id);


--
-- Name: idx_engineering_execution_log_type; Type: INDEX; Schema: engineering; Owner: -
--

CREATE INDEX idx_engineering_execution_log_type ON engineering.execution_log USING btree (step_type);


--
-- Name: idx_engineering_generated_code_attempt; Type: INDEX; Schema: engineering; Owner: -
--

CREATE INDEX idx_engineering_generated_code_attempt ON engineering.generated_code USING btree (drawing_id, attempt_number);


--
-- Name: idx_engineering_generated_code_drawing; Type: INDEX; Schema: engineering; Owner: -
--

CREATE INDEX idx_engineering_generated_code_drawing ON engineering.generated_code USING btree (drawing_id);


--
-- Name: idx_engineering_generated_code_valid; Type: INDEX; Schema: engineering; Owner: -
--

CREATE INDEX idx_engineering_generated_code_valid ON engineering.generated_code USING btree (is_valid);


--
-- Name: idx_engineering_part_library_category; Type: INDEX; Schema: engineering; Owner: -
--

CREATE INDEX idx_engineering_part_library_category ON engineering.part_library USING btree (category);


--
-- Name: idx_engineering_part_library_org; Type: INDEX; Schema: engineering; Owner: -
--

CREATE INDEX idx_engineering_part_library_org ON engineering.part_library USING btree (org_slug);


--
-- Name: idx_engineering_part_library_public; Type: INDEX; Schema: engineering; Owner: -
--

CREATE INDEX idx_engineering_part_library_public ON engineering.part_library USING btree (is_public) WHERE (is_public = true);


--
-- Name: idx_engineering_part_library_tags; Type: INDEX; Schema: engineering; Owner: -
--

CREATE INDEX idx_engineering_part_library_tags ON engineering.part_library USING gin (tags);


--
-- Name: idx_engineering_projects_created_at; Type: INDEX; Schema: engineering; Owner: -
--

CREATE INDEX idx_engineering_projects_created_at ON engineering.projects USING btree (created_at DESC);


--
-- Name: idx_engineering_projects_created_by; Type: INDEX; Schema: engineering; Owner: -
--

CREATE INDEX idx_engineering_projects_created_by ON engineering.projects USING btree (created_by);


--
-- Name: idx_engineering_projects_org; Type: INDEX; Schema: engineering; Owner: -
--

CREATE INDEX idx_engineering_projects_org ON engineering.projects USING btree (org_slug);


--
-- Name: idx_analysis_tasks_conversation; Type: INDEX; Schema: law; Owner: -
--

CREATE INDEX idx_analysis_tasks_conversation ON law.analysis_tasks USING btree (conversation_id);


--
-- Name: idx_analysis_tasks_org; Type: INDEX; Schema: law; Owner: -
--

CREATE INDEX idx_analysis_tasks_org ON law.analysis_tasks USING btree (organization_slug);


--
-- Name: idx_analysis_tasks_status; Type: INDEX; Schema: law; Owner: -
--

CREATE INDEX idx_analysis_tasks_status ON law.analysis_tasks USING btree (status);


--
-- Name: idx_analysis_tasks_task; Type: INDEX; Schema: law; Owner: -
--

CREATE INDEX idx_analysis_tasks_task ON law.analysis_tasks USING btree (task_id);


--
-- Name: idx_analysis_tasks_user; Type: INDEX; Schema: law; Owner: -
--

CREATE INDEX idx_analysis_tasks_user ON law.analysis_tasks USING btree (user_id);


--
-- Name: idx_document_extractions_amounts_gin; Type: INDEX; Schema: law; Owner: -
--

CREATE INDEX idx_document_extractions_amounts_gin ON law.document_extractions USING gin (extracted_amounts);


--
-- Name: idx_document_extractions_clauses_gin; Type: INDEX; Schema: law; Owner: -
--

CREATE INDEX idx_document_extractions_clauses_gin ON law.document_extractions USING gin (detected_clauses);


--
-- Name: idx_document_extractions_dates_gin; Type: INDEX; Schema: law; Owner: -
--

CREATE INDEX idx_document_extractions_dates_gin ON law.document_extractions USING gin (extracted_dates);


--
-- Name: idx_document_extractions_document_type; Type: INDEX; Schema: law; Owner: -
--

CREATE INDEX idx_document_extractions_document_type ON law.document_extractions USING btree (document_type) WHERE (document_type IS NOT NULL);


--
-- Name: idx_document_extractions_has_redactions; Type: INDEX; Schema: law; Owner: -
--

CREATE INDEX idx_document_extractions_has_redactions ON law.document_extractions USING btree (has_redactions) WHERE (has_redactions = true);


--
-- Name: idx_document_extractions_has_signatures; Type: INDEX; Schema: law; Owner: -
--

CREATE INDEX idx_document_extractions_has_signatures ON law.document_extractions USING btree (has_signatures) WHERE (has_signatures = true);


--
-- Name: idx_document_extractions_language; Type: INDEX; Schema: law; Owner: -
--

CREATE INDEX idx_document_extractions_language ON law.document_extractions USING btree (document_language);


--
-- Name: idx_document_extractions_parties_gin; Type: INDEX; Schema: law; Owner: -
--

CREATE INDEX idx_document_extractions_parties_gin ON law.document_extractions USING gin (extracted_parties);


--
-- Name: idx_document_extractions_sections_gin; Type: INDEX; Schema: law; Owner: -
--

CREATE INDEX idx_document_extractions_sections_gin ON law.document_extractions USING gin (detected_sections);


--
-- Name: idx_document_extractions_storage; Type: INDEX; Schema: law; Owner: -
--

CREATE INDEX idx_document_extractions_storage ON law.document_extractions USING btree (storage_path);


--
-- Name: idx_document_extractions_task; Type: INDEX; Schema: law; Owner: -
--

CREATE INDEX idx_document_extractions_task ON law.document_extractions USING btree (analysis_task_id);


--
-- Name: idx_document_extractions_type; Type: INDEX; Schema: law; Owner: -
--

CREATE INDEX idx_document_extractions_type ON law.document_extractions USING btree (file_type);


--
-- Name: idx_execution_steps_sequence; Type: INDEX; Schema: law; Owner: -
--

CREATE INDEX idx_execution_steps_sequence ON law.execution_steps USING btree (analysis_task_id, sequence);


--
-- Name: idx_execution_steps_status; Type: INDEX; Schema: law; Owner: -
--

CREATE INDEX idx_execution_steps_status ON law.execution_steps USING btree (status);


--
-- Name: idx_execution_steps_task; Type: INDEX; Schema: law; Owner: -
--

CREATE INDEX idx_execution_steps_task ON law.execution_steps USING btree (analysis_task_id);


--
-- Name: idx_playbooks_active; Type: INDEX; Schema: law; Owner: -
--

CREATE INDEX idx_playbooks_active ON law.playbooks USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_playbooks_doc_type; Type: INDEX; Schema: law; Owner: -
--

CREATE INDEX idx_playbooks_doc_type ON law.playbooks USING btree (document_type);


--
-- Name: idx_playbooks_org; Type: INDEX; Schema: law; Owner: -
--

CREATE INDEX idx_playbooks_org ON law.playbooks USING btree (organization_slug);


--
-- Name: idx_playbooks_specialist; Type: INDEX; Schema: law; Owner: -
--

CREATE INDEX idx_playbooks_specialist ON law.playbooks USING btree (specialist_slug);


--
-- Name: idx_specialist_outputs_specialist; Type: INDEX; Schema: law; Owner: -
--

CREATE INDEX idx_specialist_outputs_specialist ON law.specialist_outputs USING btree (specialist_slug);


--
-- Name: idx_specialist_outputs_status; Type: INDEX; Schema: law; Owner: -
--

CREATE INDEX idx_specialist_outputs_status ON law.specialist_outputs USING btree (status);


--
-- Name: idx_specialist_outputs_task; Type: INDEX; Schema: law; Owner: -
--

CREATE INDEX idx_specialist_outputs_task ON law.specialist_outputs USING btree (analysis_task_id);


--
-- Name: idx_agent_idea_submissions_created; Type: INDEX; Schema: leads; Owner: -
--

CREATE INDEX idx_agent_idea_submissions_created ON leads.agent_idea_submissions USING btree (created_at DESC);


--
-- Name: idx_agent_idea_submissions_email; Type: INDEX; Schema: leads; Owner: -
--

CREATE INDEX idx_agent_idea_submissions_email ON leads.agent_idea_submissions USING btree (email);


--
-- Name: idx_agent_idea_submissions_industry; Type: INDEX; Schema: leads; Owner: -
--

CREATE INDEX idx_agent_idea_submissions_industry ON leads.agent_idea_submissions USING btree (normalized_industry);


--
-- Name: idx_agent_idea_submissions_selected_agents; Type: INDEX; Schema: leads; Owner: -
--

CREATE INDEX idx_agent_idea_submissions_selected_agents ON leads.agent_idea_submissions USING gin (selected_agents);


--
-- Name: idx_agent_idea_submissions_status; Type: INDEX; Schema: leads; Owner: -
--

CREATE INDEX idx_agent_idea_submissions_status ON leads.agent_idea_submissions USING btree (status);


--
-- Name: idx_agent_llm_configs_agent; Type: INDEX; Schema: marketing; Owner: -
--

CREATE INDEX idx_agent_llm_configs_agent ON marketing.agent_llm_configs USING btree (agent_slug);


--
-- Name: idx_agents_active; Type: INDEX; Schema: marketing; Owner: -
--

CREATE INDEX idx_agents_active ON marketing.agents USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_agents_org; Type: INDEX; Schema: marketing; Owner: -
--

CREATE INDEX idx_agents_org ON marketing.agents USING btree (organization_slug);


--
-- Name: idx_agents_role; Type: INDEX; Schema: marketing; Owner: -
--

CREATE INDEX idx_agents_role ON marketing.agents USING btree (role);


--
-- Name: idx_content_types_org; Type: INDEX; Schema: marketing; Owner: -
--

CREATE INDEX idx_content_types_org ON marketing.content_types USING btree (organization_slug);


--
-- Name: idx_evaluations_output; Type: INDEX; Schema: marketing; Owner: -
--

CREATE INDEX idx_evaluations_output ON marketing.evaluations USING btree (output_id);


--
-- Name: idx_evaluations_pending; Type: INDEX; Schema: marketing; Owner: -
--

CREATE INDEX idx_evaluations_pending ON marketing.evaluations USING btree (task_id, stage, status) WHERE (status = 'pending'::text);


--
-- Name: idx_evaluations_stage_status; Type: INDEX; Schema: marketing; Owner: -
--

CREATE INDEX idx_evaluations_stage_status ON marketing.evaluations USING btree (task_id, stage, status);


--
-- Name: idx_evaluations_task; Type: INDEX; Schema: marketing; Owner: -
--

CREATE INDEX idx_evaluations_task ON marketing.evaluations USING btree (task_id);


--
-- Name: idx_execution_queue_ollama; Type: INDEX; Schema: marketing; Owner: -
--

CREATE INDEX idx_execution_queue_ollama ON marketing.execution_queue USING btree (provider, status, created_at) WHERE (provider = 'ollama'::text);


--
-- Name: idx_execution_queue_pending; Type: INDEX; Schema: marketing; Owner: -
--

CREATE INDEX idx_execution_queue_pending ON marketing.execution_queue USING btree (task_id, status) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));


--
-- Name: idx_execution_queue_processing; Type: INDEX; Schema: marketing; Owner: -
--

CREATE INDEX idx_execution_queue_processing ON marketing.execution_queue USING btree (task_id, status, sequence);


--
-- Name: idx_execution_queue_task; Type: INDEX; Schema: marketing; Owner: -
--

CREATE INDEX idx_execution_queue_task ON marketing.execution_queue USING btree (task_id);


--
-- Name: idx_output_versions_output; Type: INDEX; Schema: marketing; Owner: -
--

CREATE INDEX idx_output_versions_output ON marketing.output_versions USING btree (output_id);


--
-- Name: idx_output_versions_output_version; Type: INDEX; Schema: marketing; Owner: -
--

CREATE INDEX idx_output_versions_output_version ON marketing.output_versions USING btree (output_id, version_number);


--
-- Name: idx_output_versions_task; Type: INDEX; Schema: marketing; Owner: -
--

CREATE INDEX idx_output_versions_task ON marketing.output_versions USING btree (task_id);


--
-- Name: idx_outputs_finalist; Type: INDEX; Schema: marketing; Owner: -
--

CREATE INDEX idx_outputs_finalist ON marketing.outputs USING btree (task_id, is_finalist) WHERE (is_finalist = true);


--
-- Name: idx_outputs_task; Type: INDEX; Schema: marketing; Owner: -
--

CREATE INDEX idx_outputs_task ON marketing.outputs USING btree (task_id);


--
-- Name: idx_outputs_task_status; Type: INDEX; Schema: marketing; Owner: -
--

CREATE INDEX idx_outputs_task_status ON marketing.outputs USING btree (task_id, status);


--
-- Name: idx_outputs_writer; Type: INDEX; Schema: marketing; Owner: -
--

CREATE INDEX idx_outputs_writer ON marketing.outputs USING btree (writer_agent_slug);


--
-- Name: idx_swarm_tasks_conversation; Type: INDEX; Schema: marketing; Owner: -
--

CREATE INDEX idx_swarm_tasks_conversation ON marketing.swarm_tasks USING btree (conversation_id);


--
-- Name: idx_swarm_tasks_org; Type: INDEX; Schema: marketing; Owner: -
--

CREATE INDEX idx_swarm_tasks_org ON marketing.swarm_tasks USING btree (organization_slug);


--
-- Name: idx_swarm_tasks_status; Type: INDEX; Schema: marketing; Owner: -
--

CREATE INDEX idx_swarm_tasks_status ON marketing.swarm_tasks USING btree (status);


--
-- Name: idx_swarm_tasks_user; Type: INDEX; Schema: marketing; Owner: -
--

CREATE INDEX idx_swarm_tasks_user ON marketing.swarm_tasks USING btree (user_id);


--
-- Name: idx_efforts_org; Type: INDEX; Schema: orch_flow; Owner: -
--

CREATE INDEX idx_efforts_org ON orch_flow.efforts USING btree (organization_slug);


--
-- Name: idx_efforts_team_id; Type: INDEX; Schema: orch_flow; Owner: -
--

CREATE INDEX idx_efforts_team_id ON orch_flow.efforts USING btree (team_id);


--
-- Name: idx_learning_progress_user_org; Type: INDEX; Schema: orch_flow; Owner: -
--

CREATE INDEX idx_learning_progress_user_org ON orch_flow.learning_progress USING btree (user_id, organization_slug);


--
-- Name: idx_orch_flow_channel_messages_channel; Type: INDEX; Schema: orch_flow; Owner: -
--

CREATE INDEX idx_orch_flow_channel_messages_channel ON orch_flow.channel_messages USING btree (channel_id);


--
-- Name: idx_orch_flow_channels_team; Type: INDEX; Schema: orch_flow; Owner: -
--

CREATE INDEX idx_orch_flow_channels_team ON orch_flow.channels USING btree (team_id);


--
-- Name: idx_orch_flow_shared_tasks_assigned; Type: INDEX; Schema: orch_flow; Owner: -
--

CREATE INDEX idx_orch_flow_shared_tasks_assigned ON orch_flow.shared_tasks USING btree (assigned_to);


--
-- Name: idx_orch_flow_shared_tasks_channel; Type: INDEX; Schema: orch_flow; Owner: -
--

CREATE INDEX idx_orch_flow_shared_tasks_channel ON orch_flow.shared_tasks USING btree (channel_id);


--
-- Name: idx_orch_flow_shared_tasks_external_provider; Type: INDEX; Schema: orch_flow; Owner: -
--

CREATE INDEX idx_orch_flow_shared_tasks_external_provider ON orch_flow.shared_tasks USING btree (external_provider);


--
-- Name: idx_orch_flow_shared_tasks_external_task_id; Type: INDEX; Schema: orch_flow; Owner: -
--

CREATE INDEX idx_orch_flow_shared_tasks_external_task_id ON orch_flow.shared_tasks USING btree (external_task_id);


--
-- Name: idx_orch_flow_shared_tasks_parent; Type: INDEX; Schema: orch_flow; Owner: -
--

CREATE INDEX idx_orch_flow_shared_tasks_parent ON orch_flow.shared_tasks USING btree (parent_task_id);


--
-- Name: idx_orch_flow_shared_tasks_status; Type: INDEX; Schema: orch_flow; Owner: -
--

CREATE INDEX idx_orch_flow_shared_tasks_status ON orch_flow.shared_tasks USING btree (status);


--
-- Name: idx_orch_flow_shared_tasks_team; Type: INDEX; Schema: orch_flow; Owner: -
--

CREATE INDEX idx_orch_flow_shared_tasks_team ON orch_flow.shared_tasks USING btree (team_id);


--
-- Name: idx_orch_flow_shared_tasks_user; Type: INDEX; Schema: orch_flow; Owner: -
--

CREATE INDEX idx_orch_flow_shared_tasks_user ON orch_flow.shared_tasks USING btree (user_id);


--
-- Name: idx_orch_flow_sprints_team; Type: INDEX; Schema: orch_flow; Owner: -
--

CREATE INDEX idx_orch_flow_sprints_team ON orch_flow.sprints USING btree (team_id);


--
-- Name: idx_orch_flow_timer_state_team; Type: INDEX; Schema: orch_flow; Owner: -
--

CREATE INDEX idx_orch_flow_timer_state_team ON orch_flow.timer_state USING btree (team_id);


--
-- Name: idx_projects_effort; Type: INDEX; Schema: orch_flow; Owner: -
--

CREATE INDEX idx_projects_effort ON orch_flow.projects USING btree (effort_id);


--
-- Name: idx_tasks_project; Type: INDEX; Schema: orch_flow; Owner: -
--

CREATE INDEX idx_tasks_project ON orch_flow.tasks USING btree (project_id);


--
-- Name: idx_team_files_parent_id; Type: INDEX; Schema: orch_flow; Owner: -
--

CREATE INDEX idx_team_files_parent_id ON orch_flow.team_files USING btree (parent_id);


--
-- Name: idx_team_files_team_id; Type: INDEX; Schema: orch_flow; Owner: -
--

CREATE INDEX idx_team_files_team_id ON orch_flow.team_files USING btree (team_id);


--
-- Name: idx_team_files_team_parent; Type: INDEX; Schema: orch_flow; Owner: -
--

CREATE INDEX idx_team_files_team_parent ON orch_flow.team_files USING btree (team_id, parent_id);


--
-- Name: idx_user_presence_active; Type: INDEX; Schema: orch_flow; Owner: -
--

CREATE INDEX idx_user_presence_active ON orch_flow.user_presence USING btree (last_active_at);


--
-- Name: uq_orch_flow_shared_tasks_provider_external; Type: INDEX; Schema: orch_flow; Owner: -
--

CREATE UNIQUE INDEX uq_orch_flow_shared_tasks_provider_external ON orch_flow.shared_tasks USING btree (external_provider, external_task_id) WHERE ((external_provider IS NOT NULL) AND (external_task_id IS NOT NULL));


--
-- Name: idx_agent_self_modification_log_analyst; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_agent_self_modification_log_analyst ON prediction.agent_self_modification_log USING btree (analyst_id);


--
-- Name: idx_agent_self_modification_log_created; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_agent_self_modification_log_created ON prediction.agent_self_modification_log USING btree (created_at DESC);


--
-- Name: idx_agent_self_modification_log_type; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_agent_self_modification_log_type ON prediction.agent_self_modification_log USING btree (modification_type);


--
-- Name: idx_agent_self_modification_log_unacked; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_agent_self_modification_log_unacked ON prediction.agent_self_modification_log USING btree (acknowledged, created_at DESC) WHERE (acknowledged = false);


--
-- Name: idx_analyst_adaptation_diffs_analyst; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_adaptation_diffs_analyst ON prediction.analyst_adaptation_diffs USING btree (analyst_id);


--
-- Name: idx_analyst_adaptation_diffs_created; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_adaptation_diffs_created ON prediction.analyst_adaptation_diffs USING btree (created_at DESC);


--
-- Name: idx_analyst_adaptation_diffs_status; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_adaptation_diffs_status ON prediction.analyst_adaptation_diffs USING btree (adoption_status);


--
-- Name: idx_analyst_assessments_analyst; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_assessments_analyst ON prediction.analyst_assessments USING btree (analyst_id);


--
-- Name: idx_analyst_assessments_context_version; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_assessments_context_version ON prediction.analyst_assessments USING btree (context_version_id) WHERE (context_version_id IS NOT NULL);


--
-- Name: idx_analyst_assessments_created; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_assessments_created ON prediction.analyst_assessments USING btree (created_at DESC);


--
-- Name: idx_analyst_assessments_fork; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_assessments_fork ON prediction.analyst_assessments USING btree (fork_type);


--
-- Name: idx_analyst_assessments_learnings; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_assessments_learnings ON prediction.analyst_assessments USING gin (learnings_applied);


--
-- Name: idx_analyst_assessments_llm_usage; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_assessments_llm_usage ON prediction.analyst_assessments USING btree (llm_usage_id) WHERE (llm_usage_id IS NOT NULL);


--
-- Name: idx_analyst_assessments_prediction; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_assessments_prediction ON prediction.analyst_assessments USING btree (prediction_id) WHERE (prediction_id IS NOT NULL);


--
-- Name: idx_analyst_assessments_predictor; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_assessments_predictor ON prediction.analyst_assessments USING btree (predictor_id) WHERE (predictor_id IS NOT NULL);


--
-- Name: idx_analyst_assessments_tier; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_assessments_tier ON prediction.analyst_assessments USING btree (llm_tier);


--
-- Name: idx_analyst_context_versions_analyst; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_context_versions_analyst ON prediction.analyst_context_versions USING btree (analyst_id);


--
-- Name: idx_analyst_context_versions_changed_by; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_context_versions_changed_by ON prediction.analyst_context_versions USING btree (changed_by);


--
-- Name: idx_analyst_context_versions_created; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_context_versions_created ON prediction.analyst_context_versions USING btree (created_at DESC);


--
-- Name: idx_analyst_context_versions_current; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_context_versions_current ON prediction.analyst_context_versions USING btree (analyst_id, fork_type, is_current) WHERE (is_current = true);


--
-- Name: idx_analyst_context_versions_fork; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_context_versions_fork ON prediction.analyst_context_versions USING btree (analyst_id, fork_type);


--
-- Name: idx_analyst_overrides_analyst; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_overrides_analyst ON prediction.analyst_overrides USING btree (analyst_id);


--
-- Name: idx_analyst_overrides_target; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_overrides_target ON prediction.analyst_overrides USING btree (target_id) WHERE (target_id IS NOT NULL);


--
-- Name: idx_analyst_overrides_universe; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_overrides_universe ON prediction.analyst_overrides USING btree (universe_id) WHERE (universe_id IS NOT NULL);


--
-- Name: idx_analyst_performance_metrics_analyst; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_performance_metrics_analyst ON prediction.analyst_performance_metrics USING btree (analyst_id);


--
-- Name: idx_analyst_performance_metrics_date; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_performance_metrics_date ON prediction.analyst_performance_metrics USING btree (metric_date DESC);


--
-- Name: idx_analyst_performance_metrics_fork_date; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_performance_metrics_fork_date ON prediction.analyst_performance_metrics USING btree (analyst_id, fork_type, metric_date DESC);


--
-- Name: idx_analyst_portfolios_analyst; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_portfolios_analyst ON prediction.analyst_portfolios USING btree (analyst_id);


--
-- Name: idx_analyst_portfolios_balance; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_portfolios_balance ON prediction.analyst_portfolios USING btree (current_balance);


--
-- Name: idx_analyst_portfolios_fork; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_portfolios_fork ON prediction.analyst_portfolios USING btree (fork_type);


--
-- Name: idx_analyst_portfolios_status; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_portfolios_status ON prediction.analyst_portfolios USING btree (status) WHERE (fork_type = 'agent'::text);


--
-- Name: idx_analyst_positions_assessment; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_positions_assessment ON prediction.analyst_positions USING btree (analyst_assessment_id) WHERE (analyst_assessment_id IS NOT NULL);


--
-- Name: idx_analyst_positions_open; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_positions_open ON prediction.analyst_positions USING btree (portfolio_id, status) WHERE (status = 'open'::text);


--
-- Name: idx_analyst_positions_paper; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_positions_paper ON prediction.analyst_positions USING btree (is_paper_only) WHERE (is_paper_only = true);


--
-- Name: idx_analyst_positions_portfolio; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_positions_portfolio ON prediction.analyst_positions USING btree (portfolio_id);


--
-- Name: idx_analyst_positions_prediction; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_positions_prediction ON prediction.analyst_positions USING btree (prediction_id) WHERE (prediction_id IS NOT NULL);


--
-- Name: idx_analyst_positions_status; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_positions_status ON prediction.analyst_positions USING btree (status);


--
-- Name: idx_analyst_positions_target; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analyst_positions_target ON prediction.analyst_positions USING btree (target_id);


--
-- Name: idx_analysts_agent; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analysts_agent ON prediction.analysts USING btree (agent_id) WHERE (agent_id IS NOT NULL);


--
-- Name: idx_analysts_domain; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analysts_domain ON prediction.analysts USING btree (domain) WHERE (domain IS NOT NULL);


--
-- Name: idx_analysts_enabled; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analysts_enabled ON prediction.analysts USING btree (is_enabled) WHERE (is_enabled = true);


--
-- Name: idx_analysts_learned_patterns; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analysts_learned_patterns ON prediction.analysts USING gin (learned_patterns);


--
-- Name: idx_analysts_scope; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analysts_scope ON prediction.analysts USING btree (scope_level, domain, universe_id, target_id);


--
-- Name: idx_analysts_slug; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analysts_slug ON prediction.analysts USING btree (slug);


--
-- Name: idx_analysts_target; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analysts_target ON prediction.analysts USING btree (target_id) WHERE (target_id IS NOT NULL);


--
-- Name: idx_analysts_test_data; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analysts_test_data ON prediction.analysts USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_analysts_test_scenario; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analysts_test_scenario ON prediction.analysts USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_analysts_tier_instructions; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analysts_tier_instructions ON prediction.analysts USING gin (tier_instructions);


--
-- Name: idx_analysts_type; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analysts_type ON prediction.analysts USING btree (analyst_type);


--
-- Name: idx_analysts_unique_slug_scope; Type: INDEX; Schema: prediction; Owner: -
--

CREATE UNIQUE INDEX idx_analysts_unique_slug_scope ON prediction.analysts USING btree (slug, scope_level, COALESCE(domain, ''::text), COALESCE((universe_id)::text, ''::text), COALESCE((target_id)::text, ''::text));


--
-- Name: idx_analysts_universe; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_analysts_universe ON prediction.analysts USING btree (universe_id) WHERE (universe_id IS NOT NULL);


--
-- Name: idx_daily_postmortem_recs_run; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_daily_postmortem_recs_run ON prediction.daily_postmortem_recommendations USING btree (run_id);


--
-- Name: idx_daily_postmortem_recs_scope; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_daily_postmortem_recs_scope ON prediction.daily_postmortem_recommendations USING btree (scope_level);


--
-- Name: idx_daily_postmortem_recs_status; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_daily_postmortem_recs_status ON prediction.daily_postmortem_recommendations USING btree (status);


--
-- Name: idx_daily_postmortem_runs_org_agent_date; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_daily_postmortem_runs_org_agent_date ON prediction.daily_postmortem_runs USING btree (org_slug, agent_slug, run_date DESC);


--
-- Name: idx_eod_settlement_log_date; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_eod_settlement_log_date ON prediction.eod_settlement_log USING btree (settlement_date DESC);


--
-- Name: idx_evaluations_production; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_evaluations_production ON prediction.evaluations USING btree (prediction_id, created_at DESC) WHERE (is_test = false);


--
-- Name: idx_evaluations_test_data; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_evaluations_test_data ON prediction.evaluations USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_evaluations_test_scenario; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_evaluations_test_scenario ON prediction.evaluations USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_fork_learning_exchanges_analyst; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_fork_learning_exchanges_analyst ON prediction.fork_learning_exchanges USING btree (analyst_id);


--
-- Name: idx_fork_learning_exchanges_created; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_fork_learning_exchanges_created ON prediction.fork_learning_exchanges USING btree (created_at DESC);


--
-- Name: idx_fork_learning_exchanges_initiator; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_fork_learning_exchanges_initiator ON prediction.fork_learning_exchanges USING btree (initiated_by);


--
-- Name: idx_fork_learning_exchanges_outcome; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_fork_learning_exchanges_outcome ON prediction.fork_learning_exchanges USING btree (outcome);


--
-- Name: idx_learning_lineage_org; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learning_lineage_org ON prediction.learning_lineage USING btree (organization_slug);


--
-- Name: idx_learning_lineage_production_learning; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learning_lineage_production_learning ON prediction.learning_lineage USING btree (production_learning_id);


--
-- Name: idx_learning_lineage_promoted_at; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learning_lineage_promoted_at ON prediction.learning_lineage USING btree (promoted_at DESC);


--
-- Name: idx_learning_lineage_promoted_by; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learning_lineage_promoted_by ON prediction.learning_lineage USING btree (promoted_by);


--
-- Name: idx_learning_lineage_scenario_runs; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learning_lineage_scenario_runs ON prediction.learning_lineage USING gin (scenario_runs);


--
-- Name: idx_learning_lineage_test_learning; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learning_lineage_test_learning ON prediction.learning_lineage USING btree (test_learning_id);


--
-- Name: idx_learning_queue_confidence; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learning_queue_confidence ON prediction.learning_queue USING btree (ai_confidence DESC);


--
-- Name: idx_learning_queue_config; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learning_queue_config ON prediction.learning_queue USING gin (suggested_config);


--
-- Name: idx_learning_queue_created; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learning_queue_created ON prediction.learning_queue USING btree (created_at DESC);


--
-- Name: idx_learning_queue_learning; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learning_queue_learning ON prediction.learning_queue USING btree (learning_id) WHERE (learning_id IS NOT NULL);


--
-- Name: idx_learning_queue_reviewed; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learning_queue_reviewed ON prediction.learning_queue USING btree (reviewed_at DESC) WHERE (reviewed_at IS NOT NULL);


--
-- Name: idx_learning_queue_reviewer; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learning_queue_reviewer ON prediction.learning_queue USING btree (reviewed_by_user_id) WHERE (reviewed_by_user_id IS NOT NULL);


--
-- Name: idx_learning_queue_source_eval; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learning_queue_source_eval ON prediction.learning_queue USING btree (source_evaluation_id) WHERE (source_evaluation_id IS NOT NULL);


--
-- Name: idx_learning_queue_source_missed; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learning_queue_source_missed ON prediction.learning_queue USING btree (source_missed_opportunity_id) WHERE (source_missed_opportunity_id IS NOT NULL);


--
-- Name: idx_learning_queue_status; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learning_queue_status ON prediction.learning_queue USING btree (status) WHERE (status = 'pending'::text);


--
-- Name: idx_learning_queue_suggested_scope; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learning_queue_suggested_scope ON prediction.learning_queue USING btree (suggested_scope_level, suggested_domain);


--
-- Name: idx_learning_queue_test_data; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learning_queue_test_data ON prediction.learning_queue USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_learning_queue_test_scenario; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learning_queue_test_scenario ON prediction.learning_queue USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_learnings_analyst; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learnings_analyst ON prediction.learnings USING btree (analyst_id) WHERE (analyst_id IS NOT NULL);


--
-- Name: idx_learnings_config; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learnings_config ON prediction.learnings USING gin (config);


--
-- Name: idx_learnings_created; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learnings_created ON prediction.learnings USING btree (created_at DESC);


--
-- Name: idx_learnings_domain; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learnings_domain ON prediction.learnings USING btree (domain) WHERE (domain IS NOT NULL);


--
-- Name: idx_learnings_effectiveness; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learnings_effectiveness ON prediction.learnings USING btree (times_applied, times_helpful);


--
-- Name: idx_learnings_production; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learnings_production ON prediction.learnings USING btree (scope_level, status, created_at DESC) WHERE (is_test = false);


--
-- Name: idx_learnings_production_active; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learnings_production_active ON prediction.learnings USING btree (scope_level, domain, universe_id) WHERE ((is_test = false) AND (status = 'active'::text));


--
-- Name: idx_learnings_scope; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learnings_scope ON prediction.learnings USING btree (scope_level, domain, universe_id, target_id);


--
-- Name: idx_learnings_source_eval; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learnings_source_eval ON prediction.learnings USING btree (source_evaluation_id) WHERE (source_evaluation_id IS NOT NULL);


--
-- Name: idx_learnings_source_missed; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learnings_source_missed ON prediction.learnings USING btree (source_missed_opportunity_id) WHERE (source_missed_opportunity_id IS NOT NULL);


--
-- Name: idx_learnings_status; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learnings_status ON prediction.learnings USING btree (status) WHERE (status = 'active'::text);


--
-- Name: idx_learnings_superseded; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learnings_superseded ON prediction.learnings USING btree (superseded_by) WHERE (superseded_by IS NOT NULL);


--
-- Name: idx_learnings_target; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learnings_target ON prediction.learnings USING btree (target_id) WHERE (target_id IS NOT NULL);


--
-- Name: idx_learnings_test_data; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learnings_test_data ON prediction.learnings USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_learnings_test_scenario; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learnings_test_scenario ON prediction.learnings USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_learnings_type; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learnings_type ON prediction.learnings USING btree (learning_type);


--
-- Name: idx_learnings_universe; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_learnings_universe ON prediction.learnings USING btree (universe_id) WHERE (universe_id IS NOT NULL);


--
-- Name: idx_missed_opportunities_test_data; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_missed_opportunities_test_data ON prediction.missed_opportunities USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_missed_opportunities_test_scenario; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_missed_opportunities_test_scenario ON prediction.missed_opportunities USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_position_sizing_config_org; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_position_sizing_config_org ON prediction.position_sizing_config USING btree (org_slug, is_active);


--
-- Name: idx_prediction_evaluations_analyst; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_evaluations_analyst ON prediction.evaluations USING gin (analyst_scores);


--
-- Name: idx_prediction_evaluations_created_at; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_evaluations_created_at ON prediction.evaluations USING btree (created_at DESC);


--
-- Name: idx_prediction_evaluations_direction_correct; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_evaluations_direction_correct ON prediction.evaluations USING btree (direction_correct);


--
-- Name: idx_prediction_evaluations_is_test; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_evaluations_is_test ON prediction.evaluations USING btree (is_test);


--
-- Name: idx_prediction_evaluations_learnings; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_evaluations_learnings ON prediction.evaluations USING gin (suggested_learnings);


--
-- Name: idx_prediction_evaluations_llm; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_evaluations_llm ON prediction.evaluations USING gin (llm_tier_scores);


--
-- Name: idx_prediction_evaluations_overall_score; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_evaluations_overall_score ON prediction.evaluations USING btree (overall_score DESC);


--
-- Name: idx_prediction_evaluations_prediction; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_evaluations_prediction ON prediction.evaluations USING btree (prediction_id);


--
-- Name: idx_prediction_learning_queue_is_test; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_learning_queue_is_test ON prediction.learning_queue USING btree (is_test);


--
-- Name: idx_prediction_learnings_is_test; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_learnings_is_test ON prediction.learnings USING btree (is_test);


--
-- Name: idx_prediction_missed_analysis_status; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_missed_analysis_status ON prediction.missed_opportunities USING btree (analysis_status);


--
-- Name: idx_prediction_missed_created_at; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_missed_created_at ON prediction.missed_opportunities USING btree (created_at DESC);


--
-- Name: idx_prediction_missed_detected; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_missed_detected ON prediction.missed_opportunities USING btree (detected_at DESC);


--
-- Name: idx_prediction_missed_drivers; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_missed_drivers ON prediction.missed_opportunities USING gin (discovered_drivers);


--
-- Name: idx_prediction_missed_gaps; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_missed_gaps ON prediction.missed_opportunities USING gin (source_gaps);


--
-- Name: idx_prediction_missed_opportunities_is_test; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_missed_opportunities_is_test ON prediction.missed_opportunities USING btree (is_test);


--
-- Name: idx_prediction_missed_percent; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_missed_percent ON prediction.missed_opportunities USING btree (percent_change DESC);


--
-- Name: idx_prediction_missed_signals; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_missed_signals ON prediction.missed_opportunities USING gin (signals_we_had);


--
-- Name: idx_prediction_missed_target; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_missed_target ON prediction.missed_opportunities USING btree (target_id);


--
-- Name: idx_prediction_missed_type; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_missed_type ON prediction.missed_opportunities USING btree (move_type);


--
-- Name: idx_prediction_predictions_active; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_predictions_active ON prediction.predictions USING btree (target_id, status, expires_at) WHERE (status = 'active'::text);


--
-- Name: idx_prediction_predictions_analyst_ensemble; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_predictions_analyst_ensemble ON prediction.predictions USING gin (analyst_ensemble);


--
-- Name: idx_prediction_predictions_created_at; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_predictions_created_at ON prediction.predictions USING btree (created_at DESC);


--
-- Name: idx_prediction_predictions_direction; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_predictions_direction ON prediction.predictions USING btree (direction);


--
-- Name: idx_prediction_predictions_expires_at; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_predictions_expires_at ON prediction.predictions USING btree (expires_at);


--
-- Name: idx_prediction_predictions_is_test; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_predictions_is_test ON prediction.predictions USING btree (is_test);


--
-- Name: idx_prediction_predictions_llm_ensemble; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_predictions_llm_ensemble ON prediction.predictions USING gin (llm_ensemble);


--
-- Name: idx_prediction_predictions_predicted_at; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_predictions_predicted_at ON prediction.predictions USING btree (predicted_at DESC);


--
-- Name: idx_prediction_predictions_production_active; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_predictions_production_active ON prediction.predictions USING btree (target_id, status, expires_at) WHERE ((is_test = false) AND (status = 'active'::text));


--
-- Name: idx_prediction_predictions_scenario_run; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_predictions_scenario_run ON prediction.predictions USING btree (scenario_run_id) WHERE (scenario_run_id IS NOT NULL);


--
-- Name: idx_prediction_predictions_status; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_predictions_status ON prediction.predictions USING btree (status);


--
-- Name: idx_prediction_predictions_target; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_predictions_target ON prediction.predictions USING btree (target_id);


--
-- Name: idx_prediction_predictions_task; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_predictions_task ON prediction.predictions USING btree (task_id) WHERE (task_id IS NOT NULL);


--
-- Name: idx_prediction_predictors_active; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_predictors_active ON prediction.predictors USING btree (target_id, status, expires_at) WHERE (status = 'active'::text);


--
-- Name: idx_prediction_predictors_analyst; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_predictors_analyst ON prediction.predictors USING btree (analyst_slug);


--
-- Name: idx_prediction_predictors_article_id; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_predictors_article_id ON prediction.predictors USING btree (article_id) WHERE (article_id IS NOT NULL);


--
-- Name: idx_prediction_predictors_assessment; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_predictors_assessment ON prediction.predictors USING gin (analyst_assessment);


--
-- Name: idx_prediction_predictors_created_at; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_predictors_created_at ON prediction.predictors USING btree (created_at DESC);


--
-- Name: idx_prediction_predictors_direction; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_predictors_direction ON prediction.predictors USING btree (direction);


--
-- Name: idx_prediction_predictors_expires_at; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_predictors_expires_at ON prediction.predictors USING btree (expires_at);


--
-- Name: idx_prediction_predictors_fork_type; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_predictors_fork_type ON prediction.predictors USING btree (analyst_slug, fork_type) WHERE (fork_type IS NOT NULL);


--
-- Name: idx_prediction_predictors_is_test; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_predictors_is_test ON prediction.predictors USING btree (is_test);


--
-- Name: idx_prediction_predictors_llm_usage; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_predictors_llm_usage ON prediction.predictors USING btree (llm_usage_id) WHERE (llm_usage_id IS NOT NULL);


--
-- Name: idx_prediction_predictors_scenario_run; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_predictors_scenario_run ON prediction.predictors USING btree (scenario_run_id) WHERE (scenario_run_id IS NOT NULL);


--
-- Name: idx_prediction_predictors_scenario_test; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_predictors_scenario_test ON prediction.predictors USING btree (scenario_run_id, is_test) WHERE (scenario_run_id IS NOT NULL);


--
-- Name: idx_prediction_predictors_status; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_predictors_status ON prediction.predictors USING btree (status);


--
-- Name: idx_prediction_predictors_target; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_predictors_target ON prediction.predictors USING btree (target_id);


--
-- Name: idx_prediction_signals_detected_at; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_signals_detected_at ON prediction.signals USING btree (detected_at DESC);


--
-- Name: idx_prediction_signals_direction; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_signals_direction ON prediction.signals USING btree (direction);


--
-- Name: idx_prediction_signals_disposition; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_signals_disposition ON prediction.signals USING btree (disposition);


--
-- Name: idx_prediction_signals_evaluation; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_signals_evaluation ON prediction.signals USING gin (evaluation_result) WHERE (evaluation_result IS NOT NULL);


--
-- Name: idx_prediction_signals_is_test; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_signals_is_test ON prediction.signals USING btree (is_test);


--
-- Name: idx_prediction_signals_metadata; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_signals_metadata ON prediction.signals USING gin (metadata);


--
-- Name: idx_prediction_signals_pending; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_signals_pending ON prediction.signals USING btree (target_id, disposition, detected_at) WHERE (disposition = 'pending'::text);


--
-- Name: idx_prediction_signals_scenario_run; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_signals_scenario_run ON prediction.signals USING btree (scenario_run_id) WHERE (scenario_run_id IS NOT NULL);


--
-- Name: idx_prediction_signals_source; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_signals_source ON prediction.signals USING btree (source_id);


--
-- Name: idx_prediction_signals_target; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_signals_target ON prediction.signals USING btree (target_id);


--
-- Name: idx_prediction_signals_test_target; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_signals_test_target ON prediction.signals USING btree (target_id, is_test, detected_at DESC) WHERE (is_test = true);


--
-- Name: idx_prediction_signals_urgency; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_signals_urgency ON prediction.signals USING btree (urgency) WHERE (urgency IS NOT NULL);


--
-- Name: idx_prediction_signals_worker; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_signals_worker ON prediction.signals USING btree (processing_worker) WHERE (processing_worker IS NOT NULL);


--
-- Name: idx_prediction_snapshots_analyst; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_snapshots_analyst ON prediction.snapshots USING gin (analyst_predictions);


--
-- Name: idx_prediction_snapshots_created_at; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_snapshots_created_at ON prediction.snapshots USING btree (created_at DESC);


--
-- Name: idx_prediction_snapshots_learnings; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_snapshots_learnings ON prediction.snapshots USING gin (learnings_applied);


--
-- Name: idx_prediction_snapshots_llm; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_snapshots_llm ON prediction.snapshots USING gin (llm_ensemble);


--
-- Name: idx_prediction_snapshots_prediction; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_snapshots_prediction ON prediction.snapshots USING btree (prediction_id);


--
-- Name: idx_prediction_snapshots_predictors; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_snapshots_predictors ON prediction.snapshots USING gin (predictors);


--
-- Name: idx_prediction_source_subs_active; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_source_subs_active ON prediction.source_subscriptions USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_prediction_source_subs_last_processed; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_source_subs_last_processed ON prediction.source_subscriptions USING btree (last_processed_at);


--
-- Name: idx_prediction_source_subs_source; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_source_subs_source ON prediction.source_subscriptions USING btree (source_id);


--
-- Name: idx_prediction_source_subs_target; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_source_subs_target ON prediction.source_subscriptions USING btree (target_id);


--
-- Name: idx_prediction_source_subs_universe; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_source_subs_universe ON prediction.source_subscriptions USING btree (universe_id);


--
-- Name: idx_prediction_strategies_active; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_strategies_active ON prediction.strategies USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_prediction_strategies_risk; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_strategies_risk ON prediction.strategies USING btree (risk_level);


--
-- Name: idx_prediction_strategies_slug; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_strategies_slug ON prediction.strategies USING btree (slug);


--
-- Name: idx_prediction_strategies_system; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_strategies_system ON prediction.strategies USING btree (is_system) WHERE (is_system = true);


--
-- Name: idx_prediction_target_snapshots_captured; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_target_snapshots_captured ON prediction.target_snapshots USING btree (captured_at DESC);


--
-- Name: idx_prediction_target_snapshots_is_test; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_target_snapshots_is_test ON prediction.target_snapshots USING btree (is_test);


--
-- Name: idx_prediction_target_snapshots_target; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_target_snapshots_target ON prediction.target_snapshots USING btree (target_id);


--
-- Name: idx_prediction_target_snapshots_target_time; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_target_snapshots_target_time ON prediction.target_snapshots USING btree (target_id, captured_at DESC);


--
-- Name: idx_prediction_targets_active; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_targets_active ON prediction.targets USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_prediction_targets_created_at; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_targets_created_at ON prediction.targets USING btree (created_at DESC);


--
-- Name: idx_prediction_targets_llm_override; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_targets_llm_override ON prediction.targets USING gin (llm_config_override) WHERE (llm_config_override IS NOT NULL);


--
-- Name: idx_prediction_targets_metadata; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_targets_metadata ON prediction.targets USING gin (metadata);


--
-- Name: idx_prediction_targets_symbol; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_targets_symbol ON prediction.targets USING btree (symbol);


--
-- Name: idx_prediction_targets_type; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_targets_type ON prediction.targets USING btree (target_type);


--
-- Name: idx_prediction_targets_universe; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_targets_universe ON prediction.targets USING btree (universe_id);


--
-- Name: idx_prediction_tool_requests_created_at; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_tool_requests_created_at ON prediction.tool_requests USING btree (created_at DESC);


--
-- Name: idx_prediction_tool_requests_source_miss; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_tool_requests_source_miss ON prediction.tool_requests USING btree (missed_opportunity_id) WHERE (missed_opportunity_id IS NOT NULL);


--
-- Name: idx_prediction_tool_requests_status; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_tool_requests_status ON prediction.tool_requests USING btree (status);


--
-- Name: idx_prediction_tool_requests_type; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_tool_requests_type ON prediction.tool_requests USING btree (tool_type);


--
-- Name: idx_prediction_tool_requests_universe; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_tool_requests_universe ON prediction.tool_requests USING btree (universe_id);


--
-- Name: idx_prediction_universes_active; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_universes_active ON prediction.universes USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_prediction_universes_agent; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_universes_agent ON prediction.universes USING btree (agent_slug);


--
-- Name: idx_prediction_universes_created_at; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_universes_created_at ON prediction.universes USING btree (created_at DESC);


--
-- Name: idx_prediction_universes_domain; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_universes_domain ON prediction.universes USING btree (domain);


--
-- Name: idx_prediction_universes_llm_config; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_universes_llm_config ON prediction.universes USING gin (llm_config) WHERE (llm_config IS NOT NULL);


--
-- Name: idx_prediction_universes_org; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_universes_org ON prediction.universes USING btree (organization_slug);


--
-- Name: idx_prediction_universes_strategy; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_universes_strategy ON prediction.universes USING btree (strategy_id);


--
-- Name: idx_prediction_universes_thresholds; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_prediction_universes_thresholds ON prediction.universes USING gin (thresholds) WHERE (thresholds IS NOT NULL);


--
-- Name: idx_predictions_analyst_slug; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_predictions_analyst_slug ON prediction.predictions USING btree (analyst_slug) WHERE (analyst_slug IS NOT NULL);


--
-- Name: idx_predictions_is_arbitrator; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_predictions_is_arbitrator ON prediction.predictions USING btree (target_id, is_arbitrator) WHERE (is_arbitrator = true);


--
-- Name: idx_predictions_production; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_predictions_production ON prediction.predictions USING btree (target_id, created_at DESC) WHERE (is_test = false);


--
-- Name: idx_predictions_production_active; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_predictions_production_active ON prediction.predictions USING btree (target_id, expires_at) WHERE ((is_test = false) AND (status = 'active'::text));


--
-- Name: idx_predictions_runner_context; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_predictions_runner_context ON prediction.predictions USING btree (runner_context_version_id) WHERE (runner_context_version_id IS NOT NULL);


--
-- Name: idx_predictions_target_context; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_predictions_target_context ON prediction.predictions USING btree (target_context_version_id) WHERE (target_context_version_id IS NOT NULL);


--
-- Name: idx_predictions_test_data; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_predictions_test_data ON prediction.predictions USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_predictions_test_scenario; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_predictions_test_scenario ON prediction.predictions USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_predictions_universe_context; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_predictions_universe_context ON prediction.predictions USING btree (universe_context_version_id) WHERE (universe_context_version_id IS NOT NULL);


--
-- Name: idx_predictors_production; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_predictors_production ON prediction.predictors USING btree (target_id, created_at DESC) WHERE (is_test = false);


--
-- Name: idx_predictors_test_data; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_predictors_test_data ON prediction.predictors USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_predictors_test_scenario; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_predictors_test_scenario ON prediction.predictors USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_replay_results_improvement; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_replay_results_improvement ON prediction.replay_test_results USING btree (improvement) WHERE (improvement IS NOT NULL);


--
-- Name: idx_replay_results_target; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_replay_results_target ON prediction.replay_test_results USING btree (target_id);


--
-- Name: idx_replay_results_test; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_replay_results_test ON prediction.replay_test_results USING btree (replay_test_id);


--
-- Name: idx_replay_snapshots_table; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_replay_snapshots_table ON prediction.replay_test_snapshots USING btree (table_name);


--
-- Name: idx_replay_snapshots_test; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_replay_snapshots_test ON prediction.replay_test_snapshots USING btree (replay_test_id);


--
-- Name: idx_replay_tests_created; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_replay_tests_created ON prediction.replay_tests USING btree (created_at DESC);


--
-- Name: idx_replay_tests_org; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_replay_tests_org ON prediction.replay_tests USING btree (organization_slug);


--
-- Name: idx_replay_tests_status; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_replay_tests_status ON prediction.replay_tests USING btree (status);


--
-- Name: idx_replay_tests_universe; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_replay_tests_universe ON prediction.replay_tests USING btree (universe_id);


--
-- Name: idx_review_queue_confidence; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_review_queue_confidence ON prediction.review_queue USING btree (original_confidence);


--
-- Name: idx_review_queue_created; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_review_queue_created ON prediction.review_queue USING btree (created_at DESC);


--
-- Name: idx_review_queue_learning; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_review_queue_learning ON prediction.review_queue USING btree (create_learning) WHERE (create_learning = true);


--
-- Name: idx_review_queue_predictor; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_review_queue_predictor ON prediction.review_queue USING btree (predictor_id) WHERE (predictor_id IS NOT NULL);


--
-- Name: idx_review_queue_reviewed; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_review_queue_reviewed ON prediction.review_queue USING btree (reviewed_at DESC) WHERE (reviewed_at IS NOT NULL);


--
-- Name: idx_review_queue_reviewer; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_review_queue_reviewer ON prediction.review_queue USING btree (reviewed_by_user_id) WHERE (reviewed_by_user_id IS NOT NULL);


--
-- Name: idx_review_queue_signal; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_review_queue_signal ON prediction.review_queue USING btree (signal_id);


--
-- Name: idx_review_queue_status; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_review_queue_status ON prediction.review_queue USING btree (status) WHERE (status = 'pending'::text);


--
-- Name: idx_review_queue_test_data; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_review_queue_test_data ON prediction.review_queue USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_review_queue_test_scenario; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_review_queue_test_scenario ON prediction.review_queue USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_runner_context_versions_created; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_runner_context_versions_created ON prediction.runner_context_versions USING btree (created_at DESC);


--
-- Name: idx_runner_context_versions_current; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_runner_context_versions_current ON prediction.runner_context_versions USING btree (runner_type, is_current) WHERE (is_current = true);


--
-- Name: idx_runner_context_versions_runner_type; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_runner_context_versions_runner_type ON prediction.runner_context_versions USING btree (runner_type);


--
-- Name: idx_scenario_runs_created_at; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_scenario_runs_created_at ON prediction.scenario_runs USING btree (created_at DESC);


--
-- Name: idx_scenario_runs_org; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_scenario_runs_org ON prediction.scenario_runs USING btree (organization_slug);


--
-- Name: idx_scenario_runs_outcome_match; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_scenario_runs_outcome_match ON prediction.scenario_runs USING btree (outcome_match) WHERE (outcome_match IS NOT NULL);


--
-- Name: idx_scenario_runs_scenario; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_scenario_runs_scenario ON prediction.scenario_runs USING btree (scenario_id);


--
-- Name: idx_scenario_runs_status; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_scenario_runs_status ON prediction.scenario_runs USING btree (status);


--
-- Name: idx_scenario_runs_triggered_by; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_scenario_runs_triggered_by ON prediction.scenario_runs USING btree (triggered_by) WHERE (triggered_by IS NOT NULL);


--
-- Name: idx_signals_production; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_signals_production ON prediction.signals USING btree (target_id, detected_at DESC) WHERE (is_test = false);


--
-- Name: idx_signals_production_source; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_signals_production_source ON prediction.signals USING btree (source_id, detected_at DESC) WHERE (is_test = false);


--
-- Name: idx_signals_test_data; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_signals_test_data ON prediction.signals USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_signals_test_scenario; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_signals_test_scenario ON prediction.signals USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_snapshots_test_data; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_snapshots_test_data ON prediction.snapshots USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_snapshots_test_scenario; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_snapshots_test_scenario ON prediction.snapshots USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_strategies_test_data; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_strategies_test_data ON prediction.strategies USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_strategies_test_scenario; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_strategies_test_scenario ON prediction.strategies USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_target_context_versions_current; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_target_context_versions_current ON prediction.target_context_versions USING btree (target_id, is_current) WHERE (is_current = true);


--
-- Name: idx_target_context_versions_target; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_target_context_versions_target ON prediction.target_context_versions USING btree (target_id);


--
-- Name: idx_target_snapshots_test_data; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_target_snapshots_test_data ON prediction.target_snapshots USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_target_snapshots_test_scenario; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_target_snapshots_test_scenario ON prediction.target_snapshots USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_targets_price_updated_at; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_targets_price_updated_at ON prediction.targets USING btree (price_updated_at) WHERE (price_updated_at IS NOT NULL);


--
-- Name: idx_targets_test_data; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_targets_test_data ON prediction.targets USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_targets_test_scenario; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_targets_test_scenario ON prediction.targets USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_test_articles_created_by; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_test_articles_created_by ON prediction.test_articles USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_test_articles_org; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_test_articles_org ON prediction.test_articles USING btree (organization_slug);


--
-- Name: idx_test_articles_processed; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_test_articles_processed ON prediction.test_articles USING btree (processed) WHERE (processed = false);


--
-- Name: idx_test_articles_published_at; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_test_articles_published_at ON prediction.test_articles USING btree (published_at DESC);


--
-- Name: idx_test_articles_scenario; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_test_articles_scenario ON prediction.test_articles USING btree (scenario_id) WHERE (scenario_id IS NOT NULL);


--
-- Name: idx_test_articles_target_symbols; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_test_articles_target_symbols ON prediction.test_articles USING gin (target_symbols);


--
-- Name: idx_test_audit_log_action; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_test_audit_log_action ON prediction.test_audit_log USING btree (action);


--
-- Name: idx_test_audit_log_created_at; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_test_audit_log_created_at ON prediction.test_audit_log USING btree (created_at DESC);


--
-- Name: idx_test_audit_log_org; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_test_audit_log_org ON prediction.test_audit_log USING btree (organization_slug);


--
-- Name: idx_test_audit_log_resource; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_test_audit_log_resource ON prediction.test_audit_log USING btree (resource_type, resource_id);


--
-- Name: idx_test_audit_log_resource_id; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_test_audit_log_resource_id ON prediction.test_audit_log USING btree (resource_id);


--
-- Name: idx_test_audit_log_resource_type; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_test_audit_log_resource_type ON prediction.test_audit_log USING btree (resource_type);


--
-- Name: idx_test_audit_log_user; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_test_audit_log_user ON prediction.test_audit_log USING btree (user_id);


--
-- Name: idx_test_price_data_org; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_test_price_data_org ON prediction.test_price_data USING btree (organization_slug);


--
-- Name: idx_test_price_data_scenario; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_test_price_data_scenario ON prediction.test_price_data USING btree (scenario_id) WHERE (scenario_id IS NOT NULL);


--
-- Name: idx_test_price_data_symbol; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_test_price_data_symbol ON prediction.test_price_data USING btree (symbol);


--
-- Name: idx_test_price_data_symbol_timestamp; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_test_price_data_symbol_timestamp ON prediction.test_price_data USING btree (symbol, price_timestamp DESC);


--
-- Name: idx_test_price_data_timestamp; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_test_price_data_timestamp ON prediction.test_price_data USING btree (price_timestamp DESC);


--
-- Name: idx_test_scenarios_created_at; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_test_scenarios_created_at ON prediction.test_scenarios USING btree (created_at DESC);


--
-- Name: idx_test_scenarios_org; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_test_scenarios_org ON prediction.test_scenarios USING btree (organization_slug);


--
-- Name: idx_test_scenarios_status; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_test_scenarios_status ON prediction.test_scenarios USING btree (status);


--
-- Name: idx_test_scenarios_tags; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_test_scenarios_tags ON prediction.test_scenarios USING gin (tags);


--
-- Name: idx_test_scenarios_target; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_test_scenarios_target ON prediction.test_scenarios USING btree (target_id) WHERE (target_id IS NOT NULL);


--
-- Name: idx_test_scenarios_target_symbols; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_test_scenarios_target_symbols ON prediction.test_scenarios USING gin (target_symbols);


--
-- Name: idx_test_scenarios_type; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_test_scenarios_type ON prediction.test_scenarios USING btree (scenario_type);


--
-- Name: idx_test_target_mirrors_real; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_test_target_mirrors_real ON prediction.test_target_mirrors USING btree (real_target_id);


--
-- Name: idx_test_target_mirrors_test; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_test_target_mirrors_test ON prediction.test_target_mirrors USING btree (test_target_id);


--
-- Name: idx_tool_requests_priority; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_tool_requests_priority ON prediction.tool_requests USING btree (priority);


--
-- Name: idx_tool_requests_test_data; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_tool_requests_test_data ON prediction.tool_requests USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_tool_requests_test_scenario; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_tool_requests_test_scenario ON prediction.tool_requests USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_unique_active_analyst_prediction; Type: INDEX; Schema: prediction; Owner: -
--

CREATE UNIQUE INDEX idx_unique_active_analyst_prediction ON prediction.predictions USING btree (target_id, analyst_slug) WHERE ((status = 'active'::text) AND (analyst_slug IS NOT NULL));


--
-- Name: idx_universe_context_versions_current; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_universe_context_versions_current ON prediction.universe_context_versions USING btree (universe_id, is_current) WHERE (is_current = true);


--
-- Name: idx_universe_context_versions_universe; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_universe_context_versions_universe ON prediction.universe_context_versions USING btree (universe_id);


--
-- Name: idx_universes_test_data; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_universes_test_data ON prediction.universes USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_universes_test_scenario; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_universes_test_scenario ON prediction.universes USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_user_portfolios_org; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_user_portfolios_org ON prediction.user_portfolios USING btree (org_slug);


--
-- Name: idx_user_portfolios_user; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_user_portfolios_user ON prediction.user_portfolios USING btree (user_id);


--
-- Name: idx_user_positions_open; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_user_positions_open ON prediction.user_positions USING btree (portfolio_id, status) WHERE (status = 'open'::text);


--
-- Name: idx_user_positions_portfolio; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_user_positions_portfolio ON prediction.user_positions USING btree (portfolio_id);


--
-- Name: idx_user_positions_prediction; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_user_positions_prediction ON prediction.user_positions USING btree (prediction_id);


--
-- Name: idx_user_positions_status; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_user_positions_status ON prediction.user_positions USING btree (status);


--
-- Name: idx_user_positions_target; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_user_positions_target ON prediction.user_positions USING btree (target_id);


--
-- Name: idx_user_trade_queue_pending; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_user_trade_queue_pending ON prediction.user_trade_queue USING btree (status) WHERE (status = 'queued'::text);


--
-- Name: idx_user_trade_queue_queued_at; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_user_trade_queue_queued_at ON prediction.user_trade_queue USING btree (queued_at DESC);


--
-- Name: idx_user_trade_queue_user; Type: INDEX; Schema: prediction; Owner: -
--

CREATE INDEX idx_user_trade_queue_user ON prediction.user_trade_queue USING btree (user_id, org_slug, status);


--
-- Name: assets_bucket_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assets_bucket_idx ON public.assets USING btree (bucket);


--
-- Name: assets_conversation_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assets_conversation_id_idx ON public.assets USING btree (conversation_id);


--
-- Name: assets_storage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assets_storage_idx ON public.assets USING btree (storage);


--
-- Name: assets_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assets_user_id_idx ON public.assets USING btree (user_id);


--
-- Name: cidafm_commands_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cidafm_commands_active_idx ON public.cidafm_commands USING btree (is_active);


--
-- Name: cidafm_commands_builtin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cidafm_commands_builtin_idx ON public.cidafm_commands USING btree (is_builtin);


--
-- Name: cidafm_commands_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cidafm_commands_category_idx ON public.cidafm_commands USING btree (category);


--
-- Name: cidafm_commands_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cidafm_commands_type_idx ON public.cidafm_commands USING btree (type);


--
-- Name: conversations_agent_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_agent_name_idx ON public.conversations USING btree (agent_name);


--
-- Name: conversations_organization_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_organization_slug_idx ON public.conversations USING btree (organization_slug);


--
-- Name: conversations_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_user_id_idx ON public.conversations USING btree (user_id);


--
-- Name: human_approvals_organization_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX human_approvals_organization_idx ON public.human_approvals USING btree (organization_slug);


--
-- Name: human_approvals_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX human_approvals_status_idx ON public.human_approvals USING btree (status);


--
-- Name: idx_agents_agent_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agents_agent_type ON public.agents USING btree (agent_type);


--
-- Name: idx_agents_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agents_created_at ON public.agents USING btree (created_at DESC);


--
-- Name: idx_agents_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agents_department ON public.agents USING btree (department);


--
-- Name: idx_agents_endpoint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agents_endpoint ON public.agents USING gin (endpoint);


--
-- Name: idx_agents_llm_config; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agents_llm_config ON public.agents USING gin (llm_config);


--
-- Name: idx_agents_metadata; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agents_metadata ON public.agents USING gin (metadata);


--
-- Name: idx_agents_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agents_name ON public.agents USING btree (name);


--
-- Name: idx_agents_organization_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agents_organization_slug ON public.agents USING gin (organization_slug);


--
-- Name: idx_agents_output_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agents_output_type ON public.agents USING btree (output_type);


--
-- Name: idx_agents_require_local_model; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agents_require_local_model ON public.agents USING btree (require_local_model) WHERE (require_local_model = true);


--
-- Name: idx_agents_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agents_status ON public.agents USING btree (status);


--
-- Name: idx_agents_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agents_tags ON public.agents USING gin (tags);


--
-- Name: idx_channel_message_log_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_message_log_channel ON public.channel_message_log USING btree (channel, created_at DESC);


--
-- Name: idx_channel_message_log_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_message_log_user ON public.channel_message_log USING btree (channel_user_id, created_at DESC);


--
-- Name: idx_channel_users_allowed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_users_allowed ON public.channel_users USING btree (is_allowed) WHERE (is_allowed = true);


--
-- Name: idx_channel_users_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_users_channel ON public.channel_users USING btree (channel, channel_user_id);


--
-- Name: idx_conv_messages_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conv_messages_conversation ON public.conversation_messages USING btree (conversation_id, created_at);


--
-- Name: idx_observability_events_agent_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_observability_events_agent_slug ON public.observability_events USING btree (agent_slug) WHERE (agent_slug IS NOT NULL);


--
-- Name: idx_observability_events_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_observability_events_conversation_id ON public.observability_events USING btree (conversation_id) WHERE (conversation_id IS NOT NULL);


--
-- Name: idx_observability_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_observability_events_created_at ON public.observability_events USING btree (created_at DESC);


--
-- Name: idx_observability_events_hook_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_observability_events_hook_event_type ON public.observability_events USING btree (hook_event_type);


--
-- Name: idx_observability_events_task_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_observability_events_task_id ON public.observability_events USING btree (task_id) WHERE (task_id IS NOT NULL);


--
-- Name: idx_observability_events_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_observability_events_timestamp ON public.observability_events USING btree ("timestamp" DESC);


--
-- Name: idx_observability_events_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_observability_events_user_id ON public.observability_events USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_organizations_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizations_created_at ON public.organizations USING btree (created_at DESC);


--
-- Name: idx_organizations_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizations_name ON public.organizations USING btree (name);


--
-- Name: idx_organizations_settings; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizations_settings ON public.organizations USING gin (settings);


--
-- Name: idx_redaction_patterns_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_redaction_patterns_category ON public.redaction_patterns USING btree (category);


--
-- Name: idx_redaction_patterns_data_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_redaction_patterns_data_type ON public.redaction_patterns USING btree (data_type);


--
-- Name: idx_redaction_patterns_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_redaction_patterns_is_active ON public.redaction_patterns USING btree (is_active);


--
-- Name: idx_redaction_patterns_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_redaction_patterns_severity ON public.redaction_patterns USING btree (severity);


--
-- Name: idx_tasks_hitl_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_hitl_pending ON public.tasks USING btree (hitl_pending, hitl_pending_since DESC) WHERE (hitl_pending = true);


--
-- Name: idx_team_members_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_members_team_id ON public.team_members USING btree (team_id);


--
-- Name: idx_team_members_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_members_user_id ON public.team_members USING btree (user_id);


--
-- Name: idx_teams_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_teams_created_by ON public.teams USING btree (created_by);


--
-- Name: idx_teams_org_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_teams_org_slug ON public.teams USING btree (org_slug);


--
-- Name: llm_models_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX llm_models_active_idx ON public.llm_models USING btree (is_active);


--
-- Name: llm_models_deprecated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX llm_models_deprecated_at_idx ON public.llm_models USING btree (deprecated_at) WHERE (deprecated_at IS NOT NULL);


--
-- Name: llm_models_last_validated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX llm_models_last_validated_idx ON public.llm_models USING btree (last_validated_at);


--
-- Name: llm_models_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX llm_models_provider_idx ON public.llm_models USING btree (provider_name);


--
-- Name: llm_models_tier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX llm_models_tier_idx ON public.llm_models USING btree (model_tier);


--
-- Name: llm_providers_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX llm_providers_active_idx ON public.llm_providers USING btree (is_active);


--
-- Name: llm_usage_conversation_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX llm_usage_conversation_id_idx ON public.llm_usage USING btree (conversation_id);


--
-- Name: llm_usage_model_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX llm_usage_model_idx ON public.llm_usage USING btree (model_name);


--
-- Name: llm_usage_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX llm_usage_provider_idx ON public.llm_usage USING btree (provider_name);


--
-- Name: llm_usage_showstopper_detected_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX llm_usage_showstopper_detected_idx ON public.llm_usage USING btree (showstopper_detected);


--
-- Name: llm_usage_started_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX llm_usage_started_at_idx ON public.llm_usage USING btree (started_at);


--
-- Name: llm_usage_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX llm_usage_user_id_idx ON public.llm_usage USING btree (user_id);


--
-- Name: org_credentials_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_credentials_org_idx ON public.organization_credentials USING btree (organization_slug);


--
-- Name: pseudonym_dict_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pseudonym_dict_expires_at_idx ON public.pseudonym_dictionaries USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: pseudonym_dict_org_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pseudonym_dict_org_agent_idx ON public.pseudonym_dictionaries USING btree (organization_slug, agent_slug) WHERE (is_active = true);


--
-- Name: pseudonym_dict_user_conv_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pseudonym_dict_user_conv_idx ON public.pseudonym_dictionaries USING btree (user_id, conversation_id);


--
-- Name: pseudonym_dict_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pseudonym_dict_user_id_idx ON public.pseudonym_dictionaries USING btree (user_id);


--
-- Name: task_messages_task_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_messages_task_id_idx ON public.task_messages USING btree (task_id);


--
-- Name: tasks_conversation_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_conversation_id_idx ON public.tasks USING btree (conversation_id);


--
-- Name: tasks_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_status_idx ON public.tasks USING btree (status);


--
-- Name: tasks_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_user_id_idx ON public.tasks USING btree (user_id);


--
-- Name: teams_org_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX teams_org_name_unique ON public.teams USING btree (COALESCE(org_slug, ''::text), name);


--
-- Name: user_cidafm_commands_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_cidafm_commands_user_idx ON public.user_cidafm_commands USING btree (user_id);


--
-- Name: idx_rag_chunks_collection; Type: INDEX; Schema: rag_data; Owner: -
--

CREATE INDEX idx_rag_chunks_collection ON rag_data.rag_document_chunks USING btree (collection_id);


--
-- Name: idx_rag_chunks_document; Type: INDEX; Schema: rag_data; Owner: -
--

CREATE INDEX idx_rag_chunks_document ON rag_data.rag_document_chunks USING btree (document_id);


--
-- Name: idx_rag_chunks_embedding; Type: INDEX; Schema: rag_data; Owner: -
--

CREATE INDEX idx_rag_chunks_embedding ON rag_data.rag_document_chunks USING hnsw (embedding rag_data.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: idx_rag_chunks_org; Type: INDEX; Schema: rag_data; Owner: -
--

CREATE INDEX idx_rag_chunks_org ON rag_data.rag_document_chunks USING btree (organization_slug);


--
-- Name: idx_rag_collections_allowed_users; Type: INDEX; Schema: rag_data; Owner: -
--

CREATE INDEX idx_rag_collections_allowed_users ON rag_data.rag_collections USING gin (allowed_users);


--
-- Name: idx_rag_collections_complexity_type; Type: INDEX; Schema: rag_data; Owner: -
--

CREATE INDEX idx_rag_collections_complexity_type ON rag_data.rag_collections USING btree (complexity_type);


--
-- Name: idx_rag_collections_org; Type: INDEX; Schema: rag_data; Owner: -
--

CREATE INDEX idx_rag_collections_org ON rag_data.rag_collections USING btree (organization_slug);


--
-- Name: idx_rag_collections_org_slug; Type: INDEX; Schema: rag_data; Owner: -
--

CREATE INDEX idx_rag_collections_org_slug ON rag_data.rag_collections USING btree (organization_slug, slug);


--
-- Name: idx_rag_collections_status; Type: INDEX; Schema: rag_data; Owner: -
--

CREATE INDEX idx_rag_collections_status ON rag_data.rag_collections USING btree (status);


--
-- Name: idx_rag_documents_collection; Type: INDEX; Schema: rag_data; Owner: -
--

CREATE INDEX idx_rag_documents_collection ON rag_data.rag_documents USING btree (collection_id);


--
-- Name: idx_rag_documents_hash; Type: INDEX; Schema: rag_data; Owner: -
--

CREATE INDEX idx_rag_documents_hash ON rag_data.rag_documents USING btree (file_hash);


--
-- Name: idx_rag_documents_org; Type: INDEX; Schema: rag_data; Owner: -
--

CREATE INDEX idx_rag_documents_org ON rag_data.rag_documents USING btree (organization_slug);


--
-- Name: idx_rag_documents_status; Type: INDEX; Schema: rag_data; Owner: -
--

CREATE INDEX idx_rag_documents_status ON rag_data.rag_documents USING btree (status);


--
-- Name: idx_composite_scores_scope_time; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_composite_scores_scope_time ON risk.composite_scores USING btree (subject_id, status, created_at DESC);


--
-- Name: idx_composite_scores_subject_time; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_composite_scores_subject_time ON risk.composite_scores USING btree (subject_id, created_at DESC);


--
-- Name: idx_data_sources_next_fetch; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_data_sources_next_fetch ON risk.data_sources USING btree (next_fetch_at) WHERE ((status)::text = 'active'::text);


--
-- Name: idx_data_sources_scope_id; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_data_sources_scope_id ON risk.data_sources USING btree (scope_id);


--
-- Name: idx_data_sources_source_type; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_data_sources_source_type ON risk.data_sources USING btree (source_type);


--
-- Name: idx_data_sources_status; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_data_sources_status ON risk.data_sources USING btree (status);


--
-- Name: idx_fetch_history_fetched_at; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_fetch_history_fetched_at ON risk.data_source_fetch_history USING btree (fetched_at DESC);


--
-- Name: idx_fetch_history_source_id; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_fetch_history_source_id ON risk.data_source_fetch_history USING btree (data_source_id);


--
-- Name: idx_risk_alerts_composite; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_alerts_composite ON risk.alerts USING btree (composite_score_id);


--
-- Name: idx_risk_alerts_created; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_alerts_created ON risk.alerts USING btree (created_at DESC);


--
-- Name: idx_risk_alerts_severity; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_alerts_severity ON risk.alerts USING btree (severity);


--
-- Name: idx_risk_alerts_subject; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_alerts_subject ON risk.alerts USING btree (subject_id);


--
-- Name: idx_risk_alerts_type; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_alerts_type ON risk.alerts USING btree (alert_type);


--
-- Name: idx_risk_alerts_unacknowledged; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_alerts_unacknowledged ON risk.alerts USING btree (acknowledged_at) WHERE (acknowledged_at IS NULL);


--
-- Name: idx_risk_article_class_article; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_article_class_article ON risk.article_classifications USING btree (article_id);


--
-- Name: idx_risk_article_class_created; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_article_class_created ON risk.article_classifications USING btree (created_at DESC);


--
-- Name: idx_risk_article_class_dimensions; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_article_class_dimensions ON risk.article_classifications USING gin (dimension_slugs);


--
-- Name: idx_risk_article_class_scope; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_article_class_scope ON risk.article_classifications USING btree (scope_id);


--
-- Name: idx_risk_article_class_sentiment; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_article_class_sentiment ON risk.article_classifications USING btree (sentiment_label);


--
-- Name: idx_risk_article_class_status; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_article_class_status ON risk.article_classifications USING btree (status) WHERE (status = 'classified'::text);


--
-- Name: idx_risk_article_class_subjects; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_article_class_subjects ON risk.article_classifications USING gin (subject_identifiers);


--
-- Name: idx_risk_assessments_created; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_assessments_created ON risk.assessments USING btree (created_at DESC);


--
-- Name: idx_risk_assessments_dimension; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_assessments_dimension ON risk.assessments USING btree (dimension_id);


--
-- Name: idx_risk_assessments_subject; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_assessments_subject ON risk.assessments USING btree (subject_id);


--
-- Name: idx_risk_assessments_task; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_assessments_task ON risk.assessments USING btree (task_id);


--
-- Name: idx_risk_comparisons_created; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_comparisons_created ON risk.comparisons USING btree (created_at DESC);


--
-- Name: idx_risk_comparisons_scope; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_comparisons_scope ON risk.comparisons USING btree (scope_id);


--
-- Name: idx_risk_composite_active; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_composite_active ON risk.composite_scores USING btree (subject_id, status) WHERE (status = 'active'::text);


--
-- Name: idx_risk_composite_created; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_composite_created ON risk.composite_scores USING btree (created_at DESC);


--
-- Name: idx_risk_composite_status; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_composite_status ON risk.composite_scores USING btree (status);


--
-- Name: idx_risk_composite_subject; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_composite_subject ON risk.composite_scores USING btree (subject_id);


--
-- Name: idx_risk_composite_task; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_composite_task ON risk.composite_scores USING btree (task_id);


--
-- Name: idx_risk_debate_contexts_active; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_debate_contexts_active ON risk.debate_contexts USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_risk_debate_contexts_role; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_debate_contexts_role ON risk.debate_contexts USING btree (role);


--
-- Name: idx_risk_debate_contexts_scope; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_debate_contexts_scope ON risk.debate_contexts USING btree (scope_id);


--
-- Name: idx_risk_debates_created; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_debates_created ON risk.debates USING btree (created_at DESC);


--
-- Name: idx_risk_debates_status; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_debates_status ON risk.debates USING btree (status);


--
-- Name: idx_risk_debates_subject; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_debates_subject ON risk.debates USING btree (subject_id);


--
-- Name: idx_risk_debates_task; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_debates_task ON risk.debates USING btree (task_id);


--
-- Name: idx_risk_dim_contexts_active; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_dim_contexts_active ON risk.dimension_contexts USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_risk_dim_contexts_dimension; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_dim_contexts_dimension ON risk.dimension_contexts USING btree (dimension_id);


--
-- Name: idx_risk_dim_contexts_version; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_dim_contexts_version ON risk.dimension_contexts USING btree (dimension_id, version);


--
-- Name: idx_risk_dimensions_active; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_dimensions_active ON risk.dimensions USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_risk_dimensions_scope; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_dimensions_scope ON risk.dimensions USING btree (scope_id);


--
-- Name: idx_risk_dimensions_slug; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_dimensions_slug ON risk.dimensions USING btree (slug);


--
-- Name: idx_risk_evaluations_composite; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_evaluations_composite ON risk.evaluations USING btree (composite_score_id);


--
-- Name: idx_risk_evaluations_created; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_evaluations_created ON risk.evaluations USING btree (created_at DESC);


--
-- Name: idx_risk_evaluations_subject; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_evaluations_subject ON risk.evaluations USING btree (subject_id);


--
-- Name: idx_risk_evaluations_window; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_evaluations_window ON risk.evaluations USING btree (evaluation_window);


--
-- Name: idx_risk_executive_summaries_generated; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_executive_summaries_generated ON risk.executive_summaries USING btree (generated_at DESC);


--
-- Name: idx_risk_executive_summaries_scope; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_executive_summaries_scope ON risk.executive_summaries USING btree (scope_id);


--
-- Name: idx_risk_executive_summaries_type; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_executive_summaries_type ON risk.executive_summaries USING btree (summary_type);


--
-- Name: idx_risk_learning_queue_created; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_learning_queue_created ON risk.learning_queue USING btree (created_at DESC);


--
-- Name: idx_risk_learning_queue_pending; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_learning_queue_pending ON risk.learning_queue USING btree (status) WHERE (status = 'pending'::text);


--
-- Name: idx_risk_learning_queue_scope; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_learning_queue_scope ON risk.learning_queue USING btree (scope_id);


--
-- Name: idx_risk_learning_queue_status; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_learning_queue_status ON risk.learning_queue USING btree (status);


--
-- Name: idx_risk_learnings_dimension; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_learnings_dimension ON risk.learnings USING btree (dimension_id);


--
-- Name: idx_risk_learnings_production; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_learnings_production ON risk.learnings USING btree (is_production) WHERE (is_production = true);


--
-- Name: idx_risk_learnings_scope; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_learnings_scope ON risk.learnings USING btree (scope_id);


--
-- Name: idx_risk_learnings_scope_level; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_learnings_scope_level ON risk.learnings USING btree (scope_level);


--
-- Name: idx_risk_learnings_status; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_learnings_status ON risk.learnings USING btree (status);


--
-- Name: idx_risk_learnings_subject; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_learnings_subject ON risk.learnings USING btree (subject_id);


--
-- Name: idx_risk_learnings_type; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_learnings_type ON risk.learnings USING btree (learning_type);


--
-- Name: idx_risk_reports_created; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_reports_created ON risk.reports USING btree (created_at DESC);


--
-- Name: idx_risk_reports_scope; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_reports_scope ON risk.reports USING btree (scope_id);


--
-- Name: idx_risk_reports_status; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_reports_status ON risk.reports USING btree (status);


--
-- Name: idx_risk_scenarios_created; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_scenarios_created ON risk.scenarios USING btree (created_at DESC);


--
-- Name: idx_risk_scenarios_scope; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_scenarios_scope ON risk.scenarios USING btree (scope_id);


--
-- Name: idx_risk_scenarios_template; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_scenarios_template ON risk.scenarios USING btree (is_template) WHERE (is_template = true);


--
-- Name: idx_risk_scopes_active; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_scopes_active ON risk.scopes USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_risk_scopes_agent; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_scopes_agent ON risk.scopes USING btree (agent_slug);


--
-- Name: idx_risk_scopes_domain; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_scopes_domain ON risk.scopes USING btree (domain);


--
-- Name: idx_risk_scopes_org; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_scopes_org ON risk.scopes USING btree (organization_slug);


--
-- Name: idx_risk_source_subs_active; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_source_subs_active ON risk.source_subscriptions USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_risk_source_subs_dimension_mapping; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_source_subs_dimension_mapping ON risk.source_subscriptions USING gin (dimension_mapping);


--
-- Name: idx_risk_source_subs_last_processed; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_source_subs_last_processed ON risk.source_subscriptions USING btree (last_processed_at);


--
-- Name: idx_risk_source_subs_scope; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_source_subs_scope ON risk.source_subscriptions USING btree (scope_id);


--
-- Name: idx_risk_source_subs_source; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_source_subs_source ON risk.source_subscriptions USING btree (source_id);


--
-- Name: idx_risk_source_subs_subject_filter; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_source_subs_subject_filter ON risk.source_subscriptions USING gin (subject_filter);


--
-- Name: idx_risk_subjects_active; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_subjects_active ON risk.subjects USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_risk_subjects_identifier; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_subjects_identifier ON risk.subjects USING btree (identifier);


--
-- Name: idx_risk_subjects_scope; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_subjects_scope ON risk.subjects USING btree (scope_id);


--
-- Name: idx_risk_subjects_type; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_risk_subjects_type ON risk.subjects USING btree (subject_type);


--
-- Name: idx_simulations_created_at; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_simulations_created_at ON risk.simulations USING btree (created_at DESC);


--
-- Name: idx_simulations_scope_id; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_simulations_scope_id ON risk.simulations USING btree (scope_id);


--
-- Name: idx_simulations_status; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_simulations_status ON risk.simulations USING btree (status);


--
-- Name: idx_simulations_subject_id; Type: INDEX; Schema: risk; Owner: -
--

CREATE INDEX idx_simulations_subject_id ON risk.simulations USING btree (subject_id);


--
-- Name: replay_test_summary _RETURN; Type: RULE; Schema: prediction; Owner: -
--

CREATE OR REPLACE VIEW prediction.replay_test_summary AS
 SELECT rt.id,
    rt.organization_slug,
    rt.name,
    rt.description,
    rt.status,
    rt.rollback_depth,
    rt.rollback_to,
    rt.universe_id,
    rt.target_ids,
    rt.created_by,
    rt.created_at,
    rt.started_at,
    rt.completed_at,
    rt.error_message,
    count(rtr.id) AS total_comparisons,
    count(rtr.id) FILTER (WHERE (rtr.direction_match = true)) AS direction_matches,
    count(rtr.id) FILTER (WHERE (rtr.original_correct = true)) AS original_correct_count,
    count(rtr.id) FILTER (WHERE (rtr.replay_correct = true)) AS replay_correct_count,
    count(rtr.id) FILTER (WHERE (rtr.improvement = true)) AS improvements,
        CASE
            WHEN (count(rtr.id) FILTER (WHERE (rtr.original_correct IS NOT NULL)) > 0) THEN round((((count(rtr.id) FILTER (WHERE (rtr.original_correct = true)))::numeric / (count(rtr.id) FILTER (WHERE (rtr.original_correct IS NOT NULL)))::numeric) * (100)::numeric), 2)
            ELSE NULL::numeric
        END AS original_accuracy_pct,
        CASE
            WHEN (count(rtr.id) FILTER (WHERE (rtr.replay_correct IS NOT NULL)) > 0) THEN round((((count(rtr.id) FILTER (WHERE (rtr.replay_correct = true)))::numeric / (count(rtr.id) FILTER (WHERE (rtr.replay_correct IS NOT NULL)))::numeric) * (100)::numeric), 2)
            ELSE NULL::numeric
        END AS replay_accuracy_pct,
    sum(rtr.pnl_original) AS total_pnl_original,
    sum(rtr.pnl_replay) AS total_pnl_replay,
    sum(rtr.pnl_diff) AS total_pnl_improvement,
    avg(rtr.confidence_diff) AS avg_confidence_diff
   FROM (prediction.replay_tests rt
     LEFT JOIN prediction.replay_test_results rtr ON ((rtr.replay_test_id = rt.id)))
  GROUP BY rt.id;


--
-- Name: dimension_contribution _RETURN; Type: RULE; Schema: risk; Owner: -
--

CREATE OR REPLACE VIEW risk.dimension_contribution AS
 SELECT d.scope_id,
    d.id AS dimension_id,
    d.slug AS dimension_slug,
    d.display_name AS dimension_name,
    d.icon AS dimension_icon,
    d.color AS dimension_color,
    d.weight,
    count(a.id) AS assessment_count,
    round(avg(a.score), 2) AS avg_score,
    round(avg(a.confidence), 3) AS avg_confidence,
    max(a.score) AS max_score,
    min(a.score) AS min_score,
    round((avg(a.score) * d.weight), 2) AS weighted_contribution
   FROM (risk.dimensions d
     LEFT JOIN risk.assessments a ON (((a.dimension_id = d.id) AND (a.is_test = false))))
  WHERE ((d.is_active = true) AND (d.is_test = false))
  GROUP BY d.scope_id, d.id, d.slug, d.display_name, d.icon, d.color, d.weight
  ORDER BY d.display_order;


--
-- Name: adapter_state trg_ambient_adapter_state_updated_at; Type: TRIGGER; Schema: ambient; Owner: -
--

CREATE TRIGGER trg_ambient_adapter_state_updated_at BEFORE UPDATE ON ambient.adapter_state FOR EACH ROW EXECUTE FUNCTION ambient.set_updated_at();


--
-- Name: triggers trg_ambient_triggers_updated_at; Type: TRIGGER; Schema: ambient; Owner: -
--

CREATE TRIGGER trg_ambient_triggers_updated_at BEFORE UPDATE ON ambient.triggers FOR EACH ROW EXECUTE FUNCTION ambient.set_updated_at();


--
-- Name: external_agents trg_external_agents_updated_at; Type: TRIGGER; Schema: ambient; Owner: -
--

CREATE TRIGGER trg_external_agents_updated_at BEFORE UPDATE ON ambient.external_agents FOR EACH ROW EXECUTE FUNCTION ambient.set_updated_at();


--
-- Name: auth_identity_links auth_identity_links_updated_at; Type: TRIGGER; Schema: authz; Owner: -
--

CREATE TRIGGER auth_identity_links_updated_at BEFORE UPDATE ON authz.auth_identity_links FOR EACH ROW EXECUTE FUNCTION public.update_auth_identity_links_updated_at();


--
-- Name: rbac_roles rbac_roles_updated_at; Type: TRIGGER; Schema: authz; Owner: -
--

CREATE TRIGGER rbac_roles_updated_at BEFORE UPDATE ON authz.rbac_roles FOR EACH ROW EXECUTE FUNCTION authz.update_rbac_roles_updated_at();


--
-- Name: users users_updated_at; Type: TRIGGER; Schema: authz; Owner: -
--

CREATE TRIGGER users_updated_at BEFORE UPDATE ON authz.users FOR EACH ROW EXECUTE FUNCTION authz.update_users_updated_at();


--
-- Name: companies set_companies_updated_at; Type: TRIGGER; Schema: company; Owner: -
--

CREATE TRIGGER set_companies_updated_at BEFORE UPDATE ON company.companies FOR EACH ROW EXECUTE FUNCTION company.set_updated_at();


--
-- Name: outreach set_outreach_updated_at; Type: TRIGGER; Schema: company; Owner: -
--

CREATE TRIGGER set_outreach_updated_at BEFORE UPDATE ON company.outreach FOR EACH ROW EXECUTE FUNCTION company.set_updated_at();


--
-- Name: sources set_crawler_sources_updated_at; Type: TRIGGER; Schema: crawler; Owner: -
--

CREATE TRIGGER set_crawler_sources_updated_at BEFORE UPDATE ON crawler.sources FOR EACH ROW EXECUTE FUNCTION crawler.set_updated_at();


--
-- Name: drawings set_engineering_drawings_updated_at; Type: TRIGGER; Schema: engineering; Owner: -
--

CREATE TRIGGER set_engineering_drawings_updated_at BEFORE UPDATE ON engineering.drawings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: part_library set_engineering_part_library_updated_at; Type: TRIGGER; Schema: engineering; Owner: -
--

CREATE TRIGGER set_engineering_part_library_updated_at BEFORE UPDATE ON engineering.part_library FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: projects set_engineering_projects_updated_at; Type: TRIGGER; Schema: engineering; Owner: -
--

CREATE TRIGGER set_engineering_projects_updated_at BEFORE UPDATE ON engineering.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: analysis_tasks set_law_analysis_tasks_updated_at; Type: TRIGGER; Schema: law; Owner: -
--

CREATE TRIGGER set_law_analysis_tasks_updated_at BEFORE UPDATE ON law.analysis_tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: playbooks set_law_playbooks_updated_at; Type: TRIGGER; Schema: law; Owner: -
--

CREATE TRIGGER set_law_playbooks_updated_at BEFORE UPDATE ON law.playbooks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: agent_idea_submissions set_agent_idea_submissions_updated_at; Type: TRIGGER; Schema: leads; Owner: -
--

CREATE TRIGGER set_agent_idea_submissions_updated_at BEFORE UPDATE ON leads.agent_idea_submissions FOR EACH ROW EXECUTE FUNCTION leads.set_updated_at();


--
-- Name: outputs outputs_updated_at; Type: TRIGGER; Schema: marketing; Owner: -
--

CREATE TRIGGER outputs_updated_at BEFORE UPDATE ON marketing.outputs FOR EACH ROW EXECUTE FUNCTION marketing.update_outputs_updated_at();


--
-- Name: team_files team_files_updated_at; Type: TRIGGER; Schema: orch_flow; Owner: -
--

CREATE TRIGGER team_files_updated_at BEFORE UPDATE ON orch_flow.team_files FOR EACH ROW EXECUTE FUNCTION orch_flow.set_team_files_updated_at();


--
-- Name: analyst_overrides set_analyst_overrides_updated_at; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER set_analyst_overrides_updated_at BEFORE UPDATE ON prediction.analyst_overrides FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: analyst_portfolios set_analyst_portfolios_updated_at; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER set_analyst_portfolios_updated_at BEFORE UPDATE ON prediction.analyst_portfolios FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: analyst_positions set_analyst_positions_updated_at; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER set_analyst_positions_updated_at BEFORE UPDATE ON prediction.analyst_positions FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: analysts set_analysts_updated_at; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER set_analysts_updated_at BEFORE UPDATE ON prediction.analysts FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: learning_queue set_learning_queue_updated_at; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER set_learning_queue_updated_at BEFORE UPDATE ON prediction.learning_queue FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: learnings set_learnings_updated_at; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER set_learnings_updated_at BEFORE UPDATE ON prediction.learnings FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: evaluations set_prediction_evaluations_updated_at; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER set_prediction_evaluations_updated_at BEFORE UPDATE ON prediction.evaluations FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: missed_opportunities set_prediction_missed_updated_at; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER set_prediction_missed_updated_at BEFORE UPDATE ON prediction.missed_opportunities FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: predictions set_prediction_predictions_updated_at; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER set_prediction_predictions_updated_at BEFORE UPDATE ON prediction.predictions FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: predictors set_prediction_predictors_updated_at; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER set_prediction_predictors_updated_at BEFORE UPDATE ON prediction.predictors FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: signals set_prediction_signals_updated_at; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER set_prediction_signals_updated_at BEFORE UPDATE ON prediction.signals FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: source_subscriptions set_prediction_source_subs_updated_at; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER set_prediction_source_subs_updated_at BEFORE UPDATE ON prediction.source_subscriptions FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: strategies set_prediction_strategies_updated_at; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER set_prediction_strategies_updated_at BEFORE UPDATE ON prediction.strategies FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: targets set_prediction_targets_updated_at; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER set_prediction_targets_updated_at BEFORE UPDATE ON prediction.targets FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: tool_requests set_prediction_tool_requests_updated_at; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER set_prediction_tool_requests_updated_at BEFORE UPDATE ON prediction.tool_requests FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: universes set_prediction_universes_updated_at; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER set_prediction_universes_updated_at BEFORE UPDATE ON prediction.universes FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: review_queue set_review_queue_updated_at; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER set_review_queue_updated_at BEFORE UPDATE ON prediction.review_queue FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: test_scenarios set_test_scenarios_updated_at; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER set_test_scenarios_updated_at BEFORE UPDATE ON prediction.test_scenarios FOR EACH ROW EXECUTE FUNCTION prediction.set_test_scenarios_updated_at();


--
-- Name: user_portfolios set_user_portfolios_updated_at; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER set_user_portfolios_updated_at BEFORE UPDATE ON prediction.user_portfolios FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: user_positions set_user_positions_updated_at; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER set_user_positions_updated_at BEFORE UPDATE ON prediction.user_positions FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: targets trg_auto_create_test_mirror; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER trg_auto_create_test_mirror AFTER INSERT ON prediction.targets FOR EACH ROW EXECUTE FUNCTION prediction.auto_create_test_mirror();


--
-- Name: daily_postmortem_recommendations trg_daily_postmortem_recommendations_updated_at; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER trg_daily_postmortem_recommendations_updated_at BEFORE UPDATE ON prediction.daily_postmortem_recommendations FOR EACH ROW EXECUTE FUNCTION prediction.update_daily_postmortem_recommendations_timestamp();


--
-- Name: daily_postmortem_runs trg_daily_postmortem_runs_updated_at; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER trg_daily_postmortem_runs_updated_at BEFORE UPDATE ON prediction.daily_postmortem_runs FOR EACH ROW EXECUTE FUNCTION prediction.update_daily_postmortem_runs_timestamp();


--
-- Name: predictions trg_enforce_prediction_direction; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER trg_enforce_prediction_direction BEFORE INSERT OR UPDATE ON prediction.predictions FOR EACH ROW EXECUTE FUNCTION prediction.enforce_prediction_direction();


--
-- Name: predictors trg_enforce_predictor_direction; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER trg_enforce_predictor_direction BEFORE INSERT OR UPDATE ON prediction.predictors FOR EACH ROW EXECUTE FUNCTION prediction.enforce_predictor_direction();


--
-- Name: predictors trg_enforce_predictor_is_test; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER trg_enforce_predictor_is_test BEFORE INSERT OR UPDATE ON prediction.predictors FOR EACH ROW EXECUTE FUNCTION prediction.enforce_predictor_is_test();


--
-- Name: signals trg_enforce_signal_direction; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER trg_enforce_signal_direction BEFORE INSERT OR UPDATE ON prediction.signals FOR EACH ROW EXECUTE FUNCTION prediction.enforce_signal_direction();


--
-- Name: signals trg_enforce_signal_is_test; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER trg_enforce_signal_is_test BEFORE INSERT OR UPDATE ON prediction.signals FOR EACH ROW EXECUTE FUNCTION prediction.enforce_signal_is_test();


--
-- Name: targets trg_enforce_target_domain_type; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER trg_enforce_target_domain_type BEFORE INSERT OR UPDATE ON prediction.targets FOR EACH ROW EXECUTE FUNCTION prediction.enforce_target_domain_type();


--
-- Name: predictors trg_enforce_test_target_isolation; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER trg_enforce_test_target_isolation BEFORE INSERT OR UPDATE ON prediction.predictors FOR EACH ROW EXECUTE FUNCTION prediction.enforce_test_target_isolation();


--
-- Name: predictions trg_prediction_status_transition; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER trg_prediction_status_transition BEFORE UPDATE ON prediction.predictions FOR EACH ROW EXECUTE FUNCTION prediction.validate_prediction_status_transition();


--
-- Name: analyst_portfolios trg_update_analyst_portfolio_status; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER trg_update_analyst_portfolio_status BEFORE UPDATE OF current_balance ON prediction.analyst_portfolios FOR EACH ROW EXECUTE FUNCTION prediction.update_analyst_portfolio_status();


--
-- Name: learning_lineage trg_validate_learning_lineage; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER trg_validate_learning_lineage BEFORE INSERT OR UPDATE ON prediction.learning_lineage FOR EACH ROW EXECUTE FUNCTION prediction.validate_learning_lineage();


--
-- Name: test_articles trg_validate_test_article_symbols; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER trg_validate_test_article_symbols BEFORE INSERT OR UPDATE ON prediction.test_articles FOR EACH ROW EXECUTE FUNCTION prediction.validate_test_article_symbols();


--
-- Name: test_scenarios trg_validate_test_target_symbols; Type: TRIGGER; Schema: prediction; Owner: -
--

CREATE TRIGGER trg_validate_test_target_symbols BEFORE INSERT OR UPDATE ON prediction.test_scenarios FOR EACH ROW EXECUTE FUNCTION prediction.validate_test_target_symbols();


--
-- Name: llm_models llm_models_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER llm_models_updated_at BEFORE UPDATE ON public.llm_models FOR EACH ROW EXECUTE FUNCTION public.update_llm_models_updated_at();


--
-- Name: llm_providers llm_providers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER llm_providers_updated_at BEFORE UPDATE ON public.llm_providers FOR EACH ROW EXECUTE FUNCTION public.update_llm_providers_updated_at();


--
-- Name: agents set_agents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_agents_updated_at BEFORE UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: organizations set_organizations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: teams teams_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER teams_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.set_teams_updated_at();


--
-- Name: redaction_patterns update_redaction_patterns_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_redaction_patterns_updated_at BEFORE UPDATE ON public.redaction_patterns FOR EACH ROW EXECUTE FUNCTION public.update_redaction_patterns_updated_at();


--
-- Name: rag_collections set_collections_updated_at; Type: TRIGGER; Schema: rag_data; Owner: -
--

CREATE TRIGGER set_collections_updated_at BEFORE UPDATE ON rag_data.rag_collections FOR EACH ROW EXECUTE FUNCTION rag_data.set_updated_at();


--
-- Name: rag_documents set_documents_updated_at; Type: TRIGGER; Schema: rag_data; Owner: -
--

CREATE TRIGGER set_documents_updated_at BEFORE UPDATE ON rag_data.rag_documents FOR EACH ROW EXECUTE FUNCTION rag_data.set_updated_at();


--
-- Name: source_subscriptions set_risk_source_subs_updated_at; Type: TRIGGER; Schema: risk; Owner: -
--

CREATE TRIGGER set_risk_source_subs_updated_at BEFORE UPDATE ON risk.source_subscriptions FOR EACH ROW EXECUTE FUNCTION risk.set_updated_at();


--
-- Name: debate_contexts set_updated_at_debate_contexts; Type: TRIGGER; Schema: risk; Owner: -
--

CREATE TRIGGER set_updated_at_debate_contexts BEFORE UPDATE ON risk.debate_contexts FOR EACH ROW EXECUTE FUNCTION risk.set_updated_at();


--
-- Name: dimension_contexts set_updated_at_dimension_contexts; Type: TRIGGER; Schema: risk; Owner: -
--

CREATE TRIGGER set_updated_at_dimension_contexts BEFORE UPDATE ON risk.dimension_contexts FOR EACH ROW EXECUTE FUNCTION risk.set_updated_at();


--
-- Name: dimensions set_updated_at_dimensions; Type: TRIGGER; Schema: risk; Owner: -
--

CREATE TRIGGER set_updated_at_dimensions BEFORE UPDATE ON risk.dimensions FOR EACH ROW EXECUTE FUNCTION risk.set_updated_at();


--
-- Name: learnings set_updated_at_learnings; Type: TRIGGER; Schema: risk; Owner: -
--

CREATE TRIGGER set_updated_at_learnings BEFORE UPDATE ON risk.learnings FOR EACH ROW EXECUTE FUNCTION risk.set_updated_at();


--
-- Name: scopes set_updated_at_scopes; Type: TRIGGER; Schema: risk; Owner: -
--

CREATE TRIGGER set_updated_at_scopes BEFORE UPDATE ON risk.scopes FOR EACH ROW EXECUTE FUNCTION risk.set_updated_at();


--
-- Name: subjects set_updated_at_subjects; Type: TRIGGER; Schema: risk; Owner: -
--

CREATE TRIGGER set_updated_at_subjects BEFORE UPDATE ON risk.subjects FOR EACH ROW EXECUTE FUNCTION risk.set_updated_at();


--
-- Name: data_sources trigger_data_sources_updated_at; Type: TRIGGER; Schema: risk; Owner: -
--

CREATE TRIGGER trigger_data_sources_updated_at BEFORE UPDATE ON risk.data_sources FOR EACH ROW EXECUTE FUNCTION risk.update_data_sources_updated_at();


--
-- Name: executive_summaries trigger_executive_summaries_updated_at; Type: TRIGGER; Schema: risk; Owner: -
--

CREATE TRIGGER trigger_executive_summaries_updated_at BEFORE UPDATE ON risk.executive_summaries FOR EACH ROW EXECUTE FUNCTION risk.update_executive_summaries_updated_at();


--
-- Name: reports trigger_reports_updated_at; Type: TRIGGER; Schema: risk; Owner: -
--

CREATE TRIGGER trigger_reports_updated_at BEFORE UPDATE ON risk.reports FOR EACH ROW EXECUTE FUNCTION risk.update_reports_updated_at();


--
-- Name: scenarios trigger_scenarios_updated_at; Type: TRIGGER; Schema: risk; Owner: -
--

CREATE TRIGGER trigger_scenarios_updated_at BEFORE UPDATE ON risk.scenarios FOR EACH ROW EXECUTE FUNCTION risk.update_scenarios_updated_at();


--
-- Name: dimensions validate_dimension_weights_trigger; Type: TRIGGER; Schema: risk; Owner: -
--

CREATE TRIGGER validate_dimension_weights_trigger AFTER INSERT OR UPDATE ON risk.dimensions FOR EACH STATEMENT EXECUTE FUNCTION risk.validate_dimension_weights();


--
-- Name: adapter_state adapter_state_trigger_id_fkey; Type: FK CONSTRAINT; Schema: ambient; Owner: -
--

ALTER TABLE ONLY ambient.adapter_state
    ADD CONSTRAINT adapter_state_trigger_id_fkey FOREIGN KEY (trigger_id) REFERENCES ambient.triggers(id) ON DELETE CASCADE;


--
-- Name: trigger_executions trigger_executions_trigger_id_fkey; Type: FK CONSTRAINT; Schema: ambient; Owner: -
--

ALTER TABLE ONLY ambient.trigger_executions
    ADD CONSTRAINT trigger_executions_trigger_id_fkey FOREIGN KEY (trigger_id) REFERENCES ambient.triggers(id) ON DELETE CASCADE;


--
-- Name: auth_identity_links auth_identity_links_user_id_fkey; Type: FK CONSTRAINT; Schema: authz; Owner: -
--

ALTER TABLE ONLY authz.auth_identity_links
    ADD CONSTRAINT auth_identity_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES authz.users(id) ON DELETE CASCADE;


--
-- Name: org_entitlements org_entitlements_granted_by_fkey; Type: FK CONSTRAINT; Schema: authz; Owner: -
--

ALTER TABLE ONLY authz.org_entitlements
    ADD CONSTRAINT org_entitlements_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: org_entitlements org_entitlements_org_slug_fkey; Type: FK CONSTRAINT; Schema: authz; Owner: -
--

ALTER TABLE ONLY authz.org_entitlements
    ADD CONSTRAINT org_entitlements_org_slug_fkey FOREIGN KEY (org_slug) REFERENCES public.organizations(slug) ON DELETE CASCADE;


--
-- Name: rbac_audit_log rbac_audit_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: authz; Owner: -
--

ALTER TABLE ONLY authz.rbac_audit_log
    ADD CONSTRAINT rbac_audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id);


--
-- Name: rbac_audit_log rbac_audit_log_target_role_id_fkey; Type: FK CONSTRAINT; Schema: authz; Owner: -
--

ALTER TABLE ONLY authz.rbac_audit_log
    ADD CONSTRAINT rbac_audit_log_target_role_id_fkey FOREIGN KEY (target_role_id) REFERENCES authz.rbac_roles(id);


--
-- Name: rbac_audit_log rbac_audit_log_target_user_id_fkey; Type: FK CONSTRAINT; Schema: authz; Owner: -
--

ALTER TABLE ONLY authz.rbac_audit_log
    ADD CONSTRAINT rbac_audit_log_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES auth.users(id);


--
-- Name: rbac_role_permissions rbac_role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: authz; Owner: -
--

ALTER TABLE ONLY authz.rbac_role_permissions
    ADD CONSTRAINT rbac_role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES authz.rbac_permissions(id) ON DELETE CASCADE;


--
-- Name: rbac_role_permissions rbac_role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: authz; Owner: -
--

ALTER TABLE ONLY authz.rbac_role_permissions
    ADD CONSTRAINT rbac_role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES authz.rbac_roles(id) ON DELETE CASCADE;


--
-- Name: rbac_user_org_roles rbac_user_org_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: authz; Owner: -
--

ALTER TABLE ONLY authz.rbac_user_org_roles
    ADD CONSTRAINT rbac_user_org_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES authz.rbac_roles(id) ON DELETE CASCADE;


--
-- Name: users users_organization_slug_fkey; Type: FK CONSTRAINT; Schema: authz; Owner: -
--

ALTER TABLE ONLY authz.users
    ADD CONSTRAINT users_organization_slug_fkey FOREIGN KEY (organization_slug) REFERENCES public.organizations(slug) ON DELETE SET NULL;


--
-- Name: fix_attempts fix_attempts_issue_id_fkey; Type: FK CONSTRAINT; Schema: code_ops; Owner: -
--

ALTER TABLE ONLY code_ops.fix_attempts
    ADD CONSTRAINT fix_attempts_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES code_ops.quality_issues(id);


--
-- Name: fix_attempts fix_attempts_scan_id_fkey; Type: FK CONSTRAINT; Schema: code_ops; Owner: -
--

ALTER TABLE ONLY code_ops.fix_attempts
    ADD CONSTRAINT fix_attempts_scan_id_fkey FOREIGN KEY (scan_id) REFERENCES code_ops.scan_runs(id);


--
-- Name: pivot_learnings pivot_learnings_issue_id_fkey; Type: FK CONSTRAINT; Schema: code_ops; Owner: -
--

ALTER TABLE ONLY code_ops.pivot_learnings
    ADD CONSTRAINT pivot_learnings_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES code_ops.quality_issues(id);


--
-- Name: discovery_signals discovery_signals_company_id_fkey; Type: FK CONSTRAINT; Schema: company; Owner: -
--

ALTER TABLE ONLY company.discovery_signals
    ADD CONSTRAINT discovery_signals_company_id_fkey FOREIGN KEY (company_id) REFERENCES company.companies(id) ON DELETE CASCADE;


--
-- Name: outreach outreach_company_id_fkey; Type: FK CONSTRAINT; Schema: company; Owner: -
--

ALTER TABLE ONLY company.outreach
    ADD CONSTRAINT outreach_company_id_fkey FOREIGN KEY (company_id) REFERENCES company.companies(id) ON DELETE CASCADE;


--
-- Name: agent_article_outputs agent_article_outputs_article_id_fkey; Type: FK CONSTRAINT; Schema: crawler; Owner: -
--

ALTER TABLE ONLY crawler.agent_article_outputs
    ADD CONSTRAINT agent_article_outputs_article_id_fkey FOREIGN KEY (article_id) REFERENCES crawler.articles(id) ON DELETE CASCADE;


--
-- Name: articles articles_organization_slug_fkey; Type: FK CONSTRAINT; Schema: crawler; Owner: -
--

ALTER TABLE ONLY crawler.articles
    ADD CONSTRAINT articles_organization_slug_fkey FOREIGN KEY (organization_slug) REFERENCES public.organizations(slug) ON DELETE CASCADE;


--
-- Name: articles articles_source_id_fkey; Type: FK CONSTRAINT; Schema: crawler; Owner: -
--

ALTER TABLE ONLY crawler.articles
    ADD CONSTRAINT articles_source_id_fkey FOREIGN KEY (source_id) REFERENCES crawler.sources(id) ON DELETE CASCADE;


--
-- Name: source_crawls source_crawls_source_id_fkey; Type: FK CONSTRAINT; Schema: crawler; Owner: -
--

ALTER TABLE ONLY crawler.source_crawls
    ADD CONSTRAINT source_crawls_source_id_fkey FOREIGN KEY (source_id) REFERENCES crawler.sources(id) ON DELETE CASCADE;


--
-- Name: sources sources_organization_slug_fkey; Type: FK CONSTRAINT; Schema: crawler; Owner: -
--

ALTER TABLE ONLY crawler.sources
    ADD CONSTRAINT sources_organization_slug_fkey FOREIGN KEY (organization_slug) REFERENCES public.organizations(slug) ON DELETE CASCADE;


--
-- Name: cad_outputs cad_outputs_drawing_id_fkey; Type: FK CONSTRAINT; Schema: engineering; Owner: -
--

ALTER TABLE ONLY engineering.cad_outputs
    ADD CONSTRAINT cad_outputs_drawing_id_fkey FOREIGN KEY (drawing_id) REFERENCES engineering.drawings(id) ON DELETE CASCADE;


--
-- Name: cad_outputs cad_outputs_generated_code_id_fkey; Type: FK CONSTRAINT; Schema: engineering; Owner: -
--

ALTER TABLE ONLY engineering.cad_outputs
    ADD CONSTRAINT cad_outputs_generated_code_id_fkey FOREIGN KEY (generated_code_id) REFERENCES engineering.generated_code(id);


--
-- Name: drawings drawings_conversation_id_fkey; Type: FK CONSTRAINT; Schema: engineering; Owner: -
--

ALTER TABLE ONLY engineering.drawings
    ADD CONSTRAINT drawings_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id);


--
-- Name: drawings drawings_created_by_fkey; Type: FK CONSTRAINT; Schema: engineering; Owner: -
--

ALTER TABLE ONLY engineering.drawings
    ADD CONSTRAINT drawings_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: drawings drawings_parent_drawing_id_fkey; Type: FK CONSTRAINT; Schema: engineering; Owner: -
--

ALTER TABLE ONLY engineering.drawings
    ADD CONSTRAINT drawings_parent_drawing_id_fkey FOREIGN KEY (parent_drawing_id) REFERENCES engineering.drawings(id);


--
-- Name: drawings drawings_project_id_fkey; Type: FK CONSTRAINT; Schema: engineering; Owner: -
--

ALTER TABLE ONLY engineering.drawings
    ADD CONSTRAINT drawings_project_id_fkey FOREIGN KEY (project_id) REFERENCES engineering.projects(id) ON DELETE CASCADE;


--
-- Name: drawings drawings_task_id_fkey; Type: FK CONSTRAINT; Schema: engineering; Owner: -
--

ALTER TABLE ONLY engineering.drawings
    ADD CONSTRAINT drawings_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id);


--
-- Name: execution_log execution_log_drawing_id_fkey; Type: FK CONSTRAINT; Schema: engineering; Owner: -
--

ALTER TABLE ONLY engineering.execution_log
    ADD CONSTRAINT execution_log_drawing_id_fkey FOREIGN KEY (drawing_id) REFERENCES engineering.drawings(id) ON DELETE CASCADE;


--
-- Name: generated_code generated_code_drawing_id_fkey; Type: FK CONSTRAINT; Schema: engineering; Owner: -
--

ALTER TABLE ONLY engineering.generated_code
    ADD CONSTRAINT generated_code_drawing_id_fkey FOREIGN KEY (drawing_id) REFERENCES engineering.drawings(id) ON DELETE CASCADE;


--
-- Name: part_library part_library_created_by_fkey; Type: FK CONSTRAINT; Schema: engineering; Owner: -
--

ALTER TABLE ONLY engineering.part_library
    ADD CONSTRAINT part_library_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: part_library part_library_org_slug_fkey; Type: FK CONSTRAINT; Schema: engineering; Owner: -
--

ALTER TABLE ONLY engineering.part_library
    ADD CONSTRAINT part_library_org_slug_fkey FOREIGN KEY (org_slug) REFERENCES public.organizations(slug) ON DELETE CASCADE;


--
-- Name: projects projects_org_slug_fkey; Type: FK CONSTRAINT; Schema: engineering; Owner: -
--

ALTER TABLE ONLY engineering.projects
    ADD CONSTRAINT projects_org_slug_fkey FOREIGN KEY (org_slug) REFERENCES public.organizations(slug) ON DELETE CASCADE;


--
-- Name: document_extractions document_extractions_analysis_task_id_fkey; Type: FK CONSTRAINT; Schema: law; Owner: -
--

ALTER TABLE ONLY law.document_extractions
    ADD CONSTRAINT document_extractions_analysis_task_id_fkey FOREIGN KEY (analysis_task_id) REFERENCES law.analysis_tasks(id) ON DELETE CASCADE;


--
-- Name: execution_steps execution_steps_analysis_task_id_fkey; Type: FK CONSTRAINT; Schema: law; Owner: -
--

ALTER TABLE ONLY law.execution_steps
    ADD CONSTRAINT execution_steps_analysis_task_id_fkey FOREIGN KEY (analysis_task_id) REFERENCES law.analysis_tasks(id) ON DELETE CASCADE;


--
-- Name: specialist_outputs specialist_outputs_analysis_task_id_fkey; Type: FK CONSTRAINT; Schema: law; Owner: -
--

ALTER TABLE ONLY law.specialist_outputs
    ADD CONSTRAINT specialist_outputs_analysis_task_id_fkey FOREIGN KEY (analysis_task_id) REFERENCES law.analysis_tasks(id) ON DELETE CASCADE;


--
-- Name: agent_llm_configs agent_llm_configs_agent_slug_fkey; Type: FK CONSTRAINT; Schema: marketing; Owner: -
--

ALTER TABLE ONLY marketing.agent_llm_configs
    ADD CONSTRAINT agent_llm_configs_agent_slug_fkey FOREIGN KEY (agent_slug) REFERENCES marketing.agents(slug) ON DELETE CASCADE;


--
-- Name: evaluations evaluations_evaluator_agent_slug_fkey; Type: FK CONSTRAINT; Schema: marketing; Owner: -
--

ALTER TABLE ONLY marketing.evaluations
    ADD CONSTRAINT evaluations_evaluator_agent_slug_fkey FOREIGN KEY (evaluator_agent_slug) REFERENCES marketing.agents(slug);


--
-- Name: evaluations evaluations_output_id_fkey; Type: FK CONSTRAINT; Schema: marketing; Owner: -
--

ALTER TABLE ONLY marketing.evaluations
    ADD CONSTRAINT evaluations_output_id_fkey FOREIGN KEY (output_id) REFERENCES marketing.outputs(id) ON DELETE CASCADE;


--
-- Name: evaluations evaluations_task_id_fkey; Type: FK CONSTRAINT; Schema: marketing; Owner: -
--

ALTER TABLE ONLY marketing.evaluations
    ADD CONSTRAINT evaluations_task_id_fkey FOREIGN KEY (task_id) REFERENCES marketing.swarm_tasks(task_id) ON DELETE CASCADE;


--
-- Name: execution_queue execution_queue_agent_slug_fkey; Type: FK CONSTRAINT; Schema: marketing; Owner: -
--

ALTER TABLE ONLY marketing.execution_queue
    ADD CONSTRAINT execution_queue_agent_slug_fkey FOREIGN KEY (agent_slug) REFERENCES marketing.agents(slug);


--
-- Name: execution_queue execution_queue_task_id_fkey; Type: FK CONSTRAINT; Schema: marketing; Owner: -
--

ALTER TABLE ONLY marketing.execution_queue
    ADD CONSTRAINT execution_queue_task_id_fkey FOREIGN KEY (task_id) REFERENCES marketing.swarm_tasks(task_id) ON DELETE CASCADE;


--
-- Name: output_versions output_versions_output_id_fkey; Type: FK CONSTRAINT; Schema: marketing; Owner: -
--

ALTER TABLE ONLY marketing.output_versions
    ADD CONSTRAINT output_versions_output_id_fkey FOREIGN KEY (output_id) REFERENCES marketing.outputs(id) ON DELETE CASCADE;


--
-- Name: output_versions output_versions_task_id_fkey; Type: FK CONSTRAINT; Schema: marketing; Owner: -
--

ALTER TABLE ONLY marketing.output_versions
    ADD CONSTRAINT output_versions_task_id_fkey FOREIGN KEY (task_id) REFERENCES marketing.swarm_tasks(task_id) ON DELETE CASCADE;


--
-- Name: outputs outputs_editor_agent_slug_fkey; Type: FK CONSTRAINT; Schema: marketing; Owner: -
--

ALTER TABLE ONLY marketing.outputs
    ADD CONSTRAINT outputs_editor_agent_slug_fkey FOREIGN KEY (editor_agent_slug) REFERENCES marketing.agents(slug);


--
-- Name: outputs outputs_task_id_fkey; Type: FK CONSTRAINT; Schema: marketing; Owner: -
--

ALTER TABLE ONLY marketing.outputs
    ADD CONSTRAINT outputs_task_id_fkey FOREIGN KEY (task_id) REFERENCES marketing.swarm_tasks(task_id) ON DELETE CASCADE;


--
-- Name: outputs outputs_writer_agent_slug_fkey; Type: FK CONSTRAINT; Schema: marketing; Owner: -
--

ALTER TABLE ONLY marketing.outputs
    ADD CONSTRAINT outputs_writer_agent_slug_fkey FOREIGN KEY (writer_agent_slug) REFERENCES marketing.agents(slug);


--
-- Name: swarm_tasks swarm_tasks_content_type_slug_fkey; Type: FK CONSTRAINT; Schema: marketing; Owner: -
--

ALTER TABLE ONLY marketing.swarm_tasks
    ADD CONSTRAINT swarm_tasks_content_type_slug_fkey FOREIGN KEY (content_type_slug) REFERENCES marketing.content_types(slug);


--
-- Name: channel_messages channel_messages_channel_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.channel_messages
    ADD CONSTRAINT channel_messages_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES orch_flow.channels(id) ON DELETE CASCADE;


--
-- Name: channel_messages channel_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.channel_messages
    ADD CONSTRAINT channel_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: channels channels_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.channels
    ADD CONSTRAINT channels_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: efforts efforts_organization_slug_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.efforts
    ADD CONSTRAINT efforts_organization_slug_fkey FOREIGN KEY (organization_slug) REFERENCES public.organizations(slug) ON DELETE CASCADE;


--
-- Name: efforts efforts_team_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.efforts
    ADD CONSTRAINT efforts_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: learning_progress learning_progress_organization_slug_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.learning_progress
    ADD CONSTRAINT learning_progress_organization_slug_fkey FOREIGN KEY (organization_slug) REFERENCES public.organizations(slug) ON DELETE CASCADE;


--
-- Name: learning_progress learning_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.learning_progress
    ADD CONSTRAINT learning_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES authz.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_task_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.notifications
    ADD CONSTRAINT notifications_task_id_fkey FOREIGN KEY (task_id) REFERENCES orch_flow.shared_tasks(id) ON DELETE CASCADE;


--
-- Name: projects projects_effort_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.projects
    ADD CONSTRAINT projects_effort_id_fkey FOREIGN KEY (effort_id) REFERENCES orch_flow.efforts(id) ON DELETE CASCADE;


--
-- Name: shared_tasks shared_tasks_channel_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.shared_tasks
    ADD CONSTRAINT shared_tasks_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES orch_flow.channels(id) ON DELETE SET NULL;


--
-- Name: shared_tasks shared_tasks_parent_task_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.shared_tasks
    ADD CONSTRAINT shared_tasks_parent_task_id_fkey FOREIGN KEY (parent_task_id) REFERENCES orch_flow.shared_tasks(id) ON DELETE CASCADE;


--
-- Name: shared_tasks shared_tasks_source_channel_user_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.shared_tasks
    ADD CONSTRAINT shared_tasks_source_channel_user_id_fkey FOREIGN KEY (source_channel_user_id) REFERENCES public.channel_users(id);


--
-- Name: shared_tasks shared_tasks_sprint_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.shared_tasks
    ADD CONSTRAINT shared_tasks_sprint_id_fkey FOREIGN KEY (sprint_id) REFERENCES orch_flow.sprints(id) ON DELETE SET NULL;


--
-- Name: shared_tasks shared_tasks_user_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.shared_tasks
    ADD CONSTRAINT shared_tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: task_collaborators task_collaborators_task_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.task_collaborators
    ADD CONSTRAINT task_collaborators_task_id_fkey FOREIGN KEY (task_id) REFERENCES orch_flow.shared_tasks(id) ON DELETE CASCADE;


--
-- Name: task_collaborators task_collaborators_user_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.task_collaborators
    ADD CONSTRAINT task_collaborators_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: task_update_requests task_update_requests_requested_by_user_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.task_update_requests
    ADD CONSTRAINT task_update_requests_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: task_update_requests task_update_requests_task_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.task_update_requests
    ADD CONSTRAINT task_update_requests_task_id_fkey FOREIGN KEY (task_id) REFERENCES orch_flow.shared_tasks(id) ON DELETE CASCADE;


--
-- Name: task_watchers task_watchers_task_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.task_watchers
    ADD CONSTRAINT task_watchers_task_id_fkey FOREIGN KEY (task_id) REFERENCES orch_flow.shared_tasks(id) ON DELETE CASCADE;


--
-- Name: task_watchers task_watchers_user_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.task_watchers
    ADD CONSTRAINT task_watchers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_assignee_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.tasks
    ADD CONSTRAINT tasks_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES auth.users(id);


--
-- Name: tasks tasks_project_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.tasks
    ADD CONSTRAINT tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES orch_flow.projects(id) ON DELETE CASCADE;


--
-- Name: team_files team_files_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.team_files
    ADD CONSTRAINT team_files_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: team_files team_files_parent_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.team_files
    ADD CONSTRAINT team_files_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES orch_flow.team_files(id) ON DELETE CASCADE;


--
-- Name: team_files team_files_team_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: -
--

ALTER TABLE ONLY orch_flow.team_files
    ADD CONSTRAINT team_files_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: agent_self_modification_log agent_self_modification_log_analyst_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.agent_self_modification_log
    ADD CONSTRAINT agent_self_modification_log_analyst_id_fkey FOREIGN KEY (analyst_id) REFERENCES prediction.analysts(id) ON DELETE CASCADE;


--
-- Name: analyst_adaptation_diffs analyst_adaptation_diffs_agent_version_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analyst_adaptation_diffs
    ADD CONSTRAINT analyst_adaptation_diffs_agent_version_id_fkey FOREIGN KEY (agent_version_id) REFERENCES prediction.analyst_context_versions(id) ON DELETE CASCADE;


--
-- Name: analyst_adaptation_diffs analyst_adaptation_diffs_analyst_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analyst_adaptation_diffs
    ADD CONSTRAINT analyst_adaptation_diffs_analyst_id_fkey FOREIGN KEY (analyst_id) REFERENCES prediction.analysts(id) ON DELETE CASCADE;


--
-- Name: analyst_adaptation_diffs analyst_adaptation_diffs_user_version_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analyst_adaptation_diffs
    ADD CONSTRAINT analyst_adaptation_diffs_user_version_id_fkey FOREIGN KEY (user_version_id) REFERENCES prediction.analyst_context_versions(id) ON DELETE CASCADE;


--
-- Name: analyst_assessments analyst_assessments_analyst_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analyst_assessments
    ADD CONSTRAINT analyst_assessments_analyst_id_fkey FOREIGN KEY (analyst_id) REFERENCES prediction.analysts(id) ON DELETE CASCADE;


--
-- Name: analyst_assessments analyst_assessments_context_version_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analyst_assessments
    ADD CONSTRAINT analyst_assessments_context_version_id_fkey FOREIGN KEY (context_version_id) REFERENCES prediction.analyst_context_versions(id);


--
-- Name: analyst_assessments analyst_assessments_prediction_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analyst_assessments
    ADD CONSTRAINT analyst_assessments_prediction_id_fkey FOREIGN KEY (prediction_id) REFERENCES prediction.predictions(id) ON DELETE CASCADE;


--
-- Name: analyst_assessments analyst_assessments_predictor_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analyst_assessments
    ADD CONSTRAINT analyst_assessments_predictor_id_fkey FOREIGN KEY (predictor_id) REFERENCES prediction.predictors(id) ON DELETE CASCADE;


--
-- Name: analyst_context_versions analyst_context_versions_analyst_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analyst_context_versions
    ADD CONSTRAINT analyst_context_versions_analyst_id_fkey FOREIGN KEY (analyst_id) REFERENCES prediction.analysts(id) ON DELETE CASCADE;


--
-- Name: analyst_overrides analyst_overrides_analyst_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analyst_overrides
    ADD CONSTRAINT analyst_overrides_analyst_id_fkey FOREIGN KEY (analyst_id) REFERENCES prediction.analysts(id) ON DELETE CASCADE;


--
-- Name: analyst_overrides analyst_overrides_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analyst_overrides
    ADD CONSTRAINT analyst_overrides_target_id_fkey FOREIGN KEY (target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: analyst_overrides analyst_overrides_universe_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analyst_overrides
    ADD CONSTRAINT analyst_overrides_universe_id_fkey FOREIGN KEY (universe_id) REFERENCES prediction.universes(id) ON DELETE CASCADE;


--
-- Name: analyst_performance_metrics analyst_performance_metrics_analyst_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analyst_performance_metrics
    ADD CONSTRAINT analyst_performance_metrics_analyst_id_fkey FOREIGN KEY (analyst_id) REFERENCES prediction.analysts(id) ON DELETE CASCADE;


--
-- Name: analyst_portfolios analyst_portfolios_analyst_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analyst_portfolios
    ADD CONSTRAINT analyst_portfolios_analyst_id_fkey FOREIGN KEY (analyst_id) REFERENCES prediction.analysts(id) ON DELETE CASCADE;


--
-- Name: analyst_positions analyst_positions_analyst_assessment_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analyst_positions
    ADD CONSTRAINT analyst_positions_analyst_assessment_id_fkey FOREIGN KEY (analyst_assessment_id) REFERENCES prediction.analyst_assessments(id) ON DELETE SET NULL;


--
-- Name: analyst_positions analyst_positions_portfolio_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analyst_positions
    ADD CONSTRAINT analyst_positions_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES prediction.analyst_portfolios(id) ON DELETE CASCADE;


--
-- Name: analyst_positions analyst_positions_prediction_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analyst_positions
    ADD CONSTRAINT analyst_positions_prediction_id_fkey FOREIGN KEY (prediction_id) REFERENCES prediction.predictions(id) ON DELETE SET NULL;


--
-- Name: analyst_positions analyst_positions_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analyst_positions
    ADD CONSTRAINT analyst_positions_target_id_fkey FOREIGN KEY (target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: analysts analysts_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analysts
    ADD CONSTRAINT analysts_target_id_fkey FOREIGN KEY (target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: analysts analysts_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analysts
    ADD CONSTRAINT analysts_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: analysts analysts_universe_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.analysts
    ADD CONSTRAINT analysts_universe_id_fkey FOREIGN KEY (universe_id) REFERENCES prediction.universes(id) ON DELETE CASCADE;


--
-- Name: daily_postmortem_recommendations daily_postmortem_recommendations_run_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.daily_postmortem_recommendations
    ADD CONSTRAINT daily_postmortem_recommendations_run_id_fkey FOREIGN KEY (run_id) REFERENCES prediction.daily_postmortem_runs(id) ON DELETE CASCADE;


--
-- Name: evaluations evaluations_prediction_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.evaluations
    ADD CONSTRAINT evaluations_prediction_id_fkey FOREIGN KEY (prediction_id) REFERENCES prediction.predictions(id) ON DELETE CASCADE;


--
-- Name: evaluations evaluations_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.evaluations
    ADD CONSTRAINT evaluations_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: predictions fk_predictions_scenario_run; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.predictions
    ADD CONSTRAINT fk_predictions_scenario_run FOREIGN KEY (scenario_run_id) REFERENCES prediction.scenario_runs(id) ON DELETE SET NULL;


--
-- Name: predictors fk_predictors_article_id; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.predictors
    ADD CONSTRAINT fk_predictors_article_id FOREIGN KEY (article_id) REFERENCES crawler.articles(id) ON DELETE SET NULL;


--
-- Name: predictors fk_predictors_consumed_prediction; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.predictors
    ADD CONSTRAINT fk_predictors_consumed_prediction FOREIGN KEY (consumed_by_prediction_id) REFERENCES prediction.predictions(id) ON DELETE SET NULL;


--
-- Name: predictors fk_predictors_scenario_run; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.predictors
    ADD CONSTRAINT fk_predictors_scenario_run FOREIGN KEY (scenario_run_id) REFERENCES prediction.scenario_runs(id) ON DELETE SET NULL;


--
-- Name: signals fk_signals_scenario_run; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.signals
    ADD CONSTRAINT fk_signals_scenario_run FOREIGN KEY (scenario_run_id) REFERENCES prediction.scenario_runs(id) ON DELETE SET NULL;


--
-- Name: fork_learning_exchanges fork_learning_exchanges_analyst_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.fork_learning_exchanges
    ADD CONSTRAINT fork_learning_exchanges_analyst_id_fkey FOREIGN KEY (analyst_id) REFERENCES prediction.analysts(id) ON DELETE CASCADE;


--
-- Name: learning_lineage learning_lineage_organization_slug_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.learning_lineage
    ADD CONSTRAINT learning_lineage_organization_slug_fkey FOREIGN KEY (organization_slug) REFERENCES public.organizations(slug) ON DELETE CASCADE;


--
-- Name: learning_lineage learning_lineage_production_learning_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.learning_lineage
    ADD CONSTRAINT learning_lineage_production_learning_id_fkey FOREIGN KEY (production_learning_id) REFERENCES prediction.learnings(id) ON DELETE RESTRICT;


--
-- Name: learning_lineage learning_lineage_promoted_by_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.learning_lineage
    ADD CONSTRAINT learning_lineage_promoted_by_fkey FOREIGN KEY (promoted_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: learning_lineage learning_lineage_test_learning_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.learning_lineage
    ADD CONSTRAINT learning_lineage_test_learning_id_fkey FOREIGN KEY (test_learning_id) REFERENCES prediction.learnings(id) ON DELETE RESTRICT;


--
-- Name: learning_queue learning_queue_final_analyst_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.learning_queue
    ADD CONSTRAINT learning_queue_final_analyst_id_fkey FOREIGN KEY (final_analyst_id) REFERENCES prediction.analysts(id) ON DELETE SET NULL;


--
-- Name: learning_queue learning_queue_final_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.learning_queue
    ADD CONSTRAINT learning_queue_final_target_id_fkey FOREIGN KEY (final_target_id) REFERENCES prediction.targets(id) ON DELETE SET NULL;


--
-- Name: learning_queue learning_queue_final_universe_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.learning_queue
    ADD CONSTRAINT learning_queue_final_universe_id_fkey FOREIGN KEY (final_universe_id) REFERENCES prediction.universes(id) ON DELETE SET NULL;


--
-- Name: learning_queue learning_queue_learning_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.learning_queue
    ADD CONSTRAINT learning_queue_learning_id_fkey FOREIGN KEY (learning_id) REFERENCES prediction.learnings(id) ON DELETE SET NULL;


--
-- Name: learning_queue learning_queue_source_evaluation_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.learning_queue
    ADD CONSTRAINT learning_queue_source_evaluation_id_fkey FOREIGN KEY (source_evaluation_id) REFERENCES prediction.evaluations(id) ON DELETE SET NULL;


--
-- Name: learning_queue learning_queue_source_missed_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.learning_queue
    ADD CONSTRAINT learning_queue_source_missed_opportunity_id_fkey FOREIGN KEY (source_missed_opportunity_id) REFERENCES prediction.missed_opportunities(id) ON DELETE SET NULL;


--
-- Name: learning_queue learning_queue_suggested_analyst_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.learning_queue
    ADD CONSTRAINT learning_queue_suggested_analyst_id_fkey FOREIGN KEY (suggested_analyst_id) REFERENCES prediction.analysts(id) ON DELETE SET NULL;


--
-- Name: learning_queue learning_queue_suggested_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.learning_queue
    ADD CONSTRAINT learning_queue_suggested_target_id_fkey FOREIGN KEY (suggested_target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: learning_queue learning_queue_suggested_universe_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.learning_queue
    ADD CONSTRAINT learning_queue_suggested_universe_id_fkey FOREIGN KEY (suggested_universe_id) REFERENCES prediction.universes(id) ON DELETE CASCADE;


--
-- Name: learning_queue learning_queue_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.learning_queue
    ADD CONSTRAINT learning_queue_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: learnings learnings_analyst_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.learnings
    ADD CONSTRAINT learnings_analyst_id_fkey FOREIGN KEY (analyst_id) REFERENCES prediction.analysts(id) ON DELETE SET NULL;


--
-- Name: learnings learnings_source_evaluation_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.learnings
    ADD CONSTRAINT learnings_source_evaluation_id_fkey FOREIGN KEY (source_evaluation_id) REFERENCES prediction.evaluations(id) ON DELETE SET NULL;


--
-- Name: learnings learnings_source_missed_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.learnings
    ADD CONSTRAINT learnings_source_missed_opportunity_id_fkey FOREIGN KEY (source_missed_opportunity_id) REFERENCES prediction.missed_opportunities(id) ON DELETE SET NULL;


--
-- Name: learnings learnings_superseded_by_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.learnings
    ADD CONSTRAINT learnings_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES prediction.learnings(id) ON DELETE SET NULL;


--
-- Name: learnings learnings_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.learnings
    ADD CONSTRAINT learnings_target_id_fkey FOREIGN KEY (target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: learnings learnings_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.learnings
    ADD CONSTRAINT learnings_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: learnings learnings_universe_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.learnings
    ADD CONSTRAINT learnings_universe_id_fkey FOREIGN KEY (universe_id) REFERENCES prediction.universes(id) ON DELETE CASCADE;


--
-- Name: missed_opportunities missed_opportunities_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.missed_opportunities
    ADD CONSTRAINT missed_opportunities_target_id_fkey FOREIGN KEY (target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: missed_opportunities missed_opportunities_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.missed_opportunities
    ADD CONSTRAINT missed_opportunities_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: predictions predictions_runner_context_version_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.predictions
    ADD CONSTRAINT predictions_runner_context_version_id_fkey FOREIGN KEY (runner_context_version_id) REFERENCES prediction.runner_context_versions(id);


--
-- Name: predictions predictions_target_context_version_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.predictions
    ADD CONSTRAINT predictions_target_context_version_id_fkey FOREIGN KEY (target_context_version_id) REFERENCES prediction.target_context_versions(id);


--
-- Name: predictions predictions_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.predictions
    ADD CONSTRAINT predictions_target_id_fkey FOREIGN KEY (target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: predictions predictions_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.predictions
    ADD CONSTRAINT predictions_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: predictions predictions_universe_context_version_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.predictions
    ADD CONSTRAINT predictions_universe_context_version_id_fkey FOREIGN KEY (universe_context_version_id) REFERENCES prediction.universe_context_versions(id);


--
-- Name: predictors predictors_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.predictors
    ADD CONSTRAINT predictors_target_id_fkey FOREIGN KEY (target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: predictors predictors_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.predictors
    ADD CONSTRAINT predictors_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: replay_test_results replay_test_results_evaluation_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.replay_test_results
    ADD CONSTRAINT replay_test_results_evaluation_id_fkey FOREIGN KEY (evaluation_id) REFERENCES prediction.evaluations(id);


--
-- Name: replay_test_results replay_test_results_replay_test_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.replay_test_results
    ADD CONSTRAINT replay_test_results_replay_test_id_fkey FOREIGN KEY (replay_test_id) REFERENCES prediction.replay_tests(id) ON DELETE CASCADE;


--
-- Name: replay_test_results replay_test_results_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.replay_test_results
    ADD CONSTRAINT replay_test_results_target_id_fkey FOREIGN KEY (target_id) REFERENCES prediction.targets(id);


--
-- Name: replay_test_snapshots replay_test_snapshots_replay_test_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.replay_test_snapshots
    ADD CONSTRAINT replay_test_snapshots_replay_test_id_fkey FOREIGN KEY (replay_test_id) REFERENCES prediction.replay_tests(id) ON DELETE CASCADE;


--
-- Name: replay_tests replay_tests_universe_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.replay_tests
    ADD CONSTRAINT replay_tests_universe_id_fkey FOREIGN KEY (universe_id) REFERENCES prediction.universes(id);


--
-- Name: review_queue review_queue_predictor_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.review_queue
    ADD CONSTRAINT review_queue_predictor_id_fkey FOREIGN KEY (predictor_id) REFERENCES prediction.predictors(id) ON DELETE SET NULL;


--
-- Name: review_queue review_queue_signal_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.review_queue
    ADD CONSTRAINT review_queue_signal_id_fkey FOREIGN KEY (signal_id) REFERENCES prediction.signals(id) ON DELETE CASCADE;


--
-- Name: review_queue review_queue_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.review_queue
    ADD CONSTRAINT review_queue_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: scenario_runs scenario_runs_organization_slug_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.scenario_runs
    ADD CONSTRAINT scenario_runs_organization_slug_fkey FOREIGN KEY (organization_slug) REFERENCES public.organizations(slug) ON DELETE CASCADE;


--
-- Name: scenario_runs scenario_runs_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.scenario_runs
    ADD CONSTRAINT scenario_runs_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE CASCADE;


--
-- Name: scenario_runs scenario_runs_triggered_by_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.scenario_runs
    ADD CONSTRAINT scenario_runs_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: signals signals_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.signals
    ADD CONSTRAINT signals_target_id_fkey FOREIGN KEY (target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: signals signals_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.signals
    ADD CONSTRAINT signals_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: snapshots snapshots_prediction_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.snapshots
    ADD CONSTRAINT snapshots_prediction_id_fkey FOREIGN KEY (prediction_id) REFERENCES prediction.predictions(id) ON DELETE CASCADE;


--
-- Name: snapshots snapshots_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.snapshots
    ADD CONSTRAINT snapshots_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: source_subscriptions source_subscriptions_source_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.source_subscriptions
    ADD CONSTRAINT source_subscriptions_source_id_fkey FOREIGN KEY (source_id) REFERENCES crawler.sources(id) ON DELETE CASCADE;


--
-- Name: source_subscriptions source_subscriptions_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.source_subscriptions
    ADD CONSTRAINT source_subscriptions_target_id_fkey FOREIGN KEY (target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: source_subscriptions source_subscriptions_universe_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.source_subscriptions
    ADD CONSTRAINT source_subscriptions_universe_id_fkey FOREIGN KEY (universe_id) REFERENCES prediction.universes(id) ON DELETE CASCADE;


--
-- Name: strategies strategies_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.strategies
    ADD CONSTRAINT strategies_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: target_context_versions target_context_versions_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.target_context_versions
    ADD CONSTRAINT target_context_versions_target_id_fkey FOREIGN KEY (target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: target_snapshots target_snapshots_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.target_snapshots
    ADD CONSTRAINT target_snapshots_target_id_fkey FOREIGN KEY (target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: target_snapshots target_snapshots_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.target_snapshots
    ADD CONSTRAINT target_snapshots_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: targets targets_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.targets
    ADD CONSTRAINT targets_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: targets targets_universe_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.targets
    ADD CONSTRAINT targets_universe_id_fkey FOREIGN KEY (universe_id) REFERENCES prediction.universes(id) ON DELETE CASCADE;


--
-- Name: test_articles test_articles_created_by_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.test_articles
    ADD CONSTRAINT test_articles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: test_articles test_articles_organization_slug_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.test_articles
    ADD CONSTRAINT test_articles_organization_slug_fkey FOREIGN KEY (organization_slug) REFERENCES public.organizations(slug) ON DELETE CASCADE;


--
-- Name: test_articles test_articles_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.test_articles
    ADD CONSTRAINT test_articles_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: test_audit_log test_audit_log_organization_slug_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.test_audit_log
    ADD CONSTRAINT test_audit_log_organization_slug_fkey FOREIGN KEY (organization_slug) REFERENCES public.organizations(slug) ON DELETE CASCADE;


--
-- Name: test_audit_log test_audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.test_audit_log
    ADD CONSTRAINT test_audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: test_price_data test_price_data_organization_slug_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.test_price_data
    ADD CONSTRAINT test_price_data_organization_slug_fkey FOREIGN KEY (organization_slug) REFERENCES public.organizations(slug) ON DELETE CASCADE;


--
-- Name: test_price_data test_price_data_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.test_price_data
    ADD CONSTRAINT test_price_data_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: test_scenarios test_scenarios_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.test_scenarios
    ADD CONSTRAINT test_scenarios_target_id_fkey FOREIGN KEY (target_id) REFERENCES prediction.targets(id) ON DELETE SET NULL;


--
-- Name: test_target_mirrors test_target_mirrors_real_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.test_target_mirrors
    ADD CONSTRAINT test_target_mirrors_real_target_id_fkey FOREIGN KEY (real_target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: test_target_mirrors test_target_mirrors_test_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.test_target_mirrors
    ADD CONSTRAINT test_target_mirrors_test_target_id_fkey FOREIGN KEY (test_target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: tool_requests tool_requests_resolved_by_user_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.tool_requests
    ADD CONSTRAINT tool_requests_resolved_by_user_id_fkey FOREIGN KEY (resolved_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: tool_requests tool_requests_source_missed_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.tool_requests
    ADD CONSTRAINT tool_requests_source_missed_opportunity_id_fkey FOREIGN KEY (missed_opportunity_id) REFERENCES prediction.missed_opportunities(id) ON DELETE SET NULL;


--
-- Name: tool_requests tool_requests_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.tool_requests
    ADD CONSTRAINT tool_requests_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: tool_requests tool_requests_universe_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.tool_requests
    ADD CONSTRAINT tool_requests_universe_id_fkey FOREIGN KEY (universe_id) REFERENCES prediction.universes(id) ON DELETE CASCADE;


--
-- Name: universe_context_versions universe_context_versions_universe_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.universe_context_versions
    ADD CONSTRAINT universe_context_versions_universe_id_fkey FOREIGN KEY (universe_id) REFERENCES prediction.universes(id) ON DELETE CASCADE;


--
-- Name: universes universes_agent_slug_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.universes
    ADD CONSTRAINT universes_agent_slug_fkey FOREIGN KEY (agent_slug) REFERENCES public.agents(slug) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: universes universes_organization_slug_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.universes
    ADD CONSTRAINT universes_organization_slug_fkey FOREIGN KEY (organization_slug) REFERENCES public.organizations(slug) ON DELETE CASCADE;


--
-- Name: universes universes_strategy_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.universes
    ADD CONSTRAINT universes_strategy_id_fkey FOREIGN KEY (strategy_id) REFERENCES prediction.strategies(id) ON DELETE SET NULL;


--
-- Name: universes universes_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.universes
    ADD CONSTRAINT universes_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: user_positions user_positions_portfolio_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.user_positions
    ADD CONSTRAINT user_positions_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES prediction.user_portfolios(id) ON DELETE CASCADE;


--
-- Name: user_positions user_positions_prediction_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.user_positions
    ADD CONSTRAINT user_positions_prediction_id_fkey FOREIGN KEY (prediction_id) REFERENCES prediction.predictions(id) ON DELETE CASCADE;


--
-- Name: user_positions user_positions_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.user_positions
    ADD CONSTRAINT user_positions_target_id_fkey FOREIGN KEY (target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: user_trade_queue user_trade_queue_executed_position_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.user_trade_queue
    ADD CONSTRAINT user_trade_queue_executed_position_id_fkey FOREIGN KEY (executed_position_id) REFERENCES prediction.user_positions(id);


--
-- Name: user_trade_queue user_trade_queue_portfolio_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.user_trade_queue
    ADD CONSTRAINT user_trade_queue_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES prediction.user_portfolios(id) ON DELETE CASCADE;


--
-- Name: user_trade_queue user_trade_queue_prediction_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: -
--

ALTER TABLE ONLY prediction.user_trade_queue
    ADD CONSTRAINT user_trade_queue_prediction_id_fkey FOREIGN KEY (prediction_id) REFERENCES prediction.predictions(id) ON DELETE CASCADE;


--
-- Name: assets assets_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: channel_message_log channel_message_log_channel_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_message_log
    ADD CONSTRAINT channel_message_log_channel_user_id_fkey FOREIGN KEY (channel_user_id) REFERENCES public.channel_users(id);


--
-- Name: channel_users channel_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_users
    ADD CONSTRAINT channel_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: conversation_messages conversation_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_messages
    ADD CONSTRAINT conversation_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_organization_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_organization_slug_fkey FOREIGN KEY (organization_slug) REFERENCES public.organizations(slug) ON DELETE SET NULL;


--
-- Name: human_approvals human_approvals_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.human_approvals
    ADD CONSTRAINT human_approvals_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: human_approvals human_approvals_organization_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.human_approvals
    ADD CONSTRAINT human_approvals_organization_slug_fkey FOREIGN KEY (organization_slug) REFERENCES public.organizations(slug) ON DELETE CASCADE;


--
-- Name: llm_models llm_models_provider_name_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_models
    ADD CONSTRAINT llm_models_provider_name_fkey FOREIGN KEY (provider_name) REFERENCES public.llm_providers(name) ON DELETE CASCADE;


--
-- Name: llm_usage llm_usage_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_usage
    ADD CONSTRAINT llm_usage_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: llm_usage llm_usage_provider_name_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_usage
    ADD CONSTRAINT llm_usage_provider_name_fkey FOREIGN KEY (provider_name) REFERENCES public.llm_providers(name) ON DELETE SET NULL;


--
-- Name: llm_usage llm_usage_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_usage
    ADD CONSTRAINT llm_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: organization_credentials organization_credentials_organization_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_credentials
    ADD CONSTRAINT organization_credentials_organization_slug_fkey FOREIGN KEY (organization_slug) REFERENCES public.organizations(slug) ON DELETE CASCADE;


--
-- Name: pseudonym_dictionaries pseudonym_dictionaries_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pseudonym_dictionaries
    ADD CONSTRAINT pseudonym_dictionaries_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: pseudonym_dictionaries pseudonym_dictionaries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pseudonym_dictionaries
    ADD CONSTRAINT pseudonym_dictionaries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: task_messages task_messages_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_messages
    ADD CONSTRAINT task_messages_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: team_members team_members_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: teams teams_org_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_org_slug_fkey FOREIGN KEY (org_slug) REFERENCES public.organizations(slug) ON DELETE CASCADE;


--
-- Name: user_cidafm_commands user_cidafm_commands_command_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_cidafm_commands
    ADD CONSTRAINT user_cidafm_commands_command_id_fkey FOREIGN KEY (command_id) REFERENCES public.cidafm_commands(id) ON DELETE CASCADE;


--
-- Name: user_cidafm_commands user_cidafm_commands_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_cidafm_commands
    ADD CONSTRAINT user_cidafm_commands_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: rag_document_chunks rag_document_chunks_collection_id_fkey; Type: FK CONSTRAINT; Schema: rag_data; Owner: -
--

ALTER TABLE ONLY rag_data.rag_document_chunks
    ADD CONSTRAINT rag_document_chunks_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES rag_data.rag_collections(id) ON DELETE CASCADE;


--
-- Name: rag_document_chunks rag_document_chunks_document_id_fkey; Type: FK CONSTRAINT; Schema: rag_data; Owner: -
--

ALTER TABLE ONLY rag_data.rag_document_chunks
    ADD CONSTRAINT rag_document_chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES rag_data.rag_documents(id) ON DELETE CASCADE;


--
-- Name: rag_documents rag_documents_collection_id_fkey; Type: FK CONSTRAINT; Schema: rag_data; Owner: -
--

ALTER TABLE ONLY rag_data.rag_documents
    ADD CONSTRAINT rag_documents_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES rag_data.rag_collections(id) ON DELETE CASCADE;


--
-- Name: alerts alerts_composite_score_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.alerts
    ADD CONSTRAINT alerts_composite_score_id_fkey FOREIGN KEY (composite_score_id) REFERENCES risk.composite_scores(id) ON DELETE SET NULL;


--
-- Name: alerts alerts_subject_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.alerts
    ADD CONSTRAINT alerts_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES risk.subjects(id) ON DELETE CASCADE;


--
-- Name: article_classifications article_classifications_article_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.article_classifications
    ADD CONSTRAINT article_classifications_article_id_fkey FOREIGN KEY (article_id) REFERENCES crawler.articles(id) ON DELETE CASCADE;


--
-- Name: article_classifications article_classifications_scope_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.article_classifications
    ADD CONSTRAINT article_classifications_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE;


--
-- Name: assessments assessments_dimension_context_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.assessments
    ADD CONSTRAINT assessments_dimension_context_id_fkey FOREIGN KEY (dimension_context_id) REFERENCES risk.dimension_contexts(id);


--
-- Name: assessments assessments_dimension_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.assessments
    ADD CONSTRAINT assessments_dimension_id_fkey FOREIGN KEY (dimension_id) REFERENCES risk.dimensions(id) ON DELETE CASCADE;


--
-- Name: assessments assessments_subject_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.assessments
    ADD CONSTRAINT assessments_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES risk.subjects(id) ON DELETE CASCADE;


--
-- Name: comparisons comparisons_scope_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.comparisons
    ADD CONSTRAINT comparisons_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE;


--
-- Name: composite_scores composite_scores_debate_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.composite_scores
    ADD CONSTRAINT composite_scores_debate_id_fkey FOREIGN KEY (debate_id) REFERENCES risk.debates(id);


--
-- Name: composite_scores composite_scores_subject_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.composite_scores
    ADD CONSTRAINT composite_scores_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES risk.subjects(id) ON DELETE CASCADE;


--
-- Name: data_source_fetch_history data_source_fetch_history_data_source_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.data_source_fetch_history
    ADD CONSTRAINT data_source_fetch_history_data_source_id_fkey FOREIGN KEY (data_source_id) REFERENCES risk.data_sources(id) ON DELETE CASCADE;


--
-- Name: data_sources data_sources_scope_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.data_sources
    ADD CONSTRAINT data_sources_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE;


--
-- Name: debate_contexts debate_contexts_scope_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.debate_contexts
    ADD CONSTRAINT debate_contexts_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE;


--
-- Name: debates debates_subject_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.debates
    ADD CONSTRAINT debates_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES risk.subjects(id) ON DELETE CASCADE;


--
-- Name: dimension_contexts dimension_contexts_dimension_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.dimension_contexts
    ADD CONSTRAINT dimension_contexts_dimension_id_fkey FOREIGN KEY (dimension_id) REFERENCES risk.dimensions(id) ON DELETE CASCADE;


--
-- Name: dimensions dimensions_scope_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.dimensions
    ADD CONSTRAINT dimensions_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE;


--
-- Name: evaluations evaluations_composite_score_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.evaluations
    ADD CONSTRAINT evaluations_composite_score_id_fkey FOREIGN KEY (composite_score_id) REFERENCES risk.composite_scores(id) ON DELETE CASCADE;


--
-- Name: evaluations evaluations_subject_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.evaluations
    ADD CONSTRAINT evaluations_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES risk.subjects(id) ON DELETE CASCADE;


--
-- Name: executive_summaries executive_summaries_scope_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.executive_summaries
    ADD CONSTRAINT executive_summaries_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE;


--
-- Name: debates fk_debates_composite_score; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.debates
    ADD CONSTRAINT fk_debates_composite_score FOREIGN KEY (composite_score_id) REFERENCES risk.composite_scores(id) ON DELETE SET NULL;


--
-- Name: learning_queue learning_queue_learning_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.learning_queue
    ADD CONSTRAINT learning_queue_learning_id_fkey FOREIGN KEY (learning_id) REFERENCES risk.learnings(id);


--
-- Name: learning_queue learning_queue_scope_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.learning_queue
    ADD CONSTRAINT learning_queue_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE;


--
-- Name: learning_queue learning_queue_subject_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.learning_queue
    ADD CONSTRAINT learning_queue_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES risk.subjects(id) ON DELETE CASCADE;


--
-- Name: learnings learnings_dimension_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.learnings
    ADD CONSTRAINT learnings_dimension_id_fkey FOREIGN KEY (dimension_id) REFERENCES risk.dimensions(id) ON DELETE CASCADE;


--
-- Name: learnings learnings_parent_learning_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.learnings
    ADD CONSTRAINT learnings_parent_learning_id_fkey FOREIGN KEY (parent_learning_id) REFERENCES risk.learnings(id);


--
-- Name: learnings learnings_scope_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.learnings
    ADD CONSTRAINT learnings_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE;


--
-- Name: learnings learnings_subject_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.learnings
    ADD CONSTRAINT learnings_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES risk.subjects(id) ON DELETE CASCADE;


--
-- Name: reports reports_scope_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.reports
    ADD CONSTRAINT reports_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE;


--
-- Name: scenarios scenarios_scope_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.scenarios
    ADD CONSTRAINT scenarios_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE;


--
-- Name: simulations simulations_scope_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.simulations
    ADD CONSTRAINT simulations_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE;


--
-- Name: simulations simulations_subject_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.simulations
    ADD CONSTRAINT simulations_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES risk.subjects(id) ON DELETE SET NULL;


--
-- Name: source_subscriptions source_subscriptions_scope_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.source_subscriptions
    ADD CONSTRAINT source_subscriptions_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE;


--
-- Name: source_subscriptions source_subscriptions_source_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.source_subscriptions
    ADD CONSTRAINT source_subscriptions_source_id_fkey FOREIGN KEY (source_id) REFERENCES crawler.sources(id) ON DELETE CASCADE;


--
-- Name: subjects subjects_scope_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: -
--

ALTER TABLE ONLY risk.subjects
    ADD CONSTRAINT subjects_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE;


--
-- Name: a2a_messages; Type: ROW SECURITY; Schema: ambient; Owner: -
--

ALTER TABLE ambient.a2a_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: external_agents; Type: ROW SECURITY; Schema: ambient; Owner: -
--

ALTER TABLE ambient.external_agents ENABLE ROW LEVEL SECURITY;

--
-- Name: a2a_messages service_role_all_a2a_messages; Type: POLICY; Schema: ambient; Owner: -
--

CREATE POLICY service_role_all_a2a_messages ON ambient.a2a_messages TO service_role USING (true) WITH CHECK (true);


--
-- Name: external_agents service_role_all_external_agents; Type: POLICY; Schema: ambient; Owner: -
--

CREATE POLICY service_role_all_external_agents ON ambient.external_agents TO service_role USING (true) WITH CHECK (true);


--
-- Name: companies; Type: ROW SECURITY; Schema: company; Owner: -
--

ALTER TABLE company.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: discovery_signals; Type: ROW SECURITY; Schema: company; Owner: -
--

ALTER TABLE company.discovery_signals ENABLE ROW LEVEL SECURITY;

--
-- Name: outreach; Type: ROW SECURITY; Schema: company; Owner: -
--

ALTER TABLE company.outreach ENABLE ROW LEVEL SECURITY;

--
-- Name: companies service_role_full_access_companies; Type: POLICY; Schema: company; Owner: -
--

CREATE POLICY service_role_full_access_companies ON company.companies TO service_role USING (true) WITH CHECK (true);


--
-- Name: outreach service_role_full_access_outreach; Type: POLICY; Schema: company; Owner: -
--

CREATE POLICY service_role_full_access_outreach ON company.outreach TO service_role USING (true) WITH CHECK (true);


--
-- Name: discovery_signals service_role_full_access_signals; Type: POLICY; Schema: company; Owner: -
--

CREATE POLICY service_role_full_access_signals ON company.discovery_signals TO service_role USING (true) WITH CHECK (true);


--
-- Name: agent_article_outputs; Type: ROW SECURITY; Schema: crawler; Owner: -
--

ALTER TABLE crawler.agent_article_outputs ENABLE ROW LEVEL SECURITY;

--
-- Name: articles; Type: ROW SECURITY; Schema: crawler; Owner: -
--

ALTER TABLE crawler.articles ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_article_outputs crawler_agent_outputs_insert; Type: POLICY; Schema: crawler; Owner: -
--

CREATE POLICY crawler_agent_outputs_insert ON crawler.agent_article_outputs FOR INSERT WITH CHECK ((article_id IN ( SELECT articles.id
   FROM crawler.articles
  WHERE (articles.organization_slug = current_setting('app.current_org'::text, true)))));


--
-- Name: agent_article_outputs crawler_agent_outputs_read; Type: POLICY; Schema: crawler; Owner: -
--

CREATE POLICY crawler_agent_outputs_read ON crawler.agent_article_outputs FOR SELECT USING ((article_id IN ( SELECT articles.id
   FROM crawler.articles
  WHERE (articles.organization_slug = current_setting('app.current_org'::text, true)))));


--
-- Name: agent_article_outputs crawler_agent_outputs_service_all; Type: POLICY; Schema: crawler; Owner: -
--

CREATE POLICY crawler_agent_outputs_service_all ON crawler.agent_article_outputs TO service_role USING (true) WITH CHECK (true);


--
-- Name: articles crawler_articles_insert; Type: POLICY; Schema: crawler; Owner: -
--

CREATE POLICY crawler_articles_insert ON crawler.articles FOR INSERT WITH CHECK ((organization_slug = current_setting('app.current_org'::text, true)));


--
-- Name: articles crawler_articles_read; Type: POLICY; Schema: crawler; Owner: -
--

CREATE POLICY crawler_articles_read ON crawler.articles FOR SELECT USING ((organization_slug = current_setting('app.current_org'::text, true)));


--
-- Name: articles crawler_articles_service_all; Type: POLICY; Schema: crawler; Owner: -
--

CREATE POLICY crawler_articles_service_all ON crawler.articles TO service_role USING (true) WITH CHECK (true);


--
-- Name: source_crawls crawler_source_crawls_insert; Type: POLICY; Schema: crawler; Owner: -
--

CREATE POLICY crawler_source_crawls_insert ON crawler.source_crawls FOR INSERT WITH CHECK ((source_id IN ( SELECT sources.id
   FROM crawler.sources
  WHERE (sources.organization_slug = current_setting('app.current_org'::text, true)))));


--
-- Name: source_crawls crawler_source_crawls_read; Type: POLICY; Schema: crawler; Owner: -
--

CREATE POLICY crawler_source_crawls_read ON crawler.source_crawls FOR SELECT USING ((source_id IN ( SELECT sources.id
   FROM crawler.sources
  WHERE (sources.organization_slug = current_setting('app.current_org'::text, true)))));


--
-- Name: source_crawls crawler_source_crawls_service_all; Type: POLICY; Schema: crawler; Owner: -
--

CREATE POLICY crawler_source_crawls_service_all ON crawler.source_crawls TO service_role USING (true) WITH CHECK (true);


--
-- Name: sources crawler_sources_delete; Type: POLICY; Schema: crawler; Owner: -
--

CREATE POLICY crawler_sources_delete ON crawler.sources FOR DELETE USING ((organization_slug = current_setting('app.current_org'::text, true)));


--
-- Name: sources crawler_sources_insert; Type: POLICY; Schema: crawler; Owner: -
--

CREATE POLICY crawler_sources_insert ON crawler.sources FOR INSERT WITH CHECK ((organization_slug = current_setting('app.current_org'::text, true)));


--
-- Name: sources crawler_sources_read; Type: POLICY; Schema: crawler; Owner: -
--

CREATE POLICY crawler_sources_read ON crawler.sources FOR SELECT USING ((organization_slug = current_setting('app.current_org'::text, true)));


--
-- Name: sources crawler_sources_service_all; Type: POLICY; Schema: crawler; Owner: -
--

CREATE POLICY crawler_sources_service_all ON crawler.sources TO service_role USING (true) WITH CHECK (true);


--
-- Name: sources crawler_sources_update; Type: POLICY; Schema: crawler; Owner: -
--

CREATE POLICY crawler_sources_update ON crawler.sources FOR UPDATE USING ((organization_slug = current_setting('app.current_org'::text, true)));


--
-- Name: source_crawls; Type: ROW SECURITY; Schema: crawler; Owner: -
--

ALTER TABLE crawler.source_crawls ENABLE ROW LEVEL SECURITY;

--
-- Name: sources; Type: ROW SECURITY; Schema: crawler; Owner: -
--

ALTER TABLE crawler.sources ENABLE ROW LEVEL SECURITY;

--
-- Name: cad_outputs; Type: ROW SECURITY; Schema: engineering; Owner: -
--

ALTER TABLE engineering.cad_outputs ENABLE ROW LEVEL SECURITY;

--
-- Name: cad_outputs cad_outputs_drawing_read; Type: POLICY; Schema: engineering; Owner: -
--

CREATE POLICY cad_outputs_drawing_read ON engineering.cad_outputs FOR SELECT USING ((drawing_id IN ( SELECT d.id
   FROM (engineering.drawings d
     JOIN engineering.projects p ON ((p.id = d.project_id)))
  WHERE (p.org_slug IN ( SELECT o.slug
           FROM (public.organizations o
             JOIN authz.rbac_user_org_roles r ON (((r.organization_slug)::text = o.slug)))
          WHERE (r.user_id = auth.uid()))))));


--
-- Name: drawings; Type: ROW SECURITY; Schema: engineering; Owner: -
--

ALTER TABLE engineering.drawings ENABLE ROW LEVEL SECURITY;

--
-- Name: drawings drawings_project_read; Type: POLICY; Schema: engineering; Owner: -
--

CREATE POLICY drawings_project_read ON engineering.drawings FOR SELECT USING ((project_id IN ( SELECT projects.id
   FROM engineering.projects
  WHERE (projects.org_slug IN ( SELECT o.slug
           FROM (public.organizations o
             JOIN authz.rbac_user_org_roles r ON (((r.organization_slug)::text = o.slug)))
          WHERE (r.user_id = auth.uid()))))));


--
-- Name: execution_log; Type: ROW SECURITY; Schema: engineering; Owner: -
--

ALTER TABLE engineering.execution_log ENABLE ROW LEVEL SECURITY;

--
-- Name: execution_log execution_log_drawing_read; Type: POLICY; Schema: engineering; Owner: -
--

CREATE POLICY execution_log_drawing_read ON engineering.execution_log FOR SELECT USING ((drawing_id IN ( SELECT d.id
   FROM (engineering.drawings d
     JOIN engineering.projects p ON ((p.id = d.project_id)))
  WHERE (p.org_slug IN ( SELECT o.slug
           FROM (public.organizations o
             JOIN authz.rbac_user_org_roles r ON (((r.organization_slug)::text = o.slug)))
          WHERE (r.user_id = auth.uid()))))));


--
-- Name: generated_code; Type: ROW SECURITY; Schema: engineering; Owner: -
--

ALTER TABLE engineering.generated_code ENABLE ROW LEVEL SECURITY;

--
-- Name: generated_code generated_code_drawing_read; Type: POLICY; Schema: engineering; Owner: -
--

CREATE POLICY generated_code_drawing_read ON engineering.generated_code FOR SELECT USING ((drawing_id IN ( SELECT d.id
   FROM (engineering.drawings d
     JOIN engineering.projects p ON ((p.id = d.project_id)))
  WHERE (p.org_slug IN ( SELECT o.slug
           FROM (public.organizations o
             JOIN authz.rbac_user_org_roles r ON (((r.organization_slug)::text = o.slug)))
          WHERE (r.user_id = auth.uid()))))));


--
-- Name: part_library; Type: ROW SECURITY; Schema: engineering; Owner: -
--

ALTER TABLE engineering.part_library ENABLE ROW LEVEL SECURITY;

--
-- Name: part_library part_library_read; Type: POLICY; Schema: engineering; Owner: -
--

CREATE POLICY part_library_read ON engineering.part_library FOR SELECT USING (((is_public = true) OR (org_slug IN ( SELECT o.slug
   FROM (public.organizations o
     JOIN authz.rbac_user_org_roles r ON (((r.organization_slug)::text = o.slug)))
  WHERE (r.user_id = auth.uid())))));


--
-- Name: projects; Type: ROW SECURITY; Schema: engineering; Owner: -
--

ALTER TABLE engineering.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: projects projects_org_read; Type: POLICY; Schema: engineering; Owner: -
--

CREATE POLICY projects_org_read ON engineering.projects FOR SELECT USING ((org_slug IN ( SELECT o.slug
   FROM (public.organizations o
     JOIN authz.rbac_user_org_roles r ON (((r.organization_slug)::text = o.slug)))
  WHERE (r.user_id = auth.uid()))));


--
-- Name: cad_outputs service_role_cad_outputs; Type: POLICY; Schema: engineering; Owner: -
--

CREATE POLICY service_role_cad_outputs ON engineering.cad_outputs TO service_role USING (true) WITH CHECK (true);


--
-- Name: drawings service_role_drawings; Type: POLICY; Schema: engineering; Owner: -
--

CREATE POLICY service_role_drawings ON engineering.drawings TO service_role USING (true) WITH CHECK (true);


--
-- Name: execution_log service_role_execution_log; Type: POLICY; Schema: engineering; Owner: -
--

CREATE POLICY service_role_execution_log ON engineering.execution_log TO service_role USING (true) WITH CHECK (true);


--
-- Name: generated_code service_role_generated_code; Type: POLICY; Schema: engineering; Owner: -
--

CREATE POLICY service_role_generated_code ON engineering.generated_code TO service_role USING (true) WITH CHECK (true);


--
-- Name: part_library service_role_part_library; Type: POLICY; Schema: engineering; Owner: -
--

CREATE POLICY service_role_part_library ON engineering.part_library TO service_role USING (true) WITH CHECK (true);


--
-- Name: projects service_role_projects; Type: POLICY; Schema: engineering; Owner: -
--

CREATE POLICY service_role_projects ON engineering.projects TO service_role USING (true) WITH CHECK (true);


--
-- Name: analysis_tasks; Type: ROW SECURITY; Schema: law; Owner: -
--

ALTER TABLE law.analysis_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: analysis_tasks analysis_tasks_org_insert; Type: POLICY; Schema: law; Owner: -
--

CREATE POLICY analysis_tasks_org_insert ON law.analysis_tasks FOR INSERT WITH CHECK ((organization_slug IN ( SELECT rbac_user_org_roles.organization_slug
   FROM authz.rbac_user_org_roles
  WHERE (rbac_user_org_roles.user_id = auth.uid()))));


--
-- Name: analysis_tasks analysis_tasks_org_read; Type: POLICY; Schema: law; Owner: -
--

CREATE POLICY analysis_tasks_org_read ON law.analysis_tasks FOR SELECT USING ((organization_slug IN ( SELECT rbac_user_org_roles.organization_slug
   FROM authz.rbac_user_org_roles
  WHERE (rbac_user_org_roles.user_id = auth.uid()))));


--
-- Name: analysis_tasks analysis_tasks_update; Type: POLICY; Schema: law; Owner: -
--

CREATE POLICY analysis_tasks_update ON law.analysis_tasks FOR UPDATE USING (((user_id = auth.uid()) OR (organization_slug IN ( SELECT r.organization_slug
   FROM (authz.rbac_user_org_roles r
     JOIN authz.rbac_roles roles ON ((r.role_id = roles.id)))
  WHERE ((r.user_id = auth.uid()) AND ((roles.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('owner'::character varying)::text])))))));


--
-- Name: document_extractions; Type: ROW SECURITY; Schema: law; Owner: -
--

ALTER TABLE law.document_extractions ENABLE ROW LEVEL SECURITY;

--
-- Name: document_extractions document_extractions_read; Type: POLICY; Schema: law; Owner: -
--

CREATE POLICY document_extractions_read ON law.document_extractions FOR SELECT USING ((analysis_task_id IN ( SELECT analysis_tasks.id
   FROM law.analysis_tasks
  WHERE (analysis_tasks.organization_slug IN ( SELECT rbac_user_org_roles.organization_slug
           FROM authz.rbac_user_org_roles
          WHERE (rbac_user_org_roles.user_id = auth.uid()))))));


--
-- Name: execution_steps; Type: ROW SECURITY; Schema: law; Owner: -
--

ALTER TABLE law.execution_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: execution_steps execution_steps_read; Type: POLICY; Schema: law; Owner: -
--

CREATE POLICY execution_steps_read ON law.execution_steps FOR SELECT USING ((analysis_task_id IN ( SELECT analysis_tasks.id
   FROM law.analysis_tasks
  WHERE (analysis_tasks.organization_slug IN ( SELECT rbac_user_org_roles.organization_slug
           FROM authz.rbac_user_org_roles
          WHERE (rbac_user_org_roles.user_id = auth.uid()))))));


--
-- Name: playbooks; Type: ROW SECURITY; Schema: law; Owner: -
--

ALTER TABLE law.playbooks ENABLE ROW LEVEL SECURITY;

--
-- Name: playbooks playbooks_org_admin; Type: POLICY; Schema: law; Owner: -
--

CREATE POLICY playbooks_org_admin ON law.playbooks USING ((organization_slug IN ( SELECT r.organization_slug
   FROM (authz.rbac_user_org_roles r
     JOIN authz.rbac_roles roles ON ((r.role_id = roles.id)))
  WHERE ((r.user_id = auth.uid()) AND ((roles.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('owner'::character varying)::text]))))));


--
-- Name: playbooks playbooks_org_read; Type: POLICY; Schema: law; Owner: -
--

CREATE POLICY playbooks_org_read ON law.playbooks FOR SELECT USING ((organization_slug IN ( SELECT rbac_user_org_roles.organization_slug
   FROM authz.rbac_user_org_roles
  WHERE (rbac_user_org_roles.user_id = auth.uid()))));


--
-- Name: analysis_tasks service_role_analysis_tasks; Type: POLICY; Schema: law; Owner: -
--

CREATE POLICY service_role_analysis_tasks ON law.analysis_tasks TO service_role USING (true) WITH CHECK (true);


--
-- Name: document_extractions service_role_document_extractions; Type: POLICY; Schema: law; Owner: -
--

CREATE POLICY service_role_document_extractions ON law.document_extractions TO service_role USING (true) WITH CHECK (true);


--
-- Name: execution_steps service_role_execution_steps; Type: POLICY; Schema: law; Owner: -
--

CREATE POLICY service_role_execution_steps ON law.execution_steps TO service_role USING (true) WITH CHECK (true);


--
-- Name: playbooks service_role_playbooks; Type: POLICY; Schema: law; Owner: -
--

CREATE POLICY service_role_playbooks ON law.playbooks TO service_role USING (true) WITH CHECK (true);


--
-- Name: specialist_outputs service_role_specialist_outputs; Type: POLICY; Schema: law; Owner: -
--

CREATE POLICY service_role_specialist_outputs ON law.specialist_outputs TO service_role USING (true) WITH CHECK (true);


--
-- Name: specialist_outputs; Type: ROW SECURITY; Schema: law; Owner: -
--

ALTER TABLE law.specialist_outputs ENABLE ROW LEVEL SECURITY;

--
-- Name: specialist_outputs specialist_outputs_read; Type: POLICY; Schema: law; Owner: -
--

CREATE POLICY specialist_outputs_read ON law.specialist_outputs FOR SELECT USING ((analysis_task_id IN ( SELECT analysis_tasks.id
   FROM law.analysis_tasks
  WHERE (analysis_tasks.organization_slug IN ( SELECT rbac_user_org_roles.organization_slug
           FROM authz.rbac_user_org_roles
          WHERE (rbac_user_org_roles.user_id = auth.uid()))))));


--
-- Name: agent_idea_submissions; Type: ROW SECURITY; Schema: leads; Owner: -
--

ALTER TABLE leads.agent_idea_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_idea_submissions service_role_full_access_agent_ideas; Type: POLICY; Schema: leads; Owner: -
--

CREATE POLICY service_role_full_access_agent_ideas ON leads.agent_idea_submissions TO service_role USING (true) WITH CHECK (true);


--
-- Name: agent_llm_configs; Type: ROW SECURITY; Schema: marketing; Owner: -
--

ALTER TABLE marketing.agent_llm_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_llm_configs agent_llm_configs_read; Type: POLICY; Schema: marketing; Owner: -
--

CREATE POLICY agent_llm_configs_read ON marketing.agent_llm_configs FOR SELECT USING ((agent_slug IN ( SELECT agents.slug
   FROM marketing.agents
  WHERE (agents.organization_slug IN ( SELECT rbac_user_org_roles.organization_slug
           FROM authz.rbac_user_org_roles
          WHERE (rbac_user_org_roles.user_id = auth.uid()))))));


--
-- Name: agents; Type: ROW SECURITY; Schema: marketing; Owner: -
--

ALTER TABLE marketing.agents ENABLE ROW LEVEL SECURITY;

--
-- Name: agents agents_org_read; Type: POLICY; Schema: marketing; Owner: -
--

CREATE POLICY agents_org_read ON marketing.agents FOR SELECT USING ((organization_slug IN ( SELECT rbac_user_org_roles.organization_slug
   FROM authz.rbac_user_org_roles
  WHERE (rbac_user_org_roles.user_id = auth.uid()))));


--
-- Name: content_types; Type: ROW SECURITY; Schema: marketing; Owner: -
--

ALTER TABLE marketing.content_types ENABLE ROW LEVEL SECURITY;

--
-- Name: content_types content_types_org_read; Type: POLICY; Schema: marketing; Owner: -
--

CREATE POLICY content_types_org_read ON marketing.content_types FOR SELECT USING ((organization_slug IN ( SELECT rbac_user_org_roles.organization_slug
   FROM authz.rbac_user_org_roles
  WHERE (rbac_user_org_roles.user_id = auth.uid()))));


--
-- Name: evaluations; Type: ROW SECURITY; Schema: marketing; Owner: -
--

ALTER TABLE marketing.evaluations ENABLE ROW LEVEL SECURITY;

--
-- Name: evaluations evaluations_task_read; Type: POLICY; Schema: marketing; Owner: -
--

CREATE POLICY evaluations_task_read ON marketing.evaluations FOR SELECT USING ((task_id IN ( SELECT swarm_tasks.task_id
   FROM marketing.swarm_tasks
  WHERE (swarm_tasks.organization_slug IN ( SELECT rbac_user_org_roles.organization_slug
           FROM authz.rbac_user_org_roles
          WHERE (rbac_user_org_roles.user_id = auth.uid()))))));


--
-- Name: execution_queue; Type: ROW SECURITY; Schema: marketing; Owner: -
--

ALTER TABLE marketing.execution_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: execution_queue execution_queue_task_read; Type: POLICY; Schema: marketing; Owner: -
--

CREATE POLICY execution_queue_task_read ON marketing.execution_queue FOR SELECT USING ((task_id IN ( SELECT swarm_tasks.task_id
   FROM marketing.swarm_tasks
  WHERE (swarm_tasks.organization_slug IN ( SELECT rbac_user_org_roles.organization_slug
           FROM authz.rbac_user_org_roles
          WHERE (rbac_user_org_roles.user_id = auth.uid()))))));


--
-- Name: output_versions; Type: ROW SECURITY; Schema: marketing; Owner: -
--

ALTER TABLE marketing.output_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: output_versions output_versions_task_read; Type: POLICY; Schema: marketing; Owner: -
--

CREATE POLICY output_versions_task_read ON marketing.output_versions FOR SELECT USING ((task_id IN ( SELECT swarm_tasks.task_id
   FROM marketing.swarm_tasks
  WHERE (swarm_tasks.organization_slug IN ( SELECT rbac_user_org_roles.organization_slug
           FROM authz.rbac_user_org_roles
          WHERE (rbac_user_org_roles.user_id = auth.uid()))))));


--
-- Name: outputs; Type: ROW SECURITY; Schema: marketing; Owner: -
--

ALTER TABLE marketing.outputs ENABLE ROW LEVEL SECURITY;

--
-- Name: outputs outputs_task_read; Type: POLICY; Schema: marketing; Owner: -
--

CREATE POLICY outputs_task_read ON marketing.outputs FOR SELECT USING ((task_id IN ( SELECT swarm_tasks.task_id
   FROM marketing.swarm_tasks
  WHERE (swarm_tasks.organization_slug IN ( SELECT rbac_user_org_roles.organization_slug
           FROM authz.rbac_user_org_roles
          WHERE (rbac_user_org_roles.user_id = auth.uid()))))));


--
-- Name: agent_llm_configs service_role_agent_llm_configs; Type: POLICY; Schema: marketing; Owner: -
--

CREATE POLICY service_role_agent_llm_configs ON marketing.agent_llm_configs TO service_role USING (true) WITH CHECK (true);


--
-- Name: agents service_role_agents; Type: POLICY; Schema: marketing; Owner: -
--

CREATE POLICY service_role_agents ON marketing.agents TO service_role USING (true) WITH CHECK (true);


--
-- Name: content_types service_role_content_types; Type: POLICY; Schema: marketing; Owner: -
--

CREATE POLICY service_role_content_types ON marketing.content_types TO service_role USING (true) WITH CHECK (true);


--
-- Name: evaluations service_role_evaluations; Type: POLICY; Schema: marketing; Owner: -
--

CREATE POLICY service_role_evaluations ON marketing.evaluations TO service_role USING (true) WITH CHECK (true);


--
-- Name: execution_queue service_role_execution_queue; Type: POLICY; Schema: marketing; Owner: -
--

CREATE POLICY service_role_execution_queue ON marketing.execution_queue TO service_role USING (true) WITH CHECK (true);


--
-- Name: output_versions service_role_output_versions; Type: POLICY; Schema: marketing; Owner: -
--

CREATE POLICY service_role_output_versions ON marketing.output_versions TO service_role USING (true) WITH CHECK (true);


--
-- Name: outputs service_role_outputs; Type: POLICY; Schema: marketing; Owner: -
--

CREATE POLICY service_role_outputs ON marketing.outputs TO service_role USING (true) WITH CHECK (true);


--
-- Name: swarm_tasks service_role_swarm_tasks; Type: POLICY; Schema: marketing; Owner: -
--

CREATE POLICY service_role_swarm_tasks ON marketing.swarm_tasks TO service_role USING (true) WITH CHECK (true);


--
-- Name: swarm_tasks; Type: ROW SECURITY; Schema: marketing; Owner: -
--

ALTER TABLE marketing.swarm_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: swarm_tasks swarm_tasks_org_read; Type: POLICY; Schema: marketing; Owner: -
--

CREATE POLICY swarm_tasks_org_read ON marketing.swarm_tasks FOR SELECT USING ((organization_slug IN ( SELECT rbac_user_org_roles.organization_slug
   FROM authz.rbac_user_org_roles
  WHERE (rbac_user_org_roles.user_id = auth.uid()))));


--
-- Name: swarm_tasks swarm_tasks_owner_write; Type: POLICY; Schema: marketing; Owner: -
--

CREATE POLICY swarm_tasks_owner_write ON marketing.swarm_tasks USING ((user_id = auth.uid()));


--
-- Name: task_collaborators Anyone can add collaborators; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Anyone can add collaborators" ON orch_flow.task_collaborators FOR INSERT WITH CHECK (true);


--
-- Name: task_watchers Anyone can add watchers; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Anyone can add watchers" ON orch_flow.task_watchers FOR INSERT WITH CHECK (true);


--
-- Name: notifications Anyone can create notifications; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Anyone can create notifications" ON orch_flow.notifications FOR INSERT WITH CHECK (true);


--
-- Name: task_update_requests Anyone can create update requests; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Anyone can create update requests" ON orch_flow.task_update_requests FOR INSERT WITH CHECK (true);


--
-- Name: notifications Anyone can delete notifications; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Anyone can delete notifications" ON orch_flow.notifications FOR DELETE USING (true);


--
-- Name: task_collaborators Anyone can remove collaborators; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Anyone can remove collaborators" ON orch_flow.task_collaborators FOR DELETE USING (true);


--
-- Name: task_watchers Anyone can remove watchers; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Anyone can remove watchers" ON orch_flow.task_watchers FOR DELETE USING (true);


--
-- Name: notifications Anyone can update notifications; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Anyone can update notifications" ON orch_flow.notifications FOR UPDATE USING (true);


--
-- Name: task_update_requests Anyone can update requests; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Anyone can update requests" ON orch_flow.task_update_requests FOR UPDATE USING (true);


--
-- Name: task_collaborators Anyone can view collaborators; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Anyone can view collaborators" ON orch_flow.task_collaborators FOR SELECT USING (true);


--
-- Name: journey_templates Anyone can view journey templates; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Anyone can view journey templates" ON orch_flow.journey_templates FOR SELECT USING ((is_active = true));


--
-- Name: notifications Anyone can view notifications; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Anyone can view notifications" ON orch_flow.notifications FOR SELECT USING (true);


--
-- Name: user_presence Anyone can view presence; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Anyone can view presence" ON orch_flow.user_presence FOR SELECT USING (true);


--
-- Name: task_update_requests Anyone can view update requests; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Anyone can view update requests" ON orch_flow.task_update_requests FOR SELECT USING (true);


--
-- Name: task_watchers Anyone can view watchers; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Anyone can view watchers" ON orch_flow.task_watchers FOR SELECT USING (true);


--
-- Name: profiles Profiles are viewable by everyone; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Profiles are viewable by everyone" ON orch_flow.profiles FOR SELECT USING (true);


--
-- Name: team_files Team members can manage team files; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Team members can manage team files" ON orch_flow.team_files USING ((EXISTS ( SELECT 1
   FROM public.team_members
  WHERE ((team_members.team_id = team_files.team_id) AND (team_members.user_id = auth.uid())))));


--
-- Name: team_files Team members can view team files; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Team members can view team files" ON orch_flow.team_files FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.team_members
  WHERE ((team_members.team_id = team_files.team_id) AND (team_members.user_id = auth.uid())))));


--
-- Name: efforts Users can create team or org efforts; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Users can create team or org efforts" ON orch_flow.efforts FOR INSERT WITH CHECK ((((team_id IS NOT NULL) AND (team_id IN ( SELECT team_members.team_id
   FROM public.team_members
  WHERE (team_members.user_id = auth.uid())))) OR ((organization_slug IS NOT NULL) AND (organization_slug IN ( SELECT users.organization_slug
   FROM authz.users
  WHERE (users.id = auth.uid())))) OR ((team_id IS NULL) AND (organization_slug IS NULL))));


--
-- Name: efforts Users can delete team or org efforts; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Users can delete team or org efforts" ON orch_flow.efforts FOR DELETE USING ((((team_id IS NOT NULL) AND (team_id IN ( SELECT team_members.team_id
   FROM public.team_members
  WHERE (team_members.user_id = auth.uid())))) OR ((organization_slug IS NOT NULL) AND (organization_slug IN ( SELECT users.organization_slug
   FROM authz.users
  WHERE (users.id = auth.uid())))) OR ((team_id IS NULL) AND (organization_slug IS NULL))));


--
-- Name: channel_messages Users can delete their own messages; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Users can delete their own messages" ON orch_flow.channel_messages FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: profiles Users can insert their own profile; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Users can insert their own profile" ON orch_flow.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: channels Users can manage channels in their teams; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Users can manage channels in their teams" ON orch_flow.channels USING (((team_id IS NULL) OR orch_flow.is_team_member(auth.uid(), team_id)));


--
-- Name: learning_progress Users can manage own learning progress; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Users can manage own learning progress" ON orch_flow.learning_progress USING ((user_id = auth.uid()));


--
-- Name: sprints Users can manage sprints in their teams; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Users can manage sprints in their teams" ON orch_flow.sprints USING (((team_id IS NULL) OR orch_flow.is_team_member(auth.uid(), team_id)));


--
-- Name: shared_tasks Users can manage tasks in their teams; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Users can manage tasks in their teams" ON orch_flow.shared_tasks USING (((team_id IS NULL) OR orch_flow.is_team_member(auth.uid(), team_id)));


--
-- Name: projects Users can manage team-scoped or org projects; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Users can manage team-scoped or org projects" ON orch_flow.projects USING ((effort_id IN ( SELECT efforts.id
   FROM orch_flow.efforts
  WHERE ((efforts.organization_slug IS NULL) OR (efforts.organization_slug IN ( SELECT users.organization_slug
           FROM authz.users
          WHERE (users.id = auth.uid())))))));


--
-- Name: tasks Users can manage team-scoped or org tasks; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Users can manage team-scoped or org tasks" ON orch_flow.tasks USING ((project_id IN ( SELECT p.id
   FROM (orch_flow.projects p
     JOIN orch_flow.efforts e ON ((p.effort_id = e.id)))
  WHERE ((e.organization_slug IS NULL) OR (e.organization_slug IN ( SELECT users.organization_slug
           FROM authz.users
          WHERE (users.id = auth.uid())))))));


--
-- Name: channel_messages Users can manage their own messages; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Users can manage their own messages" ON orch_flow.channel_messages FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: timer_state Users can manage timer in their teams; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Users can manage timer in their teams" ON orch_flow.timer_state USING (((team_id IS NULL) OR orch_flow.is_team_member(auth.uid(), team_id)));


--
-- Name: channel_messages Users can send messages in accessible channels; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Users can send messages in accessible channels" ON orch_flow.channel_messages FOR INSERT WITH CHECK ((channel_id IN ( SELECT c.id
   FROM orch_flow.channels c
  WHERE ((c.team_id IS NULL) OR orch_flow.is_team_member(auth.uid(), c.team_id)))));


--
-- Name: efforts Users can update team or org efforts; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Users can update team or org efforts" ON orch_flow.efforts FOR UPDATE USING ((((team_id IS NOT NULL) AND (team_id IN ( SELECT team_members.team_id
   FROM public.team_members
  WHERE (team_members.user_id = auth.uid())))) OR ((organization_slug IS NOT NULL) AND (organization_slug IN ( SELECT users.organization_slug
   FROM authz.users
  WHERE (users.id = auth.uid())))) OR ((team_id IS NULL) AND (organization_slug IS NULL))));


--
-- Name: user_presence Users can update their own presence; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Users can update their own presence" ON orch_flow.user_presence FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Users can update their own profile" ON orch_flow.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: user_presence Users can upsert their own presence; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Users can upsert their own presence" ON orch_flow.user_presence FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: channels Users can view channels in their teams; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Users can view channels in their teams" ON orch_flow.channels FOR SELECT USING (((team_id IS NULL) OR orch_flow.is_team_member(auth.uid(), team_id)));


--
-- Name: channel_messages Users can view messages in accessible channels; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Users can view messages in accessible channels" ON orch_flow.channel_messages FOR SELECT USING ((channel_id IN ( SELECT c.id
   FROM orch_flow.channels c
  WHERE ((c.team_id IS NULL) OR orch_flow.is_team_member(auth.uid(), c.team_id)))));


--
-- Name: learning_progress Users can view own learning progress; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Users can view own learning progress" ON orch_flow.learning_progress FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: sprints Users can view sprints in their teams; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Users can view sprints in their teams" ON orch_flow.sprints FOR SELECT USING (((team_id IS NULL) OR orch_flow.is_team_member(auth.uid(), team_id)));


--
-- Name: shared_tasks Users can view tasks in their teams; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Users can view tasks in their teams" ON orch_flow.shared_tasks FOR SELECT USING (((team_id IS NULL) OR orch_flow.is_team_member(auth.uid(), team_id)));


--
-- Name: efforts Users can view team or org efforts; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Users can view team or org efforts" ON orch_flow.efforts FOR SELECT USING ((((team_id IS NOT NULL) AND (team_id IN ( SELECT team_members.team_id
   FROM public.team_members
  WHERE (team_members.user_id = auth.uid())))) OR ((organization_slug IS NOT NULL) AND (organization_slug IN ( SELECT users.organization_slug
   FROM authz.users
  WHERE (users.id = auth.uid())))) OR ((team_id IS NULL) AND (organization_slug IS NULL))));


--
-- Name: projects Users can view team-scoped or org projects; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Users can view team-scoped or org projects" ON orch_flow.projects FOR SELECT USING ((effort_id IN ( SELECT efforts.id
   FROM orch_flow.efforts
  WHERE ((efforts.organization_slug IS NULL) OR (efforts.organization_slug IN ( SELECT users.organization_slug
           FROM authz.users
          WHERE (users.id = auth.uid())))))));


--
-- Name: tasks Users can view team-scoped or org tasks; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Users can view team-scoped or org tasks" ON orch_flow.tasks FOR SELECT USING ((project_id IN ( SELECT p.id
   FROM (orch_flow.projects p
     JOIN orch_flow.efforts e ON ((p.effort_id = e.id)))
  WHERE ((e.organization_slug IS NULL) OR (e.organization_slug IN ( SELECT users.organization_slug
           FROM authz.users
          WHERE (users.id = auth.uid())))))));


--
-- Name: timer_state Users can view timer in their teams; Type: POLICY; Schema: orch_flow; Owner: -
--

CREATE POLICY "Users can view timer in their teams" ON orch_flow.timer_state FOR SELECT USING (((team_id IS NULL) OR orch_flow.is_team_member(auth.uid(), team_id)));


--
-- Name: channel_messages; Type: ROW SECURITY; Schema: orch_flow; Owner: -
--

ALTER TABLE orch_flow.channel_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: channels; Type: ROW SECURITY; Schema: orch_flow; Owner: -
--

ALTER TABLE orch_flow.channels ENABLE ROW LEVEL SECURITY;

--
-- Name: efforts; Type: ROW SECURITY; Schema: orch_flow; Owner: -
--

ALTER TABLE orch_flow.efforts ENABLE ROW LEVEL SECURITY;

--
-- Name: journey_templates; Type: ROW SECURITY; Schema: orch_flow; Owner: -
--

ALTER TABLE orch_flow.journey_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_progress; Type: ROW SECURITY; Schema: orch_flow; Owner: -
--

ALTER TABLE orch_flow.learning_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: orch_flow; Owner: -
--

ALTER TABLE orch_flow.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: orch_flow; Owner: -
--

ALTER TABLE orch_flow.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: projects; Type: ROW SECURITY; Schema: orch_flow; Owner: -
--

ALTER TABLE orch_flow.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: shared_tasks; Type: ROW SECURITY; Schema: orch_flow; Owner: -
--

ALTER TABLE orch_flow.shared_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: sprints; Type: ROW SECURITY; Schema: orch_flow; Owner: -
--

ALTER TABLE orch_flow.sprints ENABLE ROW LEVEL SECURITY;

--
-- Name: task_collaborators; Type: ROW SECURITY; Schema: orch_flow; Owner: -
--

ALTER TABLE orch_flow.task_collaborators ENABLE ROW LEVEL SECURITY;

--
-- Name: task_update_requests; Type: ROW SECURITY; Schema: orch_flow; Owner: -
--

ALTER TABLE orch_flow.task_update_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: task_watchers; Type: ROW SECURITY; Schema: orch_flow; Owner: -
--

ALTER TABLE orch_flow.task_watchers ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks; Type: ROW SECURITY; Schema: orch_flow; Owner: -
--

ALTER TABLE orch_flow.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: team_files; Type: ROW SECURITY; Schema: orch_flow; Owner: -
--

ALTER TABLE orch_flow.team_files ENABLE ROW LEVEL SECURITY;

--
-- Name: timer_state; Type: ROW SECURITY; Schema: orch_flow; Owner: -
--

ALTER TABLE orch_flow.timer_state ENABLE ROW LEVEL SECURITY;

--
-- Name: user_presence; Type: ROW SECURITY; Schema: orch_flow; Owner: -
--

ALTER TABLE orch_flow.user_presence ENABLE ROW LEVEL SECURITY;

--
-- Name: analyst_assessments; Type: ROW SECURITY; Schema: prediction; Owner: -
--

ALTER TABLE prediction.analyst_assessments ENABLE ROW LEVEL SECURITY;

--
-- Name: analyst_assessments analyst_assessments_read_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY analyst_assessments_read_policy ON prediction.analyst_assessments FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM ((prediction.predictors pr
     JOIN prediction.targets t ON ((pr.target_id = t.id)))
     JOIN prediction.universes u ON ((t.universe_id = u.id)))
  WHERE ((pr.id = analyst_assessments.predictor_id) AND prediction.user_has_org_access(u.organization_slug)))) OR (EXISTS ( SELECT 1
   FROM ((prediction.predictions p
     JOIN prediction.targets t ON ((p.target_id = t.id)))
     JOIN prediction.universes u ON ((t.universe_id = u.id)))
  WHERE ((p.id = analyst_assessments.prediction_id) AND prediction.user_has_org_access(u.organization_slug))))));


--
-- Name: analyst_assessments analyst_assessments_service_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY analyst_assessments_service_policy ON prediction.analyst_assessments TO service_role USING (true) WITH CHECK (true);


--
-- Name: analyst_overrides; Type: ROW SECURITY; Schema: prediction; Owner: -
--

ALTER TABLE prediction.analyst_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: analyst_overrides analyst_overrides_read_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY analyst_overrides_read_policy ON prediction.analyst_overrides FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM prediction.universes u
  WHERE ((u.id = COALESCE(analyst_overrides.universe_id, ( SELECT t.universe_id
           FROM prediction.targets t
          WHERE (t.id = analyst_overrides.target_id)))) AND prediction.user_has_org_access(u.organization_slug)))));


--
-- Name: analyst_overrides analyst_overrides_service_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY analyst_overrides_service_policy ON prediction.analyst_overrides TO service_role USING (true) WITH CHECK (true);


--
-- Name: analysts; Type: ROW SECURITY; Schema: prediction; Owner: -
--

ALTER TABLE prediction.analysts ENABLE ROW LEVEL SECURITY;

--
-- Name: analysts analysts_read_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY analysts_read_policy ON prediction.analysts FOR SELECT TO authenticated USING (((scope_level = ANY (ARRAY['runner'::text, 'domain'::text])) OR ((scope_level = ANY (ARRAY['universe'::text, 'target'::text])) AND (EXISTS ( SELECT 1
   FROM prediction.universes u
  WHERE ((u.id = analysts.universe_id) AND prediction.user_has_org_access(u.organization_slug)))))));


--
-- Name: analysts analysts_service_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY analysts_service_policy ON prediction.analysts TO service_role USING (true) WITH CHECK (true);


--
-- Name: evaluations; Type: ROW SECURITY; Schema: prediction; Owner: -
--

ALTER TABLE prediction.evaluations ENABLE ROW LEVEL SECURITY;

--
-- Name: evaluations evaluations_read_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY evaluations_read_policy ON prediction.evaluations FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((prediction.predictions p
     JOIN prediction.targets t ON ((p.target_id = t.id)))
     JOIN prediction.universes u ON ((t.universe_id = u.id)))
  WHERE ((p.id = evaluations.prediction_id) AND prediction.user_has_org_access(u.organization_slug)))));


--
-- Name: evaluations evaluations_service_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY evaluations_service_policy ON prediction.evaluations TO service_role USING (true) WITH CHECK (true);


--
-- Name: learning_queue; Type: ROW SECURITY; Schema: prediction; Owner: -
--

ALTER TABLE prediction.learning_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_queue learning_queue_read_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY learning_queue_read_policy ON prediction.learning_queue FOR SELECT TO authenticated USING (((suggested_scope_level = ANY (ARRAY['runner'::text, 'domain'::text])) OR ((suggested_scope_level = ANY (ARRAY['universe'::text, 'target'::text])) AND (EXISTS ( SELECT 1
   FROM prediction.universes u
  WHERE ((u.id = COALESCE(learning_queue.suggested_universe_id, ( SELECT t.universe_id
           FROM prediction.targets t
          WHERE (t.id = learning_queue.suggested_target_id)))) AND prediction.user_has_org_access(u.organization_slug)))))));


--
-- Name: learning_queue learning_queue_service_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY learning_queue_service_policy ON prediction.learning_queue TO service_role USING (true) WITH CHECK (true);


--
-- Name: learning_queue learning_queue_update_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY learning_queue_update_policy ON prediction.learning_queue FOR UPDATE TO authenticated USING (((suggested_scope_level = ANY (ARRAY['runner'::text, 'domain'::text])) OR ((suggested_scope_level = ANY (ARRAY['universe'::text, 'target'::text])) AND (EXISTS ( SELECT 1
   FROM prediction.universes u
  WHERE ((u.id = COALESCE(learning_queue.suggested_universe_id, ( SELECT t.universe_id
           FROM prediction.targets t
          WHERE (t.id = learning_queue.suggested_target_id)))) AND prediction.user_has_org_access(u.organization_slug))))))) WITH CHECK (((suggested_scope_level = ANY (ARRAY['runner'::text, 'domain'::text])) OR ((suggested_scope_level = ANY (ARRAY['universe'::text, 'target'::text])) AND (EXISTS ( SELECT 1
   FROM prediction.universes u
  WHERE ((u.id = COALESCE(learning_queue.suggested_universe_id, ( SELECT t.universe_id
           FROM prediction.targets t
          WHERE (t.id = learning_queue.suggested_target_id)))) AND prediction.user_has_org_access(u.organization_slug)))))));


--
-- Name: learnings; Type: ROW SECURITY; Schema: prediction; Owner: -
--

ALTER TABLE prediction.learnings ENABLE ROW LEVEL SECURITY;

--
-- Name: learnings learnings_read_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY learnings_read_policy ON prediction.learnings FOR SELECT TO authenticated USING (((scope_level = ANY (ARRAY['runner'::text, 'domain'::text])) OR ((scope_level = ANY (ARRAY['universe'::text, 'target'::text])) AND (EXISTS ( SELECT 1
   FROM prediction.universes u
  WHERE ((u.id = COALESCE(learnings.universe_id, ( SELECT t.universe_id
           FROM prediction.targets t
          WHERE (t.id = learnings.target_id)))) AND prediction.user_has_org_access(u.organization_slug)))))));


--
-- Name: learnings learnings_service_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY learnings_service_policy ON prediction.learnings TO service_role USING (true) WITH CHECK (true);


--
-- Name: missed_opportunities; Type: ROW SECURITY; Schema: prediction; Owner: -
--

ALTER TABLE prediction.missed_opportunities ENABLE ROW LEVEL SECURITY;

--
-- Name: missed_opportunities missed_opportunities_read_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY missed_opportunities_read_policy ON prediction.missed_opportunities FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (prediction.targets t
     JOIN prediction.universes u ON ((t.universe_id = u.id)))
  WHERE ((t.id = missed_opportunities.target_id) AND prediction.user_has_org_access(u.organization_slug)))));


--
-- Name: missed_opportunities missed_opportunities_service_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY missed_opportunities_service_policy ON prediction.missed_opportunities TO service_role USING (true) WITH CHECK (true);


--
-- Name: source_subscriptions prediction_source_subs_delete; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY prediction_source_subs_delete ON prediction.source_subscriptions FOR DELETE USING ((target_id IN ( SELECT t.id
   FROM (prediction.targets t
     JOIN prediction.universes u ON ((t.universe_id = u.id)))
  WHERE (u.organization_slug = current_setting('app.current_org'::text, true)))));


--
-- Name: source_subscriptions prediction_source_subs_insert; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY prediction_source_subs_insert ON prediction.source_subscriptions FOR INSERT WITH CHECK ((target_id IN ( SELECT t.id
   FROM (prediction.targets t
     JOIN prediction.universes u ON ((t.universe_id = u.id)))
  WHERE (u.organization_slug = current_setting('app.current_org'::text, true)))));


--
-- Name: source_subscriptions prediction_source_subs_read; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY prediction_source_subs_read ON prediction.source_subscriptions FOR SELECT USING ((target_id IN ( SELECT t.id
   FROM (prediction.targets t
     JOIN prediction.universes u ON ((t.universe_id = u.id)))
  WHERE (u.organization_slug = current_setting('app.current_org'::text, true)))));


--
-- Name: source_subscriptions prediction_source_subs_service_all; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY prediction_source_subs_service_all ON prediction.source_subscriptions TO service_role USING (true) WITH CHECK (true);


--
-- Name: source_subscriptions prediction_source_subs_update; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY prediction_source_subs_update ON prediction.source_subscriptions FOR UPDATE USING ((target_id IN ( SELECT t.id
   FROM (prediction.targets t
     JOIN prediction.universes u ON ((t.universe_id = u.id)))
  WHERE (u.organization_slug = current_setting('app.current_org'::text, true)))));


--
-- Name: predictions; Type: ROW SECURITY; Schema: prediction; Owner: -
--

ALTER TABLE prediction.predictions ENABLE ROW LEVEL SECURITY;

--
-- Name: predictions predictions_read_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY predictions_read_policy ON prediction.predictions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (prediction.targets t
     JOIN prediction.universes u ON ((t.universe_id = u.id)))
  WHERE ((t.id = predictions.target_id) AND prediction.user_has_org_access(u.organization_slug)))));


--
-- Name: predictions predictions_service_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY predictions_service_policy ON prediction.predictions TO service_role USING (true) WITH CHECK (true);


--
-- Name: predictors; Type: ROW SECURITY; Schema: prediction; Owner: -
--

ALTER TABLE prediction.predictors ENABLE ROW LEVEL SECURITY;

--
-- Name: predictors predictors_read_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY predictors_read_policy ON prediction.predictors FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (prediction.targets t
     JOIN prediction.universes u ON ((t.universe_id = u.id)))
  WHERE ((t.id = predictors.target_id) AND prediction.user_has_org_access(u.organization_slug)))));


--
-- Name: predictors predictors_service_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY predictors_service_policy ON prediction.predictors TO service_role USING (true) WITH CHECK (true);


--
-- Name: review_queue; Type: ROW SECURITY; Schema: prediction; Owner: -
--

ALTER TABLE prediction.review_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: review_queue review_queue_read_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY review_queue_read_policy ON prediction.review_queue FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((prediction.signals s
     JOIN prediction.targets t ON ((s.target_id = t.id)))
     JOIN prediction.universes u ON ((t.universe_id = u.id)))
  WHERE ((s.id = review_queue.signal_id) AND prediction.user_has_org_access(u.organization_slug)))));


--
-- Name: review_queue review_queue_service_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY review_queue_service_policy ON prediction.review_queue TO service_role USING (true) WITH CHECK (true);


--
-- Name: review_queue review_queue_update_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY review_queue_update_policy ON prediction.review_queue FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((prediction.signals s
     JOIN prediction.targets t ON ((s.target_id = t.id)))
     JOIN prediction.universes u ON ((t.universe_id = u.id)))
  WHERE ((s.id = review_queue.signal_id) AND prediction.user_has_org_access(u.organization_slug))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ((prediction.signals s
     JOIN prediction.targets t ON ((s.target_id = t.id)))
     JOIN prediction.universes u ON ((t.universe_id = u.id)))
  WHERE ((s.id = review_queue.signal_id) AND prediction.user_has_org_access(u.organization_slug)))));


--
-- Name: signals; Type: ROW SECURITY; Schema: prediction; Owner: -
--

ALTER TABLE prediction.signals ENABLE ROW LEVEL SECURITY;

--
-- Name: signals signals_read_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY signals_read_policy ON prediction.signals FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (prediction.targets t
     JOIN prediction.universes u ON ((t.universe_id = u.id)))
  WHERE ((t.id = signals.target_id) AND prediction.user_has_org_access(u.organization_slug)))));


--
-- Name: signals signals_service_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY signals_service_policy ON prediction.signals TO service_role USING (true) WITH CHECK (true);


--
-- Name: snapshots; Type: ROW SECURITY; Schema: prediction; Owner: -
--

ALTER TABLE prediction.snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: snapshots snapshots_read_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY snapshots_read_policy ON prediction.snapshots FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((prediction.predictions p
     JOIN prediction.targets t ON ((p.target_id = t.id)))
     JOIN prediction.universes u ON ((t.universe_id = u.id)))
  WHERE ((p.id = snapshots.prediction_id) AND prediction.user_has_org_access(u.organization_slug)))));


--
-- Name: snapshots snapshots_service_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY snapshots_service_policy ON prediction.snapshots TO service_role USING (true) WITH CHECK (true);


--
-- Name: source_subscriptions; Type: ROW SECURITY; Schema: prediction; Owner: -
--

ALTER TABLE prediction.source_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: strategies; Type: ROW SECURITY; Schema: prediction; Owner: -
--

ALTER TABLE prediction.strategies ENABLE ROW LEVEL SECURITY;

--
-- Name: strategies strategies_read_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY strategies_read_policy ON prediction.strategies FOR SELECT TO authenticated USING (true);


--
-- Name: strategies strategies_service_write_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY strategies_service_write_policy ON prediction.strategies TO service_role USING (true) WITH CHECK (true);


--
-- Name: target_snapshots; Type: ROW SECURITY; Schema: prediction; Owner: -
--

ALTER TABLE prediction.target_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: target_snapshots target_snapshots_read_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY target_snapshots_read_policy ON prediction.target_snapshots FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (prediction.targets t
     JOIN prediction.universes u ON ((t.universe_id = u.id)))
  WHERE ((t.id = target_snapshots.target_id) AND prediction.user_has_org_access(u.organization_slug)))));


--
-- Name: target_snapshots target_snapshots_service_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY target_snapshots_service_policy ON prediction.target_snapshots TO service_role USING (true) WITH CHECK (true);


--
-- Name: targets; Type: ROW SECURITY; Schema: prediction; Owner: -
--

ALTER TABLE prediction.targets ENABLE ROW LEVEL SECURITY;

--
-- Name: targets targets_read_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY targets_read_policy ON prediction.targets FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM prediction.universes u
  WHERE ((u.id = targets.universe_id) AND prediction.user_has_org_access(u.organization_slug)))));


--
-- Name: targets targets_service_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY targets_service_policy ON prediction.targets TO service_role USING (true) WITH CHECK (true);


--
-- Name: targets targets_write_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY targets_write_policy ON prediction.targets TO authenticated USING ((EXISTS ( SELECT 1
   FROM prediction.universes u
  WHERE ((u.id = targets.universe_id) AND prediction.user_has_org_access(u.organization_slug))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM prediction.universes u
  WHERE ((u.id = targets.universe_id) AND prediction.user_has_org_access(u.organization_slug)))));


--
-- Name: test_scenarios; Type: ROW SECURITY; Schema: prediction; Owner: -
--

ALTER TABLE prediction.test_scenarios ENABLE ROW LEVEL SECURITY;

--
-- Name: test_scenarios test_scenarios_org_isolation; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY test_scenarios_org_isolation ON prediction.test_scenarios USING ((organization_slug = current_setting('app.current_org'::text, true)));


--
-- Name: tool_requests; Type: ROW SECURITY; Schema: prediction; Owner: -
--

ALTER TABLE prediction.tool_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: tool_requests tool_requests_read_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY tool_requests_read_policy ON prediction.tool_requests FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM prediction.universes u
  WHERE ((u.id = tool_requests.universe_id) AND prediction.user_has_org_access(u.organization_slug)))));


--
-- Name: tool_requests tool_requests_service_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY tool_requests_service_policy ON prediction.tool_requests TO service_role USING (true) WITH CHECK (true);


--
-- Name: tool_requests tool_requests_write_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY tool_requests_write_policy ON prediction.tool_requests TO authenticated USING ((EXISTS ( SELECT 1
   FROM prediction.universes u
  WHERE ((u.id = tool_requests.universe_id) AND prediction.user_has_org_access(u.organization_slug))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM prediction.universes u
  WHERE ((u.id = tool_requests.universe_id) AND prediction.user_has_org_access(u.organization_slug)))));


--
-- Name: universes; Type: ROW SECURITY; Schema: prediction; Owner: -
--

ALTER TABLE prediction.universes ENABLE ROW LEVEL SECURITY;

--
-- Name: universes universes_delete_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY universes_delete_policy ON prediction.universes FOR DELETE TO authenticated USING (prediction.user_has_org_access(organization_slug));


--
-- Name: universes universes_insert_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY universes_insert_policy ON prediction.universes FOR INSERT TO authenticated WITH CHECK (prediction.user_has_org_access(organization_slug));


--
-- Name: universes universes_read_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY universes_read_policy ON prediction.universes FOR SELECT TO authenticated USING (prediction.user_has_org_access(organization_slug));


--
-- Name: universes universes_service_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY universes_service_policy ON prediction.universes TO service_role USING (true) WITH CHECK (true);


--
-- Name: universes universes_update_policy; Type: POLICY; Schema: prediction; Owner: -
--

CREATE POLICY universes_update_policy ON prediction.universes FOR UPDATE TO authenticated USING (prediction.user_has_org_access(organization_slug)) WITH CHECK (prediction.user_has_org_access(organization_slug));


--
-- Name: team_members Admins can add team members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can add team members" ON public.team_members FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.team_members tm
  WHERE ((tm.team_id = tm.team_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['admin'::text, 'lead'::text]))))) OR (EXISTS ( SELECT 1
   FROM ((public.teams t
     JOIN authz.rbac_user_org_roles uor ON ((((uor.organization_slug)::text = t.org_slug) OR ((uor.organization_slug)::text = '*'::text))))
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((t.id = team_members.team_id) AND (t.org_slug IS NOT NULL) AND (uor.user_id = auth.uid()) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now()))))) OR (EXISTS ( SELECT 1
   FROM ((public.teams t
     JOIN authz.rbac_user_org_roles uor ON (true))
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((t.id = team_members.team_id) AND (t.org_slug IS NULL) AND (uor.user_id = auth.uid()) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now()))))) OR (EXISTS ( SELECT 1
   FROM public.teams t
  WHERE ((t.id = team_members.team_id) AND (t.created_by = auth.uid()))))));


--
-- Name: teams Admins can create teams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can create teams" ON public.teams FOR INSERT WITH CHECK ((((org_slug IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (authz.rbac_user_org_roles uor
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((uor.user_id = auth.uid()) AND (((uor.organization_slug)::text = teams.org_slug) OR ((uor.organization_slug)::text = '*'::text)) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now())))))) OR ((org_slug IS NULL) AND (EXISTS ( SELECT 1
   FROM (authz.rbac_user_org_roles uor
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((uor.user_id = auth.uid()) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now()))))))));


--
-- Name: teams Admins can delete teams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete teams" ON public.teams FOR DELETE USING (((created_by = auth.uid()) OR ((org_slug IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (authz.rbac_user_org_roles uor
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((uor.user_id = auth.uid()) AND (((uor.organization_slug)::text = teams.org_slug) OR ((uor.organization_slug)::text = '*'::text)) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now())))))) OR ((org_slug IS NULL) AND (EXISTS ( SELECT 1
   FROM (authz.rbac_user_org_roles uor
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((uor.user_id = auth.uid()) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now()))))))));


--
-- Name: team_members Admins can remove team members or self-remove; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can remove team members or self-remove" ON public.team_members FOR DELETE USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.team_members tm
  WHERE ((tm.team_id = tm.team_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['admin'::text, 'lead'::text]))))) OR (EXISTS ( SELECT 1
   FROM ((public.teams t
     JOIN authz.rbac_user_org_roles uor ON ((((uor.organization_slug)::text = t.org_slug) OR ((uor.organization_slug)::text = '*'::text))))
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((t.id = team_members.team_id) AND (t.org_slug IS NOT NULL) AND (uor.user_id = auth.uid()) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now()))))) OR (EXISTS ( SELECT 1
   FROM ((public.teams t
     JOIN authz.rbac_user_org_roles uor ON (true))
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((t.id = team_members.team_id) AND (t.org_slug IS NULL) AND (uor.user_id = auth.uid()) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now()))))) OR (EXISTS ( SELECT 1
   FROM public.teams t
  WHERE ((t.id = team_members.team_id) AND (t.created_by = auth.uid()))))));


--
-- Name: team_members Admins can update team members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update team members" ON public.team_members FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM public.team_members tm
  WHERE ((tm.team_id = tm.team_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['admin'::text, 'lead'::text]))))) OR (EXISTS ( SELECT 1
   FROM ((public.teams t
     JOIN authz.rbac_user_org_roles uor ON ((((uor.organization_slug)::text = t.org_slug) OR ((uor.organization_slug)::text = '*'::text))))
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((t.id = team_members.team_id) AND (t.org_slug IS NOT NULL) AND (uor.user_id = auth.uid()) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now()))))) OR (EXISTS ( SELECT 1
   FROM ((public.teams t
     JOIN authz.rbac_user_org_roles uor ON (true))
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((t.id = team_members.team_id) AND (t.org_slug IS NULL) AND (uor.user_id = auth.uid()) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now()))))) OR (EXISTS ( SELECT 1
   FROM public.teams t
  WHERE ((t.id = team_members.team_id) AND (t.created_by = auth.uid()))))));


--
-- Name: teams Admins can update teams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update teams" ON public.teams FOR UPDATE USING (((created_by = auth.uid()) OR ((org_slug IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (authz.rbac_user_org_roles uor
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((uor.user_id = auth.uid()) AND (((uor.organization_slug)::text = teams.org_slug) OR ((uor.organization_slug)::text = '*'::text)) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now())))))) OR ((org_slug IS NULL) AND (EXISTS ( SELECT 1
   FROM (authz.rbac_user_org_roles uor
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((uor.user_id = auth.uid()) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now()))))))));


--
-- Name: channel_message_log Service role full access to channel_message_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access to channel_message_log" ON public.channel_message_log USING ((auth.role() = 'service_role'::text));


--
-- Name: channel_users Service role full access to channel_users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access to channel_users" ON public.channel_users USING ((auth.role() = 'service_role'::text));


--
-- Name: agents Users can read agents in their organizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read agents in their organizations" ON public.agents FOR SELECT USING (true);


--
-- Name: organizations Users can read their organizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read their organizations" ON public.organizations FOR SELECT USING (true);


--
-- Name: teams Users can view accessible teams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view accessible teams" ON public.teams FOR SELECT USING (((id IN ( SELECT team_members.team_id
   FROM public.team_members
  WHERE (team_members.user_id = auth.uid()))) OR ((org_slug IS NOT NULL) AND (org_slug IN ( SELECT rbac_user_org_roles.organization_slug
   FROM authz.rbac_user_org_roles
  WHERE ((rbac_user_org_roles.user_id = auth.uid()) AND ((rbac_user_org_roles.expires_at IS NULL) OR (rbac_user_org_roles.expires_at > now())))))) OR (EXISTS ( SELECT 1
   FROM authz.rbac_user_org_roles
  WHERE ((rbac_user_org_roles.user_id = auth.uid()) AND ((rbac_user_org_roles.organization_slug)::text = '*'::text) AND ((rbac_user_org_roles.expires_at IS NULL) OR (rbac_user_org_roles.expires_at > now())))))));


--
-- Name: team_members Users can view team members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view team members" ON public.team_members FOR SELECT USING (((team_id IN ( SELECT tm.team_id
   FROM public.team_members tm
  WHERE (tm.user_id = auth.uid()))) OR (team_id IN ( SELECT t.id
   FROM public.teams t
  WHERE ((t.org_slug IS NOT NULL) AND (t.org_slug IN ( SELECT rbac_user_org_roles.organization_slug
           FROM authz.rbac_user_org_roles
          WHERE ((rbac_user_org_roles.user_id = auth.uid()) AND ((rbac_user_org_roles.expires_at IS NULL) OR (rbac_user_org_roles.expires_at > now())))))))) OR (EXISTS ( SELECT 1
   FROM authz.rbac_user_org_roles
  WHERE ((rbac_user_org_roles.user_id = auth.uid()) AND ((rbac_user_org_roles.organization_slug)::text = '*'::text) AND ((rbac_user_org_roles.expires_at IS NULL) OR (rbac_user_org_roles.expires_at > now())))))));


--
-- Name: channel_users Users can view their own channel identities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own channel identities" ON public.channel_users FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: agents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

--
-- Name: channel_message_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.channel_message_log ENABLE ROW LEVEL SECURITY;

--
-- Name: channel_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.channel_users ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: team_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

--
-- Name: teams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

--
-- Name: data_source_fetch_history; Type: ROW SECURITY; Schema: risk; Owner: -
--

ALTER TABLE risk.data_source_fetch_history ENABLE ROW LEVEL SECURITY;

--
-- Name: data_sources; Type: ROW SECURITY; Schema: risk; Owner: -
--

ALTER TABLE risk.data_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: data_sources data_sources_delete_policy; Type: POLICY; Schema: risk; Owner: -
--

CREATE POLICY data_sources_delete_policy ON risk.data_sources FOR DELETE USING ((EXISTS ( SELECT 1
   FROM risk.scopes s
  WHERE ((s.id = data_sources.scope_id) AND (s.organization_slug IN ( SELECT rbac_user_org_roles.organization_slug
           FROM authz.rbac_user_org_roles
          WHERE (rbac_user_org_roles.user_id = auth.uid())))))));


--
-- Name: data_sources data_sources_insert_policy; Type: POLICY; Schema: risk; Owner: -
--

CREATE POLICY data_sources_insert_policy ON risk.data_sources FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM risk.scopes s
  WHERE ((s.id = data_sources.scope_id) AND (s.organization_slug IN ( SELECT rbac_user_org_roles.organization_slug
           FROM authz.rbac_user_org_roles
          WHERE (rbac_user_org_roles.user_id = auth.uid())))))));


--
-- Name: data_sources data_sources_select_policy; Type: POLICY; Schema: risk; Owner: -
--

CREATE POLICY data_sources_select_policy ON risk.data_sources FOR SELECT USING ((EXISTS ( SELECT 1
   FROM risk.scopes s
  WHERE ((s.id = data_sources.scope_id) AND (s.organization_slug IN ( SELECT rbac_user_org_roles.organization_slug
           FROM authz.rbac_user_org_roles
          WHERE (rbac_user_org_roles.user_id = auth.uid())))))));


--
-- Name: data_sources data_sources_update_policy; Type: POLICY; Schema: risk; Owner: -
--

CREATE POLICY data_sources_update_policy ON risk.data_sources FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM risk.scopes s
  WHERE ((s.id = data_sources.scope_id) AND (s.organization_slug IN ( SELECT rbac_user_org_roles.organization_slug
           FROM authz.rbac_user_org_roles
          WHERE (rbac_user_org_roles.user_id = auth.uid())))))));


--
-- Name: data_source_fetch_history fetch_history_insert_policy; Type: POLICY; Schema: risk; Owner: -
--

CREATE POLICY fetch_history_insert_policy ON risk.data_source_fetch_history FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (risk.data_sources ds
     JOIN risk.scopes s ON ((s.id = ds.scope_id)))
  WHERE ((ds.id = data_source_fetch_history.data_source_id) AND (s.organization_slug IN ( SELECT rbac_user_org_roles.organization_slug
           FROM authz.rbac_user_org_roles
          WHERE (rbac_user_org_roles.user_id = auth.uid())))))));


--
-- Name: data_source_fetch_history fetch_history_select_policy; Type: POLICY; Schema: risk; Owner: -
--

CREATE POLICY fetch_history_select_policy ON risk.data_source_fetch_history FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (risk.data_sources ds
     JOIN risk.scopes s ON ((s.id = ds.scope_id)))
  WHERE ((ds.id = data_source_fetch_history.data_source_id) AND (s.organization_slug IN ( SELECT rbac_user_org_roles.organization_slug
           FROM authz.rbac_user_org_roles
          WHERE (rbac_user_org_roles.user_id = auth.uid())))))));


--
-- Name: source_subscriptions risk_source_subs_delete; Type: POLICY; Schema: risk; Owner: -
--

CREATE POLICY risk_source_subs_delete ON risk.source_subscriptions FOR DELETE USING ((scope_id IN ( SELECT scopes.id
   FROM risk.scopes
  WHERE (scopes.organization_slug = current_setting('app.current_org'::text, true)))));


--
-- Name: source_subscriptions risk_source_subs_insert; Type: POLICY; Schema: risk; Owner: -
--

CREATE POLICY risk_source_subs_insert ON risk.source_subscriptions FOR INSERT WITH CHECK ((scope_id IN ( SELECT scopes.id
   FROM risk.scopes
  WHERE (scopes.organization_slug = current_setting('app.current_org'::text, true)))));


--
-- Name: source_subscriptions risk_source_subs_read; Type: POLICY; Schema: risk; Owner: -
--

CREATE POLICY risk_source_subs_read ON risk.source_subscriptions FOR SELECT USING ((scope_id IN ( SELECT scopes.id
   FROM risk.scopes
  WHERE (scopes.organization_slug = current_setting('app.current_org'::text, true)))));


--
-- Name: source_subscriptions risk_source_subs_service_all; Type: POLICY; Schema: risk; Owner: -
--

CREATE POLICY risk_source_subs_service_all ON risk.source_subscriptions TO service_role USING (true) WITH CHECK (true);


--
-- Name: source_subscriptions risk_source_subs_update; Type: POLICY; Schema: risk; Owner: -
--

CREATE POLICY risk_source_subs_update ON risk.source_subscriptions FOR UPDATE USING ((scope_id IN ( SELECT scopes.id
   FROM risk.scopes
  WHERE (scopes.organization_slug = current_setting('app.current_org'::text, true)))));


--
-- Name: simulations; Type: ROW SECURITY; Schema: risk; Owner: -
--

ALTER TABLE risk.simulations ENABLE ROW LEVEL SECURITY;

--
-- Name: simulations simulations_delete_policy; Type: POLICY; Schema: risk; Owner: -
--

CREATE POLICY simulations_delete_policy ON risk.simulations FOR DELETE USING ((EXISTS ( SELECT 1
   FROM risk.scopes s
  WHERE ((s.id = simulations.scope_id) AND (s.organization_slug IN ( SELECT rbac_user_org_roles.organization_slug
           FROM authz.rbac_user_org_roles
          WHERE (rbac_user_org_roles.user_id = auth.uid())))))));


--
-- Name: simulations simulations_insert_policy; Type: POLICY; Schema: risk; Owner: -
--

CREATE POLICY simulations_insert_policy ON risk.simulations FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM risk.scopes s
  WHERE ((s.id = simulations.scope_id) AND (s.organization_slug IN ( SELECT rbac_user_org_roles.organization_slug
           FROM authz.rbac_user_org_roles
          WHERE (rbac_user_org_roles.user_id = auth.uid())))))));


--
-- Name: simulations simulations_select_policy; Type: POLICY; Schema: risk; Owner: -
--

CREATE POLICY simulations_select_policy ON risk.simulations FOR SELECT USING ((EXISTS ( SELECT 1
   FROM risk.scopes s
  WHERE ((s.id = simulations.scope_id) AND (s.organization_slug IN ( SELECT rbac_user_org_roles.organization_slug
           FROM authz.rbac_user_org_roles
          WHERE (rbac_user_org_roles.user_id = auth.uid())))))));


--
-- Name: simulations simulations_update_policy; Type: POLICY; Schema: risk; Owner: -
--

CREATE POLICY simulations_update_policy ON risk.simulations FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM risk.scopes s
  WHERE ((s.id = simulations.scope_id) AND (s.organization_slug IN ( SELECT rbac_user_org_roles.organization_slug
           FROM authz.rbac_user_org_roles
          WHERE (rbac_user_org_roles.user_id = auth.uid())))))));


--
-- Name: source_subscriptions; Type: ROW SECURITY; Schema: risk; Owner: -
--

ALTER TABLE risk.source_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


