import * as dotenv from 'dotenv';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import * as mssql from 'mssql';
import * as fs from 'fs';

interface TableRequirement {
  schema: string;
  table: string;
  tier: 'critical' | 'important' | 'optional';
}

interface ProviderSchemaContract {
  requiredTables: TableRequirement[];
}

interface SchemaPortabilityManifest {
  version: string;
  description: string;
  providers: Record<string, ProviderSchemaContract>;
}

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
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  throw new Error(`Invalid ${name} value '${value}'. Expected true or false.`);
}

function loadManifest(): SchemaPortabilityManifest {
  const manifestPath = process.env.SCHEMA_MANIFEST_PATH
    ? process.env.SCHEMA_MANIFEST_PATH.startsWith('/')
      ? process.env.SCHEMA_MANIFEST_PATH
      : join(process.cwd(), process.env.SCHEMA_MANIFEST_PATH)
    : join(process.cwd(), '../../scripts/init/schema-portability-manifest.json');

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Schema portability manifest not found: ${manifestPath}`);
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as SchemaPortabilityManifest;
}

async function verifySupabase(
  contract: ProviderSchemaContract,
): Promise<string[]> {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const missing: string[] = [];

  for (const req of contract.requiredTables) {
    const result = await client
      .schema(req.schema)
      .from(req.table)
      .select('*', { count: 'exact', head: true });

    if (result.error) {
      console.log(`- ${req.schema}.${req.table}: missing (${result.error.message})`);
      missing.push(`${req.schema}.${req.table}`);
      continue;
    }
    console.log(`- ${req.schema}.${req.table}: present`);
  }

  return missing;
}

async function verifySqlServer(
  contract: ProviderSchemaContract,
): Promise<string[]> {
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

  const missing: string[] = [];
  try {
    for (const req of contract.requiredTables) {
      const result = await pool
        .request()
        .input('schemaName', mssql.NVarChar, req.schema)
        .input('tableName', mssql.NVarChar, req.table)
        .query<{ is_present: number }>(`
          SELECT CASE
            WHEN EXISTS (
              SELECT 1
              FROM sys.tables t
              JOIN sys.schemas s ON t.schema_id = s.schema_id
              WHERE s.name = @schemaName
                AND t.name = @tableName
            ) THEN 1 ELSE 0
          END AS is_present
        `);

      const present = result.recordset[0]?.is_present === 1;
      console.log(`- ${req.schema}.${req.table}: ${present ? 'present' : 'missing'}`);
      if (!present) {
        missing.push(`${req.schema}.${req.table}`);
      }
    }
  } finally {
    await pool.close();
  }

  return missing;
}

async function run(): Promise<void> {
  loadEnv();
  const dbProvider = requireEnv('DB_PROVIDER');
  const manifest = loadManifest();
  const contract = manifest.providers[dbProvider];
  if (!contract) {
    throw new Error(
      `No schema portability contract configured for DB_PROVIDER='${dbProvider}'`,
    );
  }

  console.log('========================================');
  console.log(' Schema Portability Verification');
  console.log('========================================');
  console.log(`DB_PROVIDER=${dbProvider}`);
  console.log(`Manifest version=${manifest.version}`);

  const missing =
    dbProvider === 'supabase_pg'
      ? await verifySupabase(contract)
      : dbProvider === 'sqlserver'
        ? await verifySqlServer(contract)
        : (() => {
            throw new Error(
              `Unsupported DB_PROVIDER '${dbProvider}' for schema portability verification`,
            );
          })();

  if (missing.length > 0) {
    throw new Error(
      `Missing required schema portability tables: ${missing.join(', ')}`,
    );
  }

  console.log('✅ Schema portability verification passed');
}

run()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Schema portability verification failed: ${message}`);
    process.exit(1);
  });
