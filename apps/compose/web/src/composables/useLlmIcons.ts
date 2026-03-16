/**
 * LLM Icon Composable
 *
 * Provides icon mappings for LLM-related UI elements.
 * Uses Ionicons for consistent iconography.
 */

import {
  codeOutline,
  personOutline,
  settingsOutline,
  serverOutline,
  helpOutline,
  hardwareChipOutline,
  cloudOutline,
  homeOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  warningOutline,
  timeOutline,
  alertCircleOutline,
  informationCircleOutline,
} from 'ionicons/icons';

/**
 * Get icon for caller type
 * @param callerType - Type of caller (agent, api, user, system, service)
 * @returns Ionicon string
 */
export function getCallerTypeIcon(callerType: string): string {
  switch (callerType.toLowerCase()) {
    case 'agent':
      return hardwareChipOutline;
    case 'api':
      return codeOutline;
    case 'user':
      return personOutline;
    case 'system':
      return settingsOutline;
    case 'service':
      return serverOutline;
    default:
      return helpOutline;
  }
}

/**
 * Get icon for routing type
 * @param route - Routing type (local, remote, external)
 * @returns Ionicon string
 */
export function getRouteIcon(route: string): string {
  switch (route.toLowerCase()) {
    case 'local':
      return homeOutline;
    case 'remote':
    case 'external':
      return cloudOutline;
    default:
      return serverOutline;
  }
}

/**
 * Get icon for status
 * @param status - Status string
 * @returns Ionicon string
 */
export function getStatusIcon(status: string): string {
  switch (status.toLowerCase()) {
    case 'completed':
    case 'success':
    case 'healthy':
    case 'active':
      return checkmarkCircleOutline;
    case 'failed':
    case 'error':
    case 'critical':
    case 'unhealthy':
      return closeCircleOutline;
    case 'running':
    case 'in_progress':
    case 'warning':
    case 'degraded':
      return warningOutline;
    case 'pending':
    case 'queued':
      return timeOutline;
    default:
      return helpOutline;
  }
}

/**
 * Get icon for severity level
 * @param severity - Severity level
 * @returns Ionicon string
 */
export function getSeverityIcon(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'critical':
      return closeCircleOutline;
    case 'high':
    case 'error':
      return alertCircleOutline;
    case 'medium':
    case 'warning':
      return warningOutline;
    case 'low':
    case 'info':
      return informationCircleOutline;
    default:
      return helpOutline;
  }
}

/**
 * Get icon for alert type
 * @param alertType - Alert type string
 * @returns Ionicon string
 */
export function getAlertTypeIcon(alertType: string): string {
  switch (alertType.toLowerCase()) {
    case 'error':
    case 'failure':
      return closeCircleOutline;
    case 'performance':
    case 'latency':
      return timeOutline;
    case 'cost':
    case 'budget':
      return warningOutline;
    case 'health':
    case 'availability':
      return alertCircleOutline;
    default:
      return informationCircleOutline;
  }
}

/**
 * Get icon for provider type
 * @param provider - Provider name
 * @returns Ionicon string
 */
export function getProviderIcon(provider: string): string {
  const providerLower = provider.toLowerCase();

  if (providerLower.includes('ollama')) {
    return homeOutline; // Local
  }
  if (providerLower.includes('openai') ||
      providerLower.includes('anthropic') ||
      providerLower.includes('google')) {
    return cloudOutline; // External
  }
  return serverOutline; // Default
}

/**
 * Composable that returns all icon helper functions
 */
export function useLlmIcons() {
  return {
    getCallerTypeIcon,
    getRouteIcon,
    getStatusIcon,
    getSeverityIcon,
    getAlertTypeIcon,
    getProviderIcon,
  };
}
