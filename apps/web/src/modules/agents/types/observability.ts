export interface ChartDataPoint {
  timestamp: number;
  count: number;
  eventTypes?: Record<string, number>;
  sessions?: Record<string, number>;
}

export interface ChartConfig {
  maxDataPoints: number;
  animationDuration: number;
  barWidth: number;
  barGap: number;
  colors: {
    primary: string;
    glow: string;
    axis: string;
    text: string;
  };
}

export type TimeRange = '20s' | '1m' | '2m';


















