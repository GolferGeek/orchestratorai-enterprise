-- Migration: Fix admin role permission gaps
-- Date: 2026-04-18
-- Description: Admin holds agents:admin and rag:admin but not the explicit execute/manage/read/write
--              permissions. Those are separate rows — wildcards are not automatic. Any guard that
--              checks agents:execute, agents:manage, rag:read, or rag:write will return 403 for
--              admin users until these rows exist. This migration adds the missing pairs.

-- admin <- agents:execute
INSERT INTO authz.rbac_role_permissions (role_id, permission_id)
SELECT
    (SELECT id FROM authz.rbac_roles WHERE name = 'admin'),
    (SELECT id FROM authz.rbac_permissions WHERE name = 'agents:execute')
WHERE NOT EXISTS (
    SELECT 1 FROM authz.rbac_role_permissions rp
    WHERE rp.role_id = (SELECT id FROM authz.rbac_roles WHERE name = 'admin')
      AND rp.permission_id = (SELECT id FROM authz.rbac_permissions WHERE name = 'agents:execute')
);

-- admin <- agents:manage
INSERT INTO authz.rbac_role_permissions (role_id, permission_id)
SELECT
    (SELECT id FROM authz.rbac_roles WHERE name = 'admin'),
    (SELECT id FROM authz.rbac_permissions WHERE name = 'agents:manage')
WHERE NOT EXISTS (
    SELECT 1 FROM authz.rbac_role_permissions rp
    WHERE rp.role_id = (SELECT id FROM authz.rbac_roles WHERE name = 'admin')
      AND rp.permission_id = (SELECT id FROM authz.rbac_permissions WHERE name = 'agents:manage')
);

-- admin <- rag:read
INSERT INTO authz.rbac_role_permissions (role_id, permission_id)
SELECT
    (SELECT id FROM authz.rbac_roles WHERE name = 'admin'),
    (SELECT id FROM authz.rbac_permissions WHERE name = 'rag:read')
WHERE NOT EXISTS (
    SELECT 1 FROM authz.rbac_role_permissions rp
    WHERE rp.role_id = (SELECT id FROM authz.rbac_roles WHERE name = 'admin')
      AND rp.permission_id = (SELECT id FROM authz.rbac_permissions WHERE name = 'rag:read')
);

-- admin <- rag:write
INSERT INTO authz.rbac_role_permissions (role_id, permission_id)
SELECT
    (SELECT id FROM authz.rbac_roles WHERE name = 'admin'),
    (SELECT id FROM authz.rbac_permissions WHERE name = 'rag:write')
WHERE NOT EXISTS (
    SELECT 1 FROM authz.rbac_role_permissions rp
    WHERE rp.role_id = (SELECT id FROM authz.rbac_roles WHERE name = 'admin')
      AND rp.permission_id = (SELECT id FROM authz.rbac_permissions WHERE name = 'rag:write')
);
