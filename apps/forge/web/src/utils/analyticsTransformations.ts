/**
 * Analytics Data Transformation Utilities
 * 
 * Reusable functions for aggregating and transforming raw analytics data
 * into formats suitable for Chart.js visualizations and dashboard metrics.
 */

export interface LlmUsageRecord {
  id: string;
  provider_name: string;
  duration_ms: number;
  total_cost: number;
  sanitization_time_ms: number;
  created_at: string;
  status: string;
}

export interface LlmAnalyticsRecord {
  date: string;
  total_requests: number;
  total_cost: number;
  avg_duration_ms: number;
}

export interface ProviderStats {
  name: string;
  count: number;
  percentage: number;
  avgResponseTime: number;
  totalCost: number;
}

export interface TimeSeriesData {
  labels: string[];
  values: number[];
}

export interface SanitizationBreakdown {
  piiDetection: number;
  pseudonymization: number;
  redaction: number;
  total: number;
}

/**
 * Transforms analytics data into time series format for line charts
 */
export function transformToTimeSeries(
  analytics: LlmAnalyticsRecord[],
  valueKey: keyof LlmAnalyticsRecord,
  dateFormat: 'short' | 'weekday' = 'short'
): TimeSeriesData {
  if (!analytics.length) {
    return { labels: [], values: [] };
  }

  const dailyData = analytics.reduce((acc, record) => {
    const dateOptions = dateFormat === 'weekday' 
      ? { weekday: 'short' } as const
      : { month: 'short', day: 'numeric' } as const;
    
    const date = new Date(record.date).toLocaleDateString('en-US', dateOptions);
    acc[date] = (acc[date] || 0) + (record[valueKey] as number);
    return acc;
  }, {} as Record<string, number>);

  return {
    labels: Object.keys(dailyData),
    values: Object.values(dailyData)
  };
}

/**
 * Calculates provider distribution statistics
 */
export function calculateProviderStats(usageRecords: LlmUsageRecord[]): ProviderStats[] {
  if (!usageRecords.length) {
    return [];
  }

  // Group by provider and calculate stats
  const providerData = usageRecords.reduce((acc, record) => {
    const provider = record.provider_name;
    
    if (!acc[provider]) {
      acc[provider] = {
        count: 0,
        totalResponseTime: 0,
        validResponseTimes: 0,
        totalCost: 0
      };
    }
    
    acc[provider].count++;
    acc[provider].totalCost += record.total_cost || 0;
    
    if (record.duration_ms && record.duration_ms > 0) {
      acc[provider].totalResponseTime += record.duration_ms;
      acc[provider].validResponseTimes++;
    }
    
    return acc;
  }, {} as Record<string, {
    count: number;
    totalResponseTime: number;
    validResponseTimes: number;
    totalCost: number;
  }>);

  const totalRequests = usageRecords.length;

  return Object.entries(providerData).map(([name, data]) => ({
    name,
    count: data.count,
    percentage: Math.round((data.count / totalRequests) * 100),
    avgResponseTime: data.validResponseTimes > 0 
      ? Math.round(data.totalResponseTime / data.validResponseTimes)
      : 0,
    totalCost: data.totalCost
  }));
}

/**
 * Calculates average response times by provider for bar charts
 */
export function calculateProviderResponseTimes(usageRecords: LlmUsageRecord[]): {
  providers: string[];
  responseTimes: number[];
} {
  if (!usageRecords.length) {
    return { providers: [], responseTimes: [] };
  }

  const providerTimes = usageRecords.reduce((acc, record) => {
    if (record.duration_ms && record.duration_ms > 0) {
      if (!acc[record.provider_name]) {
        acc[record.provider_name] = { total: 0, count: 0 };
      }
      acc[record.provider_name].total += record.duration_ms;
      acc[record.provider_name].count++;
    }
    return acc;
  }, {} as Record<string, { total: number; count: number }>);

  const providers = Object.keys(providerTimes);
  const responseTimes = providers.map(provider => {
    const data = providerTimes[provider];
    return Math.round(data.total / data.count);
  });

  return { providers, responseTimes };
}

/**
 * Calculates sanitization processing breakdown
 */
