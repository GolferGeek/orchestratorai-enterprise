import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

/**
 * PostgresCheckpointerService
 *
 * Creates a LangGraph PostgresSaver directly from DATABASE_URL config.
 * This service owns the checkpointer lifecycle — it does not delegate
 * to the database plane (which does not expose checkpoint functionality).
 */
@Injectable()
export class PostgresCheckpointerService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Get a LangGraph-compatible checkpoint saver.
   * Creates a PostgresSaver using the DATABASE_URL from config.
   */
  async getSaver(): Promise<BaseCheckpointSaver> {
    const databaseUrl = this.configService.getOrThrow<string>('DATABASE_URL');
    const saver = PostgresSaver.fromConnString(databaseUrl);
    await saver.setup();
    return saver;
  }
}
