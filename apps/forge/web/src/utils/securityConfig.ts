/**
 * Security Configuration Utilities
 * Handles HTTPS enforcement, URL validation, and security settings
 */

export interface SecurityConfig {
  enforceHttps: boolean;
  allowedProtocols: string[];
  allowedHosts: string[];
  requireSecureContext: boolean;
  httpsPort: number;
  httpPort: number;
}

/**
 * Default security configuration
 */
const defaultSecurityConfig: SecurityConfig = {
  enforceHttps: false, // Temporarily disabled to fix network errors
  allowedProtocols: ['https:', 'http:'], // Allow both protocols
  allowedHosts: [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    // Add your production domains here
    'api.orchestrator-ai.com',
    'orchestrator-ai.com',
    '*.orchestrator-ai.com'
  ],
  requireSecureContext: false, // Temporarily disabled
  httpsPort: import.meta.env.VITE_HTTPS_PORT ? parseInt(import.meta.env.VITE_HTTPS_PORT, 10) : 9443, // Default HTTPS port for dev
  httpPort: import.meta.env.VITE_HTTP_PORT ? parseInt(import.meta.env.VITE_HTTP_PORT, 10) : 7101
};

/**
 * Get security configuration with environment overrides
 */
export function getSecurityConfig(): SecurityConfig {
  const config = { ...defaultSecurityConfig };
  
  // Environment-specific overrides
  if (import.meta.env.VITE_ENFORCE_HTTPS === 'true') {
    config.enforceHttps = true;
    config.allowedProtocols = ['https:'];
  }
  
  if (import.meta.env.VITE_ENFORCE_HTTPS === 'false') {
    config.enforceHttps = false;
  }
  
  if (import.meta.env.VITE_REQUIRE_SECURE_CONTEXT === 'true') {
    config.requireSecureContext = true;
  }
  
  if (import.meta.env.VITE_REQUIRE_SECURE_CONTEXT === 'false') {
    config.requireSecureContext = false;
  }
  
  // Custom ports
  if (import.meta.env.VITE_HTTPS_PORT) {
    config.httpsPort = parseInt(import.meta.env.VITE_HTTPS_PORT, 10);
  }
  
  if (import.meta.env.VITE_HTTP_PORT) {
    config.httpPort = parseInt(import.meta.env.VITE_HTTP_PORT, 10);
  }
  
  return config;
}

/**
 * Validate and enforce HTTPS for a given URL
 */
export function enforceHttpsUrl(url: string): string {
  const config = getSecurityConfig();
  
  if (!config.enforceHttps) {
    return url;
  }
  
  try {
    const urlObj = new URL(url);
    
    // Check if host is allowed
    if (!isHostAllowed(urlObj.hostname, config.allowedHosts)) {
      throw new Error(`Host not allowed: ${urlObj.hostname}`);
    }
    
    // Force HTTPS if not already secure
    if (urlObj.protocol === 'http:') {
      urlObj.protocol = 'https:';
      
      // Update port if it's the default HTTP port
      if (urlObj.port === '80' || urlObj.port === config.httpPort.toString()) {
        urlObj.port = config.httpsPort === 443 ? '' : config.httpsPort.toString();
      }
      
    }
    
    return urlObj.toString();
  } catch (error) {
    console.error('🚨 Invalid URL for HTTPS enforcement:', url, error);
    throw new Error(`Invalid URL: ${url}`);
  }
}

/**
 * Check if a hostname is in the allowed list
 */
function isHostAllowed(hostname: string, allowedHosts: string[]): boolean {
  return allowedHosts.some(allowed => {
    if (allowed.startsWith('*.')) {
      // Wildcard subdomain matching
      const domain = allowed.slice(2);
      return hostname === domain || hostname.endsWith(`.${domain}`);
    }
    return hostname === allowed;
  });
}

/**
 * Validate URL protocol against security policy
 */
