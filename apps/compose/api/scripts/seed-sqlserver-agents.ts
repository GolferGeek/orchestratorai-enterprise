/**
 * Seed agents table in SQL Server from local Supabase.
 *
 * Usage:
 *   ENV_FILE=../../.env.azure npm run seed:sqlserver-agents
 *
 * Reads all agents from the local Supabase instance (port 6012)
 * and upserts them into Azure SQL Server's dbo.agents table.
 */
import * as dotenv from 'dotenv';
import { join } from 'path';
import * as mssql from 'mssql';
import { Pool } from 'pg';

function loadEnv(): void {
  const root = join(process.cwd(), '../../');
  const envFile = process.env.ENV_FILE
    ? join(process.cwd(), process.env.ENV_FILE)
    : join(root, '.env.azure');
  dotenv.config({ path: envFile });
  dotenv.config({ path: join(root, '.env') });
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function toStr(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') return val;
  return JSON.stringify(val);
}

interface AgentRow {
  slug: string;
  organization_slug: unknown;
  name: string;
  description: string;
  version: string;
  agent_type: string;
  department: string;
  tags: unknown;
  io_schema: unknown;
  capabilities: unknown;
  context: unknown;
  endpoint: unknown;
  llm_config: unknown;
  metadata: unknown;
  require_local_model: boolean;
  created_at: Date;
  updated_at: Date;
}

async function run(): Promise<void> {
  loadEnv();
  console.log('========================================');
  console.log(' Seed SQL Server agents from Supabase');
  console.log('========================================');

  // Connect to local Supabase PostgreSQL
  const pgPool = new Pool({
    host: process.env.SUPABASE_PG_HOST ?? '127.0.0.1',
    port: parseInt(process.env.SUPABASE_PG_PORT ?? '6012', 10),
    user: process.env.SUPABASE_PG_USER ?? 'postgres',
    password: process.env.SUPABASE_PG_PASSWORD ?? 'postgres',
    database: process.env.SUPABASE_PG_DATABASE ?? 'postgres',
  });

  // Connect to SQL Server
  const sqlPool = await new mssql.ConnectionPool({
    server: requireEnv('SQLSERVER_HOST'),
    port: parseInt(requireEnv('SQLSERVER_PORT'), 10),
    database: requireEnv('SQLSERVER_DATABASE'),
    user: requireEnv('SQLSERVER_USER'),
    password: requireEnv('SQLSERVER_PASSWORD'),
    connectionTimeout: 30000,
    requestTimeout: 60000,
    options: {
      encrypt: requireEnv('SQLSERVER_ENCRYPT') === 'true',
      trustServerCertificate:
        (process.env.SQLSERVER_TRUST_SERVER_CERT ?? 'false') === 'true',
    },
  }).connect();

  try {
    // Fetch agents from Supabase
    const { rows } = await pgPool.query<AgentRow>(
      'SELECT * FROM public.agents ORDER BY slug',
    );
    console.log(`Fetched ${rows.length} agents from Supabase`);

    let upserted = 0;
    let errors = 0;

    for (const agent of rows) {
      try {
        const req = sqlPool.request();
        req.input('slug', mssql.NVarChar, agent.slug);
        req.input(
          'organization_slug',
          mssql.NVarChar(mssql.MAX),
          toStr(agent.organization_slug),
        );
        req.input('name', mssql.NVarChar, agent.name);
        req.input('description', mssql.NVarChar(mssql.MAX), agent.description);
        req.input('version', mssql.NVarChar, agent.version);
        req.input('agent_type', mssql.NVarChar, agent.agent_type);
        req.input('department', mssql.NVarChar, agent.department);
        req.input('tags', mssql.NVarChar(mssql.MAX), toStr(agent.tags));
        req.input(
          'io_schema',
          mssql.NVarChar(mssql.MAX),
          toStr(agent.io_schema),
        );
        req.input(
          'capabilities',
          mssql.NVarChar(mssql.MAX),
          toStr(agent.capabilities),
        );
        req.input('context', mssql.NVarChar(mssql.MAX), toStr(agent.context));
        req.input(
          'endpoint',
          mssql.NVarChar(mssql.MAX),
          toStr(agent.endpoint),
        );
        req.input(
          'llm_config',
          mssql.NVarChar(mssql.MAX),
          toStr(agent.llm_config),
        );
        req.input(
          'metadata',
          mssql.NVarChar(mssql.MAX),
          toStr(agent.metadata),
        );
        req.input(
          'require_local_model',
          mssql.Bit,
          agent.require_local_model ? 1 : 0,
        );
        req.input('created_at', mssql.DateTime2, new Date(agent.created_at));
        req.input('updated_at', mssql.DateTime2, new Date(agent.updated_at));

        await req.query(`
          MERGE [dbo].[agents] AS target
          USING (SELECT @slug AS slug) AS source ON target.slug = source.slug
          WHEN MATCHED THEN UPDATE SET
            organization_slug = @organization_slug,
            name = @name,
            description = @description,
            version = @version,
            agent_type = @agent_type,
            department = @department,
            tags = @tags,
            io_schema = @io_schema,
            capabilities = @capabilities,
            context = @context,
            endpoint = @endpoint,
            llm_config = @llm_config,
            metadata = @metadata,
            require_local_model = @require_local_model,
            updated_at = @updated_at
          WHEN NOT MATCHED THEN INSERT (
            slug, organization_slug, name, description, version, agent_type,
            department, tags, io_schema, capabilities, context, endpoint,
            llm_config, metadata, require_local_model, created_at, updated_at
          ) VALUES (
            @slug, @organization_slug, @name, @description, @version, @agent_type,
            @department, @tags, @io_schema, @capabilities, @context, @endpoint,
            @llm_config, @metadata, @require_local_model, @created_at, @updated_at
          );
        `);
        upserted++;
        console.log(`  ✓ ${agent.slug}`);
      } catch (e: unknown) {
        errors++;
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`  ✗ ${agent.slug}: ${msg}`);
      }
    }

    console.log('');
    console.log(`Done: ${upserted} upserted, ${errors} errors`);
  } finally {
    await sqlPool.close();
    await pgPool.end();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Agent seed FAILED: ${message}`);
    process.exit(1);
  });
