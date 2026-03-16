/**
 * DOMPurify Sanitization Profiles
 * Enhanced configuration profiles for different input types and security levels
 */

import DOMPurify from 'dompurify';

// =====================================
// SANITIZATION PROFILE TYPES
// =====================================

export interface SanitizationProfile {
  name: string;
  description: string;
  config: DOMPurify.Config;
  allowedTags?: string[];
  allowedAttributes?: string[];
  forbiddenTags?: string[];
  forbiddenAttributes?: string[];
}

export type SanitizationLevel = 'strict' | 'moderate' | 'lenient' | 'custom';

export interface SanitizationOptions {
  level?: SanitizationLevel;
  profile?: string;
  customConfig?: Partial<DOMPurify.Config>;
  preserveWhitespace?: boolean;
  allowDataAttributes?: boolean;
  allowAriaAttributes?: boolean;
}

// =====================================
// PREDEFINED SANITIZATION PROFILES
// =====================================

export const SANITIZATION_PROFILES: Record<string, SanitizationProfile> = {
  // Ultra-strict: No HTML at all, plain text only
  strict: {
    name: 'strict',
    description: 'Ultra-strict sanitization - plain text only, no HTML allowed',
    config: {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true,
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
      SANITIZE_DOM: true,
      SANITIZE_NAMED_PROPS: true,
      FORBID_CONTENTS: ['script', 'style', 'iframe', 'object', 'embed'],
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    }
  },

  // Moderate: Basic formatting only
  moderate: {
    name: 'moderate',
    description: 'Moderate sanitization - basic text formatting allowed',
    allowedTags: ['b', 'i', 'em', 'strong', 'u', 'br', 'p', 'span'],
    allowedAttributes: ['class'],
    config: {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'br', 'p', 'span'],
      ALLOWED_ATTR: ['class'],
      KEEP_CONTENT: true,
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: true,
      SANITIZE_DOM: true,
      FORBID_CONTENTS: ['script', 'style', 'iframe', 'object', 'embed'],
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'href', 'src'],
    }
  },

  // Rich text: More formatting options for content editors
  richText: {
    name: 'richText',
    description: 'Rich text sanitization - comprehensive formatting for content editors',
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
      'p', 'br', 'hr', 'div', 'span',
      'b', 'i', 'u', 'em', 'strong', 'mark', 'small', 'del', 'ins', 'sub', 'sup',
      'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      'blockquote', 'pre', 'code',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td'
    ],
    allowedAttributes: ['class', 'id', 'style', 'title', 'alt'],
    config: {
      ALLOWED_TAGS: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
        'p', 'br', 'hr', 'div', 'span',
        'b', 'i', 'u', 'em', 'strong', 'mark', 'small', 'del', 'ins', 'sub', 'sup',
        'ul', 'ol', 'li', 'dl', 'dt', 'dd',
        'blockquote', 'pre', 'code',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td'
      ],
      ALLOWED_ATTR: ['class', 'id', 'style', 'title', 'alt'],
      KEEP_CONTENT: true,
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: true,
      SANITIZE_DOM: true,
      FORBID_CONTENTS: ['script', 'style', 'iframe', 'object', 'embed'],
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'a', 'link'],
      FORBID_ATTR: [
        'onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 
        'onchange', 'onsubmit', 'onkeydown', 'onkeyup', 'onkeypress',
        'href', 'src', 'action', 'formaction'
      ],
    }
  },

  // Email: For email content with links but no scripts
  email: {
    name: 'email',
    description: 'Email content sanitization - allows links but prevents XSS',
    allowedTags: [
      'p', 'br', 'div', 'span', 'a',
      'b', 'i', 'u', 'em', 'strong',
      'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
    ],
    allowedAttributes: ['href', 'class', 'style', 'title', 'target'],
    config: {
      ALLOWED_TAGS: [
        'p', 'br', 'div', 'span', 'a',
        'b', 'i', 'u', 'em', 'strong',
        'ul', 'ol', 'li',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
      ],
      ALLOWED_ATTR: ['href', 'class', 'style', 'title', 'target'],
      KEEP_CONTENT: true,
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: true,
      SANITIZE_DOM: true,
      FORBID_CONTENTS: ['script', 'style', 'iframe', 'object', 'embed'],
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
      FORBID_ATTR: [
        'onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur',
        'onchange', 'onsubmit', 'onkeydown', 'onkeyup', 'onkeypress'
      ],
    }
  },

  // API input: For API request sanitization
  apiInput: {
    name: 'apiInput',
    description: 'API input sanitization - removes all HTML and dangerous characters',
    config: {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true,
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
      SANITIZE_DOM: true,
      SANITIZE_NAMED_PROPS: true,
      FORBID_CONTENTS: ['script', 'style', 'iframe', 'object', 'embed'],
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
      USE_PROFILES: {
        html: false,
        svg: false,
        svgFilters: false,
        mathMl: false
      }
    }
  },

  // Search: For search queries
  search: {
    name: 'search',
    description: 'Search query sanitization - plain text with basic characters',
    config: {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true,
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
      SANITIZE_DOM: true,
      FORBID_CONTENTS: ['script', 'style', 'iframe', 'object', 'embed'],
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    }
  }
};

// =====================================
// SANITIZATION FUNCTIONS
// =====================================

/**
 * Enhanced sanitization function with profile support
 */
