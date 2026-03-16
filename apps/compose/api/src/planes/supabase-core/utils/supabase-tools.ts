import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  initializeDatabaseSchema,
  getSchemaContext,
  getAllTableNames,
} from './database-schema';

interface SupabaseClientWithRpc {
  rpc(
    method: string,
    params: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

// Global state for Supabase tools
let orchestratorClient: SupabaseClient | null = null;
let companyClient: SupabaseClient | null = null;
let orchestratorSqlDatabase: Record<string, unknown> | null = null;
let companySqlDatabase: Record<string, unknown> | null = null;
let initialized = false;

// Configuration interface
export interface SupabaseToolsConfig {
  tableNames?: string[];
  includeDomains?: string[];
  agentName?: string;
}

/**
 * Get Orchestrator Database Client (Core platform data: users, tasks, agents, conversations)
 */
function getOrchestratorClient() {
  if (!orchestratorClient) {
    // Use orchestrator database (main platform)
    const supabaseUrl =
      process.env.SUPABASE_MODE === 'local'
        ? process.env.SUPABASE_LOCAL_URL || 'http://localhost:9010'
        : process.env.SUPABASE_URL ||
          'https://jcmkjecmdugfzvdijodg.supabase.co';

    const serviceKey =
      process.env.SUPABASE_MODE === 'local'
        ? process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY ||
          process.env.SUPABASE_SERVICE_ROLE_KEY
        : process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceKey) {
      throw new Error(
        'SUPABASE_SERVICE_ROLE_KEY environment variable is required',
      );
    }

    orchestratorClient = createClient(supabaseUrl, serviceKey);
  }
  return orchestratorClient as ReturnType<typeof createClient>;
}

/**
 * Get Company Database Client (Company/KPI data - same database, company schema)
 */
function getCompanyClient(): SupabaseClient {
  if (!companyClient) {
    // Use same database as orchestrator (single-instance demo)
    const supabaseUrl =
      process.env.SUPABASE_MODE === 'local'
        ? process.env.SUPABASE_LOCAL_URL || 'http://localhost:9010'
        : process.env.SUPABASE_URL ||
          'https://jcmkjecmdugfzvdijodg.supabase.co';

    const serviceKey =
      process.env.SUPABASE_MODE === 'local'
        ? process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY ||
          process.env.SUPABASE_SERVICE_ROLE_KEY
        : process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceKey) {
      throw new Error('Company database service role key is required');
    }

    companyClient = createClient(supabaseUrl, serviceKey);
  }
  return companyClient;
}

/**
 * Create SQL Database interface for LangChain - Orchestrator Database
 */
function createOrchestratorSqlDatabase(): Record<string, unknown> {
  // SqlDatabase type not available
  if (!orchestratorSqlDatabase) {
    const client = getOrchestratorClient();

    orchestratorSqlDatabase = {
      async run(query: string) {
        try {
          const { data, error } = await (
            client as unknown as SupabaseClientWithRpc
          ).rpc('exec_sql', {
            query: query,
          });
          if (error) {
            throw new Error(`SQL execution failed: ${error.message}`);
          }

          return data;
        } catch (_rpcError) {
          throw new Error(
            `SQL execution failed: ${_rpcError instanceof Error ? _rpcError.message : 'Unknown error'}`,
          );
        }
      },

      async getTableInfo() {
        // Get schema context for orchestrator tables
        const schemaContext = await getDatabaseSchemaInfo();
        return schemaContext;
      },

      get allTables() {
        return getTableNames().then((names) =>
          names.map((name) => ({ tableName: name })),
        );
      },
    };
  }
  return orchestratorSqlDatabase;
}

/**
 * Create SQL Database interface for LangChain - Company Database
 */
function createCompanySqlDatabase(): Record<string, unknown> {
  // SqlDatabase type not available
  if (!companySqlDatabase) {
    const client = getCompanyClient();

    companySqlDatabase = {
      async run(query: string) {
        try {
          // Company database uses direct table queries (no exec_sql RPC)
          // Parse and execute the query directly
          const { data, error } = await executeQueryOnCompanyDB(client, query);
          if (error) {
            throw new Error(`SQL execution failed: ${error}`);
          }

          return data;
        } catch (_rpcError) {
          throw new Error(
            `SQL execution failed: ${_rpcError instanceof Error ? _rpcError.message : 'Unknown error'}`,
          );
        }
      },

      async getTableInfo() {
        // Return basic schema information - detailed schema comes from agent context
        return getDatabaseSchemaInfo({ includeDomains: ['KPI & Analytics'] });
      },

      get allTables() {
        return Promise.resolve([
          { tableName: 'companies' },
          { tableName: 'departments' },
          { tableName: 'kpi_metrics' },
          { tableName: 'kpi_goals' },
          { tableName: 'kpi_data' },
        ]);
      },
    };
  }
  return companySqlDatabase;
}

/**
 * Execute a query on company database using PostgREST API
 */
