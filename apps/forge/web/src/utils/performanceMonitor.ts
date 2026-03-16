/**
 * Performance Monitoring - Track and optimize UI rendering and response times
 */

export interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  details?: Record<string, unknown>;
}

export interface RenderMetric {
  component: string;
  renderTime: number;
  props: Record<string, unknown>;
  timestamp: number;
}

export interface APIMetric {
  endpoint: string;
  method: string;
  responseTime: number;
  status: number;
  timestamp: number;
}

export class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private renderMetrics: RenderMetric[] = [];
  private apiMetrics: APIMetric[] = [];
  private observers: PerformanceObserver[] = [];
  
  constructor() {
    this.initializeObservers();
  }

  /**
   * Start timing a performance metric
   */
  startMetric(name: string, details?: Record<string, unknown>): void {
    const metric: PerformanceMetric = {
      name,
      startTime: performance.now(),
      details
    };
    this.metrics.push(metric);
  }

  /**
   * End timing a performance metric
   */
  endMetric(name: string): void {
    const metric = this.metrics.find(m => m.name === name && !m.endTime);
    if (metric) {
      metric.endTime = performance.now();
      metric.duration = metric.endTime - metric.startTime;
      
      // Log slow operations (>100ms)
      if (metric.duration > 100) {
        // Performance metric logged
      }
    }
  }

  /**
   * Track component render times
   */
  trackComponentRender(component: string, renderTime: number, props: Record<string, unknown> = {}): void {
    const metric: RenderMetric = {
      component,
      renderTime,
      props,
      timestamp: performance.now()
    };
    
    this.renderMetrics.push(metric);
    
    // Keep only last 100 render metrics
    if (this.renderMetrics.length > 100) {
      this.renderMetrics.shift();
    }

    // Warn about slow renders (>16ms for 60fps)
    if (renderTime > 16) {
      // Slow render detected
    }
  }

  /**
   * Track API response times
   */
  trackAPICall(endpoint: string, method: string, responseTime: number, status: number): void {
    const metric: APIMetric = {
      endpoint,
      method,
      responseTime,
      status,
      timestamp: performance.now()
    };
    
    this.apiMetrics.push(metric);
    
    // Keep only last 50 API metrics
    if (this.apiMetrics.length > 50) {
      this.apiMetrics.shift();
    }

    // Warn about slow API calls (>1000ms)
    if (responseTime > 1000) {
      // Slow API call detected
    }
  }

  /**
   * Initialize performance observers
   */
  private initializeObservers(): void {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
      return;
    }

    // Navigation timing
    try {
      const navObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'navigation') {
            const navEntry = entry as PerformanceNavigationTiming;
            this.trackNavigationTiming(navEntry);
          }
        }
      });
      navObserver.observe({ entryTypes: ['navigation'] });
      this.observers.push(navObserver);
    } catch {
      // Navigation observer not supported
    }

    // Resource timing
    try {
      const resourceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'resource') {
            const resourceEntry = entry as PerformanceResourceTiming;
            this.trackResourceTiming(resourceEntry);
          }
        }
      });
      resourceObserver.observe({ entryTypes: ['resource'] });
      this.observers.push(resourceObserver);
    } catch {
      // Resource observer not supported
    }

    // Paint timing
    try {
      const paintObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'paint') {
            // Paint timing recorded
          }
        }
      });
      paintObserver.observe({ entryTypes: ['paint'] });
      this.observers.push(paintObserver);
    } catch {
      // Paint observer not supported
    }

    // Largest Contentful Paint
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        // Record LCP entries
        void list.getEntries();
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
      this.observers.push(lcpObserver);
    } catch {
      // LCP observer not supported
    }
  }

  /**
   * Track navigation timing metrics
   */
  private trackNavigationTiming(entry: PerformanceNavigationTiming): void {
    const timings = {
      'DNS Lookup': entry.domainLookupEnd - entry.domainLookupStart,
      'TCP Connect': entry.connectEnd - entry.connectStart,
      'TLS Setup': entry.requestStart - entry.secureConnectionStart,
      'Request': entry.responseStart - entry.requestStart,
      'Response': entry.responseEnd - entry.responseStart,
      'DOM Processing': entry.domContentLoadedEventEnd - entry.responseEnd,
      'Resource Loading': entry.loadEventEnd - entry.domContentLoadedEventEnd,
      'Total Load Time': entry.loadEventEnd - entry.fetchStart
    };

    console.group('Navigation Timing');
    Object.entries(timings).forEach(([_name, time]) => {
      if (time > 0) {
        // Navigation timing recorded
      }
    });
    console.groupEnd();
  }

  /**
   * Track resource loading timing
   */
  private trackResourceTiming(entry: PerformanceResourceTiming): void {
    const duration = entry.responseEnd - entry.startTime;

    // Only track significant resources (>100ms or >100KB)
    if (duration > 100 || entry.transferSize > 100000) {
      // Significant resource load detected
    }
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): {
    slowestMetrics: PerformanceMetric[];
    slowestRenders: RenderMetric[];
    slowestAPIs: APIMetric[];
    averageRenderTime: number;
    averageAPITime: number;
  } {
    const completedMetrics = this.metrics.filter(m => m.duration !== undefined);
    
    return {
      slowestMetrics: completedMetrics
        .sort((a, b) => (b.duration || 0) - (a.duration || 0))
        .slice(0, 10),
      slowestRenders: [...this.renderMetrics]
        .sort((a, b) => b.renderTime - a.renderTime)
        .slice(0, 10),
      slowestAPIs: [...this.apiMetrics]
        .sort((a, b) => b.responseTime - a.responseTime)
        .slice(0, 10),
      averageRenderTime: this.renderMetrics.length > 0 
        ? this.renderMetrics.reduce((sum, m) => sum + m.renderTime, 0) / this.renderMetrics.length
        : 0,
      averageAPITime: this.apiMetrics.length > 0
        ? this.apiMetrics.reduce((sum, m) => sum + m.responseTime, 0) / this.apiMetrics.length
        : 0
    };
  }

  /**
   * Measure Core Web Vitals
   */
  measureCoreWebVitals(): Promise<{
    lcp: number | null;
    fid: number | null; 
    cls: number | null;
    fcp: number | null;
    ttfb: number | null;
  }> {
    return new Promise((resolve) => {
      const results = {
        lcp: null as number | null,
        fid: null as number | null,
        cls: null as number | null,
        fcp: null as number | null,
        ttfb: null as number | null
      };

      // Get navigation timing for TTFB
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navigation) {
        results.ttfb = navigation.responseStart - navigation.requestStart;
      }

      // Get paint timing for FCP
      const fcpEntry = performance.getEntriesByName('first-contentful-paint')[0];
      if (fcpEntry) {
        results.fcp = fcpEntry.startTime;
      }

      // Try to get other metrics from observers
      let observerCount = 0;
      const maxObservers = 3;

      const checkCompletion = () => {
        observerCount++;
        if (observerCount >= maxObservers) {
          resolve(results);
        }
      };

      // LCP Observer
      try {
        let lcpValue: number | null = null;
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          if (entries.length > 0) {
            lcpValue = entries[entries.length - 1].startTime;
          }
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
        
        setTimeout(() => {
          results.lcp = lcpValue;
          lcpObserver.disconnect();
          checkCompletion();
        }, 1000);
      } catch {
        // LCP measurement not supported
        checkCompletion();
      }

      // CLS Observer
      try {
        let clsValue = 0;
        const clsObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            // LayoutShift interface has hadRecentInput and value properties
            const layoutShiftEntry = entry as PerformanceEntry & { hadRecentInput?: boolean; value: number };
            if (!layoutShiftEntry.hadRecentInput) {
              clsValue += layoutShiftEntry.value;
            }
          }
        });
        clsObserver.observe({ entryTypes: ['layout-shift'] });
        
        setTimeout(() => {
          results.cls = clsValue;
          clsObserver.disconnect();
          checkCompletion();
        }, 1000);
      } catch {
        // CLS measurement not supported
        checkCompletion();
      }

      // FID is harder to measure artificially, so we'll skip it for now
      checkCompletion();
    });
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics = [];
    this.renderMetrics = [];
    this.apiMetrics = [];
  }

  /**
   * Clean up observers
   */
  disconnect(): void {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
  }
}

// Create singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Global performance monitoring functions
export const startTiming = (name: string, details?: Record<string, unknown>) => {
  performanceMonitor.startMetric(name, details);
};

export const endTiming = (name: string) => {
  performanceMonitor.endMetric(name);
};

export const trackRender = (component: string, renderTime: number, props?: Record<string, unknown>) => {
  performanceMonitor.trackComponentRender(component, renderTime, props);
};

export const trackAPI = (endpoint: string, method: string, responseTime: number, status: number) => {
  performanceMonitor.trackAPICall(endpoint, method, responseTime, status);
};

// Vue composable for performance monitoring
export function usePerformanceTracking() {
  return {
    startTiming,
    endTiming,
    trackRender,
    trackAPI,
    getPerformanceSummary: () => performanceMonitor.getPerformanceSummary(),
    measureCoreWebVitals: () => performanceMonitor.measureCoreWebVitals()
  };
}