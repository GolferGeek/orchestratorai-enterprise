/**
 * DatabaseService — re-exported from transport-types for backward compatibility.
 *
 * The canonical definition lives in @orchestrator-ai/transport-types/database.
 * All apps should import from transport-types; this file re-exports so that
 * existing API imports (`from './database/database.interface'`) continue to work.
 *
 * Compose does not use LangGraph checkpointing — that belongs in Forge.
 */

export {
  DATABASE_SERVICE,
  type QueryResult,
  type QueryBuilder,
  type DatabaseService,
} from '@orchestrator-ai/transport-types';
