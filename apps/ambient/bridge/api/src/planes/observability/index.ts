/**
 * Observability Plane Interface for Bridge
 *
 * Provides the injection token and interface for the observability service
 * used by the invoke path. The implementation is provided by BridgeObservabilityModule.
 *
 * Usage:
 *   import { OBSERVABILITY_SERVICE, ObservabilityServiceProvider } from '@/planes/observability';
 *   @Inject(OBSERVABILITY_SERVICE) private readonly observability: ObservabilityServiceProvider
 */

import type { ExecutionContext } from '@orchestrator-ai/transport-types';

export const OBSERVABILITY_SERVICE = Symbol('OBSERVABILITY_SERVICE');

export interface InvocationEventPayload {
  type:
    | 'invocation.started'
    | 'invocation.completed'
    | 'invocation.failed'
    | 'invocation.progress';
  sourceApp: string;
  success?: boolean;
  duration?: number;
  error?: string;
  message?: string;
  progress?: number;
  step?: string;
  payload?: Record<string, unknown>;
}

/**
 * ObservabilityServiceProvider — contract used by BridgeDispatchService.
 */
export interface ObservabilityServiceProvider {
  emitInvocationEvent(
    context: ExecutionContext,
    payload: InvocationEventPayload,
  ): Promise<void>;
}
