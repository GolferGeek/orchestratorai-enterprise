/**
 * Validation Helper Utilities
 * Common validation functions and utilities
 */

import { ValidationPatterns, ValidationCodes } from '@/types/validation';

// =====================================
// STRING VALIDATION HELPERS
// =====================================

/**
 * Check if string contains only safe characters
 */
export function isSafeString(value: string): boolean {
  return ValidationPatterns.SAFE_STRING.test(value);
}

/**
 * Check if string is a valid email
 */
export function isValidEmail(email: string): boolean {
  return ValidationPatterns.EMAIL.test(email);
}

/**
 * Check if string is a valid URL
 */
export function isValidUrl(url: string): boolean {
  return ValidationPatterns.URL.test(url);
}

/**
 * Check if string is a valid phone number
 */
export function isValidPhone(phone: string): boolean {
  return ValidationPatterns.PHONE.test(phone);
}

/**
 * Validate string length within bounds
 */
export function isValidLength(value: string, min: number, max?: number): boolean {
  if (value.length < min) return false;
  if (max !== undefined && value.length > max) return false;
  return true;
}

// =====================================
// REGEX VALIDATION HELPERS
// =====================================

/**
 * Test if a regex pattern is valid
 */
export function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/**
 * Test regex pattern performance
 */
export function testRegexPerformance(pattern: string, testString = 'a'.repeat(1000)): number {
  if (!isValidRegex(pattern)) return -1;
  
  const regex = new RegExp(pattern);
  const startTime = performance.now();
  
  try {
    regex.test(testString);
    return performance.now() - startTime;
  } catch {
    return -1;
  }
}

/**
 * Check for dangerous regex patterns
 */
export function isDangerousRegex(pattern: string): boolean {
  const dangerousPatterns = [
    /\([^)]*\+\)\+/,  // Nested quantifiers like (a+)+
    /\([^)]*\*\)\*/,  // Nested star quantifiers like (.*)*
    /\(.*\|.*\)\*/,  // Alternation with quantifier like (a|b)*
    /\([^)]+\)\*$/,  // Quantifier at end like ([a-zA-Z]+)*
    /\([^)]+\{[^}]+\}\)\+/,  // Nested counted quantifiers like (a{1,10})+
    /\(\?!.*\)\+/,  // Negative lookahead with quantifiers
    /\(\?:.\+\)\+/, // Non-capturing group with nested quantifiers
  ];

  return dangerousPatterns.some(dangerous => dangerous.test(pattern));
}

// =====================================
// SECURITY VALIDATION HELPERS
// =====================================

/**
 * Check for XSS patterns
 */
