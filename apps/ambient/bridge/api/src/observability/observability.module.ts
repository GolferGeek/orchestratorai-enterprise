import { Global, Module } from '@nestjs/common';
import { BridgeObservabilityService } from './bridge-observability.service';
import { OBSERVABILITY_SERVICE } from '@orchestratorai/planes/observability';

/**
 * BridgeObservabilityModule
 *
 * @Global() module providing OBSERVABILITY_SERVICE for Bridge.
 * Imported in AppModule so all features (invoke, inbound, outbound) can
 * inject the observability service without explicit module imports.
 */
@Global()
@Module({
  providers: [
    BridgeObservabilityService,
    {
      provide: OBSERVABILITY_SERVICE,
      useExisting: BridgeObservabilityService,
    },
  ],
  exports: [OBSERVABILITY_SERVICE],
})
export class BridgeObservabilityModule {}
