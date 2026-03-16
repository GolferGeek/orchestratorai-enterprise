/**
 * Frontend Input Validation Types
 * Comprehensive type definitions for secure input validation
 */

// Simplified types to avoid infinite type instantiation with JsonObject/JsonValue
type JsonValue = string | number | boolean | null | Record<string, unknown> | unknown[];
type JsonObject = Record<string, unknown>;

// =====================================
// CORE VALIDATION TYPES
// =====================================

export interface ValidationResult<TValue = unknown> {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  sanitizedValue?: TValue;
  metadata?: ValidationMetadata;
}

export interface ValidationError {
  field: string;
  code: string;
  message: string;
  severity: 'error' | 'critical';
  context?: JsonObject;
}

export interface ValidationWarning {
  field: string;
  code: string;
  message: string;
  suggestion?: string;
}

export interface ValidationMetadata {
  validatedAt: string;
  validationTime: number;
  rules: string[];
  sanitizationApplied: boolean;
}

// =====================================
// VALIDATION RULES
// =====================================

export interface ValidationRule<TValue = unknown> {
  name: string;
  validator: (value: TValue, context?: ValidationContext) => ValidationResult<TValue>;
  async?: boolean;
  priority: number;
  description: string;
}

export interface ValidationContext {
  field: string;
  form?: JsonObject;
  component?: string;
  user?: {
    role: string;
    permissions: string[];
  };
}

export interface ValidationSchema {
  [field: string]: ValidationRule[];
}

// =====================================
// FORM INPUT TYPES
// =====================================

export interface BaseFormInput<TValue = unknown> {
  id?: string;
  value: TValue;
  required?: boolean;
  disabled?: boolean;
  readonly?: boolean;
}

export interface TextInput extends BaseFormInput<string> {
  value: string;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  trim?: boolean;
  allowEmpty?: boolean;
}

export interface NumericInput extends BaseFormInput<number> {
  value: number;
  min?: number;
  max?: number;
  integer?: boolean;
  precision?: number;
}

export interface EmailInput extends BaseFormInput<string> {
  value: string;
  allowInternational?: boolean;
  requireTLD?: boolean;
}

export interface RegexInput extends BaseFormInput<string> {
  value: string;
  testString?: string;
  flags?: string;
  maxComplexity?: number;
}

// =====================================
// PII-SPECIFIC VALIDATION
// =====================================

export interface PIIFormInput {
  text: string;
  detectPII?: boolean;
  sanitizeOutput?: boolean;
  allowedPatterns?: string[];
  blockedPatterns?: string[];
}

export interface PIIPatternInput {
  name: string;
  pattern: string;
  dataType: string;
  description: string;
  flags: string;
  testString?: string;
}

export interface PseudonymInput {
  originalValue: string;
  pseudonymType: string;
  context?: string;
  preserveFormat?: boolean;
}

// =====================================
// VALIDATION CONFIGURATION
// =====================================

export interface ValidationConfig {
  strictMode: boolean;
  sanitizeInputs: boolean;
  validateOnChange: boolean;
  validateOnBlur: boolean;
  debounceMs: number;
  maxValidationTime: number;
  logValidationErrors: boolean;
  enableAsyncValidation: boolean;
}

export interface SecurityValidationConfig {
  enableXSSProtection: boolean;
  enableSQLInjectionProtection: boolean;
  enablePathTraversalProtection: boolean;
  maxInputLength: number;
  allowedFileTypes?: string[];
  blockedPatterns: RegExp[];
  trustedDomains: string[];
}

// =====================================
// VALIDATION STORE STATE
// =====================================

export interface ValidationState {
  errors: Record<string, ValidationError[]>;
  warnings: Record<string, ValidationWarning[]>;
  isValidating: Record<string, boolean>;
  lastValidated: Record<string, string>;
  validationHistory: ValidationHistoryEntry[];
  config: ValidationConfig;
}

export interface ValidationHistoryEntry {
  timestamp: string;
  field: string;
  value: JsonValue;
  result: ValidationResult;
  component: string;
  userId?: string;
}

// =====================================
// VALIDATION EVENTS
// =====================================

export interface ValidationEvent {
  type: 'validation:start' | 'validation:complete' | 'validation:error';
  field: string;
  timestamp: string;
  data: JsonObject;
}

export type ValidationEventHandler = (event: ValidationEvent) => void;

// =====================================
// COMPOSABLE TYPES
// =====================================

export interface UseValidationOptions {
  config?: Partial<ValidationConfig>;
  schema?: ValidationSchema;
  immediate?: boolean;
  resetOnUnmount?: boolean;
}

export interface UseValidationReturn {
  validate: (field: string, value: JsonValue) => Promise<ValidationResult>;
  validateAll: (form: JsonObject) => Promise<Record<string, ValidationResult>>;
  clearErrors: (field?: string) => void;
  clearWarnings: (field?: string) => void;
  addRule: (field: string, rule: ValidationRule) => void;
  removeRule: (field: string, ruleName: string) => void;
  errors: Readonly<Record<string, ValidationError[]>>;
  warnings: Readonly<Record<string, ValidationWarning[]>>;
  isValidating: Readonly<Record<string, boolean>>;
  isValid: Readonly<boolean>;
}

// =====================================
// UTILITY TYPES
// =====================================

export type ValidationRuleFactory<
  TOptions = JsonObject | undefined,
  TValue = unknown
> = (options?: TOptions) => ValidationRule<TValue>;

export interface ValidationRuleOptions {
  message?: string;
  code?: string;
  severity?: 'error' | 'critical';
  async?: boolean;
  priority?: number;
}

// =====================================
// COMMON VALIDATION PATTERNS
// =====================================

export const ValidationPatterns = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^\+?[\d\s\-()]{10,}$/,
  URL: /^https?:\/\/[^\s/$.?#].[^\s]*$/i,
  SSN: /^\d{3}-?\d{2}-?\d{4}$/,
  CREDIT_CARD: /^\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}$/,
  IPV4: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
  REGEX_PATTERN: /^\/.*\/[gimuy]*$/,
  SAFE_STRING: /^[a-zA-Z0-9\s\-_.,!?()]+$/,
} as const;

export const ValidationCodes = {
  REQUIRED: 'REQUIRED',
  MIN_LENGTH: 'MIN_LENGTH',
  MAX_LENGTH: 'MAX_LENGTH',
  PATTERN_MISMATCH: 'PATTERN_MISMATCH',
  INVALID_FORMAT: 'INVALID_FORMAT',
  SECURITY_VIOLATION: 'SECURITY_VIOLATION',
  PII_DETECTED: 'PII_DETECTED',
  REGEX_INVALID: 'REGEX_INVALID',
  XSS_DETECTED: 'XSS_DETECTED',
  SQL_INJECTION: 'SQL_INJECTION',
  PATH_TRAVERSAL: 'PATH_TRAVERSAL',
} as const;

export type ValidationCode = typeof ValidationCodes[keyof typeof ValidationCodes];
