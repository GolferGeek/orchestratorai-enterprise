import { registerAs } from '@nestjs/config';

// Helper function to get schema-aware table name
export function getTableName(tableName: string, _schema?: string): string {
  // Schema selection is handled via Supabase client's .schema() method
  return tableName;
}

// Helper function to get the appropriate schema for a table
export function getSchemaForTable(
  tableName: string,
  explicitSchema?: string,
): string {
  // Use explicit schema if provided
  if (explicitSchema) {
    return explicitSchema;
  }

  // All tables are now in public schema after consolidation
  // Company tables (companies, departments, kpi_data, kpi_goals, kpi_metrics) are now in public
  return 'public';
}

// Lazy configuration loading - defer all environment access. URL and keys
// come from the environment only: no local defaults, so a missing value is a
// configuration error the service reports, never a silent localhost.
export default registerAs('supabase', () => ({
  url: process.env.SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  coreSchema: process.env.SUPABASE_CORE_SCHEMA || 'public',
  companySchema: process.env.SUPABASE_COMPANY_SCHEMA || 'public',
}));
