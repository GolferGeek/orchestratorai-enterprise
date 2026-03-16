import { Module } from '@nestjs/common';
import { ExecutionsController } from './executions.controller';

/**
 * ExecutionsModule exposes GET /executions for listing recent trigger executions.
 * DatabaseModule is global — DatabaseService is available without explicit import.
 */
@Module({
  controllers: [ExecutionsController],
})
export class ExecutionsModule {}
