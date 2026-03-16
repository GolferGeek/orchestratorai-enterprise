/**
 * Observability Plane Interface
 *
 * Provides the injection token and interface for the observability service
 * used by the invoke path. The implementation is provided by ObservabilityModule.
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
}

/**
 * ObservabilityServiceProvider — minimal contract used by InvokeDispatchService.
 */
export interface ObservabilityServiceProvider {
  emitInvocationEvent(
    context: ExecutionContext,
    payload: InvocationEventPayload,
  ): Promise<void>;
}
