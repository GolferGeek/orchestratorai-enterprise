-- Migration: Clean up redundant super-admin role assignments
-- Date: 2025-12-04
-- Description: Remove org-specific super-admin assignments for users who already
--              have global (*) super-admin access. The global assignment is sufficient.

-- Delete org-specific super-admin roles for users who have global super-admin
DELETE FROM rbac_user_org_roles
WHERE role_id = (SELECT id FROM rbac_roles WHERE name = 'super-admin')
  AND organization_slug != '*'
  AND user_id IN (
    -- Get user IDs who have global super-admin
    SELECT user_id
    FROM rbac_user_org_roles
    WHERE role_id = (SELECT id FROM rbac_roles WHERE name = 'super-admin')
      AND organization_slug = '*'
  );

-- This removes the redundant entries while keeping the global (*) assignments