async function executeQueryOnCompanyDB(
  client: unknown,
  query: string,
): Promise<{ data: unknown; error?: string }> {
  const supabaseClient = client as SupabaseClient;
  // Simple query parsing for basic SELECT statements on company schema
  // This is a simplified approach - for production you'd want more robust SQL parsing
  const lowerQuery = query.toLowerCase().trim();

  try {
    // Handle count queries
    if (
      lowerQuery.includes('select count(*)') &&
      lowerQuery.includes('companies')
    ) {
      const { data, error } = await supabaseClient
        .from('companies')
        .select('*', { count: 'exact' });
      return {
        data: [{ count: data?.length || 0 }],
        error: error?.message,
      };
    }

    // Handle public schema table queries
    if (lowerQuery.includes('from companies')) {
      const { data, error } = await supabaseClient
        .from('companies')
        .select('*')
        .limit(100);
      return { data, error: error?.message };
    }

    if (lowerQuery.includes('from departments')) {
      const { data, error } = await supabaseClient
        .from('departments')
        .select('*')
        .limit(100);
      return { data, error: error?.message };
    }

    if (lowerQuery.includes('from kpi_data')) {
      const { data, error } = await supabaseClient
        .from('kpi_data')
        .select('*')
        .limit(100);
      return { data, error: error?.message };
    }

    if (lowerQuery.includes('from kpi_metrics')) {
      const { data, error } = await supabaseClient
        .from('kpi_metrics')
        .select('*')
        .limit(100);
      return { data, error: error?.message };
    }

    if (lowerQuery.includes('from kpi_goals')) {
      const { data, error } = await supabaseClient
        .from('kpi_goals')
        .select('*')
        .limit(100);
      return { data, error: error?.message };
    }

    // For complex queries, try to execute via raw query if possible
    // This is a fallback - you might need to implement more sophisticated query parsing
    throw new Error(
      'Complex query execution not implemented for company database',
    );
  } catch (_err) {
    return {
      data: null,
      error: _err instanceof Error ? _err.message : 'Unknown error',
    };
  }
}

/**
 * Initialize Supabase tools for Orchestrator database
 */
export async function initializeForOrchestrator(): Promise<void> {
  if (initialized) return;

  await initializeDatabaseSchema();
  createOrchestratorSqlDatabase();

  initialized = true;
}

/**
 * Initialize Supabase tools for Company database (KPI/Analytics)
 */
export function initializeForCompany(): void {
  createCompanySqlDatabase();

  if (!initialized) {
    initialized = true;
  }
}

/**
 * Legacy function - now routes to orchestrator
 */
export async function initializeForAgent(config?: SupabaseToolsConfig) {
  const isKpiRequest =
    config?.includeDomains?.includes('KPI & Analytics') ||
    config?.agentName?.includes('Metrics');

  if (isKpiRequest) {
    initializeForCompany();
  } else {
    await initializeForOrchestrator();
  }
}

/**
 * Execute SQL query on Orchestrator database
 */
export async function executeOrchestratorSQL(query: string): Promise<unknown> {
  await initializeForOrchestrator();
  const client = getOrchestratorClient();

  try {
    const { data, error } = await (
      client as unknown as SupabaseClientWithRpc
    ).rpc('exec_sql', { query });
    if (error) {
      throw new Error(`SQL execution failed: ${error.message}`);
    }

    return data;
  } catch (_rpcError) {
    throw new Error(
      `SQL execution failed: ${_rpcError instanceof Error ? _rpcError.message : 'Unknown error'}`,
    );
  }
}

/**
 * Execute SQL query on Company database
 */
export async function executeCompanySQL(query: string): Promise<unknown> {
  initializeForCompany();
  const client = getCompanyClient();

  try {
    const result = await executeQueryOnCompanyDB(client, query);
    if (result.error) {
      throw new Error(`SQL execution failed: ${result.error}`);
    }

    return result.data;
  } catch (_sqlError) {
    throw new Error(
      `SQL execution failed: ${_sqlError instanceof Error ? _sqlError.message : 'Unknown error'}`,
    );
  }
}

/**
 * Legacy function - now routes based on query content
 */
export async function executeSQL(query: string): Promise<unknown> {
  // Auto-detect if this is a company/KPI query
  const lowerQuery = query.toLowerCase();
  const isCompanyQuery =
    lowerQuery.includes('companies') ||
    lowerQuery.includes('departments') ||
    lowerQuery.includes('kpi_');

  if (isCompanyQuery) {
    return executeCompanySQL(query);
  } else {
    return executeOrchestratorSQL(query);
  }
}

/**
 * Get database schema information
 */
export async function getDatabaseSchemaInfo(
  config?: SupabaseToolsConfig,
): Promise<string> {
  if (config?.includeDomains?.includes('KPI & Analytics')) {
    return `
      Available tables for KPI & Analytics (public schema):
      - companies: Company information and details
      - departments: Organizational structure and budgets  
      - kpi_metrics: Key performance indicator definitions
      - kpi_goals: Target values for each metric by department
      - kpi_data: Historical performance data and measurements
      
      Note: All tables are in the public schema. Refer to agent context for detailed column information.
    `;
  } else {
    return getSchemaContext();
  }
}

/**
 * Get table names based on domain
 */
export async function getTableNames(
  config?: SupabaseToolsConfig,
): Promise<string[]> {
  if (config?.includeDomains?.includes('KPI & Analytics')) {
    return ['companies', 'departments', 'kpi_metrics', 'kpi_goals', 'kpi_data'];
  } else if (config?.tableNames) {
    return config.tableNames;
  } else {
    return getAllTableNames();
  }
}
