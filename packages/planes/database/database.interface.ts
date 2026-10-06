/**
 * DatabaseService — re-exported from transport-types for backward compatibility.
 *
 * The canonical definition lives in @orchestrator-ai/transport-types/database.
 * All apps should import from transport-types; this file re-exports so that
 * existing API imports (`from './database/database.interface'`) continue to work.
 *
 * Modules that need LangGraph checkpoint support (Workflows) should import
 * LangGraphDatabaseService from './database.langgraph' instead.
 */

export {
  DATABASE_SERVICE,
  BUSINESS_DATABASE_SERVICE,
  type QueryResult,
  type QueryBuilder,
  type DatabaseService,
} from '@orchestrator-ai/transport-types';

/**
 * The prefix a database service reads its settings with: none for the
 * platform database, 'BUSINESS_' for the company database
 * (BUSINESS_POSTGRESQL_URL, BUSINESS_SQLSERVER_HOST, ...).
 */
export const DATABASE_CONFIG_PREFIX = Symbol('DATABASE_CONFIG_PREFIX');
