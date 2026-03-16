/**
 * Cache Header Configuration - Optimize static asset caching
 */

export const CACHE_STRATEGIES = {
  // Long-term caching for immutable assets (hashed filenames)
  IMMUTABLE_ASSETS: {
    'Cache-Control': 'public, max-age=31536000, immutable', // 1 year
    'Expires': new Date(Date.now() + 31536000000).toUTCString()
  },
  
  // Medium-term caching for static assets
  STATIC_ASSETS: {
    'Cache-Control': 'public, max-age=2592000', // 30 days
    'Expires': new Date(Date.now() + 2592000000).toUTCString()
  },
  
  // Short-term caching for HTML files
  HTML_FILES: {
    'Cache-Control': 'public, max-age=3600, must-revalidate', // 1 hour
    'Expires': new Date(Date.now() + 3600000).toUTCString()
  },
  
  // No caching for API responses that change frequently
  DYNAMIC_CONTENT: {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  }
};

export const FILE_TYPE_CACHE_MAP: Record<string, Record<string, string>> = {
  // JavaScript and CSS files (with hashes)
  '.js': CACHE_STRATEGIES.IMMUTABLE_ASSETS,
  '.css': CACHE_STRATEGIES.IMMUTABLE_ASSETS,
  '.mjs': CACHE_STRATEGIES.IMMUTABLE_ASSETS,

  // Images and fonts
  '.png': CACHE_STRATEGIES.STATIC_ASSETS,
  '.jpg': CACHE_STRATEGIES.STATIC_ASSETS,
  '.jpeg': CACHE_STRATEGIES.STATIC_ASSETS,
  '.gif': CACHE_STRATEGIES.STATIC_ASSETS,
  '.svg': CACHE_STRATEGIES.STATIC_ASSETS,
  '.webp': CACHE_STRATEGIES.STATIC_ASSETS,
  '.ico': CACHE_STRATEGIES.STATIC_ASSETS,
  '.woff': CACHE_STRATEGIES.STATIC_ASSETS,
  '.woff2': CACHE_STRATEGIES.STATIC_ASSETS,
  '.ttf': CACHE_STRATEGIES.STATIC_ASSETS,
  '.otf': CACHE_STRATEGIES.STATIC_ASSETS,

  // HTML files
  '.html': CACHE_STRATEGIES.HTML_FILES
};

/**
 * Get appropriate cache headers for a file based on its extension
 */
export function getCacheHeaders(filePath: string): Record<string, string> {
  const extension = filePath.substring(filePath.lastIndexOf('.'));
  return FILE_TYPE_CACHE_MAP[extension] || CACHE_STRATEGIES.DYNAMIC_CONTENT;
}

/**
 * Service Worker cache configuration
 */
export const SW_CACHE_CONFIG = {
  // Cache name versioning for updates
  VERSION: 'v1',
  CACHE_NAMES: {
    STATIC: 'orchestrator-static-v1',
    DYNAMIC: 'orchestrator-dynamic-v1',
    API: 'orchestrator-api-v1'
  },
  
  // Cache strategies by resource type
  STRATEGIES: {
    // Cache first for static assets
    STATIC_ASSETS: 'cache-first',
    // Network first for API calls
    API_CALLS: 'network-first',
    // Stale while revalidate for HTML
    HTML_PAGES: 'stale-while-revalidate'
  },
  
  // Cache expiry times
  EXPIRY: {
    STATIC: 30 * 24 * 60 * 60 * 1000, // 30 days
    DYNAMIC: 7 * 24 * 60 * 60 * 1000,  // 7 days
    API: 5 * 60 * 1000                  // 5 minutes
  }
};

/**
 * Preload critical resources for better performance
 */
export const CRITICAL_RESOURCES = [
  '/assets/main.css',
  '/assets/ionic-core.js',
  '/assets/vue-vendor.js',
  '/favicon.png'
];

/**
 * Resource hints for prefetching and preloading
 */
export const RESOURCE_HINTS = {
  // DNS prefetch for external domains
  DNS_PREFETCH: [
    'https://app.orchestratorai.io',
    'https://api.orchestratorai.io'
  ],
  
  // Preconnect to critical origins
  PRECONNECT: [
    'https://app.orchestratorai.io',
    'https://api.orchestratorai.io'
  ],
  
  // Prefetch likely next navigation
  PREFETCH: [
    '/app/evaluations',
    '/app/deliverables'
  ]
};