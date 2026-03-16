/**
 * LLM Formatting Utilities
 *
 * Pure formatting functions for LLM-related data display.
 * These are presentation-layer utilities and contain no business logic.
 */

/**
 * Format cost value for display
 * @param cost - Cost in dollars
 * @returns Formatted cost string (e.g., "$0.0042")
 */
export function formatCost(cost: number | null | undefined): string {
  if (cost === null || cost === undefined) return '$0.00';
  return `$${cost.toFixed(4)}`;
}

/**
 * Format duration in milliseconds for display
 * @param durationMs - Duration in milliseconds
 * @returns Formatted duration string (e.g., "1.5s" or "250ms")
 */
export function formatDuration(durationMs: number | null | undefined): string {
  if (durationMs === null || durationMs === undefined) return '-';
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(2)}s`;
}

/**
 * Format token count for display
 * @param tokens - Token count
 * @returns Formatted token string (e.g., "1.2k" or "150")
 */
export function formatTokens(tokens: number | null | undefined): string {
  if (tokens === null || tokens === undefined) return '-';
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return tokens.toString();
}

/**
 * Format percentage for display
 * @param value - Percentage value (0-1 or 0-100)
 * @param asDecimal - Whether input is decimal (0-1) or percentage (0-100)
 * @returns Formatted percentage string (e.g., "95.5%")
 */
export function formatPercentage(
  value: number | null | undefined,
  asDecimal: boolean = true
): string {
  if (value === null || value === undefined) return '0%';
  const percentage = asDecimal ? value * 100 : value;
  return `${percentage.toFixed(1)}%`;
}

/**
 * Format large numbers with abbreviations (K, M, B)
 * @param value - Number to format
 * @returns Formatted number string (e.g., "1.2M")
 */
export function formatLargeNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '0';

  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toString();
}

/**
 * Format date for display
 * @param date - Date string or Date object
 * @param includeTime - Whether to include time
 * @returns Formatted date string
 */
export function formatDate(
  date: string | Date | null | undefined,
  includeTime: boolean = false
): string {
  if (!date) return '-';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (includeTime) {
    return dateObj.toLocaleString();
  }
  return dateObj.toLocaleDateString();
}

/**
 * Format relative time (e.g., "2 hours ago")
 * @param date - Date string or Date object
 * @returns Relative time string
 */
export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return '-';

  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;

  return formatDate(dateObj);
}

/**
 * Format data size in bytes
 * @param bytes - Size in bytes
 * @returns Formatted size string (e.g., "1.5 MB")
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Get status color based on status string
 * @param status - Status string
 * @returns Ionic color name
 */
export function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'completed':
    case 'success':
    case 'healthy':
    case 'active':
      return 'success';
    case 'failed':
    case 'error':
    case 'critical':
    case 'unhealthy':
      return 'danger';
    case 'running':
    case 'in_progress':
    case 'warning':
    case 'degraded':
      return 'warning';
    case 'pending':
    case 'queued':
      return 'primary';
    default:
      return 'medium';
  }
}

/**
 * Get severity color based on severity level
 * @param severity - Severity level
 * @returns Ionic color name
 */
export function getSeverityColor(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'critical':
      return 'danger';
    case 'high':
    case 'error':
      return 'warning';
    case 'medium':
    case 'warning':
      return 'warning';
    case 'low':
    case 'info':
      return 'primary';
    default:
      return 'medium';
  }
}

/**
 * Format model name for display (remove provider prefix if present)
 * @param modelName - Full model name
 * @returns Shortened model name
 */
export function formatModelName(modelName: string | null | undefined): string {
  if (!modelName) return '-';

  // Remove common provider prefixes
  return modelName
    .replace(/^(openai|anthropic|google|ollama)[:/]/i, '')
    .trim();
}

/**
 * Format provider name for display
 * @param providerName - Provider name
 * @returns Capitalized provider name
 */
export function formatProviderName(providerName: string | null | undefined): string {
  if (!providerName) return '-';

  // Capitalize first letter
  return providerName.charAt(0).toUpperCase() + providerName.slice(1).toLowerCase();
}
