import { Global, Module } from '@nestjs/common';
import { WorkUnitService } from './work-unit.service';
import { WorkUnitTraceController } from './work-unit-trace.controller';
import { WorkUnitTraceReader } from './work-unit-trace.reader';
import { WorkUnitsRepository } from './work-units.repository';

/** Global: workflow steps run work units; the trace API reads them. */
@Global()
@Module({
  controllers: [WorkUnitTraceController],
  providers: [WorkUnitsRepository, WorkUnitService, WorkUnitTraceReader],
  exports: [WorkUnitService],
})
export class WorkUnitsModule {}
