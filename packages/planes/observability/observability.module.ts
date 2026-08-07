/**
 * Observability Plane Module
 *
 * @Global() module providing OBSERVABILITY_SERVICE plus the full
 * observability implementation: events buffer, webhook forwarding,
 * SSE streaming, and legacy DB services.
 *
 * Selected by OBSERVABILITY_PROVIDER env var:
 *   - database_events (default): provider-neutral database persistence + in-memory buffer
 *   - console: Console-only logging for development/testing
 */

import { Module, Global, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { OBSERVABILITY_SERVICE } from './observability.interface';
import { DatabaseEventsObservabilityService } from './providers/database-events-observability.service';
import { ConsoleObservabilityService } from './providers/console-observability.service';
import { ObservabilityEventsService } from './services/observability-events.service';
import { ObservabilityWebhookService } from './services/observability-webhook.service';
import { ObservabilityDbService } from './services/observability-db.service';
import { LegacyObservabilityModule } from './services/legacy/legacy-observability.module';

const logger = new Logger('ObservabilityPlaneModule');

@Global()
@Module({
  imports: [ConfigModule, HttpModule, LegacyObservabilityModule],
  providers: [
    DatabaseEventsObservabilityService,
    ConsoleObservabilityService,
    ObservabilityEventsService,
    ObservabilityWebhookService,
    ObservabilityDbService,
    {
      provide: OBSERVABILITY_SERVICE,
      useFactory: (
        databaseEventsService: DatabaseEventsObservabilityService,
        consoleService: ConsoleObservabilityService,
      ) => {
        const provider =
          process.env.OBSERVABILITY_PROVIDER || 'database_events';
        logger.log(`Observability plane provider: ${provider}`);
        switch (provider) {
          case 'database_events':
            return databaseEventsService;
          case 'console':
            return consoleService;
          default:
            throw new Error(
              `Unsupported OBSERVABILITY_PROVIDER '${provider}'. Expected: database_events, console`,
            );
        }
      },
      inject: [DatabaseEventsObservabilityService, ConsoleObservabilityService],
    },
  ],
  exports: [
    OBSERVABILITY_SERVICE,
    ObservabilityEventsService,
    ObservabilityWebhookService,
    ObservabilityDbService,
  ],
})
export class ObservabilityPlaneModule {}
