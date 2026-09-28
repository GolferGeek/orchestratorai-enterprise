-- One line per schema object in the app schemas, comparable across databases.
WITH app AS (
  SELECT oid, nspname FROM pg_namespace
  WHERE nspname NOT IN ('auth','extensions','graphql','graphql_public','realtime','_realtime','storage','supabase_functions','vault','net','information_schema','pgbouncer','supabase_migrations','cron')
    AND nspname NOT LIKE 'pg_%'
)
SELECT 'column   ' || c.table_schema || '.' || c.table_name || '.' || c.column_name || ' ' || c.data_type || CASE WHEN c.is_nullable = 'NO' THEN ' not null' ELSE '' END || coalesce(' default ' || c.column_default, '')
FROM information_schema.columns c JOIN app ON app.nspname = c.table_schema
UNION ALL
SELECT 'table    ' || n.nspname || '.' || t.relname || ' owner ' || pg_get_userbyid(t.relowner) || CASE WHEN t.relrowsecurity THEN ' rls' ELSE '' END
FROM pg_class t JOIN app n ON n.oid = t.relnamespace WHERE t.relkind IN ('r','p','v','m')
UNION ALL
SELECT 'constr   ' || n.nspname || '.' || t.relname || ' ' || c.conname || ' ' || pg_get_constraintdef(c.oid)
FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN app n ON n.oid = t.relnamespace
UNION ALL
SELECT 'index    ' || i.indexdef FROM pg_indexes i JOIN app ON app.nspname = i.schemaname
UNION ALL
SELECT 'function ' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || md5(p.prosrc)
FROM pg_proc p JOIN app n ON n.oid = p.pronamespace WHERE p.prokind IN ('f','p')
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
UNION ALL
SELECT 'trigger  ' || n.nspname || '.' || t.relname || ' ' || tg.tgname || ' ' || pg_get_triggerdef(tg.oid)
FROM pg_trigger tg JOIN pg_class t ON t.oid = tg.tgrelid JOIN app n ON n.oid = t.relnamespace WHERE NOT tg.tgisinternal
UNION ALL
SELECT 'policy   ' || schemaname || '.' || tablename || ' ' || policyname || ' ' || cmd || ' ' || coalesce(qual, '') || ' ' || coalesce(with_check, '')
FROM pg_policies JOIN app ON app.nspname = schemaname
ORDER BY 1;
