-- Debug query to check agents and organizations

-- 1. Check all agents in the database
SELECT 
  slug, 
  name, 
  agent_type,
  department,
  organization_slug
FROM public.agents
ORDER BY slug;

-- 2. Check all organizations
SELECT 
  slug,
  name,
  created_at
FROM public.organizations
ORDER BY slug;

-- 3. Check your user's organization
SELECT 
  u.email,
  u.organization_slug,
  u.display_name
FROM public.users u
WHERE u.email IN ('golfergeek@orchestratorai.io', 'demo.user@orchestratorai.io');

-- 4. Check if RLS is blocking anything (this shows RLS policies)
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'agents';
