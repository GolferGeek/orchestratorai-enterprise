import * as dotenv from 'dotenv';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import * as mssql from 'mssql';
import * as fs from 'fs';

interface ManifestCheck {
  schema: string;
  table: string;
  minCount: number;
  description: string;
}

interface ProviderManifest {
  checks: ManifestCheck[];
  requiredAgentSlugs: string[];
}

interface SeedManifest {
  version: string;
  description: string;
  providers: Record<string, ProviderManifest>;
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

function loadManifest(): SeedManifest {
  const manifestPath = process.env.MANIFEST_PATH
    ? process.env.MANIFEST_PATH.startsWith('/')
      ? process.env.MANIFEST_PATH
      : join(process.cwd(), process.env.MANIFEST_PATH)
    : join(process.cwd(), '../../scripts/init/seed-manifest.json');

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Seed manifest not found: ${manifestPath}`);
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as SeedManifest;
}

async function verifySupabase(providerManifest: ProviderManifest): Promise<void> {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const check of providerManifest.checks) {
    const result = await client
      .schema(check.schema)
      .from(check.table)
      .select('*', { count: 'exact', head: true });
    if (result.error) {
      throw new Error(
        `Check failed for ${check.schema}.${check.table}: ${result.error.message}`,
      );
    }
    const count = result.count ?? 0;
    console.log(
      `- ${check.schema}.${check.table}: count=${count}, required>=${check.minCount}`,
    );
    if (count < check.minCount) {
      throw new Error(
        `Count check failed for ${check.schema}.${check.table}: ${count} < ${check.minCount}`,
      );
    }
  }

  if (providerManifest.requiredAgentSlugs.length > 0) {
    const result = await client
      .schema('public')
      .from('agents')
      .select('slug')
      .in('slug', providerManifest.requiredAgentSlugs);
    if (result.error) {
      throw new Error(`Failed to validate required agent slugs: ${result.error.message}`);
    }
    const found = new Set((result.data ?? []).map((row) => row.slug));
    const missing = providerManifest.requiredAgentSlugs.filter(
      (slug) => !found.has(slug),
    );
    if (missing.length > 0) {
      throw new Error(`Missing required agent slugs: ${missing.join(', ')}`);
    }
    console.log(`- required agents present: ${providerManifest.requiredAgentSlugs.join(', ')}`);
  }
}

async function verifySqlServer(providerManifest: ProviderManifest): Promise<void> {
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
    for (const check of providerManifest.checks) {
      const query = `SELECT COUNT(*) AS count FROM [${check.schema}].[${check.table}]`;
      const result = await pool.request().query<{ count: number }>(query);
      const count = result.recordset[0]?.count ?? 0;
      console.log(
        `- ${check.schema}.${check.table}: count=${count}, required>=${check.minCount}`,
      );
      if (count < check.minCount) {
        throw new Error(
          `Count check failed for ${check.schema}.${check.table}: ${count} < ${check.minCount}`,
        );
      }
    }
  } finally {
    await pool.close();
  }
}

async function run(): Promise<void> {
  loadEnv();
  const dbProvider = requireEnv('DB_PROVIDER');
  const manifest = loadManifest();
  const providerManifest = manifest.providers[dbProvider];

  if (!providerManifest) {
    throw new Error(
      `No seed manifest checks configured for DB_PROVIDER='${dbProvider}'`,
    );
  }

  console.log('========================================');
  console.log(' Init Data Verification');
  console.log('========================================');
  console.log(`DB_PROVIDER=${dbProvider}`);
  console.log(`Manifest version=${manifest.version}`);

  if (dbProvider === 'supabase_pg') {
    await verifySupabase(providerManifest);
  } else if (dbProvider === 'sqlserver') {
    await verifySqlServer(providerManifest);
  } else {
    throw new Error(`Unsupported DB_PROVIDER '${dbProvider}' for init verification`);
  }

  console.log('✅ Init data verification passed');
}

run()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Init data verification failed: ${message}`);
    process.exit(1);
  });