export function validateUrlProtocol(url: string): boolean {
  const config = getSecurityConfig();
  
  try {
    const urlObj = new URL(url);
    return config.allowedProtocols.includes(urlObj.protocol);
  } catch {
    return false;
  }
}

/**
 * Get secure base URL for API endpoints
 * Uses same-origin API calls when accessed remotely (e.g., via Tailscale)
 */
export function getSecureApiBaseUrl(): string {
  // In gateway mode (VITE_API_BASE_URL set), use the gateway URL even in dev
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  // In dev mode, use same-origin (empty string) so all API requests go
  // through the Vite dev proxy. This ensures remote access (SSH port
  // forwarding, Tailscale, LAN) works without forwarding the API port.
  if (import.meta.env.DEV) {
    return '';
  }

  // Production: use explicit env var
  const apiPort = import.meta.env.VITE_API_PORT;
  const candidates = [
    import.meta.env.VITE_API_BASE_URL,
    import.meta.env.VITE_API_NESTJS_BASE_URL,
    import.meta.env.VITE_BASE_URL && apiPort ? `${import.meta.env.VITE_BASE_URL}:${apiPort}` : null,
  ].filter(Boolean);

  if (candidates.length > 0) {
    return enforceHttpsUrl(candidates[0]);
  }

  if (!apiPort) {
    throw new Error(
      'API URL not configured. Set VITE_API_BASE_URL or VITE_API_PORT environment variable.',
    );
  }
  return enforceHttpsUrl(`http://localhost:${apiPort}`);
}

/**
 * Check if the current context is secure
 */
export function isSecureContext(): boolean {
  const config = getSecurityConfig();
  
  if (!config.requireSecureContext) {
    return true;
  }
  
  // Check if we're in a secure context (HTTPS, localhost, or file://)
  return window.isSecureContext || 
         window.location.protocol === 'https:' ||
         window.location.hostname === 'localhost' ||
         window.location.hostname === '127.0.0.1';
}

/**
 * Validate security context and throw if insecure
 */
export function validateSecureContext(): void {
  const config = getSecurityConfig();
  
  if (config.requireSecureContext && !isSecureContext()) {
    throw new Error(
      'Insecure context detected. This application requires HTTPS in production. ' +
      'Please access the application via HTTPS or configure VITE_REQUIRE_SECURE_CONTEXT=false for development.'
    );
  }
}

/**
 * Create secure headers for API requests
 */
export function getSecureHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  // Add security headers if in secure context
  if (isSecureContext()) {
    headers['X-Requested-With'] = 'XMLHttpRequest';
    headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    headers['Pragma'] = 'no-cache';
  }
  
  return headers;
}

/**
 * Security configuration validation
 */
export function validateSecurityConfig(): { valid: boolean; errors: string[] } {
  const config = getSecurityConfig();
  const errors: string[] = [];
  
  // Check if HTTPS is enforced in production
  if (import.meta.env.PROD && !config.enforceHttps) {
    errors.push('HTTPS should be enforced in production');
  }
  
  // Check if secure context is required in production
  if (import.meta.env.PROD && !config.requireSecureContext) {
    errors.push('Secure context should be required in production');
  }
  
  // Validate allowed hosts
  if (config.allowedHosts.length === 0) {
    errors.push('At least one allowed host must be configured');
  }
  
  // Validate ports
  if (config.httpsPort <= 0 || config.httpsPort > 65535) {
    errors.push('Invalid HTTPS port number');
  }
  
  if (config.httpPort <= 0 || config.httpPort > 65535) {
    errors.push('Invalid HTTP port number');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Log security configuration (for debugging)
 */
export function logSecurityConfig(): void {
  void getSecurityConfig();
  const validation = validateSecurityConfig();

  console.group('🔒 Security Configuration');

  if (!validation.valid) {
    // Security configuration has errors
  } else {
    // Security configuration is valid
  }

  console.groupEnd();
}
