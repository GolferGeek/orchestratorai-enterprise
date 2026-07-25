#!/usr/bin/env bash

set -euo pipefail

# Provision the initial platform administrator.
#
# A fresh deployment has zero users. Google OIDC auto-provisions a user on first
# login but assigns no role, so nobody can administer the instance and RBAC
# screens are empty. This grants the configured ADMIN_EMAIL the global
# super-admin role (idempotent), so the first real login lands on a working,
# fully-privileged account.
#
# Requires:
#   ADMIN_EMAIL  — the Google account that should be super-admin
#   ADMIN_ORG    — optional home org slug (default: engineering)
#   PG* env      — a reachable database (the bootstrap exports these while the
#                  Cloud SQL Auth Proxy is running; for standalone use, start the
#                  proxy and export PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSWORD)

ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_ORG="${ADMIN_ORG:-engineering}"

if [ -z "$ADMIN_EMAIL" ]; then
  echo "provision-admin: ADMIN_EMAIL not set; skipping admin provisioning." >&2
  exit 0
fi

for required_name in PGHOST PGPORT PGUSER PGDATABASE PGPASSWORD; do
  if [ -z "${!required_name:-}" ]; then
    echo "ERROR: provision-admin requires $required_name (run in the migration proxy context)." >&2
    exit 1
  fi
done

# RBAC functions reference sibling schemas unqualified — verify the app role's
# search_path was set (cloud-sql-post-migrate.sql) or admin screens will be empty.
app_search_path="$(
  psql -X -Atqc "SELECT array_to_string(rolconfig, ',') FROM pg_roles WHERE rolname='orchestrator_app';"
)"
if [[ "$app_search_path" != *authz* ]]; then
  echo "ERROR: orchestrator_app search_path is missing 'authz'; RBAC functions will fail." >&2
  exit 1
fi

echo "Provisioning super-admin: $ADMIN_EMAIL (home org: $ADMIN_ORG)"
psql -X -v ON_ERROR_STOP=1 -v admin_email="$ADMIN_EMAIL" -v admin_org="$ADMIN_ORG" <<'SQL'
INSERT INTO authz.users (id, email, display_name, organization_slug, status)
VALUES (gen_random_uuid(), :'admin_email', split_part(:'admin_email', '@', 1), :'admin_org', 'active')
ON CONFLICT (email) DO UPDATE SET status = 'active';

INSERT INTO authz.rbac_user_org_roles (user_id, organization_slug, role_id)
SELECT u.id, '*', r.id
FROM authz.users u
CROSS JOIN authz.rbac_roles r
WHERE u.email = :'admin_email' AND r.name = 'super-admin'
ON CONFLICT (user_id, organization_slug, role_id) DO NOTHING;
SQL

granted="$(
  psql -X -Atqc "
    SELECT count(*)
    FROM authz.rbac_user_org_roles ro
    JOIN authz.users u ON u.id = ro.user_id
    JOIN authz.rbac_roles r ON r.id = ro.role_id
    WHERE u.email = '${ADMIN_EMAIL}' AND r.name = 'super-admin';
  "
)"
if [ "${granted:-0}" -lt 1 ]; then
  echo "ERROR: failed to provision super-admin for $ADMIN_EMAIL." >&2
  exit 1
fi
echo "✓ Super-admin provisioned for $ADMIN_EMAIL"
