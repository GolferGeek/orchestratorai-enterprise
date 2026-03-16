import * as dotenv from 'dotenv';
import { join } from 'path';
import * as mssql from 'mssql';

function loadEnv(): void {
  const root = join(process.cwd(), '../../');
  dotenv.config({ path: join(root, '.env.azure') });
  dotenv.config({ path: join(root, '.env') });
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
    throw new Error(`Invalid ${name} value '${value}'. Expected a positive integer.`);
  }
  return parsed;
}

function requireBooleanEnv(name: string): boolean {
  const value = requireEnv(name).toLowerCase();
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`Invalid ${name} value '${value}'. Expected true or false.`);
}

async function tryFK(pool: mssql.ConnectionPool, name: string, sql: string): Promise<boolean> {
  try {
    await pool.request().query(sql);
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`  ⚠ FK ${name} skipped: ${msg.split('\n')[0]}`);
    return false;
  }
}

function esc(s: string | null | undefined): string {
  if (s == null) return 'NULL';
  return `N'${s.replace(/'/g, "''")}'`;
}

function escBool(b: boolean | null | undefined): string {
  if (b == null) return 'NULL';
  return b ? '1' : '0';
}

async function run(): Promise<void> {
  loadEnv();
  console.log('========================================');
  console.log(' SQL Server Full Schema Bootstrap');
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
    requestTimeout: 120000,
    options: {
      encrypt: requireBooleanEnv('SQLSERVER_ENCRYPT'),
      trustServerCertificate: requireBooleanEnv('SQLSERVER_TRUST_SERVER_CERT'),
    },
  }).connect();

  try {
    // ================================================================
    // STEP 1: Create all schemas
    // ================================================================
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'authz')
        EXEC('CREATE SCHEMA authz');
      -- public schema maps to dbo in SQL Server (public is a reserved role name)
      IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'company')
        EXEC('CREATE SCHEMA company');
      IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'crawler')
        EXEC('CREATE SCHEMA crawler');
      IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'engineering')
        EXEC('CREATE SCHEMA engineering');
      IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'leads')
        EXEC('CREATE SCHEMA leads');
      IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'marketing')
        EXEC('CREATE SCHEMA marketing');
      IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'orch_flow')
        EXEC('CREATE SCHEMA orch_flow');
      IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'prediction')
        EXEC('CREATE SCHEMA prediction');
      IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'risk')
        EXEC('CREATE SCHEMA risk');
      IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'rag_data')
        EXEC('CREATE SCHEMA rag_data');
    `);
    console.log('Schemas created');

    // ================================================================
    // STEP 2: authz schema (canonical users + RBAC)
    // ================================================================
    await pool.request().query(`
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
    `);
    console.log('authz.users + identity_links ready');

    // ================================================================
    // STEP 3: public schema - root tables (no FKs to other public tables)
    // ================================================================
    await pool.request().query(`
      IF OBJECT_ID('dbo.organizations', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.organizations (
          slug NVARCHAR(255) NOT NULL,
          name NVARCHAR(MAX) NOT NULL,
          description NVARCHAR(MAX) NULL,
          url NVARCHAR(MAX) NULL,
          settings NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_public_organizations PRIMARY KEY (slug)
        );
      END;

      IF OBJECT_ID('dbo.llm_providers', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.llm_providers (
          name NVARCHAR(255) NOT NULL,
          display_name NVARCHAR(MAX) NOT NULL,
          api_base_url NVARCHAR(MAX) NULL,
          configuration_json NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          is_active BIT NOT NULL DEFAULT 1,
          is_local BIT NOT NULL DEFAULT 0,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_public_llm_providers PRIMARY KEY (name)
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

      IF OBJECT_ID('dbo.redaction_patterns', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.redaction_patterns (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          name NVARCHAR(255) NOT NULL,
          pattern_regex NVARCHAR(MAX) NOT NULL,
          replacement NVARCHAR(MAX) NOT NULL,
          description NVARCHAR(MAX) NULL,
          category NVARCHAR(100) NULL DEFAULT N'pii_custom',
          priority INT NULL DEFAULT 50,
          is_active BIT NULL DEFAULT 1,
          severity NVARCHAR(50) NULL,
          data_type NVARCHAR(50) NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_public_redaction_patterns PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('dbo.system_settings', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.system_settings (
          [key] NVARCHAR(255) NOT NULL,
          value NVARCHAR(MAX) NOT NULL,
          description NVARCHAR(MAX) NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_public_system_settings PRIMARY KEY ([key])
        );
      END;
    `);
    console.log('public root tables ready');

    // ================================================================
    // STEP 4: public schema - tables with FK to organizations/providers
    // ================================================================
    await pool.request().query(`
      IF OBJECT_ID('dbo.llm_models', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.llm_models (
          model_name NVARCHAR(255) NOT NULL,
          provider_name NVARCHAR(255) NOT NULL,
          display_name NVARCHAR(MAX) NULL,
          model_type NVARCHAR(MAX) NULL DEFAULT N'text-generation',
          model_version NVARCHAR(MAX) NULL,
          context_window INT NULL DEFAULT 4096,
          max_output_tokens INT NULL DEFAULT 2048,
          model_parameters_json NVARCHAR(MAX) NULL DEFAULT N'{}',
          pricing_info_json NVARCHAR(MAX) NULL DEFAULT N'{}',
          capabilities NVARCHAR(MAX) NULL DEFAULT N'[]',
          model_tier NVARCHAR(MAX) NULL,
          speed_tier NVARCHAR(MAX) NULL DEFAULT N'medium',
          loading_priority INT NULL DEFAULT 5,
          is_local BIT NULL DEFAULT 0,
          is_currently_loaded BIT NULL DEFAULT 0,
          is_active BIT NULL DEFAULT 1,
          training_data_cutoff DATE NULL,
          deprecation_reason NVARCHAR(MAX) NULL,
          deprecated_at DATETIME2 NULL,
          last_validated_at DATETIME2 NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_public_llm_models PRIMARY KEY (model_name, provider_name)
        );
      END;

      IF OBJECT_ID('dbo.agents', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.agents (
          slug NVARCHAR(MAX) NOT NULL,
          organization_slug NVARCHAR(MAX) NOT NULL DEFAULT N'["demo-org"]',
          name NVARCHAR(MAX) NOT NULL,
          description NVARCHAR(MAX) NOT NULL,
          version NVARCHAR(MAX) NOT NULL DEFAULT N'1.0.0',
          agent_type NVARCHAR(MAX) NOT NULL,
          department NVARCHAR(MAX) NOT NULL,
          tags NVARCHAR(MAX) NULL DEFAULT N'[]',
          io_schema NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          capabilities NVARCHAR(MAX) NOT NULL DEFAULT N'[]',
          context NVARCHAR(MAX) NOT NULL,
          endpoint NVARCHAR(MAX) NULL,
          llm_config NVARCHAR(MAX) NULL,
          metadata NVARCHAR(MAX) NULL DEFAULT N'{}',
          require_local_model BIT NULL DEFAULT 0,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
      END;

      IF OBJECT_ID('dbo.teams', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.teams (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          org_slug NVARCHAR(MAX) NULL,
          name NVARCHAR(MAX) NOT NULL,
          description NVARCHAR(MAX) NULL,
          created_by UNIQUEIDENTIFIER NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_public_teams PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('dbo.users', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.users (
          id UNIQUEIDENTIFIER NOT NULL,
          email NVARCHAR(255) NOT NULL,
          display_name NVARCHAR(255) NULL,
          organization_slug NVARCHAR(255) NULL,
          status NVARCHAR(50) NOT NULL DEFAULT N'active',
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_public_users PRIMARY KEY (id),
          CONSTRAINT UQ_public_users_email UNIQUE (email)
        );
      END;

      IF OBJECT_ID('dbo.conversations', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.conversations (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          user_id UNIQUEIDENTIFIER NULL,
          agent_name NVARCHAR(255) NULL,
          agent_type NVARCHAR(100) NULL,
          started_at DATETIME2 NULL,
          last_active_at DATETIME2 NULL,
          ended_at DATETIME2 NULL,
          primary_work_product_type NVARCHAR(100) NULL,
          primary_work_product_id UNIQUEIDENTIFIER NULL,
          organization_slug NVARCHAR(MAX) NULL,
          metadata NVARCHAR(MAX) NULL DEFAULT N'{}',
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_public_conversations PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('dbo.tasks', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.tasks (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          user_id UNIQUEIDENTIFIER NULL,
          conversation_id UNIQUEIDENTIFIER NULL,
          method NVARCHAR(255) NULL,
          params NVARCHAR(MAX) NULL DEFAULT N'{}',
          prompt NVARCHAR(MAX) NULL,
          response NVARCHAR(MAX) NULL,
          status NVARCHAR(50) NULL DEFAULT N'pending',
          progress INT NULL DEFAULT 0,
          error_code NVARCHAR(MAX) NULL,
          error_message NVARCHAR(MAX) NULL,
          error_data NVARCHAR(MAX) NULL,
          started_at DATETIME2 NULL,
          completed_at DATETIME2 NULL,
          timeout_seconds INT NULL DEFAULT 300,
          metadata NVARCHAR(MAX) NULL DEFAULT N'{}',
          llm_metadata NVARCHAR(MAX) NULL DEFAULT N'{}',
          response_metadata NVARCHAR(MAX) NULL DEFAULT N'{}',
          evaluation NVARCHAR(MAX) NULL,
          hitl_pending BIT NULL DEFAULT 0,
          hitl_pending_since DATETIME2 NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_public_tasks PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('dbo.deliverables', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.deliverables (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          user_id UNIQUEIDENTIFIER NOT NULL,
          conversation_id UNIQUEIDENTIFIER NULL,
          agent_name NVARCHAR(MAX) NULL,
          title NVARCHAR(MAX) NOT NULL,
          type NVARCHAR(100) NULL,
          task_id UNIQUEIDENTIFIER NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_public_deliverables PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('dbo.plans', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.plans (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          conversation_id UNIQUEIDENTIFIER NOT NULL,
          user_id UNIQUEIDENTIFIER NOT NULL,
          agent_name NVARCHAR(MAX) NOT NULL,
          agent_slug NVARCHAR(MAX) NULL,
          namespace NVARCHAR(MAX) NOT NULL,
          organization_slug NVARCHAR(MAX) NULL,
          title NVARCHAR(MAX) NOT NULL,
          summary NVARCHAR(MAX) NULL,
          status NVARCHAR(MAX) NULL DEFAULT N'draft',
          current_version_id UNIQUEIDENTIFIER NULL,
          plan_json NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          created_by UNIQUEIDENTIFIER NULL,
          approved_by UNIQUEIDENTIFIER NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_public_plans PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('dbo.deliverable_versions', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.deliverable_versions (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          deliverable_id UNIQUEIDENTIFIER NOT NULL,
          version_number INT NOT NULL,
          content NVARCHAR(MAX) NULL,
          format NVARCHAR(100) NULL DEFAULT N'markdown',
          metadata NVARCHAR(MAX) NULL DEFAULT N'{}',
          created_by_type NVARCHAR(50) NULL DEFAULT N'ai_response',
          is_current_version BIT NULL DEFAULT 0,
          task_id UNIQUEIDENTIFIER NULL,
          file_attachments NVARCHAR(MAX) NULL DEFAULT N'{}',
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_public_deliverable_versions PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('dbo.plan_versions', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.plan_versions (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          plan_id UNIQUEIDENTIFIER NOT NULL,
          version_number INT NOT NULL,
          content NVARCHAR(MAX) NOT NULL,
          format NVARCHAR(MAX) NOT NULL DEFAULT N'markdown',
          created_by_type NVARCHAR(MAX) NOT NULL,
          created_by_id UNIQUEIDENTIFIER NULL,
          task_id UNIQUEIDENTIFIER NULL,
          metadata NVARCHAR(MAX) NULL DEFAULT N'{}',
          is_current_version BIT NULL DEFAULT 0,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_public_plan_versions PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('dbo.plan_deliverables', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.plan_deliverables (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          plan_id UNIQUEIDENTIFIER NOT NULL,
          deliverable_id UNIQUEIDENTIFIER NULL,
          label NVARCHAR(MAX) NULL,
          notes NVARCHAR(MAX) NULL,
          metadata NVARCHAR(MAX) NULL DEFAULT N'{}',
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_public_plan_deliverables PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('dbo.human_approvals', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.human_approvals (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          organization_slug NVARCHAR(MAX) NULL,
          agent_slug NVARCHAR(MAX) NOT NULL,
          conversation_id UNIQUEIDENTIFIER NULL,
          task_id NVARCHAR(MAX) NULL,
          orchestration_run_id UNIQUEIDENTIFIER NULL,
          orchestration_step_id UNIQUEIDENTIFIER NULL,
          mode NVARCHAR(MAX) NOT NULL,
          status NVARCHAR(MAX) NOT NULL DEFAULT N'pending',
          approved_by NVARCHAR(MAX) NULL,
          decision_at DATETIME2 NULL,
          metadata NVARCHAR(MAX) NULL DEFAULT N'{}',
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_public_human_approvals PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('dbo.task_messages', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.task_messages (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          task_id UNIQUEIDENTIFIER NOT NULL,
          user_id UNIQUEIDENTIFIER NULL,
          content NVARCHAR(MAX) NOT NULL,
          message_type NVARCHAR(MAX) NOT NULL DEFAULT N'info',
          progress_percentage DECIMAL(18,6) NULL,
          metadata NVARCHAR(MAX) NULL DEFAULT N'{}',
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_public_task_messages PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('dbo.team_members', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.team_members (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          team_id UNIQUEIDENTIFIER NOT NULL,
          user_id UNIQUEIDENTIFIER NOT NULL,
          role NVARCHAR(MAX) NOT NULL DEFAULT N'member',
          joined_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_public_team_members PRIMARY KEY (id)
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
          CONSTRAINT PK_authz_rbac_role_permissions PRIMARY KEY (id)
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

      IF OBJECT_ID('dbo.organization_credentials', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.organization_credentials (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          organization_slug NVARCHAR(MAX) NOT NULL,
          credential_type NVARCHAR(MAX) NOT NULL,
          credential_key NVARCHAR(MAX) NOT NULL,
          credential_value NVARCHAR(MAX) NOT NULL,
          metadata NVARCHAR(MAX) NULL DEFAULT N'{}',
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_public_organization_credentials PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('dbo.pseudonym_dictionaries', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.pseudonym_dictionaries (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          user_id UNIQUEIDENTIFIER NULL,
          conversation_id UNIQUEIDENTIFIER NULL,
          entity_type NVARCHAR(MAX) NOT NULL,
          original_value NVARCHAR(MAX) NOT NULL,
          pseudonym NVARCHAR(MAX) NOT NULL,
          metadata NVARCHAR(MAX) NULL DEFAULT N'{}',
          data_type NVARCHAR(MAX) NULL DEFAULT N'text',
          category NVARCHAR(MAX) NULL DEFAULT N'general',
          is_active BIT NULL DEFAULT 1,
          organization_slug NVARCHAR(MAX) NULL,
          agent_slug NVARCHAR(MAX) NULL,
          original_value_encrypted VARBINARY(MAX) NULL,
          is_encrypted BIT NULL DEFAULT 0,
          expires_at DATETIME2 NULL,
          last_used_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_public_pseudonym_dictionaries PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('dbo.llm_usage', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.llm_usage (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          run_id NVARCHAR(MAX) NOT NULL,
          user_id UNIQUEIDENTIFIER NULL,
          conversation_id UNIQUEIDENTIFIER NULL,
          provider_name NVARCHAR(MAX) NULL,
          model_name NVARCHAR(MAX) NULL,
          route NVARCHAR(MAX) NULL,
          input_tokens INT NULL,
          output_tokens INT NULL,
          input_cost DECIMAL(18,6) NULL,
          output_cost DECIMAL(18,6) NULL,
          total_cost DECIMAL(18,6) NULL,
          duration_ms INT NULL,
          status NVARCHAR(MAX) NULL DEFAULT N'completed',
          caller_type NVARCHAR(MAX) NULL,
          agent_name NVARCHAR(MAX) NULL,
          is_local BIT NULL DEFAULT 0,
          model_tier NVARCHAR(MAX) NULL,
          fallback_used BIT NULL DEFAULT 0,
          routing_reason NVARCHAR(MAX) NULL,
          complexity_level NVARCHAR(MAX) NULL,
          complexity_score INT NULL,
          data_classification NVARCHAR(MAX) NULL,
          started_at DATETIME2 NULL,
          completed_at DATETIME2 NULL,
          error_message NVARCHAR(MAX) NULL,
          data_sanitization_applied BIT NULL DEFAULT 0,
          sanitization_level NVARCHAR(MAX) NULL DEFAULT N'none',
          pii_detected BIT NULL DEFAULT 0,
          pii_types NVARCHAR(MAX) NULL DEFAULT N'[]',
          pseudonyms_used INT NULL DEFAULT 0,
          pseudonym_types NVARCHAR(MAX) NULL DEFAULT N'[]',
          pseudonym_mappings NVARCHAR(MAX) NULL DEFAULT N'[]',
          redactions_applied INT NULL DEFAULT 0,
          redaction_types NVARCHAR(MAX) NULL DEFAULT N'[]',
          source_blinding_applied BIT NULL DEFAULT 0,
          headers_stripped BIT NULL DEFAULT 0,
          custom_user_agent_used BIT NULL DEFAULT 0,
          proxy_used BIT NULL DEFAULT 0,
          no_train_header_sent BIT NULL DEFAULT 0,
          no_retain_header_sent BIT NULL DEFAULT 0,
          sanitization_time_ms INT NULL DEFAULT 0,
          reversal_context_size INT NULL DEFAULT 0,
          policy_profile NVARCHAR(MAX) NULL,
          sovereign_mode BIT NULL DEFAULT 0,
          compliance_flags NVARCHAR(MAX) NULL DEFAULT N'[]',
          showstopper_detected BIT NULL DEFAULT 0,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_public_llm_usage PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('dbo.observability_events', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.observability_events (
          id BIGINT IDENTITY(1,1) NOT NULL,
          source_app NVARCHAR(MAX) NOT NULL DEFAULT N'orchestrator-ai',
          session_id NVARCHAR(MAX) NULL,
          hook_event_type NVARCHAR(MAX) NOT NULL,
          user_id UNIQUEIDENTIFIER NULL,
          username NVARCHAR(MAX) NULL,
          conversation_id UNIQUEIDENTIFIER NULL,
          task_id NVARCHAR(MAX) NOT NULL,
          agent_slug NVARCHAR(MAX) NULL,
          organization_slug NVARCHAR(MAX) NULL,
          mode NVARCHAR(MAX) NULL,
          status NVARCHAR(MAX) NULL,
          message NVARCHAR(MAX) NULL,
          progress INT NULL,
          step NVARCHAR(MAX) NULL,
          sequence INT NULL,
          total_steps INT NULL,
          payload NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          timestamp BIGINT NOT NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_public_observability_events PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('dbo.assets', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.assets (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          user_id UNIQUEIDENTIFIER NULL,
          conversation_id UNIQUEIDENTIFIER NULL,
          filename NVARCHAR(MAX) NULL,
          file_path NVARCHAR(MAX) NULL,
          file_size INT NULL,
          mime_type NVARCHAR(MAX) NULL,
          metadata NVARCHAR(MAX) NULL DEFAULT N'{}',
          storage NVARCHAR(MAX) NULL DEFAULT N'supabase',
          bucket NVARCHAR(MAX) NULL,
          object_key NVARCHAR(MAX) NULL,
          mime NVARCHAR(MAX) NULL,
          size INT NULL,
          width INT NULL,
          height INT NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_public_assets PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('dbo.channel_users', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.channel_users (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          user_id UNIQUEIDENTIFIER NULL,
          channel NVARCHAR(MAX) NOT NULL,
          channel_user_id NVARCHAR(MAX) NOT NULL,
          display_name NVARCHAR(MAX) NULL,
          is_allowed BIT NULL DEFAULT 0,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_public_channel_users PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('dbo.channel_message_log', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.channel_message_log (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          channel_user_id UNIQUEIDENTIFIER NULL,
          channel NVARCHAR(MAX) NOT NULL,
          direction NVARCHAR(MAX) NOT NULL,
          message_text NVARCHAR(MAX) NULL,
          channel_message_id NVARCHAR(MAX) NULL,
          metadata NVARCHAR(MAX) NULL DEFAULT N'{}',
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_public_channel_message_log PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('dbo.cidafm_commands', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.cidafm_commands (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          command_name NVARCHAR(MAX) NOT NULL,
          description NVARCHAR(MAX) NULL,
          prompt_template NVARCHAR(MAX) NOT NULL,
          example_usage NVARCHAR(MAX) NULL,
          category NVARCHAR(MAX) NULL,
          is_active BIT NULL DEFAULT 1,
          is_builtin BIT NULL DEFAULT 1,
          name NVARCHAR(MAX) NULL,
          type NVARCHAR(MAX) NULL DEFAULT N'^',
          default_active BIT NULL DEFAULT 0,
          metadata NVARCHAR(MAX) NULL DEFAULT N'{}',
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_public_cidafm_commands PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('dbo.user_cidafm_commands', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.user_cidafm_commands (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          user_id UNIQUEIDENTIFIER NOT NULL,
          command_id UNIQUEIDENTIFIER NOT NULL,
          custom_prompt NVARCHAR(MAX) NULL,
          usage_count INT NULL DEFAULT 0,
          last_used_at DATETIME2 NULL,
          metadata NVARCHAR(MAX) NULL DEFAULT N'{}',
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_public_user_cidafm_commands PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('dbo.checkpoints', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.checkpoints (
          thread_id NVARCHAR(MAX) NOT NULL,
          checkpoint_ns NVARCHAR(MAX) NOT NULL DEFAULT N'',
          checkpoint_id NVARCHAR(MAX) NOT NULL,
          parent_checkpoint_id NVARCHAR(MAX) NULL,
          type NVARCHAR(MAX) NULL,
          [checkpoint] NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          metadata NVARCHAR(MAX) NOT NULL DEFAULT N'{}'
        );
      END;

      IF OBJECT_ID('dbo.checkpoint_blobs', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.checkpoint_blobs (
          thread_id NVARCHAR(MAX) NOT NULL,
          checkpoint_ns NVARCHAR(MAX) NOT NULL DEFAULT N'',
          channel NVARCHAR(MAX) NOT NULL,
          version NVARCHAR(MAX) NOT NULL,
          type NVARCHAR(MAX) NOT NULL,
          blob VARBINARY(MAX) NULL
        );
      END;

      IF OBJECT_ID('dbo.checkpoint_writes', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.checkpoint_writes (
          thread_id NVARCHAR(MAX) NOT NULL,
          checkpoint_ns NVARCHAR(MAX) NOT NULL DEFAULT N'',
          checkpoint_id NVARCHAR(MAX) NOT NULL,
          task_id NVARCHAR(MAX) NOT NULL,
          idx INT NOT NULL,
          channel NVARCHAR(MAX) NOT NULL,
          type NVARCHAR(MAX) NULL,
          blob VARBINARY(MAX) NOT NULL
        );
      END;

      IF OBJECT_ID('dbo.checkpoint_migrations', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.checkpoint_migrations (
          v INT NOT NULL,
          CONSTRAINT PK_public_checkpoint_migrations PRIMARY KEY (v)
        );
      END;

      IF OBJECT_ID('dbo.auth_identity_links', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.auth_identity_links (
          id UNIQUEIDENTIFIER NULL,
          user_id UNIQUEIDENTIFIER NULL,
          issuer NVARCHAR(MAX) NULL,
          subject NVARCHAR(MAX) NULL,
          email NVARCHAR(MAX) NULL,
          raw_claims NVARCHAR(MAX) NULL,
          created_at DATETIME2 NULL,
          updated_at DATETIME2 NULL
        );
      END;
    `);
    console.log('public schema tables ready');

    // ================================================================
    // STEP 5: company schema
    // ================================================================
    await pool.request().query(`
      IF OBJECT_ID('company.companies', 'U') IS NULL
      BEGIN
        CREATE TABLE company.companies (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          name NVARCHAR(MAX) NOT NULL,
          website NVARCHAR(MAX) NULL,
          industry NVARCHAR(MAX) NULL,
          size NVARCHAR(MAX) NULL,
          employee_count_range NVARCHAR(MAX) NULL,
          location NVARCHAR(MAX) NULL,
          founded_date DATE NULL,
          description NVARCHAR(MAX) NULL,
          metadata NVARCHAR(MAX) NULL DEFAULT N'{}',
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_company_companies PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('company.discovery_signals', 'U') IS NULL
      BEGIN
        CREATE TABLE company.discovery_signals (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          company_id UNIQUEIDENTIFIER NOT NULL,
          signal_type NVARCHAR(MAX) NOT NULL,
          signal_source NVARCHAR(MAX) NULL,
          signal_date DATE NULL,
          signal_summary NVARCHAR(MAX) NULL,
          score_contribution INT NULL DEFAULT 0,
          batch_date DATE NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE),
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_company_discovery_signals PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('company.outreach', 'U') IS NULL
      BEGIN
        CREATE TABLE company.outreach (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          company_id UNIQUEIDENTIFIER NOT NULL,
          relevance_score INT NULL,
          score_breakdown NVARCHAR(MAX) NULL,
          company_fit_notes NVARCHAR(MAX) NULL,
          stretch_goal NVARCHAR(MAX) NULL,
          stretch_goal_source NVARCHAR(MAX) NULL,
          key_contact_name NVARCHAR(MAX) NULL,
          key_contact_title NVARCHAR(MAX) NULL,
          key_contact_linkedin NVARCHAR(MAX) NULL,
          key_contact_email NVARCHAR(MAX) NULL,
          status NVARCHAR(MAX) NOT NULL DEFAULT N'discovered',
          email_angle NVARCHAR(MAX) NULL,
          outreach_date DATE NULL,
          response_summary NVARCHAR(MAX) NULL,
          research_file_id UNIQUEIDENTIFIER NULL,
          email_draft_file_id UNIQUEIDENTIFIER NULL,
          batch_date DATE NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE),
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_company_outreach PRIMARY KEY (id)
        );
      END;
    `);
    console.log('company schema ready');

    // ================================================================
    // STEP 6: crawler schema
    // ================================================================
    await pool.request().query(`
      IF OBJECT_ID('crawler.sources', 'U') IS NULL
      BEGIN
        CREATE TABLE crawler.sources (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          organization_slug NVARCHAR(MAX) NOT NULL,
          name NVARCHAR(MAX) NOT NULL,
          description NVARCHAR(MAX) NULL,
          source_type NVARCHAR(MAX) NOT NULL,
          url NVARCHAR(MAX) NOT NULL,
          crawl_config NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          auth_config NVARCHAR(MAX) NULL,
          crawl_frequency_minutes INT NOT NULL DEFAULT 15,
          is_active BIT NOT NULL DEFAULT 1,
          is_test BIT NOT NULL DEFAULT 0,
          last_crawl_at DATETIME2 NULL,
          last_crawl_status NVARCHAR(MAX) NULL,
          last_error NVARCHAR(MAX) NULL,
          consecutive_errors INT NOT NULL DEFAULT 0,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_crawler_sources PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('crawler.articles', 'U') IS NULL
      BEGIN
        CREATE TABLE crawler.articles (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          organization_slug NVARCHAR(MAX) NOT NULL,
          source_id UNIQUEIDENTIFIER NOT NULL,
          url NVARCHAR(MAX) NOT NULL,
          title NVARCHAR(MAX) NULL,
          content NVARCHAR(MAX) NULL,
          summary NVARCHAR(MAX) NULL,
          author NVARCHAR(MAX) NULL,
          published_at DATETIME2 NULL,
          content_hash NVARCHAR(MAX) NOT NULL,
          title_normalized NVARCHAR(MAX) NULL,
          key_phrases NVARCHAR(MAX) NULL,
          fingerprint_hash NVARCHAR(MAX) NULL,
          raw_data NVARCHAR(MAX) NULL,
          is_test BIT NOT NULL DEFAULT 0,
          is_duplicate BIT NOT NULL DEFAULT 0,
          first_seen_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          metadata NVARCHAR(MAX) NULL DEFAULT N'{}',
          CONSTRAINT PK_crawler_articles PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('crawler.source_crawls', 'U') IS NULL
      BEGIN
        CREATE TABLE crawler.source_crawls (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          source_id UNIQUEIDENTIFIER NOT NULL,
          started_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          completed_at DATETIME2 NULL,
          crawl_duration_ms INT NULL,
          status NVARCHAR(MAX) NOT NULL DEFAULT N'running',
          articles_found INT NULL DEFAULT 0,
          articles_new INT NULL DEFAULT 0,
          duplicates_exact INT NULL DEFAULT 0,
          duplicates_cross_source INT NULL DEFAULT 0,
          duplicates_fuzzy_title INT NULL DEFAULT 0,
          duplicates_phrase_overlap INT NULL DEFAULT 0,
          error_message NVARCHAR(MAX) NULL,
          retry_count INT NULL DEFAULT 0,
          metadata NVARCHAR(MAX) NULL DEFAULT N'{}',
          CONSTRAINT PK_crawler_source_crawls PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('crawler.agent_article_outputs', 'U') IS NULL
      BEGIN
        CREATE TABLE crawler.agent_article_outputs (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          article_id UNIQUEIDENTIFIER NOT NULL,
          agent_type NVARCHAR(MAX) NOT NULL,
          output_type NVARCHAR(MAX) NULL,
          output_id UNIQUEIDENTIFIER NULL,
          processed_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_crawler_agent_article_outputs PRIMARY KEY (id)
        );
      END;
    `);
    console.log('crawler schema ready');

    // ================================================================
    // STEP 7: engineering schema
    // ================================================================
    await pool.request().query(`
      IF OBJECT_ID('engineering.projects', 'U') IS NULL
      BEGIN
        CREATE TABLE engineering.projects (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          org_slug NVARCHAR(MAX) NOT NULL,
          name NVARCHAR(MAX) NOT NULL,
          description NVARCHAR(MAX) NULL,
          constraints NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          metadata NVARCHAR(MAX) NULL DEFAULT N'{}',
          created_by UNIQUEIDENTIFIER NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_engineering_projects PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('engineering.part_library', 'U') IS NULL
      BEGIN
        CREATE TABLE engineering.part_library (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          org_slug NVARCHAR(MAX) NOT NULL,
          name NVARCHAR(MAX) NOT NULL,
          description NVARCHAR(MAX) NULL,
          category NVARCHAR(MAX) NOT NULL,
          tags NVARCHAR(MAX) NULL DEFAULT N'[]',
          template_code NVARCHAR(MAX) NOT NULL,
          parameters_schema NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          default_parameters NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          thumbnail_path NVARCHAR(MAX) NULL,
          preview_gltf_path NVARCHAR(MAX) NULL,
          use_count INT NULL DEFAULT 0,
          is_public BIT NULL DEFAULT 0,
          created_by UNIQUEIDENTIFIER NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_engineering_part_library PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('engineering.drawings', 'U') IS NULL
      BEGIN
        CREATE TABLE engineering.drawings (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          project_id UNIQUEIDENTIFIER NOT NULL,
          task_id UNIQUEIDENTIFIER NULL,
          conversation_id UNIQUEIDENTIFIER NULL,
          name NVARCHAR(MAX) NOT NULL,
          description NVARCHAR(MAX) NULL,
          prompt NVARCHAR(MAX) NOT NULL,
          version INT NOT NULL DEFAULT 1,
          parent_drawing_id UNIQUEIDENTIFIER NULL,
          status NVARCHAR(MAX) NULL DEFAULT N'pending',
          constraints_override NVARCHAR(MAX) NULL,
          error_message NVARCHAR(MAX) NULL,
          created_by UNIQUEIDENTIFIER NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          completed_at DATETIME2 NULL,
          CONSTRAINT PK_engineering_drawings PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('engineering.generated_code', 'U') IS NULL
      BEGIN
        CREATE TABLE engineering.generated_code (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          drawing_id UNIQUEIDENTIFIER NOT NULL,
          code NVARCHAR(MAX) NOT NULL,
          code_type NVARCHAR(MAX) NOT NULL DEFAULT N'opencascade-js',
          llm_provider NVARCHAR(MAX) NOT NULL,
          llm_model NVARCHAR(MAX) NOT NULL,
          prompt_tokens INT NULL,
          completion_tokens INT NULL,
          generation_time_ms INT NULL,
          is_valid BIT NULL,
          validation_errors NVARCHAR(MAX) NULL DEFAULT N'[]',
          attempt_number INT NOT NULL DEFAULT 1,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_engineering_generated_code PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('engineering.cad_outputs', 'U') IS NULL
      BEGIN
        CREATE TABLE engineering.cad_outputs (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          drawing_id UNIQUEIDENTIFIER NOT NULL,
          generated_code_id UNIQUEIDENTIFIER NULL,
          format NVARCHAR(MAX) NOT NULL,
          storage_path NVARCHAR(MAX) NOT NULL,
          file_size_bytes BIGINT NULL,
          mesh_stats NVARCHAR(MAX) NULL,
          export_time_ms INT NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_engineering_cad_outputs PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('engineering.execution_log', 'U') IS NULL
      BEGIN
        CREATE TABLE engineering.execution_log (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          drawing_id UNIQUEIDENTIFIER NOT NULL,
          step_type NVARCHAR(MAX) NOT NULL,
          message NVARCHAR(MAX) NULL,
          details NVARCHAR(MAX) NULL DEFAULT N'{}',
          duration_ms INT NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_engineering_execution_log PRIMARY KEY (id)
        );
      END;
    `);
    console.log('engineering schema ready');

    // ================================================================
    // STEP 8: leads schema
    // ================================================================
    await pool.request().query(`
      IF OBJECT_ID('leads.agent_idea_submissions', 'U') IS NULL
      BEGIN
        CREATE TABLE leads.agent_idea_submissions (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          email NVARCHAR(MAX) NOT NULL,
          name NVARCHAR(MAX) NULL,
          company NVARCHAR(MAX) NULL,
          phone NVARCHAR(MAX) NULL,
          industry_input NVARCHAR(MAX) NOT NULL,
          normalized_industry NVARCHAR(MAX) NULL,
          industry_description NVARCHAR(MAX) NULL,
          selected_agents NVARCHAR(MAX) NOT NULL DEFAULT N'[]',
          all_recommendations NVARCHAR(MAX) NULL,
          is_fallback BIT NULL DEFAULT 0,
          processing_time_ms INT NULL,
          status NVARCHAR(MAX) NOT NULL DEFAULT N'new',
          notes NVARCHAR(MAX) NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          contacted_at DATETIME2 NULL,
          CONSTRAINT PK_leads_agent_idea_submissions PRIMARY KEY (id)
        );
      END;
    `);
    console.log('leads schema ready');

    // ================================================================
    // STEP 9: marketing schema
    // ================================================================
    await pool.request().query(`
      IF OBJECT_ID('marketing.content_types', 'U') IS NULL
      BEGIN
        CREATE TABLE marketing.content_types (
          slug NVARCHAR(255) NOT NULL,
          organization_slug NVARCHAR(MAX) NOT NULL,
          name NVARCHAR(MAX) NOT NULL,
          description NVARCHAR(MAX) NULL,
          system_context NVARCHAR(MAX) NOT NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_marketing_content_types PRIMARY KEY (slug)
        );
      END;

      IF OBJECT_ID('marketing.agents', 'U') IS NULL
      BEGIN
        CREATE TABLE marketing.agents (
          slug NVARCHAR(255) NOT NULL,
          organization_slug NVARCHAR(MAX) NOT NULL,
          role NVARCHAR(MAX) NOT NULL,
          name NVARCHAR(MAX) NOT NULL,
          personality NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          is_active BIT NULL DEFAULT 1,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_marketing_agents PRIMARY KEY (slug)
        );
      END;

      IF OBJECT_ID('marketing.agent_llm_configs', 'U') IS NULL
      BEGIN
        CREATE TABLE marketing.agent_llm_configs (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          agent_slug NVARCHAR(MAX) NOT NULL,
          llm_provider NVARCHAR(MAX) NOT NULL,
          llm_model NVARCHAR(MAX) NOT NULL,
          display_name NVARCHAR(MAX) NULL,
          is_default BIT NULL DEFAULT 0,
          is_local BIT NULL DEFAULT 0,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_marketing_agent_llm_configs PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('marketing.swarm_tasks', 'U') IS NULL
      BEGIN
        CREATE TABLE marketing.swarm_tasks (
          task_id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          organization_slug NVARCHAR(MAX) NOT NULL,
          user_id UNIQUEIDENTIFIER NULL,
          conversation_id UNIQUEIDENTIFIER NULL,
          content_type_slug NVARCHAR(MAX) NULL,
          prompt_data NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          config NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          status NVARCHAR(MAX) NULL DEFAULT N'pending',
          progress NVARCHAR(MAX) NULL DEFAULT N'{}',
          error_message NVARCHAR(MAX) NULL,
          started_at DATETIME2 NULL,
          completed_at DATETIME2 NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_marketing_swarm_tasks PRIMARY KEY (task_id)
        );
      END;

      IF OBJECT_ID('marketing.outputs', 'U') IS NULL
      BEGIN
        CREATE TABLE marketing.outputs (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          task_id UNIQUEIDENTIFIER NOT NULL,
          writer_agent_slug NVARCHAR(MAX) NULL,
          editor_agent_slug NVARCHAR(MAX) NULL,
          content NVARCHAR(MAX) NULL,
          edit_cycle INT NULL DEFAULT 0,
          status NVARCHAR(MAX) NULL DEFAULT N'draft',
          editor_feedback NVARCHAR(MAX) NULL,
          editor_approved BIT NULL,
          llm_metadata NVARCHAR(MAX) NULL,
          initial_avg_score DECIMAL(3,1) NULL,
          initial_rank INT NULL,
          is_finalist BIT NULL DEFAULT 0,
          final_total_score INT NULL,
          final_rank INT NULL,
          writer_llm_provider NVARCHAR(MAX) NULL,
          writer_llm_model NVARCHAR(MAX) NULL,
          editor_llm_provider NVARCHAR(MAX) NULL,
          editor_llm_model NVARCHAR(MAX) NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_marketing_outputs PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('marketing.evaluations', 'U') IS NULL
      BEGIN
        CREATE TABLE marketing.evaluations (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          task_id UNIQUEIDENTIFIER NOT NULL,
          output_id UNIQUEIDENTIFIER NOT NULL,
          evaluator_agent_slug NVARCHAR(MAX) NULL,
          score INT NULL,
          reasoning NVARCHAR(MAX) NULL,
          criteria_scores NVARCHAR(MAX) NULL,
          llm_metadata NVARCHAR(MAX) NULL,
          stage NVARCHAR(MAX) NULL DEFAULT N'initial',
          status NVARCHAR(MAX) NULL DEFAULT N'pending',
          rank INT NULL,
          weighted_score INT NULL,
          evaluator_llm_provider NVARCHAR(MAX) NULL,
          evaluator_llm_model NVARCHAR(MAX) NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_marketing_evaluations PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('marketing.output_versions', 'U') IS NULL
      BEGIN
        CREATE TABLE marketing.output_versions (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          output_id UNIQUEIDENTIFIER NOT NULL,
          task_id UNIQUEIDENTIFIER NOT NULL,
          version_number INT NOT NULL DEFAULT 1,
          content NVARCHAR(MAX) NOT NULL,
          action_type NVARCHAR(MAX) NOT NULL,
          editor_feedback NVARCHAR(MAX) NULL,
          llm_metadata NVARCHAR(MAX) NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_marketing_output_versions PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('marketing.execution_queue', 'U') IS NULL
      BEGIN
        CREATE TABLE marketing.execution_queue (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          task_id UNIQUEIDENTIFIER NOT NULL,
          step_type NVARCHAR(MAX) NOT NULL,
          sequence INT NOT NULL,
          agent_slug NVARCHAR(MAX) NULL,
          depends_on NVARCHAR(MAX) NULL,
          input_output_id UNIQUEIDENTIFIER NULL,
          status NVARCHAR(MAX) NULL DEFAULT N'pending',
          result_id UNIQUEIDENTIFIER NULL,
          error_message NVARCHAR(MAX) NULL,
          provider NVARCHAR(MAX) NOT NULL,
          llm_provider NVARCHAR(MAX) NULL,
          llm_model NVARCHAR(MAX) NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          started_at DATETIME2 NULL,
          completed_at DATETIME2 NULL,
          CONSTRAINT PK_marketing_execution_queue PRIMARY KEY (id)
        );
      END;
    `);
    console.log('marketing schema ready');

    // ================================================================
    // STEP 10: orch_flow schema
    // ================================================================
    await pool.request().query(`
      IF OBJECT_ID('orch_flow.profiles', 'U') IS NULL
      BEGIN
        CREATE TABLE orch_flow.profiles (
          id UNIQUEIDENTIFIER NOT NULL,
          display_name NVARCHAR(MAX) NOT NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_orch_flow_profiles PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('orch_flow.channels', 'U') IS NULL
      BEGIN
        CREATE TABLE orch_flow.channels (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          team_id UNIQUEIDENTIFIER NULL,
          name NVARCHAR(MAX) NOT NULL,
          description NVARCHAR(MAX) NULL,
          created_by_user_id UNIQUEIDENTIFIER NULL,
          created_by_guest NVARCHAR(MAX) NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_orch_flow_channels PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('orch_flow.efforts', 'U') IS NULL
      BEGIN
        CREATE TABLE orch_flow.efforts (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          organization_slug NVARCHAR(MAX) NULL,
          name NVARCHAR(MAX) NOT NULL,
          description NVARCHAR(MAX) NULL,
          status NVARCHAR(MAX) NULL DEFAULT N'not_started',
          order_index INT NOT NULL DEFAULT 0,
          icon NVARCHAR(MAX) NULL,
          color NVARCHAR(MAX) NULL,
          estimated_days INT NULL,
          team_id UNIQUEIDENTIFIER NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_orch_flow_efforts PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('orch_flow.sprints', 'U') IS NULL
      BEGIN
        CREATE TABLE orch_flow.sprints (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          team_id UNIQUEIDENTIFIER NULL,
          name NVARCHAR(MAX) NOT NULL,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          is_active BIT NULL DEFAULT 0,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_orch_flow_sprints PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('orch_flow.journey_templates', 'U') IS NULL
      BEGIN
        CREATE TABLE orch_flow.journey_templates (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          slug NVARCHAR(MAX) NOT NULL,
          name NVARCHAR(MAX) NOT NULL,
          description NVARCHAR(MAX) NULL,
          icon NVARCHAR(MAX) NULL,
          template_data NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          is_active BIT NULL DEFAULT 1,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_orch_flow_journey_templates PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('orch_flow.projects', 'U') IS NULL
      BEGIN
        CREATE TABLE orch_flow.projects (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          effort_id UNIQUEIDENTIFIER NOT NULL,
          name NVARCHAR(MAX) NOT NULL,
          description NVARCHAR(MAX) NULL,
          status NVARCHAR(MAX) NULL DEFAULT N'not_started',
          order_index INT NOT NULL DEFAULT 0,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_orch_flow_projects PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('orch_flow.tasks', 'U') IS NULL
      BEGIN
        CREATE TABLE orch_flow.tasks (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          project_id UNIQUEIDENTIFIER NOT NULL,
          title NVARCHAR(MAX) NOT NULL,
          description NVARCHAR(MAX) NULL,
          status NVARCHAR(MAX) NULL DEFAULT N'pending',
          assignee_id UNIQUEIDENTIFIER NULL,
          due_date DATE NULL,
          order_index INT NOT NULL DEFAULT 0,
          documentation_url NVARCHAR(MAX) NULL,
          is_milestone BIT NULL DEFAULT 0,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_orch_flow_tasks PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('orch_flow.shared_tasks', 'U') IS NULL
      BEGIN
        CREATE TABLE orch_flow.shared_tasks (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          team_id UNIQUEIDENTIFIER NULL,
          title NVARCHAR(MAX) NOT NULL,
          is_completed BIT NULL DEFAULT 0,
          assigned_to NVARCHAR(MAX) NULL,
          user_id UNIQUEIDENTIFIER NULL,
          status NVARCHAR(MAX) NOT NULL DEFAULT N'today',
          parent_task_id UNIQUEIDENTIFIER NULL,
          pomodoro_count INT NULL DEFAULT 0,
          project_id UNIQUEIDENTIFIER NULL,
          sprint_id UNIQUEIDENTIFIER NULL,
          due_date DATETIME2 NULL,
          description NVARCHAR(MAX) NULL,
          channel_id UNIQUEIDENTIFIER NULL,
          source_channel_user_id UNIQUEIDENTIFIER NULL,
          external_provider NVARCHAR(MAX) NULL,
          external_task_id NVARCHAR(MAX) NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_orch_flow_shared_tasks PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('orch_flow.channel_messages', 'U') IS NULL
      BEGIN
        CREATE TABLE orch_flow.channel_messages (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          channel_id UNIQUEIDENTIFIER NOT NULL,
          content NVARCHAR(MAX) NOT NULL,
          user_id UNIQUEIDENTIFIER NULL,
          guest_name NVARCHAR(MAX) NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_orch_flow_channel_messages PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('orch_flow.notifications', 'U') IS NULL
      BEGIN
        CREATE TABLE orch_flow.notifications (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          user_id UNIQUEIDENTIFIER NULL,
          guest_name NVARCHAR(MAX) NULL,
          type NVARCHAR(MAX) NOT NULL,
          task_id UNIQUEIDENTIFIER NULL,
          message NVARCHAR(MAX) NOT NULL,
          is_read BIT NULL DEFAULT 0,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_orch_flow_notifications PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('orch_flow.task_collaborators', 'U') IS NULL
      BEGIN
        CREATE TABLE orch_flow.task_collaborators (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          task_id UNIQUEIDENTIFIER NOT NULL,
          user_id UNIQUEIDENTIFIER NULL,
          guest_name NVARCHAR(MAX) NULL,
          joined_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_orch_flow_task_collaborators PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('orch_flow.task_watchers', 'U') IS NULL
      BEGIN
        CREATE TABLE orch_flow.task_watchers (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          task_id UNIQUEIDENTIFIER NOT NULL,
          user_id UNIQUEIDENTIFIER NULL,
          guest_name NVARCHAR(MAX) NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_orch_flow_task_watchers PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('orch_flow.task_update_requests', 'U') IS NULL
      BEGIN
        CREATE TABLE orch_flow.task_update_requests (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          task_id UNIQUEIDENTIFIER NOT NULL,
          requested_by_user_id UNIQUEIDENTIFIER NULL,
          requested_by_guest NVARCHAR(MAX) NULL,
          message NVARCHAR(MAX) NULL,
          is_resolved BIT NULL DEFAULT 0,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_orch_flow_task_update_requests PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('orch_flow.team_files', 'U') IS NULL
      BEGIN
        CREATE TABLE orch_flow.team_files (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          team_id UNIQUEIDENTIFIER NOT NULL,
          parent_id UNIQUEIDENTIFIER NULL,
          name NVARCHAR(MAX) NOT NULL,
          is_folder BIT NOT NULL DEFAULT 0,
          content NVARCHAR(MAX) NULL,
          file_type NVARCHAR(MAX) NOT NULL DEFAULT N'markdown',
          size_bytes INT NOT NULL DEFAULT 0,
          created_by_user_id UNIQUEIDENTIFIER NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_orch_flow_team_files PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('orch_flow.timer_state', 'U') IS NULL
      BEGIN
        CREATE TABLE orch_flow.timer_state (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          team_id UNIQUEIDENTIFIER NULL,
          end_time DATETIME2 NULL,
          is_running BIT NULL DEFAULT 0,
          is_break BIT NULL DEFAULT 0,
          duration_seconds INT NULL DEFAULT 1500,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_orch_flow_timer_state PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('orch_flow.user_presence', 'U') IS NULL
      BEGIN
        CREATE TABLE orch_flow.user_presence (
          user_id UNIQUEIDENTIFIER NOT NULL,
          last_active_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_orch_flow_user_presence PRIMARY KEY (user_id)
        );
      END;

      IF OBJECT_ID('orch_flow.learning_progress', 'U') IS NULL
      BEGIN
        CREATE TABLE orch_flow.learning_progress (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          user_id UNIQUEIDENTIFIER NOT NULL,
          organization_slug NVARCHAR(MAX) NOT NULL,
          milestone_key NVARCHAR(MAX) NOT NULL,
          completed_at DATETIME2 NULL,
          notes NVARCHAR(MAX) NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_orch_flow_learning_progress PRIMARY KEY (id)
        );
      END;
    `);
    console.log('orch_flow schema ready');

    // ================================================================
    // STEP 11: prediction schema
    // ================================================================
    await pool.request().query(`
      IF OBJECT_ID('prediction.test_scenarios', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.test_scenarios (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          name NVARCHAR(MAX) NOT NULL,
          description NVARCHAR(MAX) NULL,
          injection_points NVARCHAR(MAX) NOT NULL DEFAULT N'[]',
          target_id UNIQUEIDENTIFIER NULL,
          organization_slug NVARCHAR(MAX) NOT NULL,
          config NVARCHAR(MAX) NULL DEFAULT N'{}',
          created_by NVARCHAR(MAX) NULL,
          status NVARCHAR(MAX) NOT NULL DEFAULT N'active',
          results NVARCHAR(MAX) NULL,
          scenario_type NVARCHAR(MAX) NULL DEFAULT N'custom',
          expected_outcome NVARCHAR(MAX) NULL DEFAULT N'{}',
          target_symbols NVARCHAR(MAX) NULL DEFAULT N'[]',
          tags NVARCHAR(MAX) NULL DEFAULT N'[]',
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          started_at DATETIME2 NULL,
          completed_at DATETIME2 NULL,
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_test_scenarios PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.strategies', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.strategies (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          slug NVARCHAR(MAX) NOT NULL,
          name NVARCHAR(MAX) NOT NULL,
          description NVARCHAR(MAX) NULL,
          risk_level NVARCHAR(MAX) NOT NULL,
          thresholds NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          analyst_weights NVARCHAR(MAX) NULL DEFAULT N'{}',
          is_system BIT NOT NULL DEFAULT 0,
          is_active BIT NOT NULL DEFAULT 1,
          is_test_data BIT NULL DEFAULT 0,
          test_scenario_id UNIQUEIDENTIFIER NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_strategies PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.universes', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.universes (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          organization_slug NVARCHAR(MAX) NOT NULL,
          agent_slug NVARCHAR(MAX) NOT NULL,
          name NVARCHAR(MAX) NOT NULL,
          description NVARCHAR(MAX) NULL,
          domain NVARCHAR(MAX) NOT NULL,
          strategy_id UNIQUEIDENTIFIER NULL,
          llm_config NVARCHAR(MAX) NULL,
          thresholds NVARCHAR(MAX) NULL,
          notification_config NVARCHAR(MAX) NULL DEFAULT N'{}',
          is_active BIT NOT NULL DEFAULT 1,
          is_test_data BIT NULL DEFAULT 0,
          test_scenario_id UNIQUEIDENTIFIER NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_universes PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.targets', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.targets (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          universe_id UNIQUEIDENTIFIER NOT NULL,
          symbol NVARCHAR(MAX) NOT NULL,
          name NVARCHAR(MAX) NOT NULL,
          target_type NVARCHAR(MAX) NOT NULL,
          context NVARCHAR(MAX) NULL,
          metadata NVARCHAR(MAX) NULL DEFAULT N'{}',
          llm_config_override NVARCHAR(MAX) NULL,
          is_active BIT NOT NULL DEFAULT 1,
          is_archived BIT NOT NULL DEFAULT 0,
          is_test_data BIT NULL DEFAULT 0,
          test_scenario_id UNIQUEIDENTIFIER NULL,
          current_price DECIMAL(18,6) NULL,
          price_updated_at DATETIME2 NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_targets PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.position_sizing_config', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.position_sizing_config (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          org_slug NVARCHAR(MAX) NOT NULL DEFAULT N'*',
          tier_name NVARCHAR(MAX) NOT NULL,
          min_confidence DECIMAL(4,2) NOT NULL,
          max_confidence DECIMAL(4,2) NOT NULL,
          position_percent DECIMAL(4,2) NOT NULL,
          is_active BIT NOT NULL DEFAULT 1,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_position_sizing_config PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.runner_context_versions', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.runner_context_versions (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          runner_type NVARCHAR(MAX) NOT NULL,
          version_number INT NOT NULL DEFAULT 1,
          context NVARCHAR(MAX) NULL,
          model_config NVARCHAR(MAX) NULL DEFAULT N'{}',
          learning_config NVARCHAR(MAX) NULL DEFAULT N'{}',
          risk_profile NVARCHAR(MAX) NULL DEFAULT N'moderate',
          change_reason NVARCHAR(MAX) NULL,
          changed_by NVARCHAR(MAX) NOT NULL DEFAULT N'system',
          is_current BIT NOT NULL DEFAULT 1,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_runner_context_versions PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.universe_context_versions', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.universe_context_versions (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          universe_id UNIQUEIDENTIFIER NOT NULL,
          version_number INT NOT NULL DEFAULT 1,
          description NVARCHAR(MAX) NULL,
          llm_config NVARCHAR(MAX) NULL DEFAULT N'{}',
          thresholds NVARCHAR(MAX) NULL DEFAULT N'{}',
          change_reason NVARCHAR(MAX) NULL,
          changed_by NVARCHAR(MAX) NOT NULL DEFAULT N'system',
          is_current BIT NOT NULL DEFAULT 1,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_universe_context_versions PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.target_context_versions', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.target_context_versions (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          target_id UNIQUEIDENTIFIER NOT NULL,
          version_number INT NOT NULL DEFAULT 1,
          context NVARCHAR(MAX) NULL,
          metadata NVARCHAR(MAX) NULL DEFAULT N'{}',
          llm_config_override NVARCHAR(MAX) NULL,
          change_reason NVARCHAR(MAX) NULL,
          changed_by NVARCHAR(MAX) NOT NULL DEFAULT N'system',
          is_current BIT NOT NULL DEFAULT 1,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_target_context_versions PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.analysts', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.analysts (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          scope_level NVARCHAR(MAX) NOT NULL DEFAULT N'runner',
          domain NVARCHAR(MAX) NULL,
          universe_id UNIQUEIDENTIFIER NULL,
          target_id UNIQUEIDENTIFIER NULL,
          slug NVARCHAR(MAX) NOT NULL,
          name NVARCHAR(MAX) NOT NULL,
          perspective NVARCHAR(MAX) NOT NULL,
          tier_instructions NVARCHAR(MAX) NULL DEFAULT N'{}',
          default_weight DECIMAL(3,2) NOT NULL DEFAULT 1.00,
          learned_patterns NVARCHAR(MAX) NULL DEFAULT N'[]',
          agent_id UNIQUEIDENTIFIER NULL,
          is_enabled BIT NOT NULL DEFAULT 1,
          is_test_data BIT NULL DEFAULT 0,
          test_scenario_id UNIQUEIDENTIFIER NULL,
          analyst_type NVARCHAR(MAX) NOT NULL DEFAULT N'context_provider',
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_analysts PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.analyst_context_versions', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.analyst_context_versions (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          analyst_id UNIQUEIDENTIFIER NOT NULL,
          fork_type NVARCHAR(MAX) NOT NULL DEFAULT N'user',
          version_number INT NOT NULL DEFAULT 1,
          perspective NVARCHAR(MAX) NOT NULL,
          tier_instructions NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          default_weight DECIMAL(5,4) NOT NULL DEFAULT 1.0000,
          agent_journal NVARCHAR(MAX) NULL,
          change_reason NVARCHAR(MAX) NULL,
          changed_by NVARCHAR(MAX) NOT NULL DEFAULT N'system',
          is_current BIT NOT NULL DEFAULT 1,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_analyst_context_versions PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.analyst_portfolios', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.analyst_portfolios (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          analyst_id UNIQUEIDENTIFIER NOT NULL,
          fork_type NVARCHAR(MAX) NOT NULL DEFAULT N'user',
          initial_balance DECIMAL(20,8) NOT NULL DEFAULT 1000000.00,
          current_balance DECIMAL(20,8) NOT NULL DEFAULT 1000000.00,
          total_realized_pnl DECIMAL(20,8) NOT NULL DEFAULT 0,
          total_unrealized_pnl DECIMAL(20,8) NOT NULL DEFAULT 0,
          win_count INT NOT NULL DEFAULT 0,
          loss_count INT NOT NULL DEFAULT 0,
          status NVARCHAR(MAX) NOT NULL DEFAULT N'active',
          status_changed_at DATETIME2 NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_analyst_portfolios PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.predictions', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.predictions (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          target_id UNIQUEIDENTIFIER NOT NULL,
          task_id UNIQUEIDENTIFIER NULL,
          direction NVARCHAR(MAX) NOT NULL,
          confidence DECIMAL(3,2) NOT NULL,
          magnitude NVARCHAR(MAX) NULL,
          reasoning NVARCHAR(MAX) NOT NULL,
          timeframe_hours INT NOT NULL,
          predicted_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          expires_at DATETIME2 NOT NULL,
          entry_price DECIMAL(20,8) NULL,
          target_price DECIMAL(20,8) NULL,
          stop_loss DECIMAL(20,8) NULL,
          analyst_ensemble NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          llm_ensemble NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          status NVARCHAR(MAX) NOT NULL DEFAULT N'active',
          outcome_value DECIMAL(20,8) NULL,
          outcome_captured_at DATETIME2 NULL,
          resolution_notes NVARCHAR(MAX) NULL,
          is_test_data BIT NULL DEFAULT 0,
          test_scenario_id UNIQUEIDENTIFIER NULL,
          is_test BIT NOT NULL DEFAULT 0,
          scenario_run_id UNIQUEIDENTIFIER NULL,
          recommended_quantity DECIMAL(20,8) NULL,
          quantity_reasoning NVARCHAR(MAX) NULL,
          runner_context_version_id UNIQUEIDENTIFIER NULL,
          analyst_context_version_ids NVARCHAR(MAX) NULL DEFAULT N'{}',
          universe_context_version_id UNIQUEIDENTIFIER NULL,
          target_context_version_id UNIQUEIDENTIFIER NULL,
          analyst_slug NVARCHAR(MAX) NULL,
          is_arbitrator BIT NULL DEFAULT 0,
          context_mode NVARCHAR(MAX) NULL DEFAULT N'combined',
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_predictions PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.predictors', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.predictors (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          target_id UNIQUEIDENTIFIER NOT NULL,
          direction NVARCHAR(MAX) NOT NULL,
          strength INT NOT NULL,
          confidence DECIMAL(3,2) NOT NULL,
          reasoning NVARCHAR(MAX) NOT NULL,
          analyst_slug NVARCHAR(MAX) NOT NULL,
          analyst_assessment NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          llm_usage_id UNIQUEIDENTIFIER NULL,
          status NVARCHAR(MAX) NOT NULL DEFAULT N'active',
          consumed_at DATETIME2 NULL,
          consumed_by_prediction_id UNIQUEIDENTIFIER NULL,
          expires_at DATETIME2 NOT NULL,
          is_test_data BIT NULL DEFAULT 0,
          test_scenario_id UNIQUEIDENTIFIER NULL,
          is_test BIT NOT NULL DEFAULT 0,
          scenario_run_id UNIQUEIDENTIFIER NULL,
          article_id UNIQUEIDENTIFIER NULL,
          fork_type NVARCHAR(MAX) NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_predictors PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.signals', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.signals (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          target_id UNIQUEIDENTIFIER NOT NULL,
          source_id UNIQUEIDENTIFIER NOT NULL,
          content NVARCHAR(MAX) NOT NULL,
          direction NVARCHAR(MAX) NOT NULL,
          detected_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          url NVARCHAR(MAX) NULL,
          metadata NVARCHAR(MAX) NULL DEFAULT N'{}',
          disposition NVARCHAR(MAX) NOT NULL DEFAULT N'pending',
          urgency NVARCHAR(MAX) NULL,
          processing_worker UNIQUEIDENTIFIER NULL,
          processing_started_at DATETIME2 NULL,
          evaluation_result NVARCHAR(MAX) NULL,
          review_queue_id UNIQUEIDENTIFIER NULL,
          expired_at DATETIME2 NULL,
          is_test_data BIT NULL DEFAULT 0,
          test_scenario_id UNIQUEIDENTIFIER NULL,
          is_test BIT NOT NULL DEFAULT 0,
          scenario_run_id UNIQUEIDENTIFIER NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_signals PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.source_subscriptions', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.source_subscriptions (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          source_id UNIQUEIDENTIFIER NOT NULL,
          target_id UNIQUEIDENTIFIER NOT NULL,
          universe_id UNIQUEIDENTIFIER NOT NULL,
          filter_config NVARCHAR(MAX) NULL DEFAULT N'{}',
          last_processed_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          is_active BIT NOT NULL DEFAULT 1,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_source_subscriptions PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.evaluations', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.evaluations (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          prediction_id UNIQUEIDENTIFIER NOT NULL,
          direction_correct BIT NOT NULL,
          direction_score DECIMAL(3,2) NOT NULL,
          magnitude_accuracy DECIMAL(3,2) NULL,
          actual_magnitude NVARCHAR(MAX) NULL,
          timing_score DECIMAL(3,2) NULL,
          analyst_scores NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          llm_tier_scores NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          overall_score DECIMAL(3,2) NOT NULL,
          analysis NVARCHAR(MAX) NULL,
          suggested_learnings NVARCHAR(MAX) NULL DEFAULT N'[]',
          is_test_data BIT NULL DEFAULT 0,
          test_scenario_id UNIQUEIDENTIFIER NULL,
          is_test BIT NOT NULL DEFAULT 0,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_evaluations PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.analyst_assessments', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.analyst_assessments (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          predictor_id UNIQUEIDENTIFIER NULL,
          prediction_id UNIQUEIDENTIFIER NULL,
          analyst_id UNIQUEIDENTIFIER NOT NULL,
          llm_tier NVARCHAR(MAX) NOT NULL,
          direction NVARCHAR(MAX) NOT NULL,
          confidence DECIMAL(3,2) NOT NULL,
          reasoning NVARCHAR(MAX) NOT NULL,
          learnings_applied NVARCHAR(MAX) NULL DEFAULT N'[]',
          llm_usage_id UNIQUEIDENTIFIER NULL,
          fork_type NVARCHAR(MAX) NULL DEFAULT N'user',
          context_version_id UNIQUEIDENTIFIER NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_analyst_assessments PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.analyst_overrides', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.analyst_overrides (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          analyst_id UNIQUEIDENTIFIER NOT NULL,
          universe_id UNIQUEIDENTIFIER NULL,
          target_id UNIQUEIDENTIFIER NULL,
          weight_override DECIMAL(3,2) NULL,
          tier_override NVARCHAR(MAX) NULL,
          is_enabled_override BIT NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_analyst_overrides PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.analyst_performance_metrics', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.analyst_performance_metrics (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          analyst_id UNIQUEIDENTIFIER NOT NULL,
          fork_type NVARCHAR(MAX) NOT NULL,
          metric_date DATE NOT NULL,
          solo_pnl DECIMAL(20,8) NOT NULL DEFAULT 0,
          contribution_pnl DECIMAL(20,8) NOT NULL DEFAULT 0,
          dissent_accuracy DECIMAL(5,4) NULL,
          dissent_count INT NOT NULL DEFAULT 0,
          rank_in_portfolio INT NULL,
          total_analysts INT NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_analyst_performance_metrics PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.analyst_positions', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.analyst_positions (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          portfolio_id UNIQUEIDENTIFIER NOT NULL,
          analyst_assessment_id UNIQUEIDENTIFIER NULL,
          prediction_id UNIQUEIDENTIFIER NULL,
          target_id UNIQUEIDENTIFIER NOT NULL,
          symbol NVARCHAR(MAX) NOT NULL,
          direction NVARCHAR(MAX) NOT NULL,
          quantity DECIMAL(20,8) NOT NULL,
          entry_price DECIMAL(20,8) NOT NULL,
          current_price DECIMAL(20,8) NOT NULL,
          exit_price DECIMAL(20,8) NULL,
          unrealized_pnl DECIMAL(20,8) NOT NULL DEFAULT 0,
          realized_pnl DECIMAL(20,8) NULL,
          is_paper_only BIT NOT NULL DEFAULT 0,
          status NVARCHAR(MAX) NOT NULL DEFAULT N'open',
          fork_type NVARCHAR(MAX) NULL DEFAULT N'user',
          opened_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          closed_at DATETIME2 NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_analyst_positions PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.learnings', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.learnings (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          scope_level NVARCHAR(MAX) NOT NULL DEFAULT N'runner',
          domain NVARCHAR(MAX) NULL,
          universe_id UNIQUEIDENTIFIER NULL,
          target_id UNIQUEIDENTIFIER NULL,
          analyst_id UNIQUEIDENTIFIER NULL,
          learning_type NVARCHAR(MAX) NOT NULL,
          title NVARCHAR(MAX) NOT NULL,
          description NVARCHAR(MAX) NOT NULL,
          config NVARCHAR(MAX) NULL DEFAULT N'{}',
          source_type NVARCHAR(MAX) NOT NULL DEFAULT N'human',
          source_evaluation_id UNIQUEIDENTIFIER NULL,
          source_missed_opportunity_id UNIQUEIDENTIFIER NULL,
          status NVARCHAR(MAX) NOT NULL DEFAULT N'active',
          superseded_by UNIQUEIDENTIFIER NULL,
          version INT NOT NULL DEFAULT 1,
          times_applied INT NOT NULL DEFAULT 0,
          times_helpful INT NOT NULL DEFAULT 0,
          is_test_data BIT NULL DEFAULT 0,
          test_scenario_id UNIQUEIDENTIFIER NULL,
          is_test BIT NOT NULL DEFAULT 0,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_learnings PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.missed_opportunities', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.missed_opportunities (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          target_id UNIQUEIDENTIFIER NOT NULL,
          move_type NVARCHAR(MAX) NOT NULL,
          move_start_at DATETIME2 NOT NULL,
          move_end_at DATETIME2 NOT NULL,
          start_value DECIMAL(20,8) NOT NULL,
          end_value DECIMAL(20,8) NOT NULL,
          percent_change DECIMAL(10,4) NOT NULL,
          detected_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          detection_method NVARCHAR(MAX) NOT NULL,
          discovered_drivers NVARCHAR(MAX) NULL DEFAULT N'[]',
          signals_we_had NVARCHAR(MAX) NULL DEFAULT N'[]',
          signals_we_missed NVARCHAR(MAX) NULL DEFAULT N'[]',
          source_gaps NVARCHAR(MAX) NULL DEFAULT N'[]',
          suggested_learnings NVARCHAR(MAX) NULL DEFAULT N'[]',
          analysis_status NVARCHAR(MAX) NOT NULL DEFAULT N'pending',
          analysis_error NVARCHAR(MAX) NULL,
          llm_usage_id UNIQUEIDENTIFIER NULL,
          is_test_data BIT NULL DEFAULT 0,
          test_scenario_id UNIQUEIDENTIFIER NULL,
          is_test BIT NOT NULL DEFAULT 0,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_missed_opportunities PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.review_queue', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.review_queue (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          signal_id UNIQUEIDENTIFIER NOT NULL,
          original_direction NVARCHAR(MAX) NOT NULL,
          original_confidence DECIMAL(3,2) NOT NULL,
          original_reasoning NVARCHAR(MAX) NOT NULL,
          status NVARCHAR(MAX) NOT NULL DEFAULT N'pending',
          reviewed_at DATETIME2 NULL,
          reviewed_by_user_id UNIQUEIDENTIFIER NULL,
          response_direction NVARCHAR(MAX) NULL,
          response_strength INT NULL,
          response_notes NVARCHAR(MAX) NULL,
          create_learning BIT NULL DEFAULT 0,
          predictor_id UNIQUEIDENTIFIER NULL,
          is_test_data BIT NULL DEFAULT 0,
          test_scenario_id UNIQUEIDENTIFIER NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_review_queue PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.learning_queue', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.learning_queue (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          suggested_scope_level NVARCHAR(MAX) NOT NULL,
          suggested_domain NVARCHAR(MAX) NULL,
          suggested_universe_id UNIQUEIDENTIFIER NULL,
          suggested_target_id UNIQUEIDENTIFIER NULL,
          suggested_analyst_id UNIQUEIDENTIFIER NULL,
          suggested_learning_type NVARCHAR(MAX) NOT NULL,
          suggested_title NVARCHAR(MAX) NOT NULL,
          suggested_description NVARCHAR(MAX) NOT NULL,
          suggested_config NVARCHAR(MAX) NULL DEFAULT N'{}',
          source_evaluation_id UNIQUEIDENTIFIER NULL,
          source_missed_opportunity_id UNIQUEIDENTIFIER NULL,
          ai_reasoning NVARCHAR(MAX) NOT NULL,
          ai_confidence DECIMAL(3,2) NOT NULL,
          status NVARCHAR(MAX) NOT NULL DEFAULT N'pending',
          reviewed_at DATETIME2 NULL,
          reviewed_by_user_id UNIQUEIDENTIFIER NULL,
          reviewer_notes NVARCHAR(MAX) NULL,
          final_scope_level NVARCHAR(MAX) NULL,
          final_domain NVARCHAR(MAX) NULL,
          final_universe_id UNIQUEIDENTIFIER NULL,
          final_target_id UNIQUEIDENTIFIER NULL,
          final_analyst_id UNIQUEIDENTIFIER NULL,
          learning_id UNIQUEIDENTIFIER NULL,
          is_test_data BIT NULL DEFAULT 0,
          test_scenario_id UNIQUEIDENTIFIER NULL,
          is_test BIT NOT NULL DEFAULT 0,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_learning_queue PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.snapshots', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.snapshots (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          prediction_id UNIQUEIDENTIFIER NOT NULL,
          predictors NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          rejected_signals NVARCHAR(MAX) NULL DEFAULT N'[]',
          analyst_predictions NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          llm_ensemble NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          learnings_applied NVARCHAR(MAX) NULL DEFAULT N'[]',
          threshold_evaluation NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          timeline NVARCHAR(MAX) NOT NULL DEFAULT N'[]',
          is_test_data BIT NULL DEFAULT 0,
          test_scenario_id UNIQUEIDENTIFIER NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_snapshots PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.target_snapshots', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.target_snapshots (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          target_id UNIQUEIDENTIFIER NOT NULL,
          value DECIMAL(20,8) NOT NULL,
          captured_at DATETIME2 NOT NULL,
          metadata NVARCHAR(MAX) NULL DEFAULT N'{}',
          is_test_data BIT NULL DEFAULT 0,
          test_scenario_id UNIQUEIDENTIFIER NULL,
          is_test BIT NOT NULL DEFAULT 0,
          value_type NVARCHAR(MAX) NOT NULL DEFAULT N'price',
          source NVARCHAR(MAX) NOT NULL DEFAULT N'other',
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_target_snapshots PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.user_portfolios', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.user_portfolios (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          user_id UNIQUEIDENTIFIER NOT NULL,
          org_slug NVARCHAR(MAX) NOT NULL,
          initial_balance DECIMAL(20,8) NOT NULL DEFAULT 1000000.00,
          current_balance DECIMAL(20,8) NOT NULL DEFAULT 1000000.00,
          total_realized_pnl DECIMAL(20,8) NOT NULL DEFAULT 0,
          total_unrealized_pnl DECIMAL(20,8) NOT NULL DEFAULT 0,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_user_portfolios PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.user_positions', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.user_positions (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          portfolio_id UNIQUEIDENTIFIER NOT NULL,
          prediction_id UNIQUEIDENTIFIER NOT NULL,
          target_id UNIQUEIDENTIFIER NOT NULL,
          symbol NVARCHAR(MAX) NOT NULL,
          direction NVARCHAR(MAX) NOT NULL,
          quantity DECIMAL(20,8) NOT NULL,
          entry_price DECIMAL(20,8) NOT NULL,
          current_price DECIMAL(20,8) NOT NULL,
          exit_price DECIMAL(20,8) NULL,
          unrealized_pnl DECIMAL(20,8) NOT NULL DEFAULT 0,
          realized_pnl DECIMAL(20,8) NULL,
          status NVARCHAR(MAX) NOT NULL DEFAULT N'open',
          opened_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          closed_at DATETIME2 NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_user_positions PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.user_trade_queue', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.user_trade_queue (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          user_id UNIQUEIDENTIFIER NOT NULL,
          org_slug NVARCHAR(MAX) NOT NULL,
          portfolio_id UNIQUEIDENTIFIER NOT NULL,
          prediction_id UNIQUEIDENTIFIER NOT NULL,
          target_id UNIQUEIDENTIFIER NOT NULL,
          symbol NVARCHAR(MAX) NOT NULL,
          direction NVARCHAR(MAX) NOT NULL,
          quantity DECIMAL(20,8) NOT NULL,
          status NVARCHAR(MAX) NOT NULL DEFAULT N'queued',
          executed_position_id UNIQUEIDENTIFIER NULL,
          execution_price DECIMAL(20,8) NULL,
          executed_at DATETIME2 NULL,
          queued_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          cancelled_at DATETIME2 NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_user_trade_queue PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.scenario_runs', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.scenario_runs (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          organization_slug NVARCHAR(MAX) NOT NULL,
          scenario_id UNIQUEIDENTIFIER NOT NULL,
          status NVARCHAR(MAX) NOT NULL DEFAULT N'pending',
          started_at DATETIME2 NULL,
          completed_at DATETIME2 NULL,
          triggered_by UNIQUEIDENTIFIER NULL,
          version_info NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          outcome_expected NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          outcome_actual NVARCHAR(MAX) NULL,
          outcome_match BIT NULL,
          error_message NVARCHAR(MAX) NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_scenario_runs PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.replay_tests', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.replay_tests (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          organization_slug NVARCHAR(MAX) NOT NULL,
          name NVARCHAR(MAX) NOT NULL,
          description NVARCHAR(MAX) NULL,
          status NVARCHAR(MAX) NOT NULL DEFAULT N'pending',
          rollback_depth NVARCHAR(MAX) NOT NULL DEFAULT N'predictions',
          rollback_to DATETIME2 NOT NULL,
          universe_id UNIQUEIDENTIFIER NULL,
          target_ids NVARCHAR(MAX) NULL,
          config NVARCHAR(MAX) NULL DEFAULT N'{}',
          results NVARCHAR(MAX) NULL,
          error_message NVARCHAR(MAX) NULL,
          created_by NVARCHAR(MAX) NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          started_at DATETIME2 NULL,
          completed_at DATETIME2 NULL,
          CONSTRAINT PK_prediction_replay_tests PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.replay_test_results', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.replay_test_results (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          replay_test_id UNIQUEIDENTIFIER NOT NULL,
          target_id UNIQUEIDENTIFIER NULL,
          original_prediction_id UNIQUEIDENTIFIER NULL,
          original_direction NVARCHAR(MAX) NULL,
          original_confidence DECIMAL(5,4) NULL,
          original_magnitude NVARCHAR(MAX) NULL,
          original_predicted_at DATETIME2 NULL,
          replay_prediction_id UNIQUEIDENTIFIER NULL,
          replay_direction NVARCHAR(MAX) NULL,
          replay_confidence DECIMAL(5,4) NULL,
          replay_magnitude NVARCHAR(MAX) NULL,
          replay_predicted_at DATETIME2 NULL,
          direction_match BIT NULL,
          confidence_diff DECIMAL(5,4) NULL,
          evaluation_id UNIQUEIDENTIFIER NULL,
          actual_outcome NVARCHAR(MAX) NULL,
          actual_outcome_value DECIMAL(20,8) NULL,
          original_correct BIT NULL,
          replay_correct BIT NULL,
          improvement BIT NULL,
          pnl_original DECIMAL(20,8) NULL,
          pnl_replay DECIMAL(20,8) NULL,
          pnl_diff DECIMAL(20,8) NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_replay_test_results PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.replay_test_snapshots', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.replay_test_snapshots (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          replay_test_id UNIQUEIDENTIFIER NOT NULL,
          table_name NVARCHAR(MAX) NOT NULL,
          original_data NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          record_ids NVARCHAR(MAX) NOT NULL DEFAULT N'[]',
          row_count INT NOT NULL DEFAULT 0,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_replay_test_snapshots PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.daily_postmortem_runs', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.daily_postmortem_runs (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          org_slug NVARCHAR(MAX) NOT NULL,
          agent_slug NVARCHAR(MAX) NOT NULL,
          run_date DATE NOT NULL,
          status NVARCHAR(MAX) NOT NULL DEFAULT N'completed',
          summary NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          report_markdown NVARCHAR(MAX) NOT NULL DEFAULT N'',
          report_html NVARCHAR(MAX) NOT NULL DEFAULT N'',
          report_json NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          created_by NVARCHAR(MAX) NOT NULL,
          started_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          completed_at DATETIME2 NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_daily_postmortem_runs PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.daily_postmortem_recommendations', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.daily_postmortem_recommendations (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          run_id UNIQUEIDENTIFIER NOT NULL,
          recommendation_type NVARCHAR(MAX) NOT NULL,
          scope_level NVARCHAR(MAX) NOT NULL,
          target_id UNIQUEIDENTIFIER NULL,
          target_symbol NVARCHAR(MAX) NULL,
          title NVARCHAR(MAX) NOT NULL,
          rationale NVARCHAR(MAX) NOT NULL,
          proposed_change NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          confidence DECIMAL(4,3) NOT NULL DEFAULT 0.5,
          status NVARCHAR(MAX) NOT NULL DEFAULT N'pending',
          action_source NVARCHAR(MAX) NULL,
          action_note NVARCHAR(MAX) NULL,
          actioned_by NVARCHAR(MAX) NULL,
          actioned_at DATETIME2 NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_daily_postmortem_recommendations PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.eod_settlement_log', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.eod_settlement_log (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          settlement_date DATE NOT NULL,
          queued_trades_executed INT NOT NULL DEFAULT 0,
          analyst_positions_created INT NOT NULL DEFAULT 0,
          predictions_resolved INT NOT NULL DEFAULT 0,
          positions_closed INT NOT NULL DEFAULT 0,
          unrealized_pnl_updated INT NOT NULL DEFAULT 0,
          total_realized_pnl DECIMAL(20,8) NOT NULL DEFAULT 0,
          errors NVARCHAR(MAX) NOT NULL DEFAULT N'[]',
          started_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          completed_at DATETIME2 NULL,
          duration_ms INT NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_eod_settlement_log PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.agent_self_modification_log', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.agent_self_modification_log (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          analyst_id UNIQUEIDENTIFIER NOT NULL,
          modification_type NVARCHAR(MAX) NOT NULL,
          summary NVARCHAR(MAX) NOT NULL,
          details NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          trigger_reason NVARCHAR(MAX) NULL,
          performance_context NVARCHAR(MAX) NULL,
          acknowledged BIT NOT NULL DEFAULT 0,
          acknowledged_at DATETIME2 NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_agent_self_modification_log PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.analyst_adaptation_diffs', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.analyst_adaptation_diffs (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          analyst_id UNIQUEIDENTIFIER NOT NULL,
          user_version_id UNIQUEIDENTIFIER NOT NULL,
          agent_version_id UNIQUEIDENTIFIER NOT NULL,
          diff_summary NVARCHAR(MAX) NOT NULL,
          performance_comparison NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          adoption_status NVARCHAR(MAX) NOT NULL DEFAULT N'pending',
          adopted_changes NVARCHAR(MAX) NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_analyst_adaptation_diffs PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.fork_learning_exchanges', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.fork_learning_exchanges (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          analyst_id UNIQUEIDENTIFIER NOT NULL,
          initiated_by NVARCHAR(MAX) NOT NULL,
          question NVARCHAR(MAX) NOT NULL,
          response NVARCHAR(MAX) NULL,
          context_diff NVARCHAR(MAX) NULL,
          performance_evidence NVARCHAR(MAX) NULL,
          outcome NVARCHAR(MAX) NOT NULL DEFAULT N'pending',
          adoption_details NVARCHAR(MAX) NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_fork_learning_exchanges PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.learning_lineage', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.learning_lineage (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          organization_slug NVARCHAR(MAX) NOT NULL,
          test_learning_id UNIQUEIDENTIFIER NOT NULL,
          production_learning_id UNIQUEIDENTIFIER NOT NULL,
          scenario_runs NVARCHAR(MAX) NULL DEFAULT N'[]',
          validation_metrics NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          backtest_result NVARCHAR(MAX) NULL,
          promoted_by UNIQUEIDENTIFIER NOT NULL,
          promoted_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          notes NVARCHAR(MAX) NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_learning_lineage PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.test_articles', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.test_articles (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          organization_slug NVARCHAR(MAX) NOT NULL,
          scenario_id UNIQUEIDENTIFIER NULL,
          title NVARCHAR(MAX) NOT NULL,
          content NVARCHAR(MAX) NOT NULL,
          source_name NVARCHAR(MAX) NOT NULL DEFAULT N'synthetic_news',
          published_at DATETIME2 NOT NULL,
          target_symbols NVARCHAR(MAX) NOT NULL DEFAULT N'[]',
          sentiment_expected NVARCHAR(MAX) NULL,
          strength_expected DECIMAL(3,2) NULL,
          is_synthetic BIT NOT NULL DEFAULT 1,
          synthetic_marker NVARCHAR(MAX) NULL DEFAULT N'[SYNTHETIC TEST CONTENT]',
          processed BIT NOT NULL DEFAULT 0,
          processed_at DATETIME2 NULL,
          created_by UNIQUEIDENTIFIER NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          metadata NVARCHAR(MAX) NULL DEFAULT N'{}',
          CONSTRAINT PK_prediction_test_articles PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.test_audit_log', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.test_audit_log (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          organization_slug NVARCHAR(MAX) NOT NULL,
          user_id UNIQUEIDENTIFIER NOT NULL,
          action NVARCHAR(MAX) NOT NULL,
          resource_type NVARCHAR(MAX) NOT NULL,
          resource_id UNIQUEIDENTIFIER NOT NULL,
          details NVARCHAR(MAX) NULL DEFAULT N'{}',
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_test_audit_log PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.test_price_data', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.test_price_data (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          organization_slug NVARCHAR(MAX) NOT NULL,
          scenario_id UNIQUEIDENTIFIER NULL,
          symbol NVARCHAR(MAX) NOT NULL,
          price_timestamp DATETIME2 NOT NULL,
          [open] DECIMAL(20,8) NOT NULL,
          high DECIMAL(20,8) NOT NULL,
          low DECIMAL(20,8) NOT NULL,
          [close] DECIMAL(20,8) NOT NULL,
          volume BIGINT NULL DEFAULT 0,
          metadata NVARCHAR(MAX) NULL DEFAULT N'{}',
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_test_price_data PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.test_target_mirrors', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.test_target_mirrors (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          real_target_id UNIQUEIDENTIFIER NOT NULL,
          test_target_id UNIQUEIDENTIFIER NOT NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_test_target_mirrors PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('prediction.tool_requests', 'U') IS NULL
      BEGIN
        CREATE TABLE prediction.tool_requests (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          universe_id UNIQUEIDENTIFIER NOT NULL,
          tool_type NVARCHAR(MAX) NOT NULL,
          title NVARCHAR(MAX) NOT NULL,
          description NVARCHAR(MAX) NOT NULL,
          name NVARCHAR(MAX) NOT NULL,
          source_type NVARCHAR(MAX) NULL,
          suggested_config NVARCHAR(MAX) NULL,
          missed_opportunity_id UNIQUEIDENTIFIER NULL,
          status NVARCHAR(MAX) NOT NULL DEFAULT N'wishlist',
          user_notes NVARCHAR(MAX) NULL,
          priority NVARCHAR(MAX) NOT NULL DEFAULT N'medium',
          rationale NVARCHAR(MAX) NULL,
          resolved_at DATETIME2 NULL,
          resolved_by_user_id UNIQUEIDENTIFIER NULL,
          resolution_notes NVARCHAR(MAX) NULL,
          is_test_data BIT NULL DEFAULT 0,
          test_scenario_id UNIQUEIDENTIFIER NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_prediction_tool_requests PRIMARY KEY (id)
        );
      END;
    `);
    console.log('prediction schema ready');

    // ================================================================
    // STEP 12: risk schema
    // ================================================================
    await pool.request().query(`
      IF OBJECT_ID('risk.scopes', 'U') IS NULL
      BEGIN
        CREATE TABLE risk.scopes (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          organization_slug NVARCHAR(MAX) NOT NULL,
          agent_slug NVARCHAR(MAX) NOT NULL,
          name NVARCHAR(MAX) NOT NULL,
          description NVARCHAR(MAX) NULL,
          domain NVARCHAR(MAX) NOT NULL,
          llm_config NVARCHAR(MAX) NULL DEFAULT N'{}',
          thresholds NVARCHAR(MAX) NULL DEFAULT N'{}',
          analysis_config NVARCHAR(MAX) NULL DEFAULT N'{}',
          is_active BIT NULL DEFAULT 1,
          is_test BIT NULL DEFAULT 0,
          test_scenario_id NVARCHAR(MAX) NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_risk_scopes PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('risk.subjects', 'U') IS NULL
      BEGIN
        CREATE TABLE risk.subjects (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          scope_id UNIQUEIDENTIFIER NOT NULL,
          identifier NVARCHAR(MAX) NOT NULL,
          name NVARCHAR(MAX) NULL,
          subject_type NVARCHAR(MAX) NOT NULL,
          metadata NVARCHAR(MAX) NULL DEFAULT N'{}',
          is_active BIT NULL DEFAULT 1,
          is_test BIT NULL DEFAULT 0,
          test_scenario_id NVARCHAR(MAX) NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_risk_subjects PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('risk.dimensions', 'U') IS NULL
      BEGIN
        CREATE TABLE risk.dimensions (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          scope_id UNIQUEIDENTIFIER NOT NULL,
          slug NVARCHAR(MAX) NOT NULL,
          name NVARCHAR(MAX) NOT NULL,
          description NVARCHAR(MAX) NULL,
          weight DECIMAL(3,2) NULL DEFAULT 1.0,
          display_order INT NULL DEFAULT 0,
          display_name NVARCHAR(100) NULL,
          icon NVARCHAR(50) NULL,
          color NVARCHAR(7) NULL,
          is_active BIT NULL DEFAULT 1,
          is_test BIT NULL DEFAULT 0,
          test_scenario_id NVARCHAR(MAX) NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_risk_dimensions PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('risk.data_sources', 'U') IS NULL
      BEGIN
        CREATE TABLE risk.data_sources (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          scope_id UNIQUEIDENTIFIER NOT NULL,
          name NVARCHAR(255) NOT NULL,
          description NVARCHAR(MAX) NULL,
          source_type NVARCHAR(50) NOT NULL,
          config NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          schedule NVARCHAR(50) NULL,
          dimension_mapping NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          subject_filter NVARCHAR(MAX) NULL,
          status NVARCHAR(20) NOT NULL DEFAULT N'active',
          error_message NVARCHAR(MAX) NULL,
          error_count INT NULL DEFAULT 0,
          last_fetch_at DATETIME2 NULL,
          last_fetch_status NVARCHAR(20) NULL,
          last_fetch_data NVARCHAR(MAX) NULL,
          next_fetch_at DATETIME2 NULL,
          auto_reanalyze BIT NULL DEFAULT 1,
          reanalyze_threshold DECIMAL(3,2) NULL DEFAULT 0.1,
          migrated_to_crawler BIT NULL DEFAULT 0,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_risk_data_sources PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('risk.dimension_contexts', 'U') IS NULL
      BEGIN
        CREATE TABLE risk.dimension_contexts (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          dimension_id UNIQUEIDENTIFIER NOT NULL,
          version INT NOT NULL DEFAULT 1,
          system_prompt NVARCHAR(MAX) NOT NULL,
          output_schema NVARCHAR(MAX) NULL DEFAULT N'{}',
          examples NVARCHAR(MAX) NULL DEFAULT N'[]',
          is_active BIT NULL DEFAULT 1,
          is_test BIT NULL DEFAULT 0,
          test_scenario_id NVARCHAR(MAX) NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_risk_dimension_contexts PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('risk.debate_contexts', 'U') IS NULL
      BEGIN
        CREATE TABLE risk.debate_contexts (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          scope_id UNIQUEIDENTIFIER NOT NULL,
          role NVARCHAR(MAX) NOT NULL,
          version INT NOT NULL DEFAULT 1,
          system_prompt NVARCHAR(MAX) NOT NULL,
          output_schema NVARCHAR(MAX) NULL DEFAULT N'{}',
          is_active BIT NULL DEFAULT 1,
          is_test BIT NULL DEFAULT 0,
          test_scenario_id NVARCHAR(MAX) NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_risk_debate_contexts PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('risk.composite_scores', 'U') IS NULL
      BEGIN
        CREATE TABLE risk.composite_scores (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          subject_id UNIQUEIDENTIFIER NOT NULL,
          task_id UNIQUEIDENTIFIER NULL,
          overall_score INT NULL,
          dimension_scores NVARCHAR(MAX) NULL DEFAULT N'{}',
          debate_id UNIQUEIDENTIFIER NULL,
          debate_adjustment INT NULL DEFAULT 0,
          pre_debate_score INT NULL,
          confidence DECIMAL(3,2) NULL,
          status NVARCHAR(MAX) NULL DEFAULT N'active',
          valid_until DATETIME2 NULL,
          is_test BIT NULL DEFAULT 0,
          test_scenario_id NVARCHAR(MAX) NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_risk_composite_scores PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('risk.assessments', 'U') IS NULL
      BEGIN
        CREATE TABLE risk.assessments (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          subject_id UNIQUEIDENTIFIER NOT NULL,
          dimension_id UNIQUEIDENTIFIER NOT NULL,
          dimension_context_id UNIQUEIDENTIFIER NULL,
          task_id UNIQUEIDENTIFIER NULL,
          score INT NULL,
          confidence DECIMAL(3,2) NULL,
          reasoning NVARCHAR(MAX) NULL,
          evidence NVARCHAR(MAX) NULL DEFAULT N'[]',
          signals NVARCHAR(MAX) NULL DEFAULT N'[]',
          analyst_response NVARCHAR(MAX) NULL DEFAULT N'{}',
          llm_provider NVARCHAR(MAX) NULL,
          llm_model NVARCHAR(MAX) NULL,
          is_test BIT NULL DEFAULT 0,
          test_scenario_id NVARCHAR(MAX) NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_risk_assessments PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('risk.debates', 'U') IS NULL
      BEGIN
        CREATE TABLE risk.debates (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          subject_id UNIQUEIDENTIFIER NOT NULL,
          composite_score_id UNIQUEIDENTIFIER NULL,
          task_id UNIQUEIDENTIFIER NULL,
          blue_assessment NVARCHAR(MAX) NULL DEFAULT N'{}',
          red_challenges NVARCHAR(MAX) NULL DEFAULT N'{}',
          arbiter_synthesis NVARCHAR(MAX) NULL DEFAULT N'{}',
          original_score INT NULL,
          final_score INT NULL,
          score_adjustment INT NULL DEFAULT 0,
          transcript NVARCHAR(MAX) NULL DEFAULT N'[]',
          status NVARCHAR(MAX) NULL DEFAULT N'pending',
          is_test BIT NULL DEFAULT 0,
          test_scenario_id NVARCHAR(MAX) NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          completed_at DATETIME2 NULL,
          CONSTRAINT PK_risk_debates PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('risk.alerts', 'U') IS NULL
      BEGIN
        CREATE TABLE risk.alerts (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          subject_id UNIQUEIDENTIFIER NOT NULL,
          composite_score_id UNIQUEIDENTIFIER NULL,
          alert_type NVARCHAR(MAX) NOT NULL,
          severity NVARCHAR(MAX) NOT NULL,
          title NVARCHAR(MAX) NOT NULL,
          message NVARCHAR(MAX) NULL,
          details NVARCHAR(MAX) NULL DEFAULT N'{}',
          triggered_value DECIMAL(18,6) NULL,
          threshold_value DECIMAL(18,6) NULL,
          is_acknowledged BIT NULL DEFAULT 0,
          acknowledged_at DATETIME2 NULL,
          acknowledged_by UNIQUEIDENTIFIER NULL,
          is_test BIT NULL DEFAULT 0,
          test_scenario_id NVARCHAR(MAX) NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_risk_alerts PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('risk.article_classifications', 'U') IS NULL
      BEGIN
        CREATE TABLE risk.article_classifications (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          scope_id UNIQUEIDENTIFIER NOT NULL,
          article_id UNIQUEIDENTIFIER NOT NULL,
          dimension_slugs NVARCHAR(MAX) NOT NULL DEFAULT N'[]',
          confidence DECIMAL(3,2) NULL,
          subject_identifiers NVARCHAR(MAX) NULL DEFAULT N'[]',
          sentiment DECIMAL(3,2) NULL,
          sentiment_label NVARCHAR(MAX) NULL,
          risk_indicators NVARCHAR(MAX) NULL DEFAULT N'[]',
          llm_provider NVARCHAR(MAX) NULL,
          llm_model NVARCHAR(MAX) NULL,
          classification_prompt_version INT NULL DEFAULT 1,
          status NVARCHAR(MAX) NULL DEFAULT N'classified',
          error_message NVARCHAR(MAX) NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_risk_article_classifications PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('risk.source_subscriptions', 'U') IS NULL
      BEGIN
        CREATE TABLE risk.source_subscriptions (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          source_id UNIQUEIDENTIFIER NOT NULL,
          scope_id UNIQUEIDENTIFIER NOT NULL,
          dimension_mapping NVARCHAR(MAX) NULL DEFAULT N'{}',
          subject_filter NVARCHAR(MAX) NULL DEFAULT N'{}',
          last_processed_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          auto_reanalyze BIT NULL DEFAULT 1,
          reanalyze_threshold DECIMAL(3,2) NULL DEFAULT 0.10,
          is_active BIT NOT NULL DEFAULT 1,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_risk_source_subscriptions PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('risk.evaluations', 'U') IS NULL
      BEGIN
        CREATE TABLE risk.evaluations (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          composite_score_id UNIQUEIDENTIFIER NOT NULL,
          subject_id UNIQUEIDENTIFIER NOT NULL,
          evaluation_window NVARCHAR(MAX) NOT NULL,
          actual_outcome NVARCHAR(MAX) NULL DEFAULT N'{}',
          outcome_severity INT NULL,
          score_accuracy DECIMAL(3,2) NULL,
          dimension_accuracy NVARCHAR(MAX) NULL DEFAULT N'{}',
          calibration_error DECIMAL(5,4) NULL,
          learnings_suggested NVARCHAR(MAX) NULL,
          notes NVARCHAR(MAX) NULL,
          is_test BIT NULL DEFAULT 0,
          test_scenario_id NVARCHAR(MAX) NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_risk_evaluations PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('risk.executive_summaries', 'U') IS NULL
      BEGIN
        CREATE TABLE risk.executive_summaries (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          scope_id UNIQUEIDENTIFIER NOT NULL,
          summary_type NVARCHAR(50) NOT NULL DEFAULT N'ad-hoc',
          content NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          risk_snapshot NVARCHAR(MAX) NULL DEFAULT N'{}',
          generated_by NVARCHAR(100) NULL,
          generated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          expires_at DATETIME2 NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_risk_executive_summaries PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('risk.reports', 'U') IS NULL
      BEGIN
        CREATE TABLE risk.reports (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          scope_id UNIQUEIDENTIFIER NOT NULL,
          title NVARCHAR(255) NOT NULL,
          report_type NVARCHAR(50) NULL DEFAULT N'comprehensive',
          config NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          status NVARCHAR(20) NULL DEFAULT N'pending',
          file_path NVARCHAR(500) NULL,
          file_size INT NULL,
          download_url NVARCHAR(1000) NULL,
          download_expires_at DATETIME2 NULL,
          error_message NVARCHAR(MAX) NULL,
          generated_at DATETIME2 NULL,
          created_by NVARCHAR(100) NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_risk_reports PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('risk.scenarios', 'U') IS NULL
      BEGIN
        CREATE TABLE risk.scenarios (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          scope_id UNIQUEIDENTIFIER NOT NULL,
          name NVARCHAR(255) NOT NULL,
          description NVARCHAR(MAX) NULL,
          adjustments NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          baseline_snapshot NVARCHAR(MAX) NULL DEFAULT N'{}',
          results NVARCHAR(MAX) NULL DEFAULT N'{}',
          is_template BIT NULL DEFAULT 0,
          created_by NVARCHAR(100) NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_risk_scenarios PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('risk.simulations', 'U') IS NULL
      BEGIN
        CREATE TABLE risk.simulations (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          scope_id UNIQUEIDENTIFIER NOT NULL,
          subject_id UNIQUEIDENTIFIER NULL,
          name NVARCHAR(255) NOT NULL,
          description NVARCHAR(MAX) NULL,
          iterations INT NOT NULL DEFAULT 10000,
          parameters NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
          results NVARCHAR(MAX) NULL,
          status NVARCHAR(20) NOT NULL DEFAULT N'pending',
          error_message NVARCHAR(MAX) NULL,
          started_at DATETIME2 NULL,
          completed_at DATETIME2 NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_risk_simulations PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('risk.comparisons', 'U') IS NULL
      BEGIN
        CREATE TABLE risk.comparisons (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          scope_id UNIQUEIDENTIFIER NOT NULL,
          name NVARCHAR(255) NOT NULL,
          subject_ids NVARCHAR(MAX) NOT NULL DEFAULT N'[]',
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_risk_comparisons PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('risk.data_source_fetch_history', 'U') IS NULL
      BEGIN
        CREATE TABLE risk.data_source_fetch_history (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          data_source_id UNIQUEIDENTIFIER NOT NULL,
          status NVARCHAR(20) NOT NULL,
          fetch_duration_ms INT NULL,
          raw_response NVARCHAR(MAX) NULL,
          parsed_data NVARCHAR(MAX) NULL,
          error_message NVARCHAR(MAX) NULL,
          dimensions_updated NVARCHAR(MAX) NULL,
          subjects_affected NVARCHAR(MAX) NULL,
          reanalysis_triggered BIT NULL DEFAULT 0,
          reanalysis_task_ids NVARCHAR(MAX) NULL,
          fetched_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_risk_data_source_fetch_history PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('risk.learning_queue', 'U') IS NULL
      BEGIN
        CREATE TABLE risk.learning_queue (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          scope_id UNIQUEIDENTIFIER NULL,
          subject_id UNIQUEIDENTIFIER NULL,
          evaluation_id UNIQUEIDENTIFIER NULL,
          suggested_scope_level NVARCHAR(MAX) NULL,
          suggested_learning_type NVARCHAR(MAX) NULL,
          suggested_title NVARCHAR(MAX) NOT NULL,
          suggested_description NVARCHAR(MAX) NULL,
          suggested_config NVARCHAR(MAX) NULL DEFAULT N'{}',
          ai_reasoning NVARCHAR(MAX) NULL,
          ai_confidence DECIMAL(3,2) NULL,
          status NVARCHAR(MAX) NULL DEFAULT N'pending',
          reviewed_by_user_id UNIQUEIDENTIFIER NULL,
          reviewer_notes NVARCHAR(MAX) NULL,
          reviewed_at DATETIME2 NULL,
          learning_id UNIQUEIDENTIFIER NULL,
          is_test BIT NULL DEFAULT 0,
          test_scenario_id NVARCHAR(MAX) NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_risk_learning_queue PRIMARY KEY (id)
        );
      END;

      IF OBJECT_ID('risk.learnings', 'U') IS NULL
      BEGIN
        CREATE TABLE risk.learnings (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          scope_level NVARCHAR(MAX) NOT NULL,
          domain NVARCHAR(MAX) NULL,
          scope_id UNIQUEIDENTIFIER NULL,
          subject_id UNIQUEIDENTIFIER NULL,
          dimension_id UNIQUEIDENTIFIER NULL,
          learning_type NVARCHAR(MAX) NOT NULL,
          title NVARCHAR(MAX) NOT NULL,
          description NVARCHAR(MAX) NULL,
          config NVARCHAR(MAX) NULL DEFAULT N'{}',
          times_applied INT NULL DEFAULT 0,
          times_helpful INT NULL DEFAULT 0,
          effectiveness_score DECIMAL(3,2) NULL,
          status NVARCHAR(MAX) NULL DEFAULT N'active',
          is_test BIT NULL DEFAULT 1,
          source_type NVARCHAR(MAX) NULL,
          parent_learning_id UNIQUEIDENTIFIER NULL,
          is_production BIT NULL DEFAULT 0,
          test_scenario_id NVARCHAR(MAX) NULL,
          created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_risk_learnings PRIMARY KEY (id)
        );
      END;
    `);
    console.log('risk schema ready');

    // ================================================================
    // STEP 13: Foreign key constraints
    // ================================================================
    await pool.request().query(`
      -- authz FK: identity_links -> users
      IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_authz_identity_links_user_id')
        ALTER TABLE authz.identity_links ADD CONSTRAINT FK_authz_identity_links_user_id
          FOREIGN KEY (user_id) REFERENCES authz.users(id) ON DELETE CASCADE;

      -- authz RBAC FKs
      IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_authz_rbac_role_permissions_role')
        ALTER TABLE authz.rbac_role_permissions ADD CONSTRAINT FK_authz_rbac_role_permissions_role
          FOREIGN KEY (role_id) REFERENCES authz.rbac_roles(id) ON DELETE CASCADE;
      IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_authz_rbac_role_permissions_perm')
        ALTER TABLE authz.rbac_role_permissions ADD CONSTRAINT FK_authz_rbac_role_permissions_perm
          FOREIGN KEY (permission_id) REFERENCES authz.rbac_permissions(id) ON DELETE CASCADE;
      IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_authz_rbac_user_org_roles_user')
        ALTER TABLE authz.rbac_user_org_roles ADD CONSTRAINT FK_authz_rbac_user_org_roles_user
          FOREIGN KEY (user_id) REFERENCES authz.users(id) ON DELETE CASCADE;
      IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_authz_rbac_user_org_roles_role')
        ALTER TABLE authz.rbac_user_org_roles ADD CONSTRAINT FK_authz_rbac_user_org_roles_role
          FOREIGN KEY (role_id) REFERENCES authz.rbac_roles(id) ON DELETE CASCADE;
    `);
    console.log('authz FK constraints ready');

    // Public FK constraints — try each individually (NVARCHAR(MAX) columns can't have FKs)
    const publicFKs: [string, string][] = [
      ['FK_llm_models_provider', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_llm_models_provider') ALTER TABLE dbo.llm_models ADD CONSTRAINT FK_llm_models_provider FOREIGN KEY (provider_name) REFERENCES dbo.llm_providers(name) ON DELETE CASCADE`],
      ['FK_teams_org', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_teams_org') ALTER TABLE dbo.teams ADD CONSTRAINT FK_teams_org FOREIGN KEY (org_slug) REFERENCES dbo.organizations(slug) ON DELETE CASCADE`],
      ['FK_users_org', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_users_org') ALTER TABLE dbo.users ADD CONSTRAINT FK_users_org FOREIGN KEY (organization_slug) REFERENCES dbo.organizations(slug) ON DELETE SET NULL`],
      ['FK_conversations_org', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_conversations_org') ALTER TABLE dbo.conversations ADD CONSTRAINT FK_conversations_org FOREIGN KEY (organization_slug) REFERENCES dbo.organizations(slug) ON DELETE SET NULL`],
      ['FK_tasks_conversation', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_tasks_conversation') ALTER TABLE dbo.tasks ADD CONSTRAINT FK_tasks_conversation FOREIGN KEY (conversation_id) REFERENCES dbo.conversations(id) ON DELETE SET NULL`],
      ['FK_deliverables_task', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_deliverables_task') ALTER TABLE dbo.deliverables ADD CONSTRAINT FK_deliverables_task FOREIGN KEY (task_id) REFERENCES dbo.tasks(id) ON DELETE SET NULL`],
      ['FK_plans_org', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_plans_org') ALTER TABLE dbo.plans ADD CONSTRAINT FK_plans_org FOREIGN KEY (organization_slug) REFERENCES dbo.organizations(slug) ON DELETE SET NULL`],
      ['FK_deliverable_versions_deliverable', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_deliverable_versions_deliverable') ALTER TABLE dbo.deliverable_versions ADD CONSTRAINT FK_deliverable_versions_deliverable FOREIGN KEY (deliverable_id) REFERENCES dbo.deliverables(id) ON DELETE CASCADE`],
      ['FK_plan_versions_plan', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_plan_versions_plan') ALTER TABLE dbo.plan_versions ADD CONSTRAINT FK_plan_versions_plan FOREIGN KEY (plan_id) REFERENCES dbo.plans(id) ON DELETE CASCADE`],
      ['FK_plan_deliverables_plan', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_plan_deliverables_plan') ALTER TABLE dbo.plan_deliverables ADD CONSTRAINT FK_plan_deliverables_plan FOREIGN KEY (plan_id) REFERENCES dbo.plans(id) ON DELETE CASCADE`],
      ['FK_plan_deliverables_deliverable', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_plan_deliverables_deliverable') ALTER TABLE dbo.plan_deliverables ADD CONSTRAINT FK_plan_deliverables_deliverable FOREIGN KEY (deliverable_id) REFERENCES dbo.deliverables(id) ON DELETE CASCADE`],
      ['FK_human_approvals_org', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_human_approvals_org') ALTER TABLE dbo.human_approvals ADD CONSTRAINT FK_human_approvals_org FOREIGN KEY (organization_slug) REFERENCES dbo.organizations(slug) ON DELETE CASCADE`],
      ['FK_task_messages_task', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_task_messages_task') ALTER TABLE dbo.task_messages ADD CONSTRAINT FK_task_messages_task FOREIGN KEY (task_id) REFERENCES dbo.tasks(id) ON DELETE CASCADE`],
      ['FK_team_members_team', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_team_members_team') ALTER TABLE dbo.team_members ADD CONSTRAINT FK_team_members_team FOREIGN KEY (team_id) REFERENCES dbo.teams(id) ON DELETE CASCADE`],
      ['FK_rbac_role_perms_role', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_rbac_role_perms_role') ALTER TABLE authz.rbac_role_permissions ADD CONSTRAINT FK_rbac_role_perms_role FOREIGN KEY (role_id) REFERENCES authz.rbac_roles(id) ON DELETE CASCADE`],
      ['FK_rbac_role_perms_perm', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_rbac_role_perms_perm') ALTER TABLE authz.rbac_role_permissions ADD CONSTRAINT FK_rbac_role_perms_perm FOREIGN KEY (permission_id) REFERENCES authz.rbac_permissions(id) ON DELETE CASCADE`],
      ['FK_rbac_user_org_roles_role', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_rbac_user_org_roles_role') ALTER TABLE authz.rbac_user_org_roles ADD CONSTRAINT FK_rbac_user_org_roles_role FOREIGN KEY (role_id) REFERENCES authz.rbac_roles(id) ON DELETE CASCADE`],
      ['FK_org_credentials_org', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_org_credentials_org') ALTER TABLE dbo.organization_credentials ADD CONSTRAINT FK_org_credentials_org FOREIGN KEY (organization_slug) REFERENCES dbo.organizations(slug) ON DELETE CASCADE`],
      ['FK_llm_usage_provider', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_llm_usage_provider') ALTER TABLE dbo.llm_usage ADD CONSTRAINT FK_llm_usage_provider FOREIGN KEY (provider_name) REFERENCES dbo.llm_providers(name) ON DELETE SET NULL`],
      ['FK_observability_events_conversation', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_observability_events_conversation') ALTER TABLE dbo.observability_events ADD CONSTRAINT FK_observability_events_conversation FOREIGN KEY (conversation_id) REFERENCES dbo.conversations(id) ON DELETE SET NULL`],
    ];
    let publicFKOk = 0;
    for (const [name, sql] of publicFKs) {
      if (await tryFK(pool, name, sql)) publicFKOk++;
    }
    console.log(`public FK constraints: ${publicFKOk}/${publicFKs.length} created`);

    // Remaining FK constraints — try each individually
    const remainingFKs: [string, string][] = [
      // crawler
      ['FK_crawler_sources_org', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_crawler_sources_org') ALTER TABLE crawler.sources ADD CONSTRAINT FK_crawler_sources_org FOREIGN KEY (organization_slug) REFERENCES dbo.organizations(slug) ON DELETE CASCADE`],
      ['FK_crawler_articles_source', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_crawler_articles_source') ALTER TABLE crawler.articles ADD CONSTRAINT FK_crawler_articles_source FOREIGN KEY (source_id) REFERENCES crawler.sources(id) ON DELETE CASCADE`],
      ['FK_crawler_articles_org', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_crawler_articles_org') ALTER TABLE crawler.articles ADD CONSTRAINT FK_crawler_articles_org FOREIGN KEY (organization_slug) REFERENCES dbo.organizations(slug) ON DELETE CASCADE`],
      ['FK_crawler_source_crawls_source', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_crawler_source_crawls_source') ALTER TABLE crawler.source_crawls ADD CONSTRAINT FK_crawler_source_crawls_source FOREIGN KEY (source_id) REFERENCES crawler.sources(id) ON DELETE CASCADE`],
      ['FK_crawler_agent_article_outputs_article', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_crawler_agent_article_outputs_article') ALTER TABLE crawler.agent_article_outputs ADD CONSTRAINT FK_crawler_agent_article_outputs_article FOREIGN KEY (article_id) REFERENCES crawler.articles(id) ON DELETE CASCADE`],
      // engineering
      ['FK_engineering_projects_org', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_engineering_projects_org') ALTER TABLE engineering.projects ADD CONSTRAINT FK_engineering_projects_org FOREIGN KEY (org_slug) REFERENCES dbo.organizations(slug) ON DELETE CASCADE`],
      ['FK_engineering_part_library_org', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_engineering_part_library_org') ALTER TABLE engineering.part_library ADD CONSTRAINT FK_engineering_part_library_org FOREIGN KEY (org_slug) REFERENCES dbo.organizations(slug) ON DELETE CASCADE`],
      ['FK_engineering_drawings_project', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_engineering_drawings_project') ALTER TABLE engineering.drawings ADD CONSTRAINT FK_engineering_drawings_project FOREIGN KEY (project_id) REFERENCES engineering.projects(id) ON DELETE SET NULL`],
      ['FK_engineering_generated_code_drawing', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_engineering_generated_code_drawing') ALTER TABLE engineering.generated_code ADD CONSTRAINT FK_engineering_generated_code_drawing FOREIGN KEY (drawing_id) REFERENCES engineering.drawings(id) ON DELETE CASCADE`],
      ['FK_engineering_cad_outputs_drawing', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_engineering_cad_outputs_drawing') ALTER TABLE engineering.cad_outputs ADD CONSTRAINT FK_engineering_cad_outputs_drawing FOREIGN KEY (drawing_id) REFERENCES engineering.drawings(id) ON DELETE CASCADE`],
    ];
    let remainingOk = 0;
    for (const [name, sql] of remainingFKs) {
      if (await tryFK(pool, name, sql)) remainingOk++;
    }
    console.log(`crawler + engineering FK constraints: ${remainingOk}/${remainingFKs.length} created`);

    const moreFKs: [string, string][] = [
      // marketing
      ['FK_marketing_agent_llm_configs_agent', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_marketing_agent_llm_configs_agent') ALTER TABLE marketing.agent_llm_configs ADD CONSTRAINT FK_marketing_agent_llm_configs_agent FOREIGN KEY (agent_slug) REFERENCES marketing.agents(slug) ON DELETE CASCADE`],
      ['FK_marketing_swarm_tasks_content_type', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_marketing_swarm_tasks_content_type') ALTER TABLE marketing.swarm_tasks ADD CONSTRAINT FK_marketing_swarm_tasks_content_type FOREIGN KEY (content_type_slug) REFERENCES marketing.content_types(slug)`],
      ['FK_marketing_outputs_task', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_marketing_outputs_task') ALTER TABLE marketing.outputs ADD CONSTRAINT FK_marketing_outputs_task FOREIGN KEY (task_id) REFERENCES marketing.swarm_tasks(id) ON DELETE CASCADE`],
      ['FK_marketing_outputs_writer_agent', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_marketing_outputs_writer_agent') ALTER TABLE marketing.outputs ADD CONSTRAINT FK_marketing_outputs_writer_agent FOREIGN KEY (writer_agent_slug) REFERENCES marketing.agents(slug)`],
      ['FK_marketing_outputs_editor_agent', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_marketing_outputs_editor_agent') ALTER TABLE marketing.outputs ADD CONSTRAINT FK_marketing_outputs_editor_agent FOREIGN KEY (editor_agent_slug) REFERENCES marketing.agents(slug)`],
      ['FK_marketing_evaluations_task', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_marketing_evaluations_task') ALTER TABLE marketing.evaluations ADD CONSTRAINT FK_marketing_evaluations_task FOREIGN KEY (task_id) REFERENCES marketing.swarm_tasks(id) ON DELETE CASCADE`],
      ['FK_marketing_evaluations_output', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_marketing_evaluations_output') ALTER TABLE marketing.evaluations ADD CONSTRAINT FK_marketing_evaluations_output FOREIGN KEY (output_id) REFERENCES marketing.outputs(id) ON DELETE CASCADE`],
      ['FK_marketing_evaluations_evaluator', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_marketing_evaluations_evaluator') ALTER TABLE marketing.evaluations ADD CONSTRAINT FK_marketing_evaluations_evaluator FOREIGN KEY (evaluator_agent_slug) REFERENCES marketing.agents(slug)`],
      ['FK_marketing_output_versions_output', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_marketing_output_versions_output') ALTER TABLE marketing.output_versions ADD CONSTRAINT FK_marketing_output_versions_output FOREIGN KEY (output_id) REFERENCES marketing.outputs(id) ON DELETE CASCADE`],
      ['FK_marketing_execution_queue_task', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_marketing_execution_queue_task') ALTER TABLE marketing.execution_queue ADD CONSTRAINT FK_marketing_execution_queue_task FOREIGN KEY (task_id) REFERENCES marketing.swarm_tasks(id) ON DELETE CASCADE`],
      ['FK_marketing_execution_queue_agent', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_marketing_execution_queue_agent') ALTER TABLE marketing.execution_queue ADD CONSTRAINT FK_marketing_execution_queue_agent FOREIGN KEY (agent_slug) REFERENCES marketing.agents(slug)`],
      // orch_flow
      ['FK_orch_flow_efforts_org', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_orch_flow_efforts_org') ALTER TABLE orch_flow.efforts ADD CONSTRAINT FK_orch_flow_efforts_org FOREIGN KEY (organization_slug) REFERENCES dbo.organizations(slug) ON DELETE CASCADE`],
      ['FK_orch_flow_sprints_effort', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_orch_flow_sprints_effort') ALTER TABLE orch_flow.sprints ADD CONSTRAINT FK_orch_flow_sprints_effort FOREIGN KEY (effort_id) REFERENCES orch_flow.efforts(id) ON DELETE CASCADE`],
      ['FK_orch_flow_projects_effort', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_orch_flow_projects_effort') ALTER TABLE orch_flow.projects ADD CONSTRAINT FK_orch_flow_projects_effort FOREIGN KEY (effort_id) REFERENCES orch_flow.efforts(id) ON DELETE SET NULL`],
      ['FK_orch_flow_tasks_effort', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_orch_flow_tasks_effort') ALTER TABLE orch_flow.tasks ADD CONSTRAINT FK_orch_flow_tasks_effort FOREIGN KEY (effort_id) REFERENCES orch_flow.efforts(id) ON DELETE SET NULL`],
      ['FK_orch_flow_tasks_sprint', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_orch_flow_tasks_sprint') ALTER TABLE orch_flow.tasks ADD CONSTRAINT FK_orch_flow_tasks_sprint FOREIGN KEY (sprint_id) REFERENCES orch_flow.sprints(id) ON DELETE SET NULL`],
      ['FK_orch_flow_tasks_project', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_orch_flow_tasks_project') ALTER TABLE orch_flow.tasks ADD CONSTRAINT FK_orch_flow_tasks_project FOREIGN KEY (project_id) REFERENCES orch_flow.projects(id) ON DELETE SET NULL`],
      ['FK_orch_flow_channel_messages_channel', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_orch_flow_channel_messages_channel') ALTER TABLE orch_flow.channel_messages ADD CONSTRAINT FK_orch_flow_channel_messages_channel FOREIGN KEY (channel_id) REFERENCES orch_flow.channels(id) ON DELETE CASCADE`],
      ['FK_orch_flow_task_collaborators_task', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_orch_flow_task_collaborators_task') ALTER TABLE orch_flow.task_collaborators ADD CONSTRAINT FK_orch_flow_task_collaborators_task FOREIGN KEY (task_id) REFERENCES orch_flow.tasks(id) ON DELETE CASCADE`],
      ['FK_orch_flow_task_watchers_task', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_orch_flow_task_watchers_task') ALTER TABLE orch_flow.task_watchers ADD CONSTRAINT FK_orch_flow_task_watchers_task FOREIGN KEY (task_id) REFERENCES orch_flow.tasks(id) ON DELETE CASCADE`],
      ['FK_orch_flow_timer_state_task', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_orch_flow_timer_state_task') ALTER TABLE orch_flow.timer_state ADD CONSTRAINT FK_orch_flow_timer_state_task FOREIGN KEY (task_id) REFERENCES orch_flow.tasks(id) ON DELETE CASCADE`],
      ['FK_orch_flow_learning_progress_org', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_orch_flow_learning_progress_org') ALTER TABLE orch_flow.learning_progress ADD CONSTRAINT FK_orch_flow_learning_progress_org FOREIGN KEY (organization_slug) REFERENCES dbo.organizations(slug) ON DELETE CASCADE`],
      // prediction
      ['FK_prediction_universes_org', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_prediction_universes_org') ALTER TABLE prediction.universes ADD CONSTRAINT FK_prediction_universes_org FOREIGN KEY (organization_slug) REFERENCES dbo.organizations(slug) ON DELETE CASCADE`],
      ['FK_prediction_universes_agent', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_prediction_universes_agent') ALTER TABLE prediction.universes ADD CONSTRAINT FK_prediction_universes_agent FOREIGN KEY (agent_slug) REFERENCES dbo.agents(slug)`],
      ['FK_prediction_universes_strategy', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_prediction_universes_strategy') ALTER TABLE prediction.universes ADD CONSTRAINT FK_prediction_universes_strategy FOREIGN KEY (strategy_id) REFERENCES prediction.strategies(id) ON DELETE SET NULL`],
      ['FK_prediction_targets_universe', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_prediction_targets_universe') ALTER TABLE prediction.targets ADD CONSTRAINT FK_prediction_targets_universe FOREIGN KEY (universe_id) REFERENCES prediction.universes(id) ON DELETE CASCADE`],
      ['FK_prediction_analysts_universe', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_prediction_analysts_universe') ALTER TABLE prediction.analysts ADD CONSTRAINT FK_prediction_analysts_universe FOREIGN KEY (universe_id) REFERENCES prediction.universes(id) ON DELETE CASCADE`],
      ['FK_prediction_predictions_universe', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_prediction_predictions_universe') ALTER TABLE prediction.predictions ADD CONSTRAINT FK_prediction_predictions_universe FOREIGN KEY (universe_id) REFERENCES prediction.universes(id) ON DELETE CASCADE`],
      ['FK_prediction_predictions_target', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_prediction_predictions_target') ALTER TABLE prediction.predictions ADD CONSTRAINT FK_prediction_predictions_target FOREIGN KEY (target_id) REFERENCES prediction.targets(id) ON DELETE CASCADE`],
      ['FK_prediction_signals_universe', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_prediction_signals_universe') ALTER TABLE prediction.signals ADD CONSTRAINT FK_prediction_signals_universe FOREIGN KEY (universe_id) REFERENCES prediction.universes(id) ON DELETE CASCADE`],
      ['FK_prediction_evaluations_prediction', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_prediction_evaluations_prediction') ALTER TABLE prediction.evaluations ADD CONSTRAINT FK_prediction_evaluations_prediction FOREIGN KEY (prediction_id) REFERENCES prediction.predictions(id) ON DELETE CASCADE`],
      ['FK_prediction_scenario_runs_org', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_prediction_scenario_runs_org') ALTER TABLE prediction.scenario_runs ADD CONSTRAINT FK_prediction_scenario_runs_org FOREIGN KEY (organization_slug) REFERENCES dbo.organizations(slug) ON DELETE CASCADE`],
      ['FK_prediction_learning_lineage_org', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_prediction_learning_lineage_org') ALTER TABLE prediction.learning_lineage ADD CONSTRAINT FK_prediction_learning_lineage_org FOREIGN KEY (organization_slug) REFERENCES dbo.organizations(slug) ON DELETE CASCADE`],
      // risk
      ['FK_risk_scopes_org', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_risk_scopes_org') ALTER TABLE risk.scopes ADD CONSTRAINT FK_risk_scopes_org FOREIGN KEY (organization_slug) REFERENCES dbo.organizations(slug) ON DELETE CASCADE`],
      ['FK_risk_subjects_scope', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_risk_subjects_scope') ALTER TABLE risk.subjects ADD CONSTRAINT FK_risk_subjects_scope FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE`],
      ['FK_risk_dimensions_scope', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_risk_dimensions_scope') ALTER TABLE risk.dimensions ADD CONSTRAINT FK_risk_dimensions_scope FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE`],
      ['FK_risk_data_sources_scope', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_risk_data_sources_scope') ALTER TABLE risk.data_sources ADD CONSTRAINT FK_risk_data_sources_scope FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE`],
      ['FK_risk_assessments_scope', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_risk_assessments_scope') ALTER TABLE risk.assessments ADD CONSTRAINT FK_risk_assessments_scope FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE`],
      ['FK_risk_assessments_subject', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_risk_assessments_subject') ALTER TABLE risk.assessments ADD CONSTRAINT FK_risk_assessments_subject FOREIGN KEY (subject_id) REFERENCES risk.subjects(id) ON DELETE CASCADE`],
      ['FK_risk_composite_scores_scope', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_risk_composite_scores_scope') ALTER TABLE risk.composite_scores ADD CONSTRAINT FK_risk_composite_scores_scope FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE`],
      ['FK_risk_composite_scores_subject', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_risk_composite_scores_subject') ALTER TABLE risk.composite_scores ADD CONSTRAINT FK_risk_composite_scores_subject FOREIGN KEY (subject_id) REFERENCES risk.subjects(id) ON DELETE CASCADE`],
      ['FK_risk_alerts_scope', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_risk_alerts_scope') ALTER TABLE risk.alerts ADD CONSTRAINT FK_risk_alerts_scope FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE`],
      ['FK_risk_debates_scope', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_risk_debates_scope') ALTER TABLE risk.debates ADD CONSTRAINT FK_risk_debates_scope FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE`],
      ['FK_risk_evaluations_scope', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_risk_evaluations_scope') ALTER TABLE risk.evaluations ADD CONSTRAINT FK_risk_evaluations_scope FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE CASCADE`],
      ['FK_risk_learnings_scope', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_risk_learnings_scope') ALTER TABLE risk.learnings ADD CONSTRAINT FK_risk_learnings_scope FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE SET NULL`],
      ['FK_risk_learning_queue_scope', `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_risk_learning_queue_scope') ALTER TABLE risk.learning_queue ADD CONSTRAINT FK_risk_learning_queue_scope FOREIGN KEY (scope_id) REFERENCES risk.scopes(id) ON DELETE SET NULL`],
    ];
    let moreOk = 0;
    for (const [name, sql] of moreFKs) {
      if (await tryFK(pool, name, sql)) moreOk++;
    }
    console.log(`marketing + orch_flow + prediction + risk FK constraints: ${moreOk}/${moreFKs.length} created`);

    // ================================================================
    // STEP 14a: Seed data - llm_providers and llm_models
    // ================================================================

    await pool.request().query(`
      MERGE dbo.llm_providers AS target
      USING (
        SELECT N'anthropic' AS name, N'Anthropic' AS display_name, N'https://api.anthropic.com/v1' AS api_base_url, CAST(1 AS BIT) AS is_active, CAST(0 AS BIT) AS is_local
        UNION ALL SELECT N'google', N'Google', N'https://generativelanguage.googleapis.com/v1', 1, 0
        UNION ALL SELECT N'ollama', N'Ollama', N'http://localhost:11434', 1, 1
        UNION ALL SELECT N'ollama-cloud', N'Ollama Cloud', N'https://ollama.com/api', 1, 0
        UNION ALL SELECT N'openai', N'OpenAI', N'https://api.openai.com/v1', 1, 0
        UNION ALL SELECT N'xai', N'xAI', N'https://api.x.ai/v1', 1, 0
      ) AS src ON target.name = src.name
      WHEN MATCHED THEN UPDATE SET
        display_name = src.display_name, api_base_url = src.api_base_url,
        is_active = src.is_active, is_local = src.is_local, updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (name, display_name, api_base_url, is_active, is_local)
        VALUES (src.name, src.display_name, src.api_base_url, src.is_active, src.is_local);
    `);
    console.log('llm_providers seed ready');

    await pool.request().query(`
      MERGE dbo.llm_models AS target
      USING (
        SELECT N'claude-3-haiku-20240307' AS model_name, N'anthropic' AS provider_name, N'Claude 3 Haiku' AS display_name, N'text-generation' AS model_type, N'economy' AS model_tier, CAST(1 AS BIT) AS is_active, CAST(0 AS BIT) AS is_local
        UNION ALL SELECT N'claude-haiku-4-5-20251001', N'anthropic', N'Claude Haiku 4.5', N'text-generation', N'standard', 1, 0
        UNION ALL SELECT N'claude-opus-4-5-20251101', N'anthropic', N'Claude Opus 4.5', N'text-generation', N'flagship', 1, 0
        UNION ALL SELECT N'claude-sonnet-4-20250514', N'anthropic', N'Claude Sonnet 4', N'text-generation', N'standard', 1, 0
        UNION ALL SELECT N'gemini-2.0-flash', N'google', N'Gemini 2.0 Flash', N'text-generation', N'economy', 1, 0
        UNION ALL SELECT N'gemini-2.5-pro', N'google', N'Gemini 2.5 Pro', N'text-generation', N'standard', 1, 0
        UNION ALL SELECT N'gemini-3-flash-preview', N'google', N'Gemini 3 Flash Preview', N'text-generation', N'standard', 1, 0
        UNION ALL SELECT N'gemini-3-pro-preview', N'google', N'Gemini 3 Pro', N'text-generation', N'flagship', 1, 0
        UNION ALL SELECT N'imagen-3.0-fast-generate-001', N'google', N'Imagen 3 Fast', N'image-generation', N'economy', 1, 0
        UNION ALL SELECT N'imagen-3.0-generate-001', N'google', N'Imagen 3', N'image-generation', N'standard', 1, 0
        UNION ALL SELECT N'imagen-4.0-fast-generate-001', N'google', N'Imagen 4 Fast', N'image-generation', N'economy', 1, 0
        UNION ALL SELECT N'imagen-4.0-generate-001', N'google', N'Imagen 4', N'image-generation', N'flagship', 1, 0
        UNION ALL SELECT N'imagen-4.0-ultra-generate-001', N'google', N'Imagen 4 Ultra', N'image-generation', N'premium', 1, 0
        UNION ALL SELECT N'veo-3-fast', N'google', N'Veo 3 Fast', N'video-generation', N'economy', 1, 0
        UNION ALL SELECT N'veo-3-generate', N'google', N'Veo 3', N'video-generation', N'standard', 1, 0
        UNION ALL SELECT N'veo-3.1-generate', N'google', N'Veo 3.1', N'video-generation', N'flagship', 1, 0
        UNION ALL SELECT N'codellama:7b', N'ollama', N'Code Llama 7B', N'code-generation', N'local', 1, 1
        UNION ALL SELECT N'deepseek-coder:6.7b', N'ollama', N'DeepSeek Coder 6.7B', N'code-generation', N'local', 1, 1
        UNION ALL SELECT N'deepseek-r1:671b', N'ollama', N'DeepSeek R1 671B (Cloud)', N'text-generation', N'cloud', 1, 0
        UNION ALL SELECT N'gpt-oss:120b', N'ollama', N'GPT-OSS 120B (Cloud)', N'text-generation', N'cloud', 1, 0
        UNION ALL SELECT N'gpt-oss:20b', N'ollama', N'GPT-OSS 20B (Cloud)', N'text-generation', N'cloud', 1, 1
        UNION ALL SELECT N'llama3.1:70b', N'ollama', N'Llama 3.1 70B', N'text-generation', N'local', 1, 1
        UNION ALL SELECT N'llama3.1:8b', N'ollama', N'Llama 3.1 8B', N'text-generation', N'local', 1, 1
        UNION ALL SELECT N'llama3.2', N'ollama', N'Llama 3.2', N'text-generation', N'local', 1, 1
        UNION ALL SELECT N'llama3.2:1b', N'ollama', N'Llama 3.2 1B', N'text-generation', N'local', 1, 1
        UNION ALL SELECT N'llama3.2:3b', N'ollama', N'Llama 3.2 3B', N'text-generation', N'local', 1, 1
        UNION ALL SELECT N'llama3.2:70b', N'ollama', N'Llama 3.2 70B (Cloud)', N'text-generation', N'cloud', 1, 0
        UNION ALL SELECT N'llama3.3:70b', N'ollama', N'Llama 3.3 70B (Cloud)', N'text-generation', N'cloud', 1, 0
        UNION ALL SELECT N'mistral:7b', N'ollama', N'Mistral 7B', N'text-generation', N'local', 1, 1
        UNION ALL SELECT N'mixtral:8x22b', N'ollama', N'Mixtral 8x22B (Cloud)', N'text-generation', N'cloud', 1, 0
        UNION ALL SELECT N'mixtral:8x7b', N'ollama', N'Mixtral 8x7B', N'text-generation', N'local', 1, 1
        UNION ALL SELECT N'qwen2.5-coder:7b', N'ollama', N'Qwen 2.5 Coder 7B', N'code-generation', N'local', 1, 1
        UNION ALL SELECT N'qwen2.5:14b', N'ollama', N'Qwen 2.5 14B', N'text-generation', N'local', 1, 1
        UNION ALL SELECT N'qwen2.5:32b', N'ollama', N'Qwen 2.5 32B', N'text-generation', N'local', 1, 1
        UNION ALL SELECT N'qwen2.5:72b', N'ollama', N'Qwen 2.5 72B (Cloud)', N'text-generation', N'cloud', 1, 0
        UNION ALL SELECT N'qwen2.5:7b', N'ollama', N'Qwen 2.5 7B', N'text-generation', N'local', 1, 1
        UNION ALL SELECT N'gpt-4-turbo', N'openai', N'GPT-4 Turbo', N'text-generation', N'legacy', 1, 0
        UNION ALL SELECT N'gpt-4o', N'openai', N'GPT-4o', N'text-generation', N'standard', 1, 0
        UNION ALL SELECT N'gpt-4o-mini', N'openai', N'GPT-4o Mini', N'text-generation', N'economy', 1, 0
        UNION ALL SELECT N'gpt-5', N'openai', N'GPT-5', N'text-generation', N'flagship', 1, 0
        UNION ALL SELECT N'gpt-5-mini', N'openai', N'GPT-5 Mini', N'text-generation', N'economy', 1, 0
        UNION ALL SELECT N'gpt-5.1', N'openai', N'GPT-5.1', N'text-generation', N'flagship', 1, 0
        UNION ALL SELECT N'gpt-5.1-chat-latest', N'openai', N'GPT-5.1 Instant', N'text-generation', N'standard', 1, 0
        UNION ALL SELECT N'gpt-5.2', N'openai', N'GPT-5.2', N'text-generation', N'flagship', 1, 0
        UNION ALL SELECT N'gpt-5.2-chat-latest', N'openai', N'GPT-5.2 Instant', N'text-generation', N'standard', 1, 0
        UNION ALL SELECT N'gpt-image-1', N'openai', N'GPT Image 1', N'image-generation', N'standard', 1, 0
        UNION ALL SELECT N'gpt-image-1-mini', N'openai', N'GPT Image 1 Mini', N'image-generation', N'economy', 1, 0
        UNION ALL SELECT N'gpt-image-1.5', N'openai', N'GPT Image 1.5', N'image-generation', N'flagship', 1, 0
        UNION ALL SELECT N'o1', N'openai', N'o1', N'reasoning', N'premium', 0, 0
        UNION ALL SELECT N'o3', N'openai', N'o3', N'reasoning', N'standard', 0, 0
        UNION ALL SELECT N'o3-mini', N'openai', N'o3 Mini', N'reasoning', N'economy', 0, 0
        UNION ALL SELECT N'sora-2', N'openai', N'Sora 2', N'video-generation', N'standard', 1, 0
        UNION ALL SELECT N'sora-2-hd', N'openai', N'Sora 2 HD', N'video-generation', N'flagship', 1, 0
        UNION ALL SELECT N'grok-3', N'xai', N'Grok 3', N'text-generation', N'standard', 1, 0
        UNION ALL SELECT N'grok-3-fast', N'xai', N'Grok 3 Fast', N'text-generation', N'economy', 1, 0
        UNION ALL SELECT N'grok-3-mini', N'xai', N'Grok 3 Mini', N'text-generation', N'standard', 1, 0
        UNION ALL SELECT N'grok-4', N'xai', N'Grok 4', N'text-generation', N'flagship', 1, 0
        UNION ALL SELECT N'grok-4-fast', N'xai', N'Grok 4 Fast', N'text-generation', N'flagship', 1, 0
      ) AS src ON target.model_name = src.model_name AND target.provider_name = src.provider_name
      WHEN MATCHED THEN UPDATE SET
        display_name = src.display_name, model_type = src.model_type,
        model_tier = src.model_tier, is_active = src.is_active, is_local = src.is_local,
        updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (model_name, provider_name, display_name, model_type, model_tier, is_active, is_local)
        VALUES (src.model_name, src.provider_name, src.display_name, src.model_type, src.model_tier, src.is_active, src.is_local);
    `);
    console.log('llm_models seed ready');

    // -- organizations --
    await pool.request().query(`
      MERGE dbo.organizations AS target
      USING (
        SELECT N'*' AS slug, N'All Organizations' AS name, N'Special entry to view agents across all organizations' AS description, NULL AS url
        UNION ALL SELECT N'demo-org', N'Demo Organization', N'Test organization for E2E integration tests', NULL
        UNION ALL SELECT N'engineering', N'Engineering', N'Engineering organization for CAD and manufacturing agents', N'https://engineering.orchestratorai.io'
        UNION ALL SELECT N'finance', N'Finance', N'Financial services and prediction agents', NULL
        UNION ALL SELECT N'human-resources', N'Human Resources', N'Human Resources department organization', NULL
        UNION ALL SELECT N'legal', N'Legal', N'Law firm RAG demonstration with 5 complexity types: attributed, hybrid, cross-reference, temporal, and basic', NULL
        UNION ALL SELECT N'marketing', N'Marketing', N'Marketing department', NULL
        UNION ALL SELECT N'gg', N'GG', N'Personal organization', NULL
      ) AS src ON target.slug = src.slug
      WHEN MATCHED THEN UPDATE SET name = src.name, description = src.description, url = src.url, updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (slug, name, description, url)
        VALUES (src.slug, src.name, src.description, src.url);
    `);
    console.log('organizations seed ready');

    // -- rbac_roles --
    await pool.request().query(`
      MERGE authz.rbac_roles AS target
      USING (
        SELECT CAST(N'34fd7cc9-3f86-4d24-9c8a-d6c629a3e087' AS UNIQUEIDENTIFIER) AS id, N'admin' AS name, N'Administrator' AS display_name, N'Full access within assigned organization' AS description, CAST(1 AS BIT) AS is_system
        UNION ALL SELECT CAST(N'1e12b59c-420c-4875-8819-1b17800fa7e7' AS UNIQUEIDENTIFIER), N'manager', N'Manager', N'Can manage users and resources within organization', 1
        UNION ALL SELECT CAST(N'53c51164-247f-43e4-a193-8313fd6a745e' AS UNIQUEIDENTIFIER), N'member', N'Member', N'Standard access within organization', 1
        UNION ALL SELECT CAST(N'55d47492-5521-4376-bb8c-69a49510e049' AS UNIQUEIDENTIFIER), N'super-admin', N'Super Administrator', N'Full access to all organizations and resources', 1
        UNION ALL SELECT CAST(N'ae5575e5-ed9c-4de4-807f-b751c250f061' AS UNIQUEIDENTIFIER), N'viewer', N'Viewer', N'Read-only access within organization', 1
      ) AS src ON target.name = src.name
      WHEN MATCHED THEN UPDATE SET display_name = src.display_name, description = src.description, is_system = src.is_system, updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (id, name, display_name, description, is_system)
        VALUES (src.id, src.name, src.display_name, src.description, src.is_system);
    `);
    console.log('rbac_roles seed ready');

    // -- rbac_permissions --
    await pool.request().query(`
      MERGE authz.rbac_permissions AS target
      USING (
        SELECT CAST(N'cdcdff14-13e3-4610-b1f8-6bdb2893d394' AS UNIQUEIDENTIFIER) AS id, N'admin:audit' AS name, N'View Audit Logs' AS display_name, N'admin' AS category
        UNION ALL SELECT CAST(N'a2db32db-51b1-4bde-8a37-b29ea269295b' AS UNIQUEIDENTIFIER), N'admin:billing', N'Manage Billing', N'admin'
        UNION ALL SELECT CAST(N'69fc99cf-a599-4bdb-8d73-63d04be54de1' AS UNIQUEIDENTIFIER), N'admin:roles', N'Manage Roles', N'admin'
        UNION ALL SELECT CAST(N'15e157e3-a3fb-4dab-a578-1f95de615539' AS UNIQUEIDENTIFIER), N'admin:settings', N'Manage Settings', N'admin'
        UNION ALL SELECT CAST(N'95c9bdd6-f920-4118-9a4e-faa7913e3c6e' AS UNIQUEIDENTIFIER), N'admin:users', N'Manage Users', N'admin'
        UNION ALL SELECT CAST(N'830383b4-5a54-4398-94ca-027c5fa9b0c0' AS UNIQUEIDENTIFIER), N'agents:admin', N'Administer Agents', N'agents'
        UNION ALL SELECT CAST(N'e79faa09-6888-4be7-98be-ee93b4ebf529' AS UNIQUEIDENTIFIER), N'agents:execute', N'Execute Agents', N'agents'
        UNION ALL SELECT CAST(N'2bd0949b-006b-4414-861e-555451d7bcdf' AS UNIQUEIDENTIFIER), N'agents:manage', N'Manage Agents', N'agents'
        UNION ALL SELECT CAST(N'4bda0311-ad05-4aaa-9346-97857b8f9c37' AS UNIQUEIDENTIFIER), N'deliverables:delete', N'Delete Deliverables', N'deliverables'
        UNION ALL SELECT CAST(N'eb0488ae-f114-4447-bc47-d1d1275c45c0' AS UNIQUEIDENTIFIER), N'deliverables:read', N'Read Deliverables', N'deliverables'
        UNION ALL SELECT CAST(N'71dcfc5b-6d20-4318-a69b-4c24b90f352a' AS UNIQUEIDENTIFIER), N'deliverables:write', N'Write Deliverables', N'deliverables'
        UNION ALL SELECT CAST(N'288946eb-64b7-4035-9a9c-460bdab9e4c8' AS UNIQUEIDENTIFIER), N'llm:admin', N'Administer LLM', N'llm'
        UNION ALL SELECT CAST(N'14e29f34-ef8a-43c7-bb12-e403f0ec0a41' AS UNIQUEIDENTIFIER), N'llm:use', N'Use LLM', N'llm'
        UNION ALL SELECT CAST(N'61b09647-4d51-4558-a1cf-a4a3dff8fc0b' AS UNIQUEIDENTIFIER), N'rag:admin', N'Administer RAG', N'rag'
        UNION ALL SELECT CAST(N'1e44b424-7d88-43dd-b2e7-25144739623f' AS UNIQUEIDENTIFIER), N'rag:delete', N'Delete RAG', N'rag'
        UNION ALL SELECT CAST(N'99a9829f-6f6f-4f4a-9d83-7c381cde3dcb' AS UNIQUEIDENTIFIER), N'rag:read', N'Read RAG', N'rag'
        UNION ALL SELECT CAST(N'cb1d15f7-ae4f-4633-b235-1342f147101b' AS UNIQUEIDENTIFIER), N'rag:write', N'Write RAG', N'rag'
        UNION ALL SELECT CAST(N'602a41db-9720-4f8c-a423-6b8cb064c449' AS UNIQUEIDENTIFIER), N'*:*', N'Full Access', N'system'
      ) AS src ON target.name = src.name
      WHEN MATCHED THEN UPDATE SET display_name = src.display_name, category = src.category
      WHEN NOT MATCHED THEN INSERT (id, name, display_name, category)
        VALUES (src.id, src.name, src.display_name, src.category);
    `);
    console.log('rbac_permissions seed ready');

    // -- rbac_role_permissions --
    await pool.request().query(`
      MERGE authz.rbac_role_permissions AS target
      USING (
        SELECT CAST(N'e37cd481-515d-4a57-889f-8f33d68c2574' AS UNIQUEIDENTIFIER) AS id, CAST(N'1e12b59c-420c-4875-8819-1b17800fa7e7' AS UNIQUEIDENTIFIER) AS role_id, CAST(N'14e29f34-ef8a-43c7-bb12-e403f0ec0a41' AS UNIQUEIDENTIFIER) AS permission_id
        UNION ALL SELECT CAST(N'755ced69-56a4-4b9f-a187-f9b7f94ec5d3' AS UNIQUEIDENTIFIER), CAST(N'1e12b59c-420c-4875-8819-1b17800fa7e7' AS UNIQUEIDENTIFIER), CAST(N'2bd0949b-006b-4414-861e-555451d7bcdf' AS UNIQUEIDENTIFIER)
        UNION ALL SELECT CAST(N'1baaaec9-d1b5-44b0-94a7-a9c6b6ce8d27' AS UNIQUEIDENTIFIER), CAST(N'1e12b59c-420c-4875-8819-1b17800fa7e7' AS UNIQUEIDENTIFIER), CAST(N'71dcfc5b-6d20-4318-a69b-4c24b90f352a' AS UNIQUEIDENTIFIER)
        UNION ALL SELECT CAST(N'1a34bb71-eb24-458e-bd6d-c52c56629112' AS UNIQUEIDENTIFIER), CAST(N'1e12b59c-420c-4875-8819-1b17800fa7e7' AS UNIQUEIDENTIFIER), CAST(N'95c9bdd6-f920-4118-9a4e-faa7913e3c6e' AS UNIQUEIDENTIFIER)
        UNION ALL SELECT CAST(N'543181d8-f425-456d-a9df-6679c7038460' AS UNIQUEIDENTIFIER), CAST(N'1e12b59c-420c-4875-8819-1b17800fa7e7' AS UNIQUEIDENTIFIER), CAST(N'99a9829f-6f6f-4f4a-9d83-7c381cde3dcb' AS UNIQUEIDENTIFIER)
        UNION ALL SELECT CAST(N'86389cd0-401c-49fd-94de-908fc730faa3' AS UNIQUEIDENTIFIER), CAST(N'1e12b59c-420c-4875-8819-1b17800fa7e7' AS UNIQUEIDENTIFIER), CAST(N'cb1d15f7-ae4f-4633-b235-1342f147101b' AS UNIQUEIDENTIFIER)
        UNION ALL SELECT CAST(N'131955bf-4dc7-43f0-a01e-200a4c7d6dda' AS UNIQUEIDENTIFIER), CAST(N'1e12b59c-420c-4875-8819-1b17800fa7e7' AS UNIQUEIDENTIFIER), CAST(N'e79faa09-6888-4be7-98be-ee93b4ebf529' AS UNIQUEIDENTIFIER)
        UNION ALL SELECT CAST(N'0f8ae91b-8981-4473-83c1-a6d59b90324b' AS UNIQUEIDENTIFIER), CAST(N'1e12b59c-420c-4875-8819-1b17800fa7e7' AS UNIQUEIDENTIFIER), CAST(N'eb0488ae-f114-4447-bc47-d1d1275c45c0' AS UNIQUEIDENTIFIER)
        UNION ALL SELECT CAST(N'09330342-d9ec-4844-b07f-d436cb46d92a' AS UNIQUEIDENTIFIER), CAST(N'34fd7cc9-3f86-4d24-9c8a-d6c629a3e087' AS UNIQUEIDENTIFIER), CAST(N'14e29f34-ef8a-43c7-bb12-e403f0ec0a41' AS UNIQUEIDENTIFIER)
        UNION ALL SELECT CAST(N'badd4545-2c1d-4f38-bc97-db3a110ba05f' AS UNIQUEIDENTIFIER), CAST(N'34fd7cc9-3f86-4d24-9c8a-d6c629a3e087' AS UNIQUEIDENTIFIER), CAST(N'15e157e3-a3fb-4dab-a578-1f95de615539' AS UNIQUEIDENTIFIER)
        UNION ALL SELECT CAST(N'eff6cd39-84d4-4812-ae26-d33b07a15cce' AS UNIQUEIDENTIFIER), CAST(N'34fd7cc9-3f86-4d24-9c8a-d6c629a3e087' AS UNIQUEIDENTIFIER), CAST(N'288946eb-64b7-4035-9a9c-460bdab9e4c8' AS UNIQUEIDENTIFIER)
        UNION ALL SELECT CAST(N'c64ff831-35ea-4ed7-8976-fab40ba6d558' AS UNIQUEIDENTIFIER), CAST(N'34fd7cc9-3f86-4d24-9c8a-d6c629a3e087' AS UNIQUEIDENTIFIER), CAST(N'4bda0311-ad05-4aaa-9346-97857b8f9c37' AS UNIQUEIDENTIFIER)
        UNION ALL SELECT CAST(N'd0a3b67a-aedf-43aa-b9cc-45ea0813ff2d' AS UNIQUEIDENTIFIER), CAST(N'34fd7cc9-3f86-4d24-9c8a-d6c629a3e087' AS UNIQUEIDENTIFIER), CAST(N'61b09647-4d51-4558-a1cf-a4a3dff8fc0b' AS UNIQUEIDENTIFIER)
        UNION ALL SELECT CAST(N'015e5b45-4e09-45a3-97a7-510ddb4539dd' AS UNIQUEIDENTIFIER), CAST(N'34fd7cc9-3f86-4d24-9c8a-d6c629a3e087' AS UNIQUEIDENTIFIER), CAST(N'69fc99cf-a599-4bdb-8d73-63d04be54de1' AS UNIQUEIDENTIFIER)
        UNION ALL SELECT CAST(N'db7fc511-d34c-4de4-b143-8274a4170dfa' AS UNIQUEIDENTIFIER), CAST(N'34fd7cc9-3f86-4d24-9c8a-d6c629a3e087' AS UNIQUEIDENTIFIER), CAST(N'71dcfc5b-6d20-4318-a69b-4c24b90f352a' AS UNIQUEIDENTIFIER)
        UNION ALL SELECT CAST(N'86582e51-0eea-40ee-a32c-572565d2159f' AS UNIQUEIDENTIFIER), CAST(N'34fd7cc9-3f86-4d24-9c8a-d6c629a3e087' AS UNIQUEIDENTIFIER), CAST(N'830383b4-5a54-4398-94ca-027c5fa9b0c0' AS UNIQUEIDENTIFIER)
        UNION ALL SELECT CAST(N'28644c87-10b4-46ed-a20e-618a7ddbbe1e' AS UNIQUEIDENTIFIER), CAST(N'34fd7cc9-3f86-4d24-9c8a-d6c629a3e087' AS UNIQUEIDENTIFIER), CAST(N'95c9bdd6-f920-4118-9a4e-faa7913e3c6e' AS UNIQUEIDENTIFIER)
        UNION ALL SELECT CAST(N'93aebb25-2049-4eb5-9dac-95f96313bc24' AS UNIQUEIDENTIFIER), CAST(N'34fd7cc9-3f86-4d24-9c8a-d6c629a3e087' AS UNIQUEIDENTIFIER), CAST(N'cdcdff14-13e3-4610-b1f8-6bdb2893d394' AS UNIQUEIDENTIFIER)
        UNION ALL SELECT CAST(N'6eb9f5d2-5ff0-4dbd-b4c8-72bfa71c79b8' AS UNIQUEIDENTIFIER), CAST(N'34fd7cc9-3f86-4d24-9c8a-d6c629a3e087' AS UNIQUEIDENTIFIER), CAST(N'eb0488ae-f114-4447-bc47-d1d1275c45c0' AS UNIQUEIDENTIFIER)
        UNION ALL SELECT CAST(N'a86c4117-a845-4bb6-95f3-922626d681aa' AS UNIQUEIDENTIFIER), CAST(N'53c51164-247f-43e4-a193-8313fd6a745e' AS UNIQUEIDENTIFIER), CAST(N'14e29f34-ef8a-43c7-bb12-e403f0ec0a41' AS UNIQUEIDENTIFIER)
        UNION ALL SELECT CAST(N'9f2232f3-eabc-4661-8b41-90ca75d8619e' AS UNIQUEIDENTIFIER), CAST(N'53c51164-247f-43e4-a193-8313fd6a745e' AS UNIQUEIDENTIFIER), CAST(N'71dcfc5b-6d20-4318-a69b-4c24b90f352a' AS UNIQUEIDENTIFIER)
        UNION ALL SELECT CAST(N'd6250274-47e5-4021-a009-65aa52f92ceb' AS UNIQUEIDENTIFIER), CAST(N'53c51164-247f-43e4-a193-8313fd6a745e' AS UNIQUEIDENTIFIER), CAST(N'99a9829f-6f6f-4f4a-9d83-7c381cde3dcb' AS UNIQUEIDENTIFIER)
        UNION ALL SELECT CAST(N'5f25b841-a07d-4e18-9696-d388124c0ae7' AS UNIQUEIDENTIFIER), CAST(N'53c51164-247f-43e4-a193-8313fd6a745e' AS UNIQUEIDENTIFIER), CAST(N'e79faa09-6888-4be7-98be-ee93b4ebf529' AS UNIQUEIDENTIFIER)
        UNION ALL SELECT CAST(N'5edcc6b5-eb38-4c4e-a9d3-ecb2dafc1a59' AS UNIQUEIDENTIFIER), CAST(N'53c51164-247f-43e4-a193-8313fd6a745e' AS UNIQUEIDENTIFIER), CAST(N'eb0488ae-f114-4447-bc47-d1d1275c45c0' AS UNIQUEIDENTIFIER)
        UNION ALL SELECT CAST(N'636aa177-ad8c-475a-95d9-6019efd3f909' AS UNIQUEIDENTIFIER), CAST(N'55d47492-5521-4376-bb8c-69a49510e049' AS UNIQUEIDENTIFIER), CAST(N'602a41db-9720-4f8c-a423-6b8cb064c449' AS UNIQUEIDENTIFIER)
        UNION ALL SELECT CAST(N'b22cb9de-21d7-4c40-a9a9-1a6426293e88' AS UNIQUEIDENTIFIER), CAST(N'ae5575e5-ed9c-4de4-807f-b751c250f061' AS UNIQUEIDENTIFIER), CAST(N'14e29f34-ef8a-43c7-bb12-e403f0ec0a41' AS UNIQUEIDENTIFIER)
        UNION ALL SELECT CAST(N'e2d48fbd-2df9-4b1b-9a50-d9d4f711135b' AS UNIQUEIDENTIFIER), CAST(N'ae5575e5-ed9c-4de4-807f-b751c250f061' AS UNIQUEIDENTIFIER), CAST(N'99a9829f-6f6f-4f4a-9d83-7c381cde3dcb' AS UNIQUEIDENTIFIER)
        UNION ALL SELECT CAST(N'853fcfe3-3068-4085-a773-8e9f6c86933c' AS UNIQUEIDENTIFIER), CAST(N'ae5575e5-ed9c-4de4-807f-b751c250f061' AS UNIQUEIDENTIFIER), CAST(N'e79faa09-6888-4be7-98be-ee93b4ebf529' AS UNIQUEIDENTIFIER)
        UNION ALL SELECT CAST(N'ec71d971-82ef-4d88-ae0e-e41b61d20e71' AS UNIQUEIDENTIFIER), CAST(N'ae5575e5-ed9c-4de4-807f-b751c250f061' AS UNIQUEIDENTIFIER), CAST(N'eb0488ae-f114-4447-bc47-d1d1275c45c0' AS UNIQUEIDENTIFIER)
      ) AS src ON target.role_id = src.role_id AND target.permission_id = src.permission_id
      WHEN NOT MATCHED THEN INSERT (id, role_id, permission_id)
        VALUES (src.id, src.role_id, src.permission_id);
    `);
    console.log('rbac_role_permissions seed ready');

    // -- redaction_patterns --
    await pool.request().query(`
      MERGE dbo.redaction_patterns AS target
      USING (
        SELECT CAST(N'a2089c48-baca-40ee-ac5a-00207d6a1206' AS UNIQUEIDENTIFIER) AS id, N'Credit Card - Generic' AS name,
          N'\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b' AS pattern_regex, N'[CC_REDACTED]' AS replacement,
          N'pii_builtin' AS category, 5 AS priority, CAST(1 AS BIT) AS is_active
        UNION ALL SELECT CAST(N'57889ef8-0828-45b5-b6b6-1baa121a6426' AS UNIQUEIDENTIFIER), N'SSN - US Social Security Number',
          N'\b\d{3}-\d{2}-\d{4}\b', N'[SSN_REDACTED]', N'pii_builtin', 10, 1
        UNION ALL SELECT CAST(N'e5825c0e-3033-4c42-a693-8a225d03f755' AS UNIQUEIDENTIFIER), N'Email Address',
          N'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', N'[EMAIL_REDACTED]', N'pii_builtin', 20, 1
        UNION ALL SELECT CAST(N'e24bb3cb-0123-449d-8a42-d54e6ed7668f' AS UNIQUEIDENTIFIER), N'Phone - US Format',
          N'\b(\+1[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}\b', N'[PHONE_REDACTED]', N'pii_builtin', 30, 1
        UNION ALL SELECT CAST(N'2eb9cae3-224a-46f1-a6cf-4052b2319810' AS UNIQUEIDENTIFIER), N'IP Address - IPv4',
          N'\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b', N'[IP_REDACTED]', N'pii_builtin', 40, 1
      ) AS src ON target.id = src.id
      WHEN MATCHED THEN UPDATE SET
        name = src.name, pattern_regex = src.pattern_regex, replacement = src.replacement,
        category = src.category, priority = src.priority, is_active = src.is_active, updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (id, name, pattern_regex, replacement, category, priority, is_active)
        VALUES (src.id, src.name, src.pattern_regex, src.replacement, src.category, src.priority, src.is_active);
    `);
    console.log('redaction_patterns seed ready');

    // -- system_settings --
    await pool.request().query(`
      MERGE dbo.system_settings AS target
      USING (
        SELECT N'model_config_global' AS [key],
          N'{"model":"llama3.2:1b","provider":"ollama","parameters":{"maxTokens":8000,"temperature":0.7}}' AS value,
          NULL AS description
        UNION ALL SELECT N'pii_retention_config',
          N'{"max_retention_days":365,"default_retention_days":90,"extension_on_use_days":30,"cleanup_batch_size":1000}',
          NULL
      ) AS src ON target.[key] = src.[key]
      WHEN MATCHED THEN UPDATE SET value = src.value, updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT ([key], value, description)
        VALUES (src.[key], src.value, src.description);
    `);
    console.log('system_settings seed ready');

    // -- marketing.content_types --
    await pool.request().query(`
      MERGE marketing.content_types AS target
      USING (
        SELECT N'blog-post' AS slug, N'marketing' AS organization_slug, N'Blog Post' AS name, N'Long-form blog content for company websites and content marketing' AS description, N'You are a professional blog writer.' AS system_context
        UNION ALL SELECT N'case-study', N'marketing', N'Case Study', N'Customer success story and case study', N'You are a professional case study writer.'
        UNION ALL SELECT N'email-newsletter', N'marketing', N'Email Newsletter', N'Email newsletter content for subscribers', N'You are a professional email newsletter writer.'
        UNION ALL SELECT N'landing-page', N'marketing', N'Landing Page Copy', N'Conversion-focused landing page content', N'You are a professional landing page copywriter.'
        UNION ALL SELECT N'linkedin-post', N'marketing', N'LinkedIn Post', N'Professional social media content for LinkedIn', N'You are a professional LinkedIn content creator.'
        UNION ALL SELECT N'press-release', N'marketing', N'Press Release', N'Official press release announcements', N'You are a professional press release writer.'
        UNION ALL SELECT N'product-description', N'marketing', N'Product Description', N'E-commerce product descriptions', N'You are a professional product description writer.'
        UNION ALL SELECT N'twitter-thread', N'marketing', N'Twitter/X Thread', N'Multi-tweet thread for Twitter/X', N'You are a professional Twitter/X content creator.'
      ) AS src ON target.slug = src.slug
      WHEN MATCHED THEN UPDATE SET name = src.name, description = src.description, system_context = src.system_context, updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (slug, organization_slug, name, description, system_context)
        VALUES (src.slug, src.organization_slug, src.name, src.description, src.system_context);
    `);
    console.log('marketing.content_types seed ready');

    // -- marketing.agents --
    await pool.request().query(`
      MERGE marketing.agents AS target
      USING (
        SELECT N'editor-brand' AS slug, N'marketing' AS organization_slug, N'editor' AS role, N'Brand Voice Editor' AS name, N'{"tone":"brand"}' AS personality
        UNION ALL SELECT N'editor-clarity', N'marketing', N'editor', N'Clarity Editor', N'{"tone":"clarity"}'
        UNION ALL SELECT N'editor-clarity-anthropic', N'marketing', N'editor', N'Clarity Editor (Claude)', N'{"tone":"clarity","provider":"anthropic"}'
        UNION ALL SELECT N'editor-clarity-google', N'marketing', N'editor', N'Clarity Editor (Gemini)', N'{"tone":"clarity","provider":"google"}'
        UNION ALL SELECT N'editor-clarity-grok', N'marketing', N'editor', N'Clarity Editor (Grok)', N'{"tone":"clarity","provider":"xai"}'
        UNION ALL SELECT N'editor-clarity-ollama', N'marketing', N'editor', N'Clarity Editor (Qwen)', N'{"tone":"clarity","provider":"ollama"}'
        UNION ALL SELECT N'editor-engagement', N'marketing', N'editor', N'Engagement Editor', N'{"tone":"engagement"}'
        UNION ALL SELECT N'editor-seo', N'marketing', N'editor', N'SEO Editor', N'{"tone":"seo"}'
        UNION ALL SELECT N'evaluator-conversion', N'marketing', N'evaluator', N'Conversion Evaluator', N'{"focus":"conversion"}'
        UNION ALL SELECT N'evaluator-creativity', N'marketing', N'evaluator', N'Creativity Evaluator', N'{"focus":"creativity"}'
        UNION ALL SELECT N'evaluator-quality', N'marketing', N'evaluator', N'Quality Evaluator', N'{"focus":"quality"}'
        UNION ALL SELECT N'evaluator-quality-anthropic', N'marketing', N'evaluator', N'Quality Evaluator (Claude)', N'{"focus":"quality","provider":"anthropic"}'
        UNION ALL SELECT N'evaluator-quality-google', N'marketing', N'evaluator', N'Quality Evaluator (Gemini)', N'{"focus":"quality","provider":"google"}'
        UNION ALL SELECT N'evaluator-quality-grok', N'marketing', N'evaluator', N'Quality Evaluator (Grok)', N'{"focus":"quality","provider":"xai"}'
        UNION ALL SELECT N'evaluator-quality-ollama', N'marketing', N'evaluator', N'Quality Evaluator (Qwen)', N'{"focus":"quality","provider":"ollama"}'
        UNION ALL SELECT N'writer-conversational', N'marketing', N'writer', N'Conversational Writer', N'{"style":"conversational"}'
        UNION ALL SELECT N'writer-conversational-anthropic', N'marketing', N'writer', N'Conversational Writer (Claude)', N'{"style":"conversational","provider":"anthropic"}'
        UNION ALL SELECT N'writer-conversational-google', N'marketing', N'writer', N'Conversational Writer (Gemini)', N'{"style":"conversational","provider":"google"}'
        UNION ALL SELECT N'writer-conversational-grok', N'marketing', N'writer', N'Conversational Writer (Grok)', N'{"style":"conversational","provider":"xai"}'
        UNION ALL SELECT N'writer-conversational-ollama', N'marketing', N'writer', N'Conversational Writer (Qwen)', N'{"style":"conversational","provider":"ollama"}'
        UNION ALL SELECT N'writer-creative', N'marketing', N'writer', N'Creative Writer', N'{"style":"creative"}'
        UNION ALL SELECT N'writer-persuasive', N'marketing', N'writer', N'Persuasive Writer', N'{"style":"persuasive"}'
        UNION ALL SELECT N'writer-technical', N'marketing', N'writer', N'Technical Writer', N'{"style":"technical"}'
      ) AS src ON target.slug = src.slug
      WHEN MATCHED THEN UPDATE SET name = src.name, role = src.role, personality = src.personality, updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (slug, organization_slug, role, name, personality)
        VALUES (src.slug, src.organization_slug, src.role, src.name, src.personality);
    `);
    console.log('marketing.agents seed ready');

    // -- prediction.strategies --
    await pool.request().query(`
      MERGE prediction.strategies AS target
      USING (
        SELECT CAST(N'98d05599-3e13-4dc4-826c-4aef856d87d3' AS UNIQUEIDENTIFIER) AS id, N'aggressive' AS slug, N'Aggressive' AS name, N'high' AS risk_level, CAST(1 AS BIT) AS is_system
        UNION ALL SELECT CAST(N'7db64e1d-8df4-4d61-a205-2134cacab3c7' AS UNIQUEIDENTIFIER), N'balanced', N'Balanced', N'medium', 1
        UNION ALL SELECT CAST(N'b5f6e812-95db-412a-bd07-300be52e471c' AS UNIQUEIDENTIFIER), N'conservative', N'Conservative', N'low', 1
        UNION ALL SELECT CAST(N'4a9175d4-2b92-4c3d-b8d5-c4d934147bdf' AS UNIQUEIDENTIFIER), N'contrarian', N'Contrarian', N'medium', 1
        UNION ALL SELECT CAST(N'98064bca-ea65-40cb-ae05-df19bf30f05e' AS UNIQUEIDENTIFIER), N'technical', N'Technical Focus', N'medium', 1
      ) AS src ON target.slug = src.slug
      WHEN MATCHED THEN UPDATE SET name = src.name, risk_level = src.risk_level, is_system = src.is_system, updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (id, slug, name, risk_level, is_system)
        VALUES (src.id, src.slug, src.name, src.risk_level, src.is_system);
    `);
    console.log('prediction.strategies seed ready');

    // -- prediction.position_sizing_config --
    await pool.request().query(`
      MERGE prediction.position_sizing_config AS target
      USING (
        SELECT CAST(N'0cd51bf4-cb4d-44bf-aae0-3f531511b25a' AS UNIQUEIDENTIFIER) AS id, N'*' AS org_slug, N'high' AS tier_name, CAST(0.80 AS DECIMAL(4,2)) AS min_confidence, CAST(1.00 AS DECIMAL(4,2)) AS max_confidence, CAST(0.15 AS DECIMAL(4,2)) AS position_percent
        UNION ALL SELECT CAST(N'a53a3db3-050a-4a44-9784-79fb92c80976' AS UNIQUEIDENTIFIER), N'*', N'low', 0.60, 0.70, 0.05
        UNION ALL SELECT CAST(N'6c2129b7-f027-4ec1-bb8e-d26a69c94a8a' AS UNIQUEIDENTIFIER), N'*', N'medium', 0.70, 0.80, 0.10
      ) AS src ON target.org_slug = src.org_slug AND target.tier_name = src.tier_name
      WHEN MATCHED THEN UPDATE SET min_confidence = src.min_confidence, max_confidence = src.max_confidence, position_percent = src.position_percent, updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (id, org_slug, tier_name, min_confidence, max_confidence, position_percent)
        VALUES (src.id, src.org_slug, src.tier_name, src.min_confidence, src.max_confidence, src.position_percent);
    `);
    console.log('prediction.position_sizing_config seed ready');

    // -- crawler.sources --
    await pool.request().query(`
      MERGE crawler.sources AS target
      USING (
        SELECT CAST(N'ef01c9dd-0498-4ba0-8385-b8f472a8f244' AS UNIQUEIDENTIFIER) AS id, N'finance' AS organization_slug, N'Apple Newsroom' AS name, N'web' AS source_type, N'https://www.apple.com/newsroom/' AS url, 60 AS crawl_frequency_minutes, CAST(1 AS BIT) AS is_active
        UNION ALL SELECT CAST(N'653dff58-4298-4c07-8a7c-c0cf9c91a2d2' AS UNIQUEIDENTIFIER), N'finance', N'Ars Technica', N'rss', N'https://feeds.arstechnica.com/arstechnica/technology-lab', 60, 1
        UNION ALL SELECT CAST(N'ed0cca45-af7a-41b1-9995-8a36cbb595a4' AS UNIQUEIDENTIFIER), N'finance', N'Benzinga Tech', N'rss', N'https://www.benzinga.com/tech/feed', 10, 1
        UNION ALL SELECT CAST(N'c890ede4-826e-49cc-9e0c-7589934e92e4' AS UNIQUEIDENTIFIER), N'finance', N'Bitcoinist', N'rss', N'https://bitcoinist.com/feed', 30, 1
        UNION ALL SELECT CAST(N'f2f7df29-f9ee-4d91-a559-0244d5e73363' AS UNIQUEIDENTIFIER), N'finance', N'CNBC Technology', N'rss', N'https://www.cnbc.com/id/19854910/device/rss/rss.html', 15, 1
        UNION ALL SELECT CAST(N'54ba45fb-0870-4758-be09-56cefc5685c6' AS UNIQUEIDENTIFIER), N'finance', N'CoinDesk RSS', N'rss', N'https://www.coindesk.com/arc/outboundfeeds/rss/', 10, 1
        UNION ALL SELECT CAST(N'6367793a-1118-448a-8438-f50046807f9a' AS UNIQUEIDENTIFIER), N'finance', N'CoinTelegraph', N'rss', N'https://cointelegraph.com/rss', 10, 1
        UNION ALL SELECT CAST(N'333e0885-4dd8-4309-b645-07dbe0b02978' AS UNIQUEIDENTIFIER), N'finance', N'Crypto.news', N'rss', N'https://crypto.news/feed', 30, 1
        UNION ALL SELECT CAST(N'5567ebf5-0ff7-4800-9257-1d1f35550c6a' AS UNIQUEIDENTIFIER), N'finance', N'Google Blog', N'web', N'https://blog.google/', 60, 1
        UNION ALL SELECT CAST(N'6c0b8a7c-cfd7-42b5-92ce-560b405e7d5d' AS UNIQUEIDENTIFIER), N'finance', N'MarketWatch Technology', N'rss', N'https://feeds.marketwatch.com/marketwatch/software/', 15, 1
        UNION ALL SELECT CAST(N'ba640a98-be79-4299-bfe5-528a145387ae' AS UNIQUEIDENTIFIER), N'finance', N'Microsoft News Center', N'web', N'https://news.microsoft.com/', 60, 1
        UNION ALL SELECT CAST(N'3677e565-7abc-4145-bd84-67f67e1f2c35' AS UNIQUEIDENTIFIER), N'finance', N'NVIDIA Newsroom', N'web', N'https://nvidianews.nvidia.com/', 60, 1
        UNION ALL SELECT CAST(N'fae34b26-364c-4592-b010-d0e5c9f2cf31' AS UNIQUEIDENTIFIER), N'finance', N'Reuters Technology', N'rss', N'https://www.reutersagency.com/feed/?best-topics=tech&post_type=best', 15, 1
        UNION ALL SELECT CAST(N'8cf79c52-7e56-43de-b183-482f55c27eea' AS UNIQUEIDENTIFIER), N'finance', N'Seeking Alpha Technology', N'rss', N'https://seekingalpha.com/sector/technology.xml', 30, 1
        UNION ALL SELECT CAST(N'8e49ccfa-f869-4d35-88a2-0155c2b20c0e' AS UNIQUEIDENTIFIER), N'finance', N'TechCrunch', N'rss', N'https://techcrunch.com/feed/', 30, 1
        UNION ALL SELECT CAST(N'29203627-5325-4f49-a7f1-d33d1a2a0142' AS UNIQUEIDENTIFIER), N'finance', N'The Verge Tech', N'rss', N'https://www.theverge.com/rss/index.xml', 30, 1
        UNION ALL SELECT CAST(N'e7f22982-6cdf-4247-b821-aa2e0446c08a' AS UNIQUEIDENTIFIER), N'finance', N'Yahoo Finance Tech News', N'rss', N'https://finance.yahoo.com/news/rssindex', 15, 1
      ) AS src ON target.id = src.id
      WHEN MATCHED THEN UPDATE SET name = src.name, source_type = src.source_type, url = src.url, crawl_frequency_minutes = src.crawl_frequency_minutes, is_active = src.is_active, updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (id, organization_slug, name, source_type, url, crawl_frequency_minutes, is_active)
        VALUES (src.id, src.organization_slug, src.name, src.source_type, src.url, src.crawl_frequency_minutes, src.is_active);
    `);
    console.log('crawler.sources seed ready');

    // ================================================================
    // STEP 14b: Stored procedures
    // ================================================================

    // rbac_get_user_organizations — equivalent of Supabase RPC function
    await pool.request().query(`
      CREATE OR ALTER PROCEDURE [dbo].[rbac_get_user_organizations]
        @p_user_id NVARCHAR(255)
      AS
      BEGIN
        SET NOCOUNT ON;

        DECLARE @has_global BIT = 0;
        DECLARE @global_role NVARCHAR(100) = NULL;

        SELECT @has_global = 1
        FROM [authz].[rbac_user_org_roles] uor
        WHERE uor.user_id = @p_user_id
          AND uor.organization_slug = N'*'
          AND (uor.expires_at IS NULL OR uor.expires_at > GETUTCDATE());

        IF @has_global = 1
        BEGIN
          SELECT TOP 1 @global_role = r.name
          FROM [authz].[rbac_user_org_roles] uor
          JOIN [authz].[rbac_roles] r ON uor.role_id = r.id
          WHERE uor.user_id = @p_user_id
            AND uor.organization_slug = N'*'
            AND (uor.expires_at IS NULL OR uor.expires_at > GETUTCDATE());

          SELECT DISTINCT
            o.slug AS organization_slug,
            o.name AS organization_name,
            @global_role AS role_name,
            CAST(1 AS BIT) AS is_global
          FROM [dbo].[organizations] o
          ORDER BY o.slug;
        END
        ELSE
        BEGIN
          SELECT DISTINCT
            uor.organization_slug,
            o.name AS organization_name,
            r.name AS role_name,
            CAST(0 AS BIT) AS is_global
          FROM [authz].[rbac_user_org_roles] uor
          JOIN [authz].[rbac_roles] r ON uor.role_id = r.id
          LEFT JOIN [dbo].[organizations] o ON o.slug = uor.organization_slug
          WHERE uor.user_id = @p_user_id
            AND (uor.expires_at IS NULL OR uor.expires_at > GETUTCDATE())
          ORDER BY uor.organization_slug;
        END
      END
    `);
    console.log('stored procedure rbac_get_user_organizations ready');

    // rbac_has_permission
    await pool.request().query(`
      CREATE OR ALTER PROCEDURE [dbo].[rbac_has_permission]
        @p_user_id NVARCHAR(255),
        @p_organization_slug NVARCHAR(255),
        @p_permission NVARCHAR(100),
        @p_resource_type NVARCHAR(100) = NULL,
        @p_resource_id NVARCHAR(255) = NULL
      AS
      BEGIN
        SET NOCOUNT ON;
        DECLARE @v_permission_category NVARCHAR(100);
        SET @v_permission_category = LEFT(@p_permission, CHARINDEX(':', @p_permission) - 1);

        IF EXISTS(
          SELECT 1
          FROM [authz].[rbac_user_org_roles] uor
          JOIN [authz].[rbac_role_permissions] rp ON uor.role_id = rp.role_id
          JOIN [authz].[rbac_permissions] p ON rp.permission_id = p.id
          WHERE uor.user_id = @p_user_id
            AND (uor.organization_slug = @p_organization_slug OR uor.organization_slug = N'*')
            AND (uor.expires_at IS NULL OR uor.expires_at > GETUTCDATE())
            AND (
              p.name = @p_permission
              OR p.name = @v_permission_category + N':*'
              OR p.name = N'*:*'
            )
            AND (
              rp.resource_type IS NULL
              OR (
                rp.resource_type = @p_resource_type
                AND (rp.resource_id IS NULL OR CAST(rp.resource_id AS NVARCHAR(255)) = @p_resource_id)
              )
            )
        )
          SELECT CAST(1 AS BIT) AS result;
        ELSE
          SELECT CAST(0 AS BIT) AS result;
      END
    `);
    console.log('stored procedure rbac_has_permission ready');

    // rbac_get_user_permissions
    await pool.request().query(`
      CREATE OR ALTER PROCEDURE [dbo].[rbac_get_user_permissions]
        @p_user_id NVARCHAR(255),
        @p_organization_slug NVARCHAR(255)
      AS
      BEGIN
        SET NOCOUNT ON;
        SELECT DISTINCT
          p.name AS permission_name,
          rp.resource_type,
          rp.resource_id
        FROM [authz].[rbac_user_org_roles] uor
        JOIN [authz].[rbac_role_permissions] rp ON uor.role_id = rp.role_id
        JOIN [authz].[rbac_permissions] p ON rp.permission_id = p.id
        WHERE uor.user_id = @p_user_id
          AND (uor.organization_slug = @p_organization_slug OR uor.organization_slug = N'*')
          AND (uor.expires_at IS NULL OR uor.expires_at > GETUTCDATE())
        ORDER BY p.name;
      END
    `);
    console.log('stored procedure rbac_get_user_permissions ready');

    // rbac_get_user_roles
    await pool.request().query(`
      CREATE OR ALTER PROCEDURE [dbo].[rbac_get_user_roles]
        @p_user_id NVARCHAR(255),
        @p_organization_slug NVARCHAR(255)
      AS
      BEGIN
        SET NOCOUNT ON;
        SELECT
          r.id AS role_id,
          r.name AS role_name,
          r.display_name AS role_display_name,
          CASE WHEN uor.organization_slug = N'*' THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS is_global,
          uor.assigned_at,
          uor.expires_at
        FROM [authz].[rbac_user_org_roles] uor
        JOIN [authz].[rbac_roles] r ON uor.role_id = r.id
        WHERE uor.user_id = @p_user_id
          AND (uor.organization_slug = @p_organization_slug OR uor.organization_slug = N'*')
          AND (uor.expires_at IS NULL OR uor.expires_at > GETUTCDATE())
        ORDER BY r.name;
      END
    `);
    console.log('stored procedure rbac_get_user_roles ready');

    // rbac_get_organization_users
    await pool.request().query(`
      CREATE OR ALTER PROCEDURE [dbo].[rbac_get_organization_users]
        @p_organization_slug NVARCHAR(255)
      AS
      BEGIN
        SET NOCOUNT ON;
        SELECT DISTINCT
          u.id AS user_id,
          u.email,
          u.display_name,
          r.id AS role_id,
          r.name AS role_name,
          r.display_name AS role_display_name,
          CASE WHEN uor.organization_slug = N'*' THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS is_global,
          uor.assigned_at,
          uor.expires_at
        FROM [authz].[rbac_user_org_roles] uor
        JOIN [authz].[users] u ON uor.user_id = u.id
        JOIN [authz].[rbac_roles] r ON uor.role_id = r.id
        WHERE (uor.organization_slug = @p_organization_slug OR uor.organization_slug = N'*')
          AND (uor.expires_at IS NULL OR uor.expires_at > GETUTCDATE())
        ORDER BY u.email, r.name;
      END
    `);
    console.log('stored procedure rbac_get_organization_users ready');

    // get_global_model_config — reads model_config_global from system_settings
    await pool.request().query(`
      CREATE OR ALTER PROCEDURE [dbo].[get_global_model_config]
      AS
      BEGIN
        SET NOCOUNT ON;
        DECLARE @val NVARCHAR(MAX);

        SELECT @val = CAST([value] AS NVARCHAR(MAX))
        FROM [dbo].[system_settings]
        WHERE [key] = N'model_config_global';

        IF @val IS NULL
          SET @val = N'{"provider":"ollama","model":"llama3.2:1b","parameters":{"temperature":0.7,"maxTokens":8000}}';

        SELECT @val AS config_json;
      END
    `);
    console.log('stored procedure get_global_model_config ready');

    // ================================================================
    // STEP 14c: conversations_with_stats view
    // ================================================================
    await pool.request().query(`
      IF OBJECT_ID('dbo.conversations_with_stats', 'V') IS NOT NULL
        DROP VIEW dbo.conversations_with_stats;
    `);
    await pool.request().query(`
      CREATE VIEW dbo.conversations_with_stats AS
      SELECT
        c.id,
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
        COALESCE(task_stats.task_count, 0) AS task_count,
        COALESCE(task_stats.completed_tasks, 0) AS completed_tasks,
        COALESCE(task_stats.failed_tasks, 0) AS failed_tasks,
        COALESCE(task_stats.active_tasks, 0) AS active_tasks
      FROM dbo.conversations c
      LEFT JOIN (
        SELECT
          t.conversation_id,
          COUNT(*) AS task_count,
          COUNT(CASE WHEN t.status = 'completed' THEN 1 END) AS completed_tasks,
          COUNT(CASE WHEN t.status = 'failed' THEN 1 END) AS failed_tasks,
          COUNT(CASE WHEN t.status IN ('pending', 'running') THEN 1 END) AS active_tasks
        FROM dbo.tasks t
        GROUP BY t.conversation_id
      ) task_stats ON c.id = task_stats.conversation_id;
    `);
    console.log('view conversations_with_stats ready');

    // ================================================================
    // STEP 14d: Seed agents from Supabase export
    // ================================================================
    // Agents are seeded via the companion script: seed-sqlserver-agents.ts
    // Run: ENV_FILE=../../.env.azure npm run seed:sqlserver-agents
    console.log('agents: run seed:sqlserver-agents separately to populate');

    // ================================================================
    // STEP 14e: RAG tables (rag_data schema)
    // ================================================================
    await pool.request().query(`
      IF OBJECT_ID('rag_data.rag_collections', 'U') IS NULL
      CREATE TABLE rag_data.rag_collections (
        id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        organization_slug NVARCHAR(255) NOT NULL,
        name NVARCHAR(255) NOT NULL,
        slug NVARCHAR(255) NOT NULL,
        description NVARCHAR(MAX),
        embedding_model NVARCHAR(100) NOT NULL DEFAULT 'nomic-embed-text',
        embedding_dimensions INT NOT NULL DEFAULT 768,
        chunk_size INT NOT NULL DEFAULT 1000,
        chunk_overlap INT NOT NULL DEFAULT 200,
        status NVARCHAR(50) NOT NULL DEFAULT 'active',
        required_role NVARCHAR(255) NULL,
        allowed_users NVARCHAR(MAX) NULL,
        complexity_type NVARCHAR(50) DEFAULT 'basic',
        document_count INT NOT NULL DEFAULT 0,
        chunk_count INT NOT NULL DEFAULT 0,
        total_tokens INT NOT NULL DEFAULT 0,
        created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        updated_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        created_by UNIQUEIDENTIFIER NULL,
        CONSTRAINT UQ_rag_collections_org_slug UNIQUE (organization_slug, slug),
        CONSTRAINT CK_rag_collections_complexity_type CHECK (complexity_type IN ('basic', 'attributed', 'hybrid', 'cross-reference', 'temporal'))
      );
    `);
    await pool.request().query(`
      IF OBJECT_ID('rag_data.rag_documents', 'U') IS NULL
      CREATE TABLE rag_data.rag_documents (
        id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        collection_id UNIQUEIDENTIFIER NOT NULL,
        organization_slug NVARCHAR(255) NOT NULL,
        filename NVARCHAR(500) NOT NULL,
        file_type NVARCHAR(50) NOT NULL,
        file_size INT NOT NULL,
        file_hash NVARCHAR(64) NULL,
        storage_path NVARCHAR(MAX) NULL,
        status NVARCHAR(50) NOT NULL DEFAULT 'pending',
        error_message NVARCHAR(MAX) NULL,
        chunk_count INT DEFAULT 0,
        token_count INT DEFAULT 0,
        content NVARCHAR(MAX) NULL,
        metadata NVARCHAR(MAX) DEFAULT '{}',
        created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        updated_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        processed_at DATETIMEOFFSET NULL,
        created_by UNIQUEIDENTIFIER NULL,
        CONSTRAINT FK_rag_documents_collection FOREIGN KEY (collection_id) REFERENCES rag_data.rag_collections(id) ON DELETE CASCADE
      );
    `);
    await pool.request().query(`
      IF OBJECT_ID('rag_data.rag_document_chunks', 'U') IS NULL
      CREATE TABLE rag_data.rag_document_chunks (
        id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        document_id UNIQUEIDENTIFIER NOT NULL,
        collection_id UNIQUEIDENTIFIER NOT NULL,
        organization_slug NVARCHAR(255) NOT NULL,
        content NVARCHAR(MAX) NOT NULL,
        chunk_index INT NOT NULL,
        embedding NVARCHAR(MAX) NULL,
        token_count INT NOT NULL DEFAULT 0,
        page_number INT NULL,
        char_offset INT NULL,
        metadata NVARCHAR(MAX) DEFAULT '{}',
        created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT FK_rag_chunks_document FOREIGN KEY (document_id) REFERENCES rag_data.rag_documents(id) ON DELETE CASCADE,
        CONSTRAINT FK_rag_chunks_collection FOREIGN KEY (collection_id) REFERENCES rag_data.rag_collections(id)
      );
    `);
    console.log('rag_data tables ready (rag_collections, rag_documents, rag_document_chunks)');

    // Drop legacy embedding_vector column if it exists — we now use dynamic CAST
    // from the NVARCHAR embedding column at query time for multi-dimension support.
    await pool.request().query(`
      IF EXISTS (SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID('rag_data.rag_document_chunks') AND name = 'embedding_vector')
        ALTER TABLE rag_data.rag_document_chunks DROP COLUMN embedding_vector;
    `);
    console.log('embedding_vector column dropped (using dynamic CAST from NVARCHAR embedding)');

    // ================================================================
    // STEP 14f: Seed legal RAG collections
    // ================================================================
    const ragCollections = [
      { org: 'legal', name: 'Law Firm Policies (Attributed)', slug: 'law-firm-policies-attributed', desc: 'Internal firm policies including fee agreements, confidentiality, conflicts, and retention. Uses attributed search with document citations like [FP-001, Section 2.1].', complexity: 'attributed' },
      { org: 'legal', name: 'Law Contracts (Hybrid)', slug: 'law-contracts-hybrid', desc: 'Contract templates including NDAs, engagement letters, MSAs, and clause library. Uses hybrid search combining keyword matching with semantic understanding.', complexity: 'hybrid' },
      { org: 'legal', name: 'Law Litigation (Cross-Reference)', slug: 'law-litigation-cross-reference', desc: 'Litigation checklists including motions, discovery, depositions, and trial prep. Uses cross-reference search to link related documents.', complexity: 'cross-reference' },
      { org: 'legal', name: 'Law Client Intake (Temporal)', slug: 'law-client-intake-temporal', desc: 'Client intake checklists with version history. Uses temporal search to track changes between document versions (v1.0 vs v2.0).', complexity: 'temporal' },
      { org: 'legal', name: 'Law Estate Planning (Attributed)', slug: 'law-estate-planning-attributed', desc: 'Estate planning guides and templates. Uses attributed search with document citations for legal accuracy.', complexity: 'attributed' },
    ];
    for (const c of ragCollections) {
      await pool.request().query(`
        MERGE rag_data.rag_collections AS target
        USING (SELECT ${esc(c.org)} AS organization_slug, ${esc(c.slug)} AS slug) AS source
        ON target.organization_slug = source.organization_slug AND target.slug = source.slug
        WHEN MATCHED THEN
          UPDATE SET name = ${esc(c.name)}, description = ${esc(c.desc)}, complexity_type = ${esc(c.complexity)}, updated_at = SYSDATETIMEOFFSET()
        WHEN NOT MATCHED THEN
          INSERT (organization_slug, name, slug, description, embedding_model, embedding_dimensions, chunk_size, chunk_overlap, status, complexity_type, created_at, updated_at)
          VALUES (${esc(c.org)}, ${esc(c.name)}, ${esc(c.slug)}, ${esc(c.desc)}, N'nomic-embed-text', 768, 1000, 200, N'active', ${esc(c.complexity)}, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
      `);
    }
    console.log('legal RAG collections seeded (5 collections)');

    // ================================================================
    // STEP 15: Performance indexes (try each individually — NVARCHAR(MAX) cols can't be indexed)
    // ================================================================
    const indexes: [string, string][] = [
      // public
      ['IX_conversations_org', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_conversations_org' AND object_id = OBJECT_ID('dbo.conversations')) CREATE INDEX IX_conversations_org ON dbo.conversations (organization_slug)`],
      ['IX_tasks_conversation', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tasks_conversation' AND object_id = OBJECT_ID('dbo.tasks')) CREATE INDEX IX_tasks_conversation ON dbo.tasks (conversation_id)`],
      ['IX_tasks_status', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tasks_status' AND object_id = OBJECT_ID('dbo.tasks')) CREATE INDEX IX_tasks_status ON dbo.tasks (status)`],
      ['IX_deliverables_task', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_deliverables_task' AND object_id = OBJECT_ID('dbo.deliverables')) CREATE INDEX IX_deliverables_task ON dbo.deliverables (task_id)`],
      ['IX_plans_org', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_plans_org' AND object_id = OBJECT_ID('dbo.plans')) CREATE INDEX IX_plans_org ON dbo.plans (organization_slug)`],
      ['IX_llm_usage_created_at', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_llm_usage_created_at' AND object_id = OBJECT_ID('dbo.llm_usage')) CREATE INDEX IX_llm_usage_created_at ON dbo.llm_usage (created_at DESC)`],
      ['IX_llm_usage_org', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_llm_usage_org' AND object_id = OBJECT_ID('dbo.llm_usage')) CREATE INDEX IX_llm_usage_org ON dbo.llm_usage (organization_slug)`],
      ['IX_observability_events_created_at', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_observability_events_created_at' AND object_id = OBJECT_ID('dbo.observability_events')) CREATE INDEX IX_observability_events_created_at ON dbo.observability_events (created_at DESC)`],
      ['IX_observability_events_conversation', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_observability_events_conversation' AND object_id = OBJECT_ID('dbo.observability_events')) CREATE INDEX IX_observability_events_conversation ON dbo.observability_events (conversation_id)`],
      ['IX_human_approvals_org', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_human_approvals_org' AND object_id = OBJECT_ID('dbo.human_approvals')) CREATE INDEX IX_human_approvals_org ON dbo.human_approvals (organization_slug)`],
      ['IX_human_approvals_status', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_human_approvals_status' AND object_id = OBJECT_ID('dbo.human_approvals')) CREATE INDEX IX_human_approvals_status ON dbo.human_approvals (status)`],
      // crawler
      ['IX_crawler_articles_source', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_crawler_articles_source' AND object_id = OBJECT_ID('crawler.articles')) CREATE INDEX IX_crawler_articles_source ON crawler.articles (source_id)`],
      ['IX_crawler_articles_org', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_crawler_articles_org' AND object_id = OBJECT_ID('crawler.articles')) CREATE INDEX IX_crawler_articles_org ON crawler.articles (organization_slug)`],
      ['IX_crawler_articles_published', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_crawler_articles_published' AND object_id = OBJECT_ID('crawler.articles')) CREATE INDEX IX_crawler_articles_published ON crawler.articles (published_at DESC)`],
      ['IX_crawler_sources_org', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_crawler_sources_org' AND object_id = OBJECT_ID('crawler.sources')) CREATE INDEX IX_crawler_sources_org ON crawler.sources (organization_slug, is_active)`],
      // marketing
      ['IX_marketing_swarm_tasks_org', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_marketing_swarm_tasks_org' AND object_id = OBJECT_ID('marketing.swarm_tasks')) CREATE INDEX IX_marketing_swarm_tasks_org ON marketing.swarm_tasks (organization_slug)`],
      ['IX_marketing_swarm_tasks_status', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_marketing_swarm_tasks_status' AND object_id = OBJECT_ID('marketing.swarm_tasks')) CREATE INDEX IX_marketing_swarm_tasks_status ON marketing.swarm_tasks (status)`],
      // prediction
      ['IX_prediction_predictions_universe', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_prediction_predictions_universe' AND object_id = OBJECT_ID('prediction.predictions')) CREATE INDEX IX_prediction_predictions_universe ON prediction.predictions (universe_id)`],
      ['IX_prediction_predictions_target', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_prediction_predictions_target' AND object_id = OBJECT_ID('prediction.predictions')) CREATE INDEX IX_prediction_predictions_target ON prediction.predictions (target_id)`],
      ['IX_prediction_predictions_created_at', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_prediction_predictions_created_at' AND object_id = OBJECT_ID('prediction.predictions')) CREATE INDEX IX_prediction_predictions_created_at ON prediction.predictions (created_at DESC)`],
      // risk
      ['IX_risk_assessments_scope', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_risk_assessments_scope' AND object_id = OBJECT_ID('risk.assessments')) CREATE INDEX IX_risk_assessments_scope ON risk.assessments (scope_id)`],
      ['IX_risk_assessments_subject', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_risk_assessments_subject' AND object_id = OBJECT_ID('risk.assessments')) CREATE INDEX IX_risk_assessments_subject ON risk.assessments (subject_id)`],
      ['IX_risk_assessments_created_at', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_risk_assessments_created_at' AND object_id = OBJECT_ID('risk.assessments')) CREATE INDEX IX_risk_assessments_created_at ON risk.assessments (created_at DESC)`],
      ['IX_risk_composite_scores_subject', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_risk_composite_scores_subject' AND object_id = OBJECT_ID('risk.composite_scores')) CREATE INDEX IX_risk_composite_scores_subject ON risk.composite_scores (subject_id)`],
      ['IX_risk_alerts_scope', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_risk_alerts_scope' AND object_id = OBJECT_ID('risk.alerts')) CREATE INDEX IX_risk_alerts_scope ON risk.alerts (scope_id, is_active)`],
      // rag_data
      ['IX_rag_collections_org', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_rag_collections_org' AND object_id = OBJECT_ID('rag_data.rag_collections')) CREATE INDEX IX_rag_collections_org ON rag_data.rag_collections (organization_slug)`],
      ['IX_rag_collections_complexity', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_rag_collections_complexity' AND object_id = OBJECT_ID('rag_data.rag_collections')) CREATE INDEX IX_rag_collections_complexity ON rag_data.rag_collections (complexity_type)`],
      ['IX_rag_documents_collection', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_rag_documents_collection' AND object_id = OBJECT_ID('rag_data.rag_documents')) CREATE INDEX IX_rag_documents_collection ON rag_data.rag_documents (collection_id)`],
      ['IX_rag_documents_org', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_rag_documents_org' AND object_id = OBJECT_ID('rag_data.rag_documents')) CREATE INDEX IX_rag_documents_org ON rag_data.rag_documents (organization_slug)`],
      ['IX_rag_chunks_document', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_rag_chunks_document' AND object_id = OBJECT_ID('rag_data.rag_document_chunks')) CREATE INDEX IX_rag_chunks_document ON rag_data.rag_document_chunks (document_id)`],
      ['IX_rag_chunks_collection', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_rag_chunks_collection' AND object_id = OBJECT_ID('rag_data.rag_document_chunks')) CREATE INDEX IX_rag_chunks_collection ON rag_data.rag_document_chunks (collection_id)`],
      ['IX_rag_chunks_org', `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_rag_chunks_org' AND object_id = OBJECT_ID('rag_data.rag_document_chunks')) CREATE INDEX IX_rag_chunks_org ON rag_data.rag_document_chunks (organization_slug)`],
    ];
    let idxOk = 0;
    for (const [name, sql] of indexes) {
      if (await tryFK(pool, name, sql)) idxOk++;
    }
    console.log(`performance indexes: ${idxOk}/${indexes.length} created`);

    console.log('');
    console.log('========================================');
    console.log(' Full schema bootstrap complete!');
    console.log('========================================');
  } finally {
    await pool.close();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Full schema bootstrap FAILED: ${message}`);
    process.exit(1);
  });