export function sanitizeWithProfile(
  value: unknown, 
  options: SanitizationOptions = {}
): { sanitized: unknown; wasModified: boolean; profile: string } {
  if (typeof value !== 'string' || !value) {
    return { sanitized: value, wasModified: false, profile: 'none' };
  }

  const originalValue = value;
  
  // Determine profile to use
  let profile: SanitizationProfile;
  
  if (options.profile && SANITIZATION_PROFILES[options.profile]) {
    profile = SANITIZATION_PROFILES[options.profile];
  } else {
    // Use level-based profile selection
    switch (options.level) {
      case 'strict':
        profile = SANITIZATION_PROFILES.strict;
        break;
      case 'moderate':
        profile = SANITIZATION_PROFILES.moderate;
        break;
      case 'lenient':
        profile = SANITIZATION_PROFILES.richText;
        break;
      default:
        profile = SANITIZATION_PROFILES.moderate;
    }
  }

  // Merge custom config if provided
  const finalConfig = options.customConfig 
    ? { ...profile.config, ...options.customConfig }
    : profile.config;

  // Apply additional options
  if (options.allowDataAttributes) {
    finalConfig.ALLOW_DATA_ATTR = true;
  }
  
  if (options.allowAriaAttributes) {
    finalConfig.ALLOW_ARIA_ATTR = true;
  }

  // Sanitize the input
  let sanitized: string;
  try {
    sanitized = DOMPurify.sanitize(value, finalConfig);
  } catch (error) {
    console.error('DOMPurify sanitization error:', error);
    // Fallback to strict sanitization
    sanitized = DOMPurify.sanitize(value, SANITIZATION_PROFILES.strict.config);
  }

  // Handle whitespace preservation
  if (options.preserveWhitespace && sanitized !== originalValue) {
    // Preserve line breaks and spaces
    sanitized = sanitized.replace(/\n/g, '<br>').replace(/ {2}/g, '&nbsp;&nbsp;');
  }

  return {
    sanitized,
    wasModified: sanitized !== originalValue,
    profile: profile.name
  };
}

/**
 * Sanitize for specific input types
 */
export const SanitizationHelpers = {
  /**
   * Generic sanitize string with profile options
   */
  sanitizeString(value: string, options: SanitizationOptions = {}): string {
    const result = sanitizeWithProfile(value, options).sanitized;
    return typeof result === 'string' ? result : '';
  },

  /**
   * Sanitize user input for API calls
   */
  forApiInput(value: string): string {
    const result = sanitizeWithProfile(value, { profile: 'apiInput' }).sanitized;
    return typeof result === 'string' ? result : '';
  },

  /**
   * Sanitize search queries
   */
  forSearch(value: string): string {
    const result = sanitizeWithProfile(value, { profile: 'search' }).sanitized;
    return typeof result === 'string' ? result : '';
  },

  /**
   * Sanitize email content
   */
  forEmail(value: string): string {
    const result = sanitizeWithProfile(value, { profile: 'email' }).sanitized;
    return typeof result === 'string' ? result : '';
  },

  /**
   * Sanitize rich text content
   */
  forRichText(value: string): string {
    const result = sanitizeWithProfile(value, { profile: 'richText' }).sanitized;
    return typeof result === 'string' ? result : '';
  },

  /**
   * Strict sanitization - plain text only
   */
  strict(value: string): string {
    const result = sanitizeWithProfile(value, { profile: 'strict' }).sanitized;
    return typeof result === 'string' ? result : '';
  },

  /**
   * Moderate sanitization - basic formatting
   */
  moderate(value: string): string {
    const result = sanitizeWithProfile(value, { profile: 'moderate' }).sanitized;
    return typeof result === 'string' ? result : '';
  },

  /**
   * Batch sanitize multiple values with the same profile
   */
  batch(values: Record<string, unknown>, options: SanitizationOptions = {}): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === 'string') {
        sanitized[key] = sanitizeWithProfile(value, options).sanitized;
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  },

  /**
   * Deep sanitize nested objects
   */
  deep(obj: unknown, options: SanitizationOptions = {}): unknown {
    if (typeof obj === 'string') {
      return sanitizeWithProfile(obj, options).sanitized;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.deep(item, options));
    }
    
    if (obj && typeof obj === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = this.deep(value, options);
      }
      return sanitized;
    }
    
    return obj;
  }
};

// =====================================
// PROFILE MANAGEMENT
// =====================================

/**
 * Get available sanitization profiles
 */
export function getAvailableProfiles(): Array<{ name: string; description: string }> {
  return Object.values(SANITIZATION_PROFILES).map(profile => ({
    name: profile.name,
    description: profile.description
  }));
}

/**
 * Register a custom sanitization profile
 */
export function registerProfile(name: string, profile: SanitizationProfile): void {
  SANITIZATION_PROFILES[name] = profile;
}

/**
 * Get profile configuration
 */
export function getProfile(name: string): SanitizationProfile | null {
  return SANITIZATION_PROFILES[name] || null;
}

/**
 * Test sanitization with different profiles
 */
export function testSanitization(input: string): Record<string, { output: string; modified: boolean }> {
  const results: Record<string, { output: string; modified: boolean }> = {};
  
  for (const [profileName, _profile] of Object.entries(SANITIZATION_PROFILES)) {
    const result = sanitizeWithProfile(input, { profile: profileName });
    const sanitizedValue = result.sanitized;
    results[profileName] = {
      output: typeof sanitizedValue === 'string' ? sanitizedValue : '',
      modified: result.wasModified
    };
  }
  
  return results;
}
