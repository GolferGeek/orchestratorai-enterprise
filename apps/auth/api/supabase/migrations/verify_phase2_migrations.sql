-- =====================================================================================
-- PREDICTION SYSTEM - PHASE 2: VERIFICATION SCRIPT
-- =====================================================================================
-- Description: Verifies all Phase 2 migrations were applied correctly
-- Run: docker exec supabase_db_api-dev psql -U postgres -d postgres -f verify_phase2_migrations.sql
-- =====================================================================================

\echo ''
\echo '========================================================================'
\echo 'PHASE 2 MIGRATION VERIFICATION'
\echo '========================================================================'
\echo ''

-- =====================================================================================
-- CHECK 1: Tables Created
-- =====================================================================================
\echo '1. Checking tables created...'
\echo '------------------------------------------------------------------------'

SELECT
  CASE
    WHEN COUNT(*) = 8 THEN '✓ All 8 tables created'
    ELSE '✗ Expected 8 tables, found ' || COUNT(*)::TEXT
  END AS status
FROM information_schema.tables
WHERE table_schema = 'prediction'
  AND table_name IN (
    'analysts',
    'analyst_overrides',
    'analyst_assessments',
    'learnings',
    'learning_queue',
    'review_queue',
    'source_crawls',
    'source_seen_items'
  );

\echo ''
\echo 'Table details:'
SELECT table_name,
       (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'prediction' AND columns.table_name = tables.table_name) as column_count
FROM information_schema.tables
WHERE table_schema = 'prediction'
  AND table_name IN (
    'analysts',
    'analyst_overrides',
    'analyst_assessments',
    'learnings',
    'learning_queue',
    'review_queue',
    'source_crawls',
    'source_seen_items'
  )
ORDER BY table_name;

-- =====================================================================================
-- CHECK 2: Indexes Created
-- =====================================================================================
\echo ''
\echo '2. Checking indexes created...'
\echo '------------------------------------------------------------------------'

SELECT
  schemaname,
  tablename,
  COUNT(*) as index_count
FROM pg_indexes
WHERE schemaname = 'prediction'
  AND tablename IN (
    'analysts',
    'analyst_overrides',
    'analyst_assessments',
    'learnings',
    'learning_queue',
    'review_queue',
    'source_crawls',
    'source_seen_items'
  )
GROUP BY schemaname, tablename
ORDER BY tablename;

-- =====================================================================================
-- CHECK 3: Functions Created
-- =====================================================================================
\echo ''
\echo '3. Checking functions created...'
\echo '------------------------------------------------------------------------'

SELECT
  CASE
    WHEN COUNT(*) = 4 THEN '✓ All 4 functions created'
    ELSE '✗ Expected 4 functions, found ' || COUNT(*)::TEXT
  END AS status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'prediction'
  AND p.proname IN (
    'get_active_analysts',
    'get_active_learnings',
    'increment_learning_application',
    'get_analyst_effective_settings'
  );

\echo ''
\echo 'Function details:'
SELECT
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'prediction'
  AND p.proname IN (
    'get_active_analysts',
    'get_active_learnings',
    'increment_learning_application',
    'get_analyst_effective_settings'
  )
ORDER BY p.proname;

-- =====================================================================================
-- CHECK 4: Triggers Created
-- =====================================================================================
\echo ''
\echo '4. Checking triggers created...'
\echo '------------------------------------------------------------------------'

SELECT
  CASE
    WHEN COUNT(*) = 4 THEN '✓ All 4 updated_at triggers created'
    ELSE '✗ Expected 4 triggers, found ' || COUNT(*)::TEXT
  END AS status
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'prediction'
  AND c.relname IN (
    'analysts',
    'analyst_overrides',
    'learnings',
    'learning_queue',
    'review_queue'
  )
  AND t.tgname LIKE '%updated_at%';

\echo ''
\echo 'Trigger details:'
SELECT
  n.nspname || '.' || c.relname as table_name,
  t.tgname as trigger_name
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'prediction'
  AND c.relname IN (
    'analysts',
    'analyst_overrides',
    'learnings',
    'learning_queue',
    'review_queue'
  )
  AND t.tgname LIKE '%updated_at%'
ORDER BY c.relname;

-- =====================================================================================
-- CHECK 5: RLS Policies Created
-- =====================================================================================
\echo ''
\echo '5. Checking RLS policies created...'
\echo '------------------------------------------------------------------------'

SELECT
  tablename,
  COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'prediction'
  AND tablename IN (
    'analysts',
    'analyst_overrides',
    'analyst_assessments',
    'learnings',
    'learning_queue',
    'review_queue',
    'source_crawls',
    'source_seen_items'
  )
GROUP BY tablename
ORDER BY tablename;

\echo ''
\echo 'RLS enabled status:'
SELECT
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'prediction'
  AND c.relname IN (
    'analysts',
    'analyst_overrides',
    'analyst_assessments',
    'learnings',
    'learning_queue',
    'review_queue',
    'source_crawls',
    'source_seen_items'
  )
ORDER BY c.relname;

-- =====================================================================================
-- CHECK 6: Analysts Seeded
-- =====================================================================================
\echo ''
\echo '6. Checking analysts seeded...'
\echo '------------------------------------------------------------------------'

