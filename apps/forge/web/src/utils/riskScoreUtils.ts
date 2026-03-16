/**
 * Risk Score Utilities
 *
 * Provides consistent score normalization and formatting across the Risk dashboard.
 * Scores in the database may be stored as 0-1 (decimal) or 0-100 (percentage).
 * These utilities normalize and format scores consistently.
 */

/**
 * Normalize a score to 0-100 percentage format
 * @param score - Raw score (could be 0-1 or 0-100)
 * @returns Score as 0-100 percentage, or null if invalid
 */
export function normalizeScore(score: unknown): number | null {
  if (score === null || score === undefined) return null;
  if (typeof score !== 'number' || isNaN(score)) return null;

  // If score is > 1, assume it's already 0-100 format
  // If score is <= 1, assume it's 0-1 decimal format and multiply by 100
  return score > 1 ? score : score * 100;
}

/**
 * Normalize a score change value
 * Changes can be positive or negative, so we check absolute value
 * @param change - Raw change value
 * @returns Change as percentage points, or null if invalid
 */
export function normalizeScoreChange(change: unknown): number | null {
  if (change === null || change === undefined) return null;
  if (typeof change !== 'number' || isNaN(change)) return null;

  // If absolute value > 1, assume it's already in percentage points
  // If absolute value <= 1, assume it's decimal format
  return Math.abs(change) > 1 ? change : change * 100;
}

/**
 * Format a score for display as a percentage string
 * @param score - Raw score (could be 0-1 or 0-100)
 * @param decimals - Number of decimal places (default 1)
 * @returns Formatted string like "62.4%" or "N/A"
 */
export function formatScorePercent(score: unknown, decimals = 1): string {
  const normalized = normalizeScore(score);
  if (normalized === null) return 'N/A';
  return normalized.toFixed(decimals) + '%';
}

/**
 * Format a score change for display
 * @param change - Raw change value
 * @param decimals - Number of decimal places (default 1)
 * @returns Formatted string like "+5.2%" or "-3.1%" or "N/A"
 */
export function formatScoreChange(change: unknown, decimals = 1): string {
  const normalized = normalizeScoreChange(change);
  if (normalized === null) return 'N/A';
  const prefix = normalized >= 0 ? '+' : '';
  return prefix + normalized.toFixed(decimals) + '%';
}

/**
 * Get risk level classification based on score
 * @param score - Raw score (could be 0-1 or 0-100)
 * @returns Risk level: 'critical' | 'high' | 'medium' | 'low' | 'unknown'
 */
export function getRiskLevel(score: unknown): 'critical' | 'high' | 'medium' | 'low' | 'unknown' {
  const normalized = normalizeScore(score);
  if (normalized === null) return 'unknown';

  if (normalized >= 70) return 'critical';
  if (normalized >= 50) return 'high';
  if (normalized >= 30) return 'medium';
  return 'low';
}

/**
 * Get CSS class for risk level styling
 * @param score - Raw score (could be 0-1 or 0-100)
 * @returns CSS class name
 */
export function getRiskLevelClass(score: unknown): string {
  const level = getRiskLevel(score);
  return `risk-${level}`;
}

/**
 * Get CSS class for score change styling
 * @param change - Raw change value
 * @returns 'increase' | 'decrease' | ''
 */
export function getChangeClass(change: unknown): string {
  const normalized = normalizeScoreChange(change);
  if (normalized === null) return '';
  if (normalized > 0.5) return 'increase'; // Using small threshold to avoid floating point issues
  if (normalized < -0.5) return 'decrease';
  return '';
}

/**
 * Extract score from a dimension scores object
 * Handles both { slug: score } and { slug: { score: value, weight: value } } formats
 */
export function extractDimensionScore(dimData: unknown): number | null {
  if (dimData === null || dimData === undefined) return null;

  if (typeof dimData === 'number') {
    return normalizeScore(dimData);
  }

  if (typeof dimData === 'object' && dimData !== null && !Array.isArray(dimData)) {
    const record = dimData as Record<string, unknown>;
    const score = record['score'];
    if (typeof score === 'number') {
      return normalizeScore(score);
    }
  }

  return null;
}
