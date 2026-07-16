import { Global, Module } from '@nestjs/common';
import { AmbientDatabaseService } from './database.service';

/**
 * Global ambient database module — provides AmbientDatabaseService
 * which uses DATABASE_SERVICE (the platform plane) to query the ambient schema.
 */
@Global()
@Module({
  providers: [AmbientDatabaseService],
  exports: [AmbientDatabaseService],
})
export class AmbientDatabaseModule {}