export function containsXSS(value: string): boolean {
  const xssPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe[^>]*>/gi,
    /eval\s*\(/gi,
    /<object[^>]*>/gi,
    /<embed[^>]*>/gi,
    /expression\s*\(/gi,
  ];
  
  return xssPatterns.some(pattern => pattern.test(value));
}

/**
 * Check for SQL injection patterns
 */
export function containsSQLInjection(value: string): boolean {
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
    /(UNION\s+SELECT)/gi,
    /(';\s*(DROP|DELETE|INSERT|UPDATE|EXEC))/gi,
    /('\s*(OR|AND)\s*['"]?\d+['"]?\s*=\s*['"]?\d+)/gi, // ' OR '1'='1 or ' OR 1=1
    /('\s*(OR|AND)\s*['"]?[a-z]+['"]?\s*=\s*['"]?[a-z]+)/gi, // ' OR 'a'='a
    /(--|\|\||\/\*|\*\/|#)/g, // Comment injection
    /('--)/g, // admin'--
    /(WAITFOR\s+DELAY)/gi,
    /(CONVERT\s*\()/gi,
  ];

  return sqlPatterns.some(pattern => pattern.test(value));
}

/**
 * Check for path traversal attempts
 */
export function containsPathTraversal(value: string): boolean {
  const pathTraversalPatterns = [
    /\.\.[/\\]/,
    /%2e%2e%2f/gi, // URL-encoded ../
    /%2e%2e[/\\]/gi,
    /\.\.%2f/gi,
    /\.\.%5c/gi,
    /\.\.%252f/gi, // Double-encoded
    /\.\.%c0%af/gi, // UTF-8 encoded
    /\.\.\\/,
  ];

  return pathTraversalPatterns.some(pattern => pattern.test(value));
}

/**
 * Check for command injection patterns
 */
export function containsCommandInjection(value: string): boolean {
  const commandPatterns = [
    /[;&|`$()]/,
    /\b(cat|ls|dir|type|copy|del|rm|mv|cp)\b/gi,
    /\|\s*\w+/,
    /&&\s*\w+/,
    /;\s*\w+/,
  ];
  
  return commandPatterns.some(pattern => pattern.test(value));
}

// =====================================
// PII VALIDATION HELPERS
// =====================================

/**
 * Check if string contains potential PII patterns
 */
export function containsPotentialPII(value: string): boolean {
  const piiPatterns = [
    ValidationPatterns.SSN,
    ValidationPatterns.CREDIT_CARD,
    ValidationPatterns.EMAIL,
    ValidationPatterns.PHONE,
    /\b\d{3}-?\d{2}-?\d{4}\b/, // SSN variations
    /\b[A-Z]{2}\d{6,8}\b/, // Government ID patterns
    /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // Credit card
  ];
  
  return piiPatterns.some(pattern => pattern.test(value));
}

/**
 * Extract potential PII matches from text
 */
export function extractPIIMatches(value: string): Array<{ type: string; match: string; start: number; end: number }> {
  const matches: Array<{ type: string; match: string; start: number; end: number }> = [];
  
  const patterns = [
    { type: 'email', pattern: /[^\s@]+@[^\s@]+\.[^\s@]+/ }, // Remove anchors for text extraction
    { type: 'phone', pattern: /\b\d{3}-\d{3}-\d{4}\b|\b\(\d{3}\)\s?\d{3}-\d{4}\b|\b\d{3}\.\d{3}\.\d{4}\b/ }, // More specific phone patterns
    { type: 'ssn', pattern: /\b\d{3}-?\d{2}-?\d{4}\b/ }, // Remove anchors
    { type: 'credit_card', pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/ }, // Remove anchors
  ];
  
  patterns.forEach(({ type, pattern }) => {
    const regex = new RegExp(pattern, 'g');
    let match;
    
    while ((match = regex.exec(value)) !== null) {
      matches.push({
        type,
        match: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  });
  
  return matches.sort((a, b) => a.start - b.start);
}

// =====================================
// INPUT SANITIZATION HELPERS
// =====================================

/**
 * Basic HTML sanitization
 */
export function sanitizeHTML(value: string): string {
  return value
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Remove dangerous characters
 */
export function removeDangerousChars(value: string): string {
  return value.replace(/[<>"'&]/g, '');
}

/**
 * Normalize whitespace
 */
export function normalizeWhitespace(value: string): string {
  return value
    .replace(/[ \t]+/g, ' ') // Multiple spaces/tabs to single space
    .replace(/\n\s*\n/g, '\n') // Multiple newlines to single newline
    .replace(/\s+$/gm, '') // Remove trailing whitespace from each line
    .trim();
}

/**
 * Remove control characters
 */
export function removeControlChars(value: string): string {
  // Remove control characters (0-31 and 127) using string manipulation
  return value.split('').filter(char => {
    const code = char.charCodeAt(0);
    return !(code <= 31 || code === 127);
  }).join('');
}

// =====================================
// VALIDATION MESSAGE HELPERS
// =====================================

/**
 * Generate user-friendly validation message
 */
export function getValidationMessage(code: string, context?: Record<string, unknown>): string {
  const messages: Record<string, string> = {
    [ValidationCodes.REQUIRED]: 'This field is required',
    [ValidationCodes.MIN_LENGTH]: context?.min ? `Must be at least ${context.min} characters` : 'Too short',
    [ValidationCodes.MAX_LENGTH]: context?.max ? `Must not exceed ${context.max} characters` : 'Too long',
    [ValidationCodes.PATTERN_MISMATCH]: 'Invalid format',
    [ValidationCodes.INVALID_FORMAT]: 'Invalid format',
    [ValidationCodes.SECURITY_VIOLATION]: 'Security violation detected',
    [ValidationCodes.PII_DETECTED]: 'Potential PII detected',
    [ValidationCodes.REGEX_INVALID]: 'Invalid regular expression',
    [ValidationCodes.XSS_DETECTED]: 'Potentially malicious content detected',
    [ValidationCodes.SQL_INJECTION]: 'Potential SQL injection detected',
    [ValidationCodes.PATH_TRAVERSAL]: 'Path traversal attempt detected',
  };
  
  return messages[code] || 'Validation error';
}

/**
 * Get validation severity color
 */
export function getValidationSeverityColor(severity: 'error' | 'critical' | 'warning'): string {
  const colors = {
    critical: '#dc2626', // red-600
    error: '#ea580c', // orange-600
    warning: '#d97706', // amber-600
  };
  
  return colors[severity] || colors.error;
}

/**
 * Get validation status icon
 */
export function getValidationStatusIcon(status: 'valid' | 'error' | 'warning' | 'critical' | 'validating'): string {
  const icons = {
    valid: 'checkmark-circle',
    error: 'alert-circle',
    warning: 'warning',
    critical: 'alert',
    validating: 'sync',
  };
  
  return icons[status] || icons.error;
}

// =====================================
// DEBOUNCING HELPERS
// =====================================

/**
 * Create a debounced validation function
 */
export function createDebouncedValidator<T extends (...args: unknown[]) => unknown>(
  validator: T,
  delay: number
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  let timeoutId: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return new Promise((resolve) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        resolve(validator(...args) as ReturnType<T>);
      }, delay);
    });
  };
}

// =====================================
// VALIDATION RULE BUILDERS
// =====================================

/**
 * Build a chain of validation rules
 */
export function buildValidationChain() {
  const rules: Array<(value: unknown) => boolean | string> = [];
  
  const chain = {
    required(message = 'This field is required') {
      rules.push((value: unknown) => {
        return value !== null && value !== undefined && value !== '' || message;
      });
      return chain;
    },
    
    minLength(min: number, message?: string) {
      rules.push((value: unknown) => {
        const str = value as string;
        return !str || str.length >= min || message || `Must be at least ${min} characters`;
      });
      return chain;
    },
    
    maxLength(max: number, message?: string) {
      rules.push((value: unknown) => {
        const str = value as string;
        return !str || str.length <= max || message || `Must not exceed ${max} characters`;
      });
      return chain;
    },
    
    pattern(regex: RegExp, message = 'Invalid format') {
      rules.push((value: unknown) => {
        const str = value as string;
        return !str || regex.test(str) || message;
      });
      return chain;
    },
    
    email(message = 'Invalid email format') {
      rules.push((value: unknown) => {
        const str = value as string;
        return !str || isValidEmail(str) || message;
      });
      return chain;
    },
    
    secure(message = 'Security violation detected') {
      rules.push((value: unknown) => {
        const str = value as string;
        return !str || (!containsXSS(str) && !containsSQLInjection(str) && !containsPathTraversal(str)) || message;
      });
      return chain;
    },
    
    build() {
      return rules;
    }
  };
  
  return chain;
}

// =====================================
// EXPORT VALIDATION UTILITIES
// =====================================

export const ValidationHelpers = {
  // String validation
  isSafeString,
  isValidEmail,
  isValidUrl,
  isValidPhone,
  isValidLength,
  
  // Regex validation
  isValidRegex,
  testRegexPerformance,
  isDangerousRegex,
  
  // Security validation
  containsXSS,
  containsSQLInjection,
  containsPathTraversal,
  containsCommandInjection,
  
  // PII validation
  containsPotentialPII,
  extractPIIMatches,
  
  // Sanitization
  sanitizeHTML,
  removeDangerousChars,
  normalizeWhitespace,
  removeControlChars,
  
  // Messages and UI
  getValidationMessage,
  getValidationSeverityColor,
  getValidationStatusIcon,
  
  // Utilities
  createDebouncedValidator,
  buildValidationChain,
};