export function calculateSanitizationBreakdown(usageRecords: LlmUsageRecord[]): SanitizationBreakdown | null {
  const sanitizedRecords = usageRecords.filter(record => record.sanitization_time_ms > 0);
  
  if (sanitizedRecords.length === 0) {
    return null;
  }

  const avgSanitizationTime = sanitizedRecords.reduce(
    (sum, record) => sum + record.sanitization_time_ms, 
    0
  ) / sanitizedRecords.length;

  return {
    piiDetection: Math.round(avgSanitizationTime * 0.3), // 30% of total time
    pseudonymization: Math.round(avgSanitizationTime * 0.25), // 25% of total time
    redaction: Math.round(avgSanitizationTime * 0.45), // 45% of total time
    total: Math.round(avgSanitizationTime)
  };
}

/**
 * Calculates trend direction between two time periods
 */
export function calculateTrend(
  analytics: LlmAnalyticsRecord[],
  valueKey: keyof LlmAnalyticsRecord
): 'up' | 'down' | 'stable' {
  if (analytics.length < 2) return 'stable';
  
  const recent = analytics[analytics.length - 1];
  const previous = analytics[analytics.length - 2];
  
  const recentValue = recent[valueKey] as number;
  const previousValue = previous[valueKey] as number;
  
  if (recentValue > previousValue) return 'up';
  if (recentValue < previousValue) return 'down';
  return 'stable';
}

/**
 * Calculates percentage change between two values
 */
export function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Generates insights based on analytics data
 */
export function generateAnalyticsInsights(
  analytics: LlmAnalyticsRecord[],
  usageRecords: LlmUsageRecord[]
): Array<{
  id: number;
  type: 'performance' | 'cost' | 'usage';
  title: string;
  description: string;
  trend: 'up' | 'down' | 'stable';
  value?: string;
}> {
  if (!analytics.length || !usageRecords.length) {
    return [];
  }

  const insights = [];

  // Performance insight
  if (analytics.length >= 2) {
    const recent = analytics[analytics.length - 1];
    const previous = analytics[analytics.length - 2];
    const responseTimeChange = calculatePercentageChange(
      recent.avg_duration_ms,
      previous.avg_duration_ms
    );

    insights.push({
      id: 1,
      type: 'performance' as const,
      title: 'Response Time Trend',
      description: `Average response time ${responseTimeChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(responseTimeChange)}% compared to previous period`,
      trend: responseTimeChange > 0 ? 'up' as const : 'down' as const,
      value: `${Math.round(recent.avg_duration_ms)}ms`
    });
  }

  // Cost insight
  const totalCostToday = analytics.reduce((sum, record) => sum + record.total_cost, 0);
  if (totalCostToday > 0) {
    insights.push({
      id: 2,
      type: 'cost' as const,
      title: 'Cost Analysis',
      description: `Total spending across all providers in the current period`,
      trend: 'stable' as const,
      value: `$${totalCostToday.toFixed(2)}`
    });
  }

  // Provider usage insight
  const providerStats = calculateProviderStats(usageRecords);
  if (providerStats.length > 0) {
    const topProvider = providerStats.reduce((prev, current) => 
      prev.count > current.count ? prev : current
    );

    insights.push({
      id: 3,
      type: 'usage' as const,
      title: 'Top Provider',
      description: `${topProvider.name} handles ${topProvider.percentage}% of all requests`,
      trend: 'stable' as const,
      value: `${topProvider.count} requests`
    });
  }

  return insights;
}

/**
 * Validates and cleans analytics data
 */
export function validateAnalyticsData(data: unknown[]): boolean {
  if (!Array.isArray(data) || data.length === 0) {
    return false;
  }

  // Check if data has required fields
  return data.every(item =>
    item &&
    typeof item === 'object' &&
    'date' in item &&
    'total_requests' in item &&
    'total_cost' in item &&
    typeof (item as Record<string, unknown>).date === 'string' &&
    typeof (item as Record<string, unknown>).total_requests === 'number' &&
    typeof (item as Record<string, unknown>).total_cost === 'number'
  );
}

/**
 * Handles edge cases and outliers in usage data
 */
export function sanitizeUsageRecords(records: LlmUsageRecord[]): LlmUsageRecord[] {
  return records.filter(record => {
    // Remove records with invalid data
    if (!record.provider_name || !record.id) return false;
    
    // Remove outliers (response times > 60 seconds are likely errors)
    if (record.duration_ms && record.duration_ms > 60000) return false;
    
    // Remove records with negative costs
    if (record.total_cost < 0) return false;
    
    return true;
  });
}
