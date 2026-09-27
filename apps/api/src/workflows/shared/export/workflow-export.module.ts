import { Global, Module } from '@nestjs/common';
import { ExportService } from './export.service';
import { WorkflowExportController } from './workflow-export.controller';
import { WorkflowExporterRegistry } from './workflow-exporter.registry';

/** Global: workflow modules register their exporter; the API serves downloads. */
@Global()
@Module({
  controllers: [WorkflowExportController],
  providers: [ExportService, WorkflowExporterRegistry],
  exports: [ExportService, WorkflowExporterRegistry],
})
export class WorkflowExportModule {}
