import { Global, Module } from '@nestjs/common';
import { BridgeDatabaseService } from './bridge-database.service';

/**
 * BridgeDatabaseModule — Global module that provides BridgeDatabaseService.
 *
 * Marked @Global() so all other Bridge modules can inject BridgeDatabaseService
 * without importing this module explicitly.
 *
 * Requires DatabaseModule (from planes/) to be registered in AppModule first,
 * as BridgeDatabaseService injects DATABASE_SERVICE.
 */
@Global()
@Module({
  providers: [BridgeDatabaseService],
  exports: [BridgeDatabaseService],
})
export class BridgeDatabaseModule {}
