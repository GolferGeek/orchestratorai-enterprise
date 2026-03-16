import { Injectable, Inject } from '@nestjs/common';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import {
  DATABASE_SERVICE,
  DatabaseService,
} from '../../../planes/database/database.interface';

/**
 * PostgresCheckpointerService
 *
 * Thin wrapper around DATABASE_SERVICE.getCheckpointSaver().
 * Provides a LangGraph checkpoint saver for workflow state persistence.
 *
 * The actual checkpoint implementation is provider-specific:
 * - Supabase/PostgreSQL: PostgresSaver (persistent)
 * - SQL Server: MemorySaver (non-persistent, pending custom adapter)
 */
@Injectable()
export class PostgresCheckpointerService {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Get a LangGraph-compatible checkpoint saver.
   * Delegates to the database plane's getCheckpointSaver().
   */
  async getSaver(): Promise<BaseCheckpointSaver> {
    return this.db.getCheckpointSaver();
  }
}
