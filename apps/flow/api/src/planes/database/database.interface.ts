/**
 * DatabaseService — re-exported from transport-types for backward compatibility.
 *
 * The canonical definition lives in @orchestrator-ai/transport-types/database.
 * All apps should import from transport-types; this file re-exports so that
 * existing API imports (`from './database/database.interface'`) continue to work.
 *
 * The API-side interface extends the base with getCheckpointSaver(), which
 * depends on @langchain/langgraph-checkpoint and therefore cannot live in the
 * transport-types package (which must remain framework-agnostic).
 */
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';

export {
  DATABASE_SERVICE,
  type QueryResult,
  type QueryBuilder,
} from '@orchestrator-ai/transport-types';

import type { DatabaseService as BaseDatabaseService } from '@orchestrator-ai/transport-types';

/**
 * API-side DatabaseService — extends the base with LangGraph checkpoint support.
 *
 * Use this type when injecting DATABASE_SERVICE inside the API application.
 * The additional getCheckpointSaver() method is implemented by all API-side
 * database providers.
 */
export interface DatabaseService extends BaseDatabaseService {
  /**
   * Get a LangGraph-compatible checkpoint saver for this database engine.
   * Callers should cache the result — repeated calls may create new instances.
   */
  getCheckpointSaver(): Promise<BaseCheckpointSaver>;
}
