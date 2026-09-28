-- The app schema of a fresh database (scripts/baseline/generate.sh from the Studio).
CREATE SCHEMA IF NOT EXISTS rag_data;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA rag_data;
--
-- PostgreSQL database dump
--



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: ambient; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS ambient;


ALTER SCHEMA ambient OWNER TO postgres;

--
-- Name: authz; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS authz;


ALTER SCHEMA authz OWNER TO postgres;

--
-- Name: building; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS building;


ALTER SCHEMA building OWNER TO postgres;

--
-- Name: code_ops; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA IF NOT EXISTS code_ops;


ALTER SCHEMA code_ops OWNER TO supabase_admin;

--
-- Name: company; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS company;


ALTER SCHEMA company OWNER TO postgres;

--
-- Name: crawler; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS crawler;


ALTER SCHEMA crawler OWNER TO postgres;

--
-- Name: engineering; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS engineering;


ALTER SCHEMA engineering OWNER TO postgres;

--
-- Name: finance; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS finance;


ALTER SCHEMA finance OWNER TO postgres;

--
-- Name: gatehouse; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS gatehouse;


ALTER SCHEMA gatehouse OWNER TO postgres;

--
-- Name: guardhouse; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS guardhouse;


ALTER SCHEMA guardhouse OWNER TO postgres;

--
-- Name: hr; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS hr;


ALTER SCHEMA hr OWNER TO postgres;

--
-- Name: law; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA IF NOT EXISTS law;


ALTER SCHEMA law OWNER TO supabase_admin;

--
-- Name: leads; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA IF NOT EXISTS leads;


ALTER SCHEMA leads OWNER TO supabase_admin;

--
-- Name: legal; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS legal;


ALTER SCHEMA legal OWNER TO postgres;

--
-- Name: marketing; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS marketing;


ALTER SCHEMA marketing OWNER TO postgres;

--
-- Name: orch_flow; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS orch_flow;


ALTER SCHEMA orch_flow OWNER TO postgres;

--
-- Name: prediction; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS prediction;


ALTER SCHEMA prediction OWNER TO postgres;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA IF NOT EXISTS public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- Name: rag_data; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS rag_data;


ALTER SCHEMA rag_data OWNER TO postgres;

--
-- Name: risk; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS risk;


ALTER SCHEMA risk OWNER TO postgres;

--
-- Name: sentinel; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS sentinel;


ALTER SCHEMA sentinel OWNER TO postgres;

--
-- Name: substrate; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS substrate;


ALTER SCHEMA substrate OWNER TO postgres;

--
-- Name: workflows; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS workflows;


ALTER SCHEMA workflows OWNER TO postgres;

--
-- Name: memory_audit_action; Type: TYPE; Schema: legal; Owner: postgres
--

CREATE TYPE legal.memory_audit_action AS ENUM (
    'created',
    'updated',
    'deleted',
    'reviewed',
    'seeded'
);


ALTER TYPE legal.memory_audit_action OWNER TO postgres;

--
-- Name: memory_entity_type; Type: TYPE; Schema: legal; Owner: postgres
--

CREATE TYPE legal.memory_entity_type AS ENUM (
    'RiskPolicy',
    'StyleGuide',
    'JurisdictionDefault',
    'MissionStatement',
    'BrandVoice',
    'ApprovedCounterparty',
    'UserCommunicationPreference'
);


ALTER TYPE legal.memory_entity_type OWNER TO postgres;

--
-- Name: memory_org_scope_type; Type: TYPE; Schema: legal; Owner: postgres
--

CREATE TYPE legal.memory_org_scope_type AS ENUM (
    'company',
    'org'
);


ALTER TYPE legal.memory_org_scope_type OWNER TO postgres;

--
-- Name: memory_practice_area; Type: TYPE; Schema: legal; Owner: postgres
--

CREATE TYPE legal.memory_practice_area AS ENUM (
    'contract',
    'compliance',
    'corporate',
    'employment',
    'ip',
    'litigation',
    'privacy',
    'real_estate'
);


ALTER TYPE legal.memory_practice_area OWNER TO postgres;

--
-- Name: memory_tier; Type: TYPE; Schema: legal; Owner: postgres
--

CREATE TYPE legal.memory_tier AS ENUM (
    'hot',
    'warm',
    'cold'
);


ALTER TYPE legal.memory_tier OWNER TO postgres;

--
-- Name: task_status; Type: TYPE; Schema: orch_flow; Owner: postgres
--

CREATE TYPE orch_flow.task_status AS ENUM (
    'projects',
    'this_week',
    'today',
    'in_progress',
    'done'
);


ALTER TYPE orch_flow.task_status OWNER TO postgres;

--
-- Name: capture_database_change(); Type: FUNCTION; Schema: ambient; Owner: postgres
--

CREATE FUNCTION ambient.capture_database_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'ambient'
    AS $$
DECLARE
  change_id BIGINT;
BEGIN
  INSERT INTO ambient.database_change_events (
    schema_name,
    table_name,
    event_type,
    new_record,
    old_record
  )
  VALUES (
    TG_TABLE_SCHEMA,
    TG_TABLE_NAME,
    TG_OP,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN TO_JSONB(NEW) ELSE NULL END,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN TO_JSONB(OLD) ELSE NULL END
  )
  RETURNING id INTO change_id;
  PERFORM pg_notify('orchestratorai_database_changes', change_id::TEXT);
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION ambient.capture_database_change() OWNER TO postgres;

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: ambient; Owner: supabase_admin
--

CREATE FUNCTION ambient.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION ambient.set_updated_at() OWNER TO supabase_admin;

--
-- Name: rbac_get_organization_users(character varying); Type: FUNCTION; Schema: authz; Owner: postgres
--

CREATE FUNCTION authz.rbac_get_organization_users(p_organization_slug character varying) RETURNS TABLE(user_id uuid, email character varying, display_name character varying, role_id uuid, role_name character varying, role_display_name character varying, is_global boolean, assigned_at timestamp with time zone, expires_at timestamp with time zone)
    LANGUAGE sql STABLE
    SET search_path TO 'authz', 'public'
    AS $$
  SELECT
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
  JOIN authz.users u ON u.id = uor.user_id
  JOIN authz.rbac_roles r ON r.id = uor.role_id
  WHERE (uor.organization_slug = p_organization_slug OR uor.organization_slug = '*')
    AND (uor.expires_at IS NULL OR uor.expires_at > now())
    AND u.status = 'active'
  ORDER BY u.email, is_global DESC, r.name;
$$;


ALTER FUNCTION authz.rbac_get_organization_users(p_organization_slug character varying) OWNER TO postgres;

--
-- Name: rbac_get_user_organizations(uuid); Type: FUNCTION; Schema: authz; Owner: postgres
--

CREATE FUNCTION authz.rbac_get_user_organizations(p_user_id uuid) RETURNS TABLE(organization_slug character varying, organization_name character varying, role_name character varying, is_global boolean)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_has_global BOOLEAN;
    v_global_role VARCHAR(50);
BEGIN
    SELECT EXISTS(
        SELECT 1
        FROM authz.rbac_user_org_roles uor
        WHERE uor.user_id = p_user_id
          AND uor.organization_slug = '*'
          AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    ) INTO v_has_global;

    IF v_has_global THEN
        SELECT r.name INTO v_global_role
        FROM authz.rbac_user_org_roles uor
        JOIN authz.rbac_roles r ON uor.role_id = r.id
        WHERE uor.user_id = p_user_id
          AND uor.organization_slug = '*'
          AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
        LIMIT 1;
    END IF;

    RETURN QUERY
    SELECT DISTINCT
        (CASE WHEN v_has_global THEN o.slug ELSE uor.organization_slug END)::VARCHAR(255),
        o.name::VARCHAR(255),
        (CASE WHEN v_has_global THEN v_global_role ELSE r.name END)::VARCHAR(50),
        v_has_global
    FROM authz.organizations o
    LEFT JOIN authz.rbac_user_org_roles uor
      ON uor.organization_slug = o.slug AND uor.user_id = p_user_id
    LEFT JOIN authz.rbac_roles r ON uor.role_id = r.id
    WHERE v_has_global
       OR (uor.user_id = p_user_id AND (uor.expires_at IS NULL OR uor.expires_at > NOW()))
    ORDER BY 1;
END;
$$;


ALTER FUNCTION authz.rbac_get_user_organizations(p_user_id uuid) OWNER TO postgres;

--
-- Name: rbac_get_user_permissions(uuid, character varying); Type: FUNCTION; Schema: authz; Owner: postgres
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


ALTER FUNCTION authz.rbac_get_user_permissions(p_user_id uuid, p_organization_slug character varying) OWNER TO postgres;

--
-- Name: rbac_get_user_roles(uuid, character varying); Type: FUNCTION; Schema: authz; Owner: postgres
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


ALTER FUNCTION authz.rbac_get_user_roles(p_user_id uuid, p_organization_slug character varying) OWNER TO postgres;

--
-- Name: rbac_has_permission(uuid, character varying, character varying, character varying, uuid); Type: FUNCTION; Schema: authz; Owner: postgres
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


ALTER FUNCTION authz.rbac_has_permission(p_user_id uuid, p_organization_slug character varying, p_permission character varying, p_resource_type character varying, p_resource_id uuid) OWNER TO postgres;

--
-- Name: update_rbac_roles_updated_at(); Type: FUNCTION; Schema: authz; Owner: postgres
--

CREATE FUNCTION authz.update_rbac_roles_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION authz.update_rbac_roles_updated_at() OWNER TO postgres;

--
-- Name: update_users_updated_at(); Type: FUNCTION; Schema: authz; Owner: postgres
--

CREATE FUNCTION authz.update_users_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION authz.update_users_updated_at() OWNER TO postgres;

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: company; Owner: postgres
--

CREATE FUNCTION company.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION company.set_updated_at() OWNER TO postgres;

--
-- Name: calculate_total_duplicates(integer, integer, integer, integer); Type: FUNCTION; Schema: crawler; Owner: postgres
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


ALTER FUNCTION crawler.calculate_total_duplicates(p_exact integer, p_cross_source integer, p_fuzzy_title integer, p_phrase_overlap integer) OWNER TO postgres;

--
-- Name: check_content_hash_exists(text, text, uuid); Type: FUNCTION; Schema: crawler; Owner: postgres
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


ALTER FUNCTION crawler.check_content_hash_exists(p_organization_slug text, p_content_hash text, p_exclude_source_id uuid) OWNER TO postgres;

--
-- Name: find_articles_by_phrase_overlap(text, text[], integer, integer); Type: FUNCTION; Schema: crawler; Owner: postgres
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


ALTER FUNCTION crawler.find_articles_by_phrase_overlap(p_organization_slug text, p_key_phrases text[], p_hours_back integer, p_limit integer) OWNER TO postgres;

--
-- Name: find_or_create_source(text, text, text, text, text, jsonb, jsonb, integer); Type: FUNCTION; Schema: crawler; Owner: postgres
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


ALTER FUNCTION crawler.find_or_create_source(p_organization_slug text, p_url text, p_name text, p_source_type text, p_description text, p_crawl_config jsonb, p_auth_config jsonb, p_crawl_frequency_minutes integer) OWNER TO postgres;

--
-- Name: find_recent_article_fingerprints(text, integer, integer); Type: FUNCTION; Schema: crawler; Owner: postgres
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


ALTER FUNCTION crawler.find_recent_article_fingerprints(p_organization_slug text, p_hours_back integer, p_limit integer) OWNER TO postgres;

--
-- Name: get_crawl_stats_by_source(text, integer); Type: FUNCTION; Schema: crawler; Owner: postgres
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


ALTER FUNCTION crawler.get_crawl_stats_by_source(p_organization_slug text, p_days integer) OWNER TO postgres;

--
-- Name: get_source_article_counts(text); Type: FUNCTION; Schema: crawler; Owner: postgres
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


ALTER FUNCTION crawler.get_source_article_counts(p_organization_slug text) OWNER TO postgres;

--
-- Name: get_sources_due_for_crawl(integer); Type: FUNCTION; Schema: crawler; Owner: postgres
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


ALTER FUNCTION crawler.get_sources_due_for_crawl(p_frequency_minutes integer) OWNER TO postgres;

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: crawler; Owner: postgres
--

CREATE FUNCTION crawler.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION crawler.set_updated_at() OWNER TO postgres;

--
-- Name: get_drawing_progress(uuid); Type: FUNCTION; Schema: engineering; Owner: postgres
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


ALTER FUNCTION engineering.get_drawing_progress(p_drawing_id uuid) OWNER TO postgres;

--
-- Name: get_effective_constraints(uuid); Type: FUNCTION; Schema: engineering; Owner: postgres
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


ALTER FUNCTION engineering.get_effective_constraints(p_drawing_id uuid) OWNER TO postgres;

--
-- Name: get_user_team_ids(uuid); Type: FUNCTION; Schema: orch_flow; Owner: postgres
--

CREATE FUNCTION orch_flow.get_user_team_ids(_user_id uuid) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'orch_flow'
    AS $$
  SELECT team_id
  FROM orch_flow.team_members
  WHERE user_id = _user_id
$$;


ALTER FUNCTION orch_flow.get_user_team_ids(_user_id uuid) OWNER TO postgres;

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: orch_flow; Owner: postgres
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


ALTER FUNCTION orch_flow.handle_new_user() OWNER TO postgres;

--
-- Name: is_team_member(uuid, uuid); Type: FUNCTION; Schema: orch_flow; Owner: postgres
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


ALTER FUNCTION orch_flow.is_team_member(_user_id uuid, _team_id uuid) OWNER TO postgres;

--
-- Name: set_team_files_updated_at(); Type: FUNCTION; Schema: orch_flow; Owner: postgres
--

CREATE FUNCTION orch_flow.set_team_files_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION orch_flow.set_team_files_updated_at() OWNER TO postgres;

--
-- Name: auto_create_test_mirror(); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.auto_create_test_mirror() OWNER TO postgres;

--
-- Name: calculate_position_pnl(text, numeric, numeric, numeric); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.calculate_position_pnl(p_direction text, p_entry_price numeric, p_current_price numeric, p_quantity numeric) OWNER TO postgres;

--
-- Name: cleanup_all_test_data(); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.cleanup_all_test_data() OWNER TO postgres;

--
-- Name: cleanup_replay_test(uuid); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.cleanup_replay_test(p_replay_test_id uuid) OWNER TO postgres;

--
-- Name: cleanup_test_scenario(uuid); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.cleanup_test_scenario(p_scenario_id uuid) OWNER TO postgres;

--
-- Name: create_analyst_context_version(uuid, text, text, jsonb, numeric, text, text, text); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.create_analyst_context_version(p_analyst_id uuid, p_fork_type text, p_perspective text, p_tier_instructions jsonb, p_default_weight numeric, p_agent_journal text, p_change_reason text, p_changed_by text) OWNER TO postgres;

--
-- Name: create_replay_snapshot(uuid, text, uuid[]); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.create_replay_snapshot(p_replay_test_id uuid, p_table_name text, p_record_ids uuid[]) OWNER TO postgres;

--
-- Name: enforce_prediction_direction(); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.enforce_prediction_direction() OWNER TO postgres;

--
-- Name: enforce_predictor_direction(); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.enforce_predictor_direction() OWNER TO postgres;

--
-- Name: enforce_predictor_is_test(); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.enforce_predictor_is_test() OWNER TO postgres;

--
-- Name: enforce_signal_direction(); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.enforce_signal_direction() OWNER TO postgres;

--
-- Name: enforce_signal_is_test(); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.enforce_signal_is_test() OWNER TO postgres;

--
-- Name: enforce_target_domain_type(); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.enforce_target_domain_type() OWNER TO postgres;

--
-- Name: enforce_test_target_isolation(); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.enforce_test_target_isolation() OWNER TO postgres;

--
-- Name: get_active_analysts(uuid, text); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.get_active_analysts(p_target_id uuid, p_tier text) OWNER TO postgres;

--
-- Name: get_active_learnings(uuid, text, uuid); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.get_active_learnings(p_target_id uuid, p_tier text, p_analyst_id uuid) OWNER TO postgres;

--
-- Name: get_analyst_effective_settings(uuid, uuid, text); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.get_analyst_effective_settings(p_analyst_id uuid, p_target_id uuid, p_tier text) OWNER TO postgres;

--
-- Name: get_context_for_target(uuid); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.get_context_for_target(p_target_id uuid) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: analyst_context_versions; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.analyst_context_versions OWNER TO postgres;

--
-- Name: get_current_analyst_context(uuid, text); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.get_current_analyst_context(p_analyst_id uuid, p_fork_type text) OWNER TO postgres;

--
-- Name: get_default_model_for_tier(text, text); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.get_default_model_for_tier(p_tier text, p_provider text) OWNER TO postgres;

--
-- Name: get_models_for_tier(text, text); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.get_models_for_tier(p_tier text, p_provider text) OWNER TO postgres;

--
-- Name: get_new_articles_for_subscription(uuid, integer); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.get_new_articles_for_subscription(p_subscription_id uuid, p_limit integer) OWNER TO postgres;

--
-- Name: get_new_articles_for_target(uuid, integer); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.get_new_articles_for_target(p_target_id uuid, p_limit integer) OWNER TO postgres;

--
-- Name: get_personality_analysts(); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.get_personality_analysts() OWNER TO postgres;

--
-- Name: get_records_for_replay(text, timestamp with time zone, uuid, uuid[]); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.get_records_for_replay(p_rollback_depth text, p_rollback_to timestamp with time zone, p_universe_id uuid, p_target_ids uuid[]) OWNER TO postgres;

--
-- Name: increment_learning_application(uuid, boolean); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.increment_learning_application(p_learning_id uuid, p_was_helpful boolean) OWNER TO postgres;

--
-- Name: log_test_audit(text, uuid, text, text, uuid, jsonb); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.log_test_audit(p_organization_slug text, p_user_id uuid, p_action text, p_resource_type text, p_resource_id uuid, p_details jsonb) OWNER TO postgres;

--
-- Name: map_sentiment_to_outcome(text, text); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.map_sentiment_to_outcome(p_sentiment text, p_domain text) OWNER TO postgres;

--
-- Name: restore_replay_snapshot(uuid); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.restore_replay_snapshot(p_snapshot_id uuid) OWNER TO postgres;

--
-- Name: set_test_scenarios_updated_at(); Type: FUNCTION; Schema: prediction; Owner: postgres
--

CREATE FUNCTION prediction.set_test_scenarios_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION prediction.set_test_scenarios_updated_at() OWNER TO postgres;

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: prediction; Owner: postgres
--

CREATE FUNCTION prediction.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION prediction.set_updated_at() OWNER TO postgres;

--
-- Name: update_analyst_portfolio_status(); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.update_analyst_portfolio_status() OWNER TO postgres;

--
-- Name: update_daily_postmortem_recommendations_timestamp(); Type: FUNCTION; Schema: prediction; Owner: postgres
--

CREATE FUNCTION prediction.update_daily_postmortem_recommendations_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION prediction.update_daily_postmortem_recommendations_timestamp() OWNER TO postgres;

--
-- Name: update_daily_postmortem_runs_timestamp(); Type: FUNCTION; Schema: prediction; Owner: postgres
--

CREATE FUNCTION prediction.update_daily_postmortem_runs_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION prediction.update_daily_postmortem_runs_timestamp() OWNER TO postgres;

--
-- Name: update_subscription_watermark(uuid, timestamp with time zone); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.update_subscription_watermark(p_subscription_id uuid, p_last_processed_at timestamp with time zone) OWNER TO postgres;

--
-- Name: user_has_org_access(text); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.user_has_org_access(p_org_slug text) OWNER TO postgres;

--
-- Name: validate_learning_lineage(); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.validate_learning_lineage() OWNER TO postgres;

--
-- Name: validate_prediction_direction(text, uuid); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.validate_prediction_direction(p_direction text, p_target_id uuid) OWNER TO postgres;

--
-- Name: validate_prediction_status_transition(); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.validate_prediction_status_transition() OWNER TO postgres;

--
-- Name: validate_signal_direction(text, uuid); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.validate_signal_direction(p_direction text, p_target_id uuid) OWNER TO postgres;

--
-- Name: validate_test_article_symbols(); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.validate_test_article_symbols() OWNER TO postgres;

--
-- Name: validate_test_target_symbols(); Type: FUNCTION; Schema: prediction; Owner: postgres
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


ALTER FUNCTION prediction.validate_test_target_symbols() OWNER TO postgres;

--
-- Name: cleanup_expired_pii_mappings(); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.cleanup_expired_pii_mappings() OWNER TO postgres;

--
-- Name: decrypt_pii_value(bytea); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.decrypt_pii_value(ciphertext bytea) OWNER TO postgres;

--
-- Name: delete_user_pii_data(uuid); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.delete_user_pii_data(p_user_id uuid) OWNER TO postgres;

--
-- Name: encrypt_pii_value(text); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.encrypt_pii_value(plaintext text) OWNER TO postgres;

--
-- Name: extend_pii_expiration(uuid, integer); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.extend_pii_expiration(p_id uuid, p_extension_days integer) OWNER TO postgres;

--
-- Name: get_global_model_config(); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.get_global_model_config() OWNER TO postgres;

--
-- Name: get_team_member_count(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_team_member_count(p_team_id uuid) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
  SELECT COUNT(*)::INTEGER FROM public.team_members WHERE team_id = p_team_id;
$$;


ALTER FUNCTION public.get_team_member_count(p_team_id uuid) OWNER TO postgres;

--
-- Name: get_user_teams(uuid); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.get_user_teams(p_user_id uuid) OWNER TO postgres;

--
-- Name: rbac_get_organization_users(character varying); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.rbac_get_organization_users(p_organization_slug character varying) RETURNS TABLE(user_id uuid, email text, display_name text, role_id uuid, role_name character varying, role_display_name character varying, is_global boolean, assigned_at timestamp with time zone, expires_at timestamp with time zone)
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
    FROM rbac_user_org_roles uor
    JOIN public.users u ON uor.user_id = u.id
    JOIN rbac_roles r ON uor.role_id = r.id
    WHERE (uor.organization_slug = p_organization_slug OR uor.organization_slug = '*')
      AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    ORDER BY u.email, r.name;
$$;


ALTER FUNCTION public.rbac_get_organization_users(p_organization_slug character varying) OWNER TO postgres;

--
-- Name: rbac_get_user_organizations(uuid); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.rbac_get_user_organizations(p_user_id uuid) OWNER TO postgres;

--
-- Name: set_pseudonym_mappings_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_pseudonym_mappings_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.set_pseudonym_mappings_updated_at() OWNER TO postgres;

--
-- Name: set_teams_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_teams_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.set_teams_updated_at() OWNER TO postgres;

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.set_updated_at() OWNER TO postgres;

--
-- Name: update_auth_identity_links_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_auth_identity_links_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_auth_identity_links_updated_at() OWNER TO postgres;

--
-- Name: update_llm_models_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_llm_models_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_llm_models_updated_at() OWNER TO postgres;

--
-- Name: update_llm_providers_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_llm_providers_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_llm_providers_updated_at() OWNER TO postgres;

--
-- Name: update_redaction_patterns_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_redaction_patterns_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_redaction_patterns_updated_at() OWNER TO postgres;

--
-- Name: rag_chunks_recompute_parent_trigger(); Type: FUNCTION; Schema: rag_data; Owner: postgres
--

CREATE FUNCTION rag_data.rag_chunks_recompute_parent_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM rag_data.recompute_document_counters(OLD.document_id);
        RETURN OLD;
    END IF;

    PERFORM rag_data.recompute_document_counters(NEW.document_id);

    IF TG_OP = 'UPDATE' AND OLD.document_id IS DISTINCT FROM NEW.document_id THEN
        PERFORM rag_data.recompute_document_counters(OLD.document_id);
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION rag_data.rag_chunks_recompute_parent_trigger() OWNER TO postgres;

--
-- Name: rag_collections; Type: TABLE; Schema: rag_data; Owner: postgres
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
    complexity_type character varying(50) DEFAULT 'comprehensive'::character varying,
    collection_type text DEFAULT 'firm-curated'::text NOT NULL,
    source_workflow_slug text,
    CONSTRAINT rag_collections_collection_type_check CHECK ((collection_type = ANY (ARRAY['firm-curated'::text, 'workflow-output'::text]))),
    CONSTRAINT rag_collections_complexity_type_comprehensive_chk CHECK (((complexity_type)::text = 'comprehensive'::text)),
    CONSTRAINT rag_collections_workflow_slug_consistency CHECK ((((collection_type = 'workflow-output'::text) AND (source_workflow_slug IS NOT NULL)) OR ((collection_type = 'firm-curated'::text) AND (source_workflow_slug IS NULL))))
);


ALTER TABLE rag_data.rag_collections OWNER TO postgres;

--
-- Name: rag_create_collection(text, character varying, character varying, text, character varying, integer, integer, integer, uuid, text, uuid[]); Type: FUNCTION; Schema: rag_data; Owner: postgres
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


ALTER FUNCTION rag_data.rag_create_collection(p_organization_slug text, p_name character varying, p_slug character varying, p_description text, p_embedding_model character varying, p_embedding_dimensions integer, p_chunk_size integer, p_chunk_overlap integer, p_created_by uuid, p_required_role text, p_allowed_users uuid[]) OWNER TO postgres;

--
-- Name: rag_create_collection(text, character varying, character varying, text, character varying, integer, integer, integer, uuid, text, uuid[], character varying); Type: FUNCTION; Schema: rag_data; Owner: postgres
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


ALTER FUNCTION rag_data.rag_create_collection(p_organization_slug text, p_name character varying, p_slug character varying, p_description text, p_embedding_model character varying, p_embedding_dimensions integer, p_chunk_size integer, p_chunk_overlap integer, p_created_by uuid, p_required_role text, p_allowed_users uuid[], p_complexity_type character varying) OWNER TO postgres;

--
-- Name: rag_delete_collection(uuid, text); Type: FUNCTION; Schema: rag_data; Owner: postgres
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


ALTER FUNCTION rag_data.rag_delete_collection(p_collection_id uuid, p_organization_slug text) OWNER TO postgres;

--
-- Name: rag_delete_document(uuid, text); Type: FUNCTION; Schema: rag_data; Owner: postgres
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


ALTER FUNCTION rag_data.rag_delete_document(p_document_id uuid, p_organization_slug text) OWNER TO postgres;

--
-- Name: rag_documents_recompute_parent_trigger(); Type: FUNCTION; Schema: rag_data; Owner: postgres
--

CREATE FUNCTION rag_data.rag_documents_recompute_parent_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM rag_data.recompute_collection_counters(OLD.collection_id);
        RETURN OLD;
    END IF;

    -- INSERT or UPDATE — always recompute the new parent. If an UPDATE
    -- moved a document between collections (rare but legal), recompute
    -- the old parent too so neither side drifts.
    PERFORM rag_data.recompute_collection_counters(NEW.collection_id);

    IF TG_OP = 'UPDATE' AND OLD.collection_id IS DISTINCT FROM NEW.collection_id THEN
        PERFORM rag_data.recompute_collection_counters(OLD.collection_id);
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION rag_data.rag_documents_recompute_parent_trigger() OWNER TO postgres;

--
-- Name: rag_get_collection(uuid, text); Type: FUNCTION; Schema: rag_data; Owner: postgres
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


ALTER FUNCTION rag_data.rag_get_collection(p_collection_id uuid, p_organization_slug text) OWNER TO postgres;

--
-- Name: rag_get_collection_by_slug(character varying, text); Type: FUNCTION; Schema: rag_data; Owner: postgres
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


ALTER FUNCTION rag_data.rag_get_collection_by_slug(p_collection_slug character varying, p_organization_slug text) OWNER TO postgres;

--
-- Name: rag_get_collections(text, uuid); Type: FUNCTION; Schema: rag_data; Owner: postgres
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


ALTER FUNCTION rag_data.rag_get_collections(p_organization_slug text, p_user_id uuid) OWNER TO postgres;

--
-- Name: rag_get_document(uuid, text); Type: FUNCTION; Schema: rag_data; Owner: postgres
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


ALTER FUNCTION rag_data.rag_get_document(p_document_id uuid, p_organization_slug text) OWNER TO postgres;

--
-- Name: rag_get_document_chunks(uuid, text); Type: FUNCTION; Schema: rag_data; Owner: postgres
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


ALTER FUNCTION rag_data.rag_get_document_chunks(p_document_id uuid, p_organization_slug text) OWNER TO postgres;

--
-- Name: rag_get_document_content(uuid, text); Type: FUNCTION; Schema: rag_data; Owner: postgres
--

CREATE FUNCTION rag_data.rag_get_document_content(p_document_id uuid, p_organization_slug text) RETURNS TABLE(id uuid, filename character varying, file_type character varying, content text, chunk_count integer)
    LANGUAGE sql STABLE
    AS $$
    SELECT d.id, d.filename, d.file_type, d.content, d.chunk_count
    FROM rag_data.rag_documents d
    WHERE d.id = p_document_id
      AND d.organization_slug = p_organization_slug;
$$;


ALTER FUNCTION rag_data.rag_get_document_content(p_document_id uuid, p_organization_slug text) OWNER TO postgres;

--
-- Name: rag_get_documents(uuid, text); Type: FUNCTION; Schema: rag_data; Owner: postgres
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


ALTER FUNCTION rag_data.rag_get_documents(p_collection_id uuid, p_organization_slug text) OWNER TO postgres;

--
-- Name: rag_insert_chunks(uuid, text, jsonb); Type: FUNCTION; Schema: rag_data; Owner: postgres
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
    SELECT d.collection_id INTO v_collection_id
    FROM rag_data.rag_documents d
    JOIN rag_data.rag_collections c ON d.collection_id = c.id
    WHERE d.id = p_document_id
      AND c.organization_slug = p_organization_slug;

    IF v_collection_id IS NULL THEN
        RETURN 0;
    END IF;

    FOR v_chunk IN SELECT * FROM jsonb_array_elements(p_chunks)
    LOOP
        INSERT INTO rag_data.rag_document_chunks (
            document_id, collection_id, organization_slug, content, chunk_index,
            embedding, token_count, page_number, char_offset, metadata,
            enrichment_version
        )
        VALUES (
            p_document_id,
            v_collection_id,
            p_organization_slug,
            v_chunk->>'content',
            (v_chunk->>'chunk_index')::INTEGER,
            CASE
                WHEN v_chunk ? 'embedding' AND v_chunk->>'embedding' IS NOT NULL
                THEN (v_chunk->>'embedding')::rag_data.vector
                ELSE NULL
            END,
            COALESCE((v_chunk->>'token_count')::INTEGER, 0),
            (v_chunk->>'page_number')::INTEGER,
            (v_chunk->>'char_offset')::INTEGER,
            COALESCE(v_chunk->'metadata', '{}'::JSONB),
            NULLIF(v_chunk->>'enrichment_version', '')
        );
        v_inserted := v_inserted + 1;
        v_total_tokens := v_total_tokens + COALESCE((v_chunk->>'token_count')::INTEGER, 0);
    END LOOP;

    UPDATE rag_data.rag_documents
    SET chunk_count = v_inserted,
        token_count = v_total_tokens,
        status = 'completed',
        processed_at = NOW()
    WHERE id = p_document_id;

    UPDATE rag_data.rag_collections
    SET chunk_count = chunk_count + v_inserted,
        document_count = document_count + 1,
        total_tokens = total_tokens + v_total_tokens,
        updated_at = NOW()
    WHERE id = v_collection_id;

    RETURN v_inserted;
END;
$$;


ALTER FUNCTION rag_data.rag_insert_chunks(p_document_id uuid, p_organization_slug text, p_chunks jsonb) OWNER TO postgres;

--
-- Name: rag_documents; Type: TABLE; Schema: rag_data; Owner: postgres
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


ALTER TABLE rag_data.rag_documents OWNER TO postgres;

--
-- Name: rag_insert_document(uuid, text, character varying, character varying, integer, character varying, text, uuid); Type: FUNCTION; Schema: rag_data; Owner: postgres
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


ALTER FUNCTION rag_data.rag_insert_document(p_collection_id uuid, p_organization_slug text, p_filename character varying, p_file_type character varying, p_file_size integer, p_file_hash character varying, p_storage_path text, p_created_by uuid) OWNER TO postgres;

--
-- Name: rag_insert_document(uuid, text, character varying, character varying, integer, character varying, text, uuid, text); Type: FUNCTION; Schema: rag_data; Owner: postgres
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


ALTER FUNCTION rag_data.rag_insert_document(p_collection_id uuid, p_organization_slug text, p_filename character varying, p_file_type character varying, p_file_size integer, p_file_hash character varying, p_storage_path text, p_created_by uuid, p_content text) OWNER TO postgres;

--
-- Name: rag_search(uuid, text, rag_data.vector, integer, double precision); Type: FUNCTION; Schema: rag_data; Owner: supabase_admin
--

CREATE FUNCTION rag_data.rag_search(p_collection_id uuid, p_organization_slug text, p_query_embedding rag_data.vector, p_top_k integer DEFAULT 5, p_similarity_threshold double precision DEFAULT 0.5) RETURNS TABLE(chunk_id uuid, document_id uuid, document_filename character varying, content text, score double precision, page_number integer, chunk_index integer, char_offset integer, metadata jsonb, enrichment_version text)
    LANGUAGE sql STABLE
    AS $$
    SELECT
        c.id AS chunk_id,
        c.document_id,
        d.filename AS document_filename,
        c.content,
        1 - (c.embedding OPERATOR(rag_data.<=>) p_query_embedding) AS score,
        c.page_number,
        c.chunk_index,
        c.char_offset,
        c.metadata,
        c.enrichment_version
    FROM rag_data.rag_document_chunks c
    JOIN rag_data.rag_documents d ON c.document_id = d.id
    JOIN rag_data.rag_collections col ON c.collection_id = col.id
    WHERE c.collection_id = p_collection_id
      AND col.organization_slug = p_organization_slug
      AND c.embedding IS NOT NULL
      AND 1 - (c.embedding OPERATOR(rag_data.<=>) p_query_embedding) >= p_similarity_threshold
    ORDER BY c.embedding OPERATOR(rag_data.<=>) p_query_embedding
    LIMIT p_top_k;
$$;


ALTER FUNCTION rag_data.rag_search(p_collection_id uuid, p_organization_slug text, p_query_embedding rag_data.vector, p_top_k integer, p_similarity_threshold double precision) OWNER TO supabase_admin;

--
-- Name: rag_update_collection(uuid, text, character varying, text, text, uuid[], boolean); Type: FUNCTION; Schema: rag_data; Owner: postgres
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


ALTER FUNCTION rag_data.rag_update_collection(p_collection_id uuid, p_organization_slug text, p_name character varying, p_description text, p_required_role text, p_allowed_users uuid[], p_clear_allowed_users boolean) OWNER TO postgres;

--
-- Name: rag_update_collection(uuid, text, character varying, text, text, uuid[], boolean, character varying); Type: FUNCTION; Schema: rag_data; Owner: postgres
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


ALTER FUNCTION rag_data.rag_update_collection(p_collection_id uuid, p_organization_slug text, p_name character varying, p_description text, p_required_role text, p_allowed_users uuid[], p_clear_allowed_users boolean, p_complexity_type character varying) OWNER TO postgres;

--
-- Name: rag_update_document_status(uuid, text, character varying, text, integer, integer); Type: FUNCTION; Schema: rag_data; Owner: postgres
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


ALTER FUNCTION rag_data.rag_update_document_status(p_document_id uuid, p_organization_slug text, p_status character varying, p_error_message text, p_chunk_count integer, p_token_count integer) OWNER TO postgres;

--
-- Name: rag_user_can_access_collection(uuid, uuid); Type: FUNCTION; Schema: rag_data; Owner: postgres
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


ALTER FUNCTION rag_data.rag_user_can_access_collection(p_collection_id uuid, p_user_id uuid) OWNER TO postgres;

--
-- Name: recompute_collection_counters(uuid); Type: FUNCTION; Schema: rag_data; Owner: postgres
--

CREATE FUNCTION rag_data.recompute_collection_counters(p_collection_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE rag_data.rag_collections c
    SET
        document_count = COALESCE(stats.docs, 0),
        chunk_count    = COALESCE(stats.chunks, 0),
        total_tokens   = COALESCE(stats.tokens, 0),
        updated_at     = NOW()
    FROM (
        SELECT
            COUNT(*)                       AS docs,
            COALESCE(SUM(chunk_count), 0)  AS chunks,
            COALESCE(SUM(token_count), 0)  AS tokens
        FROM rag_data.rag_documents
        WHERE collection_id = p_collection_id
    ) AS stats
    WHERE c.id = p_collection_id;
END;
$$;


ALTER FUNCTION rag_data.recompute_collection_counters(p_collection_id uuid) OWNER TO postgres;

--
-- Name: recompute_document_counters(uuid); Type: FUNCTION; Schema: rag_data; Owner: postgres
--

CREATE FUNCTION rag_data.recompute_document_counters(p_document_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE rag_data.rag_documents d
    SET
        chunk_count = COALESCE(stats.chunks, 0),
        token_count = COALESCE(stats.tokens, 0),
        updated_at = NOW()
    FROM (
        SELECT
            COUNT(*) AS chunks,
            COALESCE(SUM(token_count), 0) AS tokens
        FROM rag_data.rag_document_chunks
        WHERE document_id = p_document_id
    ) AS stats
    WHERE d.id = p_document_id;
END;
$$;


ALTER FUNCTION rag_data.recompute_document_counters(p_document_id uuid) OWNER TO postgres;

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: rag_data; Owner: postgres
--

CREATE FUNCTION rag_data.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION rag_data.set_updated_at() OWNER TO postgres;

--
-- Name: calculate_correlations(uuid); Type: FUNCTION; Schema: risk; Owner: postgres
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


ALTER FUNCTION risk.calculate_correlations(p_scope_id uuid) OWNER TO postgres;

--
-- Name: get_articles_for_dimension(uuid, text, timestamp with time zone, integer); Type: FUNCTION; Schema: risk; Owner: postgres
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


ALTER FUNCTION risk.get_articles_for_dimension(p_scope_id uuid, p_dimension_slug text, p_since timestamp with time zone, p_limit integer) OWNER TO postgres;

--
-- Name: get_articles_for_subject(uuid, text, timestamp with time zone, integer); Type: FUNCTION; Schema: risk; Owner: postgres
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


ALTER FUNCTION risk.get_articles_for_subject(p_scope_id uuid, p_subject_identifier text, p_since timestamp with time zone, p_limit integer) OWNER TO postgres;

--
-- Name: get_articles_for_subject_dimension(uuid, text, text, timestamp with time zone, integer); Type: FUNCTION; Schema: risk; Owner: postgres
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


ALTER FUNCTION risk.get_articles_for_subject_dimension(p_scope_id uuid, p_subject_identifier text, p_dimension_slug text, p_since timestamp with time zone, p_limit integer) OWNER TO postgres;

--
-- Name: get_classification_stats(uuid); Type: FUNCTION; Schema: risk; Owner: postgres
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


ALTER FUNCTION risk.get_classification_stats(p_scope_id uuid) OWNER TO postgres;

--
-- Name: get_heatmap_data(uuid, text); Type: FUNCTION; Schema: risk; Owner: postgres
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


ALTER FUNCTION risk.get_heatmap_data(p_scope_id uuid, p_risk_level text) OWNER TO postgres;

--
-- Name: get_new_articles_for_scope(uuid, integer); Type: FUNCTION; Schema: risk; Owner: postgres
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


ALTER FUNCTION risk.get_new_articles_for_scope(p_scope_id uuid, p_limit integer) OWNER TO postgres;

--
-- Name: get_new_articles_for_subscription(uuid, integer); Type: FUNCTION; Schema: risk; Owner: postgres
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


ALTER FUNCTION risk.get_new_articles_for_subscription(p_subscription_id uuid, p_limit integer) OWNER TO postgres;

--
-- Name: get_scope_score_history(uuid, integer); Type: FUNCTION; Schema: risk; Owner: postgres
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


ALTER FUNCTION risk.get_scope_score_history(p_scope_id uuid, p_days integer) OWNER TO postgres;

--
-- Name: get_score_history(uuid, integer, integer); Type: FUNCTION; Schema: risk; Owner: postgres
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


ALTER FUNCTION risk.get_score_history(p_subject_id uuid, p_days integer, p_limit integer) OWNER TO postgres;

--
-- Name: get_subject_coverage(uuid, timestamp with time zone); Type: FUNCTION; Schema: risk; Owner: postgres
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


ALTER FUNCTION risk.get_subject_coverage(p_scope_id uuid, p_since timestamp with time zone) OWNER TO postgres;

--
-- Name: get_unclassified_articles(uuid, integer); Type: FUNCTION; Schema: risk; Owner: postgres
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


ALTER FUNCTION risk.get_unclassified_articles(p_scope_id uuid, p_limit integer) OWNER TO postgres;

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: risk; Owner: postgres
--

CREATE FUNCTION risk.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION risk.set_updated_at() OWNER TO postgres;

--
-- Name: update_data_sources_updated_at(); Type: FUNCTION; Schema: risk; Owner: postgres
--

CREATE FUNCTION risk.update_data_sources_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION risk.update_data_sources_updated_at() OWNER TO postgres;

--
-- Name: update_executive_summaries_updated_at(); Type: FUNCTION; Schema: risk; Owner: postgres
--

CREATE FUNCTION risk.update_executive_summaries_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION risk.update_executive_summaries_updated_at() OWNER TO postgres;

--
-- Name: update_reports_updated_at(); Type: FUNCTION; Schema: risk; Owner: postgres
--

CREATE FUNCTION risk.update_reports_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION risk.update_reports_updated_at() OWNER TO postgres;

--
-- Name: update_scenarios_updated_at(); Type: FUNCTION; Schema: risk; Owner: postgres
--

CREATE FUNCTION risk.update_scenarios_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION risk.update_scenarios_updated_at() OWNER TO postgres;

--
-- Name: update_subscription_watermark(uuid, timestamp with time zone); Type: FUNCTION; Schema: risk; Owner: postgres
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


ALTER FUNCTION risk.update_subscription_watermark(p_subscription_id uuid, p_last_processed_at timestamp with time zone) OWNER TO postgres;

--
-- Name: validate_dimension_weights(); Type: FUNCTION; Schema: risk; Owner: postgres
--

CREATE FUNCTION risk.validate_dimension_weights() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  offenders TEXT;
BEGIN
  SELECT string_agg(format('%s [%s] sums to %s', s.name, s.organization_slug, t.total), '; ' ORDER BY s.name)
    INTO offenders
    FROM (
      SELECT scope_id, SUM(weight) AS total
        FROM risk.dimensions
       WHERE is_active = true
       GROUP BY scope_id
      HAVING SUM(weight) < 0.99 OR SUM(weight) > 1.01
    ) t
    JOIN risk.scopes s ON s.id = t.scope_id;

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION
      'Active dimension weights must sum to 1.0 within each scope. Offending: %',
      offenders;
  END IF;

  RETURN NULL;  -- statement-level trigger
END;
$$;


ALTER FUNCTION risk.validate_dimension_weights() OWNER TO postgres;

--
-- Name: archive_agent_definition(); Type: FUNCTION; Schema: workflows; Owner: postgres
--

CREATE FUNCTION workflows.archive_agent_definition() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF (OLD.name, OLD.description, OLD.instructions, OLD.model_role, OLD.output_format,
      OLD.input_schema, OLD.output_schema, OLD.max_tokens, OLD.enabled)
     IS DISTINCT FROM
     (NEW.name, NEW.description, NEW.instructions, NEW.model_role, NEW.output_format,
      NEW.input_schema, NEW.output_schema, NEW.max_tokens, NEW.enabled) THEN
    INSERT INTO workflows.agent_definition_versions
      (agent_slug, version, name, description, instructions, model_role, output_format,
       input_schema, output_schema, max_tokens, enabled, updated_by)
    VALUES
      (OLD.slug, OLD.version, OLD.name, OLD.description, OLD.instructions, OLD.model_role,
       OLD.output_format, OLD.input_schema, OLD.output_schema, OLD.max_tokens, OLD.enabled,
       OLD.updated_by);
    NEW.version := OLD.version + 1;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION workflows.archive_agent_definition() OWNER TO postgres;

--
-- Name: a2a_inbound_nonces; Type: TABLE; Schema: ambient; Owner: postgres
--

CREATE TABLE ambient.a2a_inbound_nonces (
    nonce text NOT NULL,
    sender_id text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE ambient.a2a_inbound_nonces OWNER TO postgres;

--
-- Name: a2a_messages; Type: TABLE; Schema: ambient; Owner: postgres
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
    status text NOT NULL,
    rejection_reason text,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE ambient.a2a_messages OWNER TO postgres;

--
-- Name: adapter_state; Type: TABLE; Schema: ambient; Owner: postgres
--

CREATE TABLE ambient.adapter_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trigger_id uuid NOT NULL,
    adapter_type text NOT NULL,
    state jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE ambient.adapter_state OWNER TO postgres;

--
-- Name: database_change_events; Type: TABLE; Schema: ambient; Owner: postgres
--

CREATE TABLE ambient.database_change_events (
    id bigint NOT NULL,
    schema_name text NOT NULL,
    table_name text NOT NULL,
    event_type text NOT NULL,
    new_record jsonb,
    old_record jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT database_change_events_event_type_check CHECK ((event_type = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
);


ALTER TABLE ambient.database_change_events OWNER TO postgres;

--
-- Name: database_change_events_id_seq; Type: SEQUENCE; Schema: ambient; Owner: postgres
--

ALTER TABLE ambient.database_change_events ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME ambient.database_change_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: events; Type: TABLE; Schema: ambient; Owner: postgres
--

CREATE TABLE ambient.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    name text NOT NULL,
    source text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    dedupe_key text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    origin jsonb,
    CONSTRAINT events_name_check CHECK ((name ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'::text)),
    CONSTRAINT events_origin_check CHECK (((origin IS NULL) OR ((jsonb_typeof((origin -> 'via'::text)) = 'string'::text) AND (jsonb_typeof((origin -> 'callerId'::text)) = 'string'::text) AND (jsonb_typeof((origin -> 'contextId'::text)) = 'string'::text) AND (jsonb_typeof((origin -> 'taskId'::text)) = 'string'::text)))),
    CONSTRAINT events_payload_check CHECK ((jsonb_typeof(payload) = 'object'::text)),
    CONSTRAINT events_source_check CHECK ((length(source) > 0))
);


ALTER TABLE ambient.events OWNER TO postgres;

--
-- Name: external_agents; Type: TABLE; Schema: ambient; Owner: postgres
--

CREATE TABLE ambient.external_agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    agent_id text NOT NULL,
    name text,
    description text,
    url text NOT NULL,
    a2a_endpoint text,
    version text,
    agent_card jsonb,
    capabilities jsonb,
    protocols jsonb,
    api_key text,
    trust_score numeric DEFAULT 0 NOT NULL,
    trust_level text DEFAULT 'unknown'::text NOT NULL,
    interactions_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'unknown'::text NOT NULL,
    last_heartbeat timestamp with time zone,
    allowed_origin boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE ambient.external_agents OWNER TO postgres;

--
-- Name: trigger_executions; Type: TABLE; Schema: ambient; Owner: postgres
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
    event_id uuid,
    reply_state text,
    reply_run_id uuid,
    reply jsonb,
    CONSTRAINT trigger_executions_check CHECK (((reply_state IS DISTINCT FROM 'waiting'::text) OR (reply_run_id IS NOT NULL))),
    CONSTRAINT trigger_executions_reply_state_check CHECK ((reply_state = ANY (ARRAY['waiting'::text, 'sending'::text, 'sent'::text, 'refused'::text, 'failed'::text])))
);


ALTER TABLE ambient.trigger_executions OWNER TO postgres;

--
-- Name: triggers; Type: TABLE; Schema: ambient; Owner: postgres
--

CREATE TABLE ambient.triggers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    name text NOT NULL,
    description text,
    source_type text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    source_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    condition jsonb,
    action_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    cooldown_seconds integer DEFAULT 0 NOT NULL,
    max_fires_per_hour integer,
    last_fired_at timestamp with time zone,
    created_by uuid,
    trigger_kind text DEFAULT 'event'::text NOT NULL,
    trigger_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    response_kind text DEFAULT 'agent'::text NOT NULL,
    response_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE ambient.triggers OWNER TO postgres;

--
-- Name: auth_identity_links; Type: TABLE; Schema: authz; Owner: postgres
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


ALTER TABLE authz.auth_identity_links OWNER TO postgres;

--
-- Name: org_entitlements; Type: TABLE; Schema: authz; Owner: postgres
--

CREATE TABLE authz.org_entitlements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug character varying(255) NOT NULL,
    product character varying(100) NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    granted_by uuid,
    CONSTRAINT org_entitlements_product_check CHECK (((product)::text = ANY (ARRAY[('workflows'::character varying)::text, ('agents'::character varying)::text, ('ambient'::character varying)::text, ('secure-conversations'::character varying)::text, ('assistant'::character varying)::text])))
);


ALTER TABLE authz.org_entitlements OWNER TO postgres;

--
-- Name: organizations; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.organizations OWNER TO postgres;

--
-- Name: organizations; Type: VIEW; Schema: authz; Owner: postgres
--

CREATE VIEW authz.organizations AS
 SELECT slug,
    name,
    description,
    url,
    settings,
    created_at,
    updated_at
   FROM public.organizations;


ALTER VIEW authz.organizations OWNER TO postgres;

--
-- Name: rbac_audit_log; Type: TABLE; Schema: authz; Owner: postgres
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


ALTER TABLE authz.rbac_audit_log OWNER TO postgres;

--
-- Name: rbac_permissions; Type: TABLE; Schema: authz; Owner: postgres
--

CREATE TABLE authz.rbac_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    display_name character varying(255) NOT NULL,
    description text,
    category character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE authz.rbac_permissions OWNER TO postgres;

--
-- Name: rbac_role_permissions; Type: TABLE; Schema: authz; Owner: postgres
--

CREATE TABLE authz.rbac_role_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL,
    resource_type character varying(100),
    resource_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE authz.rbac_role_permissions OWNER TO postgres;

--
-- Name: rbac_roles; Type: TABLE; Schema: authz; Owner: postgres
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


ALTER TABLE authz.rbac_roles OWNER TO postgres;

--
-- Name: rbac_user_org_roles; Type: TABLE; Schema: authz; Owner: postgres
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


ALTER TABLE authz.rbac_user_org_roles OWNER TO postgres;

--
-- Name: team_members; Type: TABLE; Schema: authz; Owner: postgres
--

CREATE TABLE authz.team_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE authz.team_members OWNER TO postgres;

--
-- Name: teams; Type: TABLE; Schema: authz; Owner: postgres
--

CREATE TABLE authz.teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text,
    name text NOT NULL,
    description text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE authz.teams OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: authz; Owner: postgres
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


ALTER TABLE authz.users OWNER TO postgres;

--
-- Name: submittal_decisions; Type: TABLE; Schema: building; Owner: postgres
--

CREATE TABLE building.submittal_decisions (
    run_id uuid NOT NULL,
    organization_slug text NOT NULL,
    spec_section text NOT NULL,
    action text NOT NULL,
    findings jsonb NOT NULL,
    decided_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT submittal_decisions_action_check CHECK ((action = ANY (ARRAY['approved'::text, 'approved_as_noted'::text, 'revise_and_resubmit'::text])))
);


ALTER TABLE building.submittal_decisions OWNER TO postgres;

--
-- Name: companies; Type: TABLE; Schema: company; Owner: postgres
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


ALTER TABLE company.companies OWNER TO postgres;

--
-- Name: discovery_signals; Type: TABLE; Schema: company; Owner: postgres
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


ALTER TABLE company.discovery_signals OWNER TO postgres;

--
-- Name: outreach; Type: TABLE; Schema: company; Owner: postgres
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


ALTER TABLE company.outreach OWNER TO postgres;

--
-- Name: agent_article_outputs; Type: TABLE; Schema: crawler; Owner: postgres
--

CREATE TABLE crawler.agent_article_outputs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    article_id uuid NOT NULL,
    agent_type text NOT NULL,
    output_type text,
    output_id uuid,
    processed_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE crawler.agent_article_outputs OWNER TO postgres;

--
-- Name: articles; Type: TABLE; Schema: crawler; Owner: postgres
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


ALTER TABLE crawler.articles OWNER TO postgres;

--
-- Name: source_crawls; Type: TABLE; Schema: crawler; Owner: postgres
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


ALTER TABLE crawler.source_crawls OWNER TO postgres;

--
-- Name: sources; Type: TABLE; Schema: crawler; Owner: postgres
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


ALTER TABLE crawler.sources OWNER TO postgres;

--
-- Name: crawl_dedup_stats; Type: VIEW; Schema: crawler; Owner: postgres
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


ALTER VIEW crawler.crawl_dedup_stats OWNER TO postgres;

--
-- Name: source_stats; Type: VIEW; Schema: crawler; Owner: postgres
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


ALTER VIEW crawler.source_stats OWNER TO postgres;

--
-- Name: cad_outputs; Type: TABLE; Schema: engineering; Owner: postgres
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


ALTER TABLE engineering.cad_outputs OWNER TO postgres;

--
-- Name: drawings; Type: TABLE; Schema: engineering; Owner: postgres
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


ALTER TABLE engineering.drawings OWNER TO postgres;

--
-- Name: execution_log; Type: TABLE; Schema: engineering; Owner: postgres
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


ALTER TABLE engineering.execution_log OWNER TO postgres;

--
-- Name: generated_code; Type: TABLE; Schema: engineering; Owner: postgres
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


ALTER TABLE engineering.generated_code OWNER TO postgres;

--
-- Name: part_library; Type: TABLE; Schema: engineering; Owner: postgres
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


ALTER TABLE engineering.part_library OWNER TO postgres;

--
-- Name: postmortem_tasks; Type: TABLE; Schema: engineering; Owner: postgres
--

CREATE TABLE engineering.postmortem_tasks (
    run_id uuid NOT NULL,
    organization_slug text NOT NULL,
    item_key text NOT NULL,
    title text NOT NULL,
    task_provider text NOT NULL,
    task_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE engineering.postmortem_tasks OWNER TO postgres;

--
-- Name: projects; Type: TABLE; Schema: engineering; Owner: postgres
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


ALTER TABLE engineering.projects OWNER TO postgres;

--
-- Name: invoices; Type: TABLE; Schema: finance; Owner: postgres
--

CREATE TABLE finance.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_slug text NOT NULL,
    run_id uuid,
    po_number text NOT NULL,
    vendor text NOT NULL,
    vendor_key text NOT NULL,
    invoice_number text NOT NULL,
    invoice_date date,
    total numeric(12,2) NOT NULL,
    currency text NOT NULL,
    outcome text NOT NULL,
    exceptions jsonb DEFAULT '[]'::jsonb NOT NULL,
    decided_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invoices_outcome_check CHECK ((outcome = ANY (ARRAY['auto_approved'::text, 'approved'::text, 'rejected'::text, 'paid'::text])))
);


ALTER TABLE finance.invoices OWNER TO postgres;

--
-- Name: po_lines; Type: TABLE; Schema: finance; Owner: postgres
--

CREATE TABLE finance.po_lines (
    po_id uuid NOT NULL,
    line_no integer NOT NULL,
    description text NOT NULL,
    quantity numeric(12,2) NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    CONSTRAINT po_lines_line_no_check CHECK ((line_no > 0)),
    CONSTRAINT po_lines_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT po_lines_unit_price_check CHECK ((unit_price >= (0)::numeric))
);


ALTER TABLE finance.po_lines OWNER TO postgres;

--
-- Name: purchase_orders; Type: TABLE; Schema: finance; Owner: postgres
--

CREATE TABLE finance.purchase_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_slug text NOT NULL,
    po_number text NOT NULL,
    vendor text NOT NULL,
    terms text NOT NULL,
    currency text NOT NULL,
    budget_owner text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchase_orders_currency_check CHECK ((currency ~ '^[A-Z]{3}$'::text))
);


ALTER TABLE finance.purchase_orders OWNER TO postgres;

--
-- Name: receipts; Type: TABLE; Schema: finance; Owner: postgres
--

CREATE TABLE finance.receipts (
    po_id uuid NOT NULL,
    line_no integer NOT NULL,
    quantity numeric(12,2) NOT NULL,
    received_at date NOT NULL,
    CONSTRAINT receipts_quantity_check CHECK ((quantity >= (0)::numeric))
);


ALTER TABLE finance.receipts OWNER TO postgres;

--
-- Name: callers; Type: TABLE; Schema: gatehouse; Owner: postgres
--

CREATE TABLE gatehouse.callers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    card_url text NOT NULL,
    jwks_url text,
    jwks jsonb,
    status text DEFAULT 'active'::text NOT NULL,
    rate_limit_per_minute integer DEFAULT 60 NOT NULL,
    registered_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone,
    CONSTRAINT callers_card_url_check CHECK ((card_url ~ '^https://'::text)),
    CONSTRAINT callers_check CHECK (((jwks_url IS NULL) <> (jwks IS NULL))),
    CONSTRAINT callers_jwks_check CHECK (((jwks IS NULL) OR (jsonb_typeof((jwks -> 'keys'::text)) = 'array'::text))),
    CONSTRAINT callers_jwks_url_check CHECK ((jwks_url ~ '^https://'::text)),
    CONSTRAINT callers_name_check CHECK (((length(name) >= 1) AND (length(name) <= 200))),
    CONSTRAINT callers_rate_limit_per_minute_check CHECK ((rate_limit_per_minute > 0)),
    CONSTRAINT callers_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text])))
);


ALTER TABLE gatehouse.callers OWNER TO postgres;

--
-- Name: tasks; Type: TABLE; Schema: gatehouse; Owner: postgres
--

CREATE TABLE gatehouse.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_slug text NOT NULL,
    org_slug text NOT NULL,
    caller_id uuid NOT NULL,
    context_id text NOT NULL,
    state text NOT NULL,
    target text NOT NULL,
    run_id uuid,
    event_id uuid,
    artifact jsonb,
    status_message text,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tasks_artifact_check CHECK (((artifact IS NULL) OR (jsonb_typeof(artifact) = 'array'::text))),
    CONSTRAINT tasks_context_id_check CHECK (((length(context_id) >= 1) AND (length(context_id) <= 200))),
    CONSTRAINT tasks_state_check CHECK ((state = ANY (ARRAY['submitted'::text, 'working'::text, 'completed'::text, 'failed'::text, 'canceled'::text, 'rejected'::text]))),
    CONSTRAINT tasks_target_check CHECK ((target = ANY (ARRAY['ambient'::text, 'agent'::text, 'workflow'::text, 'a2a'::text])))
);


ALTER TABLE gatehouse.tasks OWNER TO postgres;

--
-- Name: used_tokens; Type: TABLE; Schema: gatehouse; Owner: postgres
--

CREATE TABLE gatehouse.used_tokens (
    caller_id uuid NOT NULL,
    jti text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT used_tokens_jti_check CHECK (((length(jti) >= 8) AND (length(jti) <= 200)))
);


ALTER TABLE gatehouse.used_tokens OWNER TO postgres;

--
-- Name: a2a_messages; Type: TABLE; Schema: guardhouse; Owner: postgres
--

CREATE TABLE guardhouse.a2a_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    direction text NOT NULL,
    external_agent_id text,
    method text,
    request_id text,
    request_payload jsonb,
    response_payload jsonb,
    status text NOT NULL,
    rejection_reason text,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT a2a_messages_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))),
    CONSTRAINT a2a_messages_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'success'::text, 'error'::text, 'rejected'::text, 'rate_limited'::text])))
);


ALTER TABLE guardhouse.a2a_messages OWNER TO postgres;

--
-- Name: external_agents; Type: TABLE; Schema: guardhouse; Owner: postgres
--

CREATE TABLE guardhouse.external_agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    agent_id text NOT NULL,
    name text NOT NULL,
    description text,
    url text NOT NULL,
    a2a_endpoint text,
    version text,
    agent_card jsonb,
    capabilities jsonb DEFAULT '[]'::jsonb NOT NULL,
    protocols jsonb DEFAULT '[]'::jsonb NOT NULL,
    allowed_methods text[] DEFAULT ARRAY['*'::text] NOT NULL,
    api_key text,
    trust_score integer DEFAULT 50 NOT NULL,
    trust_level text DEFAULT 'unknown'::text NOT NULL,
    interactions_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'unknown'::text NOT NULL,
    last_heartbeat timestamp with time zone,
    allowed_origin boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT external_agents_status_check CHECK ((status = ANY (ARRAY['online'::text, 'offline'::text, 'unknown'::text]))),
    CONSTRAINT external_agents_trust_level_check CHECK ((trust_level = ANY (ARRAY['trusted'::text, 'neutral'::text, 'untrusted'::text, 'unknown'::text]))),
    CONSTRAINT external_agents_trust_score_check CHECK (((trust_score >= 0) AND (trust_score <= 100)))
);


ALTER TABLE guardhouse.external_agents OWNER TO postgres;

--
-- Name: nonces_seen; Type: TABLE; Schema: guardhouse; Owner: postgres
--

CREATE TABLE guardhouse.nonces_seen (
    nonce text NOT NULL,
    sender_id text NOT NULL,
    seen_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


ALTER TABLE guardhouse.nonces_seen OWNER TO postgres;

--
-- Name: new_hires; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE hr.new_hires (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_slug text NOT NULL,
    full_name text NOT NULL,
    role_title text NOT NULL,
    team text NOT NULL,
    manager_name text NOT NULL,
    location text NOT NULL,
    employment_type text NOT NULL,
    start_date date NOT NULL,
    notes text,
    onboarding_run_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT new_hires_employment_type_check CHECK ((employment_type = ANY (ARRAY['full-time'::text, 'part-time'::text, 'contractor'::text]))),
    CONSTRAINT new_hires_full_name_check CHECK ((full_name <> ''::text)),
    CONSTRAINT new_hires_location_check CHECK ((location <> ''::text)),
    CONSTRAINT new_hires_manager_name_check CHECK ((manager_name <> ''::text)),
    CONSTRAINT new_hires_role_title_check CHECK ((role_title <> ''::text)),
    CONSTRAINT new_hires_team_check CHECK ((team <> ''::text))
);


ALTER TABLE hr.new_hires OWNER TO postgres;

--
-- Name: onboarding_tasks; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE hr.onboarding_tasks (
    run_id uuid NOT NULL,
    organization_slug text NOT NULL,
    item_key text NOT NULL,
    title text NOT NULL,
    task_provider text NOT NULL,
    task_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE hr.onboarding_tasks OWNER TO postgres;

--
-- Name: competitor_snapshots; Type: TABLE; Schema: marketing; Owner: postgres
--

CREATE TABLE marketing.competitor_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_id uuid NOT NULL,
    organization_slug text NOT NULL,
    run_id uuid,
    captured_from text NOT NULL,
    archived_at timestamp with time zone,
    content_hash text NOT NULL,
    text text NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT competitor_snapshots_captured_from_check CHECK ((captured_from = ANY (ARRAY['live'::text, 'archive'::text]))),
    CONSTRAINT competitor_snapshots_check CHECK (((captured_from = 'archive'::text) = (archived_at IS NOT NULL)))
);


ALTER TABLE marketing.competitor_snapshots OWNER TO postgres;

--
-- Name: competitor_sources; Type: TABLE; Schema: marketing; Owner: postgres
--

CREATE TABLE marketing.competitor_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_slug text NOT NULL,
    competitor text NOT NULL,
    page text NOT NULL,
    url text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT competitor_sources_competitor_check CHECK ((competitor <> ''::text)),
    CONSTRAINT competitor_sources_page_check CHECK ((page <> ''::text)),
    CONSTRAINT competitor_sources_url_check CHECK ((url ~ '^https://'::text))
);


ALTER TABLE marketing.competitor_sources OWNER TO postgres;

--
-- Name: swarm_content_types; Type: TABLE; Schema: marketing; Owner: postgres
--

CREATE TABLE marketing.swarm_content_types (
    organization_slug text NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    guidance text NOT NULL,
    min_words integer NOT NULL,
    max_words integer NOT NULL,
    max_chars integer,
    active boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT swarm_content_types_check CHECK ((max_words >= min_words)),
    CONSTRAINT swarm_content_types_guidance_check CHECK ((guidance <> ''::text)),
    CONSTRAINT swarm_content_types_max_chars_check CHECK (((max_chars IS NULL) OR (max_chars > 0))),
    CONSTRAINT swarm_content_types_min_words_check CHECK ((min_words >= 0)),
    CONSTRAINT swarm_content_types_name_check CHECK ((name <> ''::text))
);


ALTER TABLE marketing.swarm_content_types OWNER TO postgres;

--
-- Name: swarm_editors; Type: TABLE; Schema: marketing; Owner: postgres
--

CREATE TABLE marketing.swarm_editors (
    organization_slug text NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    threshold numeric(3,2) NOT NULL,
    active boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT swarm_editors_name_check CHECK ((name <> ''::text)),
    CONSTRAINT swarm_editors_slug_check CHECK ((slug ~ '^[a-z][a-z0-9-]*$'::text)),
    CONSTRAINT swarm_editors_threshold_check CHECK (((threshold >= (0)::numeric) AND (threshold <= (1)::numeric)))
);


ALTER TABLE marketing.swarm_editors OWNER TO postgres;

--
-- Name: swarm_evaluators; Type: TABLE; Schema: marketing; Owner: postgres
--

CREATE TABLE marketing.swarm_evaluators (
    organization_slug text NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    active boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT swarm_evaluators_name_check CHECK ((name <> ''::text)),
    CONSTRAINT swarm_evaluators_slug_check CHECK ((slug ~ '^[a-z][a-z0-9-]*$'::text))
);


ALTER TABLE marketing.swarm_evaluators OWNER TO postgres;

--
-- Name: swarm_facets; Type: TABLE; Schema: marketing; Owner: postgres
--

CREATE TABLE marketing.swarm_facets (
    organization_slug text NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    description text NOT NULL,
    source text NOT NULL,
    rubric text,
    question text,
    inputs jsonb,
    polarity text DEFAULT 'positive'::text NOT NULL,
    evaluator_only boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT swarm_facets_check CHECK (((source = 'jev'::text) = ((rubric IS NOT NULL) AND (question IS NOT NULL) AND (inputs IS NOT NULL)))),
    CONSTRAINT swarm_facets_description_check CHECK ((description <> ''::text)),
    CONSTRAINT swarm_facets_key_check CHECK ((key ~ '^[a-z][a-z0-9-]*$'::text)),
    CONSTRAINT swarm_facets_label_check CHECK ((label <> ''::text)),
    CONSTRAINT swarm_facets_polarity_check CHECK ((polarity = ANY (ARRAY['positive'::text, 'negative'::text]))),
    CONSTRAINT swarm_facets_source_check CHECK ((source = ANY (ARRAY['jev'::text, 'length'::text])))
);


ALTER TABLE marketing.swarm_facets OWNER TO postgres;

--
-- Name: swarm_weights; Type: TABLE; Schema: marketing; Owner: postgres
--

CREATE TABLE marketing.swarm_weights (
    organization_slug text NOT NULL,
    owner_kind text NOT NULL,
    owner_slug text NOT NULL,
    facet_key text NOT NULL,
    weight integer NOT NULL,
    CONSTRAINT swarm_weights_owner_kind_check CHECK ((owner_kind = ANY (ARRAY['editor'::text, 'evaluator'::text]))),
    CONSTRAINT swarm_weights_weight_check CHECK (((weight >= 0) AND (weight <= 5)))
);


ALTER TABLE marketing.swarm_weights OWNER TO postgres;

--
-- Name: swarm_writers; Type: TABLE; Schema: marketing; Owner: postgres
--

CREATE TABLE marketing.swarm_writers (
    organization_slug text NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    persona text NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT swarm_writers_name_check CHECK ((name <> ''::text)),
    CONSTRAINT swarm_writers_persona_check CHECK ((persona <> ''::text)),
    CONSTRAINT swarm_writers_slug_check CHECK ((slug ~ '^[a-z][a-z0-9-]*$'::text))
);


ALTER TABLE marketing.swarm_writers OWNER TO postgres;

--
-- Name: channel_messages; Type: TABLE; Schema: orch_flow; Owner: postgres
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


ALTER TABLE orch_flow.channel_messages OWNER TO postgres;

--
-- Name: channels; Type: TABLE; Schema: orch_flow; Owner: postgres
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


ALTER TABLE orch_flow.channels OWNER TO postgres;

--
-- Name: efforts; Type: TABLE; Schema: orch_flow; Owner: postgres
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


ALTER TABLE orch_flow.efforts OWNER TO postgres;

--
-- Name: journey_templates; Type: TABLE; Schema: orch_flow; Owner: postgres
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


ALTER TABLE orch_flow.journey_templates OWNER TO postgres;

--
-- Name: learning_progress; Type: TABLE; Schema: orch_flow; Owner: postgres
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


ALTER TABLE orch_flow.learning_progress OWNER TO postgres;

--
-- Name: notifications; Type: TABLE; Schema: orch_flow; Owner: postgres
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


ALTER TABLE orch_flow.notifications OWNER TO postgres;

--
-- Name: profiles; Type: TABLE; Schema: orch_flow; Owner: postgres
--

CREATE TABLE orch_flow.profiles (
    id uuid NOT NULL,
    display_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE orch_flow.profiles OWNER TO postgres;

--
-- Name: projects; Type: TABLE; Schema: orch_flow; Owner: postgres
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


ALTER TABLE orch_flow.projects OWNER TO postgres;

--
-- Name: shared_tasks; Type: TABLE; Schema: orch_flow; Owner: postgres
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


ALTER TABLE orch_flow.shared_tasks OWNER TO postgres;

--
-- Name: sprints; Type: TABLE; Schema: orch_flow; Owner: postgres
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


ALTER TABLE orch_flow.sprints OWNER TO postgres;

--
-- Name: task_collaborators; Type: TABLE; Schema: orch_flow; Owner: postgres
--

CREATE TABLE orch_flow.task_collaborators (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    user_id uuid,
    guest_name text,
    joined_at timestamp with time zone DEFAULT now(),
    CONSTRAINT collaborator_identity CHECK (((user_id IS NOT NULL) OR (guest_name IS NOT NULL)))
);


ALTER TABLE orch_flow.task_collaborators OWNER TO postgres;

--
-- Name: task_update_requests; Type: TABLE; Schema: orch_flow; Owner: postgres
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


ALTER TABLE orch_flow.task_update_requests OWNER TO postgres;

--
-- Name: task_watchers; Type: TABLE; Schema: orch_flow; Owner: postgres
--

CREATE TABLE orch_flow.task_watchers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    user_id uuid,
    guest_name text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT watcher_identity CHECK (((user_id IS NOT NULL) OR (guest_name IS NOT NULL)))
);


ALTER TABLE orch_flow.task_watchers OWNER TO postgres;

--
-- Name: tasks; Type: TABLE; Schema: orch_flow; Owner: postgres
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


ALTER TABLE orch_flow.tasks OWNER TO postgres;

--
-- Name: team_files; Type: TABLE; Schema: orch_flow; Owner: postgres
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


ALTER TABLE orch_flow.team_files OWNER TO postgres;

--
-- Name: timer_state; Type: TABLE; Schema: orch_flow; Owner: postgres
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


ALTER TABLE orch_flow.timer_state OWNER TO postgres;

--
-- Name: user_presence; Type: TABLE; Schema: orch_flow; Owner: postgres
--

CREATE TABLE orch_flow.user_presence (
    user_id uuid NOT NULL,
    last_active_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE orch_flow.user_presence OWNER TO postgres;

--
-- Name: agent_self_modification_log; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.agent_self_modification_log OWNER TO postgres;

--
-- Name: analyst_adaptation_diffs; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.analyst_adaptation_diffs OWNER TO postgres;

--
-- Name: analyst_assessments; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.analyst_assessments OWNER TO postgres;

--
-- Name: analyst_overrides; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.analyst_overrides OWNER TO postgres;

--
-- Name: analyst_performance_metrics; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.analyst_performance_metrics OWNER TO postgres;

--
-- Name: analyst_portfolios; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.analyst_portfolios OWNER TO postgres;

--
-- Name: analyst_positions; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.analyst_positions OWNER TO postgres;

--
-- Name: analysts; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.analysts OWNER TO postgres;

--
-- Name: daily_postmortem_recommendations; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.daily_postmortem_recommendations OWNER TO postgres;

--
-- Name: daily_postmortem_runs; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.daily_postmortem_runs OWNER TO postgres;

--
-- Name: eod_settlement_log; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.eod_settlement_log OWNER TO postgres;

--
-- Name: evaluations; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.evaluations OWNER TO postgres;

--
-- Name: fork_learning_exchanges; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.fork_learning_exchanges OWNER TO postgres;

--
-- Name: learning_lineage; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.learning_lineage OWNER TO postgres;

--
-- Name: learning_queue; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.learning_queue OWNER TO postgres;

--
-- Name: learnings; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.learnings OWNER TO postgres;

--
-- Name: missed_opportunities; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.missed_opportunities OWNER TO postgres;

--
-- Name: position_sizing_config; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.position_sizing_config OWNER TO postgres;

--
-- Name: predictions; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.predictions OWNER TO postgres;

--
-- Name: predictors; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.predictors OWNER TO postgres;

--
-- Name: replay_test_results; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.replay_test_results OWNER TO postgres;

--
-- Name: replay_test_snapshots; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.replay_test_snapshots OWNER TO postgres;

--
-- Name: replay_test_summary; Type: VIEW; Schema: prediction; Owner: postgres
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


ALTER VIEW prediction.replay_test_summary OWNER TO postgres;

--
-- Name: replay_tests; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.replay_tests OWNER TO postgres;

--
-- Name: review_queue; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.review_queue OWNER TO postgres;

--
-- Name: runner_context_versions; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.runner_context_versions OWNER TO postgres;

--
-- Name: scenario_runs; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.scenario_runs OWNER TO postgres;

--
-- Name: signals; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.signals OWNER TO postgres;

--
-- Name: snapshots; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.snapshots OWNER TO postgres;

--
-- Name: source_subscriptions; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.source_subscriptions OWNER TO postgres;

--
-- Name: strategies; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.strategies OWNER TO postgres;

--
-- Name: targets; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.targets OWNER TO postgres;

--
-- Name: universes; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.universes OWNER TO postgres;

--
-- Name: subscription_stats; Type: VIEW; Schema: prediction; Owner: postgres
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


ALTER VIEW prediction.subscription_stats OWNER TO postgres;

--
-- Name: target_context_versions; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.target_context_versions OWNER TO postgres;

--
-- Name: target_snapshots; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.target_snapshots OWNER TO postgres;

--
-- Name: test_articles; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.test_articles OWNER TO postgres;

--
-- Name: test_audit_log; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.test_audit_log OWNER TO postgres;

--
-- Name: test_price_data; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.test_price_data OWNER TO postgres;

--
-- Name: test_scenarios; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.test_scenarios OWNER TO postgres;

--
-- Name: test_scenario_summary; Type: VIEW; Schema: prediction; Owner: postgres
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


ALTER VIEW prediction.test_scenario_summary OWNER TO postgres;

--
-- Name: test_target_mirrors; Type: TABLE; Schema: prediction; Owner: postgres
--

CREATE TABLE prediction.test_target_mirrors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    real_target_id uuid NOT NULL,
    test_target_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_different_targets CHECK ((real_target_id <> test_target_id))
);


ALTER TABLE prediction.test_target_mirrors OWNER TO postgres;

--
-- Name: tool_requests; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.tool_requests OWNER TO postgres;

--
-- Name: universe_context_versions; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.universe_context_versions OWNER TO postgres;

--
-- Name: user_portfolios; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.user_portfolios OWNER TO postgres;

--
-- Name: user_positions; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.user_positions OWNER TO postgres;

--
-- Name: user_trade_queue; Type: TABLE; Schema: prediction; Owner: postgres
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


ALTER TABLE prediction.user_trade_queue OWNER TO postgres;

--
-- Name: v_agent_activity_feed; Type: VIEW; Schema: prediction; Owner: postgres
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


ALTER VIEW prediction.v_agent_activity_feed OWNER TO postgres;

--
-- Name: v_analyst_fork_comparison; Type: VIEW; Schema: prediction; Owner: postgres
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


ALTER VIEW prediction.v_analyst_fork_comparison OWNER TO postgres;

--
-- Name: v_analytics_accuracy_comparison; Type: VIEW; Schema: prediction; Owner: postgres
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


ALTER VIEW prediction.v_analytics_accuracy_comparison OWNER TO postgres;

--
-- Name: v_analytics_learning_velocity; Type: VIEW; Schema: prediction; Owner: postgres
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


ALTER VIEW prediction.v_analytics_learning_velocity OWNER TO postgres;

--
-- Name: v_analytics_promotion_funnel; Type: VIEW; Schema: prediction; Owner: postgres
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


ALTER VIEW prediction.v_analytics_promotion_funnel OWNER TO postgres;

--
-- Name: v_analytics_scenario_effectiveness; Type: VIEW; Schema: prediction; Owner: postgres
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


ALTER VIEW prediction.v_analytics_scenario_effectiveness OWNER TO postgres;

--
-- Name: v_test_data_stats; Type: VIEW; Schema: prediction; Owner: postgres
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


ALTER VIEW prediction.v_test_data_stats OWNER TO postgres;

--
-- Name: agent_pipelines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.agent_pipelines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_slug text NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    runners jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_pipelines_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 120))),
    CONSTRAINT agent_pipelines_runners_check CHECK (((jsonb_typeof(runners) = 'array'::text) AND ((jsonb_array_length(runners) >= 1) AND (jsonb_array_length(runners) <= 5))))
);


ALTER TABLE public.agent_pipelines OWNER TO postgres;

--
-- Name: agents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.agents (
    slug text NOT NULL,
    organization_slug text[] DEFAULT ARRAY['legal'::text] NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    version text DEFAULT '1.0.0'::text NOT NULL,
    agent_type text NOT NULL,
    department text NOT NULL,
    tags text[] DEFAULT ARRAY[]::text[],
    io_schema jsonb NOT NULL,
    capabilities text[] NOT NULL,
    context text NOT NULL,
    endpoint jsonb,
    llm_config jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    require_local_model boolean DEFAULT false,
    CONSTRAINT agents_agent_type_check CHECK ((agent_type = ANY (ARRAY['context'::text, 'rag'::text, 'api'::text, 'a2a'::text, 'media'::text])))
);


ALTER TABLE public.agents OWNER TO postgres;

--
-- Name: assets; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.assets OWNER TO postgres;

--
-- Name: auth_identity_links; Type: VIEW; Schema: public; Owner: postgres
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


ALTER VIEW public.auth_identity_links OWNER TO postgres;

--
-- Name: channel_message_log; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.channel_message_log OWNER TO postgres;

--
-- Name: channel_users; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.channel_users OWNER TO postgres;

--
-- Name: checkpoint_blobs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.checkpoint_blobs (
    thread_id text NOT NULL,
    checkpoint_ns text DEFAULT ''::text NOT NULL,
    channel text NOT NULL,
    version text NOT NULL,
    type text NOT NULL,
    blob bytea
);


ALTER TABLE public.checkpoint_blobs OWNER TO postgres;

--
-- Name: checkpoint_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.checkpoint_migrations (
    v integer NOT NULL
);


ALTER TABLE public.checkpoint_migrations OWNER TO postgres;

--
-- Name: checkpoint_writes; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.checkpoint_writes OWNER TO postgres;

--
-- Name: checkpoints; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.checkpoints OWNER TO postgres;

--
-- Name: cidafm_commands; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.cidafm_commands OWNER TO postgres;

--
-- Name: conversation_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.conversation_messages (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    conversation_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    output_type text DEFAULT 'text'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    attachments jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT conversation_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text, 'tool'::text])))
);


ALTER TABLE public.conversation_messages OWNER TO postgres;

--
-- Name: conversations; Type: TABLE; Schema: public; Owner: postgres
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
    message_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.conversations OWNER TO postgres;

--
-- Name: tasks; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.tasks OWNER TO postgres;

--
-- Name: conversations_with_stats; Type: VIEW; Schema: public; Owner: postgres
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


ALTER VIEW public.conversations_with_stats OWNER TO postgres;

--
-- Name: deliverable_versions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.deliverable_versions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    deliverable_id uuid NOT NULL,
    version_number integer NOT NULL,
    content text,
    format character varying(100) DEFAULT 'markdown'::text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_by_type character varying(50) DEFAULT 'ai_response'::character varying,
    is_current_version boolean DEFAULT false,
    task_id uuid,
    file_attachments jsonb DEFAULT '{}'::jsonb,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT deliverable_versions_created_by_type_check CHECK (((created_by_type)::text = ANY (ARRAY[('ai_response'::character varying)::text, ('manual_edit'::character varying)::text, ('ai_enhancement'::character varying)::text, ('user_request'::character varying)::text, ('conversation_task'::character varying)::text, ('conversation_merge'::character varying)::text, ('llm_rerun'::character varying)::text])))
);


ALTER TABLE public.deliverable_versions OWNER TO postgres;

--
-- Name: deliverables; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.deliverables (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    conversation_id uuid,
    agent_name text,
    title text NOT NULL,
    type character varying(100),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    task_id uuid
);


ALTER TABLE public.deliverables OWNER TO postgres;

--
-- Name: installed_modules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.installed_modules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    display_name text NOT NULL,
    version text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.installed_modules OWNER TO postgres;

--
-- Name: llm_fabric_node_reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.llm_fabric_node_reports (
    node_id text NOT NULL,
    reported_at timestamp with time zone NOT NULL,
    agent_version text,
    runtime text,
    runtime_version text,
    models jsonb DEFAULT '[]'::jsonb NOT NULL,
    load jsonb,
    resources jsonb,
    drain_mode boolean DEFAULT false NOT NULL,
    message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT llm_fabric_node_reports_load_check CHECK (((load IS NULL) OR (jsonb_typeof(load) = 'object'::text))),
    CONSTRAINT llm_fabric_node_reports_models_check CHECK ((jsonb_typeof(models) = 'array'::text)),
    CONSTRAINT llm_fabric_node_reports_resources_check CHECK (((resources IS NULL) OR (jsonb_typeof(resources) = 'object'::text)))
);


ALTER TABLE public.llm_fabric_node_reports OWNER TO postgres;

--
-- Name: llm_fabric_routing_decisions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.llm_fabric_routing_decisions (
    id text NOT NULL,
    at timestamp with time zone NOT NULL,
    provider text NOT NULL,
    selected_provider text,
    model text NOT NULL,
    role text NOT NULL,
    request_kind text,
    caller_name text,
    workflow_slug text,
    data_sensitivity text,
    selected_node_id text,
    selected_node_host text,
    selected_node_tier text,
    active_at_selection integer,
    matched_policy_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    considered jsonb DEFAULT '[]'::jsonb NOT NULL,
    outcome text NOT NULL,
    latency_ms integer,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT llm_fabric_routing_decisions_outcome_check CHECK ((outcome = ANY (ARRAY['selected'::text, 'completed'::text, 'failed'::text, 'no_eligible'::text]))),
    CONSTRAINT llm_fabric_routing_decisions_request_kind_check CHECK (((request_kind IS NULL) OR (request_kind = ANY (ARRAY['generation'::text, 'reasoning'::text, 'embedding'::text])))),
    CONSTRAINT llm_fabric_routing_decisions_role_check CHECK ((role = ANY (ARRAY['workhorse'::text, 'thinking'::text, 'evaluation'::text, 'embedding'::text, 'vision'::text]))),
    CONSTRAINT llm_fabric_routing_decisions_selected_node_tier_check CHECK (((selected_node_tier IS NULL) OR (selected_node_tier = ANY (ARRAY['primary'::text, 'overflow'::text, 'failover'::text]))))
);


ALTER TABLE public.llm_fabric_routing_decisions OWNER TO postgres;

--
-- Name: llm_fabric_routing_policies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.llm_fabric_routing_policies (
    id text NOT NULL,
    description text,
    workflows jsonb,
    callers jsonb,
    roles jsonb,
    sensitivities jsonb,
    allowed_nodes jsonb,
    denied_nodes jsonb,
    priority integer DEFAULT 100 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT llm_fabric_routing_policies_allowed_nodes_array CHECK (((allowed_nodes IS NULL) OR (jsonb_typeof(allowed_nodes) = 'array'::text))),
    CONSTRAINT llm_fabric_routing_policies_callers_array CHECK (((callers IS NULL) OR (jsonb_typeof(callers) = 'array'::text))),
    CONSTRAINT llm_fabric_routing_policies_denied_nodes_array CHECK (((denied_nodes IS NULL) OR (jsonb_typeof(denied_nodes) = 'array'::text))),
    CONSTRAINT llm_fabric_routing_policies_roles_array CHECK (((roles IS NULL) OR (jsonb_typeof(roles) = 'array'::text))),
    CONSTRAINT llm_fabric_routing_policies_sensitivities_array CHECK (((sensitivities IS NULL) OR (jsonb_typeof(sensitivities) = 'array'::text))),
    CONSTRAINT llm_fabric_routing_policies_workflows_array CHECK (((workflows IS NULL) OR (jsonb_typeof(workflows) = 'array'::text)))
);


ALTER TABLE public.llm_fabric_routing_policies OWNER TO postgres;

--
-- Name: llm_models; Type: TABLE; Schema: public; Owner: postgres
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
    last_validated_at timestamp with time zone,
    vendor text NOT NULL,
    is_available boolean
);


ALTER TABLE public.llm_models OWNER TO postgres;

--
-- Name: llm_providers; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.llm_providers OWNER TO postgres;

--
-- Name: llm_usage; Type: TABLE; Schema: public; Owner: postgres
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
    thinking_content text,
    thinking_duration_ms integer,
    thinking_token_count integer,
    requested_model_name text,
    fabric_node_id text,
    fabric_node_name text,
    fabric_role text,
    fabric_routing_decision_id text,
    memory_entry_ids uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
    memory_token_weight integer,
    memory_context_hash text,
    memory_context_scope jsonb DEFAULT '{}'::jsonb NOT NULL,
    source_context jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT llm_usage_fabric_role_check CHECK (((fabric_role IS NULL) OR (fabric_role = ANY (ARRAY['workhorse'::text, 'thinking'::text, 'evaluation'::text, 'embedding'::text, 'vision'::text])))),
    CONSTRAINT llm_usage_route_check CHECK (((route IS NULL) OR (route = ANY (ARRAY['local'::text, 'remote'::text]))))
);


ALTER TABLE public.llm_usage OWNER TO postgres;

--
-- Name: observability_events; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.observability_events OWNER TO postgres;

--
-- Name: observability_events_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.observability_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.observability_events_id_seq OWNER TO postgres;

--
-- Name: observability_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.observability_events_id_seq OWNED BY public.observability_events.id;


--
-- Name: organization_credentials; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.organization_credentials OWNER TO postgres;

--
-- Name: plan_deliverables; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.plan_deliverables (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    plan_id uuid NOT NULL,
    deliverable_id uuid,
    label text,
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.plan_deliverables OWNER TO postgres;

--
-- Name: plan_versions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.plan_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid NOT NULL,
    version_number integer NOT NULL,
    content text NOT NULL,
    format text DEFAULT 'markdown'::text NOT NULL,
    created_by_type text NOT NULL,
    created_by_id uuid,
    task_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    is_current_version boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT plan_versions_created_by_type_check CHECK ((created_by_type = ANY (ARRAY['agent'::text, 'user'::text]))),
    CONSTRAINT plan_versions_format_check CHECK ((format = ANY (ARRAY['markdown'::text, 'json'::text, 'text'::text])))
);


ALTER TABLE public.plan_versions OWNER TO postgres;

--
-- Name: plans; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    agent_name text NOT NULL,
    agent_slug text,
    namespace text NOT NULL,
    organization_slug text,
    title text NOT NULL,
    summary text,
    status text DEFAULT 'draft'::text,
    current_version_id uuid,
    plan_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid,
    approved_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.plans OWNER TO postgres;

--
-- Name: pseudonym_dictionaries; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.pseudonym_dictionaries OWNER TO postgres;

--
-- Name: pseudonym_mappings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pseudonym_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    original_hash text NOT NULL,
    pseudonym text NOT NULL,
    data_type text NOT NULL,
    context text,
    usage_count integer DEFAULT 1 NOT NULL,
    last_used_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.pseudonym_mappings OWNER TO postgres;

--
-- Name: redaction_audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.redaction_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id text,
    run_id text,
    operation_type text NOT NULL,
    data_type text,
    pseudonym_count integer DEFAULT 0 NOT NULL,
    processing_time_ms integer,
    service_name text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.redaction_audit_log OWNER TO postgres;

--
-- Name: redaction_patterns; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.redaction_patterns OWNER TO postgres;

--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.system_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.system_settings OWNER TO postgres;

--
-- Name: task_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.task_messages (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    task_id uuid NOT NULL,
    user_id uuid,
    content text NOT NULL,
    message_type text DEFAULT 'info'::text NOT NULL,
    progress_percentage numeric,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.task_messages OWNER TO postgres;

--
-- Name: team_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.team_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.team_members OWNER TO postgres;

--
-- Name: teams; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.teams OWNER TO postgres;

--
-- Name: user_cidafm_commands; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.user_cidafm_commands OWNER TO postgres;

--
-- Name: rag_document_chunks; Type: TABLE; Schema: rag_data; Owner: postgres
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
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    enrichment_version text
);


ALTER TABLE rag_data.rag_document_chunks OWNER TO postgres;

--
-- Name: rag_feedback_signals; Type: TABLE; Schema: rag_data; Owner: postgres
--

CREATE TABLE rag_data.rag_feedback_signals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_slug text NOT NULL,
    chunk_id uuid NOT NULL,
    user_id text NOT NULL,
    signal_type text NOT NULL,
    query_text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rag_feedback_signals_signal_type_check CHECK ((signal_type = ANY (ARRAY['thumbs_up'::text, 'thumbs_down'::text, 'use'::text, 'irrelevant'::text])))
);


ALTER TABLE rag_data.rag_feedback_signals OWNER TO postgres;

--
-- Name: composite_scores; Type: TABLE; Schema: risk; Owner: postgres
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


ALTER TABLE risk.composite_scores OWNER TO postgres;

--
-- Name: scopes; Type: TABLE; Schema: risk; Owner: postgres
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


ALTER TABLE risk.scopes OWNER TO postgres;

--
-- Name: subjects; Type: TABLE; Schema: risk; Owner: postgres
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


ALTER TABLE risk.subjects OWNER TO postgres;

--
-- Name: active_composite_scores; Type: VIEW; Schema: risk; Owner: postgres
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


ALTER VIEW risk.active_composite_scores OWNER TO postgres;

--
-- Name: alerts; Type: TABLE; Schema: risk; Owner: postgres
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


ALTER TABLE risk.alerts OWNER TO postgres;

--
-- Name: article_classifications; Type: TABLE; Schema: risk; Owner: postgres
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


ALTER TABLE risk.article_classifications OWNER TO postgres;

--
-- Name: assessment_runs; Type: TABLE; Schema: risk; Owner: postgres
--

CREATE TABLE risk.assessment_runs (
    id uuid NOT NULL,
    scope_id uuid NOT NULL,
    subject_id uuid,
    organization_slug text NOT NULL,
    user_id text NOT NULL,
    proposition text NOT NULL,
    background text,
    status text DEFAULT 'running'::text NOT NULL,
    phase text,
    overall_score integer,
    overall_confidence numeric(3,2),
    residual_score integer,
    executive_summary text,
    monte_carlo jsonb,
    error_message text,
    provider text,
    model text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT assessment_runs_overall_score_check CHECK (((overall_score >= 0) AND (overall_score <= 100))),
    CONSTRAINT assessment_runs_residual_score_check CHECK (((residual_score >= 0) AND (residual_score <= 100))),
    CONSTRAINT assessment_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text])))
);


ALTER TABLE risk.assessment_runs OWNER TO postgres;

--
-- Name: assessments; Type: TABLE; Schema: risk; Owner: postgres
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


ALTER TABLE risk.assessments OWNER TO postgres;

--
-- Name: classified_articles_by_dimension; Type: VIEW; Schema: risk; Owner: postgres
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


ALTER VIEW risk.classified_articles_by_dimension OWNER TO postgres;

--
-- Name: classified_articles_by_subject; Type: VIEW; Schema: risk; Owner: postgres
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


ALTER VIEW risk.classified_articles_by_subject OWNER TO postgres;

--
-- Name: comparisons; Type: TABLE; Schema: risk; Owner: postgres
--

CREATE TABLE risk.comparisons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    subject_ids uuid[] NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE risk.comparisons OWNER TO postgres;

--
-- Name: data_source_fetch_history; Type: TABLE; Schema: risk; Owner: postgres
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


ALTER TABLE risk.data_source_fetch_history OWNER TO postgres;

--
-- Name: data_sources; Type: TABLE; Schema: risk; Owner: postgres
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


ALTER TABLE risk.data_sources OWNER TO postgres;

--
-- Name: debate_contexts; Type: TABLE; Schema: risk; Owner: postgres
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


ALTER TABLE risk.debate_contexts OWNER TO postgres;

--
-- Name: debates; Type: TABLE; Schema: risk; Owner: postgres
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


ALTER TABLE risk.debates OWNER TO postgres;

--
-- Name: dimension_contexts; Type: TABLE; Schema: risk; Owner: postgres
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


ALTER TABLE risk.dimension_contexts OWNER TO postgres;

--
-- Name: dimension_contribution; Type: VIEW; Schema: risk; Owner: postgres
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


ALTER VIEW risk.dimension_contribution OWNER TO postgres;

--
-- Name: dimensions; Type: TABLE; Schema: risk; Owner: postgres
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


ALTER TABLE risk.dimensions OWNER TO postgres;

--
-- Name: evaluations; Type: TABLE; Schema: risk; Owner: postgres
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


ALTER TABLE risk.evaluations OWNER TO postgres;

--
-- Name: executive_summaries; Type: TABLE; Schema: risk; Owner: postgres
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


ALTER TABLE risk.executive_summaries OWNER TO postgres;

--
-- Name: heatmap_data; Type: VIEW; Schema: risk; Owner: postgres
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


ALTER VIEW risk.heatmap_data OWNER TO postgres;

--
-- Name: learning_queue; Type: TABLE; Schema: risk; Owner: postgres
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


ALTER TABLE risk.learning_queue OWNER TO postgres;

--
-- Name: learnings; Type: TABLE; Schema: risk; Owner: postgres
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


ALTER TABLE risk.learnings OWNER TO postgres;

--
-- Name: mitigations; Type: TABLE; Schema: risk; Owner: postgres
--

CREATE TABLE risk.mitigations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assessment_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    proposal text NOT NULL,
    rationale text,
    effort text,
    residual_score integer,
    accepted boolean,
    accepted_at timestamp with time zone,
    accepted_by text,
    llm_provider text,
    llm_model text,
    is_test boolean DEFAULT false,
    test_scenario_id text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT mitigations_effort_check CHECK ((effort = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT mitigations_residual_score_check CHECK (((residual_score >= 0) AND (residual_score <= 100)))
);


ALTER TABLE risk.mitigations OWNER TO postgres;

--
-- Name: pending_learnings; Type: VIEW; Schema: risk; Owner: postgres
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


ALTER VIEW risk.pending_learnings OWNER TO postgres;

--
-- Name: portfolio_aggregate; Type: VIEW; Schema: risk; Owner: postgres
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


ALTER VIEW risk.portfolio_aggregate OWNER TO postgres;

--
-- Name: reports; Type: TABLE; Schema: risk; Owner: postgres
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


ALTER TABLE risk.reports OWNER TO postgres;

--
-- Name: risk_distribution; Type: VIEW; Schema: risk; Owner: postgres
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


ALTER VIEW risk.risk_distribution OWNER TO postgres;

--
-- Name: scenarios; Type: TABLE; Schema: risk; Owner: postgres
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


ALTER TABLE risk.scenarios OWNER TO postgres;

--
-- Name: score_history; Type: VIEW; Schema: risk; Owner: postgres
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


ALTER VIEW risk.score_history OWNER TO postgres;

--
-- Name: score_trends; Type: VIEW; Schema: risk; Owner: postgres
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


ALTER VIEW risk.score_trends OWNER TO postgres;

--
-- Name: simulations; Type: TABLE; Schema: risk; Owner: postgres
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


ALTER TABLE risk.simulations OWNER TO postgres;

--
-- Name: source_subscriptions; Type: TABLE; Schema: risk; Owner: postgres
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


ALTER TABLE risk.source_subscriptions OWNER TO postgres;

--
-- Name: subscription_stats; Type: VIEW; Schema: risk; Owner: postgres
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


ALTER VIEW risk.subscription_stats OWNER TO postgres;

--
-- Name: unacknowledged_alerts; Type: VIEW; Schema: risk; Owner: postgres
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


ALTER VIEW risk.unacknowledged_alerts OWNER TO postgres;

--
-- Name: unclassified_articles; Type: VIEW; Schema: risk; Owner: postgres
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


ALTER VIEW risk.unclassified_articles OWNER TO postgres;

--
-- Name: alerts; Type: TABLE; Schema: sentinel; Owner: postgres
--

CREATE TABLE sentinel.alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    signal_id uuid NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    severity text NOT NULL,
    summary text NOT NULL,
    rationale text NOT NULL,
    recommended_action text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    acknowledged_by text,
    acknowledged_at timestamp with time zone,
    signal_target_id uuid,
    CONSTRAINT sentinel_alerts_severity_check CHECK ((severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text]))),
    CONSTRAINT sentinel_alerts_status_check CHECK ((status = ANY (ARRAY['new'::text, 'acknowledged'::text, 'dismissed'::text, 'actioned'::text])))
);


ALTER TABLE sentinel.alerts OWNER TO postgres;

--
-- Name: observations; Type: TABLE; Schema: sentinel; Owner: postgres
--

CREATE TABLE sentinel.observations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    source_id uuid NOT NULL,
    source_run_id uuid NOT NULL,
    test_run_id uuid,
    external_id text,
    title text NOT NULL,
    summary text,
    full_text text,
    url text,
    published_at timestamp with time zone,
    content_hash text NOT NULL,
    raw jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE sentinel.observations OWNER TO postgres;

--
-- Name: signal_targets; Type: TABLE; Schema: sentinel; Owner: postgres
--

CREATE TABLE sentinel.signal_targets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    signal_id uuid NOT NULL,
    watch_profile_id uuid NOT NULL,
    vertical text NOT NULL,
    target_type text NOT NULL,
    target_id text NOT NULL,
    relevance_score numeric NOT NULL,
    rationale text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE sentinel.signal_targets OWNER TO postgres;

--
-- Name: signals; Type: TABLE; Schema: sentinel; Owner: postgres
--

CREATE TABLE sentinel.signals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    observation_id uuid NOT NULL,
    source_run_id uuid NOT NULL,
    test_run_id uuid,
    signal_type text DEFAULT 'monitoring'::text NOT NULL,
    severity text DEFAULT 'medium'::text NOT NULL,
    confidence numeric DEFAULT 0.5 NOT NULL,
    summary text NOT NULL,
    rationale text NOT NULL,
    llm_usage_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sentinel_signals_severity_check CHECK ((severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text])))
);


ALTER TABLE sentinel.signals OWNER TO postgres;

--
-- Name: source_runs; Type: TABLE; Schema: sentinel; Owner: postgres
--

CREATE TABLE sentinel.source_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    source_id uuid NOT NULL,
    test_run_id uuid,
    run_kind text DEFAULT 'manual'::text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    observations_found integer DEFAULT 0 NOT NULL,
    observations_created integer DEFAULT 0 NOT NULL,
    duplicates_skipped integer DEFAULT 0 NOT NULL,
    signals_created integer DEFAULT 0 NOT NULL,
    alerts_created integer DEFAULT 0 NOT NULL,
    error text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT sentinel_source_runs_kind_check CHECK ((run_kind = ANY (ARRAY['manual'::text, 'scheduled'::text, 'test'::text]))),
    CONSTRAINT sentinel_source_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text])))
);


ALTER TABLE sentinel.source_runs OWNER TO postgres;

--
-- Name: sources; Type: TABLE; Schema: sentinel; Owner: postgres
--

CREATE TABLE sentinel.sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    name text NOT NULL,
    source_type text NOT NULL,
    url text NOT NULL,
    poll_interval_minutes integer DEFAULT 60 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_polled_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    test_run_id uuid,
    CONSTRAINT sentinel_sources_type_check CHECK ((source_type = ANY (ARRAY['rss'::text, 'web'::text, 'api'::text, 'file'::text])))
);


ALTER TABLE sentinel.sources OWNER TO postgres;

--
-- Name: test_runs; Type: TABLE; Schema: sentinel; Owner: postgres
--

CREATE TABLE sentinel.test_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'running'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT sentinel_test_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'reverted'::text, 'failed'::text])))
);


ALTER TABLE sentinel.test_runs OWNER TO postgres;

--
-- Name: watch_concerns; Type: TABLE; Schema: sentinel; Owner: postgres
--

CREATE TABLE sentinel.watch_concerns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    watch_profile_id uuid NOT NULL,
    concern_type text NOT NULL,
    value text NOT NULL,
    weight numeric DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE sentinel.watch_concerns OWNER TO postgres;

--
-- Name: watch_profiles; Type: TABLE; Schema: sentinel; Owner: postgres
--

CREATE TABLE sentinel.watch_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    vertical text DEFAULT 'legal'::text NOT NULL,
    target_type text NOT NULL,
    target_id text NOT NULL,
    name text NOT NULL,
    description text,
    enabled boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    test_run_id uuid
);


ALTER TABLE sentinel.watch_profiles OWNER TO postgres;

--
-- Name: document_mappings; Type: TABLE; Schema: substrate; Owner: postgres
--

CREATE TABLE substrate.document_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    profile_id uuid NOT NULL,
    source_id uuid NOT NULL,
    mapping_slug text NOT NULL,
    status text DEFAULT 'enabled'::text NOT NULL,
    document_locator jsonb DEFAULT '{}'::jsonb NOT NULL,
    document_id_field text,
    source_object_id_field text,
    external_ref_field text,
    name_field text,
    path_field text,
    mime_type_field text,
    content_field text,
    matter_key_field text,
    field_map jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT substrate_document_mappings_locator_check CHECK (((path_field IS NOT NULL) OR (content_field IS NOT NULL))),
    CONSTRAINT substrate_document_mappings_status_check CHECK ((status = ANY (ARRAY['enabled'::text, 'disabled'::text, 'testing'::text])))
);


ALTER TABLE substrate.document_mappings OWNER TO postgres;

--
-- Name: entity_mappings; Type: TABLE; Schema: substrate; Owner: postgres
--

CREATE TABLE substrate.entity_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    profile_id uuid NOT NULL,
    source_id uuid NOT NULL,
    canonical_entity text NOT NULL,
    mapping_slug text NOT NULL,
    status text DEFAULT 'enabled'::text NOT NULL,
    canonical_id_strategy text DEFAULT 'source_object_id'::text NOT NULL,
    source_object_id_field text,
    external_ref_field text,
    source_locator jsonb DEFAULT '{}'::jsonb NOT NULL,
    field_map jsonb DEFAULT '{}'::jsonb NOT NULL,
    key_map jsonb DEFAULT '{}'::jsonb NOT NULL,
    filter_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT substrate_entity_mappings_status_check CHECK ((status = ANY (ARRAY['enabled'::text, 'disabled'::text, 'testing'::text])))
);


ALTER TABLE substrate.entity_mappings OWNER TO postgres;

--
-- Name: profiles; Type: TABLE; Schema: substrate; Owner: postgres
--

CREATE TABLE substrate.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT substrate_profiles_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'disabled'::text, 'archived'::text])))
);


ALTER TABLE substrate.profiles OWNER TO postgres;

--
-- Name: resolution_log; Type: TABLE; Schema: substrate; Owner: postgres
--

CREATE TABLE substrate.resolution_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    profile_id uuid,
    source_id uuid,
    request_type text NOT NULL,
    request_key text,
    status text NOT NULL,
    duration_ms integer,
    error_code text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE substrate.resolution_log OWNER TO postgres;

--
-- Name: selection_presets; Type: TABLE; Schema: substrate; Owner: postgres
--

CREATE TABLE substrate.selection_presets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    profile_id uuid NOT NULL,
    workflow_slug text NOT NULL,
    preset_slug text NOT NULL,
    display_name text NOT NULL,
    status text DEFAULT 'enabled'::text NOT NULL,
    selection jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT substrate_selection_presets_status_check CHECK ((status = ANY (ARRAY['enabled'::text, 'disabled'::text, 'testing'::text])))
);


ALTER TABLE substrate.selection_presets OWNER TO postgres;

--
-- Name: sources; Type: TABLE; Schema: substrate; Owner: postgres
--

CREATE TABLE substrate.sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    profile_id uuid NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    source_type text NOT NULL,
    source_role text NOT NULL,
    status text DEFAULT 'enabled'::text NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    connection_ref text,
    root_ref text,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT substrate_sources_role_check CHECK ((source_role = ANY (ARRAY['system_of_record'::text, 'document_store'::text, 'derived_index'::text, 'workflow_output'::text, 'demo_seed'::text]))),
    CONSTRAINT substrate_sources_status_check CHECK ((status = ANY (ARRAY['enabled'::text, 'disabled'::text, 'testing'::text]))),
    CONSTRAINT substrate_sources_type_check CHECK ((source_type = ANY (ARRAY['demo_seed'::text, 'local_fs'::text, 'postgres'::text, 'mysql'::text, 'mssql'::text, 'sqlite'::text, 's3'::text, 'sharepoint'::text, 'imanage'::text, 'netdocuments'::text, 'api'::text])))
);


ALTER TABLE substrate.sources OWNER TO postgres;

--
-- Name: agent_definition_links; Type: TABLE; Schema: workflows; Owner: postgres
--

CREATE TABLE workflows.agent_definition_links (
    agent_slug text NOT NULL,
    workflow_slug text NOT NULL,
    purpose text DEFAULT 'step'::text NOT NULL,
    CONSTRAINT agent_definition_links_purpose_check CHECK ((purpose = ANY (ARRAY['step'::text, 'trace_review'::text]))),
    CONSTRAINT agent_definition_links_workflow_slug_check CHECK ((workflow_slug <> ''::text))
);


ALTER TABLE workflows.agent_definition_links OWNER TO postgres;

--
-- Name: agent_definition_org_overrides; Type: TABLE; Schema: workflows; Owner: postgres
--

CREATE TABLE workflows.agent_definition_org_overrides (
    agent_slug text NOT NULL,
    organization_slug text NOT NULL,
    instructions_override text,
    enabled boolean DEFAULT true NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_definition_org_overrides_instructions_override_check CHECK (((instructions_override IS NULL) OR (instructions_override <> ''::text)))
);


ALTER TABLE workflows.agent_definition_org_overrides OWNER TO postgres;

--
-- Name: agent_definition_override_history; Type: TABLE; Schema: workflows; Owner: postgres
--

CREATE TABLE workflows.agent_definition_override_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_slug text NOT NULL,
    organization_slug text NOT NULL,
    instructions text,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_definition_override_history_instructions_check CHECK (((instructions IS NULL) OR (instructions <> ''::text)))
);


ALTER TABLE workflows.agent_definition_override_history OWNER TO postgres;

--
-- Name: agent_definition_versions; Type: TABLE; Schema: workflows; Owner: postgres
--

CREATE TABLE workflows.agent_definition_versions (
    agent_slug text NOT NULL,
    version integer NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    instructions text NOT NULL,
    model_role text NOT NULL,
    output_format text NOT NULL,
    input_schema jsonb NOT NULL,
    output_schema jsonb,
    max_tokens integer NOT NULL,
    enabled boolean NOT NULL,
    updated_by uuid,
    superseded_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE workflows.agent_definition_versions OWNER TO postgres;

--
-- Name: agent_definitions; Type: TABLE; Schema: workflows; Owner: postgres
--

CREATE TABLE workflows.agent_definitions (
    slug text NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    instructions text NOT NULL,
    model_role text NOT NULL,
    output_format text NOT NULL,
    input_schema jsonb NOT NULL,
    output_schema jsonb,
    max_tokens integer NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_definitions_description_check CHECK ((description <> ''::text)),
    CONSTRAINT agent_definitions_input_schema_check CHECK ((jsonb_typeof(input_schema) = 'object'::text)),
    CONSTRAINT agent_definitions_instructions_check CHECK ((instructions <> ''::text)),
    CONSTRAINT agent_definitions_json_has_schema CHECK (((output_format = 'json'::text) = (output_schema IS NOT NULL))),
    CONSTRAINT agent_definitions_max_tokens_check CHECK ((max_tokens > 0)),
    CONSTRAINT agent_definitions_model_role_check CHECK ((model_role ~ '^[a-z][a-z0-9_-]*$'::text)),
    CONSTRAINT agent_definitions_name_check CHECK ((name <> ''::text)),
    CONSTRAINT agent_definitions_output_format_check CHECK ((output_format = ANY (ARRAY['json'::text, 'text'::text]))),
    CONSTRAINT agent_definitions_output_schema_check CHECK (((output_schema IS NULL) OR (jsonb_typeof(output_schema) = 'object'::text))),
    CONSTRAINT agent_definitions_slug_check CHECK ((slug ~ '^[a-z][a-z0-9-]*$'::text)),
    CONSTRAINT agent_definitions_version_check CHECK ((version >= 1))
);


ALTER TABLE workflows.agent_definitions OWNER TO postgres;

--
-- Name: group_items; Type: TABLE; Schema: workflows; Owner: postgres
--

CREATE TABLE workflows.group_items (
    group_id uuid NOT NULL,
    organization_slug text NOT NULL,
    workflow_slug text NOT NULL,
    "position" integer NOT NULL,
    CONSTRAINT group_items_position_check CHECK (("position" >= 0))
);


ALTER TABLE workflows.group_items OWNER TO postgres;

--
-- Name: groups; Type: TABLE; Schema: workflows; Owner: postgres
--

CREATE TABLE workflows.groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_slug text NOT NULL,
    name text NOT NULL,
    "position" integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT groups_name_check CHECK ((name <> ''::text)),
    CONSTRAINT groups_position_check CHECK (("position" >= 0))
);


ALTER TABLE workflows.groups OWNER TO postgres;

--
-- Name: human_reviews; Type: TABLE; Schema: workflows; Owner: postgres
--

CREATE TABLE workflows.human_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    organization_slug text NOT NULL,
    workflow_slug text NOT NULL,
    gate_slug text NOT NULL,
    round integer NOT NULL,
    kind text NOT NULL,
    allowed_decisions jsonb DEFAULT '[]'::jsonb NOT NULL,
    allow_item_decisions boolean DEFAULT false NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'waiting'::text NOT NULL,
    response jsonb,
    responded_by uuid,
    responded_at timestamp with time zone,
    work_task_provider text,
    work_task_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT human_reviews_allowed_decisions_check CHECK (((jsonb_typeof(allowed_decisions) = 'array'::text) AND (allowed_decisions <@ '["approve", "reject", "modify"]'::jsonb))),
    CONSTRAINT human_reviews_approval_has_decisions CHECK (((kind <> 'approval'::text) OR (jsonb_array_length(allowed_decisions) > 0))),
    CONSTRAINT human_reviews_gate_slug_check CHECK ((gate_slug <> ''::text)),
    CONSTRAINT human_reviews_kind_check CHECK ((kind = ANY (ARRAY['approval'::text, 'answer'::text]))),
    CONSTRAINT human_reviews_response_matches_status CHECK (((status = 'responded'::text) = ((response IS NOT NULL) AND (responded_by IS NOT NULL) AND (responded_at IS NOT NULL)))),
    CONSTRAINT human_reviews_round_check CHECK ((round >= 0)),
    CONSTRAINT human_reviews_status_check CHECK ((status = ANY (ARRAY['waiting'::text, 'responded'::text, 'expired'::text]))),
    CONSTRAINT human_reviews_work_task_pair CHECK (((work_task_provider IS NULL) = (work_task_id IS NULL)))
);


ALTER TABLE workflows.human_reviews OWNER TO postgres;

--
-- Name: improvement_requests; Type: TABLE; Schema: workflows; Owner: postgres
--

CREATE TABLE workflows.improvement_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_slug text NOT NULL,
    workflow_slug text NOT NULL,
    run_id uuid,
    trace_review_id uuid,
    kind text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    requested_by uuid NOT NULL,
    admin_notes text,
    decided_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT improvement_requests_description_check CHECK ((description <> ''::text)),
    CONSTRAINT improvement_requests_kind_check CHECK ((kind = ANY (ARRAY['context'::text, 'model'::text, 'workflow'::text]))),
    CONSTRAINT improvement_requests_status_check CHECK ((status = ANY (ARRAY['open'::text, 'accepted'::text, 'rejected'::text, 'done'::text]))),
    CONSTRAINT improvement_requests_title_check CHECK ((title <> ''::text))
);


ALTER TABLE workflows.improvement_requests OWNER TO postgres;

--
-- Name: issue_ledger; Type: TABLE; Schema: workflows; Owner: postgres
--

CREATE TABLE workflows.issue_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    organization_slug text NOT NULL,
    stage_slug text NOT NULL,
    issue_key text NOT NULL,
    work_unit_run_id uuid,
    source text NOT NULL,
    status text NOT NULL,
    severity text NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    finding text NOT NULL,
    recommended_action text,
    subject jsonb,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    seq bigint NOT NULL,
    CONSTRAINT issue_ledger_category_check CHECK ((category <> ''::text)),
    CONSTRAINT issue_ledger_finding_check CHECK ((finding <> ''::text)),
    CONSTRAINT issue_ledger_issue_key_check CHECK ((issue_key <> ''::text)),
    CONSTRAINT issue_ledger_severity_check CHECK ((severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text, 'info'::text]))),
    CONSTRAINT issue_ledger_source_check CHECK ((source <> ''::text)),
    CONSTRAINT issue_ledger_stage_slug_check CHECK ((stage_slug <> ''::text)),
    CONSTRAINT issue_ledger_status_check CHECK ((status = ANY (ARRAY['identified'::text, 'accepted'::text, 'rejected'::text, 'addressed'::text, 'not_addressed'::text, 'report_only'::text]))),
    CONSTRAINT issue_ledger_title_check CHECK ((title <> ''::text))
);


ALTER TABLE workflows.issue_ledger OWNER TO postgres;

--
-- Name: issue_ledger_events; Type: TABLE; Schema: workflows; Owner: postgres
--

CREATE TABLE workflows.issue_ledger_events (
    id bigint NOT NULL,
    issue_id uuid NOT NULL,
    run_id uuid NOT NULL,
    organization_slug text NOT NULL,
    from_status text,
    to_status text NOT NULL,
    actor text NOT NULL,
    rationale text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT issue_ledger_events_actor_check CHECK ((actor <> ''::text))
);


ALTER TABLE workflows.issue_ledger_events OWNER TO postgres;

--
-- Name: issue_ledger_events_id_seq; Type: SEQUENCE; Schema: workflows; Owner: postgres
--

ALTER TABLE workflows.issue_ledger_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME workflows.issue_ledger_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: issue_ledger_seq_seq; Type: SEQUENCE; Schema: workflows; Owner: postgres
--

ALTER TABLE workflows.issue_ledger ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME workflows.issue_ledger_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: model_profiles; Type: TABLE; Schema: workflows; Owner: postgres
--

CREATE TABLE workflows.model_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_slug text NOT NULL,
    workflow_slug text NOT NULL,
    role text NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT model_profiles_role_check CHECK ((role ~ '^[a-z][a-z0-9_-]*$'::text)),
    CONSTRAINT model_profiles_workflow_slug_check CHECK ((workflow_slug <> ''::text))
);


ALTER TABLE workflows.model_profiles OWNER TO postgres;

--
-- Name: org_settings; Type: TABLE; Schema: workflows; Owner: postgres
--

CREATE TABLE workflows.org_settings (
    organization_slug text NOT NULL,
    workflow_slug text NOT NULL,
    enabled boolean NOT NULL,
    lifecycle text NOT NULL,
    note text,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_settings_lifecycle_check CHECK ((lifecycle = ANY (ARRAY['newly_created'::text, 'dev'::text, 'test'::text, 'prod'::text]))),
    CONSTRAINT org_settings_note_check CHECK (((note IS NULL) OR (note <> ''::text)))
);


ALTER TABLE workflows.org_settings OWNER TO postgres;

--
-- Name: participant_runs; Type: TABLE; Schema: workflows; Owner: postgres
--

CREATE TABLE workflows.participant_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_unit_run_id uuid NOT NULL,
    run_id uuid NOT NULL,
    organization_slug text NOT NULL,
    "position" integer NOT NULL,
    stage text NOT NULL,
    agent_slug text NOT NULL,
    agent_version integer,
    model_role text,
    provider text,
    model text,
    llm_request_id text,
    status text NOT NULL,
    input_ref jsonb,
    output_ref jsonb,
    raw_output text,
    error text,
    input_tokens integer,
    output_tokens integer,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    duration_ms integer,
    CONSTRAINT participant_runs_duration_ms_check CHECK ((duration_ms >= 0)),
    CONSTRAINT participant_runs_failure_has_error CHECK (((status <> 'failed'::text) OR (error IS NOT NULL))),
    CONSTRAINT participant_runs_finished CHECK (((status = 'running'::text) = (completed_at IS NULL))),
    CONSTRAINT participant_runs_position_check CHECK (("position" >= 0)),
    CONSTRAINT participant_runs_stage_check CHECK ((stage <> ''::text)),
    CONSTRAINT participant_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text])))
);


ALTER TABLE workflows.participant_runs OWNER TO postgres;

--
-- Name: registry; Type: TABLE; Schema: workflows; Owner: postgres
--

CREATE TABLE workflows.registry (
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    icon text NOT NULL,
    default_group text NOT NULL,
    default_lifecycle text NOT NULL,
    hitl boolean NOT NULL,
    data_classification text NOT NULL,
    entry_kind text NOT NULL,
    organization_slugs jsonb NOT NULL,
    active boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT registry_data_classification_check CHECK ((data_classification = ANY (ARRAY['public'::text, 'internal'::text, 'confidential'::text, 'restricted'::text]))),
    CONSTRAINT registry_default_group_check CHECK ((default_group <> ''::text)),
    CONSTRAINT registry_default_lifecycle_check CHECK ((default_lifecycle = ANY (ARRAY['newly_created'::text, 'dev'::text, 'test'::text, 'prod'::text]))),
    CONSTRAINT registry_entry_kind_check CHECK ((entry_kind = ANY (ARRAY['runtime'::text, 'custom'::text, 'rest'::text]))),
    CONSTRAINT registry_icon_check CHECK ((icon <> ''::text)),
    CONSTRAINT registry_name_check CHECK ((name <> ''::text)),
    CONSTRAINT registry_organization_slugs_array CHECK (((jsonb_typeof(organization_slugs) = 'array'::text) AND (jsonb_array_length(organization_slugs) > 0))),
    CONSTRAINT registry_slug_check CHECK ((slug <> ''::text))
);


ALTER TABLE workflows.registry OWNER TO postgres;

--
-- Name: runs; Type: TABLE; Schema: workflows; Owner: postgres
--

CREATE TABLE workflows.runs (
    id uuid NOT NULL,
    organization_slug text NOT NULL,
    user_id uuid NOT NULL,
    workflow_slug text NOT NULL,
    execution_context jsonb NOT NULL,
    status text NOT NULL,
    current_step text,
    progress smallint,
    last_message text,
    error text,
    input jsonb NOT NULL,
    result jsonb,
    pending_action jsonb,
    access_control jsonb NOT NULL,
    attempt integer DEFAULT 0 NOT NULL,
    max_attempts integer NOT NULL,
    lease_expires_at timestamp with time zone,
    worker_id text,
    queued_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    documents jsonb DEFAULT '[]'::jsonb NOT NULL,
    model_profile jsonb DEFAULT '{}'::jsonb NOT NULL,
    parent_run_id uuid,
    restart jsonb,
    live jsonb,
    CONSTRAINT runs_access_control_check CHECK (((access_control ->> 'mode'::text) = ANY (ARRAY['org'::text, 'owner'::text, 'allowlist'::text]))),
    CONSTRAINT runs_attempt_check CHECK ((attempt >= 0)),
    CONSTRAINT runs_context_matches_row CHECK ((((execution_context ->> 'conversationId'::text) = (id)::text) AND ((execution_context ->> 'orgSlug'::text) = organization_slug) AND ((execution_context ->> 'userId'::text) = (user_id)::text) AND ((execution_context ->> 'agentSlug'::text) = workflow_slug))),
    CONSTRAINT runs_documents_check CHECK ((jsonb_typeof(documents) = 'array'::text)),
    CONSTRAINT runs_lease_only_while_held CHECK (((worker_id IS NULL) = (lease_expires_at IS NULL))),
    CONSTRAINT runs_max_attempts_check CHECK ((max_attempts >= 1)),
    CONSTRAINT runs_model_profile_check CHECK ((jsonb_typeof(model_profile) = 'object'::text)),
    CONSTRAINT runs_progress_check CHECK (((progress >= 0) AND (progress <= 100))),
    CONSTRAINT runs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'awaiting_review'::text, 'awaiting_answer'::text, 'cancel_requested'::text, 'canceled'::text, 'completed'::text, 'failed'::text])))
);


ALTER TABLE workflows.runs OWNER TO postgres;

--
-- Name: trace_reviews; Type: TABLE; Schema: workflows; Owner: postgres
--

CREATE TABLE workflows.trace_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    organization_slug text NOT NULL,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    reviewer_agent text NOT NULL,
    requested_by uuid NOT NULL,
    notes text,
    status text NOT NULL,
    result jsonb,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    target_label text NOT NULL,
    CONSTRAINT trace_reviews_check CHECK (((status = 'completed'::text) = (result IS NOT NULL))),
    CONSTRAINT trace_reviews_check1 CHECK (((status = 'failed'::text) = (error IS NOT NULL))),
    CONSTRAINT trace_reviews_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text]))),
    CONSTRAINT trace_reviews_target_label_check CHECK ((target_label <> ''::text)),
    CONSTRAINT trace_reviews_target_type_check CHECK ((target_type = ANY (ARRAY['work_unit'::text, 'participant'::text])))
);


ALTER TABLE workflows.trace_reviews OWNER TO postgres;

--
-- Name: work_unit_runs; Type: TABLE; Schema: workflows; Owner: postgres
--

CREATE TABLE workflows.work_unit_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    organization_slug text NOT NULL,
    ordinal bigint NOT NULL,
    work_unit_slug text NOT NULL,
    pattern text NOT NULL,
    status text NOT NULL,
    input_ref jsonb,
    output_ref jsonb,
    error text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    duration_ms integer,
    CONSTRAINT work_unit_runs_duration_ms_check CHECK ((duration_ms >= 0)),
    CONSTRAINT work_unit_runs_failure_has_error CHECK (((status <> 'failed'::text) OR (error IS NOT NULL))),
    CONSTRAINT work_unit_runs_finished CHECK (((status = 'running'::text) = (completed_at IS NULL))),
    CONSTRAINT work_unit_runs_pattern_check CHECK ((pattern = ANY (ARRAY['solo'::text, 'panel'::text, 'red_blue'::text, 'arbitrated'::text, 'summarizer'::text, 'human'::text, 'check'::text]))),
    CONSTRAINT work_unit_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'completed_partial'::text, 'failed'::text]))),
    CONSTRAINT work_unit_runs_work_unit_slug_check CHECK ((work_unit_slug <> ''::text))
);


ALTER TABLE workflows.work_unit_runs OWNER TO postgres;

--
-- Name: work_unit_runs_ordinal_seq; Type: SEQUENCE; Schema: workflows; Owner: postgres
--

ALTER TABLE workflows.work_unit_runs ALTER COLUMN ordinal ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME workflows.work_unit_runs_ordinal_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: observability_events id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.observability_events ALTER COLUMN id SET DEFAULT nextval('public.observability_events_id_seq'::regclass);


--
-- Name: a2a_inbound_nonces a2a_inbound_nonces_pkey; Type: CONSTRAINT; Schema: ambient; Owner: postgres
--

ALTER TABLE ONLY ambient.a2a_inbound_nonces
    ADD CONSTRAINT a2a_inbound_nonces_pkey PRIMARY KEY (nonce);


--
-- Name: a2a_messages a2a_messages_pkey; Type: CONSTRAINT; Schema: ambient; Owner: postgres
--

ALTER TABLE ONLY ambient.a2a_messages
    ADD CONSTRAINT a2a_messages_pkey PRIMARY KEY (id);


--
-- Name: adapter_state adapter_state_pkey; Type: CONSTRAINT; Schema: ambient; Owner: postgres
--

ALTER TABLE ONLY ambient.adapter_state
    ADD CONSTRAINT adapter_state_pkey PRIMARY KEY (id);


--
-- Name: adapter_state adapter_state_trigger_id_key; Type: CONSTRAINT; Schema: ambient; Owner: postgres
--

ALTER TABLE ONLY ambient.adapter_state
    ADD CONSTRAINT adapter_state_trigger_id_key UNIQUE (trigger_id);


--
-- Name: database_change_events database_change_events_pkey; Type: CONSTRAINT; Schema: ambient; Owner: postgres
--

ALTER TABLE ONLY ambient.database_change_events
    ADD CONSTRAINT database_change_events_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: ambient; Owner: postgres
--

ALTER TABLE ONLY ambient.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: external_agents external_agents_org_slug_agent_id_key; Type: CONSTRAINT; Schema: ambient; Owner: postgres
--

ALTER TABLE ONLY ambient.external_agents
    ADD CONSTRAINT external_agents_org_slug_agent_id_key UNIQUE (org_slug, agent_id);


--
-- Name: external_agents external_agents_pkey; Type: CONSTRAINT; Schema: ambient; Owner: postgres
--

ALTER TABLE ONLY ambient.external_agents
    ADD CONSTRAINT external_agents_pkey PRIMARY KEY (id);


--
-- Name: trigger_executions trigger_executions_pkey; Type: CONSTRAINT; Schema: ambient; Owner: postgres
--

ALTER TABLE ONLY ambient.trigger_executions
    ADD CONSTRAINT trigger_executions_pkey PRIMARY KEY (id);


--
-- Name: triggers triggers_pkey; Type: CONSTRAINT; Schema: ambient; Owner: postgres
--

ALTER TABLE ONLY ambient.triggers
    ADD CONSTRAINT triggers_pkey PRIMARY KEY (id);


--
-- Name: auth_identity_links auth_identity_links_issuer_subject_key; Type: CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.auth_identity_links
    ADD CONSTRAINT auth_identity_links_issuer_subject_key UNIQUE (issuer, subject);


--
-- Name: auth_identity_links auth_identity_links_pkey; Type: CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.auth_identity_links
    ADD CONSTRAINT auth_identity_links_pkey PRIMARY KEY (id);


--
-- Name: org_entitlements org_entitlements_pkey; Type: CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.org_entitlements
    ADD CONSTRAINT org_entitlements_pkey PRIMARY KEY (id);


--
-- Name: org_entitlements org_entitlements_unique; Type: CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.org_entitlements
    ADD CONSTRAINT org_entitlements_unique UNIQUE (org_slug, product);


--
-- Name: rbac_audit_log rbac_audit_log_pkey; Type: CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.rbac_audit_log
    ADD CONSTRAINT rbac_audit_log_pkey PRIMARY KEY (id);


--
-- Name: rbac_permissions rbac_permissions_name_key; Type: CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.rbac_permissions
    ADD CONSTRAINT rbac_permissions_name_key UNIQUE (name);


--
-- Name: rbac_permissions rbac_permissions_pkey; Type: CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.rbac_permissions
    ADD CONSTRAINT rbac_permissions_pkey PRIMARY KEY (id);


--
-- Name: rbac_role_permissions rbac_role_permissions_pkey; Type: CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.rbac_role_permissions
    ADD CONSTRAINT rbac_role_permissions_pkey PRIMARY KEY (id);


--
-- Name: rbac_role_permissions rbac_role_permissions_role_id_permission_id_resource_type_r_key; Type: CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.rbac_role_permissions
    ADD CONSTRAINT rbac_role_permissions_role_id_permission_id_resource_type_r_key UNIQUE (role_id, permission_id, resource_type, resource_id);


--
-- Name: rbac_roles rbac_roles_name_key; Type: CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.rbac_roles
    ADD CONSTRAINT rbac_roles_name_key UNIQUE (name);


--
-- Name: rbac_roles rbac_roles_pkey; Type: CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.rbac_roles
    ADD CONSTRAINT rbac_roles_pkey PRIMARY KEY (id);


--
-- Name: rbac_user_org_roles rbac_user_org_roles_pkey; Type: CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.rbac_user_org_roles
    ADD CONSTRAINT rbac_user_org_roles_pkey PRIMARY KEY (id);


--
-- Name: rbac_user_org_roles rbac_user_org_roles_user_id_organization_slug_role_id_key; Type: CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.rbac_user_org_roles
    ADD CONSTRAINT rbac_user_org_roles_user_id_organization_slug_role_id_key UNIQUE (user_id, organization_slug, role_id);


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);


--
-- Name: team_members team_members_team_id_user_id_key; Type: CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.team_members
    ADD CONSTRAINT team_members_team_id_user_id_key UNIQUE (team_id, user_id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: submittal_decisions submittal_decisions_pkey; Type: CONSTRAINT; Schema: building; Owner: postgres
--

ALTER TABLE ONLY building.submittal_decisions
    ADD CONSTRAINT submittal_decisions_pkey PRIMARY KEY (run_id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: company; Owner: postgres
--

ALTER TABLE ONLY company.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: discovery_signals discovery_signals_pkey; Type: CONSTRAINT; Schema: company; Owner: postgres
--

ALTER TABLE ONLY company.discovery_signals
    ADD CONSTRAINT discovery_signals_pkey PRIMARY KEY (id);


--
-- Name: outreach outreach_pkey; Type: CONSTRAINT; Schema: company; Owner: postgres
--

ALTER TABLE ONLY company.outreach
    ADD CONSTRAINT outreach_pkey PRIMARY KEY (id);


--
-- Name: agent_article_outputs agent_article_outputs_article_id_agent_type_key; Type: CONSTRAINT; Schema: crawler; Owner: postgres
--

ALTER TABLE ONLY crawler.agent_article_outputs
    ADD CONSTRAINT agent_article_outputs_article_id_agent_type_key UNIQUE (article_id, agent_type);


--
-- Name: agent_article_outputs agent_article_outputs_pkey; Type: CONSTRAINT; Schema: crawler; Owner: postgres
--

ALTER TABLE ONLY crawler.agent_article_outputs
    ADD CONSTRAINT agent_article_outputs_pkey PRIMARY KEY (id);


--
-- Name: articles articles_organization_slug_content_hash_key; Type: CONSTRAINT; Schema: crawler; Owner: postgres
--

ALTER TABLE ONLY crawler.articles
    ADD CONSTRAINT articles_organization_slug_content_hash_key UNIQUE (organization_slug, content_hash);


--
-- Name: articles articles_pkey; Type: CONSTRAINT; Schema: crawler; Owner: postgres
--

ALTER TABLE ONLY crawler.articles
    ADD CONSTRAINT articles_pkey PRIMARY KEY (id);


--
-- Name: source_crawls source_crawls_pkey; Type: CONSTRAINT; Schema: crawler; Owner: postgres
--

ALTER TABLE ONLY crawler.source_crawls
    ADD CONSTRAINT source_crawls_pkey PRIMARY KEY (id);


--
-- Name: sources sources_organization_slug_url_key; Type: CONSTRAINT; Schema: crawler; Owner: postgres
--

ALTER TABLE ONLY crawler.sources
    ADD CONSTRAINT sources_organization_slug_url_key UNIQUE (organization_slug, url);


--
-- Name: sources sources_pkey; Type: CONSTRAINT; Schema: crawler; Owner: postgres
--

ALTER TABLE ONLY crawler.sources
    ADD CONSTRAINT sources_pkey PRIMARY KEY (id);


--
-- Name: cad_outputs cad_outputs_pkey; Type: CONSTRAINT; Schema: engineering; Owner: postgres
--

ALTER TABLE ONLY engineering.cad_outputs
    ADD CONSTRAINT cad_outputs_pkey PRIMARY KEY (id);


--
-- Name: drawings drawings_pkey; Type: CONSTRAINT; Schema: engineering; Owner: postgres
--

ALTER TABLE ONLY engineering.drawings
    ADD CONSTRAINT drawings_pkey PRIMARY KEY (id);


--
-- Name: execution_log execution_log_pkey; Type: CONSTRAINT; Schema: engineering; Owner: postgres
--

ALTER TABLE ONLY engineering.execution_log
    ADD CONSTRAINT execution_log_pkey PRIMARY KEY (id);


--
-- Name: generated_code generated_code_pkey; Type: CONSTRAINT; Schema: engineering; Owner: postgres
--

ALTER TABLE ONLY engineering.generated_code
    ADD CONSTRAINT generated_code_pkey PRIMARY KEY (id);


--
-- Name: part_library part_library_pkey; Type: CONSTRAINT; Schema: engineering; Owner: postgres
--

ALTER TABLE ONLY engineering.part_library
    ADD CONSTRAINT part_library_pkey PRIMARY KEY (id);


--
-- Name: postmortem_tasks postmortem_tasks_pkey; Type: CONSTRAINT; Schema: engineering; Owner: postgres
--

ALTER TABLE ONLY engineering.postmortem_tasks
    ADD CONSTRAINT postmortem_tasks_pkey PRIMARY KEY (run_id, item_key);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: engineering; Owner: postgres
--

ALTER TABLE ONLY engineering.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: finance; Owner: postgres
--

ALTER TABLE ONLY finance.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_run_id_key; Type: CONSTRAINT; Schema: finance; Owner: postgres
--

ALTER TABLE ONLY finance.invoices
    ADD CONSTRAINT invoices_run_id_key UNIQUE (run_id);


--
-- Name: po_lines po_lines_pkey; Type: CONSTRAINT; Schema: finance; Owner: postgres
--

ALTER TABLE ONLY finance.po_lines
    ADD CONSTRAINT po_lines_pkey PRIMARY KEY (po_id, line_no);


--
-- Name: purchase_orders purchase_orders_organization_slug_po_number_key; Type: CONSTRAINT; Schema: finance; Owner: postgres
--

ALTER TABLE ONLY finance.purchase_orders
    ADD CONSTRAINT purchase_orders_organization_slug_po_number_key UNIQUE (organization_slug, po_number);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: finance; Owner: postgres
--

ALTER TABLE ONLY finance.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: callers callers_card_url_key; Type: CONSTRAINT; Schema: gatehouse; Owner: postgres
--

ALTER TABLE ONLY gatehouse.callers
    ADD CONSTRAINT callers_card_url_key UNIQUE (card_url);


--
-- Name: callers callers_pkey; Type: CONSTRAINT; Schema: gatehouse; Owner: postgres
--

ALTER TABLE ONLY gatehouse.callers
    ADD CONSTRAINT callers_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: gatehouse; Owner: postgres
--

ALTER TABLE ONLY gatehouse.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: used_tokens used_tokens_pkey; Type: CONSTRAINT; Schema: gatehouse; Owner: postgres
--

ALTER TABLE ONLY gatehouse.used_tokens
    ADD CONSTRAINT used_tokens_pkey PRIMARY KEY (caller_id, jti);


--
-- Name: a2a_messages a2a_messages_pkey; Type: CONSTRAINT; Schema: guardhouse; Owner: postgres
--

ALTER TABLE ONLY guardhouse.a2a_messages
    ADD CONSTRAINT a2a_messages_pkey PRIMARY KEY (id);


--
-- Name: external_agents external_agents_org_slug_agent_id_key; Type: CONSTRAINT; Schema: guardhouse; Owner: postgres
--

ALTER TABLE ONLY guardhouse.external_agents
    ADD CONSTRAINT external_agents_org_slug_agent_id_key UNIQUE (org_slug, agent_id);


--
-- Name: external_agents external_agents_pkey; Type: CONSTRAINT; Schema: guardhouse; Owner: postgres
--

ALTER TABLE ONLY guardhouse.external_agents
    ADD CONSTRAINT external_agents_pkey PRIMARY KEY (id);


--
-- Name: nonces_seen nonces_seen_pkey; Type: CONSTRAINT; Schema: guardhouse; Owner: postgres
--

ALTER TABLE ONLY guardhouse.nonces_seen
    ADD CONSTRAINT nonces_seen_pkey PRIMARY KEY (nonce);


--
-- Name: new_hires new_hires_pkey; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY hr.new_hires
    ADD CONSTRAINT new_hires_pkey PRIMARY KEY (id);


--
-- Name: onboarding_tasks onboarding_tasks_pkey; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY hr.onboarding_tasks
    ADD CONSTRAINT onboarding_tasks_pkey PRIMARY KEY (run_id, item_key);


--
-- Name: competitor_snapshots competitor_snapshots_pkey; Type: CONSTRAINT; Schema: marketing; Owner: postgres
--

ALTER TABLE ONLY marketing.competitor_snapshots
    ADD CONSTRAINT competitor_snapshots_pkey PRIMARY KEY (id);


--
-- Name: competitor_sources competitor_sources_organization_slug_url_key; Type: CONSTRAINT; Schema: marketing; Owner: postgres
--

ALTER TABLE ONLY marketing.competitor_sources
    ADD CONSTRAINT competitor_sources_organization_slug_url_key UNIQUE (organization_slug, url);


--
-- Name: competitor_sources competitor_sources_pkey; Type: CONSTRAINT; Schema: marketing; Owner: postgres
--

ALTER TABLE ONLY marketing.competitor_sources
    ADD CONSTRAINT competitor_sources_pkey PRIMARY KEY (id);


--
-- Name: swarm_content_types swarm_content_types_pkey; Type: CONSTRAINT; Schema: marketing; Owner: postgres
--

ALTER TABLE ONLY marketing.swarm_content_types
    ADD CONSTRAINT swarm_content_types_pkey PRIMARY KEY (organization_slug, slug);


--
-- Name: swarm_editors swarm_editors_pkey; Type: CONSTRAINT; Schema: marketing; Owner: postgres
--

ALTER TABLE ONLY marketing.swarm_editors
    ADD CONSTRAINT swarm_editors_pkey PRIMARY KEY (organization_slug, slug);


--
-- Name: swarm_evaluators swarm_evaluators_pkey; Type: CONSTRAINT; Schema: marketing; Owner: postgres
--

ALTER TABLE ONLY marketing.swarm_evaluators
    ADD CONSTRAINT swarm_evaluators_pkey PRIMARY KEY (organization_slug, slug);


--
-- Name: swarm_facets swarm_facets_pkey; Type: CONSTRAINT; Schema: marketing; Owner: postgres
--

ALTER TABLE ONLY marketing.swarm_facets
    ADD CONSTRAINT swarm_facets_pkey PRIMARY KEY (organization_slug, key);


--
-- Name: swarm_weights swarm_weights_pkey; Type: CONSTRAINT; Schema: marketing; Owner: postgres
--

ALTER TABLE ONLY marketing.swarm_weights
    ADD CONSTRAINT swarm_weights_pkey PRIMARY KEY (organization_slug, owner_kind, owner_slug, facet_key);


--
-- Name: swarm_writers swarm_writers_pkey; Type: CONSTRAINT; Schema: marketing; Owner: postgres
--

ALTER TABLE ONLY marketing.swarm_writers
    ADD CONSTRAINT swarm_writers_pkey PRIMARY KEY (organization_slug, slug);


--
-- Name: channel_messages channel_messages_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.channel_messages
    ADD CONSTRAINT channel_messages_pkey PRIMARY KEY (id);


--
-- Name: channels channels_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.channels
    ADD CONSTRAINT channels_pkey PRIMARY KEY (id);


--
-- Name: efforts efforts_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.efforts
    ADD CONSTRAINT efforts_pkey PRIMARY KEY (id);


--
-- Name: journey_templates journey_templates_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.journey_templates
    ADD CONSTRAINT journey_templates_pkey PRIMARY KEY (id);


--
-- Name: journey_templates journey_templates_slug_key; Type: CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.journey_templates
    ADD CONSTRAINT journey_templates_slug_key UNIQUE (slug);


--
-- Name: learning_progress learning_progress_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.learning_progress
    ADD CONSTRAINT learning_progress_pkey PRIMARY KEY (id);


--
-- Name: learning_progress learning_progress_user_id_organization_slug_milestone_key_key; Type: CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.learning_progress
    ADD CONSTRAINT learning_progress_user_id_organization_slug_milestone_key_key UNIQUE (user_id, organization_slug, milestone_key);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: shared_tasks shared_tasks_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.shared_tasks
    ADD CONSTRAINT shared_tasks_pkey PRIMARY KEY (id);


--
-- Name: sprints sprints_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.sprints
    ADD CONSTRAINT sprints_pkey PRIMARY KEY (id);


--
-- Name: task_collaborators task_collaborators_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.task_collaborators
    ADD CONSTRAINT task_collaborators_pkey PRIMARY KEY (id);


--
-- Name: task_update_requests task_update_requests_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.task_update_requests
    ADD CONSTRAINT task_update_requests_pkey PRIMARY KEY (id);


--
-- Name: task_watchers task_watchers_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.task_watchers
    ADD CONSTRAINT task_watchers_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: team_files team_files_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.team_files
    ADD CONSTRAINT team_files_pkey PRIMARY KEY (id);


--
-- Name: timer_state timer_state_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.timer_state
    ADD CONSTRAINT timer_state_pkey PRIMARY KEY (id);


--
-- Name: user_presence user_presence_pkey; Type: CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.user_presence
    ADD CONSTRAINT user_presence_pkey PRIMARY KEY (user_id);


--
-- Name: agent_self_modification_log agent_self_modification_log_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.agent_self_modification_log
    ADD CONSTRAINT agent_self_modification_log_pkey PRIMARY KEY (id);


--
-- Name: analyst_adaptation_diffs analyst_adaptation_diffs_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analyst_adaptation_diffs
    ADD CONSTRAINT analyst_adaptation_diffs_pkey PRIMARY KEY (id);


--
-- Name: analyst_assessments analyst_assessments_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analyst_assessments
    ADD CONSTRAINT analyst_assessments_pkey PRIMARY KEY (id);


--
-- Name: analyst_context_versions analyst_context_versions_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analyst_context_versions
    ADD CONSTRAINT analyst_context_versions_pkey PRIMARY KEY (id);


--
-- Name: analyst_overrides analyst_overrides_analyst_id_universe_id_target_id_key; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analyst_overrides
    ADD CONSTRAINT analyst_overrides_analyst_id_universe_id_target_id_key UNIQUE (analyst_id, universe_id, target_id);


--
-- Name: analyst_overrides analyst_overrides_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analyst_overrides
    ADD CONSTRAINT analyst_overrides_pkey PRIMARY KEY (id);


--
-- Name: analyst_performance_metrics analyst_performance_metrics_analyst_id_fork_type_metric_dat_key; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analyst_performance_metrics
    ADD CONSTRAINT analyst_performance_metrics_analyst_id_fork_type_metric_dat_key UNIQUE (analyst_id, fork_type, metric_date);


--
-- Name: analyst_performance_metrics analyst_performance_metrics_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analyst_performance_metrics
    ADD CONSTRAINT analyst_performance_metrics_pkey PRIMARY KEY (id);


--
-- Name: analyst_portfolios analyst_portfolios_analyst_id_fork_type_key; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analyst_portfolios
    ADD CONSTRAINT analyst_portfolios_analyst_id_fork_type_key UNIQUE (analyst_id, fork_type);


--
-- Name: analyst_portfolios analyst_portfolios_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analyst_portfolios
    ADD CONSTRAINT analyst_portfolios_pkey PRIMARY KEY (id);


--
-- Name: analyst_positions analyst_positions_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analyst_positions
    ADD CONSTRAINT analyst_positions_pkey PRIMARY KEY (id);


--
-- Name: analysts analysts_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analysts
    ADD CONSTRAINT analysts_pkey PRIMARY KEY (id);


--
-- Name: daily_postmortem_recommendations daily_postmortem_recommendations_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.daily_postmortem_recommendations
    ADD CONSTRAINT daily_postmortem_recommendations_pkey PRIMARY KEY (id);


--
-- Name: daily_postmortem_runs daily_postmortem_runs_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.daily_postmortem_runs
    ADD CONSTRAINT daily_postmortem_runs_pkey PRIMARY KEY (id);


--
-- Name: eod_settlement_log eod_settlement_log_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.eod_settlement_log
    ADD CONSTRAINT eod_settlement_log_pkey PRIMARY KEY (id);


--
-- Name: eod_settlement_log eod_settlement_log_settlement_date_key; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.eod_settlement_log
    ADD CONSTRAINT eod_settlement_log_settlement_date_key UNIQUE (settlement_date);


--
-- Name: evaluations evaluations_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.evaluations
    ADD CONSTRAINT evaluations_pkey PRIMARY KEY (id);


--
-- Name: evaluations evaluations_prediction_id_key; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.evaluations
    ADD CONSTRAINT evaluations_prediction_id_key UNIQUE (prediction_id);


--
-- Name: fork_learning_exchanges fork_learning_exchanges_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.fork_learning_exchanges
    ADD CONSTRAINT fork_learning_exchanges_pkey PRIMARY KEY (id);


--
-- Name: learning_lineage learning_lineage_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.learning_lineage
    ADD CONSTRAINT learning_lineage_pkey PRIMARY KEY (id);


--
-- Name: learning_queue learning_queue_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.learning_queue
    ADD CONSTRAINT learning_queue_pkey PRIMARY KEY (id);


--
-- Name: learnings learnings_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.learnings
    ADD CONSTRAINT learnings_pkey PRIMARY KEY (id);


--
-- Name: missed_opportunities missed_opportunities_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.missed_opportunities
    ADD CONSTRAINT missed_opportunities_pkey PRIMARY KEY (id);


--
-- Name: position_sizing_config position_sizing_config_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.position_sizing_config
    ADD CONSTRAINT position_sizing_config_pkey PRIMARY KEY (id);


--
-- Name: position_sizing_config position_sizing_config_tier_unique; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.position_sizing_config
    ADD CONSTRAINT position_sizing_config_tier_unique UNIQUE (org_slug, tier_name);


--
-- Name: predictions predictions_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.predictions
    ADD CONSTRAINT predictions_pkey PRIMARY KEY (id);


--
-- Name: predictors predictors_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.predictors
    ADD CONSTRAINT predictors_pkey PRIMARY KEY (id);


--
-- Name: replay_test_results replay_test_results_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.replay_test_results
    ADD CONSTRAINT replay_test_results_pkey PRIMARY KEY (id);


--
-- Name: replay_test_snapshots replay_test_snapshots_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.replay_test_snapshots
    ADD CONSTRAINT replay_test_snapshots_pkey PRIMARY KEY (id);


--
-- Name: replay_tests replay_tests_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.replay_tests
    ADD CONSTRAINT replay_tests_pkey PRIMARY KEY (id);


--
-- Name: review_queue review_queue_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.review_queue
    ADD CONSTRAINT review_queue_pkey PRIMARY KEY (id);


--
-- Name: review_queue review_queue_signal_id_key; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.review_queue
    ADD CONSTRAINT review_queue_signal_id_key UNIQUE (signal_id);


--
-- Name: runner_context_versions runner_context_versions_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.runner_context_versions
    ADD CONSTRAINT runner_context_versions_pkey PRIMARY KEY (id);


--
-- Name: scenario_runs scenario_runs_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.scenario_runs
    ADD CONSTRAINT scenario_runs_pkey PRIMARY KEY (id);


--
-- Name: signals signals_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.signals
    ADD CONSTRAINT signals_pkey PRIMARY KEY (id);


--
-- Name: snapshots snapshots_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.snapshots
    ADD CONSTRAINT snapshots_pkey PRIMARY KEY (id);


--
-- Name: source_subscriptions source_subscriptions_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.source_subscriptions
    ADD CONSTRAINT source_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: source_subscriptions source_subscriptions_source_id_target_id_key; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.source_subscriptions
    ADD CONSTRAINT source_subscriptions_source_id_target_id_key UNIQUE (source_id, target_id);


--
-- Name: strategies strategies_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.strategies
    ADD CONSTRAINT strategies_pkey PRIMARY KEY (id);


--
-- Name: strategies strategies_slug_key; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.strategies
    ADD CONSTRAINT strategies_slug_key UNIQUE (slug);


--
-- Name: target_context_versions target_context_versions_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.target_context_versions
    ADD CONSTRAINT target_context_versions_pkey PRIMARY KEY (id);


--
-- Name: target_snapshots target_snapshots_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.target_snapshots
    ADD CONSTRAINT target_snapshots_pkey PRIMARY KEY (id);


--
-- Name: targets targets_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.targets
    ADD CONSTRAINT targets_pkey PRIMARY KEY (id);


--
-- Name: targets targets_universe_id_symbol_key; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.targets
    ADD CONSTRAINT targets_universe_id_symbol_key UNIQUE (universe_id, symbol);


--
-- Name: test_articles test_articles_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.test_articles
    ADD CONSTRAINT test_articles_pkey PRIMARY KEY (id);


--
-- Name: test_audit_log test_audit_log_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.test_audit_log
    ADD CONSTRAINT test_audit_log_pkey PRIMARY KEY (id);


--
-- Name: test_price_data test_price_data_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.test_price_data
    ADD CONSTRAINT test_price_data_pkey PRIMARY KEY (id);


--
-- Name: test_scenarios test_scenarios_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.test_scenarios
    ADD CONSTRAINT test_scenarios_pkey PRIMARY KEY (id);


--
-- Name: test_target_mirrors test_target_mirrors_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.test_target_mirrors
    ADD CONSTRAINT test_target_mirrors_pkey PRIMARY KEY (id);


--
-- Name: tool_requests tool_requests_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.tool_requests
    ADD CONSTRAINT tool_requests_pkey PRIMARY KEY (id);


--
-- Name: universe_context_versions universe_context_versions_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.universe_context_versions
    ADD CONSTRAINT universe_context_versions_pkey PRIMARY KEY (id);


--
-- Name: universes universes_organization_slug_agent_slug_name_key; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.universes
    ADD CONSTRAINT universes_organization_slug_agent_slug_name_key UNIQUE (organization_slug, agent_slug, name);


--
-- Name: universes universes_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.universes
    ADD CONSTRAINT universes_pkey PRIMARY KEY (id);


--
-- Name: test_price_data uq_test_price_data_symbol_timestamp; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.test_price_data
    ADD CONSTRAINT uq_test_price_data_symbol_timestamp UNIQUE (organization_slug, symbol, price_timestamp);


--
-- Name: test_target_mirrors uq_test_target_mirrors_real; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.test_target_mirrors
    ADD CONSTRAINT uq_test_target_mirrors_real UNIQUE (real_target_id);


--
-- Name: test_target_mirrors uq_test_target_mirrors_test; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.test_target_mirrors
    ADD CONSTRAINT uq_test_target_mirrors_test UNIQUE (test_target_id);


--
-- Name: user_portfolios user_portfolios_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.user_portfolios
    ADD CONSTRAINT user_portfolios_pkey PRIMARY KEY (id);


--
-- Name: user_portfolios user_portfolios_user_id_org_slug_key; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.user_portfolios
    ADD CONSTRAINT user_portfolios_user_id_org_slug_key UNIQUE (user_id, org_slug);


--
-- Name: user_positions user_positions_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.user_positions
    ADD CONSTRAINT user_positions_pkey PRIMARY KEY (id);


--
-- Name: user_trade_queue user_trade_queue_pkey; Type: CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.user_trade_queue
    ADD CONSTRAINT user_trade_queue_pkey PRIMARY KEY (id);


--
-- Name: agent_pipelines agent_pipelines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_pipelines
    ADD CONSTRAINT agent_pipelines_pkey PRIMARY KEY (id);


--
-- Name: agents agents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_pkey PRIMARY KEY (slug);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: channel_message_log channel_message_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.channel_message_log
    ADD CONSTRAINT channel_message_log_pkey PRIMARY KEY (id);


--
-- Name: channel_users channel_users_channel_channel_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.channel_users
    ADD CONSTRAINT channel_users_channel_channel_user_id_key UNIQUE (channel, channel_user_id);


--
-- Name: channel_users channel_users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.channel_users
    ADD CONSTRAINT channel_users_pkey PRIMARY KEY (id);


--
-- Name: checkpoint_blobs checkpoint_blobs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.checkpoint_blobs
    ADD CONSTRAINT checkpoint_blobs_pkey PRIMARY KEY (thread_id, checkpoint_ns, channel, version);


--
-- Name: checkpoint_migrations checkpoint_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.checkpoint_migrations
    ADD CONSTRAINT checkpoint_migrations_pkey PRIMARY KEY (v);


--
-- Name: checkpoint_writes checkpoint_writes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.checkpoint_writes
    ADD CONSTRAINT checkpoint_writes_pkey PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx);


--
-- Name: checkpoints checkpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.checkpoints
    ADD CONSTRAINT checkpoints_pkey PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id);


--
-- Name: cidafm_commands cidafm_commands_command_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cidafm_commands
    ADD CONSTRAINT cidafm_commands_command_name_key UNIQUE (command_name);


--
-- Name: cidafm_commands cidafm_commands_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cidafm_commands
    ADD CONSTRAINT cidafm_commands_pkey PRIMARY KEY (id);


--
-- Name: conversation_messages conversation_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversation_messages
    ADD CONSTRAINT conversation_messages_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: deliverable_versions deliverable_versions_deliverable_id_version_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deliverable_versions
    ADD CONSTRAINT deliverable_versions_deliverable_id_version_number_key UNIQUE (deliverable_id, version_number);


--
-- Name: deliverable_versions deliverable_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deliverable_versions
    ADD CONSTRAINT deliverable_versions_pkey PRIMARY KEY (id);


--
-- Name: deliverables deliverables_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deliverables
    ADD CONSTRAINT deliverables_pkey PRIMARY KEY (id);


--
-- Name: installed_modules installed_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.installed_modules
    ADD CONSTRAINT installed_modules_pkey PRIMARY KEY (id);


--
-- Name: installed_modules installed_modules_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.installed_modules
    ADD CONSTRAINT installed_modules_slug_key UNIQUE (slug);


--
-- Name: llm_fabric_node_reports llm_fabric_node_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.llm_fabric_node_reports
    ADD CONSTRAINT llm_fabric_node_reports_pkey PRIMARY KEY (node_id);


--
-- Name: llm_fabric_routing_decisions llm_fabric_routing_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.llm_fabric_routing_decisions
    ADD CONSTRAINT llm_fabric_routing_decisions_pkey PRIMARY KEY (id);


--
-- Name: llm_fabric_routing_policies llm_fabric_routing_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.llm_fabric_routing_policies
    ADD CONSTRAINT llm_fabric_routing_policies_pkey PRIMARY KEY (id);


--
-- Name: llm_models llm_models_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.llm_models
    ADD CONSTRAINT llm_models_pkey PRIMARY KEY (model_name, provider_name);


--
-- Name: llm_providers llm_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.llm_providers
    ADD CONSTRAINT llm_providers_pkey PRIMARY KEY (name);


--
-- Name: llm_usage llm_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.llm_usage
    ADD CONSTRAINT llm_usage_pkey PRIMARY KEY (id);


--
-- Name: observability_events observability_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.observability_events
    ADD CONSTRAINT observability_events_pkey PRIMARY KEY (id);


--
-- Name: organization_credentials organization_credentials_organization_slug_credential_type__key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_credentials
    ADD CONSTRAINT organization_credentials_organization_slug_credential_type__key UNIQUE (organization_slug, credential_type, credential_key);


--
-- Name: organization_credentials organization_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_credentials
    ADD CONSTRAINT organization_credentials_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (slug);


--
-- Name: plan_deliverables plan_deliverables_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plan_deliverables
    ADD CONSTRAINT plan_deliverables_pkey PRIMARY KEY (id);


--
-- Name: plan_versions plan_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plan_versions
    ADD CONSTRAINT plan_versions_pkey PRIMARY KEY (id);


--
-- Name: plan_versions plan_versions_plan_id_version_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plan_versions
    ADD CONSTRAINT plan_versions_plan_id_version_number_key UNIQUE (plan_id, version_number);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: pseudonym_dictionaries pseudonym_dictionaries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pseudonym_dictionaries
    ADD CONSTRAINT pseudonym_dictionaries_pkey PRIMARY KEY (id);


--
-- Name: pseudonym_dictionaries pseudonym_dictionaries_user_id_conversation_id_entity_type__key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pseudonym_dictionaries
    ADD CONSTRAINT pseudonym_dictionaries_user_id_conversation_id_entity_type__key UNIQUE (user_id, conversation_id, entity_type, original_value);


--
-- Name: pseudonym_mappings pseudonym_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pseudonym_mappings
    ADD CONSTRAINT pseudonym_mappings_pkey PRIMARY KEY (id);


--
-- Name: redaction_audit_log redaction_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.redaction_audit_log
    ADD CONSTRAINT redaction_audit_log_pkey PRIMARY KEY (id);


--
-- Name: redaction_patterns redaction_patterns_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.redaction_patterns
    ADD CONSTRAINT redaction_patterns_name_key UNIQUE (name);


--
-- Name: redaction_patterns redaction_patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.redaction_patterns
    ADD CONSTRAINT redaction_patterns_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (key);


--
-- Name: task_messages task_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_messages
    ADD CONSTRAINT task_messages_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);


--
-- Name: team_members team_members_team_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_team_id_user_id_key UNIQUE (team_id, user_id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: user_cidafm_commands user_cidafm_commands_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_cidafm_commands
    ADD CONSTRAINT user_cidafm_commands_pkey PRIMARY KEY (id);


--
-- Name: user_cidafm_commands user_cidafm_commands_user_id_command_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_cidafm_commands
    ADD CONSTRAINT user_cidafm_commands_user_id_command_id_key UNIQUE (user_id, command_id);


--
-- Name: rag_collections rag_collections_organization_slug_slug_key; Type: CONSTRAINT; Schema: rag_data; Owner: postgres
--

ALTER TABLE ONLY rag_data.rag_collections
    ADD CONSTRAINT rag_collections_organization_slug_slug_key UNIQUE (organization_slug, slug);


--
-- Name: rag_collections rag_collections_pkey; Type: CONSTRAINT; Schema: rag_data; Owner: postgres
--

ALTER TABLE ONLY rag_data.rag_collections
    ADD CONSTRAINT rag_collections_pkey PRIMARY KEY (id);


--
-- Name: rag_document_chunks rag_document_chunks_pkey; Type: CONSTRAINT; Schema: rag_data; Owner: postgres
--

ALTER TABLE ONLY rag_data.rag_document_chunks
    ADD CONSTRAINT rag_document_chunks_pkey PRIMARY KEY (id);


--
-- Name: rag_documents rag_documents_pkey; Type: CONSTRAINT; Schema: rag_data; Owner: postgres
--

ALTER TABLE ONLY rag_data.rag_documents
    ADD CONSTRAINT rag_documents_pkey PRIMARY KEY (id);


--
-- Name: rag_feedback_signals rag_feedback_signals_pkey; Type: CONSTRAINT; Schema: rag_data; Owner: postgres
--

ALTER TABLE ONLY rag_data.rag_feedback_signals
    ADD CONSTRAINT rag_feedback_signals_pkey PRIMARY KEY (id);


--
-- Name: alerts alerts_pkey; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.alerts
    ADD CONSTRAINT alerts_pkey PRIMARY KEY (id);


--
-- Name: article_classifications article_classifications_pkey; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.article_classifications
    ADD CONSTRAINT article_classifications_pkey PRIMARY KEY (id);


--
-- Name: article_classifications article_classifications_scope_id_article_id_key; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.article_classifications
    ADD CONSTRAINT article_classifications_scope_id_article_id_key UNIQUE (scope_id, article_id);


--
-- Name: assessment_runs assessment_runs_pkey; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.assessment_runs
    ADD CONSTRAINT assessment_runs_pkey PRIMARY KEY (id);


--
-- Name: assessments assessments_pkey; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.assessments
    ADD CONSTRAINT assessments_pkey PRIMARY KEY (id);


--
-- Name: assessments assessments_subject_dimension_unique; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.assessments
    ADD CONSTRAINT assessments_subject_dimension_unique UNIQUE (subject_id, dimension_id);


--
-- Name: comparisons comparisons_pkey; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.comparisons
    ADD CONSTRAINT comparisons_pkey PRIMARY KEY (id);


--
-- Name: composite_scores composite_scores_pkey; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.composite_scores
    ADD CONSTRAINT composite_scores_pkey PRIMARY KEY (id);


--
-- Name: data_source_fetch_history data_source_fetch_history_pkey; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.data_source_fetch_history
    ADD CONSTRAINT data_source_fetch_history_pkey PRIMARY KEY (id);


--
-- Name: data_sources data_sources_pkey; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.data_sources
    ADD CONSTRAINT data_sources_pkey PRIMARY KEY (id);


--
-- Name: debate_contexts debate_contexts_pkey; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.debate_contexts
    ADD CONSTRAINT debate_contexts_pkey PRIMARY KEY (id);


--
-- Name: debate_contexts debate_contexts_scope_id_role_version_key; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.debate_contexts
    ADD CONSTRAINT debate_contexts_scope_id_role_version_key UNIQUE (scope_id, role, version);


--
-- Name: debates debates_pkey; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.debates
    ADD CONSTRAINT debates_pkey PRIMARY KEY (id);


--
-- Name: dimension_contexts dimension_contexts_dimension_id_version_key; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.dimension_contexts
    ADD CONSTRAINT dimension_contexts_dimension_id_version_key UNIQUE (dimension_id, version);


--
-- Name: dimension_contexts dimension_contexts_pkey; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.dimension_contexts
    ADD CONSTRAINT dimension_contexts_pkey PRIMARY KEY (id);


--
-- Name: dimensions dimensions_pkey; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.dimensions
    ADD CONSTRAINT dimensions_pkey PRIMARY KEY (id);


--
-- Name: dimensions dimensions_scope_id_slug_key; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.dimensions
    ADD CONSTRAINT dimensions_scope_id_slug_key UNIQUE (scope_id, slug);


--
-- Name: evaluations evaluations_pkey; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.evaluations
    ADD CONSTRAINT evaluations_pkey PRIMARY KEY (id);


--
-- Name: executive_summaries executive_summaries_pkey; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.executive_summaries
    ADD CONSTRAINT executive_summaries_pkey PRIMARY KEY (id);


--
-- Name: learning_queue learning_queue_pkey; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.learning_queue
    ADD CONSTRAINT learning_queue_pkey PRIMARY KEY (id);


--
-- Name: learnings learnings_pkey; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.learnings
    ADD CONSTRAINT learnings_pkey PRIMARY KEY (id);


--
-- Name: mitigations mitigations_pkey; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.mitigations
    ADD CONSTRAINT mitigations_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: scenarios scenarios_pkey; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.scenarios
    ADD CONSTRAINT scenarios_pkey PRIMARY KEY (id);


--
-- Name: scopes scopes_pkey; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.scopes
    ADD CONSTRAINT scopes_pkey PRIMARY KEY (id);


--
-- Name: simulations simulations_pkey; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.simulations
    ADD CONSTRAINT simulations_pkey PRIMARY KEY (id);


--
-- Name: source_subscriptions source_subscriptions_pkey; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.source_subscriptions
    ADD CONSTRAINT source_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: source_subscriptions source_subscriptions_source_id_scope_id_key; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.source_subscriptions
    ADD CONSTRAINT source_subscriptions_source_id_scope_id_key UNIQUE (source_id, scope_id);


--
-- Name: subjects subjects_pkey; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.subjects
    ADD CONSTRAINT subjects_pkey PRIMARY KEY (id);


--
-- Name: subjects subjects_scope_id_identifier_key; Type: CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.subjects
    ADD CONSTRAINT subjects_scope_id_identifier_key UNIQUE (scope_id, identifier);


--
-- Name: alerts alerts_pkey; Type: CONSTRAINT; Schema: sentinel; Owner: postgres
--

ALTER TABLE ONLY sentinel.alerts
    ADD CONSTRAINT alerts_pkey PRIMARY KEY (id);


--
-- Name: observations observations_org_slug_source_id_content_hash_key; Type: CONSTRAINT; Schema: sentinel; Owner: postgres
--

ALTER TABLE ONLY sentinel.observations
    ADD CONSTRAINT observations_org_slug_source_id_content_hash_key UNIQUE (org_slug, source_id, content_hash);


--
-- Name: observations observations_pkey; Type: CONSTRAINT; Schema: sentinel; Owner: postgres
--

ALTER TABLE ONLY sentinel.observations
    ADD CONSTRAINT observations_pkey PRIMARY KEY (id);


--
-- Name: signal_targets signal_targets_pkey; Type: CONSTRAINT; Schema: sentinel; Owner: postgres
--

ALTER TABLE ONLY sentinel.signal_targets
    ADD CONSTRAINT signal_targets_pkey PRIMARY KEY (id);


--
-- Name: signal_targets signal_targets_signal_id_watch_profile_id_key; Type: CONSTRAINT; Schema: sentinel; Owner: postgres
--

ALTER TABLE ONLY sentinel.signal_targets
    ADD CONSTRAINT signal_targets_signal_id_watch_profile_id_key UNIQUE (signal_id, watch_profile_id);


--
-- Name: signals signals_pkey; Type: CONSTRAINT; Schema: sentinel; Owner: postgres
--

ALTER TABLE ONLY sentinel.signals
    ADD CONSTRAINT signals_pkey PRIMARY KEY (id);


--
-- Name: source_runs source_runs_pkey; Type: CONSTRAINT; Schema: sentinel; Owner: postgres
--

ALTER TABLE ONLY sentinel.source_runs
    ADD CONSTRAINT source_runs_pkey PRIMARY KEY (id);


--
-- Name: sources sources_org_slug_name_key; Type: CONSTRAINT; Schema: sentinel; Owner: postgres
--

ALTER TABLE ONLY sentinel.sources
    ADD CONSTRAINT sources_org_slug_name_key UNIQUE (org_slug, name);


--
-- Name: sources sources_pkey; Type: CONSTRAINT; Schema: sentinel; Owner: postgres
--

ALTER TABLE ONLY sentinel.sources
    ADD CONSTRAINT sources_pkey PRIMARY KEY (id);


--
-- Name: test_runs test_runs_pkey; Type: CONSTRAINT; Schema: sentinel; Owner: postgres
--

ALTER TABLE ONLY sentinel.test_runs
    ADD CONSTRAINT test_runs_pkey PRIMARY KEY (id);


--
-- Name: watch_concerns watch_concerns_pkey; Type: CONSTRAINT; Schema: sentinel; Owner: postgres
--

ALTER TABLE ONLY sentinel.watch_concerns
    ADD CONSTRAINT watch_concerns_pkey PRIMARY KEY (id);


--
-- Name: watch_profiles watch_profiles_pkey; Type: CONSTRAINT; Schema: sentinel; Owner: postgres
--

ALTER TABLE ONLY sentinel.watch_profiles
    ADD CONSTRAINT watch_profiles_pkey PRIMARY KEY (id);


--
-- Name: document_mappings document_mappings_org_slug_profile_id_source_id_mapping_slu_key; Type: CONSTRAINT; Schema: substrate; Owner: postgres
--

ALTER TABLE ONLY substrate.document_mappings
    ADD CONSTRAINT document_mappings_org_slug_profile_id_source_id_mapping_slu_key UNIQUE (org_slug, profile_id, source_id, mapping_slug);


--
-- Name: document_mappings document_mappings_pkey; Type: CONSTRAINT; Schema: substrate; Owner: postgres
--

ALTER TABLE ONLY substrate.document_mappings
    ADD CONSTRAINT document_mappings_pkey PRIMARY KEY (id);


--
-- Name: entity_mappings entity_mappings_org_slug_profile_id_source_id_canonical_ent_key; Type: CONSTRAINT; Schema: substrate; Owner: postgres
--

ALTER TABLE ONLY substrate.entity_mappings
    ADD CONSTRAINT entity_mappings_org_slug_profile_id_source_id_canonical_ent_key UNIQUE (org_slug, profile_id, source_id, canonical_entity, mapping_slug);


--
-- Name: entity_mappings entity_mappings_pkey; Type: CONSTRAINT; Schema: substrate; Owner: postgres
--

ALTER TABLE ONLY substrate.entity_mappings
    ADD CONSTRAINT entity_mappings_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_org_slug_slug_key; Type: CONSTRAINT; Schema: substrate; Owner: postgres
--

ALTER TABLE ONLY substrate.profiles
    ADD CONSTRAINT profiles_org_slug_slug_key UNIQUE (org_slug, slug);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: substrate; Owner: postgres
--

ALTER TABLE ONLY substrate.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: resolution_log resolution_log_pkey; Type: CONSTRAINT; Schema: substrate; Owner: postgres
--

ALTER TABLE ONLY substrate.resolution_log
    ADD CONSTRAINT resolution_log_pkey PRIMARY KEY (id);


--
-- Name: selection_presets selection_presets_org_slug_profile_id_workflow_slug_preset__key; Type: CONSTRAINT; Schema: substrate; Owner: postgres
--

ALTER TABLE ONLY substrate.selection_presets
    ADD CONSTRAINT selection_presets_org_slug_profile_id_workflow_slug_preset__key UNIQUE (org_slug, profile_id, workflow_slug, preset_slug);


--
-- Name: selection_presets selection_presets_pkey; Type: CONSTRAINT; Schema: substrate; Owner: postgres
--

ALTER TABLE ONLY substrate.selection_presets
    ADD CONSTRAINT selection_presets_pkey PRIMARY KEY (id);


--
-- Name: sources sources_org_slug_profile_id_slug_key; Type: CONSTRAINT; Schema: substrate; Owner: postgres
--

ALTER TABLE ONLY substrate.sources
    ADD CONSTRAINT sources_org_slug_profile_id_slug_key UNIQUE (org_slug, profile_id, slug);


--
-- Name: sources sources_pkey; Type: CONSTRAINT; Schema: substrate; Owner: postgres
--

ALTER TABLE ONLY substrate.sources
    ADD CONSTRAINT sources_pkey PRIMARY KEY (id);


--
-- Name: agent_definition_links agent_definition_links_pkey; Type: CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.agent_definition_links
    ADD CONSTRAINT agent_definition_links_pkey PRIMARY KEY (agent_slug, workflow_slug);


--
-- Name: agent_definition_org_overrides agent_definition_org_overrides_pkey; Type: CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.agent_definition_org_overrides
    ADD CONSTRAINT agent_definition_org_overrides_pkey PRIMARY KEY (agent_slug, organization_slug);


--
-- Name: agent_definition_override_history agent_definition_override_history_pkey; Type: CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.agent_definition_override_history
    ADD CONSTRAINT agent_definition_override_history_pkey PRIMARY KEY (id);


--
-- Name: agent_definition_versions agent_definition_versions_pkey; Type: CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.agent_definition_versions
    ADD CONSTRAINT agent_definition_versions_pkey PRIMARY KEY (agent_slug, version);


--
-- Name: agent_definitions agent_definitions_pkey; Type: CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.agent_definitions
    ADD CONSTRAINT agent_definitions_pkey PRIMARY KEY (slug);


--
-- Name: group_items group_items_one_group_per_org; Type: CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.group_items
    ADD CONSTRAINT group_items_one_group_per_org UNIQUE (organization_slug, workflow_slug);


--
-- Name: group_items group_items_pkey; Type: CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.group_items
    ADD CONSTRAINT group_items_pkey PRIMARY KEY (group_id, workflow_slug);


--
-- Name: groups groups_id_org; Type: CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.groups
    ADD CONSTRAINT groups_id_org UNIQUE (id, organization_slug);


--
-- Name: groups groups_name_per_org; Type: CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.groups
    ADD CONSTRAINT groups_name_per_org UNIQUE (organization_slug, name);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: human_reviews human_reviews_pkey; Type: CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.human_reviews
    ADD CONSTRAINT human_reviews_pkey PRIMARY KEY (id);


--
-- Name: human_reviews human_reviews_round_unique; Type: CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.human_reviews
    ADD CONSTRAINT human_reviews_round_unique UNIQUE (run_id, gate_slug, round);


--
-- Name: improvement_requests improvement_requests_pkey; Type: CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.improvement_requests
    ADD CONSTRAINT improvement_requests_pkey PRIMARY KEY (id);


--
-- Name: issue_ledger_events issue_ledger_events_pkey; Type: CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.issue_ledger_events
    ADD CONSTRAINT issue_ledger_events_pkey PRIMARY KEY (id);


--
-- Name: issue_ledger issue_ledger_key_per_stage; Type: CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.issue_ledger
    ADD CONSTRAINT issue_ledger_key_per_stage UNIQUE (run_id, stage_slug, issue_key);


--
-- Name: issue_ledger issue_ledger_pkey; Type: CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.issue_ledger
    ADD CONSTRAINT issue_ledger_pkey PRIMARY KEY (id);


--
-- Name: model_profiles model_profiles_one_per_role; Type: CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.model_profiles
    ADD CONSTRAINT model_profiles_one_per_role UNIQUE (organization_slug, workflow_slug, role);


--
-- Name: model_profiles model_profiles_pkey; Type: CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.model_profiles
    ADD CONSTRAINT model_profiles_pkey PRIMARY KEY (id);


--
-- Name: org_settings org_settings_pkey; Type: CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.org_settings
    ADD CONSTRAINT org_settings_pkey PRIMARY KEY (organization_slug, workflow_slug);


--
-- Name: participant_runs participant_runs_pkey; Type: CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.participant_runs
    ADD CONSTRAINT participant_runs_pkey PRIMARY KEY (id);


--
-- Name: participant_runs participant_runs_position; Type: CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.participant_runs
    ADD CONSTRAINT participant_runs_position UNIQUE (work_unit_run_id, "position");


--
-- Name: registry registry_pkey; Type: CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.registry
    ADD CONSTRAINT registry_pkey PRIMARY KEY (slug);


--
-- Name: runs runs_pkey; Type: CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.runs
    ADD CONSTRAINT runs_pkey PRIMARY KEY (id);


--
-- Name: trace_reviews trace_reviews_pkey; Type: CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.trace_reviews
    ADD CONSTRAINT trace_reviews_pkey PRIMARY KEY (id);


--
-- Name: work_unit_runs work_unit_runs_pkey; Type: CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.work_unit_runs
    ADD CONSTRAINT work_unit_runs_pkey PRIMARY KEY (id);


--
-- Name: a2a_inbound_nonces_expires_at_idx; Type: INDEX; Schema: ambient; Owner: postgres
--

CREATE INDEX a2a_inbound_nonces_expires_at_idx ON ambient.a2a_inbound_nonces USING btree (expires_at);


--
-- Name: ambient_events_dedupe_idx; Type: INDEX; Schema: ambient; Owner: postgres
--

CREATE UNIQUE INDEX ambient_events_dedupe_idx ON ambient.events USING btree (org_slug, name, dedupe_key) WHERE (dedupe_key IS NOT NULL);


--
-- Name: ambient_events_org_received_idx; Type: INDEX; Schema: ambient; Owner: postgres
--

CREATE INDEX ambient_events_org_received_idx ON ambient.events USING btree (org_slug, received_at DESC);


--
-- Name: ambient_trigger_executions_dedupe_key_idx; Type: INDEX; Schema: ambient; Owner: postgres
--

CREATE UNIQUE INDEX ambient_trigger_executions_dedupe_key_idx ON ambient.trigger_executions USING btree (dedupe_key) WHERE (dedupe_key IS NOT NULL);


--
-- Name: ambient_trigger_executions_event_id_idx; Type: INDEX; Schema: ambient; Owner: postgres
--

CREATE INDEX ambient_trigger_executions_event_id_idx ON ambient.trigger_executions USING btree (event_id) WHERE (event_id IS NOT NULL);


--
-- Name: ambient_trigger_executions_fired_at_idx; Type: INDEX; Schema: ambient; Owner: postgres
--

CREATE INDEX ambient_trigger_executions_fired_at_idx ON ambient.trigger_executions USING btree (fired_at);


--
-- Name: ambient_trigger_executions_reply_waiting_idx; Type: INDEX; Schema: ambient; Owner: postgres
--

CREATE INDEX ambient_trigger_executions_reply_waiting_idx ON ambient.trigger_executions USING btree (reply_run_id) WHERE (reply_state = 'waiting'::text);


--
-- Name: ambient_trigger_executions_trigger_id_idx; Type: INDEX; Schema: ambient; Owner: postgres
--

CREATE INDEX ambient_trigger_executions_trigger_id_idx ON ambient.trigger_executions USING btree (trigger_id);


--
-- Name: ambient_triggers_org_enabled_idx; Type: INDEX; Schema: ambient; Owner: postgres
--

CREATE INDEX ambient_triggers_org_enabled_idx ON ambient.triggers USING btree (org_slug, enabled);


--
-- Name: ambient_triggers_org_slug_idx; Type: INDEX; Schema: ambient; Owner: postgres
--

CREATE INDEX ambient_triggers_org_slug_idx ON ambient.triggers USING btree (org_slug);


--
-- Name: ambient_triggers_org_source_type_idx; Type: INDEX; Schema: ambient; Owner: postgres
--

CREATE INDEX ambient_triggers_org_source_type_idx ON ambient.triggers USING btree (org_slug, source_type);


--
-- Name: ambient_triggers_source_type_idx; Type: INDEX; Schema: ambient; Owner: postgres
--

CREATE INDEX ambient_triggers_source_type_idx ON ambient.triggers USING btree (source_type);


--
-- Name: database_change_events_created_at_idx; Type: INDEX; Schema: ambient; Owner: postgres
--

CREATE INDEX database_change_events_created_at_idx ON ambient.database_change_events USING btree (created_at);


--
-- Name: idx_auth_identity_links_user_id; Type: INDEX; Schema: authz; Owner: postgres
--

CREATE INDEX idx_auth_identity_links_user_id ON authz.auth_identity_links USING btree (user_id);


--
-- Name: idx_rbac_audit_actor; Type: INDEX; Schema: authz; Owner: postgres
--

CREATE INDEX idx_rbac_audit_actor ON authz.rbac_audit_log USING btree (actor_id);


--
-- Name: idx_rbac_audit_created; Type: INDEX; Schema: authz; Owner: postgres
--

CREATE INDEX idx_rbac_audit_created ON authz.rbac_audit_log USING btree (created_at DESC);


--
-- Name: idx_rbac_audit_target; Type: INDEX; Schema: authz; Owner: postgres
--

CREATE INDEX idx_rbac_audit_target ON authz.rbac_audit_log USING btree (target_user_id);


--
-- Name: idx_role_permissions_resource; Type: INDEX; Schema: authz; Owner: postgres
--

CREATE INDEX idx_role_permissions_resource ON authz.rbac_role_permissions USING btree (resource_type, resource_id) WHERE (resource_type IS NOT NULL);


--
-- Name: idx_role_permissions_role; Type: INDEX; Schema: authz; Owner: postgres
--

CREATE INDEX idx_role_permissions_role ON authz.rbac_role_permissions USING btree (role_id);


--
-- Name: idx_team_members_team_id; Type: INDEX; Schema: authz; Owner: postgres
--

CREATE INDEX idx_team_members_team_id ON authz.team_members USING btree (team_id);


--
-- Name: idx_team_members_user_id; Type: INDEX; Schema: authz; Owner: postgres
--

CREATE INDEX idx_team_members_user_id ON authz.team_members USING btree (user_id);


--
-- Name: idx_teams_created_by; Type: INDEX; Schema: authz; Owner: postgres
--

CREATE INDEX idx_teams_created_by ON authz.teams USING btree (created_by);


--
-- Name: idx_teams_org_slug; Type: INDEX; Schema: authz; Owner: postgres
--

CREATE INDEX idx_teams_org_slug ON authz.teams USING btree (org_slug);


--
-- Name: idx_user_org_roles_org; Type: INDEX; Schema: authz; Owner: postgres
--

CREATE INDEX idx_user_org_roles_org ON authz.rbac_user_org_roles USING btree (organization_slug);


--
-- Name: idx_user_org_roles_user; Type: INDEX; Schema: authz; Owner: postgres
--

CREATE INDEX idx_user_org_roles_user ON authz.rbac_user_org_roles USING btree (user_id);


--
-- Name: idx_user_org_roles_user_org; Type: INDEX; Schema: authz; Owner: postgres
--

CREATE INDEX idx_user_org_roles_user_org ON authz.rbac_user_org_roles USING btree (user_id, organization_slug);


--
-- Name: org_entitlements_org_slug_idx; Type: INDEX; Schema: authz; Owner: postgres
--

CREATE INDEX org_entitlements_org_slug_idx ON authz.org_entitlements USING btree (org_slug);


--
-- Name: teams_org_name_unique; Type: INDEX; Schema: authz; Owner: postgres
--

CREATE UNIQUE INDEX teams_org_name_unique ON authz.teams USING btree (COALESCE(org_slug, ''::text), name);


--
-- Name: users_email_idx; Type: INDEX; Schema: authz; Owner: postgres
--

CREATE INDEX users_email_idx ON authz.users USING btree (email);


--
-- Name: users_organization_slug_idx; Type: INDEX; Schema: authz; Owner: postgres
--

CREATE INDEX users_organization_slug_idx ON authz.users USING btree (organization_slug);


--
-- Name: users_status_idx; Type: INDEX; Schema: authz; Owner: postgres
--

CREATE INDEX users_status_idx ON authz.users USING btree (status);


--
-- Name: idx_companies_industry; Type: INDEX; Schema: company; Owner: postgres
--

CREATE INDEX idx_companies_industry ON company.companies USING btree (industry);


--
-- Name: idx_companies_name; Type: INDEX; Schema: company; Owner: postgres
--

CREATE INDEX idx_companies_name ON company.companies USING btree (name);


--
-- Name: idx_companies_size; Type: INDEX; Schema: company; Owner: postgres
--

CREATE INDEX idx_companies_size ON company.companies USING btree (size);


--
-- Name: idx_discovery_signals_batch; Type: INDEX; Schema: company; Owner: postgres
--

CREATE INDEX idx_discovery_signals_batch ON company.discovery_signals USING btree (batch_date DESC);


--
-- Name: idx_discovery_signals_company; Type: INDEX; Schema: company; Owner: postgres
--

CREATE INDEX idx_discovery_signals_company ON company.discovery_signals USING btree (company_id);


--
-- Name: idx_discovery_signals_type; Type: INDEX; Schema: company; Owner: postgres
--

CREATE INDEX idx_discovery_signals_type ON company.discovery_signals USING btree (signal_type);


--
-- Name: idx_outreach_batch; Type: INDEX; Schema: company; Owner: postgres
--

CREATE INDEX idx_outreach_batch ON company.outreach USING btree (batch_date DESC);


--
-- Name: idx_outreach_company; Type: INDEX; Schema: company; Owner: postgres
--

CREATE INDEX idx_outreach_company ON company.outreach USING btree (company_id);


--
-- Name: idx_outreach_score; Type: INDEX; Schema: company; Owner: postgres
--

CREATE INDEX idx_outreach_score ON company.outreach USING btree (relevance_score DESC);


--
-- Name: idx_outreach_status; Type: INDEX; Schema: company; Owner: postgres
--

CREATE INDEX idx_outreach_status ON company.outreach USING btree (status);


--
-- Name: idx_crawler_agent_outputs_article; Type: INDEX; Schema: crawler; Owner: postgres
--

CREATE INDEX idx_crawler_agent_outputs_article ON crawler.agent_article_outputs USING btree (article_id);


--
-- Name: idx_crawler_agent_outputs_processed; Type: INDEX; Schema: crawler; Owner: postgres
--

CREATE INDEX idx_crawler_agent_outputs_processed ON crawler.agent_article_outputs USING btree (processed_at DESC);


--
-- Name: idx_crawler_agent_outputs_type; Type: INDEX; Schema: crawler; Owner: postgres
--

CREATE INDEX idx_crawler_agent_outputs_type ON crawler.agent_article_outputs USING btree (agent_type);


--
-- Name: idx_crawler_articles_content_hash; Type: INDEX; Schema: crawler; Owner: postgres
--

CREATE INDEX idx_crawler_articles_content_hash ON crawler.articles USING btree (content_hash);


--
-- Name: idx_crawler_articles_fingerprint; Type: INDEX; Schema: crawler; Owner: postgres
--

CREATE INDEX idx_crawler_articles_fingerprint ON crawler.articles USING btree (fingerprint_hash) WHERE (fingerprint_hash IS NOT NULL);


--
-- Name: idx_crawler_articles_first_seen; Type: INDEX; Schema: crawler; Owner: postgres
--

CREATE INDEX idx_crawler_articles_first_seen ON crawler.articles USING btree (first_seen_at DESC);


--
-- Name: idx_crawler_articles_is_duplicate; Type: INDEX; Schema: crawler; Owner: postgres
--

CREATE INDEX idx_crawler_articles_is_duplicate ON crawler.articles USING btree (is_duplicate) WHERE (is_duplicate = false);


--
-- Name: idx_crawler_articles_key_phrases; Type: INDEX; Schema: crawler; Owner: postgres
--

CREATE INDEX idx_crawler_articles_key_phrases ON crawler.articles USING gin (key_phrases) WHERE (key_phrases IS NOT NULL);


--
-- Name: idx_crawler_articles_org; Type: INDEX; Schema: crawler; Owner: postgres
--

CREATE INDEX idx_crawler_articles_org ON crawler.articles USING btree (organization_slug);


--
-- Name: idx_crawler_articles_published; Type: INDEX; Schema: crawler; Owner: postgres
--

CREATE INDEX idx_crawler_articles_published ON crawler.articles USING btree (published_at DESC) WHERE (published_at IS NOT NULL);


--
-- Name: idx_crawler_articles_source; Type: INDEX; Schema: crawler; Owner: postgres
--

CREATE INDEX idx_crawler_articles_source ON crawler.articles USING btree (source_id);


--
-- Name: idx_crawler_articles_title_normalized; Type: INDEX; Schema: crawler; Owner: postgres
--

CREATE INDEX idx_crawler_articles_title_normalized ON crawler.articles USING btree (title_normalized) WHERE (title_normalized IS NOT NULL);


--
-- Name: idx_crawler_articles_url; Type: INDEX; Schema: crawler; Owner: postgres
--

CREATE INDEX idx_crawler_articles_url ON crawler.articles USING btree (url);


--
-- Name: idx_crawler_source_crawls_source; Type: INDEX; Schema: crawler; Owner: postgres
--

CREATE INDEX idx_crawler_source_crawls_source ON crawler.source_crawls USING btree (source_id);


--
-- Name: idx_crawler_source_crawls_started; Type: INDEX; Schema: crawler; Owner: postgres
--

CREATE INDEX idx_crawler_source_crawls_started ON crawler.source_crawls USING btree (started_at DESC);


--
-- Name: idx_crawler_source_crawls_status; Type: INDEX; Schema: crawler; Owner: postgres
--

CREATE INDEX idx_crawler_source_crawls_status ON crawler.source_crawls USING btree (status);


--
-- Name: idx_crawler_sources_active; Type: INDEX; Schema: crawler; Owner: postgres
--

CREATE INDEX idx_crawler_sources_active ON crawler.sources USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_crawler_sources_crawl_config; Type: INDEX; Schema: crawler; Owner: postgres
--

CREATE INDEX idx_crawler_sources_crawl_config ON crawler.sources USING gin (crawl_config);


--
-- Name: idx_crawler_sources_due_for_crawl; Type: INDEX; Schema: crawler; Owner: postgres
--

CREATE INDEX idx_crawler_sources_due_for_crawl ON crawler.sources USING btree (last_crawl_at, crawl_frequency_minutes) WHERE (is_active = true);


--
-- Name: idx_crawler_sources_frequency; Type: INDEX; Schema: crawler; Owner: postgres
--

CREATE INDEX idx_crawler_sources_frequency ON crawler.sources USING btree (crawl_frequency_minutes);


--
-- Name: idx_crawler_sources_last_crawl; Type: INDEX; Schema: crawler; Owner: postgres
--

CREATE INDEX idx_crawler_sources_last_crawl ON crawler.sources USING btree (last_crawl_at DESC);


--
-- Name: idx_crawler_sources_org; Type: INDEX; Schema: crawler; Owner: postgres
--

CREATE INDEX idx_crawler_sources_org ON crawler.sources USING btree (organization_slug);


--
-- Name: idx_crawler_sources_type; Type: INDEX; Schema: crawler; Owner: postgres
--

CREATE INDEX idx_crawler_sources_type ON crawler.sources USING btree (source_type);


--
-- Name: idx_crawler_sources_url; Type: INDEX; Schema: crawler; Owner: postgres
--

CREATE INDEX idx_crawler_sources_url ON crawler.sources USING btree (url);


--
-- Name: idx_engineering_cad_outputs_code; Type: INDEX; Schema: engineering; Owner: postgres
--

CREATE INDEX idx_engineering_cad_outputs_code ON engineering.cad_outputs USING btree (generated_code_id);


--
-- Name: idx_engineering_cad_outputs_drawing; Type: INDEX; Schema: engineering; Owner: postgres
--

CREATE INDEX idx_engineering_cad_outputs_drawing ON engineering.cad_outputs USING btree (drawing_id);


--
-- Name: idx_engineering_cad_outputs_format; Type: INDEX; Schema: engineering; Owner: postgres
--

CREATE INDEX idx_engineering_cad_outputs_format ON engineering.cad_outputs USING btree (format);


--
-- Name: idx_engineering_drawings_conversation; Type: INDEX; Schema: engineering; Owner: postgres
--

CREATE INDEX idx_engineering_drawings_conversation ON engineering.drawings USING btree (conversation_id);


--
-- Name: idx_engineering_drawings_created_at; Type: INDEX; Schema: engineering; Owner: postgres
--

CREATE INDEX idx_engineering_drawings_created_at ON engineering.drawings USING btree (created_at DESC);


--
-- Name: idx_engineering_drawings_parent; Type: INDEX; Schema: engineering; Owner: postgres
--

CREATE INDEX idx_engineering_drawings_parent ON engineering.drawings USING btree (parent_drawing_id);


--
-- Name: idx_engineering_drawings_project; Type: INDEX; Schema: engineering; Owner: postgres
--

CREATE INDEX idx_engineering_drawings_project ON engineering.drawings USING btree (project_id);


--
-- Name: idx_engineering_drawings_status; Type: INDEX; Schema: engineering; Owner: postgres
--

CREATE INDEX idx_engineering_drawings_status ON engineering.drawings USING btree (status);


--
-- Name: idx_engineering_drawings_task; Type: INDEX; Schema: engineering; Owner: postgres
--

CREATE INDEX idx_engineering_drawings_task ON engineering.drawings USING btree (task_id);


--
-- Name: idx_engineering_execution_log_created; Type: INDEX; Schema: engineering; Owner: postgres
--

CREATE INDEX idx_engineering_execution_log_created ON engineering.execution_log USING btree (drawing_id, created_at);


--
-- Name: idx_engineering_execution_log_drawing; Type: INDEX; Schema: engineering; Owner: postgres
--

CREATE INDEX idx_engineering_execution_log_drawing ON engineering.execution_log USING btree (drawing_id);


--
-- Name: idx_engineering_execution_log_type; Type: INDEX; Schema: engineering; Owner: postgres
--

CREATE INDEX idx_engineering_execution_log_type ON engineering.execution_log USING btree (step_type);


--
-- Name: idx_engineering_generated_code_attempt; Type: INDEX; Schema: engineering; Owner: postgres
--

CREATE INDEX idx_engineering_generated_code_attempt ON engineering.generated_code USING btree (drawing_id, attempt_number);


--
-- Name: idx_engineering_generated_code_drawing; Type: INDEX; Schema: engineering; Owner: postgres
--

CREATE INDEX idx_engineering_generated_code_drawing ON engineering.generated_code USING btree (drawing_id);


--
-- Name: idx_engineering_generated_code_valid; Type: INDEX; Schema: engineering; Owner: postgres
--

CREATE INDEX idx_engineering_generated_code_valid ON engineering.generated_code USING btree (is_valid);


--
-- Name: idx_engineering_part_library_category; Type: INDEX; Schema: engineering; Owner: postgres
--

CREATE INDEX idx_engineering_part_library_category ON engineering.part_library USING btree (category);


--
-- Name: idx_engineering_part_library_org; Type: INDEX; Schema: engineering; Owner: postgres
--

CREATE INDEX idx_engineering_part_library_org ON engineering.part_library USING btree (org_slug);


--
-- Name: idx_engineering_part_library_public; Type: INDEX; Schema: engineering; Owner: postgres
--

CREATE INDEX idx_engineering_part_library_public ON engineering.part_library USING btree (is_public) WHERE (is_public = true);


--
-- Name: idx_engineering_part_library_tags; Type: INDEX; Schema: engineering; Owner: postgres
--

CREATE INDEX idx_engineering_part_library_tags ON engineering.part_library USING gin (tags);


--
-- Name: idx_engineering_projects_created_at; Type: INDEX; Schema: engineering; Owner: postgres
--

CREATE INDEX idx_engineering_projects_created_at ON engineering.projects USING btree (created_at DESC);


--
-- Name: idx_engineering_projects_created_by; Type: INDEX; Schema: engineering; Owner: postgres
--

CREATE INDEX idx_engineering_projects_created_by ON engineering.projects USING btree (created_by);


--
-- Name: idx_engineering_projects_org; Type: INDEX; Schema: engineering; Owner: postgres
--

CREATE INDEX idx_engineering_projects_org ON engineering.projects USING btree (org_slug);


--
-- Name: invoices_duplicates; Type: INDEX; Schema: finance; Owner: postgres
--

CREATE INDEX invoices_duplicates ON finance.invoices USING btree (organization_slug, vendor_key, invoice_number);


--
-- Name: gatehouse_tasks_caller_idx; Type: INDEX; Schema: gatehouse; Owner: postgres
--

CREATE INDEX gatehouse_tasks_caller_idx ON gatehouse.tasks USING btree (caller_id, agent_slug, created_at DESC);


--
-- Name: gatehouse_tasks_run_idx; Type: INDEX; Schema: gatehouse; Owner: postgres
--

CREATE INDEX gatehouse_tasks_run_idx ON gatehouse.tasks USING btree (run_id) WHERE (run_id IS NOT NULL);


--
-- Name: gatehouse_used_tokens_expiry_idx; Type: INDEX; Schema: gatehouse; Owner: postgres
--

CREATE INDEX gatehouse_used_tokens_expiry_idx ON gatehouse.used_tokens USING btree (expires_at);


--
-- Name: gatehouse_used_tokens_rate_idx; Type: INDEX; Schema: gatehouse; Owner: postgres
--

CREATE INDEX gatehouse_used_tokens_rate_idx ON gatehouse.used_tokens USING btree (caller_id, used_at DESC);


--
-- Name: a2a_messages_org_dir_idx; Type: INDEX; Schema: guardhouse; Owner: postgres
--

CREATE INDEX a2a_messages_org_dir_idx ON guardhouse.a2a_messages USING btree (org_slug, direction, created_at DESC);


--
-- Name: a2a_messages_status_idx; Type: INDEX; Schema: guardhouse; Owner: postgres
--

CREATE INDEX a2a_messages_status_idx ON guardhouse.a2a_messages USING btree (status, created_at DESC);


--
-- Name: external_agents_org_idx; Type: INDEX; Schema: guardhouse; Owner: postgres
--

CREATE INDEX external_agents_org_idx ON guardhouse.external_agents USING btree (org_slug);


--
-- Name: external_agents_trust_idx; Type: INDEX; Schema: guardhouse; Owner: postgres
--

CREATE INDEX external_agents_trust_idx ON guardhouse.external_agents USING btree (trust_level);


--
-- Name: nonces_seen_expires_idx; Type: INDEX; Schema: guardhouse; Owner: postgres
--

CREATE INDEX nonces_seen_expires_idx ON guardhouse.nonces_seen USING btree (expires_at);


--
-- Name: competitor_snapshots_latest; Type: INDEX; Schema: marketing; Owner: postgres
--

CREATE INDEX competitor_snapshots_latest ON marketing.competitor_snapshots USING btree (source_id, fetched_at DESC) WHERE (captured_from = 'live'::text);


--
-- Name: idx_efforts_org; Type: INDEX; Schema: orch_flow; Owner: postgres
--

CREATE INDEX idx_efforts_org ON orch_flow.efforts USING btree (organization_slug);


--
-- Name: idx_efforts_team_id; Type: INDEX; Schema: orch_flow; Owner: postgres
--

CREATE INDEX idx_efforts_team_id ON orch_flow.efforts USING btree (team_id);


--
-- Name: idx_learning_progress_user_org; Type: INDEX; Schema: orch_flow; Owner: postgres
--

CREATE INDEX idx_learning_progress_user_org ON orch_flow.learning_progress USING btree (user_id, organization_slug);


--
-- Name: idx_orch_flow_channel_messages_channel; Type: INDEX; Schema: orch_flow; Owner: postgres
--

CREATE INDEX idx_orch_flow_channel_messages_channel ON orch_flow.channel_messages USING btree (channel_id);


--
-- Name: idx_orch_flow_channels_team; Type: INDEX; Schema: orch_flow; Owner: postgres
--

CREATE INDEX idx_orch_flow_channels_team ON orch_flow.channels USING btree (team_id);


--
-- Name: idx_orch_flow_shared_tasks_assigned; Type: INDEX; Schema: orch_flow; Owner: postgres
--

CREATE INDEX idx_orch_flow_shared_tasks_assigned ON orch_flow.shared_tasks USING btree (assigned_to);


--
-- Name: idx_orch_flow_shared_tasks_channel; Type: INDEX; Schema: orch_flow; Owner: postgres
--

CREATE INDEX idx_orch_flow_shared_tasks_channel ON orch_flow.shared_tasks USING btree (channel_id);


--
-- Name: idx_orch_flow_shared_tasks_external_provider; Type: INDEX; Schema: orch_flow; Owner: postgres
--

CREATE INDEX idx_orch_flow_shared_tasks_external_provider ON orch_flow.shared_tasks USING btree (external_provider);


--
-- Name: idx_orch_flow_shared_tasks_external_task_id; Type: INDEX; Schema: orch_flow; Owner: postgres
--

CREATE INDEX idx_orch_flow_shared_tasks_external_task_id ON orch_flow.shared_tasks USING btree (external_task_id);


--
-- Name: idx_orch_flow_shared_tasks_parent; Type: INDEX; Schema: orch_flow; Owner: postgres
--

CREATE INDEX idx_orch_flow_shared_tasks_parent ON orch_flow.shared_tasks USING btree (parent_task_id);


--
-- Name: idx_orch_flow_shared_tasks_status; Type: INDEX; Schema: orch_flow; Owner: postgres
--

CREATE INDEX idx_orch_flow_shared_tasks_status ON orch_flow.shared_tasks USING btree (status);


--
-- Name: idx_orch_flow_shared_tasks_team; Type: INDEX; Schema: orch_flow; Owner: postgres
--

CREATE INDEX idx_orch_flow_shared_tasks_team ON orch_flow.shared_tasks USING btree (team_id);


--
-- Name: idx_orch_flow_shared_tasks_user; Type: INDEX; Schema: orch_flow; Owner: postgres
--

CREATE INDEX idx_orch_flow_shared_tasks_user ON orch_flow.shared_tasks USING btree (user_id);


--
-- Name: idx_orch_flow_sprints_team; Type: INDEX; Schema: orch_flow; Owner: postgres
--

CREATE INDEX idx_orch_flow_sprints_team ON orch_flow.sprints USING btree (team_id);


--
-- Name: idx_orch_flow_timer_state_team; Type: INDEX; Schema: orch_flow; Owner: postgres
--

CREATE INDEX idx_orch_flow_timer_state_team ON orch_flow.timer_state USING btree (team_id);


--
-- Name: idx_projects_effort; Type: INDEX; Schema: orch_flow; Owner: postgres
--

CREATE INDEX idx_projects_effort ON orch_flow.projects USING btree (effort_id);


--
-- Name: idx_tasks_project; Type: INDEX; Schema: orch_flow; Owner: postgres
--

CREATE INDEX idx_tasks_project ON orch_flow.tasks USING btree (project_id);


--
-- Name: idx_team_files_parent_id; Type: INDEX; Schema: orch_flow; Owner: postgres
--

CREATE INDEX idx_team_files_parent_id ON orch_flow.team_files USING btree (parent_id);


--
-- Name: idx_team_files_team_id; Type: INDEX; Schema: orch_flow; Owner: postgres
--

CREATE INDEX idx_team_files_team_id ON orch_flow.team_files USING btree (team_id);


--
-- Name: idx_team_files_team_parent; Type: INDEX; Schema: orch_flow; Owner: postgres
--

CREATE INDEX idx_team_files_team_parent ON orch_flow.team_files USING btree (team_id, parent_id);


--
-- Name: idx_user_presence_active; Type: INDEX; Schema: orch_flow; Owner: postgres
--

CREATE INDEX idx_user_presence_active ON orch_flow.user_presence USING btree (last_active_at);


--
-- Name: uq_orch_flow_shared_tasks_provider_external; Type: INDEX; Schema: orch_flow; Owner: postgres
--

CREATE UNIQUE INDEX uq_orch_flow_shared_tasks_provider_external ON orch_flow.shared_tasks USING btree (external_provider, external_task_id) WHERE ((external_provider IS NOT NULL) AND (external_task_id IS NOT NULL));


--
-- Name: idx_agent_self_modification_log_analyst; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_agent_self_modification_log_analyst ON prediction.agent_self_modification_log USING btree (analyst_id);


--
-- Name: idx_agent_self_modification_log_created; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_agent_self_modification_log_created ON prediction.agent_self_modification_log USING btree (created_at DESC);


--
-- Name: idx_agent_self_modification_log_type; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_agent_self_modification_log_type ON prediction.agent_self_modification_log USING btree (modification_type);


--
-- Name: idx_agent_self_modification_log_unacked; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_agent_self_modification_log_unacked ON prediction.agent_self_modification_log USING btree (acknowledged, created_at DESC) WHERE (acknowledged = false);


--
-- Name: idx_analyst_adaptation_diffs_analyst; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_adaptation_diffs_analyst ON prediction.analyst_adaptation_diffs USING btree (analyst_id);


--
-- Name: idx_analyst_adaptation_diffs_created; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_adaptation_diffs_created ON prediction.analyst_adaptation_diffs USING btree (created_at DESC);


--
-- Name: idx_analyst_adaptation_diffs_status; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_adaptation_diffs_status ON prediction.analyst_adaptation_diffs USING btree (adoption_status);


--
-- Name: idx_analyst_assessments_analyst; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_assessments_analyst ON prediction.analyst_assessments USING btree (analyst_id);


--
-- Name: idx_analyst_assessments_context_version; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_assessments_context_version ON prediction.analyst_assessments USING btree (context_version_id) WHERE (context_version_id IS NOT NULL);


--
-- Name: idx_analyst_assessments_created; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_assessments_created ON prediction.analyst_assessments USING btree (created_at DESC);


--
-- Name: idx_analyst_assessments_fork; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_assessments_fork ON prediction.analyst_assessments USING btree (fork_type);


--
-- Name: idx_analyst_assessments_learnings; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_assessments_learnings ON prediction.analyst_assessments USING gin (learnings_applied);


--
-- Name: idx_analyst_assessments_llm_usage; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_assessments_llm_usage ON prediction.analyst_assessments USING btree (llm_usage_id) WHERE (llm_usage_id IS NOT NULL);


--
-- Name: idx_analyst_assessments_prediction; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_assessments_prediction ON prediction.analyst_assessments USING btree (prediction_id) WHERE (prediction_id IS NOT NULL);


--
-- Name: idx_analyst_assessments_predictor; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_assessments_predictor ON prediction.analyst_assessments USING btree (predictor_id) WHERE (predictor_id IS NOT NULL);


--
-- Name: idx_analyst_assessments_tier; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_assessments_tier ON prediction.analyst_assessments USING btree (llm_tier);


--
-- Name: idx_analyst_context_versions_analyst; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_context_versions_analyst ON prediction.analyst_context_versions USING btree (analyst_id);


--
-- Name: idx_analyst_context_versions_changed_by; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_context_versions_changed_by ON prediction.analyst_context_versions USING btree (changed_by);


--
-- Name: idx_analyst_context_versions_created; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_context_versions_created ON prediction.analyst_context_versions USING btree (created_at DESC);


--
-- Name: idx_analyst_context_versions_current; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_context_versions_current ON prediction.analyst_context_versions USING btree (analyst_id, fork_type, is_current) WHERE (is_current = true);


--
-- Name: idx_analyst_context_versions_fork; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_context_versions_fork ON prediction.analyst_context_versions USING btree (analyst_id, fork_type);


--
-- Name: idx_analyst_overrides_analyst; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_overrides_analyst ON prediction.analyst_overrides USING btree (analyst_id);


--
-- Name: idx_analyst_overrides_target; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_overrides_target ON prediction.analyst_overrides USING btree (target_id) WHERE (target_id IS NOT NULL);


--
-- Name: idx_analyst_overrides_universe; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_overrides_universe ON prediction.analyst_overrides USING btree (universe_id) WHERE (universe_id IS NOT NULL);


--
-- Name: idx_analyst_performance_metrics_analyst; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_performance_metrics_analyst ON prediction.analyst_performance_metrics USING btree (analyst_id);


--
-- Name: idx_analyst_performance_metrics_date; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_performance_metrics_date ON prediction.analyst_performance_metrics USING btree (metric_date DESC);


--
-- Name: idx_analyst_performance_metrics_fork_date; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_performance_metrics_fork_date ON prediction.analyst_performance_metrics USING btree (analyst_id, fork_type, metric_date DESC);


--
-- Name: idx_analyst_portfolios_analyst; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_portfolios_analyst ON prediction.analyst_portfolios USING btree (analyst_id);


--
-- Name: idx_analyst_portfolios_balance; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_portfolios_balance ON prediction.analyst_portfolios USING btree (current_balance);


--
-- Name: idx_analyst_portfolios_fork; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_portfolios_fork ON prediction.analyst_portfolios USING btree (fork_type);


--
-- Name: idx_analyst_portfolios_status; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_portfolios_status ON prediction.analyst_portfolios USING btree (status) WHERE (fork_type = 'agent'::text);


--
-- Name: idx_analyst_positions_assessment; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_positions_assessment ON prediction.analyst_positions USING btree (analyst_assessment_id) WHERE (analyst_assessment_id IS NOT NULL);


--
-- Name: idx_analyst_positions_open; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_positions_open ON prediction.analyst_positions USING btree (portfolio_id, status) WHERE (status = 'open'::text);


--
-- Name: idx_analyst_positions_paper; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_positions_paper ON prediction.analyst_positions USING btree (is_paper_only) WHERE (is_paper_only = true);


--
-- Name: idx_analyst_positions_portfolio; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_positions_portfolio ON prediction.analyst_positions USING btree (portfolio_id);


--
-- Name: idx_analyst_positions_prediction; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_positions_prediction ON prediction.analyst_positions USING btree (prediction_id) WHERE (prediction_id IS NOT NULL);


--
-- Name: idx_analyst_positions_status; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_positions_status ON prediction.analyst_positions USING btree (status);


--
-- Name: idx_analyst_positions_target; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analyst_positions_target ON prediction.analyst_positions USING btree (target_id);


--
-- Name: idx_analysts_agent; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analysts_agent ON prediction.analysts USING btree (agent_id) WHERE (agent_id IS NOT NULL);


--
-- Name: idx_analysts_domain; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analysts_domain ON prediction.analysts USING btree (domain) WHERE (domain IS NOT NULL);


--
-- Name: idx_analysts_enabled; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analysts_enabled ON prediction.analysts USING btree (is_enabled) WHERE (is_enabled = true);


--
-- Name: idx_analysts_learned_patterns; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analysts_learned_patterns ON prediction.analysts USING gin (learned_patterns);


--
-- Name: idx_analysts_scope; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analysts_scope ON prediction.analysts USING btree (scope_level, domain, universe_id, target_id);


--
-- Name: idx_analysts_slug; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analysts_slug ON prediction.analysts USING btree (slug);


--
-- Name: idx_analysts_target; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analysts_target ON prediction.analysts USING btree (target_id) WHERE (target_id IS NOT NULL);


--
-- Name: idx_analysts_test_data; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analysts_test_data ON prediction.analysts USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_analysts_test_scenario; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analysts_test_scenario ON prediction.analysts USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_analysts_tier_instructions; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analysts_tier_instructions ON prediction.analysts USING gin (tier_instructions);


--
-- Name: idx_analysts_type; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analysts_type ON prediction.analysts USING btree (analyst_type);


--
-- Name: idx_analysts_unique_slug_scope; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE UNIQUE INDEX idx_analysts_unique_slug_scope ON prediction.analysts USING btree (slug, scope_level, COALESCE(domain, ''::text), COALESCE((universe_id)::text, ''::text), COALESCE((target_id)::text, ''::text));


--
-- Name: idx_analysts_universe; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_analysts_universe ON prediction.analysts USING btree (universe_id) WHERE (universe_id IS NOT NULL);


--
-- Name: idx_daily_postmortem_recs_run; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_daily_postmortem_recs_run ON prediction.daily_postmortem_recommendations USING btree (run_id);


--
-- Name: idx_daily_postmortem_recs_scope; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_daily_postmortem_recs_scope ON prediction.daily_postmortem_recommendations USING btree (scope_level);


--
-- Name: idx_daily_postmortem_recs_status; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_daily_postmortem_recs_status ON prediction.daily_postmortem_recommendations USING btree (status);


--
-- Name: idx_daily_postmortem_runs_org_agent_date; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_daily_postmortem_runs_org_agent_date ON prediction.daily_postmortem_runs USING btree (org_slug, agent_slug, run_date DESC);


--
-- Name: idx_eod_settlement_log_date; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_eod_settlement_log_date ON prediction.eod_settlement_log USING btree (settlement_date DESC);


--
-- Name: idx_evaluations_production; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_evaluations_production ON prediction.evaluations USING btree (prediction_id, created_at DESC) WHERE (is_test = false);


--
-- Name: idx_evaluations_test_data; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_evaluations_test_data ON prediction.evaluations USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_evaluations_test_scenario; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_evaluations_test_scenario ON prediction.evaluations USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_fork_learning_exchanges_analyst; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_fork_learning_exchanges_analyst ON prediction.fork_learning_exchanges USING btree (analyst_id);


--
-- Name: idx_fork_learning_exchanges_created; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_fork_learning_exchanges_created ON prediction.fork_learning_exchanges USING btree (created_at DESC);


--
-- Name: idx_fork_learning_exchanges_initiator; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_fork_learning_exchanges_initiator ON prediction.fork_learning_exchanges USING btree (initiated_by);


--
-- Name: idx_fork_learning_exchanges_outcome; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_fork_learning_exchanges_outcome ON prediction.fork_learning_exchanges USING btree (outcome);


--
-- Name: idx_learning_lineage_org; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learning_lineage_org ON prediction.learning_lineage USING btree (organization_slug);


--
-- Name: idx_learning_lineage_production_learning; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learning_lineage_production_learning ON prediction.learning_lineage USING btree (production_learning_id);


--
-- Name: idx_learning_lineage_promoted_at; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learning_lineage_promoted_at ON prediction.learning_lineage USING btree (promoted_at DESC);


--
-- Name: idx_learning_lineage_promoted_by; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learning_lineage_promoted_by ON prediction.learning_lineage USING btree (promoted_by);


--
-- Name: idx_learning_lineage_scenario_runs; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learning_lineage_scenario_runs ON prediction.learning_lineage USING gin (scenario_runs);


--
-- Name: idx_learning_lineage_test_learning; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learning_lineage_test_learning ON prediction.learning_lineage USING btree (test_learning_id);


--
-- Name: idx_learning_queue_confidence; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learning_queue_confidence ON prediction.learning_queue USING btree (ai_confidence DESC);


--
-- Name: idx_learning_queue_config; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learning_queue_config ON prediction.learning_queue USING gin (suggested_config);


--
-- Name: idx_learning_queue_created; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learning_queue_created ON prediction.learning_queue USING btree (created_at DESC);


--
-- Name: idx_learning_queue_learning; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learning_queue_learning ON prediction.learning_queue USING btree (learning_id) WHERE (learning_id IS NOT NULL);


--
-- Name: idx_learning_queue_reviewed; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learning_queue_reviewed ON prediction.learning_queue USING btree (reviewed_at DESC) WHERE (reviewed_at IS NOT NULL);


--
-- Name: idx_learning_queue_reviewer; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learning_queue_reviewer ON prediction.learning_queue USING btree (reviewed_by_user_id) WHERE (reviewed_by_user_id IS NOT NULL);


--
-- Name: idx_learning_queue_source_eval; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learning_queue_source_eval ON prediction.learning_queue USING btree (source_evaluation_id) WHERE (source_evaluation_id IS NOT NULL);


--
-- Name: idx_learning_queue_source_missed; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learning_queue_source_missed ON prediction.learning_queue USING btree (source_missed_opportunity_id) WHERE (source_missed_opportunity_id IS NOT NULL);


--
-- Name: idx_learning_queue_status; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learning_queue_status ON prediction.learning_queue USING btree (status) WHERE (status = 'pending'::text);


--
-- Name: idx_learning_queue_suggested_scope; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learning_queue_suggested_scope ON prediction.learning_queue USING btree (suggested_scope_level, suggested_domain);


--
-- Name: idx_learning_queue_test_data; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learning_queue_test_data ON prediction.learning_queue USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_learning_queue_test_scenario; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learning_queue_test_scenario ON prediction.learning_queue USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_learnings_analyst; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learnings_analyst ON prediction.learnings USING btree (analyst_id) WHERE (analyst_id IS NOT NULL);


--
-- Name: idx_learnings_config; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learnings_config ON prediction.learnings USING gin (config);


--
-- Name: idx_learnings_created; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learnings_created ON prediction.learnings USING btree (created_at DESC);


--
-- Name: idx_learnings_domain; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learnings_domain ON prediction.learnings USING btree (domain) WHERE (domain IS NOT NULL);


--
-- Name: idx_learnings_effectiveness; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learnings_effectiveness ON prediction.learnings USING btree (times_applied, times_helpful);


--
-- Name: idx_learnings_production; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learnings_production ON prediction.learnings USING btree (scope_level, status, created_at DESC) WHERE (is_test = false);


--
-- Name: idx_learnings_production_active; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learnings_production_active ON prediction.learnings USING btree (scope_level, domain, universe_id) WHERE ((is_test = false) AND (status = 'active'::text));


--
-- Name: idx_learnings_scope; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learnings_scope ON prediction.learnings USING btree (scope_level, domain, universe_id, target_id);


--
-- Name: idx_learnings_source_eval; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learnings_source_eval ON prediction.learnings USING btree (source_evaluation_id) WHERE (source_evaluation_id IS NOT NULL);


--
-- Name: idx_learnings_source_missed; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learnings_source_missed ON prediction.learnings USING btree (source_missed_opportunity_id) WHERE (source_missed_opportunity_id IS NOT NULL);


--
-- Name: idx_learnings_status; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learnings_status ON prediction.learnings USING btree (status) WHERE (status = 'active'::text);


--
-- Name: idx_learnings_superseded; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learnings_superseded ON prediction.learnings USING btree (superseded_by) WHERE (superseded_by IS NOT NULL);


--
-- Name: idx_learnings_target; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learnings_target ON prediction.learnings USING btree (target_id) WHERE (target_id IS NOT NULL);


--
-- Name: idx_learnings_test_data; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learnings_test_data ON prediction.learnings USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_learnings_test_scenario; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learnings_test_scenario ON prediction.learnings USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_learnings_type; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learnings_type ON prediction.learnings USING btree (learning_type);


--
-- Name: idx_learnings_universe; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_learnings_universe ON prediction.learnings USING btree (universe_id) WHERE (universe_id IS NOT NULL);


--
-- Name: idx_missed_opportunities_test_data; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_missed_opportunities_test_data ON prediction.missed_opportunities USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_missed_opportunities_test_scenario; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_missed_opportunities_test_scenario ON prediction.missed_opportunities USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_position_sizing_config_org; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_position_sizing_config_org ON prediction.position_sizing_config USING btree (org_slug, is_active);


--
-- Name: idx_prediction_evaluations_analyst; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_evaluations_analyst ON prediction.evaluations USING gin (analyst_scores);


--
-- Name: idx_prediction_evaluations_created_at; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_evaluations_created_at ON prediction.evaluations USING btree (created_at DESC);


--
-- Name: idx_prediction_evaluations_direction_correct; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_evaluations_direction_correct ON prediction.evaluations USING btree (direction_correct);


--
-- Name: idx_prediction_evaluations_is_test; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_evaluations_is_test ON prediction.evaluations USING btree (is_test);


--
-- Name: idx_prediction_evaluations_learnings; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_evaluations_learnings ON prediction.evaluations USING gin (suggested_learnings);


--
-- Name: idx_prediction_evaluations_llm; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_evaluations_llm ON prediction.evaluations USING gin (llm_tier_scores);


--
-- Name: idx_prediction_evaluations_overall_score; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_evaluations_overall_score ON prediction.evaluations USING btree (overall_score DESC);


--
-- Name: idx_prediction_evaluations_prediction; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_evaluations_prediction ON prediction.evaluations USING btree (prediction_id);


--
-- Name: idx_prediction_learning_queue_is_test; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_learning_queue_is_test ON prediction.learning_queue USING btree (is_test);


--
-- Name: idx_prediction_learnings_is_test; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_learnings_is_test ON prediction.learnings USING btree (is_test);


--
-- Name: idx_prediction_missed_analysis_status; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_missed_analysis_status ON prediction.missed_opportunities USING btree (analysis_status);


--
-- Name: idx_prediction_missed_created_at; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_missed_created_at ON prediction.missed_opportunities USING btree (created_at DESC);


--
-- Name: idx_prediction_missed_detected; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_missed_detected ON prediction.missed_opportunities USING btree (detected_at DESC);


--
-- Name: idx_prediction_missed_drivers; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_missed_drivers ON prediction.missed_opportunities USING gin (discovered_drivers);


--
-- Name: idx_prediction_missed_gaps; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_missed_gaps ON prediction.missed_opportunities USING gin (source_gaps);


--
-- Name: idx_prediction_missed_opportunities_is_test; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_missed_opportunities_is_test ON prediction.missed_opportunities USING btree (is_test);


--
-- Name: idx_prediction_missed_percent; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_missed_percent ON prediction.missed_opportunities USING btree (percent_change DESC);


--
-- Name: idx_prediction_missed_signals; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_missed_signals ON prediction.missed_opportunities USING gin (signals_we_had);


--
-- Name: idx_prediction_missed_target; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_missed_target ON prediction.missed_opportunities USING btree (target_id);


--
-- Name: idx_prediction_missed_type; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_missed_type ON prediction.missed_opportunities USING btree (move_type);


--
-- Name: idx_prediction_predictions_active; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_predictions_active ON prediction.predictions USING btree (target_id, status, expires_at) WHERE (status = 'active'::text);


--
-- Name: idx_prediction_predictions_analyst_ensemble; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_predictions_analyst_ensemble ON prediction.predictions USING gin (analyst_ensemble);


--
-- Name: idx_prediction_predictions_created_at; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_predictions_created_at ON prediction.predictions USING btree (created_at DESC);


--
-- Name: idx_prediction_predictions_direction; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_predictions_direction ON prediction.predictions USING btree (direction);


--
-- Name: idx_prediction_predictions_expires_at; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_predictions_expires_at ON prediction.predictions USING btree (expires_at);


--
-- Name: idx_prediction_predictions_is_test; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_predictions_is_test ON prediction.predictions USING btree (is_test);


--
-- Name: idx_prediction_predictions_llm_ensemble; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_predictions_llm_ensemble ON prediction.predictions USING gin (llm_ensemble);


--
-- Name: idx_prediction_predictions_predicted_at; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_predictions_predicted_at ON prediction.predictions USING btree (predicted_at DESC);


--
-- Name: idx_prediction_predictions_production_active; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_predictions_production_active ON prediction.predictions USING btree (target_id, status, expires_at) WHERE ((is_test = false) AND (status = 'active'::text));


--
-- Name: idx_prediction_predictions_scenario_run; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_predictions_scenario_run ON prediction.predictions USING btree (scenario_run_id) WHERE (scenario_run_id IS NOT NULL);


--
-- Name: idx_prediction_predictions_status; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_predictions_status ON prediction.predictions USING btree (status);


--
-- Name: idx_prediction_predictions_target; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_predictions_target ON prediction.predictions USING btree (target_id);


--
-- Name: idx_prediction_predictions_task; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_predictions_task ON prediction.predictions USING btree (task_id) WHERE (task_id IS NOT NULL);


--
-- Name: idx_prediction_predictors_active; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_predictors_active ON prediction.predictors USING btree (target_id, status, expires_at) WHERE (status = 'active'::text);


--
-- Name: idx_prediction_predictors_analyst; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_predictors_analyst ON prediction.predictors USING btree (analyst_slug);


--
-- Name: idx_prediction_predictors_article_id; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_predictors_article_id ON prediction.predictors USING btree (article_id) WHERE (article_id IS NOT NULL);


--
-- Name: idx_prediction_predictors_assessment; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_predictors_assessment ON prediction.predictors USING gin (analyst_assessment);


--
-- Name: idx_prediction_predictors_created_at; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_predictors_created_at ON prediction.predictors USING btree (created_at DESC);


--
-- Name: idx_prediction_predictors_direction; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_predictors_direction ON prediction.predictors USING btree (direction);


--
-- Name: idx_prediction_predictors_expires_at; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_predictors_expires_at ON prediction.predictors USING btree (expires_at);


--
-- Name: idx_prediction_predictors_fork_type; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_predictors_fork_type ON prediction.predictors USING btree (analyst_slug, fork_type) WHERE (fork_type IS NOT NULL);


--
-- Name: idx_prediction_predictors_is_test; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_predictors_is_test ON prediction.predictors USING btree (is_test);


--
-- Name: idx_prediction_predictors_llm_usage; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_predictors_llm_usage ON prediction.predictors USING btree (llm_usage_id) WHERE (llm_usage_id IS NOT NULL);


--
-- Name: idx_prediction_predictors_scenario_run; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_predictors_scenario_run ON prediction.predictors USING btree (scenario_run_id) WHERE (scenario_run_id IS NOT NULL);


--
-- Name: idx_prediction_predictors_scenario_test; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_predictors_scenario_test ON prediction.predictors USING btree (scenario_run_id, is_test) WHERE (scenario_run_id IS NOT NULL);


--
-- Name: idx_prediction_predictors_status; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_predictors_status ON prediction.predictors USING btree (status);


--
-- Name: idx_prediction_predictors_target; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_predictors_target ON prediction.predictors USING btree (target_id);


--
-- Name: idx_prediction_signals_detected_at; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_signals_detected_at ON prediction.signals USING btree (detected_at DESC);


--
-- Name: idx_prediction_signals_direction; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_signals_direction ON prediction.signals USING btree (direction);


--
-- Name: idx_prediction_signals_disposition; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_signals_disposition ON prediction.signals USING btree (disposition);


--
-- Name: idx_prediction_signals_evaluation; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_signals_evaluation ON prediction.signals USING gin (evaluation_result) WHERE (evaluation_result IS NOT NULL);


--
-- Name: idx_prediction_signals_is_test; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_signals_is_test ON prediction.signals USING btree (is_test);


--
-- Name: idx_prediction_signals_metadata; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_signals_metadata ON prediction.signals USING gin (metadata);


--
-- Name: idx_prediction_signals_pending; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_signals_pending ON prediction.signals USING btree (target_id, disposition, detected_at) WHERE (disposition = 'pending'::text);


--
-- Name: idx_prediction_signals_scenario_run; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_signals_scenario_run ON prediction.signals USING btree (scenario_run_id) WHERE (scenario_run_id IS NOT NULL);


--
-- Name: idx_prediction_signals_source; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_signals_source ON prediction.signals USING btree (source_id);


--
-- Name: idx_prediction_signals_target; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_signals_target ON prediction.signals USING btree (target_id);


--
-- Name: idx_prediction_signals_test_target; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_signals_test_target ON prediction.signals USING btree (target_id, is_test, detected_at DESC) WHERE (is_test = true);


--
-- Name: idx_prediction_signals_urgency; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_signals_urgency ON prediction.signals USING btree (urgency) WHERE (urgency IS NOT NULL);


--
-- Name: idx_prediction_signals_worker; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_signals_worker ON prediction.signals USING btree (processing_worker) WHERE (processing_worker IS NOT NULL);


--
-- Name: idx_prediction_snapshots_analyst; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_snapshots_analyst ON prediction.snapshots USING gin (analyst_predictions);


--
-- Name: idx_prediction_snapshots_created_at; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_snapshots_created_at ON prediction.snapshots USING btree (created_at DESC);


--
-- Name: idx_prediction_snapshots_learnings; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_snapshots_learnings ON prediction.snapshots USING gin (learnings_applied);


--
-- Name: idx_prediction_snapshots_llm; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_snapshots_llm ON prediction.snapshots USING gin (llm_ensemble);


--
-- Name: idx_prediction_snapshots_prediction; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_snapshots_prediction ON prediction.snapshots USING btree (prediction_id);


--
-- Name: idx_prediction_snapshots_predictors; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_snapshots_predictors ON prediction.snapshots USING gin (predictors);


--
-- Name: idx_prediction_source_subs_active; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_source_subs_active ON prediction.source_subscriptions USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_prediction_source_subs_last_processed; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_source_subs_last_processed ON prediction.source_subscriptions USING btree (last_processed_at);


--
-- Name: idx_prediction_source_subs_source; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_source_subs_source ON prediction.source_subscriptions USING btree (source_id);


--
-- Name: idx_prediction_source_subs_target; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_source_subs_target ON prediction.source_subscriptions USING btree (target_id);


--
-- Name: idx_prediction_source_subs_universe; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_source_subs_universe ON prediction.source_subscriptions USING btree (universe_id);


--
-- Name: idx_prediction_strategies_active; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_strategies_active ON prediction.strategies USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_prediction_strategies_risk; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_strategies_risk ON prediction.strategies USING btree (risk_level);


--
-- Name: idx_prediction_strategies_slug; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_strategies_slug ON prediction.strategies USING btree (slug);


--
-- Name: idx_prediction_strategies_system; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_strategies_system ON prediction.strategies USING btree (is_system) WHERE (is_system = true);


--
-- Name: idx_prediction_target_snapshots_captured; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_target_snapshots_captured ON prediction.target_snapshots USING btree (captured_at DESC);


--
-- Name: idx_prediction_target_snapshots_is_test; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_target_snapshots_is_test ON prediction.target_snapshots USING btree (is_test);


--
-- Name: idx_prediction_target_snapshots_target; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_target_snapshots_target ON prediction.target_snapshots USING btree (target_id);


--
-- Name: idx_prediction_target_snapshots_target_time; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_target_snapshots_target_time ON prediction.target_snapshots USING btree (target_id, captured_at DESC);


--
-- Name: idx_prediction_targets_active; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_targets_active ON prediction.targets USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_prediction_targets_created_at; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_targets_created_at ON prediction.targets USING btree (created_at DESC);


--
-- Name: idx_prediction_targets_llm_override; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_targets_llm_override ON prediction.targets USING gin (llm_config_override) WHERE (llm_config_override IS NOT NULL);


--
-- Name: idx_prediction_targets_metadata; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_targets_metadata ON prediction.targets USING gin (metadata);


--
-- Name: idx_prediction_targets_symbol; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_targets_symbol ON prediction.targets USING btree (symbol);


--
-- Name: idx_prediction_targets_type; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_targets_type ON prediction.targets USING btree (target_type);


--
-- Name: idx_prediction_targets_universe; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_targets_universe ON prediction.targets USING btree (universe_id);


--
-- Name: idx_prediction_tool_requests_created_at; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_tool_requests_created_at ON prediction.tool_requests USING btree (created_at DESC);


--
-- Name: idx_prediction_tool_requests_source_miss; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_tool_requests_source_miss ON prediction.tool_requests USING btree (missed_opportunity_id) WHERE (missed_opportunity_id IS NOT NULL);


--
-- Name: idx_prediction_tool_requests_status; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_tool_requests_status ON prediction.tool_requests USING btree (status);


--
-- Name: idx_prediction_tool_requests_type; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_tool_requests_type ON prediction.tool_requests USING btree (tool_type);


--
-- Name: idx_prediction_tool_requests_universe; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_tool_requests_universe ON prediction.tool_requests USING btree (universe_id);


--
-- Name: idx_prediction_universes_active; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_universes_active ON prediction.universes USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_prediction_universes_agent; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_universes_agent ON prediction.universes USING btree (agent_slug);


--
-- Name: idx_prediction_universes_created_at; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_universes_created_at ON prediction.universes USING btree (created_at DESC);


--
-- Name: idx_prediction_universes_domain; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_universes_domain ON prediction.universes USING btree (domain);


--
-- Name: idx_prediction_universes_llm_config; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_universes_llm_config ON prediction.universes USING gin (llm_config) WHERE (llm_config IS NOT NULL);


--
-- Name: idx_prediction_universes_org; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_universes_org ON prediction.universes USING btree (organization_slug);


--
-- Name: idx_prediction_universes_strategy; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_universes_strategy ON prediction.universes USING btree (strategy_id);


--
-- Name: idx_prediction_universes_thresholds; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_prediction_universes_thresholds ON prediction.universes USING gin (thresholds) WHERE (thresholds IS NOT NULL);


--
-- Name: idx_predictions_analyst_slug; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_predictions_analyst_slug ON prediction.predictions USING btree (analyst_slug) WHERE (analyst_slug IS NOT NULL);


--
-- Name: idx_predictions_is_arbitrator; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_predictions_is_arbitrator ON prediction.predictions USING btree (target_id, is_arbitrator) WHERE (is_arbitrator = true);


--
-- Name: idx_predictions_production; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_predictions_production ON prediction.predictions USING btree (target_id, created_at DESC) WHERE (is_test = false);


--
-- Name: idx_predictions_production_active; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_predictions_production_active ON prediction.predictions USING btree (target_id, expires_at) WHERE ((is_test = false) AND (status = 'active'::text));


--
-- Name: idx_predictions_runner_context; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_predictions_runner_context ON prediction.predictions USING btree (runner_context_version_id) WHERE (runner_context_version_id IS NOT NULL);


--
-- Name: idx_predictions_target_context; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_predictions_target_context ON prediction.predictions USING btree (target_context_version_id) WHERE (target_context_version_id IS NOT NULL);


--
-- Name: idx_predictions_test_data; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_predictions_test_data ON prediction.predictions USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_predictions_test_scenario; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_predictions_test_scenario ON prediction.predictions USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_predictions_universe_context; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_predictions_universe_context ON prediction.predictions USING btree (universe_context_version_id) WHERE (universe_context_version_id IS NOT NULL);


--
-- Name: idx_predictors_production; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_predictors_production ON prediction.predictors USING btree (target_id, created_at DESC) WHERE (is_test = false);


--
-- Name: idx_predictors_test_data; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_predictors_test_data ON prediction.predictors USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_predictors_test_scenario; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_predictors_test_scenario ON prediction.predictors USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_replay_results_improvement; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_replay_results_improvement ON prediction.replay_test_results USING btree (improvement) WHERE (improvement IS NOT NULL);


--
-- Name: idx_replay_results_target; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_replay_results_target ON prediction.replay_test_results USING btree (target_id);


--
-- Name: idx_replay_results_test; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_replay_results_test ON prediction.replay_test_results USING btree (replay_test_id);


--
-- Name: idx_replay_snapshots_table; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_replay_snapshots_table ON prediction.replay_test_snapshots USING btree (table_name);


--
-- Name: idx_replay_snapshots_test; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_replay_snapshots_test ON prediction.replay_test_snapshots USING btree (replay_test_id);


--
-- Name: idx_replay_tests_created; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_replay_tests_created ON prediction.replay_tests USING btree (created_at DESC);


--
-- Name: idx_replay_tests_org; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_replay_tests_org ON prediction.replay_tests USING btree (organization_slug);


--
-- Name: idx_replay_tests_status; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_replay_tests_status ON prediction.replay_tests USING btree (status);


--
-- Name: idx_replay_tests_universe; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_replay_tests_universe ON prediction.replay_tests USING btree (universe_id);


--
-- Name: idx_review_queue_confidence; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_review_queue_confidence ON prediction.review_queue USING btree (original_confidence);


--
-- Name: idx_review_queue_created; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_review_queue_created ON prediction.review_queue USING btree (created_at DESC);


--
-- Name: idx_review_queue_learning; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_review_queue_learning ON prediction.review_queue USING btree (create_learning) WHERE (create_learning = true);


--
-- Name: idx_review_queue_predictor; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_review_queue_predictor ON prediction.review_queue USING btree (predictor_id) WHERE (predictor_id IS NOT NULL);


--
-- Name: idx_review_queue_reviewed; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_review_queue_reviewed ON prediction.review_queue USING btree (reviewed_at DESC) WHERE (reviewed_at IS NOT NULL);


--
-- Name: idx_review_queue_reviewer; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_review_queue_reviewer ON prediction.review_queue USING btree (reviewed_by_user_id) WHERE (reviewed_by_user_id IS NOT NULL);


--
-- Name: idx_review_queue_signal; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_review_queue_signal ON prediction.review_queue USING btree (signal_id);


--
-- Name: idx_review_queue_status; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_review_queue_status ON prediction.review_queue USING btree (status) WHERE (status = 'pending'::text);


--
-- Name: idx_review_queue_test_data; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_review_queue_test_data ON prediction.review_queue USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_review_queue_test_scenario; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_review_queue_test_scenario ON prediction.review_queue USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_runner_context_versions_created; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_runner_context_versions_created ON prediction.runner_context_versions USING btree (created_at DESC);


--
-- Name: idx_runner_context_versions_current; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_runner_context_versions_current ON prediction.runner_context_versions USING btree (runner_type, is_current) WHERE (is_current = true);


--
-- Name: idx_runner_context_versions_runner_type; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_runner_context_versions_runner_type ON prediction.runner_context_versions USING btree (runner_type);


--
-- Name: idx_scenario_runs_created_at; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_scenario_runs_created_at ON prediction.scenario_runs USING btree (created_at DESC);


--
-- Name: idx_scenario_runs_org; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_scenario_runs_org ON prediction.scenario_runs USING btree (organization_slug);


--
-- Name: idx_scenario_runs_outcome_match; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_scenario_runs_outcome_match ON prediction.scenario_runs USING btree (outcome_match) WHERE (outcome_match IS NOT NULL);


--
-- Name: idx_scenario_runs_scenario; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_scenario_runs_scenario ON prediction.scenario_runs USING btree (scenario_id);


--
-- Name: idx_scenario_runs_status; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_scenario_runs_status ON prediction.scenario_runs USING btree (status);


--
-- Name: idx_scenario_runs_triggered_by; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_scenario_runs_triggered_by ON prediction.scenario_runs USING btree (triggered_by) WHERE (triggered_by IS NOT NULL);


--
-- Name: idx_signals_production; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_signals_production ON prediction.signals USING btree (target_id, detected_at DESC) WHERE (is_test = false);


--
-- Name: idx_signals_production_source; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_signals_production_source ON prediction.signals USING btree (source_id, detected_at DESC) WHERE (is_test = false);


--
-- Name: idx_signals_test_data; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_signals_test_data ON prediction.signals USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_signals_test_scenario; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_signals_test_scenario ON prediction.signals USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_snapshots_test_data; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_snapshots_test_data ON prediction.snapshots USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_snapshots_test_scenario; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_snapshots_test_scenario ON prediction.snapshots USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_strategies_test_data; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_strategies_test_data ON prediction.strategies USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_strategies_test_scenario; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_strategies_test_scenario ON prediction.strategies USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_target_context_versions_current; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_target_context_versions_current ON prediction.target_context_versions USING btree (target_id, is_current) WHERE (is_current = true);


--
-- Name: idx_target_context_versions_target; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_target_context_versions_target ON prediction.target_context_versions USING btree (target_id);


--
-- Name: idx_target_snapshots_test_data; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_target_snapshots_test_data ON prediction.target_snapshots USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_target_snapshots_test_scenario; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_target_snapshots_test_scenario ON prediction.target_snapshots USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_targets_price_updated_at; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_targets_price_updated_at ON prediction.targets USING btree (price_updated_at) WHERE (price_updated_at IS NOT NULL);


--
-- Name: idx_targets_test_data; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_targets_test_data ON prediction.targets USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_targets_test_scenario; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_targets_test_scenario ON prediction.targets USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_test_articles_created_by; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_test_articles_created_by ON prediction.test_articles USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_test_articles_org; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_test_articles_org ON prediction.test_articles USING btree (organization_slug);


--
-- Name: idx_test_articles_processed; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_test_articles_processed ON prediction.test_articles USING btree (processed) WHERE (processed = false);


--
-- Name: idx_test_articles_published_at; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_test_articles_published_at ON prediction.test_articles USING btree (published_at DESC);


--
-- Name: idx_test_articles_scenario; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_test_articles_scenario ON prediction.test_articles USING btree (scenario_id) WHERE (scenario_id IS NOT NULL);


--
-- Name: idx_test_articles_target_symbols; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_test_articles_target_symbols ON prediction.test_articles USING gin (target_symbols);


--
-- Name: idx_test_audit_log_action; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_test_audit_log_action ON prediction.test_audit_log USING btree (action);


--
-- Name: idx_test_audit_log_created_at; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_test_audit_log_created_at ON prediction.test_audit_log USING btree (created_at DESC);


--
-- Name: idx_test_audit_log_org; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_test_audit_log_org ON prediction.test_audit_log USING btree (organization_slug);


--
-- Name: idx_test_audit_log_resource; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_test_audit_log_resource ON prediction.test_audit_log USING btree (resource_type, resource_id);


--
-- Name: idx_test_audit_log_resource_id; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_test_audit_log_resource_id ON prediction.test_audit_log USING btree (resource_id);


--
-- Name: idx_test_audit_log_resource_type; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_test_audit_log_resource_type ON prediction.test_audit_log USING btree (resource_type);


--
-- Name: idx_test_audit_log_user; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_test_audit_log_user ON prediction.test_audit_log USING btree (user_id);


--
-- Name: idx_test_price_data_org; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_test_price_data_org ON prediction.test_price_data USING btree (organization_slug);


--
-- Name: idx_test_price_data_scenario; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_test_price_data_scenario ON prediction.test_price_data USING btree (scenario_id) WHERE (scenario_id IS NOT NULL);


--
-- Name: idx_test_price_data_symbol; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_test_price_data_symbol ON prediction.test_price_data USING btree (symbol);


--
-- Name: idx_test_price_data_symbol_timestamp; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_test_price_data_symbol_timestamp ON prediction.test_price_data USING btree (symbol, price_timestamp DESC);


--
-- Name: idx_test_price_data_timestamp; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_test_price_data_timestamp ON prediction.test_price_data USING btree (price_timestamp DESC);


--
-- Name: idx_test_scenarios_created_at; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_test_scenarios_created_at ON prediction.test_scenarios USING btree (created_at DESC);


--
-- Name: idx_test_scenarios_org; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_test_scenarios_org ON prediction.test_scenarios USING btree (organization_slug);


--
-- Name: idx_test_scenarios_status; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_test_scenarios_status ON prediction.test_scenarios USING btree (status);


--
-- Name: idx_test_scenarios_tags; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_test_scenarios_tags ON prediction.test_scenarios USING gin (tags);


--
-- Name: idx_test_scenarios_target; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_test_scenarios_target ON prediction.test_scenarios USING btree (target_id) WHERE (target_id IS NOT NULL);


--
-- Name: idx_test_scenarios_target_symbols; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_test_scenarios_target_symbols ON prediction.test_scenarios USING gin (target_symbols);


--
-- Name: idx_test_scenarios_type; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_test_scenarios_type ON prediction.test_scenarios USING btree (scenario_type);


--
-- Name: idx_test_target_mirrors_real; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_test_target_mirrors_real ON prediction.test_target_mirrors USING btree (real_target_id);


--
-- Name: idx_test_target_mirrors_test; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_test_target_mirrors_test ON prediction.test_target_mirrors USING btree (test_target_id);


--
-- Name: idx_tool_requests_priority; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_tool_requests_priority ON prediction.tool_requests USING btree (priority);


--
-- Name: idx_tool_requests_test_data; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_tool_requests_test_data ON prediction.tool_requests USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_tool_requests_test_scenario; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_tool_requests_test_scenario ON prediction.tool_requests USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_unique_active_analyst_prediction; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE UNIQUE INDEX idx_unique_active_analyst_prediction ON prediction.predictions USING btree (target_id, analyst_slug) WHERE ((status = 'active'::text) AND (analyst_slug IS NOT NULL));


--
-- Name: idx_universe_context_versions_current; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_universe_context_versions_current ON prediction.universe_context_versions USING btree (universe_id, is_current) WHERE (is_current = true);


--
-- Name: idx_universe_context_versions_universe; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_universe_context_versions_universe ON prediction.universe_context_versions USING btree (universe_id);


--
-- Name: idx_universes_test_data; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_universes_test_data ON prediction.universes USING btree (is_test_data) WHERE (is_test_data = true);


--
-- Name: idx_universes_test_scenario; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_universes_test_scenario ON prediction.universes USING btree (test_scenario_id) WHERE (test_scenario_id IS NOT NULL);


--
-- Name: idx_user_portfolios_org; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_user_portfolios_org ON prediction.user_portfolios USING btree (org_slug);


--
-- Name: idx_user_portfolios_user; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_user_portfolios_user ON prediction.user_portfolios USING btree (user_id);


--
-- Name: idx_user_positions_open; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_user_positions_open ON prediction.user_positions USING btree (portfolio_id, status) WHERE (status = 'open'::text);


--
-- Name: idx_user_positions_portfolio; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_user_positions_portfolio ON prediction.user_positions USING btree (portfolio_id);


--
-- Name: idx_user_positions_prediction; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_user_positions_prediction ON prediction.user_positions USING btree (prediction_id);


--
-- Name: idx_user_positions_status; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_user_positions_status ON prediction.user_positions USING btree (status);


--
-- Name: idx_user_positions_target; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_user_positions_target ON prediction.user_positions USING btree (target_id);


--
-- Name: idx_user_trade_queue_pending; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_user_trade_queue_pending ON prediction.user_trade_queue USING btree (status) WHERE (status = 'queued'::text);


--
-- Name: idx_user_trade_queue_queued_at; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_user_trade_queue_queued_at ON prediction.user_trade_queue USING btree (queued_at DESC);


--
-- Name: idx_user_trade_queue_user; Type: INDEX; Schema: prediction; Owner: postgres
--

CREATE INDEX idx_user_trade_queue_user ON prediction.user_trade_queue USING btree (user_id, org_slug, status);


--
-- Name: assets_bucket_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX assets_bucket_idx ON public.assets USING btree (bucket);


--
-- Name: assets_conversation_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX assets_conversation_id_idx ON public.assets USING btree (conversation_id);


--
-- Name: assets_storage_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX assets_storage_idx ON public.assets USING btree (storage);


--
-- Name: assets_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX assets_user_id_idx ON public.assets USING btree (user_id);


--
-- Name: cidafm_commands_active_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX cidafm_commands_active_idx ON public.cidafm_commands USING btree (is_active);


--
-- Name: cidafm_commands_builtin_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX cidafm_commands_builtin_idx ON public.cidafm_commands USING btree (is_builtin);


--
-- Name: cidafm_commands_category_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX cidafm_commands_category_idx ON public.cidafm_commands USING btree (category);


--
-- Name: cidafm_commands_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX cidafm_commands_type_idx ON public.cidafm_commands USING btree (type);


--
-- Name: conversations_agent_name_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX conversations_agent_name_idx ON public.conversations USING btree (agent_name);


--
-- Name: conversations_organization_slug_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX conversations_organization_slug_idx ON public.conversations USING btree (organization_slug);


--
-- Name: conversations_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX conversations_user_id_idx ON public.conversations USING btree (user_id);


--
-- Name: deliverable_versions_deliverable_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX deliverable_versions_deliverable_id_idx ON public.deliverable_versions USING btree (deliverable_id);


--
-- Name: deliverable_versions_task_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX deliverable_versions_task_id_idx ON public.deliverable_versions USING btree (task_id);


--
-- Name: deliverables_conversation_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX deliverables_conversation_id_idx ON public.deliverables USING btree (conversation_id);


--
-- Name: deliverables_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX deliverables_user_id_idx ON public.deliverables USING btree (user_id);


--
-- Name: idx_agent_pipelines_owner; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_agent_pipelines_owner ON public.agent_pipelines USING btree (organization_slug, user_id, created_at DESC);


--
-- Name: idx_agents_agent_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_agents_agent_type ON public.agents USING btree (agent_type);


--
-- Name: idx_agents_capabilities; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_agents_capabilities ON public.agents USING gin (capabilities);


--
-- Name: idx_agents_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_agents_created_at ON public.agents USING btree (created_at DESC);


--
-- Name: idx_agents_department; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_agents_department ON public.agents USING btree (department);


--
-- Name: idx_agents_endpoint; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_agents_endpoint ON public.agents USING gin (endpoint);


--
-- Name: idx_agents_io_schema; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_agents_io_schema ON public.agents USING gin (io_schema);


--
-- Name: idx_agents_llm_config; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_agents_llm_config ON public.agents USING gin (llm_config);


--
-- Name: idx_agents_metadata; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_agents_metadata ON public.agents USING gin (metadata);


--
-- Name: idx_agents_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_agents_name ON public.agents USING btree (name);


--
-- Name: idx_agents_organization_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_agents_organization_slug ON public.agents USING gin (organization_slug);


--
-- Name: idx_agents_require_local_model; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_agents_require_local_model ON public.agents USING btree (require_local_model) WHERE (require_local_model = true);


--
-- Name: idx_agents_tags; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_agents_tags ON public.agents USING gin (tags);


--
-- Name: idx_channel_message_log_channel; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_channel_message_log_channel ON public.channel_message_log USING btree (channel, created_at DESC);


--
-- Name: idx_channel_message_log_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_channel_message_log_user ON public.channel_message_log USING btree (channel_user_id, created_at DESC);


--
-- Name: idx_channel_users_allowed; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_channel_users_allowed ON public.channel_users USING btree (is_allowed) WHERE (is_allowed = true);


--
-- Name: idx_channel_users_channel; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_channel_users_channel ON public.channel_users USING btree (channel, channel_user_id);


--
-- Name: idx_conversation_messages_conversation_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_conversation_messages_conversation_created ON public.conversation_messages USING btree (conversation_id, created_at);


--
-- Name: idx_deliverables_task_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deliverables_task_id ON public.deliverables USING btree (task_id) WHERE (task_id IS NOT NULL);


--
-- Name: idx_observability_events_agent_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_observability_events_agent_slug ON public.observability_events USING btree (agent_slug) WHERE (agent_slug IS NOT NULL);


--
-- Name: idx_observability_events_conversation_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_observability_events_conversation_id ON public.observability_events USING btree (conversation_id) WHERE (conversation_id IS NOT NULL);


--
-- Name: idx_observability_events_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_observability_events_created_at ON public.observability_events USING btree (created_at DESC);


--
-- Name: idx_observability_events_hook_event_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_observability_events_hook_event_type ON public.observability_events USING btree (hook_event_type);


--
-- Name: idx_observability_events_task_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_observability_events_task_id ON public.observability_events USING btree (task_id) WHERE (task_id IS NOT NULL);


--
-- Name: idx_observability_events_timestamp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_observability_events_timestamp ON public.observability_events USING btree ("timestamp" DESC);


--
-- Name: idx_observability_events_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_observability_events_user_id ON public.observability_events USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_organizations_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_organizations_created_at ON public.organizations USING btree (created_at DESC);


--
-- Name: idx_organizations_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_organizations_name ON public.organizations USING btree (name);


--
-- Name: idx_organizations_settings; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_organizations_settings ON public.organizations USING gin (settings);


--
-- Name: idx_redaction_patterns_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_redaction_patterns_category ON public.redaction_patterns USING btree (category);


--
-- Name: idx_redaction_patterns_data_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_redaction_patterns_data_type ON public.redaction_patterns USING btree (data_type);


--
-- Name: idx_redaction_patterns_is_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_redaction_patterns_is_active ON public.redaction_patterns USING btree (is_active);


--
-- Name: idx_redaction_patterns_severity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_redaction_patterns_severity ON public.redaction_patterns USING btree (severity);


--
-- Name: idx_tasks_hitl_pending; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_hitl_pending ON public.tasks USING btree (hitl_pending, hitl_pending_since DESC) WHERE (hitl_pending = true);


--
-- Name: idx_team_members_team_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_team_members_team_id ON public.team_members USING btree (team_id);


--
-- Name: idx_team_members_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_team_members_user_id ON public.team_members USING btree (user_id);


--
-- Name: idx_teams_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_teams_created_by ON public.teams USING btree (created_by);


--
-- Name: idx_teams_org_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_teams_org_slug ON public.teams USING btree (org_slug);


--
-- Name: llm_fabric_node_reports_drain_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_fabric_node_reports_drain_idx ON public.llm_fabric_node_reports USING btree (drain_mode, reported_at DESC);


--
-- Name: llm_fabric_node_reports_reported_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_fabric_node_reports_reported_at_idx ON public.llm_fabric_node_reports USING btree (reported_at DESC);


--
-- Name: llm_fabric_routing_decisions_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_fabric_routing_decisions_at_idx ON public.llm_fabric_routing_decisions USING btree (at DESC);


--
-- Name: llm_fabric_routing_decisions_node_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_fabric_routing_decisions_node_idx ON public.llm_fabric_routing_decisions USING btree (selected_node_id, at DESC) WHERE (selected_node_id IS NOT NULL);


--
-- Name: llm_fabric_routing_decisions_outcome_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_fabric_routing_decisions_outcome_idx ON public.llm_fabric_routing_decisions USING btree (outcome, at DESC);


--
-- Name: llm_fabric_routing_decisions_policy_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_fabric_routing_decisions_policy_idx ON public.llm_fabric_routing_decisions USING gin (matched_policy_ids);


--
-- Name: llm_fabric_routing_decisions_role_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_fabric_routing_decisions_role_idx ON public.llm_fabric_routing_decisions USING btree (role, at DESC);


--
-- Name: llm_fabric_routing_policies_enabled_priority_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_fabric_routing_policies_enabled_priority_idx ON public.llm_fabric_routing_policies USING btree (enabled, priority, id);


--
-- Name: llm_fabric_routing_policies_roles_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_fabric_routing_policies_roles_idx ON public.llm_fabric_routing_policies USING gin (roles);


--
-- Name: llm_fabric_routing_policies_workflows_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_fabric_routing_policies_workflows_idx ON public.llm_fabric_routing_policies USING gin (workflows);


--
-- Name: llm_models_active_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_models_active_idx ON public.llm_models USING btree (is_active);


--
-- Name: llm_models_deprecated_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_models_deprecated_at_idx ON public.llm_models USING btree (deprecated_at) WHERE (deprecated_at IS NOT NULL);


--
-- Name: llm_models_last_validated_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_models_last_validated_idx ON public.llm_models USING btree (last_validated_at);


--
-- Name: llm_models_provider_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_models_provider_idx ON public.llm_models USING btree (provider_name);


--
-- Name: llm_models_tier_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_models_tier_idx ON public.llm_models USING btree (model_tier);


--
-- Name: llm_models_vendor_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_models_vendor_idx ON public.llm_models USING btree (vendor);


--
-- Name: llm_providers_active_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_providers_active_idx ON public.llm_providers USING btree (is_active);


--
-- Name: llm_usage_conversation_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_usage_conversation_id_idx ON public.llm_usage USING btree (conversation_id);


--
-- Name: llm_usage_fabric_node_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_usage_fabric_node_id_idx ON public.llm_usage USING btree (fabric_node_id) WHERE (fabric_node_id IS NOT NULL);


--
-- Name: llm_usage_fabric_node_name_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_usage_fabric_node_name_idx ON public.llm_usage USING btree (fabric_node_name) WHERE (fabric_node_name IS NOT NULL);


--
-- Name: llm_usage_fabric_role_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_usage_fabric_role_idx ON public.llm_usage USING btree (fabric_role) WHERE (fabric_role IS NOT NULL);


--
-- Name: llm_usage_memory_context_scope_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_usage_memory_context_scope_idx ON public.llm_usage USING gin (memory_context_scope);


--
-- Name: llm_usage_memory_entry_ids_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_usage_memory_entry_ids_idx ON public.llm_usage USING gin (memory_entry_ids);


--
-- Name: llm_usage_model_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_usage_model_idx ON public.llm_usage USING btree (model_name);


--
-- Name: llm_usage_provider_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_usage_provider_idx ON public.llm_usage USING btree (provider_name);


--
-- Name: llm_usage_run_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_usage_run_id ON public.llm_usage USING btree (run_id) WHERE (run_id IS NOT NULL);


--
-- Name: llm_usage_showstopper_detected_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_usage_showstopper_detected_idx ON public.llm_usage USING btree (showstopper_detected);


--
-- Name: llm_usage_started_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_usage_started_at_idx ON public.llm_usage USING btree (started_at);


--
-- Name: llm_usage_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX llm_usage_user_id_idx ON public.llm_usage USING btree (user_id);


--
-- Name: org_credentials_org_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX org_credentials_org_idx ON public.organization_credentials USING btree (organization_slug);


--
-- Name: plan_deliverables_plan_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX plan_deliverables_plan_id_idx ON public.plan_deliverables USING btree (plan_id);


--
-- Name: plan_versions_plan_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX plan_versions_plan_id_idx ON public.plan_versions USING btree (plan_id);


--
-- Name: plans_conversation_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX plans_conversation_id_idx ON public.plans USING btree (conversation_id);


--
-- Name: plans_organization_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX plans_organization_idx ON public.plans USING btree (organization_slug);


--
-- Name: plans_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX plans_user_id_idx ON public.plans USING btree (user_id);


--
-- Name: pseudonym_dict_expires_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pseudonym_dict_expires_at_idx ON public.pseudonym_dictionaries USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: pseudonym_dict_org_agent_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pseudonym_dict_org_agent_idx ON public.pseudonym_dictionaries USING btree (organization_slug, agent_slug) WHERE (is_active = true);


--
-- Name: pseudonym_dict_user_conv_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pseudonym_dict_user_conv_idx ON public.pseudonym_dictionaries USING btree (user_id, conversation_id);


--
-- Name: pseudonym_dict_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pseudonym_dict_user_id_idx ON public.pseudonym_dictionaries USING btree (user_id);


--
-- Name: pseudonym_mappings_context_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pseudonym_mappings_context_idx ON public.pseudonym_mappings USING btree (context);


--
-- Name: pseudonym_mappings_data_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pseudonym_mappings_data_type_idx ON public.pseudonym_mappings USING btree (data_type);


--
-- Name: pseudonym_mappings_original_hash_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX pseudonym_mappings_original_hash_key ON public.pseudonym_mappings USING btree (original_hash);


--
-- Name: pseudonym_mappings_pseudonym_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pseudonym_mappings_pseudonym_idx ON public.pseudonym_mappings USING btree (pseudonym);


--
-- Name: pseudonym_mappings_usage_count_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pseudonym_mappings_usage_count_idx ON public.pseudonym_mappings USING btree (usage_count DESC);


--
-- Name: redaction_audit_log_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX redaction_audit_log_created_at_idx ON public.redaction_audit_log USING btree (created_at DESC);


--
-- Name: redaction_audit_log_operation_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX redaction_audit_log_operation_type_idx ON public.redaction_audit_log USING btree (operation_type);


--
-- Name: redaction_audit_log_run_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX redaction_audit_log_run_id_idx ON public.redaction_audit_log USING btree (run_id);


--
-- Name: task_messages_task_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX task_messages_task_id_idx ON public.task_messages USING btree (task_id);


--
-- Name: tasks_conversation_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX tasks_conversation_id_idx ON public.tasks USING btree (conversation_id);


--
-- Name: tasks_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX tasks_status_idx ON public.tasks USING btree (status);


--
-- Name: tasks_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX tasks_user_id_idx ON public.tasks USING btree (user_id);


--
-- Name: teams_org_name_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX teams_org_name_unique ON public.teams USING btree (COALESCE(org_slug, ''::text), name);


--
-- Name: user_cidafm_commands_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX user_cidafm_commands_user_idx ON public.user_cidafm_commands USING btree (user_id);


--
-- Name: idx_rag_chunks_collection; Type: INDEX; Schema: rag_data; Owner: postgres
--

CREATE INDEX idx_rag_chunks_collection ON rag_data.rag_document_chunks USING btree (collection_id);


--
-- Name: idx_rag_chunks_document; Type: INDEX; Schema: rag_data; Owner: postgres
--

CREATE INDEX idx_rag_chunks_document ON rag_data.rag_document_chunks USING btree (document_id);


--
-- Name: idx_rag_chunks_embedding; Type: INDEX; Schema: rag_data; Owner: postgres
--

CREATE INDEX idx_rag_chunks_embedding ON rag_data.rag_document_chunks USING hnsw (embedding rag_data.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: idx_rag_chunks_org; Type: INDEX; Schema: rag_data; Owner: postgres
--

CREATE INDEX idx_rag_chunks_org ON rag_data.rag_document_chunks USING btree (organization_slug);


--
-- Name: idx_rag_collections_allowed_users; Type: INDEX; Schema: rag_data; Owner: postgres
--

CREATE INDEX idx_rag_collections_allowed_users ON rag_data.rag_collections USING gin (allowed_users);


--
-- Name: idx_rag_collections_complexity_type; Type: INDEX; Schema: rag_data; Owner: postgres
--

CREATE INDEX idx_rag_collections_complexity_type ON rag_data.rag_collections USING btree (complexity_type);


--
-- Name: idx_rag_collections_org; Type: INDEX; Schema: rag_data; Owner: postgres
--

CREATE INDEX idx_rag_collections_org ON rag_data.rag_collections USING btree (organization_slug);


--
-- Name: idx_rag_collections_org_slug; Type: INDEX; Schema: rag_data; Owner: postgres
--

CREATE INDEX idx_rag_collections_org_slug ON rag_data.rag_collections USING btree (organization_slug, slug);


--
-- Name: idx_rag_collections_status; Type: INDEX; Schema: rag_data; Owner: postgres
--

CREATE INDEX idx_rag_collections_status ON rag_data.rag_collections USING btree (status);


--
-- Name: idx_rag_documents_collection; Type: INDEX; Schema: rag_data; Owner: postgres
--

CREATE INDEX idx_rag_documents_collection ON rag_data.rag_documents USING btree (collection_id);


--
-- Name: idx_rag_documents_hash; Type: INDEX; Schema: rag_data; Owner: postgres
--

CREATE INDEX idx_rag_documents_hash ON rag_data.rag_documents USING btree (file_hash);


--
-- Name: idx_rag_documents_org; Type: INDEX; Schema: rag_data; Owner: postgres
--

CREATE INDEX idx_rag_documents_org ON rag_data.rag_documents USING btree (organization_slug);


--
-- Name: idx_rag_documents_status; Type: INDEX; Schema: rag_data; Owner: postgres
--

CREATE INDEX idx_rag_documents_status ON rag_data.rag_documents USING btree (status);


--
-- Name: rag_collections_workflow_output_unique; Type: INDEX; Schema: rag_data; Owner: postgres
--

CREATE UNIQUE INDEX rag_collections_workflow_output_unique ON rag_data.rag_collections USING btree (organization_slug, source_workflow_slug) WHERE (collection_type = 'workflow-output'::text);


--
-- Name: rag_document_chunks_access_control_gin; Type: INDEX; Schema: rag_data; Owner: postgres
--

CREATE INDEX rag_document_chunks_access_control_gin ON rag_data.rag_document_chunks USING gin (((metadata -> 'access_control'::text)));


--
-- Name: rag_document_chunks_bm25_tokens_gin; Type: INDEX; Schema: rag_data; Owner: postgres
--

CREATE INDEX rag_document_chunks_bm25_tokens_gin ON rag_data.rag_document_chunks USING gin (((metadata -> 'bm25_tokens'::text)));


--
-- Name: rag_document_chunks_enrichment_version_idx; Type: INDEX; Schema: rag_data; Owner: postgres
--

CREATE INDEX rag_document_chunks_enrichment_version_idx ON rag_data.rag_document_chunks USING btree (organization_slug, enrichment_version);


--
-- Name: rag_document_chunks_job_chunk_unique; Type: INDEX; Schema: rag_data; Owner: postgres
--

CREATE UNIQUE INDEX rag_document_chunks_job_chunk_unique ON rag_data.rag_document_chunks USING btree (collection_id, (((metadata ->> 'source_job_id'::text))::uuid), chunk_index) WHERE (metadata ? 'source_job_id'::text);


--
-- Name: rag_document_chunks_source_job_idx; Type: INDEX; Schema: rag_data; Owner: postgres
--

CREATE INDEX rag_document_chunks_source_job_idx ON rag_data.rag_document_chunks USING btree (((metadata ->> 'source_job_id'::text))) WHERE (metadata ? 'source_job_id'::text);


--
-- Name: rag_feedback_signals_org_chunk_idx; Type: INDEX; Schema: rag_data; Owner: postgres
--

CREATE INDEX rag_feedback_signals_org_chunk_idx ON rag_data.rag_feedback_signals USING btree (organization_slug, chunk_id);


--
-- Name: idx_assessment_runs_org_status; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_assessment_runs_org_status ON risk.assessment_runs USING btree (organization_slug, status);


--
-- Name: idx_assessment_runs_subject; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_assessment_runs_subject ON risk.assessment_runs USING btree (subject_id, started_at DESC);


--
-- Name: idx_composite_scores_scope_time; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_composite_scores_scope_time ON risk.composite_scores USING btree (subject_id, status, created_at DESC);


--
-- Name: idx_composite_scores_subject_time; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_composite_scores_subject_time ON risk.composite_scores USING btree (subject_id, created_at DESC);


--
-- Name: idx_data_sources_next_fetch; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_data_sources_next_fetch ON risk.data_sources USING btree (next_fetch_at) WHERE ((status)::text = 'active'::text);


--
-- Name: idx_data_sources_scope_id; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_data_sources_scope_id ON risk.data_sources USING btree (scope_id);


--
-- Name: idx_data_sources_source_type; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_data_sources_source_type ON risk.data_sources USING btree (source_type);


--
-- Name: idx_data_sources_status; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_data_sources_status ON risk.data_sources USING btree (status);


--
-- Name: idx_fetch_history_fetched_at; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_fetch_history_fetched_at ON risk.data_source_fetch_history USING btree (fetched_at DESC);


--
-- Name: idx_fetch_history_source_id; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_fetch_history_source_id ON risk.data_source_fetch_history USING btree (data_source_id);


--
-- Name: idx_mitigations_assessment; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_mitigations_assessment ON risk.mitigations USING btree (assessment_id);


--
-- Name: idx_mitigations_subject; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_mitigations_subject ON risk.mitigations USING btree (subject_id);


--
-- Name: idx_risk_alerts_composite; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_alerts_composite ON risk.alerts USING btree (composite_score_id);


--
-- Name: idx_risk_alerts_created; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_alerts_created ON risk.alerts USING btree (created_at DESC);


--
-- Name: idx_risk_alerts_severity; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_alerts_severity ON risk.alerts USING btree (severity);


--
-- Name: idx_risk_alerts_subject; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_alerts_subject ON risk.alerts USING btree (subject_id);


--
-- Name: idx_risk_alerts_type; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_alerts_type ON risk.alerts USING btree (alert_type);


--
-- Name: idx_risk_alerts_unacknowledged; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_alerts_unacknowledged ON risk.alerts USING btree (acknowledged_at) WHERE (acknowledged_at IS NULL);


--
-- Name: idx_risk_article_class_article; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_article_class_article ON risk.article_classifications USING btree (article_id);


--
-- Name: idx_risk_article_class_created; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_article_class_created ON risk.article_classifications USING btree (created_at DESC);


--
-- Name: idx_risk_article_class_dimensions; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_article_class_dimensions ON risk.article_classifications USING gin (dimension_slugs);


--
-- Name: idx_risk_article_class_scope; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_article_class_scope ON risk.article_classifications USING btree (scope_id);


--
-- Name: idx_risk_article_class_sentiment; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_article_class_sentiment ON risk.article_classifications USING btree (sentiment_label);


--
-- Name: idx_risk_article_class_status; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_article_class_status ON risk.article_classifications USING btree (status) WHERE (status = 'classified'::text);


--
-- Name: idx_risk_article_class_subjects; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_article_class_subjects ON risk.article_classifications USING gin (subject_identifiers);


--
-- Name: idx_risk_assessments_created; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_assessments_created ON risk.assessments USING btree (created_at DESC);


--
-- Name: idx_risk_assessments_dimension; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_assessments_dimension ON risk.assessments USING btree (dimension_id);


--
-- Name: idx_risk_assessments_subject; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_assessments_subject ON risk.assessments USING btree (subject_id);


--
-- Name: idx_risk_assessments_task; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_assessments_task ON risk.assessments USING btree (task_id);


--
-- Name: idx_risk_comparisons_created; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_comparisons_created ON risk.comparisons USING btree (created_at DESC);


--
-- Name: idx_risk_comparisons_scope; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_comparisons_scope ON risk.comparisons USING btree (scope_id);


--
-- Name: idx_risk_composite_active; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_composite_active ON risk.composite_scores USING btree (subject_id, status) WHERE (status = 'active'::text);


--
-- Name: idx_risk_composite_created; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_composite_created ON risk.composite_scores USING btree (created_at DESC);


--
-- Name: idx_risk_composite_status; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_composite_status ON risk.composite_scores USING btree (status);


--
-- Name: idx_risk_composite_subject; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_composite_subject ON risk.composite_scores USING btree (subject_id);


--
-- Name: idx_risk_composite_task; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_composite_task ON risk.composite_scores USING btree (task_id);


--
-- Name: idx_risk_debate_contexts_active; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_debate_contexts_active ON risk.debate_contexts USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_risk_debate_contexts_role; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_debate_contexts_role ON risk.debate_contexts USING btree (role);


--
-- Name: idx_risk_debate_contexts_scope; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_debate_contexts_scope ON risk.debate_contexts USING btree (scope_id);


--
-- Name: idx_risk_debates_created; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_debates_created ON risk.debates USING btree (created_at DESC);


--
-- Name: idx_risk_debates_status; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_debates_status ON risk.debates USING btree (status);


--
-- Name: idx_risk_debates_subject; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_debates_subject ON risk.debates USING btree (subject_id);


--
-- Name: idx_risk_debates_task; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_debates_task ON risk.debates USING btree (task_id);


--
-- Name: idx_risk_dim_contexts_active; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_dim_contexts_active ON risk.dimension_contexts USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_risk_dim_contexts_dimension; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_dim_contexts_dimension ON risk.dimension_contexts USING btree (dimension_id);


--
-- Name: idx_risk_dim_contexts_version; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_dim_contexts_version ON risk.dimension_contexts USING btree (dimension_id, version);


--
-- Name: idx_risk_dimensions_active; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_dimensions_active ON risk.dimensions USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_risk_dimensions_scope; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_dimensions_scope ON risk.dimensions USING btree (scope_id);


--
-- Name: idx_risk_dimensions_slug; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_dimensions_slug ON risk.dimensions USING btree (slug);


--
-- Name: idx_risk_evaluations_composite; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_evaluations_composite ON risk.evaluations USING btree (composite_score_id);


--
-- Name: idx_risk_evaluations_created; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_evaluations_created ON risk.evaluations USING btree (created_at DESC);


--
-- Name: idx_risk_evaluations_subject; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_evaluations_subject ON risk.evaluations USING btree (subject_id);


--
-- Name: idx_risk_evaluations_window; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_evaluations_window ON risk.evaluations USING btree (evaluation_window);


--
-- Name: idx_risk_executive_summaries_generated; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_executive_summaries_generated ON risk.executive_summaries USING btree (generated_at DESC);


--
-- Name: idx_risk_executive_summaries_scope; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_executive_summaries_scope ON risk.executive_summaries USING btree (scope_id);


--
-- Name: idx_risk_executive_summaries_type; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_executive_summaries_type ON risk.executive_summaries USING btree (summary_type);


--
-- Name: idx_risk_learning_queue_created; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_learning_queue_created ON risk.learning_queue USING btree (created_at DESC);


--
-- Name: idx_risk_learning_queue_pending; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_learning_queue_pending ON risk.learning_queue USING btree (status) WHERE (status = 'pending'::text);


--
-- Name: idx_risk_learning_queue_scope; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_learning_queue_scope ON risk.learning_queue USING btree (scope_id);


--
-- Name: idx_risk_learning_queue_status; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_learning_queue_status ON risk.learning_queue USING btree (status);


--
-- Name: idx_risk_learnings_dimension; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_learnings_dimension ON risk.learnings USING btree (dimension_id);


--
-- Name: idx_risk_learnings_production; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_learnings_production ON risk.learnings USING btree (is_production) WHERE (is_production = true);


--
-- Name: idx_risk_learnings_scope; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_learnings_scope ON risk.learnings USING btree (scope_id);


--
-- Name: idx_risk_learnings_scope_level; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_learnings_scope_level ON risk.learnings USING btree (scope_level);


--
-- Name: idx_risk_learnings_status; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_learnings_status ON risk.learnings USING btree (status);


--
-- Name: idx_risk_learnings_subject; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_learnings_subject ON risk.learnings USING btree (subject_id);


--
-- Name: idx_risk_learnings_type; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_learnings_type ON risk.learnings USING btree (learning_type);


--
-- Name: idx_risk_reports_created; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_reports_created ON risk.reports USING btree (created_at DESC);


--
-- Name: idx_risk_reports_scope; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_reports_scope ON risk.reports USING btree (scope_id);


--
-- Name: idx_risk_reports_status; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_reports_status ON risk.reports USING btree (status);


--
-- Name: idx_risk_scenarios_created; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_scenarios_created ON risk.scenarios USING btree (created_at DESC);


--
-- Name: idx_risk_scenarios_scope; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_scenarios_scope ON risk.scenarios USING btree (scope_id);


--
-- Name: idx_risk_scenarios_template; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_scenarios_template ON risk.scenarios USING btree (is_template) WHERE (is_template = true);


--
-- Name: idx_risk_scopes_active; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_scopes_active ON risk.scopes USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_risk_scopes_agent; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_scopes_agent ON risk.scopes USING btree (agent_slug);


--
-- Name: idx_risk_scopes_domain; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_scopes_domain ON risk.scopes USING btree (domain);


--
-- Name: idx_risk_scopes_org; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_scopes_org ON risk.scopes USING btree (organization_slug);


--
-- Name: idx_risk_source_subs_active; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_source_subs_active ON risk.source_subscriptions USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_risk_source_subs_dimension_mapping; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_source_subs_dimension_mapping ON risk.source_subscriptions USING gin (dimension_mapping);


--
-- Name: idx_risk_source_subs_last_processed; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_source_subs_last_processed ON risk.source_subscriptions USING btree (last_processed_at);


--
-- Name: idx_risk_source_subs_scope; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_source_subs_scope ON risk.source_subscriptions USING btree (scope_id);


--
-- Name: idx_risk_source_subs_source; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_source_subs_source ON risk.source_subscriptions USING btree (source_id);


--
-- Name: idx_risk_source_subs_subject_filter; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_source_subs_subject_filter ON risk.source_subscriptions USING gin (subject_filter);


--
-- Name: idx_risk_subjects_active; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_subjects_active ON risk.subjects USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_risk_subjects_identifier; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_subjects_identifier ON risk.subjects USING btree (identifier);


--
-- Name: idx_risk_subjects_scope; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_subjects_scope ON risk.subjects USING btree (scope_id);


--
-- Name: idx_risk_subjects_type; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_risk_subjects_type ON risk.subjects USING btree (subject_type);


--
-- Name: idx_simulations_created_at; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_simulations_created_at ON risk.simulations USING btree (created_at DESC);


--
-- Name: idx_simulations_scope_id; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_simulations_scope_id ON risk.simulations USING btree (scope_id);


--
-- Name: idx_simulations_status; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_simulations_status ON risk.simulations USING btree (status);


--
-- Name: idx_simulations_subject_id; Type: INDEX; Schema: risk; Owner: postgres
--

CREATE INDEX idx_simulations_subject_id ON risk.simulations USING btree (subject_id);


--
-- Name: sentinel_alerts_org_status_idx; Type: INDEX; Schema: sentinel; Owner: postgres
--

CREATE INDEX sentinel_alerts_org_status_idx ON sentinel.alerts USING btree (org_slug, status, created_at DESC);


--
-- Name: sentinel_alerts_signal_target_idx; Type: INDEX; Schema: sentinel; Owner: postgres
--

CREATE INDEX sentinel_alerts_signal_target_idx ON sentinel.alerts USING btree (signal_target_id) WHERE (signal_target_id IS NOT NULL);


--
-- Name: sentinel_observations_org_source_idx; Type: INDEX; Schema: sentinel; Owner: postgres
--

CREATE INDEX sentinel_observations_org_source_idx ON sentinel.observations USING btree (org_slug, source_id, created_at DESC);


--
-- Name: sentinel_signal_targets_profile_idx; Type: INDEX; Schema: sentinel; Owner: postgres
--

CREATE INDEX sentinel_signal_targets_profile_idx ON sentinel.signal_targets USING btree (watch_profile_id);


--
-- Name: sentinel_signals_org_created_idx; Type: INDEX; Schema: sentinel; Owner: postgres
--

CREATE INDEX sentinel_signals_org_created_idx ON sentinel.signals USING btree (org_slug, created_at DESC);


--
-- Name: sentinel_source_runs_org_source_idx; Type: INDEX; Schema: sentinel; Owner: postgres
--

CREATE INDEX sentinel_source_runs_org_source_idx ON sentinel.source_runs USING btree (org_slug, source_id, started_at DESC);


--
-- Name: sentinel_sources_org_enabled_idx; Type: INDEX; Schema: sentinel; Owner: postgres
--

CREATE INDEX sentinel_sources_org_enabled_idx ON sentinel.sources USING btree (org_slug, enabled);


--
-- Name: sentinel_sources_test_run_idx; Type: INDEX; Schema: sentinel; Owner: postgres
--

CREATE INDEX sentinel_sources_test_run_idx ON sentinel.sources USING btree (test_run_id) WHERE (test_run_id IS NOT NULL);


--
-- Name: sentinel_test_runs_org_status_idx; Type: INDEX; Schema: sentinel; Owner: postgres
--

CREATE INDEX sentinel_test_runs_org_status_idx ON sentinel.test_runs USING btree (org_slug, status, created_at DESC);


--
-- Name: sentinel_watch_concerns_profile_idx; Type: INDEX; Schema: sentinel; Owner: postgres
--

CREATE INDEX sentinel_watch_concerns_profile_idx ON sentinel.watch_concerns USING btree (watch_profile_id);


--
-- Name: sentinel_watch_profiles_org_enabled_idx; Type: INDEX; Schema: sentinel; Owner: postgres
--

CREATE INDEX sentinel_watch_profiles_org_enabled_idx ON sentinel.watch_profiles USING btree (org_slug, enabled);


--
-- Name: sentinel_watch_profiles_test_run_idx; Type: INDEX; Schema: sentinel; Owner: postgres
--

CREATE INDEX sentinel_watch_profiles_test_run_idx ON sentinel.watch_profiles USING btree (test_run_id) WHERE (test_run_id IS NOT NULL);


--
-- Name: substrate_document_mappings_lookup_idx; Type: INDEX; Schema: substrate; Owner: postgres
--

CREATE INDEX substrate_document_mappings_lookup_idx ON substrate.document_mappings USING btree (org_slug, profile_id, status);


--
-- Name: substrate_entity_mappings_lookup_idx; Type: INDEX; Schema: substrate; Owner: postgres
--

CREATE INDEX substrate_entity_mappings_lookup_idx ON substrate.entity_mappings USING btree (org_slug, profile_id, canonical_entity, status);


--
-- Name: substrate_profiles_one_default_active_idx; Type: INDEX; Schema: substrate; Owner: postgres
--

CREATE UNIQUE INDEX substrate_profiles_one_default_active_idx ON substrate.profiles USING btree (org_slug) WHERE ((is_default = true) AND (status = 'active'::text));


--
-- Name: substrate_resolution_log_recent_idx; Type: INDEX; Schema: substrate; Owner: postgres
--

CREATE INDEX substrate_resolution_log_recent_idx ON substrate.resolution_log USING btree (org_slug, created_at DESC);


--
-- Name: substrate_selection_presets_workflow_idx; Type: INDEX; Schema: substrate; Owner: postgres
--

CREATE INDEX substrate_selection_presets_workflow_idx ON substrate.selection_presets USING btree (org_slug, profile_id, workflow_slug, status);


--
-- Name: substrate_sources_profile_status_idx; Type: INDEX; Schema: substrate; Owner: postgres
--

CREATE INDEX substrate_sources_profile_status_idx ON substrate.sources USING btree (org_slug, profile_id, status, priority);


--
-- Name: agent_definition_links_one_reviewer; Type: INDEX; Schema: workflows; Owner: postgres
--

CREATE UNIQUE INDEX agent_definition_links_one_reviewer ON workflows.agent_definition_links USING btree (workflow_slug) WHERE (purpose = 'trace_review'::text);


--
-- Name: agent_definition_links_workflow; Type: INDEX; Schema: workflows; Owner: postgres
--

CREATE INDEX agent_definition_links_workflow ON workflows.agent_definition_links USING btree (workflow_slug);


--
-- Name: agent_definition_override_history_lookup; Type: INDEX; Schema: workflows; Owner: postgres
--

CREATE INDEX agent_definition_override_history_lookup ON workflows.agent_definition_override_history USING btree (agent_slug, organization_slug, changed_at DESC);


--
-- Name: human_reviews_one_waiting_per_run; Type: INDEX; Schema: workflows; Owner: postgres
--

CREATE UNIQUE INDEX human_reviews_one_waiting_per_run ON workflows.human_reviews USING btree (run_id) WHERE (status = 'waiting'::text);


--
-- Name: human_reviews_org_status; Type: INDEX; Schema: workflows; Owner: postgres
--

CREATE INDEX human_reviews_org_status ON workflows.human_reviews USING btree (organization_slug, status);


--
-- Name: improvement_requests_queue; Type: INDEX; Schema: workflows; Owner: postgres
--

CREATE INDEX improvement_requests_queue ON workflows.improvement_requests USING btree (organization_slug, status, created_at);


--
-- Name: issue_ledger_events_issue; Type: INDEX; Schema: workflows; Owner: postgres
--

CREATE INDEX issue_ledger_events_issue ON workflows.issue_ledger_events USING btree (issue_id, id);


--
-- Name: issue_ledger_org_status; Type: INDEX; Schema: workflows; Owner: postgres
--

CREATE INDEX issue_ledger_org_status ON workflows.issue_ledger USING btree (organization_slug, status, severity);


--
-- Name: issue_ledger_run; Type: INDEX; Schema: workflows; Owner: postgres
--

CREATE INDEX issue_ledger_run ON workflows.issue_ledger USING btree (run_id);


--
-- Name: participant_runs_request; Type: INDEX; Schema: workflows; Owner: postgres
--

CREATE INDEX participant_runs_request ON workflows.participant_runs USING btree (llm_request_id) WHERE (llm_request_id IS NOT NULL);


--
-- Name: participant_runs_unit; Type: INDEX; Schema: workflows; Owner: postgres
--

CREATE INDEX participant_runs_unit ON workflows.participant_runs USING btree (work_unit_run_id, "position");


--
-- Name: runs_org_status_idx; Type: INDEX; Schema: workflows; Owner: postgres
--

CREATE INDEX runs_org_status_idx ON workflows.runs USING btree (organization_slug, status);


--
-- Name: runs_org_workflow_created_idx; Type: INDEX; Schema: workflows; Owner: postgres
--

CREATE INDEX runs_org_workflow_created_idx ON workflows.runs USING btree (organization_slug, workflow_slug, created_at DESC);


--
-- Name: runs_parent_run_id_idx; Type: INDEX; Schema: workflows; Owner: postgres
--

CREATE INDEX runs_parent_run_id_idx ON workflows.runs USING btree (parent_run_id) WHERE (parent_run_id IS NOT NULL);


--
-- Name: runs_queue_idx; Type: INDEX; Schema: workflows; Owner: postgres
--

CREATE INDEX runs_queue_idx ON workflows.runs USING btree (status, queued_at);


--
-- Name: trace_reviews_run; Type: INDEX; Schema: workflows; Owner: postgres
--

CREATE INDEX trace_reviews_run ON workflows.trace_reviews USING btree (run_id, created_at);


--
-- Name: work_unit_runs_run; Type: INDEX; Schema: workflows; Owner: postgres
--

CREATE INDEX work_unit_runs_run ON workflows.work_unit_runs USING btree (run_id, ordinal);


--
-- Name: replay_test_summary _RETURN; Type: RULE; Schema: prediction; Owner: postgres
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
-- Name: dimension_contribution _RETURN; Type: RULE; Schema: risk; Owner: postgres
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
-- Name: adapter_state ambient_adapter_state_updated_at; Type: TRIGGER; Schema: ambient; Owner: postgres
--

CREATE TRIGGER ambient_adapter_state_updated_at BEFORE UPDATE ON ambient.adapter_state FOR EACH ROW EXECUTE FUNCTION ambient.set_updated_at();


--
-- Name: triggers ambient_triggers_updated_at; Type: TRIGGER; Schema: ambient; Owner: postgres
--

CREATE TRIGGER ambient_triggers_updated_at BEFORE UPDATE ON ambient.triggers FOR EACH ROW EXECUTE FUNCTION ambient.set_updated_at();


--
-- Name: auth_identity_links auth_identity_links_updated_at; Type: TRIGGER; Schema: authz; Owner: postgres
--

CREATE TRIGGER auth_identity_links_updated_at BEFORE UPDATE ON authz.auth_identity_links FOR EACH ROW EXECUTE FUNCTION public.update_auth_identity_links_updated_at();


--
-- Name: rbac_roles rbac_roles_updated_at; Type: TRIGGER; Schema: authz; Owner: postgres
--

CREATE TRIGGER rbac_roles_updated_at BEFORE UPDATE ON authz.rbac_roles FOR EACH ROW EXECUTE FUNCTION authz.update_rbac_roles_updated_at();


--
-- Name: teams teams_updated_at; Type: TRIGGER; Schema: authz; Owner: postgres
--

CREATE TRIGGER teams_updated_at BEFORE UPDATE ON authz.teams FOR EACH ROW EXECUTE FUNCTION public.set_teams_updated_at();


--
-- Name: users users_updated_at; Type: TRIGGER; Schema: authz; Owner: postgres
--

CREATE TRIGGER users_updated_at BEFORE UPDATE ON authz.users FOR EACH ROW EXECUTE FUNCTION authz.update_users_updated_at();


--
-- Name: companies set_companies_updated_at; Type: TRIGGER; Schema: company; Owner: postgres
--

CREATE TRIGGER set_companies_updated_at BEFORE UPDATE ON company.companies FOR EACH ROW EXECUTE FUNCTION company.set_updated_at();


--
-- Name: outreach set_outreach_updated_at; Type: TRIGGER; Schema: company; Owner: postgres
--

CREATE TRIGGER set_outreach_updated_at BEFORE UPDATE ON company.outreach FOR EACH ROW EXECUTE FUNCTION company.set_updated_at();


--
-- Name: sources set_crawler_sources_updated_at; Type: TRIGGER; Schema: crawler; Owner: postgres
--

CREATE TRIGGER set_crawler_sources_updated_at BEFORE UPDATE ON crawler.sources FOR EACH ROW EXECUTE FUNCTION crawler.set_updated_at();


--
-- Name: team_files team_files_updated_at; Type: TRIGGER; Schema: orch_flow; Owner: postgres
--

CREATE TRIGGER team_files_updated_at BEFORE UPDATE ON orch_flow.team_files FOR EACH ROW EXECUTE FUNCTION orch_flow.set_team_files_updated_at();


--
-- Name: analyst_overrides set_analyst_overrides_updated_at; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER set_analyst_overrides_updated_at BEFORE UPDATE ON prediction.analyst_overrides FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: analyst_portfolios set_analyst_portfolios_updated_at; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER set_analyst_portfolios_updated_at BEFORE UPDATE ON prediction.analyst_portfolios FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: analyst_positions set_analyst_positions_updated_at; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER set_analyst_positions_updated_at BEFORE UPDATE ON prediction.analyst_positions FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: analysts set_analysts_updated_at; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER set_analysts_updated_at BEFORE UPDATE ON prediction.analysts FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: learning_queue set_learning_queue_updated_at; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER set_learning_queue_updated_at BEFORE UPDATE ON prediction.learning_queue FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: learnings set_learnings_updated_at; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER set_learnings_updated_at BEFORE UPDATE ON prediction.learnings FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: evaluations set_prediction_evaluations_updated_at; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER set_prediction_evaluations_updated_at BEFORE UPDATE ON prediction.evaluations FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: missed_opportunities set_prediction_missed_updated_at; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER set_prediction_missed_updated_at BEFORE UPDATE ON prediction.missed_opportunities FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: predictions set_prediction_predictions_updated_at; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER set_prediction_predictions_updated_at BEFORE UPDATE ON prediction.predictions FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: predictors set_prediction_predictors_updated_at; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER set_prediction_predictors_updated_at BEFORE UPDATE ON prediction.predictors FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: signals set_prediction_signals_updated_at; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER set_prediction_signals_updated_at BEFORE UPDATE ON prediction.signals FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: source_subscriptions set_prediction_source_subs_updated_at; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER set_prediction_source_subs_updated_at BEFORE UPDATE ON prediction.source_subscriptions FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: strategies set_prediction_strategies_updated_at; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER set_prediction_strategies_updated_at BEFORE UPDATE ON prediction.strategies FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: targets set_prediction_targets_updated_at; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER set_prediction_targets_updated_at BEFORE UPDATE ON prediction.targets FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: tool_requests set_prediction_tool_requests_updated_at; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER set_prediction_tool_requests_updated_at BEFORE UPDATE ON prediction.tool_requests FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: universes set_prediction_universes_updated_at; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER set_prediction_universes_updated_at BEFORE UPDATE ON prediction.universes FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: review_queue set_review_queue_updated_at; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER set_review_queue_updated_at BEFORE UPDATE ON prediction.review_queue FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: test_scenarios set_test_scenarios_updated_at; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER set_test_scenarios_updated_at BEFORE UPDATE ON prediction.test_scenarios FOR EACH ROW EXECUTE FUNCTION prediction.set_test_scenarios_updated_at();


--
-- Name: user_portfolios set_user_portfolios_updated_at; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER set_user_portfolios_updated_at BEFORE UPDATE ON prediction.user_portfolios FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: user_positions set_user_positions_updated_at; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER set_user_positions_updated_at BEFORE UPDATE ON prediction.user_positions FOR EACH ROW EXECUTE FUNCTION prediction.set_updated_at();


--
-- Name: targets trg_auto_create_test_mirror; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER trg_auto_create_test_mirror AFTER INSERT ON prediction.targets FOR EACH ROW EXECUTE FUNCTION prediction.auto_create_test_mirror();


--
-- Name: daily_postmortem_recommendations trg_daily_postmortem_recommendations_updated_at; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER trg_daily_postmortem_recommendations_updated_at BEFORE UPDATE ON prediction.daily_postmortem_recommendations FOR EACH ROW EXECUTE FUNCTION prediction.update_daily_postmortem_recommendations_timestamp();


--
-- Name: daily_postmortem_runs trg_daily_postmortem_runs_updated_at; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER trg_daily_postmortem_runs_updated_at BEFORE UPDATE ON prediction.daily_postmortem_runs FOR EACH ROW EXECUTE FUNCTION prediction.update_daily_postmortem_runs_timestamp();


--
-- Name: predictions trg_enforce_prediction_direction; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER trg_enforce_prediction_direction BEFORE INSERT OR UPDATE ON prediction.predictions FOR EACH ROW EXECUTE FUNCTION prediction.enforce_prediction_direction();


--
-- Name: predictors trg_enforce_predictor_direction; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER trg_enforce_predictor_direction BEFORE INSERT OR UPDATE ON prediction.predictors FOR EACH ROW EXECUTE FUNCTION prediction.enforce_predictor_direction();


--
-- Name: predictors trg_enforce_predictor_is_test; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER trg_enforce_predictor_is_test BEFORE INSERT OR UPDATE ON prediction.predictors FOR EACH ROW EXECUTE FUNCTION prediction.enforce_predictor_is_test();


--
-- Name: signals trg_enforce_signal_direction; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER trg_enforce_signal_direction BEFORE INSERT OR UPDATE ON prediction.signals FOR EACH ROW EXECUTE FUNCTION prediction.enforce_signal_direction();


--
-- Name: signals trg_enforce_signal_is_test; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER trg_enforce_signal_is_test BEFORE INSERT OR UPDATE ON prediction.signals FOR EACH ROW EXECUTE FUNCTION prediction.enforce_signal_is_test();


--
-- Name: targets trg_enforce_target_domain_type; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER trg_enforce_target_domain_type BEFORE INSERT OR UPDATE ON prediction.targets FOR EACH ROW EXECUTE FUNCTION prediction.enforce_target_domain_type();


--
-- Name: predictors trg_enforce_test_target_isolation; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER trg_enforce_test_target_isolation BEFORE INSERT OR UPDATE ON prediction.predictors FOR EACH ROW EXECUTE FUNCTION prediction.enforce_test_target_isolation();


--
-- Name: predictions trg_prediction_status_transition; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER trg_prediction_status_transition BEFORE UPDATE ON prediction.predictions FOR EACH ROW EXECUTE FUNCTION prediction.validate_prediction_status_transition();


--
-- Name: analyst_portfolios trg_update_analyst_portfolio_status; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER trg_update_analyst_portfolio_status BEFORE UPDATE OF current_balance ON prediction.analyst_portfolios FOR EACH ROW EXECUTE FUNCTION prediction.update_analyst_portfolio_status();


--
-- Name: learning_lineage trg_validate_learning_lineage; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER trg_validate_learning_lineage BEFORE INSERT OR UPDATE ON prediction.learning_lineage FOR EACH ROW EXECUTE FUNCTION prediction.validate_learning_lineage();


--
-- Name: test_articles trg_validate_test_article_symbols; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER trg_validate_test_article_symbols BEFORE INSERT OR UPDATE ON prediction.test_articles FOR EACH ROW EXECUTE FUNCTION prediction.validate_test_article_symbols();


--
-- Name: test_scenarios trg_validate_test_target_symbols; Type: TRIGGER; Schema: prediction; Owner: postgres
--

CREATE TRIGGER trg_validate_test_target_symbols BEFORE INSERT OR UPDATE ON prediction.test_scenarios FOR EACH ROW EXECUTE FUNCTION prediction.validate_test_target_symbols();


--
-- Name: llm_models llm_models_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER llm_models_updated_at BEFORE UPDATE ON public.llm_models FOR EACH ROW EXECUTE FUNCTION public.update_llm_models_updated_at();


--
-- Name: llm_providers llm_providers_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER llm_providers_updated_at BEFORE UPDATE ON public.llm_providers FOR EACH ROW EXECUTE FUNCTION public.update_llm_providers_updated_at();


--
-- Name: agents set_agents_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_agents_updated_at BEFORE UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: organizations set_organizations_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: teams teams_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER teams_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.set_teams_updated_at();


--
-- Name: pseudonym_mappings trg_pseudonym_mappings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_pseudonym_mappings_updated_at BEFORE UPDATE ON public.pseudonym_mappings FOR EACH ROW EXECUTE FUNCTION public.set_pseudonym_mappings_updated_at();


--
-- Name: redaction_patterns update_redaction_patterns_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_redaction_patterns_updated_at BEFORE UPDATE ON public.redaction_patterns FOR EACH ROW EXECUTE FUNCTION public.update_redaction_patterns_updated_at();


--
-- Name: rag_document_chunks rag_chunks_recompute_parent; Type: TRIGGER; Schema: rag_data; Owner: postgres
--

CREATE TRIGGER rag_chunks_recompute_parent AFTER INSERT OR DELETE OR UPDATE ON rag_data.rag_document_chunks FOR EACH ROW EXECUTE FUNCTION rag_data.rag_chunks_recompute_parent_trigger();


--
-- Name: rag_documents rag_documents_recompute_parent; Type: TRIGGER; Schema: rag_data; Owner: postgres
--

CREATE TRIGGER rag_documents_recompute_parent AFTER INSERT OR DELETE OR UPDATE ON rag_data.rag_documents FOR EACH ROW EXECUTE FUNCTION rag_data.rag_documents_recompute_parent_trigger();


--
-- Name: rag_collections set_collections_updated_at; Type: TRIGGER; Schema: rag_data; Owner: postgres
--

CREATE TRIGGER set_collections_updated_at BEFORE UPDATE ON rag_data.rag_collections FOR EACH ROW EXECUTE FUNCTION rag_data.set_updated_at();


--
-- Name: rag_documents set_documents_updated_at; Type: TRIGGER; Schema: rag_data; Owner: postgres
--

CREATE TRIGGER set_documents_updated_at BEFORE UPDATE ON rag_data.rag_documents FOR EACH ROW EXECUTE FUNCTION rag_data.set_updated_at();


--
-- Name: source_subscriptions set_risk_source_subs_updated_at; Type: TRIGGER; Schema: risk; Owner: postgres
--

CREATE TRIGGER set_risk_source_subs_updated_at BEFORE UPDATE ON risk.source_subscriptions FOR EACH ROW EXECUTE FUNCTION risk.set_updated_at();


--
-- Name: debate_contexts set_updated_at_debate_contexts; Type: TRIGGER; Schema: risk; Owner: postgres
--

CREATE TRIGGER set_updated_at_debate_contexts BEFORE UPDATE ON risk.debate_contexts FOR EACH ROW EXECUTE FUNCTION risk.set_updated_at();


--
-- Name: dimension_contexts set_updated_at_dimension_contexts; Type: TRIGGER; Schema: risk; Owner: postgres
--

CREATE TRIGGER set_updated_at_dimension_contexts BEFORE UPDATE ON risk.dimension_contexts FOR EACH ROW EXECUTE FUNCTION risk.set_updated_at();


--
-- Name: dimensions set_updated_at_dimensions; Type: TRIGGER; Schema: risk; Owner: postgres
--

CREATE TRIGGER set_updated_at_dimensions BEFORE UPDATE ON risk.dimensions FOR EACH ROW EXECUTE FUNCTION risk.set_updated_at();


--
-- Name: learnings set_updated_at_learnings; Type: TRIGGER; Schema: risk; Owner: postgres
--

CREATE TRIGGER set_updated_at_learnings BEFORE UPDATE ON risk.learnings FOR EACH ROW EXECUTE FUNCTION risk.set_updated_at();


--
-- Name: scopes set_updated_at_scopes; Type: TRIGGER; Schema: risk; Owner: postgres
--

CREATE TRIGGER set_updated_at_scopes BEFORE UPDATE ON risk.scopes FOR EACH ROW EXECUTE FUNCTION risk.set_updated_at();


--
-- Name: subjects set_updated_at_subjects; Type: TRIGGER; Schema: risk; Owner: postgres
--

CREATE TRIGGER set_updated_at_subjects BEFORE UPDATE ON risk.subjects FOR EACH ROW EXECUTE FUNCTION risk.set_updated_at();


--
-- Name: data_sources trigger_data_sources_updated_at; Type: TRIGGER; Schema: risk; Owner: postgres
--

CREATE TRIGGER trigger_data_sources_updated_at BEFORE UPDATE ON risk.data_sources FOR EACH ROW EXECUTE FUNCTION risk.update_data_sources_updated_at();


--
-- Name: executive_summaries trigger_executive_summaries_updated_at; Type: TRIGGER; Schema: risk; Owner: postgres
--

CREATE TRIGGER trigger_executive_summaries_updated_at BEFORE UPDATE ON risk.executive_summaries FOR EACH ROW EXECUTE FUNCTION risk.update_executive_summaries_updated_at();


--
-- Name: reports trigger_reports_updated_at; Type: TRIGGER; Schema: risk; Owner: postgres
--

CREATE TRIGGER trigger_reports_updated_at BEFORE UPDATE ON risk.reports FOR EACH ROW EXECUTE FUNCTION risk.update_reports_updated_at();


--
-- Name: scenarios trigger_scenarios_updated_at; Type: TRIGGER; Schema: risk; Owner: postgres
--

CREATE TRIGGER trigger_scenarios_updated_at BEFORE UPDATE ON risk.scenarios FOR EACH ROW EXECUTE FUNCTION risk.update_scenarios_updated_at();


--
-- Name: dimensions validate_dimension_weights_trigger; Type: TRIGGER; Schema: risk; Owner: postgres
--

CREATE CONSTRAINT TRIGGER validate_dimension_weights_trigger AFTER INSERT OR UPDATE ON risk.dimensions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION risk.validate_dimension_weights();


--
-- Name: agent_definitions agent_definitions_archive; Type: TRIGGER; Schema: workflows; Owner: postgres
--

CREATE TRIGGER agent_definitions_archive BEFORE UPDATE ON workflows.agent_definitions FOR EACH ROW EXECUTE FUNCTION workflows.archive_agent_definition();


--
-- Name: adapter_state adapter_state_trigger_id_fkey; Type: FK CONSTRAINT; Schema: ambient; Owner: postgres
--

ALTER TABLE ONLY ambient.adapter_state
    ADD CONSTRAINT adapter_state_trigger_id_fkey FOREIGN KEY (trigger_id) REFERENCES ambient.triggers(id) ON DELETE CASCADE;


--
-- Name: trigger_executions trigger_executions_event_id_fkey; Type: FK CONSTRAINT; Schema: ambient; Owner: postgres
--

ALTER TABLE ONLY ambient.trigger_executions
    ADD CONSTRAINT trigger_executions_event_id_fkey FOREIGN KEY (event_id) REFERENCES ambient.events(id) ON DELETE SET NULL;


--
-- Name: trigger_executions trigger_executions_trigger_id_fkey; Type: FK CONSTRAINT; Schema: ambient; Owner: postgres
--

ALTER TABLE ONLY ambient.trigger_executions
    ADD CONSTRAINT trigger_executions_trigger_id_fkey FOREIGN KEY (trigger_id) REFERENCES ambient.triggers(id) ON DELETE CASCADE;


--
-- Name: auth_identity_links auth_identity_links_user_id_fkey; Type: FK CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.auth_identity_links
    ADD CONSTRAINT auth_identity_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES authz.users(id) ON DELETE CASCADE;


--
-- Name: org_entitlements org_entitlements_granted_by_fkey; Type: FK CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.org_entitlements
    ADD CONSTRAINT org_entitlements_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: rbac_audit_log rbac_audit_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.rbac_audit_log
    ADD CONSTRAINT rbac_audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id);


--
-- Name: rbac_audit_log rbac_audit_log_target_role_id_fkey; Type: FK CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.rbac_audit_log
    ADD CONSTRAINT rbac_audit_log_target_role_id_fkey FOREIGN KEY (target_role_id) REFERENCES authz.rbac_roles(id);


--
-- Name: rbac_audit_log rbac_audit_log_target_user_id_fkey; Type: FK CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.rbac_audit_log
    ADD CONSTRAINT rbac_audit_log_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES auth.users(id);


--
-- Name: rbac_role_permissions rbac_role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.rbac_role_permissions
    ADD CONSTRAINT rbac_role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES authz.rbac_permissions(id) ON DELETE CASCADE;


--
-- Name: rbac_role_permissions rbac_role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.rbac_role_permissions
    ADD CONSTRAINT rbac_role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES authz.rbac_roles(id) ON DELETE CASCADE;


--
-- Name: rbac_user_org_roles rbac_user_org_roles_assigned_by_fkey; Type: FK CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.rbac_user_org_roles
    ADD CONSTRAINT rbac_user_org_roles_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES auth.users(id);


--
-- Name: rbac_user_org_roles rbac_user_org_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.rbac_user_org_roles
    ADD CONSTRAINT rbac_user_org_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES authz.rbac_roles(id) ON DELETE CASCADE;


--
-- Name: rbac_user_org_roles rbac_user_org_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.rbac_user_org_roles
    ADD CONSTRAINT rbac_user_org_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: team_members team_members_team_id_fkey; Type: FK CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.team_members
    ADD CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES authz.teams(id) ON DELETE CASCADE;


--
-- Name: users users_id_fkey; Type: FK CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.users
    ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: users users_organization_slug_fkey; Type: FK CONSTRAINT; Schema: authz; Owner: postgres
--

ALTER TABLE ONLY authz.users
    ADD CONSTRAINT users_organization_slug_fkey FOREIGN KEY (organization_slug) REFERENCES public.organizations(slug) ON DELETE SET NULL;


--
-- Name: submittal_decisions submittal_decisions_run_id_fkey; Type: FK CONSTRAINT; Schema: building; Owner: postgres
--

ALTER TABLE ONLY building.submittal_decisions
    ADD CONSTRAINT submittal_decisions_run_id_fkey FOREIGN KEY (run_id) REFERENCES workflows.runs(id) ON DELETE CASCADE;


--
-- Name: discovery_signals discovery_signals_company_id_fkey; Type: FK CONSTRAINT; Schema: company; Owner: postgres
--

ALTER TABLE ONLY company.discovery_signals
    ADD CONSTRAINT discovery_signals_company_id_fkey FOREIGN KEY (company_id) REFERENCES company.companies(id) ON DELETE CASCADE;


--
-- Name: outreach outreach_company_id_fkey; Type: FK CONSTRAINT; Schema: company; Owner: postgres
--

ALTER TABLE ONLY company.outreach
    ADD CONSTRAINT outreach_company_id_fkey FOREIGN KEY (company_id) REFERENCES company.companies(id) ON DELETE CASCADE;


--
-- Name: agent_article_outputs agent_article_outputs_article_id_fkey; Type: FK CONSTRAINT; Schema: crawler; Owner: postgres
--

ALTER TABLE ONLY crawler.agent_article_outputs
    ADD CONSTRAINT agent_article_outputs_article_id_fkey FOREIGN KEY (article_id) REFERENCES crawler.articles(id) ON DELETE CASCADE;


--
-- Name: articles articles_source_id_fkey; Type: FK CONSTRAINT; Schema: crawler; Owner: postgres
--

ALTER TABLE ONLY crawler.articles
    ADD CONSTRAINT articles_source_id_fkey FOREIGN KEY (source_id) REFERENCES crawler.sources(id) ON DELETE CASCADE;


--
-- Name: source_crawls source_crawls_source_id_fkey; Type: FK CONSTRAINT; Schema: crawler; Owner: postgres
--

ALTER TABLE ONLY crawler.source_crawls
    ADD CONSTRAINT source_crawls_source_id_fkey FOREIGN KEY (source_id) REFERENCES crawler.sources(id) ON DELETE CASCADE;


--
-- Name: cad_outputs cad_outputs_drawing_id_fkey; Type: FK CONSTRAINT; Schema: engineering; Owner: postgres
--

ALTER TABLE ONLY engineering.cad_outputs
    ADD CONSTRAINT cad_outputs_drawing_id_fkey FOREIGN KEY (drawing_id) REFERENCES engineering.drawings(id) ON DELETE CASCADE;


--
-- Name: cad_outputs cad_outputs_generated_code_id_fkey; Type: FK CONSTRAINT; Schema: engineering; Owner: postgres
--

ALTER TABLE ONLY engineering.cad_outputs
    ADD CONSTRAINT cad_outputs_generated_code_id_fkey FOREIGN KEY (generated_code_id) REFERENCES engineering.generated_code(id);


--
-- Name: drawings drawings_created_by_fkey; Type: FK CONSTRAINT; Schema: engineering; Owner: postgres
--

ALTER TABLE ONLY engineering.drawings
    ADD CONSTRAINT drawings_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: drawings drawings_parent_drawing_id_fkey; Type: FK CONSTRAINT; Schema: engineering; Owner: postgres
--

ALTER TABLE ONLY engineering.drawings
    ADD CONSTRAINT drawings_parent_drawing_id_fkey FOREIGN KEY (parent_drawing_id) REFERENCES engineering.drawings(id);


--
-- Name: drawings drawings_project_id_fkey; Type: FK CONSTRAINT; Schema: engineering; Owner: postgres
--

ALTER TABLE ONLY engineering.drawings
    ADD CONSTRAINT drawings_project_id_fkey FOREIGN KEY (project_id) REFERENCES engineering.projects(id) ON DELETE CASCADE;


--
-- Name: execution_log execution_log_drawing_id_fkey; Type: FK CONSTRAINT; Schema: engineering; Owner: postgres
--

ALTER TABLE ONLY engineering.execution_log
    ADD CONSTRAINT execution_log_drawing_id_fkey FOREIGN KEY (drawing_id) REFERENCES engineering.drawings(id) ON DELETE CASCADE;


--
-- Name: generated_code generated_code_drawing_id_fkey; Type: FK CONSTRAINT; Schema: engineering; Owner: postgres
--

ALTER TABLE ONLY engineering.generated_code
    ADD CONSTRAINT generated_code_drawing_id_fkey FOREIGN KEY (drawing_id) REFERENCES engineering.drawings(id) ON DELETE CASCADE;


--
-- Name: part_library part_library_created_by_fkey; Type: FK CONSTRAINT; Schema: engineering; Owner: postgres
--

ALTER TABLE ONLY engineering.part_library
    ADD CONSTRAINT part_library_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: postmortem_tasks postmortem_tasks_run_id_fkey; Type: FK CONSTRAINT; Schema: engineering; Owner: postgres
--

ALTER TABLE ONLY engineering.postmortem_tasks
    ADD CONSTRAINT postmortem_tasks_run_id_fkey FOREIGN KEY (run_id) REFERENCES workflows.runs(id) ON DELETE CASCADE;


--
-- Name: projects projects_created_by_fkey; Type: FK CONSTRAINT; Schema: engineering; Owner: postgres
--

ALTER TABLE ONLY engineering.projects
    ADD CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: invoices invoices_run_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: postgres
--

ALTER TABLE ONLY finance.invoices
    ADD CONSTRAINT invoices_run_id_fkey FOREIGN KEY (run_id) REFERENCES workflows.runs(id) ON DELETE SET NULL;


--
-- Name: po_lines po_lines_po_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: postgres
--

ALTER TABLE ONLY finance.po_lines
    ADD CONSTRAINT po_lines_po_id_fkey FOREIGN KEY (po_id) REFERENCES finance.purchase_orders(id) ON DELETE CASCADE;


--
-- Name: receipts receipts_po_id_line_no_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: postgres
--

ALTER TABLE ONLY finance.receipts
    ADD CONSTRAINT receipts_po_id_line_no_fkey FOREIGN KEY (po_id, line_no) REFERENCES finance.po_lines(po_id, line_no) ON DELETE CASCADE;


--
-- Name: tasks tasks_caller_id_fkey; Type: FK CONSTRAINT; Schema: gatehouse; Owner: postgres
--

ALTER TABLE ONLY gatehouse.tasks
    ADD CONSTRAINT tasks_caller_id_fkey FOREIGN KEY (caller_id) REFERENCES gatehouse.callers(id) ON DELETE CASCADE;


--
-- Name: used_tokens used_tokens_caller_id_fkey; Type: FK CONSTRAINT; Schema: gatehouse; Owner: postgres
--

ALTER TABLE ONLY gatehouse.used_tokens
    ADD CONSTRAINT used_tokens_caller_id_fkey FOREIGN KEY (caller_id) REFERENCES gatehouse.callers(id) ON DELETE CASCADE;


--
-- Name: new_hires new_hires_onboarding_run_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY hr.new_hires
    ADD CONSTRAINT new_hires_onboarding_run_id_fkey FOREIGN KEY (onboarding_run_id) REFERENCES workflows.runs(id) ON DELETE SET NULL;


--
-- Name: onboarding_tasks onboarding_tasks_run_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY hr.onboarding_tasks
    ADD CONSTRAINT onboarding_tasks_run_id_fkey FOREIGN KEY (run_id) REFERENCES workflows.runs(id) ON DELETE CASCADE;


--
-- Name: competitor_snapshots competitor_snapshots_run_id_fkey; Type: FK CONSTRAINT; Schema: marketing; Owner: postgres
--

ALTER TABLE ONLY marketing.competitor_snapshots
    ADD CONSTRAINT competitor_snapshots_run_id_fkey FOREIGN KEY (run_id) REFERENCES workflows.runs(id) ON DELETE SET NULL;


--
-- Name: competitor_snapshots competitor_snapshots_source_id_fkey; Type: FK CONSTRAINT; Schema: marketing; Owner: postgres
--

ALTER TABLE ONLY marketing.competitor_snapshots
    ADD CONSTRAINT competitor_snapshots_source_id_fkey FOREIGN KEY (source_id) REFERENCES marketing.competitor_sources(id) ON DELETE CASCADE;


--
-- Name: swarm_weights swarm_weights_organization_slug_facet_key_fkey; Type: FK CONSTRAINT; Schema: marketing; Owner: postgres
--

ALTER TABLE ONLY marketing.swarm_weights
    ADD CONSTRAINT swarm_weights_organization_slug_facet_key_fkey FOREIGN KEY (organization_slug, facet_key) REFERENCES marketing.swarm_facets(organization_slug, key) ON DELETE CASCADE;


--
-- Name: swarm_writers swarm_writers_known_model; Type: FK CONSTRAINT; Schema: marketing; Owner: postgres
--

ALTER TABLE ONLY marketing.swarm_writers
    ADD CONSTRAINT swarm_writers_known_model FOREIGN KEY (model, provider) REFERENCES public.llm_models(model_name, provider_name);


--
-- Name: channel_messages channel_messages_channel_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.channel_messages
    ADD CONSTRAINT channel_messages_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES orch_flow.channels(id) ON DELETE CASCADE;


--
-- Name: channel_messages channel_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.channel_messages
    ADD CONSTRAINT channel_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: channels channels_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.channels
    ADD CONSTRAINT channels_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_task_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.notifications
    ADD CONSTRAINT notifications_task_id_fkey FOREIGN KEY (task_id) REFERENCES orch_flow.shared_tasks(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: projects projects_effort_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.projects
    ADD CONSTRAINT projects_effort_id_fkey FOREIGN KEY (effort_id) REFERENCES orch_flow.efforts(id) ON DELETE CASCADE;


--
-- Name: shared_tasks shared_tasks_channel_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.shared_tasks
    ADD CONSTRAINT shared_tasks_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES orch_flow.channels(id) ON DELETE SET NULL;


--
-- Name: shared_tasks shared_tasks_parent_task_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.shared_tasks
    ADD CONSTRAINT shared_tasks_parent_task_id_fkey FOREIGN KEY (parent_task_id) REFERENCES orch_flow.shared_tasks(id) ON DELETE CASCADE;


--
-- Name: shared_tasks shared_tasks_sprint_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.shared_tasks
    ADD CONSTRAINT shared_tasks_sprint_id_fkey FOREIGN KEY (sprint_id) REFERENCES orch_flow.sprints(id) ON DELETE SET NULL;


--
-- Name: shared_tasks shared_tasks_user_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.shared_tasks
    ADD CONSTRAINT shared_tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: task_collaborators task_collaborators_task_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.task_collaborators
    ADD CONSTRAINT task_collaborators_task_id_fkey FOREIGN KEY (task_id) REFERENCES orch_flow.shared_tasks(id) ON DELETE CASCADE;


--
-- Name: task_collaborators task_collaborators_user_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.task_collaborators
    ADD CONSTRAINT task_collaborators_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: task_update_requests task_update_requests_requested_by_user_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.task_update_requests
    ADD CONSTRAINT task_update_requests_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: task_update_requests task_update_requests_task_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.task_update_requests
    ADD CONSTRAINT task_update_requests_task_id_fkey FOREIGN KEY (task_id) REFERENCES orch_flow.shared_tasks(id) ON DELETE CASCADE;


--
-- Name: task_watchers task_watchers_task_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.task_watchers
    ADD CONSTRAINT task_watchers_task_id_fkey FOREIGN KEY (task_id) REFERENCES orch_flow.shared_tasks(id) ON DELETE CASCADE;


--
-- Name: task_watchers task_watchers_user_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.task_watchers
    ADD CONSTRAINT task_watchers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_assignee_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.tasks
    ADD CONSTRAINT tasks_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES auth.users(id);


--
-- Name: tasks tasks_project_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.tasks
    ADD CONSTRAINT tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES orch_flow.projects(id) ON DELETE CASCADE;


--
-- Name: team_files team_files_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.team_files
    ADD CONSTRAINT team_files_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: team_files team_files_parent_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.team_files
    ADD CONSTRAINT team_files_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES orch_flow.team_files(id) ON DELETE CASCADE;


--
-- Name: user_presence user_presence_user_id_fkey; Type: FK CONSTRAINT; Schema: orch_flow; Owner: postgres
--

ALTER TABLE ONLY orch_flow.user_presence
    ADD CONSTRAINT user_presence_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: agent_self_modification_log agent_self_modification_log_analyst_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.agent_self_modification_log
    ADD CONSTRAINT agent_self_modification_log_analyst_id_fkey FOREIGN KEY (analyst_id) REFERENCES prediction.analysts(id) ON DELETE CASCADE;


--
-- Name: analyst_adaptation_diffs analyst_adaptation_diffs_agent_version_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analyst_adaptation_diffs
    ADD CONSTRAINT analyst_adaptation_diffs_agent_version_id_fkey FOREIGN KEY (agent_version_id) REFERENCES prediction.analyst_context_versions(id) ON DELETE CASCADE;


--
-- Name: analyst_adaptation_diffs analyst_adaptation_diffs_analyst_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analyst_adaptation_diffs
    ADD CONSTRAINT analyst_adaptation_diffs_analyst_id_fkey FOREIGN KEY (analyst_id) REFERENCES prediction.analysts(id) ON DELETE CASCADE;


--
-- Name: analyst_adaptation_diffs analyst_adaptation_diffs_user_version_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analyst_adaptation_diffs
    ADD CONSTRAINT analyst_adaptation_diffs_user_version_id_fkey FOREIGN KEY (user_version_id) REFERENCES prediction.analyst_context_versions(id) ON DELETE CASCADE;


--
-- Name: analyst_assessments analyst_assessments_analyst_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analyst_assessments
    ADD CONSTRAINT analyst_assessments_analyst_id_fkey FOREIGN KEY (analyst_id) REFERENCES prediction.analysts(id) ON DELETE CASCADE;


--
-- Name: analyst_assessments analyst_assessments_context_version_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analyst_assessments
    ADD CONSTRAINT analyst_assessments_context_version_id_fkey FOREIGN KEY (context_version_id) REFERENCES prediction.analyst_context_versions(id);


--
-- Name: analyst_assessments analyst_assessments_prediction_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analyst_assessments
    ADD CONSTRAINT analyst_assessments_prediction_id_fkey FOREIGN KEY (prediction_id) REFERENCES prediction.predictions(id) ON DELETE CASCADE;


--
-- Name: analyst_assessments analyst_assessments_predictor_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analyst_assessments
    ADD CONSTRAINT analyst_assessments_predictor_id_fkey FOREIGN KEY (predictor_id) REFERENCES prediction.predictors(id) ON DELETE CASCADE;


--
-- Name: analyst_context_versions analyst_context_versions_analyst_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analyst_context_versions
    ADD CONSTRAINT analyst_context_versions_analyst_id_fkey FOREIGN KEY (analyst_id) REFERENCES prediction.analysts(id) ON DELETE CASCADE;


--
-- Name: analyst_overrides analyst_overrides_analyst_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analyst_overrides
    ADD CONSTRAINT analyst_overrides_analyst_id_fkey FOREIGN KEY (analyst_id) REFERENCES prediction.analysts(id) ON DELETE CASCADE;


--
-- Name: analyst_overrides analyst_overrides_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analyst_overrides
    ADD CONSTRAINT analyst_overrides_target_id_fkey FOREIGN KEY (target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: analyst_overrides analyst_overrides_universe_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analyst_overrides
    ADD CONSTRAINT analyst_overrides_universe_id_fkey FOREIGN KEY (universe_id) REFERENCES prediction.universes(id) ON DELETE CASCADE;


--
-- Name: analyst_performance_metrics analyst_performance_metrics_analyst_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analyst_performance_metrics
    ADD CONSTRAINT analyst_performance_metrics_analyst_id_fkey FOREIGN KEY (analyst_id) REFERENCES prediction.analysts(id) ON DELETE CASCADE;


--
-- Name: analyst_portfolios analyst_portfolios_analyst_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analyst_portfolios
    ADD CONSTRAINT analyst_portfolios_analyst_id_fkey FOREIGN KEY (analyst_id) REFERENCES prediction.analysts(id) ON DELETE CASCADE;


--
-- Name: analyst_positions analyst_positions_analyst_assessment_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analyst_positions
    ADD CONSTRAINT analyst_positions_analyst_assessment_id_fkey FOREIGN KEY (analyst_assessment_id) REFERENCES prediction.analyst_assessments(id) ON DELETE SET NULL;


--
-- Name: analyst_positions analyst_positions_portfolio_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analyst_positions
    ADD CONSTRAINT analyst_positions_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES prediction.analyst_portfolios(id) ON DELETE CASCADE;


--
-- Name: analyst_positions analyst_positions_prediction_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analyst_positions
    ADD CONSTRAINT analyst_positions_prediction_id_fkey FOREIGN KEY (prediction_id) REFERENCES prediction.predictions(id) ON DELETE SET NULL;


--
-- Name: analyst_positions analyst_positions_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analyst_positions
    ADD CONSTRAINT analyst_positions_target_id_fkey FOREIGN KEY (target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: analysts analysts_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analysts
    ADD CONSTRAINT analysts_target_id_fkey FOREIGN KEY (target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: analysts analysts_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analysts
    ADD CONSTRAINT analysts_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: analysts analysts_universe_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.analysts
    ADD CONSTRAINT analysts_universe_id_fkey FOREIGN KEY (universe_id) REFERENCES prediction.universes(id) ON DELETE CASCADE;


--
-- Name: daily_postmortem_recommendations daily_postmortem_recommendations_run_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.daily_postmortem_recommendations
    ADD CONSTRAINT daily_postmortem_recommendations_run_id_fkey FOREIGN KEY (run_id) REFERENCES prediction.daily_postmortem_runs(id) ON DELETE CASCADE;


--
-- Name: evaluations evaluations_prediction_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.evaluations
    ADD CONSTRAINT evaluations_prediction_id_fkey FOREIGN KEY (prediction_id) REFERENCES prediction.predictions(id) ON DELETE CASCADE;


--
-- Name: evaluations evaluations_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.evaluations
    ADD CONSTRAINT evaluations_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: predictions fk_predictions_scenario_run; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.predictions
    ADD CONSTRAINT fk_predictions_scenario_run FOREIGN KEY (scenario_run_id) REFERENCES prediction.scenario_runs(id) ON DELETE SET NULL;


--
-- Name: predictors fk_predictors_article_id; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.predictors
    ADD CONSTRAINT fk_predictors_article_id FOREIGN KEY (article_id) REFERENCES crawler.articles(id) ON DELETE SET NULL;


--
-- Name: predictors fk_predictors_consumed_prediction; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.predictors
    ADD CONSTRAINT fk_predictors_consumed_prediction FOREIGN KEY (consumed_by_prediction_id) REFERENCES prediction.predictions(id) ON DELETE SET NULL;


--
-- Name: predictors fk_predictors_scenario_run; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.predictors
    ADD CONSTRAINT fk_predictors_scenario_run FOREIGN KEY (scenario_run_id) REFERENCES prediction.scenario_runs(id) ON DELETE SET NULL;


--
-- Name: signals fk_signals_scenario_run; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.signals
    ADD CONSTRAINT fk_signals_scenario_run FOREIGN KEY (scenario_run_id) REFERENCES prediction.scenario_runs(id) ON DELETE SET NULL;


--
-- Name: fork_learning_exchanges fork_learning_exchanges_analyst_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.fork_learning_exchanges
    ADD CONSTRAINT fork_learning_exchanges_analyst_id_fkey FOREIGN KEY (analyst_id) REFERENCES prediction.analysts(id) ON DELETE CASCADE;


--
-- Name: learning_lineage learning_lineage_production_learning_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.learning_lineage
    ADD CONSTRAINT learning_lineage_production_learning_id_fkey FOREIGN KEY (production_learning_id) REFERENCES prediction.learnings(id) ON DELETE RESTRICT;


--
-- Name: learning_lineage learning_lineage_promoted_by_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.learning_lineage
    ADD CONSTRAINT learning_lineage_promoted_by_fkey FOREIGN KEY (promoted_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: learning_lineage learning_lineage_test_learning_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.learning_lineage
    ADD CONSTRAINT learning_lineage_test_learning_id_fkey FOREIGN KEY (test_learning_id) REFERENCES prediction.learnings(id) ON DELETE RESTRICT;


--
-- Name: learning_queue learning_queue_final_analyst_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.learning_queue
    ADD CONSTRAINT learning_queue_final_analyst_id_fkey FOREIGN KEY (final_analyst_id) REFERENCES prediction.analysts(id) ON DELETE SET NULL;


--
-- Name: learning_queue learning_queue_final_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.learning_queue
    ADD CONSTRAINT learning_queue_final_target_id_fkey FOREIGN KEY (final_target_id) REFERENCES prediction.targets(id) ON DELETE SET NULL;


--
-- Name: learning_queue learning_queue_final_universe_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.learning_queue
    ADD CONSTRAINT learning_queue_final_universe_id_fkey FOREIGN KEY (final_universe_id) REFERENCES prediction.universes(id) ON DELETE SET NULL;


--
-- Name: learning_queue learning_queue_learning_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.learning_queue
    ADD CONSTRAINT learning_queue_learning_id_fkey FOREIGN KEY (learning_id) REFERENCES prediction.learnings(id) ON DELETE SET NULL;


--
-- Name: learning_queue learning_queue_source_evaluation_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.learning_queue
    ADD CONSTRAINT learning_queue_source_evaluation_id_fkey FOREIGN KEY (source_evaluation_id) REFERENCES prediction.evaluations(id) ON DELETE SET NULL;


--
-- Name: learning_queue learning_queue_source_missed_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.learning_queue
    ADD CONSTRAINT learning_queue_source_missed_opportunity_id_fkey FOREIGN KEY (source_missed_opportunity_id) REFERENCES prediction.missed_opportunities(id) ON DELETE SET NULL;


--
-- Name: learning_queue learning_queue_suggested_analyst_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.learning_queue
    ADD CONSTRAINT learning_queue_suggested_analyst_id_fkey FOREIGN KEY (suggested_analyst_id) REFERENCES prediction.analysts(id) ON DELETE SET NULL;


--
-- Name: learning_queue learning_queue_suggested_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.learning_queue
    ADD CONSTRAINT learning_queue_suggested_target_id_fkey FOREIGN KEY (suggested_target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: learning_queue learning_queue_suggested_universe_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.learning_queue
    ADD CONSTRAINT learning_queue_suggested_universe_id_fkey FOREIGN KEY (suggested_universe_id) REFERENCES prediction.universes(id) ON DELETE CASCADE;


--
-- Name: learning_queue learning_queue_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.learning_queue
    ADD CONSTRAINT learning_queue_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: learnings learnings_analyst_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.learnings
    ADD CONSTRAINT learnings_analyst_id_fkey FOREIGN KEY (analyst_id) REFERENCES prediction.analysts(id) ON DELETE SET NULL;


--
-- Name: learnings learnings_source_evaluation_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.learnings
    ADD CONSTRAINT learnings_source_evaluation_id_fkey FOREIGN KEY (source_evaluation_id) REFERENCES prediction.evaluations(id) ON DELETE SET NULL;


--
-- Name: learnings learnings_source_missed_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.learnings
    ADD CONSTRAINT learnings_source_missed_opportunity_id_fkey FOREIGN KEY (source_missed_opportunity_id) REFERENCES prediction.missed_opportunities(id) ON DELETE SET NULL;


--
-- Name: learnings learnings_superseded_by_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.learnings
    ADD CONSTRAINT learnings_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES prediction.learnings(id) ON DELETE SET NULL;


--
-- Name: learnings learnings_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.learnings
    ADD CONSTRAINT learnings_target_id_fkey FOREIGN KEY (target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: learnings learnings_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.learnings
    ADD CONSTRAINT learnings_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: learnings learnings_universe_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.learnings
    ADD CONSTRAINT learnings_universe_id_fkey FOREIGN KEY (universe_id) REFERENCES prediction.universes(id) ON DELETE CASCADE;


--
-- Name: missed_opportunities missed_opportunities_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.missed_opportunities
    ADD CONSTRAINT missed_opportunities_target_id_fkey FOREIGN KEY (target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: missed_opportunities missed_opportunities_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.missed_opportunities
    ADD CONSTRAINT missed_opportunities_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: predictions predictions_runner_context_version_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.predictions
    ADD CONSTRAINT predictions_runner_context_version_id_fkey FOREIGN KEY (runner_context_version_id) REFERENCES prediction.runner_context_versions(id);


--
-- Name: predictions predictions_target_context_version_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.predictions
    ADD CONSTRAINT predictions_target_context_version_id_fkey FOREIGN KEY (target_context_version_id) REFERENCES prediction.target_context_versions(id);


--
-- Name: predictions predictions_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.predictions
    ADD CONSTRAINT predictions_target_id_fkey FOREIGN KEY (target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: predictions predictions_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.predictions
    ADD CONSTRAINT predictions_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: predictions predictions_universe_context_version_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.predictions
    ADD CONSTRAINT predictions_universe_context_version_id_fkey FOREIGN KEY (universe_context_version_id) REFERENCES prediction.universe_context_versions(id);


--
-- Name: predictors predictors_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.predictors
    ADD CONSTRAINT predictors_target_id_fkey FOREIGN KEY (target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: predictors predictors_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.predictors
    ADD CONSTRAINT predictors_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: replay_test_results replay_test_results_evaluation_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.replay_test_results
    ADD CONSTRAINT replay_test_results_evaluation_id_fkey FOREIGN KEY (evaluation_id) REFERENCES prediction.evaluations(id);


--
-- Name: replay_test_results replay_test_results_replay_test_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.replay_test_results
    ADD CONSTRAINT replay_test_results_replay_test_id_fkey FOREIGN KEY (replay_test_id) REFERENCES prediction.replay_tests(id) ON DELETE CASCADE;


--
-- Name: replay_test_results replay_test_results_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.replay_test_results
    ADD CONSTRAINT replay_test_results_target_id_fkey FOREIGN KEY (target_id) REFERENCES prediction.targets(id);


--
-- Name: replay_test_snapshots replay_test_snapshots_replay_test_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.replay_test_snapshots
    ADD CONSTRAINT replay_test_snapshots_replay_test_id_fkey FOREIGN KEY (replay_test_id) REFERENCES prediction.replay_tests(id) ON DELETE CASCADE;


--
-- Name: replay_tests replay_tests_universe_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.replay_tests
    ADD CONSTRAINT replay_tests_universe_id_fkey FOREIGN KEY (universe_id) REFERENCES prediction.universes(id);


--
-- Name: review_queue review_queue_predictor_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.review_queue
    ADD CONSTRAINT review_queue_predictor_id_fkey FOREIGN KEY (predictor_id) REFERENCES prediction.predictors(id) ON DELETE SET NULL;


--
-- Name: review_queue review_queue_signal_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.review_queue
    ADD CONSTRAINT review_queue_signal_id_fkey FOREIGN KEY (signal_id) REFERENCES prediction.signals(id) ON DELETE CASCADE;


--
-- Name: review_queue review_queue_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.review_queue
    ADD CONSTRAINT review_queue_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: scenario_runs scenario_runs_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.scenario_runs
    ADD CONSTRAINT scenario_runs_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE CASCADE;


--
-- Name: scenario_runs scenario_runs_triggered_by_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.scenario_runs
    ADD CONSTRAINT scenario_runs_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: signals signals_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.signals
    ADD CONSTRAINT signals_target_id_fkey FOREIGN KEY (target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: signals signals_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.signals
    ADD CONSTRAINT signals_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: snapshots snapshots_prediction_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.snapshots
    ADD CONSTRAINT snapshots_prediction_id_fkey FOREIGN KEY (prediction_id) REFERENCES prediction.predictions(id) ON DELETE CASCADE;


--
-- Name: snapshots snapshots_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.snapshots
    ADD CONSTRAINT snapshots_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: source_subscriptions source_subscriptions_source_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.source_subscriptions
    ADD CONSTRAINT source_subscriptions_source_id_fkey FOREIGN KEY (source_id) REFERENCES crawler.sources(id) ON DELETE CASCADE;


--
-- Name: source_subscriptions source_subscriptions_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.source_subscriptions
    ADD CONSTRAINT source_subscriptions_target_id_fkey FOREIGN KEY (target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: source_subscriptions source_subscriptions_universe_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.source_subscriptions
    ADD CONSTRAINT source_subscriptions_universe_id_fkey FOREIGN KEY (universe_id) REFERENCES prediction.universes(id) ON DELETE CASCADE;


--
-- Name: strategies strategies_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.strategies
    ADD CONSTRAINT strategies_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: target_context_versions target_context_versions_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.target_context_versions
    ADD CONSTRAINT target_context_versions_target_id_fkey FOREIGN KEY (target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: target_snapshots target_snapshots_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.target_snapshots
    ADD CONSTRAINT target_snapshots_target_id_fkey FOREIGN KEY (target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: target_snapshots target_snapshots_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.target_snapshots
    ADD CONSTRAINT target_snapshots_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: targets targets_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.targets
    ADD CONSTRAINT targets_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: targets targets_universe_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.targets
    ADD CONSTRAINT targets_universe_id_fkey FOREIGN KEY (universe_id) REFERENCES prediction.universes(id) ON DELETE CASCADE;


--
-- Name: test_articles test_articles_created_by_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.test_articles
    ADD CONSTRAINT test_articles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: test_articles test_articles_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.test_articles
    ADD CONSTRAINT test_articles_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: test_audit_log test_audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.test_audit_log
    ADD CONSTRAINT test_audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: test_price_data test_price_data_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.test_price_data
    ADD CONSTRAINT test_price_data_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: test_scenarios test_scenarios_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.test_scenarios
    ADD CONSTRAINT test_scenarios_target_id_fkey FOREIGN KEY (target_id) REFERENCES prediction.targets(id) ON DELETE SET NULL;


--
-- Name: test_target_mirrors test_target_mirrors_real_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.test_target_mirrors
    ADD CONSTRAINT test_target_mirrors_real_target_id_fkey FOREIGN KEY (real_target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: test_target_mirrors test_target_mirrors_test_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.test_target_mirrors
    ADD CONSTRAINT test_target_mirrors_test_target_id_fkey FOREIGN KEY (test_target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: tool_requests tool_requests_resolved_by_user_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.tool_requests
    ADD CONSTRAINT tool_requests_resolved_by_user_id_fkey FOREIGN KEY (resolved_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: tool_requests tool_requests_source_missed_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.tool_requests
    ADD CONSTRAINT tool_requests_source_missed_opportunity_id_fkey FOREIGN KEY (missed_opportunity_id) REFERENCES prediction.missed_opportunities(id) ON DELETE SET NULL;


--
-- Name: tool_requests tool_requests_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.tool_requests
    ADD CONSTRAINT tool_requests_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: tool_requests tool_requests_universe_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.tool_requests
    ADD CONSTRAINT tool_requests_universe_id_fkey FOREIGN KEY (universe_id) REFERENCES prediction.universes(id) ON DELETE CASCADE;


--
-- Name: universe_context_versions universe_context_versions_universe_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.universe_context_versions
    ADD CONSTRAINT universe_context_versions_universe_id_fkey FOREIGN KEY (universe_id) REFERENCES prediction.universes(id) ON DELETE CASCADE;


--
-- Name: universes universes_strategy_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.universes
    ADD CONSTRAINT universes_strategy_id_fkey FOREIGN KEY (strategy_id) REFERENCES prediction.strategies(id) ON DELETE SET NULL;


--
-- Name: universes universes_test_scenario_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.universes
    ADD CONSTRAINT universes_test_scenario_id_fkey FOREIGN KEY (test_scenario_id) REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL;


--
-- Name: user_positions user_positions_portfolio_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.user_positions
    ADD CONSTRAINT user_positions_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES prediction.user_portfolios(id) ON DELETE CASCADE;


--
-- Name: user_positions user_positions_prediction_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.user_positions
    ADD CONSTRAINT user_positions_prediction_id_fkey FOREIGN KEY (prediction_id) REFERENCES prediction.predictions(id) ON DELETE CASCADE;


--
-- Name: user_positions user_positions_target_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.user_positions
    ADD CONSTRAINT user_positions_target_id_fkey FOREIGN KEY (target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE;


--
-- Name: user_trade_queue user_trade_queue_executed_position_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.user_trade_queue
    ADD CONSTRAINT user_trade_queue_executed_position_id_fkey FOREIGN KEY (executed_position_id) REFERENCES prediction.user_positions(id);


--
-- Name: user_trade_queue user_trade_queue_portfolio_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.user_trade_queue
    ADD CONSTRAINT user_trade_queue_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES prediction.user_portfolios(id) ON DELETE CASCADE;


--
-- Name: user_trade_queue user_trade_queue_prediction_id_fkey; Type: FK CONSTRAINT; Schema: prediction; Owner: postgres
--

ALTER TABLE ONLY prediction.user_trade_queue
    ADD CONSTRAINT user_trade_queue_prediction_id_fkey FOREIGN KEY (prediction_id) REFERENCES prediction.predictions(id) ON DELETE CASCADE;


--
-- Name: assets assets_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: assets assets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: channel_message_log channel_message_log_channel_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.channel_message_log
    ADD CONSTRAINT channel_message_log_channel_user_id_fkey FOREIGN KEY (channel_user_id) REFERENCES public.channel_users(id);


--
-- Name: channel_users channel_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.channel_users
    ADD CONSTRAINT channel_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: conversation_messages conversation_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversation_messages
    ADD CONSTRAINT conversation_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_organization_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_organization_slug_fkey FOREIGN KEY (organization_slug) REFERENCES public.organizations(slug) ON DELETE SET NULL;


--
-- Name: conversations conversations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: deliverable_versions deliverable_versions_deliverable_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deliverable_versions
    ADD CONSTRAINT deliverable_versions_deliverable_id_fkey FOREIGN KEY (deliverable_id) REFERENCES public.deliverables(id) ON DELETE CASCADE;


--
-- Name: deliverable_versions deliverable_versions_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deliverable_versions
    ADD CONSTRAINT deliverable_versions_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: deliverables deliverables_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deliverables
    ADD CONSTRAINT deliverables_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: deliverables deliverables_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deliverables
    ADD CONSTRAINT deliverables_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id);


--
-- Name: deliverables deliverables_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deliverables
    ADD CONSTRAINT deliverables_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: llm_models llm_models_provider_name_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.llm_models
    ADD CONSTRAINT llm_models_provider_name_fkey FOREIGN KEY (provider_name) REFERENCES public.llm_providers(name) ON DELETE CASCADE;


--
-- Name: llm_usage llm_usage_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.llm_usage
    ADD CONSTRAINT llm_usage_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: llm_usage llm_usage_provider_name_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.llm_usage
    ADD CONSTRAINT llm_usage_provider_name_fkey FOREIGN KEY (provider_name) REFERENCES public.llm_providers(name) ON DELETE SET NULL;


--
-- Name: llm_usage llm_usage_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.llm_usage
    ADD CONSTRAINT llm_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: organization_credentials organization_credentials_organization_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_credentials
    ADD CONSTRAINT organization_credentials_organization_slug_fkey FOREIGN KEY (organization_slug) REFERENCES public.organizations(slug) ON DELETE CASCADE;


--
-- Name: plan_deliverables plan_deliverables_deliverable_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plan_deliverables
    ADD CONSTRAINT plan_deliverables_deliverable_id_fkey FOREIGN KEY (deliverable_id) REFERENCES public.deliverables(id) ON DELETE SET NULL;


--
-- Name: plan_deliverables plan_deliverables_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plan_deliverables
    ADD CONSTRAINT plan_deliverables_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE CASCADE;


--
-- Name: plan_versions plan_versions_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plan_versions
    ADD CONSTRAINT plan_versions_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: plan_versions plan_versions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plan_versions
    ADD CONSTRAINT plan_versions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE CASCADE;


--
-- Name: plan_versions plan_versions_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plan_versions
    ADD CONSTRAINT plan_versions_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: plans plans_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: plans plans_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: plans plans_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: plans plans_organization_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_organization_slug_fkey FOREIGN KEY (organization_slug) REFERENCES public.organizations(slug) ON DELETE SET NULL;


--
-- Name: plans plans_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: pseudonym_dictionaries pseudonym_dictionaries_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pseudonym_dictionaries
    ADD CONSTRAINT pseudonym_dictionaries_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: pseudonym_dictionaries pseudonym_dictionaries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pseudonym_dictionaries
    ADD CONSTRAINT pseudonym_dictionaries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: task_messages task_messages_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_messages
    ADD CONSTRAINT task_messages_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_messages task_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_messages
    ADD CONSTRAINT task_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: team_members team_members_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: team_members team_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: teams teams_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: teams teams_org_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_org_slug_fkey FOREIGN KEY (org_slug) REFERENCES public.organizations(slug) ON DELETE CASCADE;


--
-- Name: user_cidafm_commands user_cidafm_commands_command_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_cidafm_commands
    ADD CONSTRAINT user_cidafm_commands_command_id_fkey FOREIGN KEY (command_id) REFERENCES public.cidafm_commands(id) ON DELETE CASCADE;


--
-- Name: user_cidafm_commands user_cidafm_commands_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_cidafm_commands
    ADD CONSTRAINT user_cidafm_commands_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: rag_document_chunks rag_document_chunks_collection_id_fkey; Type: FK CONSTRAINT; Schema: rag_data; Owner: postgres
--

ALTER TABLE ONLY rag_data.rag_document_chunks
    ADD CONSTRAINT rag_document_chunks_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES rag_data.rag_collections(id) ON DELETE CASCADE;


--
-- Name: rag_document_chunks rag_document_chunks_document_id_fkey; Type: FK CONSTRAINT; Schema: rag_data; Owner: postgres
--

ALTER TABLE ONLY rag_data.rag_document_chunks
    ADD CONSTRAINT rag_document_chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES rag_data.rag_documents(id) ON DELETE CASCADE;


--
-- Name: rag_documents rag_documents_collection_id_fkey; Type: FK CONSTRAINT; Schema: rag_data; Owner: postgres
--

ALTER TABLE ONLY rag_data.rag_documents
    ADD CONSTRAINT rag_documents_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES rag_data.rag_collections(id) ON DELETE CASCADE;


--
-- Name: rag_feedback_signals rag_feedback_signals_chunk_id_fkey; Type: FK CONSTRAINT; Schema: rag_data; Owner: postgres
--

ALTER TABLE ONLY rag_data.rag_feedback_signals
    ADD CONSTRAINT rag_feedback_signals_chunk_id_fkey FOREIGN KEY (chunk_id) REFERENCES rag_data.rag_document_chunks(id) ON DELETE CASCADE;


--
-- Name: alerts alerts_composite_score_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.alerts
    ADD CONSTRAINT alerts_composite_score_id_fkey FOREIGN KEY (composite_score_id) REFERENCES risk.composite_scores(id) ON DELETE SET NULL;


--
-- Name: alerts alerts_subject_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.alerts
    ADD CONSTRAINT alerts_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES risk.subjects(id) ON DELETE CASCADE;


--
-- Name: article_classifications article_classifications_article_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.article_classifications
    ADD CONSTRAINT article_classifications_article_id_fkey FOREIGN KEY (article_id) REFERENCES crawler.articles(id) ON DELETE CASCADE;


--
-- Name: article_classifications article_classifications_scope_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.article_classifications
    ADD CONSTRAINT article_classifications_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE;


--
-- Name: assessment_runs assessment_runs_scope_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.assessment_runs
    ADD CONSTRAINT assessment_runs_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE;


--
-- Name: assessment_runs assessment_runs_subject_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.assessment_runs
    ADD CONSTRAINT assessment_runs_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES risk.subjects(id) ON DELETE CASCADE;


--
-- Name: assessments assessments_dimension_context_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.assessments
    ADD CONSTRAINT assessments_dimension_context_id_fkey FOREIGN KEY (dimension_context_id) REFERENCES risk.dimension_contexts(id);


--
-- Name: assessments assessments_dimension_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.assessments
    ADD CONSTRAINT assessments_dimension_id_fkey FOREIGN KEY (dimension_id) REFERENCES risk.dimensions(id) ON DELETE CASCADE;


--
-- Name: assessments assessments_subject_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.assessments
    ADD CONSTRAINT assessments_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES risk.subjects(id) ON DELETE CASCADE;


--
-- Name: comparisons comparisons_scope_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.comparisons
    ADD CONSTRAINT comparisons_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE;


--
-- Name: composite_scores composite_scores_debate_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.composite_scores
    ADD CONSTRAINT composite_scores_debate_id_fkey FOREIGN KEY (debate_id) REFERENCES risk.debates(id);


--
-- Name: composite_scores composite_scores_subject_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.composite_scores
    ADD CONSTRAINT composite_scores_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES risk.subjects(id) ON DELETE CASCADE;


--
-- Name: data_source_fetch_history data_source_fetch_history_data_source_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.data_source_fetch_history
    ADD CONSTRAINT data_source_fetch_history_data_source_id_fkey FOREIGN KEY (data_source_id) REFERENCES risk.data_sources(id) ON DELETE CASCADE;


--
-- Name: data_sources data_sources_scope_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.data_sources
    ADD CONSTRAINT data_sources_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE;


--
-- Name: debate_contexts debate_contexts_scope_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.debate_contexts
    ADD CONSTRAINT debate_contexts_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE;


--
-- Name: debates debates_subject_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.debates
    ADD CONSTRAINT debates_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES risk.subjects(id) ON DELETE CASCADE;


--
-- Name: dimension_contexts dimension_contexts_dimension_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.dimension_contexts
    ADD CONSTRAINT dimension_contexts_dimension_id_fkey FOREIGN KEY (dimension_id) REFERENCES risk.dimensions(id) ON DELETE CASCADE;


--
-- Name: dimensions dimensions_scope_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.dimensions
    ADD CONSTRAINT dimensions_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE;


--
-- Name: evaluations evaluations_composite_score_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.evaluations
    ADD CONSTRAINT evaluations_composite_score_id_fkey FOREIGN KEY (composite_score_id) REFERENCES risk.composite_scores(id) ON DELETE CASCADE;


--
-- Name: evaluations evaluations_subject_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.evaluations
    ADD CONSTRAINT evaluations_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES risk.subjects(id) ON DELETE CASCADE;


--
-- Name: executive_summaries executive_summaries_scope_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.executive_summaries
    ADD CONSTRAINT executive_summaries_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE;


--
-- Name: debates fk_debates_composite_score; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.debates
    ADD CONSTRAINT fk_debates_composite_score FOREIGN KEY (composite_score_id) REFERENCES risk.composite_scores(id) ON DELETE SET NULL;


--
-- Name: learning_queue learning_queue_learning_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.learning_queue
    ADD CONSTRAINT learning_queue_learning_id_fkey FOREIGN KEY (learning_id) REFERENCES risk.learnings(id);


--
-- Name: learning_queue learning_queue_scope_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.learning_queue
    ADD CONSTRAINT learning_queue_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE;


--
-- Name: learning_queue learning_queue_subject_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.learning_queue
    ADD CONSTRAINT learning_queue_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES risk.subjects(id) ON DELETE CASCADE;


--
-- Name: learnings learnings_dimension_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.learnings
    ADD CONSTRAINT learnings_dimension_id_fkey FOREIGN KEY (dimension_id) REFERENCES risk.dimensions(id) ON DELETE CASCADE;


--
-- Name: learnings learnings_parent_learning_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.learnings
    ADD CONSTRAINT learnings_parent_learning_id_fkey FOREIGN KEY (parent_learning_id) REFERENCES risk.learnings(id);


--
-- Name: learnings learnings_scope_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.learnings
    ADD CONSTRAINT learnings_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE;


--
-- Name: learnings learnings_subject_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.learnings
    ADD CONSTRAINT learnings_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES risk.subjects(id) ON DELETE CASCADE;


--
-- Name: mitigations mitigations_assessment_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.mitigations
    ADD CONSTRAINT mitigations_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES risk.assessments(id) ON DELETE CASCADE;


--
-- Name: mitigations mitigations_subject_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.mitigations
    ADD CONSTRAINT mitigations_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES risk.subjects(id) ON DELETE CASCADE;


--
-- Name: reports reports_scope_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.reports
    ADD CONSTRAINT reports_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE;


--
-- Name: scenarios scenarios_scope_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.scenarios
    ADD CONSTRAINT scenarios_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE;


--
-- Name: simulations simulations_scope_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.simulations
    ADD CONSTRAINT simulations_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE;


--
-- Name: simulations simulations_subject_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.simulations
    ADD CONSTRAINT simulations_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES risk.subjects(id) ON DELETE SET NULL;


--
-- Name: source_subscriptions source_subscriptions_scope_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.source_subscriptions
    ADD CONSTRAINT source_subscriptions_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE;


--
-- Name: source_subscriptions source_subscriptions_source_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.source_subscriptions
    ADD CONSTRAINT source_subscriptions_source_id_fkey FOREIGN KEY (source_id) REFERENCES crawler.sources(id) ON DELETE CASCADE;


--
-- Name: subjects subjects_scope_id_fkey; Type: FK CONSTRAINT; Schema: risk; Owner: postgres
--

ALTER TABLE ONLY risk.subjects
    ADD CONSTRAINT subjects_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE;


--
-- Name: alerts alerts_signal_id_fkey; Type: FK CONSTRAINT; Schema: sentinel; Owner: postgres
--

ALTER TABLE ONLY sentinel.alerts
    ADD CONSTRAINT alerts_signal_id_fkey FOREIGN KEY (signal_id) REFERENCES sentinel.signals(id) ON DELETE CASCADE;


--
-- Name: alerts alerts_signal_target_id_fkey; Type: FK CONSTRAINT; Schema: sentinel; Owner: postgres
--

ALTER TABLE ONLY sentinel.alerts
    ADD CONSTRAINT alerts_signal_target_id_fkey FOREIGN KEY (signal_target_id) REFERENCES sentinel.signal_targets(id) ON DELETE CASCADE;


--
-- Name: observations observations_source_id_fkey; Type: FK CONSTRAINT; Schema: sentinel; Owner: postgres
--

ALTER TABLE ONLY sentinel.observations
    ADD CONSTRAINT observations_source_id_fkey FOREIGN KEY (source_id) REFERENCES sentinel.sources(id) ON DELETE CASCADE;


--
-- Name: observations observations_source_run_id_fkey; Type: FK CONSTRAINT; Schema: sentinel; Owner: postgres
--

ALTER TABLE ONLY sentinel.observations
    ADD CONSTRAINT observations_source_run_id_fkey FOREIGN KEY (source_run_id) REFERENCES sentinel.source_runs(id) ON DELETE CASCADE;


--
-- Name: observations observations_test_run_id_fkey; Type: FK CONSTRAINT; Schema: sentinel; Owner: postgres
--

ALTER TABLE ONLY sentinel.observations
    ADD CONSTRAINT observations_test_run_id_fkey FOREIGN KEY (test_run_id) REFERENCES sentinel.test_runs(id) ON DELETE SET NULL;


--
-- Name: signal_targets signal_targets_signal_id_fkey; Type: FK CONSTRAINT; Schema: sentinel; Owner: postgres
--

ALTER TABLE ONLY sentinel.signal_targets
    ADD CONSTRAINT signal_targets_signal_id_fkey FOREIGN KEY (signal_id) REFERENCES sentinel.signals(id) ON DELETE CASCADE;


--
-- Name: signal_targets signal_targets_watch_profile_id_fkey; Type: FK CONSTRAINT; Schema: sentinel; Owner: postgres
--

ALTER TABLE ONLY sentinel.signal_targets
    ADD CONSTRAINT signal_targets_watch_profile_id_fkey FOREIGN KEY (watch_profile_id) REFERENCES sentinel.watch_profiles(id) ON DELETE CASCADE;


--
-- Name: signals signals_observation_id_fkey; Type: FK CONSTRAINT; Schema: sentinel; Owner: postgres
--

ALTER TABLE ONLY sentinel.signals
    ADD CONSTRAINT signals_observation_id_fkey FOREIGN KEY (observation_id) REFERENCES sentinel.observations(id) ON DELETE CASCADE;


--
-- Name: signals signals_source_run_id_fkey; Type: FK CONSTRAINT; Schema: sentinel; Owner: postgres
--

ALTER TABLE ONLY sentinel.signals
    ADD CONSTRAINT signals_source_run_id_fkey FOREIGN KEY (source_run_id) REFERENCES sentinel.source_runs(id) ON DELETE CASCADE;


--
-- Name: signals signals_test_run_id_fkey; Type: FK CONSTRAINT; Schema: sentinel; Owner: postgres
--

ALTER TABLE ONLY sentinel.signals
    ADD CONSTRAINT signals_test_run_id_fkey FOREIGN KEY (test_run_id) REFERENCES sentinel.test_runs(id) ON DELETE SET NULL;


--
-- Name: source_runs source_runs_source_id_fkey; Type: FK CONSTRAINT; Schema: sentinel; Owner: postgres
--

ALTER TABLE ONLY sentinel.source_runs
    ADD CONSTRAINT source_runs_source_id_fkey FOREIGN KEY (source_id) REFERENCES sentinel.sources(id) ON DELETE CASCADE;


--
-- Name: source_runs source_runs_test_run_id_fkey; Type: FK CONSTRAINT; Schema: sentinel; Owner: postgres
--

ALTER TABLE ONLY sentinel.source_runs
    ADD CONSTRAINT source_runs_test_run_id_fkey FOREIGN KEY (test_run_id) REFERENCES sentinel.test_runs(id) ON DELETE SET NULL;


--
-- Name: sources sources_test_run_id_fkey; Type: FK CONSTRAINT; Schema: sentinel; Owner: postgres
--

ALTER TABLE ONLY sentinel.sources
    ADD CONSTRAINT sources_test_run_id_fkey FOREIGN KEY (test_run_id) REFERENCES sentinel.test_runs(id) ON DELETE SET NULL;


--
-- Name: watch_concerns watch_concerns_watch_profile_id_fkey; Type: FK CONSTRAINT; Schema: sentinel; Owner: postgres
--

ALTER TABLE ONLY sentinel.watch_concerns
    ADD CONSTRAINT watch_concerns_watch_profile_id_fkey FOREIGN KEY (watch_profile_id) REFERENCES sentinel.watch_profiles(id) ON DELETE CASCADE;


--
-- Name: watch_profiles watch_profiles_test_run_id_fkey; Type: FK CONSTRAINT; Schema: sentinel; Owner: postgres
--

ALTER TABLE ONLY sentinel.watch_profiles
    ADD CONSTRAINT watch_profiles_test_run_id_fkey FOREIGN KEY (test_run_id) REFERENCES sentinel.test_runs(id) ON DELETE SET NULL;


--
-- Name: document_mappings document_mappings_profile_id_fkey; Type: FK CONSTRAINT; Schema: substrate; Owner: postgres
--

ALTER TABLE ONLY substrate.document_mappings
    ADD CONSTRAINT document_mappings_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES substrate.profiles(id) ON DELETE CASCADE;


--
-- Name: document_mappings document_mappings_source_id_fkey; Type: FK CONSTRAINT; Schema: substrate; Owner: postgres
--

ALTER TABLE ONLY substrate.document_mappings
    ADD CONSTRAINT document_mappings_source_id_fkey FOREIGN KEY (source_id) REFERENCES substrate.sources(id) ON DELETE CASCADE;


--
-- Name: entity_mappings entity_mappings_profile_id_fkey; Type: FK CONSTRAINT; Schema: substrate; Owner: postgres
--

ALTER TABLE ONLY substrate.entity_mappings
    ADD CONSTRAINT entity_mappings_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES substrate.profiles(id) ON DELETE CASCADE;


--
-- Name: entity_mappings entity_mappings_source_id_fkey; Type: FK CONSTRAINT; Schema: substrate; Owner: postgres
--

ALTER TABLE ONLY substrate.entity_mappings
    ADD CONSTRAINT entity_mappings_source_id_fkey FOREIGN KEY (source_id) REFERENCES substrate.sources(id) ON DELETE CASCADE;


--
-- Name: selection_presets selection_presets_profile_id_fkey; Type: FK CONSTRAINT; Schema: substrate; Owner: postgres
--

ALTER TABLE ONLY substrate.selection_presets
    ADD CONSTRAINT selection_presets_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES substrate.profiles(id) ON DELETE CASCADE;


--
-- Name: sources sources_profile_id_fkey; Type: FK CONSTRAINT; Schema: substrate; Owner: postgres
--

ALTER TABLE ONLY substrate.sources
    ADD CONSTRAINT sources_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES substrate.profiles(id) ON DELETE CASCADE;


--
-- Name: agent_definition_links agent_definition_links_agent_slug_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.agent_definition_links
    ADD CONSTRAINT agent_definition_links_agent_slug_fkey FOREIGN KEY (agent_slug) REFERENCES workflows.agent_definitions(slug) ON DELETE CASCADE;


--
-- Name: agent_definition_org_overrides agent_definition_org_overrides_agent_slug_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.agent_definition_org_overrides
    ADD CONSTRAINT agent_definition_org_overrides_agent_slug_fkey FOREIGN KEY (agent_slug) REFERENCES workflows.agent_definitions(slug) ON DELETE CASCADE;


--
-- Name: agent_definition_org_overrides agent_definition_org_overrides_organization_slug_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.agent_definition_org_overrides
    ADD CONSTRAINT agent_definition_org_overrides_organization_slug_fkey FOREIGN KEY (organization_slug) REFERENCES public.organizations(slug) ON DELETE CASCADE;


--
-- Name: agent_definition_org_overrides agent_definition_org_overrides_updated_by_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.agent_definition_org_overrides
    ADD CONSTRAINT agent_definition_org_overrides_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: agent_definition_override_history agent_definition_override_history_agent_slug_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.agent_definition_override_history
    ADD CONSTRAINT agent_definition_override_history_agent_slug_fkey FOREIGN KEY (agent_slug) REFERENCES workflows.agent_definitions(slug) ON DELETE CASCADE;


--
-- Name: agent_definition_versions agent_definition_versions_agent_slug_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.agent_definition_versions
    ADD CONSTRAINT agent_definition_versions_agent_slug_fkey FOREIGN KEY (agent_slug) REFERENCES workflows.agent_definitions(slug) ON DELETE CASCADE;


--
-- Name: agent_definitions agent_definitions_updated_by_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.agent_definitions
    ADD CONSTRAINT agent_definitions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: group_items group_items_group_in_org; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.group_items
    ADD CONSTRAINT group_items_group_in_org FOREIGN KEY (group_id, organization_slug) REFERENCES workflows.groups(id, organization_slug) ON DELETE CASCADE;


--
-- Name: group_items group_items_workflow_slug_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.group_items
    ADD CONSTRAINT group_items_workflow_slug_fkey FOREIGN KEY (workflow_slug) REFERENCES workflows.registry(slug) ON DELETE CASCADE;


--
-- Name: groups groups_organization_slug_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.groups
    ADD CONSTRAINT groups_organization_slug_fkey FOREIGN KEY (organization_slug) REFERENCES public.organizations(slug) ON DELETE CASCADE;


--
-- Name: human_reviews human_reviews_organization_slug_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.human_reviews
    ADD CONSTRAINT human_reviews_organization_slug_fkey FOREIGN KEY (organization_slug) REFERENCES public.organizations(slug);


--
-- Name: human_reviews human_reviews_responded_by_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.human_reviews
    ADD CONSTRAINT human_reviews_responded_by_fkey FOREIGN KEY (responded_by) REFERENCES auth.users(id);


--
-- Name: human_reviews human_reviews_run_id_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.human_reviews
    ADD CONSTRAINT human_reviews_run_id_fkey FOREIGN KEY (run_id) REFERENCES workflows.runs(id) ON DELETE CASCADE;


--
-- Name: improvement_requests improvement_requests_run_id_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.improvement_requests
    ADD CONSTRAINT improvement_requests_run_id_fkey FOREIGN KEY (run_id) REFERENCES workflows.runs(id) ON DELETE SET NULL;


--
-- Name: improvement_requests improvement_requests_trace_review_id_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.improvement_requests
    ADD CONSTRAINT improvement_requests_trace_review_id_fkey FOREIGN KEY (trace_review_id) REFERENCES workflows.trace_reviews(id) ON DELETE SET NULL;


--
-- Name: issue_ledger_events issue_ledger_events_issue_id_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.issue_ledger_events
    ADD CONSTRAINT issue_ledger_events_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES workflows.issue_ledger(id) ON DELETE CASCADE;


--
-- Name: issue_ledger_events issue_ledger_events_run_id_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.issue_ledger_events
    ADD CONSTRAINT issue_ledger_events_run_id_fkey FOREIGN KEY (run_id) REFERENCES workflows.runs(id) ON DELETE CASCADE;


--
-- Name: issue_ledger issue_ledger_organization_slug_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.issue_ledger
    ADD CONSTRAINT issue_ledger_organization_slug_fkey FOREIGN KEY (organization_slug) REFERENCES public.organizations(slug);


--
-- Name: issue_ledger issue_ledger_run_id_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.issue_ledger
    ADD CONSTRAINT issue_ledger_run_id_fkey FOREIGN KEY (run_id) REFERENCES workflows.runs(id) ON DELETE CASCADE;


--
-- Name: issue_ledger issue_ledger_work_unit_run_id_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.issue_ledger
    ADD CONSTRAINT issue_ledger_work_unit_run_id_fkey FOREIGN KEY (work_unit_run_id) REFERENCES workflows.work_unit_runs(id) ON DELETE SET NULL;


--
-- Name: model_profiles model_profiles_known_model; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.model_profiles
    ADD CONSTRAINT model_profiles_known_model FOREIGN KEY (model, provider) REFERENCES public.llm_models(model_name, provider_name);


--
-- Name: model_profiles model_profiles_organization_slug_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.model_profiles
    ADD CONSTRAINT model_profiles_organization_slug_fkey FOREIGN KEY (organization_slug) REFERENCES public.organizations(slug) ON DELETE CASCADE;


--
-- Name: model_profiles model_profiles_updated_by_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.model_profiles
    ADD CONSTRAINT model_profiles_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: org_settings org_settings_organization_slug_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.org_settings
    ADD CONSTRAINT org_settings_organization_slug_fkey FOREIGN KEY (organization_slug) REFERENCES public.organizations(slug) ON DELETE CASCADE;


--
-- Name: org_settings org_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.org_settings
    ADD CONSTRAINT org_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: org_settings org_settings_workflow_slug_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.org_settings
    ADD CONSTRAINT org_settings_workflow_slug_fkey FOREIGN KEY (workflow_slug) REFERENCES workflows.registry(slug) ON DELETE CASCADE;


--
-- Name: participant_runs participant_runs_organization_slug_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.participant_runs
    ADD CONSTRAINT participant_runs_organization_slug_fkey FOREIGN KEY (organization_slug) REFERENCES public.organizations(slug);


--
-- Name: participant_runs participant_runs_run_id_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.participant_runs
    ADD CONSTRAINT participant_runs_run_id_fkey FOREIGN KEY (run_id) REFERENCES workflows.runs(id) ON DELETE CASCADE;


--
-- Name: participant_runs participant_runs_work_unit_run_id_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.participant_runs
    ADD CONSTRAINT participant_runs_work_unit_run_id_fkey FOREIGN KEY (work_unit_run_id) REFERENCES workflows.work_unit_runs(id) ON DELETE CASCADE;


--
-- Name: runs runs_id_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.runs
    ADD CONSTRAINT runs_id_fkey FOREIGN KEY (id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: runs runs_organization_slug_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.runs
    ADD CONSTRAINT runs_organization_slug_fkey FOREIGN KEY (organization_slug) REFERENCES public.organizations(slug);


--
-- Name: runs runs_parent_run_id_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.runs
    ADD CONSTRAINT runs_parent_run_id_fkey FOREIGN KEY (parent_run_id) REFERENCES workflows.runs(id) ON DELETE SET NULL;


--
-- Name: runs runs_user_id_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.runs
    ADD CONSTRAINT runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: trace_reviews trace_reviews_reviewer_agent_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.trace_reviews
    ADD CONSTRAINT trace_reviews_reviewer_agent_fkey FOREIGN KEY (reviewer_agent) REFERENCES workflows.agent_definitions(slug);


--
-- Name: trace_reviews trace_reviews_run_id_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.trace_reviews
    ADD CONSTRAINT trace_reviews_run_id_fkey FOREIGN KEY (run_id) REFERENCES workflows.runs(id) ON DELETE CASCADE;


--
-- Name: work_unit_runs work_unit_runs_organization_slug_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.work_unit_runs
    ADD CONSTRAINT work_unit_runs_organization_slug_fkey FOREIGN KEY (organization_slug) REFERENCES public.organizations(slug);


--
-- Name: work_unit_runs work_unit_runs_run_id_fkey; Type: FK CONSTRAINT; Schema: workflows; Owner: postgres
--

ALTER TABLE ONLY workflows.work_unit_runs
    ADD CONSTRAINT work_unit_runs_run_id_fkey FOREIGN KEY (run_id) REFERENCES workflows.runs(id) ON DELETE CASCADE;


--
-- Name: a2a_inbound_nonces; Type: ROW SECURITY; Schema: ambient; Owner: postgres
--

ALTER TABLE ambient.a2a_inbound_nonces ENABLE ROW LEVEL SECURITY;

--
-- Name: a2a_inbound_nonces service_role_all_a2a_inbound_nonces; Type: POLICY; Schema: ambient; Owner: postgres
--

CREATE POLICY service_role_all_a2a_inbound_nonces ON ambient.a2a_inbound_nonces TO service_role USING (true) WITH CHECK (true);


--
-- Name: team_members Admins can add team members; Type: POLICY; Schema: authz; Owner: postgres
--

CREATE POLICY "Admins can add team members" ON authz.team_members FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM authz.team_members tm
  WHERE ((tm.team_id = tm.team_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['admin'::text, 'lead'::text]))))) OR (EXISTS ( SELECT 1
   FROM ((authz.teams t
     JOIN authz.rbac_user_org_roles uor ON ((((uor.organization_slug)::text = t.org_slug) OR ((uor.organization_slug)::text = '*'::text))))
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((t.id = team_members.team_id) AND (t.org_slug IS NOT NULL) AND (uor.user_id = auth.uid()) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now()))))) OR (EXISTS ( SELECT 1
   FROM ((authz.teams t
     JOIN authz.rbac_user_org_roles uor ON (true))
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((t.id = team_members.team_id) AND (t.org_slug IS NULL) AND (uor.user_id = auth.uid()) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now()))))) OR (EXISTS ( SELECT 1
   FROM authz.teams t
  WHERE ((t.id = team_members.team_id) AND (t.created_by = auth.uid()))))));


--
-- Name: teams Admins can create teams; Type: POLICY; Schema: authz; Owner: postgres
--

CREATE POLICY "Admins can create teams" ON authz.teams FOR INSERT WITH CHECK ((((org_slug IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (authz.rbac_user_org_roles uor
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((uor.user_id = auth.uid()) AND (((uor.organization_slug)::text = teams.org_slug) OR ((uor.organization_slug)::text = '*'::text)) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now())))))) OR ((org_slug IS NULL) AND (EXISTS ( SELECT 1
   FROM (authz.rbac_user_org_roles uor
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((uor.user_id = auth.uid()) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now()))))))));


--
-- Name: teams Admins can delete teams; Type: POLICY; Schema: authz; Owner: postgres
--

CREATE POLICY "Admins can delete teams" ON authz.teams FOR DELETE USING (((created_by = auth.uid()) OR ((org_slug IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (authz.rbac_user_org_roles uor
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((uor.user_id = auth.uid()) AND (((uor.organization_slug)::text = teams.org_slug) OR ((uor.organization_slug)::text = '*'::text)) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now())))))) OR ((org_slug IS NULL) AND (EXISTS ( SELECT 1
   FROM (authz.rbac_user_org_roles uor
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((uor.user_id = auth.uid()) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now()))))))));


--
-- Name: team_members Admins can remove team members or self-remove; Type: POLICY; Schema: authz; Owner: postgres
--

CREATE POLICY "Admins can remove team members or self-remove" ON authz.team_members FOR DELETE USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM authz.team_members tm
  WHERE ((tm.team_id = tm.team_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['admin'::text, 'lead'::text]))))) OR (EXISTS ( SELECT 1
   FROM ((authz.teams t
     JOIN authz.rbac_user_org_roles uor ON ((((uor.organization_slug)::text = t.org_slug) OR ((uor.organization_slug)::text = '*'::text))))
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((t.id = team_members.team_id) AND (t.org_slug IS NOT NULL) AND (uor.user_id = auth.uid()) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now()))))) OR (EXISTS ( SELECT 1
   FROM ((authz.teams t
     JOIN authz.rbac_user_org_roles uor ON (true))
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((t.id = team_members.team_id) AND (t.org_slug IS NULL) AND (uor.user_id = auth.uid()) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now()))))) OR (EXISTS ( SELECT 1
   FROM authz.teams t
  WHERE ((t.id = team_members.team_id) AND (t.created_by = auth.uid()))))));


--
-- Name: team_members Admins can update team members; Type: POLICY; Schema: authz; Owner: postgres
--

CREATE POLICY "Admins can update team members" ON authz.team_members FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM authz.team_members tm
  WHERE ((tm.team_id = tm.team_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['admin'::text, 'lead'::text]))))) OR (EXISTS ( SELECT 1
   FROM ((authz.teams t
     JOIN authz.rbac_user_org_roles uor ON ((((uor.organization_slug)::text = t.org_slug) OR ((uor.organization_slug)::text = '*'::text))))
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((t.id = team_members.team_id) AND (t.org_slug IS NOT NULL) AND (uor.user_id = auth.uid()) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now()))))) OR (EXISTS ( SELECT 1
   FROM ((authz.teams t
     JOIN authz.rbac_user_org_roles uor ON (true))
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((t.id = team_members.team_id) AND (t.org_slug IS NULL) AND (uor.user_id = auth.uid()) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now()))))) OR (EXISTS ( SELECT 1
   FROM authz.teams t
  WHERE ((t.id = team_members.team_id) AND (t.created_by = auth.uid()))))));


--
-- Name: teams Admins can update teams; Type: POLICY; Schema: authz; Owner: postgres
--

CREATE POLICY "Admins can update teams" ON authz.teams FOR UPDATE USING (((created_by = auth.uid()) OR ((org_slug IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (authz.rbac_user_org_roles uor
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((uor.user_id = auth.uid()) AND (((uor.organization_slug)::text = teams.org_slug) OR ((uor.organization_slug)::text = '*'::text)) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now())))))) OR ((org_slug IS NULL) AND (EXISTS ( SELECT 1
   FROM (authz.rbac_user_org_roles uor
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((uor.user_id = auth.uid()) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now()))))))));


--
-- Name: teams Users can view accessible teams; Type: POLICY; Schema: authz; Owner: postgres
--

CREATE POLICY "Users can view accessible teams" ON authz.teams FOR SELECT USING (((id IN ( SELECT team_members.team_id
   FROM authz.team_members
  WHERE (team_members.user_id = auth.uid()))) OR ((org_slug IS NOT NULL) AND (org_slug IN ( SELECT rbac_user_org_roles.organization_slug
   FROM authz.rbac_user_org_roles
  WHERE ((rbac_user_org_roles.user_id = auth.uid()) AND ((rbac_user_org_roles.expires_at IS NULL) OR (rbac_user_org_roles.expires_at > now())))))) OR (EXISTS ( SELECT 1
   FROM authz.rbac_user_org_roles
  WHERE ((rbac_user_org_roles.user_id = auth.uid()) AND ((rbac_user_org_roles.organization_slug)::text = '*'::text) AND ((rbac_user_org_roles.expires_at IS NULL) OR (rbac_user_org_roles.expires_at > now())))))));


--
-- Name: team_members Users can view team members; Type: POLICY; Schema: authz; Owner: postgres
--

CREATE POLICY "Users can view team members" ON authz.team_members FOR SELECT USING (((team_id IN ( SELECT tm.team_id
   FROM authz.team_members tm
  WHERE (tm.user_id = auth.uid()))) OR (team_id IN ( SELECT t.id
   FROM authz.teams t
  WHERE ((t.org_slug IS NOT NULL) AND (t.org_slug IN ( SELECT rbac_user_org_roles.organization_slug
           FROM authz.rbac_user_org_roles
          WHERE ((rbac_user_org_roles.user_id = auth.uid()) AND ((rbac_user_org_roles.expires_at IS NULL) OR (rbac_user_org_roles.expires_at > now())))))))) OR (EXISTS ( SELECT 1
   FROM authz.rbac_user_org_roles
  WHERE ((rbac_user_org_roles.user_id = auth.uid()) AND ((rbac_user_org_roles.organization_slug)::text = '*'::text) AND ((rbac_user_org_roles.expires_at IS NULL) OR (rbac_user_org_roles.expires_at > now())))))));


--
-- Name: team_members; Type: ROW SECURITY; Schema: authz; Owner: postgres
--

ALTER TABLE authz.team_members ENABLE ROW LEVEL SECURITY;

--
-- Name: teams; Type: ROW SECURITY; Schema: authz; Owner: postgres
--

ALTER TABLE authz.teams ENABLE ROW LEVEL SECURITY;

--
-- Name: submittal_decisions; Type: ROW SECURITY; Schema: building; Owner: postgres
--

ALTER TABLE building.submittal_decisions ENABLE ROW LEVEL SECURITY;

--
-- Name: companies; Type: ROW SECURITY; Schema: company; Owner: postgres
--

ALTER TABLE company.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: discovery_signals; Type: ROW SECURITY; Schema: company; Owner: postgres
--

ALTER TABLE company.discovery_signals ENABLE ROW LEVEL SECURITY;

--
-- Name: outreach; Type: ROW SECURITY; Schema: company; Owner: postgres
--

ALTER TABLE company.outreach ENABLE ROW LEVEL SECURITY;

--
-- Name: companies service_role_full_access_companies; Type: POLICY; Schema: company; Owner: postgres
--

CREATE POLICY service_role_full_access_companies ON company.companies TO service_role USING (true) WITH CHECK (true);


--
-- Name: outreach service_role_full_access_outreach; Type: POLICY; Schema: company; Owner: postgres
--

CREATE POLICY service_role_full_access_outreach ON company.outreach TO service_role USING (true) WITH CHECK (true);


--
-- Name: discovery_signals service_role_full_access_signals; Type: POLICY; Schema: company; Owner: postgres
--

CREATE POLICY service_role_full_access_signals ON company.discovery_signals TO service_role USING (true) WITH CHECK (true);


--
-- Name: agent_article_outputs; Type: ROW SECURITY; Schema: crawler; Owner: postgres
--

ALTER TABLE crawler.agent_article_outputs ENABLE ROW LEVEL SECURITY;

--
-- Name: articles; Type: ROW SECURITY; Schema: crawler; Owner: postgres
--

ALTER TABLE crawler.articles ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_article_outputs crawler_agent_outputs_insert; Type: POLICY; Schema: crawler; Owner: postgres
--

CREATE POLICY crawler_agent_outputs_insert ON crawler.agent_article_outputs FOR INSERT WITH CHECK ((article_id IN ( SELECT articles.id
   FROM crawler.articles
  WHERE (articles.organization_slug = current_setting('app.current_org'::text, true)))));


--
-- Name: agent_article_outputs crawler_agent_outputs_read; Type: POLICY; Schema: crawler; Owner: postgres
--

CREATE POLICY crawler_agent_outputs_read ON crawler.agent_article_outputs FOR SELECT USING ((article_id IN ( SELECT articles.id
   FROM crawler.articles
  WHERE (articles.organization_slug = current_setting('app.current_org'::text, true)))));


--
-- Name: agent_article_outputs crawler_agent_outputs_service_all; Type: POLICY; Schema: crawler; Owner: postgres
--

CREATE POLICY crawler_agent_outputs_service_all ON crawler.agent_article_outputs TO service_role USING (true) WITH CHECK (true);


--
-- Name: articles crawler_articles_insert; Type: POLICY; Schema: crawler; Owner: postgres
--

CREATE POLICY crawler_articles_insert ON crawler.articles FOR INSERT WITH CHECK ((organization_slug = current_setting('app.current_org'::text, true)));


--
-- Name: articles crawler_articles_read; Type: POLICY; Schema: crawler; Owner: postgres
--

CREATE POLICY crawler_articles_read ON crawler.articles FOR SELECT USING ((organization_slug = current_setting('app.current_org'::text, true)));


--
-- Name: articles crawler_articles_service_all; Type: POLICY; Schema: crawler; Owner: postgres
--

CREATE POLICY crawler_articles_service_all ON crawler.articles TO service_role USING (true) WITH CHECK (true);


--
-- Name: source_crawls crawler_source_crawls_insert; Type: POLICY; Schema: crawler; Owner: postgres
--

CREATE POLICY crawler_source_crawls_insert ON crawler.source_crawls FOR INSERT WITH CHECK ((source_id IN ( SELECT sources.id
   FROM crawler.sources
  WHERE (sources.organization_slug = current_setting('app.current_org'::text, true)))));


--
-- Name: source_crawls crawler_source_crawls_read; Type: POLICY; Schema: crawler; Owner: postgres
--

CREATE POLICY crawler_source_crawls_read ON crawler.source_crawls FOR SELECT USING ((source_id IN ( SELECT sources.id
   FROM crawler.sources
  WHERE (sources.organization_slug = current_setting('app.current_org'::text, true)))));


--
-- Name: source_crawls crawler_source_crawls_service_all; Type: POLICY; Schema: crawler; Owner: postgres
--

CREATE POLICY crawler_source_crawls_service_all ON crawler.source_crawls TO service_role USING (true) WITH CHECK (true);


--
-- Name: sources crawler_sources_delete; Type: POLICY; Schema: crawler; Owner: postgres
--

CREATE POLICY crawler_sources_delete ON crawler.sources FOR DELETE USING ((organization_slug = current_setting('app.current_org'::text, true)));


--
-- Name: sources crawler_sources_insert; Type: POLICY; Schema: crawler; Owner: postgres
--

CREATE POLICY crawler_sources_insert ON crawler.sources FOR INSERT WITH CHECK ((organization_slug = current_setting('app.current_org'::text, true)));


--
-- Name: sources crawler_sources_read; Type: POLICY; Schema: crawler; Owner: postgres
--

CREATE POLICY crawler_sources_read ON crawler.sources FOR SELECT USING ((organization_slug = current_setting('app.current_org'::text, true)));


--
-- Name: sources crawler_sources_service_all; Type: POLICY; Schema: crawler; Owner: postgres
--

CREATE POLICY crawler_sources_service_all ON crawler.sources TO service_role USING (true) WITH CHECK (true);


--
-- Name: sources crawler_sources_update; Type: POLICY; Schema: crawler; Owner: postgres
--

CREATE POLICY crawler_sources_update ON crawler.sources FOR UPDATE USING ((organization_slug = current_setting('app.current_org'::text, true)));


--
-- Name: source_crawls; Type: ROW SECURITY; Schema: crawler; Owner: postgres
--

ALTER TABLE crawler.source_crawls ENABLE ROW LEVEL SECURITY;

--
-- Name: sources; Type: ROW SECURITY; Schema: crawler; Owner: postgres
--

ALTER TABLE crawler.sources ENABLE ROW LEVEL SECURITY;

--
-- Name: cad_outputs; Type: ROW SECURITY; Schema: engineering; Owner: postgres
--

ALTER TABLE engineering.cad_outputs ENABLE ROW LEVEL SECURITY;

--
-- Name: drawings; Type: ROW SECURITY; Schema: engineering; Owner: postgres
--

ALTER TABLE engineering.drawings ENABLE ROW LEVEL SECURITY;

--
-- Name: execution_log; Type: ROW SECURITY; Schema: engineering; Owner: postgres
--

ALTER TABLE engineering.execution_log ENABLE ROW LEVEL SECURITY;

--
-- Name: generated_code; Type: ROW SECURITY; Schema: engineering; Owner: postgres
--

ALTER TABLE engineering.generated_code ENABLE ROW LEVEL SECURITY;

--
-- Name: part_library; Type: ROW SECURITY; Schema: engineering; Owner: postgres
--

ALTER TABLE engineering.part_library ENABLE ROW LEVEL SECURITY;

--
-- Name: postmortem_tasks; Type: ROW SECURITY; Schema: engineering; Owner: postgres
--

ALTER TABLE engineering.postmortem_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: projects; Type: ROW SECURITY; Schema: engineering; Owner: postgres
--

ALTER TABLE engineering.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: cad_outputs service_role_cad_outputs; Type: POLICY; Schema: engineering; Owner: postgres
--

CREATE POLICY service_role_cad_outputs ON engineering.cad_outputs TO service_role USING (true) WITH CHECK (true);


--
-- Name: drawings service_role_drawings; Type: POLICY; Schema: engineering; Owner: postgres
--

CREATE POLICY service_role_drawings ON engineering.drawings TO service_role USING (true) WITH CHECK (true);


--
-- Name: execution_log service_role_execution_log; Type: POLICY; Schema: engineering; Owner: postgres
--

CREATE POLICY service_role_execution_log ON engineering.execution_log TO service_role USING (true) WITH CHECK (true);


--
-- Name: generated_code service_role_generated_code; Type: POLICY; Schema: engineering; Owner: postgres
--

CREATE POLICY service_role_generated_code ON engineering.generated_code TO service_role USING (true) WITH CHECK (true);


--
-- Name: part_library service_role_part_library; Type: POLICY; Schema: engineering; Owner: postgres
--

CREATE POLICY service_role_part_library ON engineering.part_library TO service_role USING (true) WITH CHECK (true);


--
-- Name: projects service_role_projects; Type: POLICY; Schema: engineering; Owner: postgres
--

CREATE POLICY service_role_projects ON engineering.projects TO service_role USING (true) WITH CHECK (true);


--
-- Name: invoices; Type: ROW SECURITY; Schema: finance; Owner: postgres
--

ALTER TABLE finance.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: po_lines; Type: ROW SECURITY; Schema: finance; Owner: postgres
--

ALTER TABLE finance.po_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_orders; Type: ROW SECURITY; Schema: finance; Owner: postgres
--

ALTER TABLE finance.purchase_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: receipts; Type: ROW SECURITY; Schema: finance; Owner: postgres
--

ALTER TABLE finance.receipts ENABLE ROW LEVEL SECURITY;

--
-- Name: new_hires; Type: ROW SECURITY; Schema: hr; Owner: postgres
--

ALTER TABLE hr.new_hires ENABLE ROW LEVEL SECURITY;

--
-- Name: onboarding_tasks; Type: ROW SECURITY; Schema: hr; Owner: postgres
--

ALTER TABLE hr.onboarding_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: competitor_snapshots; Type: ROW SECURITY; Schema: marketing; Owner: postgres
--

ALTER TABLE marketing.competitor_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: competitor_sources; Type: ROW SECURITY; Schema: marketing; Owner: postgres
--

ALTER TABLE marketing.competitor_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: swarm_content_types; Type: ROW SECURITY; Schema: marketing; Owner: postgres
--

ALTER TABLE marketing.swarm_content_types ENABLE ROW LEVEL SECURITY;

--
-- Name: swarm_editors; Type: ROW SECURITY; Schema: marketing; Owner: postgres
--

ALTER TABLE marketing.swarm_editors ENABLE ROW LEVEL SECURITY;

--
-- Name: swarm_evaluators; Type: ROW SECURITY; Schema: marketing; Owner: postgres
--

ALTER TABLE marketing.swarm_evaluators ENABLE ROW LEVEL SECURITY;

--
-- Name: swarm_facets; Type: ROW SECURITY; Schema: marketing; Owner: postgres
--

ALTER TABLE marketing.swarm_facets ENABLE ROW LEVEL SECURITY;

--
-- Name: swarm_weights; Type: ROW SECURITY; Schema: marketing; Owner: postgres
--

ALTER TABLE marketing.swarm_weights ENABLE ROW LEVEL SECURITY;

--
-- Name: swarm_writers; Type: ROW SECURITY; Schema: marketing; Owner: postgres
--

ALTER TABLE marketing.swarm_writers ENABLE ROW LEVEL SECURITY;

--
-- Name: task_collaborators Anyone can add collaborators; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Anyone can add collaborators" ON orch_flow.task_collaborators FOR INSERT WITH CHECK (true);


--
-- Name: task_watchers Anyone can add watchers; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Anyone can add watchers" ON orch_flow.task_watchers FOR INSERT WITH CHECK (true);


--
-- Name: notifications Anyone can create notifications; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Anyone can create notifications" ON orch_flow.notifications FOR INSERT WITH CHECK (true);


--
-- Name: task_update_requests Anyone can create update requests; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Anyone can create update requests" ON orch_flow.task_update_requests FOR INSERT WITH CHECK (true);


--
-- Name: notifications Anyone can delete notifications; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Anyone can delete notifications" ON orch_flow.notifications FOR DELETE USING (true);


--
-- Name: task_collaborators Anyone can remove collaborators; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Anyone can remove collaborators" ON orch_flow.task_collaborators FOR DELETE USING (true);


--
-- Name: task_watchers Anyone can remove watchers; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Anyone can remove watchers" ON orch_flow.task_watchers FOR DELETE USING (true);


--
-- Name: notifications Anyone can update notifications; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Anyone can update notifications" ON orch_flow.notifications FOR UPDATE USING (true);


--
-- Name: task_update_requests Anyone can update requests; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Anyone can update requests" ON orch_flow.task_update_requests FOR UPDATE USING (true);


--
-- Name: task_collaborators Anyone can view collaborators; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Anyone can view collaborators" ON orch_flow.task_collaborators FOR SELECT USING (true);


--
-- Name: journey_templates Anyone can view journey templates; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Anyone can view journey templates" ON orch_flow.journey_templates FOR SELECT USING ((is_active = true));


--
-- Name: notifications Anyone can view notifications; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Anyone can view notifications" ON orch_flow.notifications FOR SELECT USING (true);


--
-- Name: user_presence Anyone can view presence; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Anyone can view presence" ON orch_flow.user_presence FOR SELECT USING (true);


--
-- Name: task_update_requests Anyone can view update requests; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Anyone can view update requests" ON orch_flow.task_update_requests FOR SELECT USING (true);


--
-- Name: task_watchers Anyone can view watchers; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Anyone can view watchers" ON orch_flow.task_watchers FOR SELECT USING (true);


--
-- Name: profiles Profiles are viewable by everyone; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Profiles are viewable by everyone" ON orch_flow.profiles FOR SELECT USING (true);


--
-- Name: channel_messages Users can delete their own messages; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Users can delete their own messages" ON orch_flow.channel_messages FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: profiles Users can insert their own profile; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Users can insert their own profile" ON orch_flow.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: channels Users can manage channels in their teams; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Users can manage channels in their teams" ON orch_flow.channels USING (((team_id IS NULL) OR orch_flow.is_team_member(auth.uid(), team_id)));


--
-- Name: learning_progress Users can manage own learning progress; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Users can manage own learning progress" ON orch_flow.learning_progress USING ((user_id = auth.uid()));


--
-- Name: sprints Users can manage sprints in their teams; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Users can manage sprints in their teams" ON orch_flow.sprints USING (((team_id IS NULL) OR orch_flow.is_team_member(auth.uid(), team_id)));


--
-- Name: shared_tasks Users can manage tasks in their teams; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Users can manage tasks in their teams" ON orch_flow.shared_tasks USING (((team_id IS NULL) OR orch_flow.is_team_member(auth.uid(), team_id)));


--
-- Name: channel_messages Users can manage their own messages; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Users can manage their own messages" ON orch_flow.channel_messages FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: timer_state Users can manage timer in their teams; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Users can manage timer in their teams" ON orch_flow.timer_state USING (((team_id IS NULL) OR orch_flow.is_team_member(auth.uid(), team_id)));


--
-- Name: channel_messages Users can send messages in accessible channels; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Users can send messages in accessible channels" ON orch_flow.channel_messages FOR INSERT WITH CHECK ((channel_id IN ( SELECT c.id
   FROM orch_flow.channels c
  WHERE ((c.team_id IS NULL) OR orch_flow.is_team_member(auth.uid(), c.team_id)))));


--
-- Name: user_presence Users can update their own presence; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Users can update their own presence" ON orch_flow.user_presence FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Users can update their own profile" ON orch_flow.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: user_presence Users can upsert their own presence; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Users can upsert their own presence" ON orch_flow.user_presence FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: channels Users can view channels in their teams; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Users can view channels in their teams" ON orch_flow.channels FOR SELECT USING (((team_id IS NULL) OR orch_flow.is_team_member(auth.uid(), team_id)));


--
-- Name: channel_messages Users can view messages in accessible channels; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Users can view messages in accessible channels" ON orch_flow.channel_messages FOR SELECT USING ((channel_id IN ( SELECT c.id
   FROM orch_flow.channels c
  WHERE ((c.team_id IS NULL) OR orch_flow.is_team_member(auth.uid(), c.team_id)))));


--
-- Name: learning_progress Users can view own learning progress; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Users can view own learning progress" ON orch_flow.learning_progress FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: sprints Users can view sprints in their teams; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Users can view sprints in their teams" ON orch_flow.sprints FOR SELECT USING (((team_id IS NULL) OR orch_flow.is_team_member(auth.uid(), team_id)));


--
-- Name: shared_tasks Users can view tasks in their teams; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Users can view tasks in their teams" ON orch_flow.shared_tasks FOR SELECT USING (((team_id IS NULL) OR orch_flow.is_team_member(auth.uid(), team_id)));


--
-- Name: timer_state Users can view timer in their teams; Type: POLICY; Schema: orch_flow; Owner: postgres
--

CREATE POLICY "Users can view timer in their teams" ON orch_flow.timer_state FOR SELECT USING (((team_id IS NULL) OR orch_flow.is_team_member(auth.uid(), team_id)));


--
-- Name: channel_messages; Type: ROW SECURITY; Schema: orch_flow; Owner: postgres
--

ALTER TABLE orch_flow.channel_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: channels; Type: ROW SECURITY; Schema: orch_flow; Owner: postgres
--

ALTER TABLE orch_flow.channels ENABLE ROW LEVEL SECURITY;

--
-- Name: efforts; Type: ROW SECURITY; Schema: orch_flow; Owner: postgres
--

ALTER TABLE orch_flow.efforts ENABLE ROW LEVEL SECURITY;

--
-- Name: journey_templates; Type: ROW SECURITY; Schema: orch_flow; Owner: postgres
--

ALTER TABLE orch_flow.journey_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_progress; Type: ROW SECURITY; Schema: orch_flow; Owner: postgres
--

ALTER TABLE orch_flow.learning_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: orch_flow; Owner: postgres
--

ALTER TABLE orch_flow.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: orch_flow; Owner: postgres
--

ALTER TABLE orch_flow.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: projects; Type: ROW SECURITY; Schema: orch_flow; Owner: postgres
--

ALTER TABLE orch_flow.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: shared_tasks; Type: ROW SECURITY; Schema: orch_flow; Owner: postgres
--

ALTER TABLE orch_flow.shared_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: sprints; Type: ROW SECURITY; Schema: orch_flow; Owner: postgres
--

ALTER TABLE orch_flow.sprints ENABLE ROW LEVEL SECURITY;

--
-- Name: task_collaborators; Type: ROW SECURITY; Schema: orch_flow; Owner: postgres
--

ALTER TABLE orch_flow.task_collaborators ENABLE ROW LEVEL SECURITY;

--
-- Name: task_update_requests; Type: ROW SECURITY; Schema: orch_flow; Owner: postgres
--

ALTER TABLE orch_flow.task_update_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: task_watchers; Type: ROW SECURITY; Schema: orch_flow; Owner: postgres
--

ALTER TABLE orch_flow.task_watchers ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks; Type: ROW SECURITY; Schema: orch_flow; Owner: postgres
--

ALTER TABLE orch_flow.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: team_files; Type: ROW SECURITY; Schema: orch_flow; Owner: postgres
--

ALTER TABLE orch_flow.team_files ENABLE ROW LEVEL SECURITY;

--
-- Name: timer_state; Type: ROW SECURITY; Schema: orch_flow; Owner: postgres
--

ALTER TABLE orch_flow.timer_state ENABLE ROW LEVEL SECURITY;

--
-- Name: user_presence; Type: ROW SECURITY; Schema: orch_flow; Owner: postgres
--

ALTER TABLE orch_flow.user_presence ENABLE ROW LEVEL SECURITY;

--
-- Name: analyst_assessments; Type: ROW SECURITY; Schema: prediction; Owner: postgres
--

ALTER TABLE prediction.analyst_assessments ENABLE ROW LEVEL SECURITY;

--
-- Name: analyst_assessments analyst_assessments_read_policy; Type: POLICY; Schema: prediction; Owner: postgres
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
-- Name: analyst_assessments analyst_assessments_service_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY analyst_assessments_service_policy ON prediction.analyst_assessments TO service_role USING (true) WITH CHECK (true);


--
-- Name: analyst_overrides; Type: ROW SECURITY; Schema: prediction; Owner: postgres
--

ALTER TABLE prediction.analyst_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: analyst_overrides analyst_overrides_read_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY analyst_overrides_read_policy ON prediction.analyst_overrides FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM prediction.universes u
  WHERE ((u.id = COALESCE(analyst_overrides.universe_id, ( SELECT t.universe_id
           FROM prediction.targets t
          WHERE (t.id = analyst_overrides.target_id)))) AND prediction.user_has_org_access(u.organization_slug)))));


--
-- Name: analyst_overrides analyst_overrides_service_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY analyst_overrides_service_policy ON prediction.analyst_overrides TO service_role USING (true) WITH CHECK (true);


--
-- Name: analysts; Type: ROW SECURITY; Schema: prediction; Owner: postgres
--

ALTER TABLE prediction.analysts ENABLE ROW LEVEL SECURITY;

--
-- Name: analysts analysts_read_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY analysts_read_policy ON prediction.analysts FOR SELECT TO authenticated USING (((scope_level = ANY (ARRAY['runner'::text, 'domain'::text])) OR ((scope_level = ANY (ARRAY['universe'::text, 'target'::text])) AND (EXISTS ( SELECT 1
   FROM prediction.universes u
  WHERE ((u.id = analysts.universe_id) AND prediction.user_has_org_access(u.organization_slug)))))));


--
-- Name: analysts analysts_service_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY analysts_service_policy ON prediction.analysts TO service_role USING (true) WITH CHECK (true);


--
-- Name: evaluations; Type: ROW SECURITY; Schema: prediction; Owner: postgres
--

ALTER TABLE prediction.evaluations ENABLE ROW LEVEL SECURITY;

--
-- Name: evaluations evaluations_read_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY evaluations_read_policy ON prediction.evaluations FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((prediction.predictions p
     JOIN prediction.targets t ON ((p.target_id = t.id)))
     JOIN prediction.universes u ON ((t.universe_id = u.id)))
  WHERE ((p.id = evaluations.prediction_id) AND prediction.user_has_org_access(u.organization_slug)))));


--
-- Name: evaluations evaluations_service_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY evaluations_service_policy ON prediction.evaluations TO service_role USING (true) WITH CHECK (true);


--
-- Name: learning_queue; Type: ROW SECURITY; Schema: prediction; Owner: postgres
--

ALTER TABLE prediction.learning_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_queue learning_queue_read_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY learning_queue_read_policy ON prediction.learning_queue FOR SELECT TO authenticated USING (((suggested_scope_level = ANY (ARRAY['runner'::text, 'domain'::text])) OR ((suggested_scope_level = ANY (ARRAY['universe'::text, 'target'::text])) AND (EXISTS ( SELECT 1
   FROM prediction.universes u
  WHERE ((u.id = COALESCE(learning_queue.suggested_universe_id, ( SELECT t.universe_id
           FROM prediction.targets t
          WHERE (t.id = learning_queue.suggested_target_id)))) AND prediction.user_has_org_access(u.organization_slug)))))));


--
-- Name: learning_queue learning_queue_service_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY learning_queue_service_policy ON prediction.learning_queue TO service_role USING (true) WITH CHECK (true);


--
-- Name: learning_queue learning_queue_update_policy; Type: POLICY; Schema: prediction; Owner: postgres
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
-- Name: learnings; Type: ROW SECURITY; Schema: prediction; Owner: postgres
--

ALTER TABLE prediction.learnings ENABLE ROW LEVEL SECURITY;

--
-- Name: learnings learnings_read_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY learnings_read_policy ON prediction.learnings FOR SELECT TO authenticated USING (((scope_level = ANY (ARRAY['runner'::text, 'domain'::text])) OR ((scope_level = ANY (ARRAY['universe'::text, 'target'::text])) AND (EXISTS ( SELECT 1
   FROM prediction.universes u
  WHERE ((u.id = COALESCE(learnings.universe_id, ( SELECT t.universe_id
           FROM prediction.targets t
          WHERE (t.id = learnings.target_id)))) AND prediction.user_has_org_access(u.organization_slug)))))));


--
-- Name: learnings learnings_service_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY learnings_service_policy ON prediction.learnings TO service_role USING (true) WITH CHECK (true);


--
-- Name: missed_opportunities; Type: ROW SECURITY; Schema: prediction; Owner: postgres
--

ALTER TABLE prediction.missed_opportunities ENABLE ROW LEVEL SECURITY;

--
-- Name: missed_opportunities missed_opportunities_read_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY missed_opportunities_read_policy ON prediction.missed_opportunities FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (prediction.targets t
     JOIN prediction.universes u ON ((t.universe_id = u.id)))
  WHERE ((t.id = missed_opportunities.target_id) AND prediction.user_has_org_access(u.organization_slug)))));


--
-- Name: missed_opportunities missed_opportunities_service_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY missed_opportunities_service_policy ON prediction.missed_opportunities TO service_role USING (true) WITH CHECK (true);


--
-- Name: source_subscriptions prediction_source_subs_delete; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY prediction_source_subs_delete ON prediction.source_subscriptions FOR DELETE USING ((target_id IN ( SELECT t.id
   FROM (prediction.targets t
     JOIN prediction.universes u ON ((t.universe_id = u.id)))
  WHERE (u.organization_slug = current_setting('app.current_org'::text, true)))));


--
-- Name: source_subscriptions prediction_source_subs_insert; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY prediction_source_subs_insert ON prediction.source_subscriptions FOR INSERT WITH CHECK ((target_id IN ( SELECT t.id
   FROM (prediction.targets t
     JOIN prediction.universes u ON ((t.universe_id = u.id)))
  WHERE (u.organization_slug = current_setting('app.current_org'::text, true)))));


--
-- Name: source_subscriptions prediction_source_subs_read; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY prediction_source_subs_read ON prediction.source_subscriptions FOR SELECT USING ((target_id IN ( SELECT t.id
   FROM (prediction.targets t
     JOIN prediction.universes u ON ((t.universe_id = u.id)))
  WHERE (u.organization_slug = current_setting('app.current_org'::text, true)))));


--
-- Name: source_subscriptions prediction_source_subs_service_all; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY prediction_source_subs_service_all ON prediction.source_subscriptions TO service_role USING (true) WITH CHECK (true);


--
-- Name: source_subscriptions prediction_source_subs_update; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY prediction_source_subs_update ON prediction.source_subscriptions FOR UPDATE USING ((target_id IN ( SELECT t.id
   FROM (prediction.targets t
     JOIN prediction.universes u ON ((t.universe_id = u.id)))
  WHERE (u.organization_slug = current_setting('app.current_org'::text, true)))));


--
-- Name: predictions; Type: ROW SECURITY; Schema: prediction; Owner: postgres
--

ALTER TABLE prediction.predictions ENABLE ROW LEVEL SECURITY;

--
-- Name: predictions predictions_read_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY predictions_read_policy ON prediction.predictions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (prediction.targets t
     JOIN prediction.universes u ON ((t.universe_id = u.id)))
  WHERE ((t.id = predictions.target_id) AND prediction.user_has_org_access(u.organization_slug)))));


--
-- Name: predictions predictions_service_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY predictions_service_policy ON prediction.predictions TO service_role USING (true) WITH CHECK (true);


--
-- Name: predictors; Type: ROW SECURITY; Schema: prediction; Owner: postgres
--

ALTER TABLE prediction.predictors ENABLE ROW LEVEL SECURITY;

--
-- Name: predictors predictors_read_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY predictors_read_policy ON prediction.predictors FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (prediction.targets t
     JOIN prediction.universes u ON ((t.universe_id = u.id)))
  WHERE ((t.id = predictors.target_id) AND prediction.user_has_org_access(u.organization_slug)))));


--
-- Name: predictors predictors_service_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY predictors_service_policy ON prediction.predictors TO service_role USING (true) WITH CHECK (true);


--
-- Name: review_queue; Type: ROW SECURITY; Schema: prediction; Owner: postgres
--

ALTER TABLE prediction.review_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: review_queue review_queue_read_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY review_queue_read_policy ON prediction.review_queue FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((prediction.signals s
     JOIN prediction.targets t ON ((s.target_id = t.id)))
     JOIN prediction.universes u ON ((t.universe_id = u.id)))
  WHERE ((s.id = review_queue.signal_id) AND prediction.user_has_org_access(u.organization_slug)))));


--
-- Name: review_queue review_queue_service_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY review_queue_service_policy ON prediction.review_queue TO service_role USING (true) WITH CHECK (true);


--
-- Name: review_queue review_queue_update_policy; Type: POLICY; Schema: prediction; Owner: postgres
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
-- Name: signals; Type: ROW SECURITY; Schema: prediction; Owner: postgres
--

ALTER TABLE prediction.signals ENABLE ROW LEVEL SECURITY;

--
-- Name: signals signals_read_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY signals_read_policy ON prediction.signals FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (prediction.targets t
     JOIN prediction.universes u ON ((t.universe_id = u.id)))
  WHERE ((t.id = signals.target_id) AND prediction.user_has_org_access(u.organization_slug)))));


--
-- Name: signals signals_service_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY signals_service_policy ON prediction.signals TO service_role USING (true) WITH CHECK (true);


--
-- Name: snapshots; Type: ROW SECURITY; Schema: prediction; Owner: postgres
--

ALTER TABLE prediction.snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: snapshots snapshots_read_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY snapshots_read_policy ON prediction.snapshots FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((prediction.predictions p
     JOIN prediction.targets t ON ((p.target_id = t.id)))
     JOIN prediction.universes u ON ((t.universe_id = u.id)))
  WHERE ((p.id = snapshots.prediction_id) AND prediction.user_has_org_access(u.organization_slug)))));


--
-- Name: snapshots snapshots_service_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY snapshots_service_policy ON prediction.snapshots TO service_role USING (true) WITH CHECK (true);


--
-- Name: source_subscriptions; Type: ROW SECURITY; Schema: prediction; Owner: postgres
--

ALTER TABLE prediction.source_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: strategies; Type: ROW SECURITY; Schema: prediction; Owner: postgres
--

ALTER TABLE prediction.strategies ENABLE ROW LEVEL SECURITY;

--
-- Name: strategies strategies_read_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY strategies_read_policy ON prediction.strategies FOR SELECT TO authenticated USING (true);


--
-- Name: strategies strategies_service_write_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY strategies_service_write_policy ON prediction.strategies TO service_role USING (true) WITH CHECK (true);


--
-- Name: target_snapshots; Type: ROW SECURITY; Schema: prediction; Owner: postgres
--

ALTER TABLE prediction.target_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: target_snapshots target_snapshots_read_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY target_snapshots_read_policy ON prediction.target_snapshots FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (prediction.targets t
     JOIN prediction.universes u ON ((t.universe_id = u.id)))
  WHERE ((t.id = target_snapshots.target_id) AND prediction.user_has_org_access(u.organization_slug)))));


--
-- Name: target_snapshots target_snapshots_service_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY target_snapshots_service_policy ON prediction.target_snapshots TO service_role USING (true) WITH CHECK (true);


--
-- Name: targets; Type: ROW SECURITY; Schema: prediction; Owner: postgres
--

ALTER TABLE prediction.targets ENABLE ROW LEVEL SECURITY;

--
-- Name: targets targets_read_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY targets_read_policy ON prediction.targets FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM prediction.universes u
  WHERE ((u.id = targets.universe_id) AND prediction.user_has_org_access(u.organization_slug)))));


--
-- Name: targets targets_service_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY targets_service_policy ON prediction.targets TO service_role USING (true) WITH CHECK (true);


--
-- Name: targets targets_write_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY targets_write_policy ON prediction.targets TO authenticated USING ((EXISTS ( SELECT 1
   FROM prediction.universes u
  WHERE ((u.id = targets.universe_id) AND prediction.user_has_org_access(u.organization_slug))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM prediction.universes u
  WHERE ((u.id = targets.universe_id) AND prediction.user_has_org_access(u.organization_slug)))));


--
-- Name: test_scenarios; Type: ROW SECURITY; Schema: prediction; Owner: postgres
--

ALTER TABLE prediction.test_scenarios ENABLE ROW LEVEL SECURITY;

--
-- Name: test_scenarios test_scenarios_org_isolation; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY test_scenarios_org_isolation ON prediction.test_scenarios USING ((organization_slug = current_setting('app.current_org'::text, true)));


--
-- Name: tool_requests; Type: ROW SECURITY; Schema: prediction; Owner: postgres
--

ALTER TABLE prediction.tool_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: tool_requests tool_requests_read_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY tool_requests_read_policy ON prediction.tool_requests FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM prediction.universes u
  WHERE ((u.id = tool_requests.universe_id) AND prediction.user_has_org_access(u.organization_slug)))));


--
-- Name: tool_requests tool_requests_service_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY tool_requests_service_policy ON prediction.tool_requests TO service_role USING (true) WITH CHECK (true);


--
-- Name: tool_requests tool_requests_write_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY tool_requests_write_policy ON prediction.tool_requests TO authenticated USING ((EXISTS ( SELECT 1
   FROM prediction.universes u
  WHERE ((u.id = tool_requests.universe_id) AND prediction.user_has_org_access(u.organization_slug))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM prediction.universes u
  WHERE ((u.id = tool_requests.universe_id) AND prediction.user_has_org_access(u.organization_slug)))));


--
-- Name: universes; Type: ROW SECURITY; Schema: prediction; Owner: postgres
--

ALTER TABLE prediction.universes ENABLE ROW LEVEL SECURITY;

--
-- Name: universes universes_delete_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY universes_delete_policy ON prediction.universes FOR DELETE TO authenticated USING (prediction.user_has_org_access(organization_slug));


--
-- Name: universes universes_insert_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY universes_insert_policy ON prediction.universes FOR INSERT TO authenticated WITH CHECK (prediction.user_has_org_access(organization_slug));


--
-- Name: universes universes_read_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY universes_read_policy ON prediction.universes FOR SELECT TO authenticated USING (prediction.user_has_org_access(organization_slug));


--
-- Name: universes universes_service_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY universes_service_policy ON prediction.universes TO service_role USING (true) WITH CHECK (true);


--
-- Name: universes universes_update_policy; Type: POLICY; Schema: prediction; Owner: postgres
--

CREATE POLICY universes_update_policy ON prediction.universes FOR UPDATE TO authenticated USING (prediction.user_has_org_access(organization_slug)) WITH CHECK (prediction.user_has_org_access(organization_slug));


--
-- Name: team_members Admins can add team members; Type: POLICY; Schema: public; Owner: postgres
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
-- Name: teams Admins can create teams; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can create teams" ON public.teams FOR INSERT WITH CHECK ((((org_slug IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (authz.rbac_user_org_roles uor
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((uor.user_id = auth.uid()) AND (((uor.organization_slug)::text = teams.org_slug) OR ((uor.organization_slug)::text = '*'::text)) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now())))))) OR ((org_slug IS NULL) AND (EXISTS ( SELECT 1
   FROM (authz.rbac_user_org_roles uor
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((uor.user_id = auth.uid()) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now()))))))));


--
-- Name: teams Admins can delete teams; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can delete teams" ON public.teams FOR DELETE USING (((created_by = auth.uid()) OR ((org_slug IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (authz.rbac_user_org_roles uor
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((uor.user_id = auth.uid()) AND (((uor.organization_slug)::text = teams.org_slug) OR ((uor.organization_slug)::text = '*'::text)) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now())))))) OR ((org_slug IS NULL) AND (EXISTS ( SELECT 1
   FROM (authz.rbac_user_org_roles uor
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((uor.user_id = auth.uid()) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now()))))))));


--
-- Name: team_members Admins can remove team members or self-remove; Type: POLICY; Schema: public; Owner: postgres
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
-- Name: team_members Admins can update team members; Type: POLICY; Schema: public; Owner: postgres
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
-- Name: teams Admins can update teams; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can update teams" ON public.teams FOR UPDATE USING (((created_by = auth.uid()) OR ((org_slug IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (authz.rbac_user_org_roles uor
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((uor.user_id = auth.uid()) AND (((uor.organization_slug)::text = teams.org_slug) OR ((uor.organization_slug)::text = '*'::text)) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now())))))) OR ((org_slug IS NULL) AND (EXISTS ( SELECT 1
   FROM (authz.rbac_user_org_roles uor
     JOIN authz.rbac_roles r ON ((uor.role_id = r.id)))
  WHERE ((uor.user_id = auth.uid()) AND ((r.name)::text = ANY (ARRAY[('admin'::character varying)::text, ('super-admin'::character varying)::text])) AND ((uor.expires_at IS NULL) OR (uor.expires_at > now()))))))));


--
-- Name: channel_message_log Service role full access to channel_message_log; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role full access to channel_message_log" ON public.channel_message_log USING ((auth.role() = 'service_role'::text));


--
-- Name: channel_users Service role full access to channel_users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role full access to channel_users" ON public.channel_users USING ((auth.role() = 'service_role'::text));


--
-- Name: agents Users can read agents in their organizations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can read agents in their organizations" ON public.agents FOR SELECT USING (true);


--
-- Name: organizations Users can read their organizations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can read their organizations" ON public.organizations FOR SELECT USING (true);


--
-- Name: teams Users can view accessible teams; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view accessible teams" ON public.teams FOR SELECT USING (((id IN ( SELECT team_members.team_id
   FROM public.team_members
  WHERE (team_members.user_id = auth.uid()))) OR ((org_slug IS NOT NULL) AND (org_slug IN ( SELECT rbac_user_org_roles.organization_slug
   FROM authz.rbac_user_org_roles
  WHERE ((rbac_user_org_roles.user_id = auth.uid()) AND ((rbac_user_org_roles.expires_at IS NULL) OR (rbac_user_org_roles.expires_at > now())))))) OR (EXISTS ( SELECT 1
   FROM authz.rbac_user_org_roles
  WHERE ((rbac_user_org_roles.user_id = auth.uid()) AND ((rbac_user_org_roles.organization_slug)::text = '*'::text) AND ((rbac_user_org_roles.expires_at IS NULL) OR (rbac_user_org_roles.expires_at > now())))))));


--
-- Name: team_members Users can view team members; Type: POLICY; Schema: public; Owner: postgres
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
-- Name: channel_users Users can view their own channel identities; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own channel identities" ON public.channel_users FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: agent_pipelines; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.agent_pipelines ENABLE ROW LEVEL SECURITY;

--
-- Name: agents; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

--
-- Name: channel_message_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.channel_message_log ENABLE ROW LEVEL SECURITY;

--
-- Name: channel_users; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.channel_users ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: pseudonym_mappings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.pseudonym_mappings ENABLE ROW LEVEL SECURITY;

--
-- Name: redaction_audit_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.redaction_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: pseudonym_mappings service_role_all_pseudonym_mappings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY service_role_all_pseudonym_mappings ON public.pseudonym_mappings TO service_role USING (true) WITH CHECK (true);


--
-- Name: redaction_audit_log service_role_all_redaction_audit_log; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY service_role_all_redaction_audit_log ON public.redaction_audit_log TO service_role USING (true) WITH CHECK (true);


--
-- Name: team_members; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

--
-- Name: teams; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

--
-- Name: data_source_fetch_history; Type: ROW SECURITY; Schema: risk; Owner: postgres
--

ALTER TABLE risk.data_source_fetch_history ENABLE ROW LEVEL SECURITY;

--
-- Name: data_sources; Type: ROW SECURITY; Schema: risk; Owner: postgres
--

ALTER TABLE risk.data_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: source_subscriptions risk_source_subs_delete; Type: POLICY; Schema: risk; Owner: postgres
--

CREATE POLICY risk_source_subs_delete ON risk.source_subscriptions FOR DELETE USING ((scope_id IN ( SELECT scopes.id
   FROM risk.scopes
  WHERE (scopes.organization_slug = current_setting('app.current_org'::text, true)))));


--
-- Name: source_subscriptions risk_source_subs_insert; Type: POLICY; Schema: risk; Owner: postgres
--

CREATE POLICY risk_source_subs_insert ON risk.source_subscriptions FOR INSERT WITH CHECK ((scope_id IN ( SELECT scopes.id
   FROM risk.scopes
  WHERE (scopes.organization_slug = current_setting('app.current_org'::text, true)))));


--
-- Name: source_subscriptions risk_source_subs_read; Type: POLICY; Schema: risk; Owner: postgres
--

CREATE POLICY risk_source_subs_read ON risk.source_subscriptions FOR SELECT USING ((scope_id IN ( SELECT scopes.id
   FROM risk.scopes
  WHERE (scopes.organization_slug = current_setting('app.current_org'::text, true)))));


--
-- Name: source_subscriptions risk_source_subs_service_all; Type: POLICY; Schema: risk; Owner: postgres
--

CREATE POLICY risk_source_subs_service_all ON risk.source_subscriptions TO service_role USING (true) WITH CHECK (true);


--
-- Name: source_subscriptions risk_source_subs_update; Type: POLICY; Schema: risk; Owner: postgres
--

CREATE POLICY risk_source_subs_update ON risk.source_subscriptions FOR UPDATE USING ((scope_id IN ( SELECT scopes.id
   FROM risk.scopes
  WHERE (scopes.organization_slug = current_setting('app.current_org'::text, true)))));


--
-- Name: simulations; Type: ROW SECURITY; Schema: risk; Owner: postgres
--

ALTER TABLE risk.simulations ENABLE ROW LEVEL SECURITY;

--
-- Name: source_subscriptions; Type: ROW SECURITY; Schema: risk; Owner: postgres
--

ALTER TABLE risk.source_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_definition_links; Type: ROW SECURITY; Schema: workflows; Owner: postgres
--

ALTER TABLE workflows.agent_definition_links ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_definition_org_overrides; Type: ROW SECURITY; Schema: workflows; Owner: postgres
--

ALTER TABLE workflows.agent_definition_org_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_definition_override_history; Type: ROW SECURITY; Schema: workflows; Owner: postgres
--

ALTER TABLE workflows.agent_definition_override_history ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_definition_versions; Type: ROW SECURITY; Schema: workflows; Owner: postgres
--

ALTER TABLE workflows.agent_definition_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_definitions; Type: ROW SECURITY; Schema: workflows; Owner: postgres
--

ALTER TABLE workflows.agent_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: group_items; Type: ROW SECURITY; Schema: workflows; Owner: postgres
--

ALTER TABLE workflows.group_items ENABLE ROW LEVEL SECURITY;

--
-- Name: groups; Type: ROW SECURITY; Schema: workflows; Owner: postgres
--

ALTER TABLE workflows.groups ENABLE ROW LEVEL SECURITY;

--
-- Name: human_reviews; Type: ROW SECURITY; Schema: workflows; Owner: postgres
--

ALTER TABLE workflows.human_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: improvement_requests; Type: ROW SECURITY; Schema: workflows; Owner: postgres
--

ALTER TABLE workflows.improvement_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: issue_ledger; Type: ROW SECURITY; Schema: workflows; Owner: postgres
--

ALTER TABLE workflows.issue_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: issue_ledger_events; Type: ROW SECURITY; Schema: workflows; Owner: postgres
--

ALTER TABLE workflows.issue_ledger_events ENABLE ROW LEVEL SECURITY;

--
-- Name: model_profiles; Type: ROW SECURITY; Schema: workflows; Owner: postgres
--

ALTER TABLE workflows.model_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: org_settings; Type: ROW SECURITY; Schema: workflows; Owner: postgres
--

ALTER TABLE workflows.org_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: participant_runs; Type: ROW SECURITY; Schema: workflows; Owner: postgres
--

ALTER TABLE workflows.participant_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: registry; Type: ROW SECURITY; Schema: workflows; Owner: postgres
--

ALTER TABLE workflows.registry ENABLE ROW LEVEL SECURITY;

--
-- Name: runs; Type: ROW SECURITY; Schema: workflows; Owner: postgres
--

ALTER TABLE workflows.runs ENABLE ROW LEVEL SECURITY;

--
-- Name: trace_reviews; Type: ROW SECURITY; Schema: workflows; Owner: postgres
--

ALTER TABLE workflows.trace_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: work_unit_runs; Type: ROW SECURITY; Schema: workflows; Owner: postgres
--

ALTER TABLE workflows.work_unit_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA authz; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA authz TO anon;
GRANT USAGE ON SCHEMA authz TO authenticated;
GRANT USAGE ON SCHEMA authz TO service_role;


--
-- Name: SCHEMA hr; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA hr TO service_role;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION rbac_get_organization_users(p_organization_slug character varying); Type: ACL; Schema: authz; Owner: postgres
--

GRANT ALL ON FUNCTION authz.rbac_get_organization_users(p_organization_slug character varying) TO anon;
GRANT ALL ON FUNCTION authz.rbac_get_organization_users(p_organization_slug character varying) TO authenticated;
GRANT ALL ON FUNCTION authz.rbac_get_organization_users(p_organization_slug character varying) TO service_role;


--
-- Name: FUNCTION rbac_get_user_organizations(p_user_id uuid); Type: ACL; Schema: authz; Owner: postgres
--

GRANT ALL ON FUNCTION authz.rbac_get_user_organizations(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION authz.rbac_get_user_organizations(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION authz.rbac_get_user_organizations(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION rbac_get_user_permissions(p_user_id uuid, p_organization_slug character varying); Type: ACL; Schema: authz; Owner: postgres
--

GRANT ALL ON FUNCTION authz.rbac_get_user_permissions(p_user_id uuid, p_organization_slug character varying) TO anon;
GRANT ALL ON FUNCTION authz.rbac_get_user_permissions(p_user_id uuid, p_organization_slug character varying) TO authenticated;
GRANT ALL ON FUNCTION authz.rbac_get_user_permissions(p_user_id uuid, p_organization_slug character varying) TO service_role;


--
-- Name: FUNCTION rbac_get_user_roles(p_user_id uuid, p_organization_slug character varying); Type: ACL; Schema: authz; Owner: postgres
--

GRANT ALL ON FUNCTION authz.rbac_get_user_roles(p_user_id uuid, p_organization_slug character varying) TO anon;
GRANT ALL ON FUNCTION authz.rbac_get_user_roles(p_user_id uuid, p_organization_slug character varying) TO authenticated;
GRANT ALL ON FUNCTION authz.rbac_get_user_roles(p_user_id uuid, p_organization_slug character varying) TO service_role;


--
-- Name: FUNCTION rbac_has_permission(p_user_id uuid, p_organization_slug character varying, p_permission character varying, p_resource_type character varying, p_resource_id uuid); Type: ACL; Schema: authz; Owner: postgres
--

GRANT ALL ON FUNCTION authz.rbac_has_permission(p_user_id uuid, p_organization_slug character varying, p_permission character varying, p_resource_type character varying, p_resource_id uuid) TO anon;
GRANT ALL ON FUNCTION authz.rbac_has_permission(p_user_id uuid, p_organization_slug character varying, p_permission character varying, p_resource_type character varying, p_resource_id uuid) TO authenticated;
GRANT ALL ON FUNCTION authz.rbac_has_permission(p_user_id uuid, p_organization_slug character varying, p_permission character varying, p_resource_type character varying, p_resource_id uuid) TO service_role;


--
-- Name: FUNCTION update_rbac_roles_updated_at(); Type: ACL; Schema: authz; Owner: postgres
--

GRANT ALL ON FUNCTION authz.update_rbac_roles_updated_at() TO anon;
GRANT ALL ON FUNCTION authz.update_rbac_roles_updated_at() TO authenticated;
GRANT ALL ON FUNCTION authz.update_rbac_roles_updated_at() TO service_role;


--
-- Name: FUNCTION update_users_updated_at(); Type: ACL; Schema: authz; Owner: postgres
--

GRANT ALL ON FUNCTION authz.update_users_updated_at() TO anon;
GRANT ALL ON FUNCTION authz.update_users_updated_at() TO authenticated;
GRANT ALL ON FUNCTION authz.update_users_updated_at() TO service_role;


--
-- Name: FUNCTION cleanup_expired_pii_mappings(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.cleanup_expired_pii_mappings() TO anon;
GRANT ALL ON FUNCTION public.cleanup_expired_pii_mappings() TO authenticated;
GRANT ALL ON FUNCTION public.cleanup_expired_pii_mappings() TO service_role;


--
-- Name: FUNCTION decrypt_pii_value(ciphertext bytea); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.decrypt_pii_value(ciphertext bytea) TO anon;
GRANT ALL ON FUNCTION public.decrypt_pii_value(ciphertext bytea) TO authenticated;
GRANT ALL ON FUNCTION public.decrypt_pii_value(ciphertext bytea) TO service_role;


--
-- Name: FUNCTION delete_user_pii_data(p_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.delete_user_pii_data(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.delete_user_pii_data(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_user_pii_data(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION encrypt_pii_value(plaintext text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.encrypt_pii_value(plaintext text) TO anon;
GRANT ALL ON FUNCTION public.encrypt_pii_value(plaintext text) TO authenticated;
GRANT ALL ON FUNCTION public.encrypt_pii_value(plaintext text) TO service_role;


--
-- Name: FUNCTION extend_pii_expiration(p_id uuid, p_extension_days integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.extend_pii_expiration(p_id uuid, p_extension_days integer) TO anon;
GRANT ALL ON FUNCTION public.extend_pii_expiration(p_id uuid, p_extension_days integer) TO authenticated;
GRANT ALL ON FUNCTION public.extend_pii_expiration(p_id uuid, p_extension_days integer) TO service_role;


--
-- Name: FUNCTION get_global_model_config(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_global_model_config() TO anon;
GRANT ALL ON FUNCTION public.get_global_model_config() TO authenticated;
GRANT ALL ON FUNCTION public.get_global_model_config() TO service_role;


--
-- Name: FUNCTION get_team_member_count(p_team_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_team_member_count(p_team_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_team_member_count(p_team_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_team_member_count(p_team_id uuid) TO service_role;


--
-- Name: FUNCTION get_user_teams(p_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_user_teams(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_user_teams(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_user_teams(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION rbac_get_organization_users(p_organization_slug character varying); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.rbac_get_organization_users(p_organization_slug character varying) TO anon;
GRANT ALL ON FUNCTION public.rbac_get_organization_users(p_organization_slug character varying) TO authenticated;
GRANT ALL ON FUNCTION public.rbac_get_organization_users(p_organization_slug character varying) TO service_role;


--
-- Name: FUNCTION rbac_get_user_organizations(p_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.rbac_get_user_organizations(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.rbac_get_user_organizations(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rbac_get_user_organizations(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION set_pseudonym_mappings_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_pseudonym_mappings_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_pseudonym_mappings_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_pseudonym_mappings_updated_at() TO service_role;


--
-- Name: FUNCTION set_teams_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_teams_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_teams_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_teams_updated_at() TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: FUNCTION update_auth_identity_links_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_auth_identity_links_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_auth_identity_links_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_auth_identity_links_updated_at() TO service_role;


--
-- Name: FUNCTION update_llm_models_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_llm_models_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_llm_models_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_llm_models_updated_at() TO service_role;


--
-- Name: FUNCTION update_llm_providers_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_llm_providers_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_llm_providers_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_llm_providers_updated_at() TO service_role;


--
-- Name: FUNCTION update_redaction_patterns_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_redaction_patterns_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_redaction_patterns_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_redaction_patterns_updated_at() TO service_role;


--
-- Name: TABLE auth_identity_links; Type: ACL; Schema: authz; Owner: postgres
--

GRANT ALL ON TABLE authz.auth_identity_links TO anon;
GRANT ALL ON TABLE authz.auth_identity_links TO authenticated;
GRANT ALL ON TABLE authz.auth_identity_links TO service_role;


--
-- Name: TABLE org_entitlements; Type: ACL; Schema: authz; Owner: postgres
--

GRANT ALL ON TABLE authz.org_entitlements TO anon;
GRANT ALL ON TABLE authz.org_entitlements TO authenticated;
GRANT ALL ON TABLE authz.org_entitlements TO service_role;


--
-- Name: TABLE organizations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.organizations TO anon;
GRANT ALL ON TABLE public.organizations TO authenticated;
GRANT ALL ON TABLE public.organizations TO service_role;


--
-- Name: TABLE organizations; Type: ACL; Schema: authz; Owner: postgres
--

GRANT ALL ON TABLE authz.organizations TO anon;
GRANT ALL ON TABLE authz.organizations TO authenticated;
GRANT ALL ON TABLE authz.organizations TO service_role;


--
-- Name: TABLE rbac_audit_log; Type: ACL; Schema: authz; Owner: postgres
--

GRANT ALL ON TABLE authz.rbac_audit_log TO anon;
GRANT ALL ON TABLE authz.rbac_audit_log TO authenticated;
GRANT ALL ON TABLE authz.rbac_audit_log TO service_role;


--
-- Name: TABLE rbac_permissions; Type: ACL; Schema: authz; Owner: postgres
--

GRANT ALL ON TABLE authz.rbac_permissions TO anon;
GRANT ALL ON TABLE authz.rbac_permissions TO authenticated;
GRANT ALL ON TABLE authz.rbac_permissions TO service_role;


--
-- Name: TABLE rbac_role_permissions; Type: ACL; Schema: authz; Owner: postgres
--

GRANT ALL ON TABLE authz.rbac_role_permissions TO anon;
GRANT ALL ON TABLE authz.rbac_role_permissions TO authenticated;
GRANT ALL ON TABLE authz.rbac_role_permissions TO service_role;


--
-- Name: TABLE rbac_roles; Type: ACL; Schema: authz; Owner: postgres
--

GRANT ALL ON TABLE authz.rbac_roles TO anon;
GRANT ALL ON TABLE authz.rbac_roles TO authenticated;
GRANT ALL ON TABLE authz.rbac_roles TO service_role;


--
-- Name: TABLE rbac_user_org_roles; Type: ACL; Schema: authz; Owner: postgres
--

GRANT ALL ON TABLE authz.rbac_user_org_roles TO anon;
GRANT ALL ON TABLE authz.rbac_user_org_roles TO authenticated;
GRANT ALL ON TABLE authz.rbac_user_org_roles TO service_role;


--
-- Name: TABLE team_members; Type: ACL; Schema: authz; Owner: postgres
--

GRANT ALL ON TABLE authz.team_members TO anon;
GRANT ALL ON TABLE authz.team_members TO authenticated;
GRANT ALL ON TABLE authz.team_members TO service_role;


--
-- Name: TABLE teams; Type: ACL; Schema: authz; Owner: postgres
--

GRANT ALL ON TABLE authz.teams TO anon;
GRANT ALL ON TABLE authz.teams TO authenticated;
GRANT ALL ON TABLE authz.teams TO service_role;


--
-- Name: TABLE users; Type: ACL; Schema: authz; Owner: postgres
--

GRANT ALL ON TABLE authz.users TO anon;
GRANT ALL ON TABLE authz.users TO authenticated;
GRANT ALL ON TABLE authz.users TO service_role;


--
-- Name: TABLE new_hires; Type: ACL; Schema: hr; Owner: postgres
--

GRANT SELECT ON TABLE hr.new_hires TO service_role;


--
-- Name: TABLE agent_pipelines; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.agent_pipelines TO service_role;


--
-- Name: TABLE agents; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.agents TO anon;
GRANT ALL ON TABLE public.agents TO authenticated;
GRANT ALL ON TABLE public.agents TO service_role;


--
-- Name: TABLE assets; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.assets TO anon;
GRANT ALL ON TABLE public.assets TO authenticated;
GRANT ALL ON TABLE public.assets TO service_role;


--
-- Name: TABLE auth_identity_links; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.auth_identity_links TO anon;
GRANT ALL ON TABLE public.auth_identity_links TO authenticated;
GRANT ALL ON TABLE public.auth_identity_links TO service_role;


--
-- Name: TABLE channel_message_log; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.channel_message_log TO anon;
GRANT ALL ON TABLE public.channel_message_log TO authenticated;
GRANT ALL ON TABLE public.channel_message_log TO service_role;


--
-- Name: TABLE channel_users; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.channel_users TO anon;
GRANT ALL ON TABLE public.channel_users TO authenticated;
GRANT ALL ON TABLE public.channel_users TO service_role;


--
-- Name: TABLE checkpoint_blobs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.checkpoint_blobs TO anon;
GRANT ALL ON TABLE public.checkpoint_blobs TO authenticated;
GRANT ALL ON TABLE public.checkpoint_blobs TO service_role;


--
-- Name: TABLE checkpoint_migrations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.checkpoint_migrations TO anon;
GRANT ALL ON TABLE public.checkpoint_migrations TO authenticated;
GRANT ALL ON TABLE public.checkpoint_migrations TO service_role;


--
-- Name: TABLE checkpoint_writes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.checkpoint_writes TO anon;
GRANT ALL ON TABLE public.checkpoint_writes TO authenticated;
GRANT ALL ON TABLE public.checkpoint_writes TO service_role;


--
-- Name: TABLE checkpoints; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.checkpoints TO anon;
GRANT ALL ON TABLE public.checkpoints TO authenticated;
GRANT ALL ON TABLE public.checkpoints TO service_role;


--
-- Name: TABLE cidafm_commands; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.cidafm_commands TO anon;
GRANT ALL ON TABLE public.cidafm_commands TO authenticated;
GRANT ALL ON TABLE public.cidafm_commands TO service_role;


--
-- Name: TABLE conversation_messages; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.conversation_messages TO anon;
GRANT ALL ON TABLE public.conversation_messages TO authenticated;
GRANT ALL ON TABLE public.conversation_messages TO service_role;


--
-- Name: TABLE conversations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.conversations TO anon;
GRANT ALL ON TABLE public.conversations TO authenticated;
GRANT ALL ON TABLE public.conversations TO service_role;


--
-- Name: TABLE tasks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.tasks TO anon;
GRANT ALL ON TABLE public.tasks TO authenticated;
GRANT ALL ON TABLE public.tasks TO service_role;


--
-- Name: TABLE conversations_with_stats; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.conversations_with_stats TO anon;
GRANT ALL ON TABLE public.conversations_with_stats TO authenticated;
GRANT ALL ON TABLE public.conversations_with_stats TO service_role;


--
-- Name: TABLE deliverable_versions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.deliverable_versions TO anon;
GRANT ALL ON TABLE public.deliverable_versions TO authenticated;
GRANT ALL ON TABLE public.deliverable_versions TO service_role;


--
-- Name: TABLE deliverables; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.deliverables TO anon;
GRANT ALL ON TABLE public.deliverables TO authenticated;
GRANT ALL ON TABLE public.deliverables TO service_role;


--
-- Name: TABLE installed_modules; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.installed_modules TO anon;
GRANT ALL ON TABLE public.installed_modules TO authenticated;
GRANT ALL ON TABLE public.installed_modules TO service_role;


--
-- Name: TABLE llm_fabric_node_reports; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.llm_fabric_node_reports TO anon;
GRANT ALL ON TABLE public.llm_fabric_node_reports TO authenticated;
GRANT ALL ON TABLE public.llm_fabric_node_reports TO service_role;


--
-- Name: TABLE llm_fabric_routing_decisions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.llm_fabric_routing_decisions TO anon;
GRANT ALL ON TABLE public.llm_fabric_routing_decisions TO authenticated;
GRANT ALL ON TABLE public.llm_fabric_routing_decisions TO service_role;


--
-- Name: TABLE llm_fabric_routing_policies; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.llm_fabric_routing_policies TO anon;
GRANT ALL ON TABLE public.llm_fabric_routing_policies TO authenticated;
GRANT ALL ON TABLE public.llm_fabric_routing_policies TO service_role;


--
-- Name: TABLE llm_models; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.llm_models TO anon;
GRANT ALL ON TABLE public.llm_models TO authenticated;
GRANT ALL ON TABLE public.llm_models TO service_role;


--
-- Name: TABLE llm_providers; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.llm_providers TO anon;
GRANT ALL ON TABLE public.llm_providers TO authenticated;
GRANT ALL ON TABLE public.llm_providers TO service_role;


--
-- Name: TABLE llm_usage; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.llm_usage TO anon;
GRANT ALL ON TABLE public.llm_usage TO authenticated;
GRANT ALL ON TABLE public.llm_usage TO service_role;


--
-- Name: TABLE observability_events; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.observability_events TO anon;
GRANT ALL ON TABLE public.observability_events TO authenticated;
GRANT ALL ON TABLE public.observability_events TO service_role;


--
-- Name: SEQUENCE observability_events_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.observability_events_id_seq TO anon;
GRANT ALL ON SEQUENCE public.observability_events_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.observability_events_id_seq TO service_role;


--
-- Name: TABLE organization_credentials; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.organization_credentials TO anon;
GRANT ALL ON TABLE public.organization_credentials TO authenticated;
GRANT ALL ON TABLE public.organization_credentials TO service_role;


--
-- Name: TABLE plan_deliverables; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.plan_deliverables TO anon;
GRANT ALL ON TABLE public.plan_deliverables TO authenticated;
GRANT ALL ON TABLE public.plan_deliverables TO service_role;


--
-- Name: TABLE plan_versions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.plan_versions TO anon;
GRANT ALL ON TABLE public.plan_versions TO authenticated;
GRANT ALL ON TABLE public.plan_versions TO service_role;


--
-- Name: TABLE plans; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.plans TO anon;
GRANT ALL ON TABLE public.plans TO authenticated;
GRANT ALL ON TABLE public.plans TO service_role;


--
-- Name: TABLE pseudonym_dictionaries; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.pseudonym_dictionaries TO anon;
GRANT ALL ON TABLE public.pseudonym_dictionaries TO authenticated;
GRANT ALL ON TABLE public.pseudonym_dictionaries TO service_role;


--
-- Name: TABLE pseudonym_mappings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.pseudonym_mappings TO anon;
GRANT ALL ON TABLE public.pseudonym_mappings TO authenticated;
GRANT ALL ON TABLE public.pseudonym_mappings TO service_role;


--
-- Name: TABLE redaction_audit_log; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.redaction_audit_log TO anon;
GRANT ALL ON TABLE public.redaction_audit_log TO authenticated;
GRANT ALL ON TABLE public.redaction_audit_log TO service_role;


--
-- Name: TABLE redaction_patterns; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.redaction_patterns TO anon;
GRANT ALL ON TABLE public.redaction_patterns TO authenticated;
GRANT ALL ON TABLE public.redaction_patterns TO service_role;


--
-- Name: TABLE system_settings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.system_settings TO anon;
GRANT ALL ON TABLE public.system_settings TO authenticated;
GRANT ALL ON TABLE public.system_settings TO service_role;


--
-- Name: TABLE task_messages; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.task_messages TO anon;
GRANT ALL ON TABLE public.task_messages TO authenticated;
GRANT ALL ON TABLE public.task_messages TO service_role;


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
-- Name: TABLE user_cidafm_commands; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_cidafm_commands TO anon;
GRANT ALL ON TABLE public.user_cidafm_commands TO authenticated;
GRANT ALL ON TABLE public.user_cidafm_commands TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: authz; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA authz GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA authz GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA authz GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA authz GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: authz; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA authz GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA authz GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA authz GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA authz GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: authz; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA authz GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA authz GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA authz GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA authz GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: authz; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA authz GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA authz GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA authz GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA authz GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: authz; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA authz GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA authz GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA authz GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA authz GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: authz; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA authz GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA authz GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA authz GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA authz GRANT ALL ON TABLES TO service_role;


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


ALTER PUBLICATION supabase_realtime ADD TABLE hr.new_hires;
