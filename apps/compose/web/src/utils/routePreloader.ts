/**
 * Route Preloader - Intelligent route preloading for better performance
 */
import { CRITICAL_RESOURCES, RESOURCE_HINTS } from './cacheHeaders';

export class RoutePreloader {
  private preloadedRoutes = new Set<string>();
  private loadingRoutes = new Set<string>();

  /**
   * Preload critical routes that users are likely to visit
   */
  async preloadCriticalRoutes() {
    const criticalRoutes = [
      () => import('../views/HomePage.vue'),
      () => import('../views/LoginPage.vue'),
      () => import('../views/PIIManagementPage.vue')
    ];

    // Preload during idle time
    if ('requestIdleCallback' in window) {
      (window as { requestIdleCallback: (callback: () => void) => void }).requestIdleCallback(() => {
        this.preloadRoutes(criticalRoutes);
      });
    } else {
      // Fallback for browsers without requestIdleCallback
      setTimeout(() => {
        this.preloadRoutes(criticalRoutes);
      }, 2000);
    }
  }

  /**
   * Preload routes based on user behavior patterns
   */
  async preloadByUserRole(userRole: string) {
    let roleBasedRoutes: (() => Promise<unknown>)[] = [];

    switch (userRole) {
      case 'admin':
        roleBasedRoutes = [
          () => import('../views/AdminEvaluationsPage.vue'),
          () => import('../views/AdminSettingsPage.vue'),
          () => import('../views/admin/LlmUsageView.vue')
        ];
        break;
      case 'user':
        roleBasedRoutes = [
          () => import('../views/EvaluationsPage.vue'),
          () => import('../views/PIITestingPage.vue')
        ];
        break;
    }

    if (roleBasedRoutes.length > 0) {
      this.preloadRoutes(roleBasedRoutes);
    }
  }

  /**
   * Preload on link hover for instant navigation
   */
  preloadOnHover(routePath: string) {
    if (this.preloadedRoutes.has(routePath) || this.loadingRoutes.has(routePath)) {
      return;
    }

    this.loadingRoutes.add(routePath);
    
    // Map route paths to dynamic imports
    const routeImports: Record<string, () => Promise<unknown>> = {
      '/app/pii': () => import('../views/PIIManagementPage.vue'),
      '/app/pii/testing': () => import('../views/PIITestingPage.vue'),
      '/app/pii/dictionary': () => import('../views/PseudonymDictionaryPage.vue'),
      '/app/pii/mappings': () => import('../views/PseudonymMappingPage.vue'),
      '/app/evaluations': () => import('../views/EvaluationsPage.vue'),
      '/app/admin/evaluations': () => import('../views/AdminEvaluationsPage.vue'),
      '/app/admin/settings': () => import('../views/AdminSettingsPage.vue'),
      '/app/admin/llm-usage': () => import('../views/admin/LlmUsageView.vue')
    };

    const importFn = routeImports[routePath];
    if (importFn) {
      importFn().then(() => {
        this.preloadedRoutes.add(routePath);
        this.loadingRoutes.delete(routePath);
      }).catch(() => {
        this.loadingRoutes.delete(routePath);
      });
    }
  }

  private async preloadRoutes(routes: (() => Promise<unknown>)[]) {
    for (const route of routes) {
      try {
        await route();
      } catch {
        // Route preload failed - not critical, will load on demand
      }
    }
  }

  /**
   * Setup hover preloading for navigation links
   */
  setupHoverPreloading() {
    document.addEventListener('mouseover', (event) => {
      const target = event.target as HTMLElement;
      const link = target.closest('a[href^="/app"]') as HTMLAnchorElement;
      
      if (link && link.href) {
        const url = new URL(link.href);
        this.preloadOnHover(url.pathname);
      }
    });
  }

  /**
   * Preload based on current route context
   */
  preloadRelatedRoutes(currentRoute: string) {
    const relatedRoutes: Record<string, string[]> = {
      '/app/home': ['/app/pii', '/app/deliverables'],
      '/app/pii': ['/app/pii/testing', '/app/pii/dictionary'],
      '/app/pii/management': ['/app/pii/testing', '/app/pii/dictionary', '/app/pii/mappings'],
      '/app/admin': ['/app/admin/evaluations', '/app/admin/settings', '/app/admin/llm-usage']
    };

    const related = relatedRoutes[currentRoute];
    if (related) {
      related.forEach(route => this.preloadOnHover(route));
    }
  }

  /**
   * Setup resource hints for performance optimization
   */
  setupResourceHints() {
    const head = document.head;

    // Add DNS prefetch hints
    RESOURCE_HINTS.DNS_PREFETCH.forEach(domain => {
      const link = document.createElement('link');
      link.rel = 'dns-prefetch';
      link.href = domain;
      head.appendChild(link);
    });

    // Add preconnect hints  
    RESOURCE_HINTS.PRECONNECT.forEach(domain => {
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = domain;
      head.appendChild(link);
    });

    // Add prefetch hints for likely navigation
    RESOURCE_HINTS.PREFETCH.forEach(path => {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = path;
      head.appendChild(link);
    });
  }

  /**
   * Preload critical resources immediately
   */
  preloadCriticalResources() {
    CRITICAL_RESOURCES.forEach(resource => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.href = resource;
      
      // Set appropriate 'as' attribute based on file type
      if (resource.endsWith('.css')) {
        link.as = 'style';
      } else if (resource.endsWith('.js') || resource.endsWith('.mjs')) {
        link.as = 'script';
      } else if (resource.match(/\.(png|jpg|jpeg|gif|webp|svg)$/)) {
        link.as = 'image';
      }
      
      document.head.appendChild(link);
    });
  }
}

// Create singleton instance
export const routePreloader = new RoutePreloader();

// Auto-setup on module import
if (typeof window !== 'undefined') {
  // Setup after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      routePreloader.setupHoverPreloading();
      routePreloader.setupResourceHints();
      routePreloader.preloadCriticalResources();
    });
  } else {
    routePreloader.setupHoverPreloading();
    routePreloader.setupResourceHints();
    routePreloader.preloadCriticalResources();
  }
}