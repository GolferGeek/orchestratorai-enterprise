-- Migration: Add LLM and agent permissions to viewer role
-- Date: 2025-12-04
-- Description: Viewers should be able to use LLMs and execute agents.
--              They can already read deliverables, so they should be able to create them too.

-- Add llm:use permission to viewer role
INSERT INTO rbac_role_permissions (role_id, permission_id)
SELECT
    (SELECT id FROM rbac_roles WHERE name = 'viewer'),
    (SELECT id FROM rbac_permissions WHERE name = 'llm:use')
WHERE NOT EXISTS (
    SELECT 1 FROM rbac_role_permissions rp
    WHERE rp.role_id = (SELECT id FROM rbac_roles WHERE name = 'viewer')
      AND rp.permission_id = (SELECT id FROM rbac_permissions WHERE name = 'llm:use')
);

-- Add agents:execute permission to viewer role
INSERT INTO rbac_role_permissions (role_id, permission_id)
SELECT
    (SELECT id FROM rbac_roles WHERE name = 'viewer'),
    (SELECT id FROM rbac_permissions WHERE name = 'agents:execute')
WHERE NOT EXISTS (
    SELECT 1 FROM rbac_role_permissions rp
    WHERE rp.role_id = (SELECT id FROM rbac_roles WHERE name = 'viewer')
      AND rp.permission_id = (SELECT id FROM rbac_permissions WHERE name = 'agents:execute')
);
