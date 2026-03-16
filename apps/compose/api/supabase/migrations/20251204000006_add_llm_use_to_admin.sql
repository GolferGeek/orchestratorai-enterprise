-- Migration: Add llm:use permission to admin role
-- Date: 2025-12-04
-- Description: Admin should be able to USE LLMs in addition to administering them.
--              Having llm:admin doesn't automatically grant llm:use.

-- Add llm:use permission to admin role
INSERT INTO rbac_role_permissions (role_id, permission_id)
SELECT
    (SELECT id FROM rbac_roles WHERE name = 'admin'),
    (SELECT id FROM rbac_permissions WHERE name = 'llm:use')
WHERE NOT EXISTS (
    SELECT 1 FROM rbac_role_permissions rp
    WHERE rp.role_id = (SELECT id FROM rbac_roles WHERE name = 'admin')
      AND rp.permission_id = (SELECT id FROM rbac_permissions WHERE name = 'llm:use')
);
