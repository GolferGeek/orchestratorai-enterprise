/**
 * Observability Plane Module
 *
 * @Global() module providing OBSERVABILITY_SERVICE.
 *
 * Selected by OBSERVABILITY_PROVIDER env var:
 *   - supabase (default): Supabase-backed persistence + in-memory buffer
 *   - console: Console-only logging for development/testing
 */

import { Module, Global, Logger } from '@nestjs/common';
import { OBSERVABILITY_SERVICE } from './observability.interface';
import { SupabaseObservabilityService } from './providers/supabase-observability.service';
import { ConsoleObservabilityService } from './providers/console-observability.service';

const logger = new Logger('ObservabilityPlaneModule');

@Global()
@Module({
  providers: [
    SupabaseObservabilityService,
    ConsoleObservabilityService,
    {
      provide: OBSERVABILITY_SERVICE,
      useFactory: (
        supabaseService: SupabaseObservabilityService,
        consoleService: ConsoleObservabilityService,
      ) => {
        const provider = process.env.OBSERVABILITY_PROVIDER || 'supabase';
        logger.log(`Observability plane provider: ${provider}`);
        switch (provider) {
          case 'supabase':
            return supabaseService;
          case 'console':
            return consoleService;
          default:
            throw new Error(
              `Unsupported OBSERVABILITY_PROVIDER '${provider}'. Expected: supabase, console`,
            );
        }
      },
      inject: [SupabaseObservabilityService, ConsoleObservabilityService],
    },
  ],
  exports: [OBSERVABILITY_SERVICE],
})
export class ObservabilityPlaneModule {}
