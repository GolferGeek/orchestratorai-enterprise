import { Module, Global } from '@nestjs/common';
import { PostgresCheckpointerService } from './postgres-checkpointer.service';

/**
 * PersistenceModule
 *
 * Global module that provides checkpoint persistence for LangGraph workflows.
 * PostgresCheckpointerService delegates to DATABASE_SERVICE (from the global
 * DatabaseModule) for provider-specific checkpoint storage.
 */
@Global()
@Module({
  providers: [PostgresCheckpointerService],
  exports: [PostgresCheckpointerService],
})
export class PersistenceModule {}
