/**
 * Observability Plane — public API
 *
 * Usage:
 *   import { OBSERVABILITY_SERVICE, ObservabilityServiceProvider } from '@/planes/observability';
 *
 *   @Inject(OBSERVABILITY_SERVICE) private readonly observability: ObservabilityServiceProvider
 */
export {
  OBSERVABILITY_SERVICE,
  type ObservabilityServiceProvider,
} from './observability.interface';

export { ObservabilityPlaneModule } from './observability.module';

export type {
  InvocationEventType,
  InvocationEvent,
  LLMUsageEvent,
  StreamCorrelation,
  ObservabilityEventRecord,
} from './observability.types';
