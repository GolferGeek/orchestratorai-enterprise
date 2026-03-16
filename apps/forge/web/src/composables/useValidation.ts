/**
 * Core Validation Composable
 * Provides comprehensive input validation with security patterns
 */

import { ref, reactive, computed, onUnmounted, readonly } from 'vue';
import {
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationRule,
  ValidationContext,
  ValidationSchema,
  ValidationConfig,
  UseValidationOptions,
  UseValidationReturn,
  ValidationCodes,
  ValidationPatterns
} from '@/types/validation';
import { 
  sanitizeWithProfile, 
  SanitizationHelpers, 
  type SanitizationOptions 
} from '@/utils/sanitizationProfiles';

// =====================================
// DEFAULT CONFIGURATION
// =====================================

const DEFAULT_CONFIG: ValidationConfig = {
  strictMode: false,
  sanitizeInputs: true,
  validateOnChange: true,
  validateOnBlur: true,
  debounceMs: 300,
  maxValidationTime: 5000,
  logValidationErrors: true,
  enableAsyncValidation: true,
};

// =====================================
// VALIDATION UTILITIES
// =====================================

/**
 * Check for common security patterns
 */
function detectSecurityIssues(value: string): ValidationError[] {
  const errors: ValidationError[] = [];

  // XSS patterns
  const xssPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe[^>]*>/gi,
    /eval\s*\(/gi,
  ];

  for (const pattern of xssPatterns) {
    if (pattern.test(value)) {
      errors.push({
        field: 'security',
        code: ValidationCodes.XSS_DETECTED,
        message: 'Potentially malicious script detected',
        severity: 'critical',
        context: { pattern: pattern.toString() }
      });
      break; // Don't report multiple XSS issues
    }
  }

  // SQL injection patterns - improved to catch more variations
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
    /(UNION\s+SELECT)/gi,
    /(';\s*(DROP|DELETE|INSERT|UPDATE|EXEC))/gi,
    /('\s*(OR|AND)\s*['"]?\d+['"]?\s*=\s*['"]?\d+)/gi, // ' OR '1'='1 or ' OR 1=1
    /('\s*(OR|AND)\s*['"]?[a-z]+['"]?\s*=\s*['"]?[a-z]+)/gi, // ' OR 'a'='a
    /(--|\|\||\/\*|\*\/|#)/g, // Comment injection
    /('--)/g, // admin'--
  ];

  for (const pattern of sqlPatterns) {
    if (pattern.test(value)) {
      errors.push({
        field: 'security',
        code: ValidationCodes.SQL_INJECTION,
        message: 'Potential SQL injection detected',
        severity: 'critical',
        context: { pattern: pattern.toString() }
      });
      break;
    }
  }

  // Path traversal - improved to catch URL-encoded versions
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

  for (const pattern of pathTraversalPatterns) {
    if (pattern.test(value)) {
      errors.push({
        field: 'security',
        code: ValidationCodes.PATH_TRAVERSAL,
        message: 'Path traversal attempt detected',
        severity: 'critical',
        context: { pattern: pattern.toString() }
      });
      break;
    }
  }

  return errors;
}

/**
 * Validate regex pattern safety
 */
function validateRegexPattern(pattern: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  
  try {
    const regex = new RegExp(pattern);
    
    // Check for catastrophic backtracking patterns
    const dangerousPatterns = [
      /\(\?!\.\*\)\+/,  // Negative lookahead with quantifiers
      /\(\.\*\)\+\(\.\*\)\+/, // Multiple greedy quantifiers
      /\(\w\+\)\+\$/, // Nested quantifiers at end
    ];
    
    for (const dangerous of dangerousPatterns) {
      if (dangerous.test(pattern)) {
        warnings.push({
          field: 'pattern',
          code: 'REGEX_PERFORMANCE',
          message: 'Pattern may cause performance issues',
          suggestion: 'Consider simplifying the regex pattern'
        });
        break;
      }
    }
    
    // Test regex execution time with sample input
    const testString = 'a'.repeat(1000);
    const startTime = Date.now();
    try {
      regex.test(testString);
      const executionTime = Date.now() - startTime;
      
      if (executionTime > 100) {
        warnings.push({
          field: 'pattern',
          code: 'REGEX_SLOW',
          message: `Regex execution took ${executionTime}ms`,
          suggestion: 'Pattern may be too complex'
        });
      }
    } catch (regexError) {
      // Regex caused an error during execution
      errors.push({
        field: 'pattern',
        code: ValidationCodes.REGEX_INVALID,
        message: 'Regex pattern causes runtime error',
        severity: 'error',
        context: { error: regexError instanceof Error ? regexError.message : String(regexError) }
      });
    }
    
  } catch (syntaxError) {
    errors.push({
      field: 'pattern',
      code: ValidationCodes.REGEX_INVALID,
      message: 'Invalid regex syntax',
      severity: 'error',
      context: { error: syntaxError instanceof Error ? syntaxError.message : String(syntaxError) }
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    metadata: {
      validatedAt: new Date().toISOString(),
      validationTime: 0,
      rules: ['regex-safety'],
      sanitizationApplied: false
    }
  };
}

// =====================================
// BUILT-IN VALIDATION RULES
// =====================================

export const ValidationRules = {
  required: (message = 'This field is required'): ValidationRule => ({
    name: 'required',
    priority: 1,
    description: 'Field must have a value',
    validator: (value: unknown) => ({
      isValid: value !== null && value !== undefined && value !== '',
      errors: !value ? [{
        field: 'required',
        code: ValidationCodes.REQUIRED,
        message,
        severity: 'error' as const
      }] : [],
      warnings: []
    })
  }),

  minLength: (min: number, message?: string): ValidationRule => ({
    name: 'minLength',
    priority: 2,
    description: `Minimum length of ${min} characters`,
    validator: (value: unknown) => {
      const strValue = typeof value === 'string' ? value : '';
      return {
        isValid: !strValue || strValue.length >= min,
        errors: strValue && strValue.length < min ? [{
          field: 'minLength',
          code: ValidationCodes.MIN_LENGTH,
          message: message || `Must be at least ${min} characters`,
          severity: 'error' as const,
          context: { min, actual: strValue.length }
        }] : [],
        warnings: []
      };
    }
  }),

  maxLength: (max: number, message?: string): ValidationRule => ({
    name: 'maxLength',
    priority: 2,
    description: `Maximum length of ${max} characters`,
    validator: (value: unknown) => {
      const strValue = typeof value === 'string' ? value : '';
      return {
        isValid: !strValue || strValue.length <= max,
        errors: strValue && strValue.length > max ? [{
          field: 'maxLength',
          code: ValidationCodes.MAX_LENGTH,
          message: message || `Must not exceed ${max} characters`,
          severity: 'error' as const,
          context: { max, actual: strValue.length }
        }] : [],
        warnings: []
      };
    }
  }),

  pattern: (regex: RegExp, message?: string): ValidationRule => ({
    name: 'pattern',
    priority: 3,
    description: `Must match pattern: ${regex.toString()}`,
    validator: (value: unknown) => {
      const strValue = typeof value === 'string' ? value : '';
      return {
        isValid: !strValue || regex.test(strValue),
        errors: strValue && !regex.test(strValue) ? [{
          field: 'pattern',
          code: ValidationCodes.PATTERN_MISMATCH,
          message: message || 'Invalid format',
          severity: 'error' as const,
          context: { pattern: regex.toString() }
        }] : [],
        warnings: []
      };
    }
  }),

  email: (message = 'Invalid email format'): ValidationRule => ({
    name: 'email',
    priority: 3,
    description: 'Valid email address format',
    validator: (value: unknown) => {
      const strValue = typeof value === 'string' ? value : '';
      return {
        isValid: !strValue || ValidationPatterns.EMAIL.test(strValue),
        errors: strValue && !ValidationPatterns.EMAIL.test(strValue) ? [{
          field: 'email',
          code: ValidationCodes.INVALID_FORMAT,
          message,
          severity: 'error' as const
        }] : [],
        warnings: []
      };
    }
  }),

  regexPattern: (_message = 'Invalid regex pattern'): ValidationRule => ({
    name: 'regexPattern',
    priority: 4,
    description: 'Valid regex pattern',
    validator: (value: unknown) => {
      const strValue = typeof value === 'string' ? value : '';
      if (!strValue) return { isValid: true, errors: [], warnings: [] };
      return validateRegexPattern(strValue);
    }
  }),

  security: (options?: {
    enableXSSProtection?: boolean;
    enableSQLInjectionProtection?: boolean;
    enablePathTraversalProtection?: boolean;
    message?: string;
  }): ValidationRule => ({
    name: 'security',
    priority: 0, // Highest priority
    description: 'Security validation',
    validator: (value: unknown) => {
      const strValue = typeof value === 'string' ? value : '';
      if (!strValue) return { isValid: true, errors: [], warnings: [] };

      // If no options provided, enable all protections
      const enableAll = !options || (!options.enableXSSProtection && !options.enableSQLInjectionProtection && !options.enablePathTraversalProtection);
      const enableXSS = enableAll || options?.enableXSSProtection;
      const enableSQL = enableAll || options?.enableSQLInjectionProtection;
      const enablePath = enableAll || options?.enablePathTraversalProtection;

      const allErrors = detectSecurityIssues(strValue);

      // Filter errors based on enabled protections
      const errors = allErrors.filter(error => {
        if (error.code === ValidationCodes.XSS_DETECTED && !enableXSS) return false;
        if (error.code === ValidationCodes.SQL_INJECTION && !enableSQL) return false;
        if (error.code === ValidationCodes.PATH_TRAVERSAL && !enablePath) return false;
        return true;
      });

      return {
        isValid: errors.length === 0,
        errors,
        warnings: []
      };
    }
  }),

  sanitize: (options?: SanitizationOptions): ValidationRule => ({
    name: 'sanitize',
    priority: 10, // Low priority, runs after other validations
    description: `Sanitize input for security${options?.profile ? ` (${options.profile} profile)` : ''}`,
    validator: (value: unknown) => {
      const result = sanitizeWithProfile(value, options || { profile: 'moderate' });
      return {
        isValid: true,
        errors: [],
        warnings: result.wasModified ? [{
          field: 'sanitization',
          code: 'CONTENT_MODIFIED',
          message: 'Input was sanitized for security',
          severity: 'info' as const,
          context: { 
            profile: result.profile,
            originalLength: typeof value === 'string' ? value.length : 0,
            sanitizedLength: typeof result.sanitized === 'string' ? result.sanitized.length : 0
          }
        }] : [],
        sanitizedValue: result.sanitized,
        metadata: {
          validatedAt: new Date().toISOString(),
          validationTime: 0,
          rules: ['sanitize'],
          sanitizationApplied: result.wasModified,
          sanitizationProfile: result.profile
        }
      };
    }
  }),

  // Specialized sanitization rules for different input types
  sanitizeApiInput: (): ValidationRule => ({
    name: 'sanitizeApiInput',
    priority: 10,
    description: 'Sanitize input for API calls (strict)',
    validator: (value: unknown) => {
      const strValue = typeof value === 'string' ? value : '';
      const sanitized = SanitizationHelpers.forApiInput(strValue);
      return {
        isValid: true,
        errors: [],
        warnings: [],
        sanitizedValue: sanitized,
        metadata: {
          validatedAt: new Date().toISOString(),
          validationTime: 0,
          rules: ['sanitizeApiInput'],
          sanitizationApplied: sanitized !== strValue,
          sanitizationProfile: 'apiInput'
        }
      };
    }
  }),

  sanitizeSearch: (): ValidationRule => ({
    name: 'sanitizeSearch',
    priority: 10,
    description: 'Sanitize search query input',
    validator: (value: unknown) => {
      const strValue = typeof value === 'string' ? value : '';
      const sanitized = SanitizationHelpers.forSearch(strValue);
      return {
        isValid: true,
        errors: [],
        warnings: [],
        sanitizedValue: sanitized,
        metadata: {
          validatedAt: new Date().toISOString(),
          validationTime: 0,
          rules: ['sanitizeSearch'],
          sanitizationApplied: sanitized !== strValue,
          sanitizationProfile: 'search'
        }
      };
    }
  }),

  sanitizeRichText: (): ValidationRule => ({
    name: 'sanitizeRichText',
    priority: 10,
    description: 'Sanitize rich text content (allows formatting)',
    validator: (value: unknown) => {
      const strValue = typeof value === 'string' ? value : '';
      const sanitized = SanitizationHelpers.forRichText(strValue);
      return {
        isValid: true,
        errors: [],
        warnings: [],
        sanitizedValue: sanitized,
        metadata: {
          validatedAt: new Date().toISOString(),
          validationTime: 0,
          rules: ['sanitizeRichText'],
          sanitizationApplied: sanitized !== strValue,
          sanitizationProfile: 'richText'
        }
      };
    }
  }),

  detectPII: (options?: { mode?: 'error' | 'warning' }): ValidationRule => ({
    name: 'detectPII',
    priority: 5,
    description: 'Detect potential PII (Personally Identifiable Information)',
    validator: (value: unknown) => {
      const strValue = typeof value === 'string' ? value : '';
      if (!strValue) return { isValid: true, errors: [], warnings: [] };

      const piiPatterns = [
        { type: 'email', pattern: ValidationPatterns.EMAIL },
        { type: 'phone', pattern: ValidationPatterns.PHONE },
        { type: 'ssn', pattern: /\b\d{3}-?\d{2}-?\d{4}\b/ },
        { type: 'credit_card', pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/ },
      ];

      const detected: Array<{type: string; match: string}> = [];
      for (const { type, pattern } of piiPatterns) {
        const matches = strValue.match(new RegExp(pattern, 'g'));
        if (matches) {
          matches.forEach(match => detected.push({ type, match }));
        }
      }

      const mode = options?.mode || 'warning';
      if (detected.length === 0) {
        return { isValid: true, errors: [], warnings: [] };
      }

      const message = `Detected potential PII: ${detected.map(d => d.type).join(', ')}`;
      const piiItem = {
        field: 'pii',
        code: ValidationCodes.PII_DETECTED,
        message,
        context: { detected }
      };

      if (mode === 'error') {
        return {
          isValid: false,
          errors: [{ ...piiItem, severity: 'error' as const }],
          warnings: []
        };
      } else {
        return {
          isValid: true,
          errors: [],
          warnings: [{ ...piiItem, severity: 'warning' as const, suggestion: 'Consider sanitizing PII before processing' }]
        };
      }
    }
  }),
};

// =====================================
// MAIN COMPOSABLE
// =====================================

export function useValidation(options: UseValidationOptions = {}): UseValidationReturn {
  const config = reactive({ ...DEFAULT_CONFIG, ...options.config });
  const schema = ref<ValidationSchema>(options.schema || {});
  
  // State
  const errors = ref<Record<string, ValidationError[]>>({});
  const warnings = ref<Record<string, ValidationWarning[]>>({});
  const isValidating = ref<Record<string, boolean>>({});
  
  // Computed
  const isValid = computed(() => {
    return Object.values(errors.value).every(fieldErrors => fieldErrors.length === 0);
  });
  
  // Validation timeout tracking
  const validationTimeouts = new Map<string, NodeJS.Timeout>();
  
  /**
   * Validate a single field
   */
  async function validate(field: string, value: unknown, context?: ValidationContext): Promise<ValidationResult> {
    // Clear existing timeout
    if (validationTimeouts.has(field)) {
      clearTimeout(validationTimeouts.get(field)!);
    }
    
    // Set validating state
    isValidating.value[field] = true;
    
    const startTime = Date.now();
    const fieldRules = schema.value[field] || [];
    const allErrors: ValidationError[] = [];
    const allWarnings: ValidationWarning[] = [];
    let sanitizedValue = value;
    let sanitizationApplied = false;
    
    try {
      // Sort rules by priority
      const sortedRules = [...fieldRules].sort((a, b) => a.priority - b.priority);
      
      // Execute validation rules
      for (const rule of sortedRules) {
        const validationContext: ValidationContext = {
          field,
          component: context?.component,
          user: context?.user,
          ...context
        };
        
        try {
          const result = rule.validator(value, validationContext);
          
          if (result.errors) {
            allErrors.push(...result.errors);
          }
          
          if (result.warnings) {
            allWarnings.push(...result.warnings);
          }
          
          if (result.sanitizedValue !== undefined) {
            sanitizedValue = result.sanitizedValue;
            sanitizationApplied = true;
          }
          
          // Stop on critical errors
          if (result.errors?.some(err => err.severity === 'critical')) {
            break;
          }
        } catch (ruleError) {
          allErrors.push({
            field,
            code: 'VALIDATION_ERROR',
            message: `Validation rule "${rule.name}" failed`,
            severity: 'error',
            context: { error: ruleError instanceof Error ? ruleError.message : String(ruleError) }
          });
        }
      }
      
      // Update state
      errors.value[field] = allErrors;
      warnings.value[field] = allWarnings;
      
      const validationTime = Date.now() - startTime;
      
      // Log validation if enabled
      if (config.logValidationErrors && allErrors.length > 0) {
        // Validation errors detected
      }

      return {
        isValid: allErrors.length === 0,
        errors: allErrors,
        warnings: allWarnings,
        sanitizedValue,
        metadata: {
          validatedAt: new Date().toISOString(),
          validationTime,
          rules: sortedRules.map(r => r.name),
          sanitizationApplied
        }
      };
      
    } finally {
      isValidating.value[field] = false;
    }
  }
  
  /**
   * Validate all fields in a form
   */
  async function validateAll(form: Record<string, unknown>): Promise<Record<string, ValidationResult>> {
    const results: Record<string, ValidationResult> = {};
    
    // Validate all fields in parallel
    const validationPromises = Object.entries(form).map(async ([field, value]) => {
      const result = await validate(field, value);
      results[field] = result;
      return { field, result };
    });
    
    await Promise.all(validationPromises);
    return results;
  }
  
  /**
   * Clear validation errors for a field or all fields
   */
  function clearErrors(field?: string): void {
    if (field) {
      delete errors.value[field];
    } else {
      errors.value = {};
    }
  }
  
  /**
   * Clear validation warnings for a field or all fields
   */
  function clearWarnings(field?: string): void {
    if (field) {
      delete warnings.value[field];
    } else {
      warnings.value = {};
    }
  }
  
  /**
   * Add a validation rule to a field
   */
  function addRule(field: string, rule: ValidationRule): void {
    if (!schema.value[field]) {
      schema.value[field] = [];
    }
    
    // Remove existing rule with same name
    schema.value[field] = schema.value[field].filter(r => r.name !== rule.name);
    
    // Add new rule
    schema.value[field].push(rule);
  }
  
  /**
   * Remove a validation rule from a field
   */
  function removeRule(field: string, ruleName: string): void {
    if (schema.value[field]) {
      schema.value[field] = schema.value[field].filter(r => r.name !== ruleName);
    }
  }
  
  // Cleanup on unmount
  onUnmounted(() => {
    // Clear all timeouts
    validationTimeouts.forEach(timeout => clearTimeout(timeout));
    validationTimeouts.clear();
    
    // Reset state if configured
    if (options.resetOnUnmount) {
      errors.value = {};
      warnings.value = {};
      isValidating.value = {};
    }
  });
  
  return {
    validate,
    validateAll,
    clearErrors,
    clearWarnings,
    addRule,
    removeRule,
    errors: readonly(errors) as unknown as Readonly<Record<string, ValidationError[]>>,
    warnings: readonly(warnings) as unknown as Readonly<Record<string, ValidationWarning[]>>,
    isValidating: readonly(isValidating) as unknown as Readonly<Record<string, boolean>>,
    isValid: readonly(isValid) as unknown as Readonly<boolean>,
  };
}

// =====================================
// SPECIALIZED COMPOSABLES
// =====================================

/**
 * Composable for PII input validation
 */
export function usePIIValidation() {
  const validation = useValidation({
    config: {
      sanitizeInputs: true,
      validateOnChange: true,
      strictMode: true,
    }
  });
  
  // Add PII-specific rules
  validation.addRule('text', ValidationRules.required('Text input is required'));
  validation.addRule('text', ValidationRules.minLength(10, 'Text must be at least 10 characters for meaningful PII detection'));
  validation.addRule('text', ValidationRules.maxLength(50000, 'Text input too large'));
  validation.addRule('text', ValidationRules.security());
  validation.addRule('text', ValidationRules.sanitize());
  
  return validation;
}

/**
 * Composable for regex pattern validation
 */
export function useRegexValidation() {
  const validation = useValidation({
    config: {
      validateOnChange: false,
      validateOnBlur: true,
    }
  });
  
  validation.addRule('pattern', ValidationRules.required('Regex pattern is required'));
  validation.addRule('pattern', ValidationRules.regexPattern());
  validation.addRule('pattern', ValidationRules.maxLength(1000, 'Pattern too complex'));
  
  return validation;
}

/**
 * Composable for form input validation
 */
export function useFormValidation(schema?: ValidationSchema) {
  return useValidation({
    schema,
    config: {
      validateOnChange: true,
      validateOnBlur: true,
      sanitizeInputs: true,
    }
  });
}