SELECT
  CASE
    WHEN COUNT(*) = 15 THEN '✓ All 15 analysts seeded'
    ELSE '✗ Expected 15 analysts, found ' || COUNT(*)::TEXT
  END AS status
FROM prediction.analysts;

\echo ''
\echo 'Analyst breakdown by scope and domain:'
SELECT
  scope_level,
  COALESCE(domain, 'N/A') as domain,
  COUNT(*) as count,
  string_agg(slug, ', ' ORDER BY slug) as analyst_slugs
FROM prediction.analysts
GROUP BY scope_level, domain
ORDER BY
  CASE scope_level
    WHEN 'runner' THEN 1
    WHEN 'domain' THEN 2
    WHEN 'universe' THEN 3
    WHEN 'target' THEN 4
  END,
  domain;

-- =====================================================================================
-- CHECK 7: Foreign Keys Created
-- =====================================================================================
\echo ''
\echo '7. Checking foreign key constraints...'
\echo '------------------------------------------------------------------------'

SELECT
  tc.table_name,
  COUNT(*) as fk_count
FROM information_schema.table_constraints tc
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'prediction'
  AND tc.table_name IN (
    'analysts',
    'analyst_overrides',
    'analyst_assessments',
    'learnings',
    'learning_queue',
    'review_queue',
    'source_crawls',
    'source_seen_items'
  )
GROUP BY tc.table_name
ORDER BY tc.table_name;

-- =====================================================================================
-- CHECK 8: Check Constraints Created
-- =====================================================================================
\echo ''
\echo '8. Checking check constraints...'
\echo '------------------------------------------------------------------------'

SELECT
  tc.table_name,
  COUNT(*) as check_count
FROM information_schema.table_constraints tc
WHERE tc.constraint_type = 'CHECK'
  AND tc.table_schema = 'prediction'
  AND tc.table_name IN (
    'analysts',
    'analyst_overrides',
    'analyst_assessments',
    'learnings',
    'learning_queue',
    'review_queue',
    'source_crawls',
    'source_seen_items'
  )
GROUP BY tc.table_name
ORDER BY tc.table_name;

-- =====================================================================================
-- CHECK 9: Unique Constraints Created
-- =====================================================================================
\echo ''
\echo '9. Checking unique constraints...'
\echo '------------------------------------------------------------------------'

SELECT
  tc.table_name,
  COUNT(*) as unique_count
FROM information_schema.table_constraints tc
WHERE tc.constraint_type = 'UNIQUE'
  AND tc.table_schema = 'prediction'
  AND tc.table_name IN (
    'analysts',
    'analyst_overrides',
    'analyst_assessments',
    'learnings',
    'learning_queue',
    'review_queue',
    'source_crawls',
    'source_seen_items'
  )
GROUP BY tc.table_name
ORDER BY tc.table_name;

-- =====================================================================================
-- CHECK 10: Sample Data Quality
-- =====================================================================================
\echo ''
\echo '10. Checking sample data quality...'
\echo '------------------------------------------------------------------------'

\echo 'Analyst tier instructions validation:'
SELECT
  slug,
  CASE
    WHEN tier_instructions ? 'gold' AND tier_instructions ? 'silver' AND tier_instructions ? 'bronze'
      THEN '✓ All tiers present'
    ELSE '✗ Missing tiers'
  END AS tier_status
FROM prediction.analysts
ORDER BY scope_level, domain, slug;

\echo ''
\echo 'Analyst weight validation:'
SELECT
  slug,
  default_weight,
  CASE
    WHEN default_weight >= 0.00 AND default_weight <= 2.00 THEN '✓ Valid'
    ELSE '✗ Invalid'
  END AS weight_status
FROM prediction.analysts
ORDER BY scope_level, domain, slug;

-- =====================================================================================
-- SUMMARY
-- =====================================================================================
\echo ''
\echo '========================================================================'
\echo 'VERIFICATION SUMMARY'
\echo '========================================================================'

SELECT
  'Tables' as check_type,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'prediction' AND table_name IN ('analysts', 'analyst_overrides', 'analyst_assessments', 'learnings', 'learning_queue', 'review_queue', 'source_crawls', 'source_seen_items'))::TEXT || '/8' as result
UNION ALL
SELECT
  'Functions' as check_type,
  (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'prediction' AND p.proname IN ('get_active_analysts', 'get_active_learnings', 'increment_learning_application', 'get_analyst_effective_settings'))::TEXT || '/4' as result
UNION ALL
SELECT
  'Triggers' as check_type,
  (SELECT COUNT(*) FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid JOIN pg_namespace n ON c.relnamespace = n.oid WHERE n.nspname = 'prediction' AND c.relname IN ('analysts', 'analyst_overrides', 'learnings', 'learning_queue', 'review_queue') AND t.tgname LIKE '%updated_at%')::TEXT || '/4' as result
UNION ALL
SELECT
  'RLS Policies' as check_type,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'prediction' AND tablename IN ('analysts', 'analyst_overrides', 'analyst_assessments', 'learnings', 'learning_queue', 'review_queue', 'source_crawls', 'source_seen_items'))::TEXT || ' policies' as result
UNION ALL
SELECT
  'Analysts Seeded' as check_type,
  (SELECT COUNT(*) FROM prediction.analysts)::TEXT || '/15' as result;

\echo ''
\echo '========================================================================'
\echo 'VERIFICATION COMPLETE'
\echo '========================================================================'
\echo ''
