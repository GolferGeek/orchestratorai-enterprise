import * as dotenv from 'dotenv';
import { join } from 'path';
import * as mssql from 'mssql';

function loadEnv(): void {
  const envFilePath = process.env.ENV_FILE
    ? process.env.ENV_FILE.startsWith('/')
      ? process.env.ENV_FILE
      : join(process.cwd(), process.env.ENV_FILE)
    : join(process.cwd(), '../../.env');
  dotenv.config({ path: envFilePath });
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function requireIntEnv(name: string): number {
  const value = requireEnv(name);
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid ${name} value '${value}'. Expected a positive integer.`,
    );
  }
  return parsed;
}

function requireBooleanEnv(name: string): boolean {
  const value = requireEnv(name).toLowerCase();
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`Invalid ${name} value '${value}'. Expected true or false.`);
}

async function run(): Promise<void> {
  loadEnv();
  console.log('========================================');
  console.log(' SQL Server Pilot Schema Bootstrap');
  console.log('========================================');
  console.log(`SQLSERVER_HOST=${process.env.SQLSERVER_HOST ?? '<unset>'}`);
  console.log(`SQLSERVER_DATABASE=${process.env.SQLSERVER_DATABASE ?? '<unset>'}`);

  const pool = await new mssql.ConnectionPool({
    server: requireEnv('SQLSERVER_HOST'),
    port: requireIntEnv('SQLSERVER_PORT'),
    database: requireEnv('SQLSERVER_DATABASE'),
    user: requireEnv('SQLSERVER_USER'),
    password: requireEnv('SQLSERVER_PASSWORD'),
    connectionTimeout: 60000,
    requestTimeout: 60000,
    options: {
      encrypt: requireBooleanEnv('SQLSERVER_ENCRYPT'),
      trustServerCertificate: requireBooleanEnv('SQLSERVER_TRUST_SERVER_CERT'),
    },
  }).connect();

  try {
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'authz')
      BEGIN
        EXEC('CREATE SCHEMA authz');
      END;

      IF OBJECT_ID('authz.users', 'U') IS NULL
      BEGIN
        CREATE TABLE authz.users (
          id UNIQUEIDENTIFIER NOT NULL,
          email NVARCHAR(255) NOT NULL,
          display_name NVARCHAR(255) NULL,
          organization_slug NVARCHAR(255) NULL,
          status NVARCHAR(50) NOT NULL DEFAULT N'active',
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_authz_users PRIMARY KEY (id),
          CONSTRAINT UQ_authz_users_email UNIQUE (email)
        );
      END;

      IF OBJECT_ID('authz.rbac_roles', 'U') IS NULL
      BEGIN
        CREATE TABLE authz.rbac_roles (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          name NVARCHAR(100) NOT NULL,
          display_name NVARCHAR(255) NOT NULL,
          description NVARCHAR(MAX) NULL,
          is_system BIT NOT NULL DEFAULT 0,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_authz_rbac_roles PRIMARY KEY (id),
          CONSTRAINT UQ_authz_rbac_roles_name UNIQUE (name)
        );
      END;

      IF OBJECT_ID('authz.rbac_permissions', 'U') IS NULL
      BEGIN
        CREATE TABLE authz.rbac_permissions (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          name NVARCHAR(100) NOT NULL,
          display_name NVARCHAR(255) NOT NULL,
          description NVARCHAR(MAX) NULL,
          category NVARCHAR(100) NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_authz_rbac_permissions PRIMARY KEY (id),
          CONSTRAINT UQ_authz_rbac_permissions_name UNIQUE (name)
        );
      END;

      IF OBJECT_ID('authz.rbac_role_permissions', 'U') IS NULL
      BEGIN
        CREATE TABLE authz.rbac_role_permissions (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          role_id UNIQUEIDENTIFIER NOT NULL,
          permission_id UNIQUEIDENTIFIER NOT NULL,
          resource_type NVARCHAR(100) NULL,
          resource_id UNIQUEIDENTIFIER NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_authz_rbac_role_permissions PRIMARY KEY (id),
          CONSTRAINT UQ_authz_rbac_role_permissions UNIQUE (
            role_id, permission_id, resource_type, resource_id
          )
        );
      END;

      IF OBJECT_ID('authz.rbac_user_org_roles', 'U') IS NULL
      BEGIN
        CREATE TABLE authz.rbac_user_org_roles (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          user_id UNIQUEIDENTIFIER NOT NULL,
          organization_slug NVARCHAR(255) NOT NULL,
          role_id UNIQUEIDENTIFIER NOT NULL,
          assigned_by UNIQUEIDENTIFIER NULL,
          assigned_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          expires_at DATETIME2 NULL,
          CONSTRAINT PK_authz_rbac_user_org_roles PRIMARY KEY (id),
          CONSTRAINT UQ_authz_rbac_user_org_roles UNIQUE (user_id, organization_slug, role_id)
        );
      END;

      IF OBJECT_ID('authz.rbac_audit_log', 'U') IS NULL
      BEGIN
        CREATE TABLE authz.rbac_audit_log (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          action NVARCHAR(50) NOT NULL,
          actor_id UNIQUEIDENTIFIER NULL,
          target_user_id UNIQUEIDENTIFIER NULL,
          target_role_id UNIQUEIDENTIFIER NULL,
          organization_slug NVARCHAR(255) NULL,
          details NVARCHAR(MAX) NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_authz_rbac_audit_log PRIMARY KEY (id)
        );
      END;

      MERGE authz.rbac_roles AS target
      USING (
        SELECT N'super-admin' AS name, N'Super Administrator' AS display_name, N'Full access to all organizations and resources' AS description, CAST(1 AS BIT) AS is_system
        UNION ALL SELECT N'admin', N'Administrator', N'Full access within assigned organization', CAST(1 AS BIT)
        UNION ALL SELECT N'manager', N'Manager', N'Can manage users and resources within organization', CAST(1 AS BIT)
        UNION ALL SELECT N'member', N'Member', N'Standard access within organization', CAST(1 AS BIT)
        UNION ALL SELECT N'viewer', N'Viewer', N'Read-only access within organization', CAST(1 AS BIT)
      ) AS source
      ON target.name = source.name
      WHEN MATCHED THEN
        UPDATE SET
          display_name = source.display_name,
          description = source.description,
          is_system = source.is_system,
          updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (name, display_name, description, is_system)
        VALUES (source.name, source.display_name, source.description, source.is_system);

      IF OBJECT_ID('authz.identity_links', 'U') IS NULL
      BEGIN
        CREATE TABLE authz.identity_links (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          user_id UNIQUEIDENTIFIER NOT NULL,
          issuer NVARCHAR(512) NOT NULL,
          subject NVARCHAR(512) NOT NULL,
          email NVARCHAR(320) NULL,
          raw_claims NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_authz_identity_links PRIMARY KEY (id),
          CONSTRAINT UQ_authz_identity_links_issuer_subject UNIQUE (issuer, subject)
        );
      END;

      IF OBJECT_ID('auth.auth_identity_links', 'U') IS NOT NULL
         AND OBJECT_ID('authz.identity_links', 'U') IS NOT NULL
      BEGIN
        MERGE authz.identity_links AS target
        USING (
          SELECT user_id, issuer, subject, email, raw_claims
          FROM auth.auth_identity_links
        ) AS source
        ON target.issuer = source.issuer AND target.subject = source.subject
        WHEN MATCHED THEN
          UPDATE SET
            user_id = source.user_id,
            email = source.email,
            raw_claims = source.raw_claims,
            updated_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (user_id, issuer, subject, email, raw_claims)
          VALUES (
            source.user_id,
            source.issuer,
            source.subject,
            source.email,
            source.raw_claims
          );
      END;

      IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'IX_authz_identity_links_user_id'
          AND object_id = OBJECT_ID('authz.identity_links')
      )
      BEGIN
        CREATE INDEX IX_authz_identity_links_user_id
        ON authz.identity_links (user_id);
      END;
    `);
    console.log('authz canonical users/RBAC + identity_links ready');

    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'orch_flow')
      BEGIN
        EXEC('CREATE SCHEMA orch_flow');
      END;

      IF OBJECT_ID('orch_flow.shared_tasks', 'U') IS NULL
      BEGIN
        CREATE TABLE orch_flow.shared_tasks (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          title NVARCHAR(500) NOT NULL,
          description NVARCHAR(MAX) NULL,
          status NVARCHAR(64) NOT NULL DEFAULT N'in_progress',
          assigned_to NVARCHAR(255) NULL,
          team_id UNIQUEIDENTIFIER NULL,
          channel_id UNIQUEIDENTIFIER NULL,
          source_channel_user_id UNIQUEIDENTIFIER NULL,
          is_completed BIT NOT NULL DEFAULT 0,
          pomodoro_count INT NOT NULL DEFAULT 0,
          external_provider NVARCHAR(32) NULL,
          external_task_id NVARCHAR(128) NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_orch_flow_shared_tasks PRIMARY KEY (id)
        );
      END;

      IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'IX_orch_flow_shared_tasks_external_provider_id'
          AND object_id = OBJECT_ID('orch_flow.shared_tasks')
      )
      BEGIN
        CREATE INDEX IX_orch_flow_shared_tasks_external_provider_id
        ON orch_flow.shared_tasks (external_provider, external_task_id);
      END;
    `);
    console.log('orch_flow.shared_tasks ready');

    console.log('✅ SQL Server pilot schema bootstrap passed');
  } finally {
    await pool.close();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ SQL Server pilot schema bootstrap failed: ${message}`);
    process.exit(1);
  });
