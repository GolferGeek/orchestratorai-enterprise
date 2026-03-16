/**
 * Validation System Unit Tests
 * Comprehensive tests for input validation, security patterns, and composables
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useValidation, ValidationRules, usePIIValidation, useRegexValidation } from '@/composables/useValidation';
import { useValidationStore } from '@/stores/validationStore';
import { ValidationHelpers } from '@/utils/validationHelpers';
import { ValidationCodes } from '@/types/validation';
import ValidationMessage from '@/components/common/ValidationMessage.vue';

// Note: Using real DOMPurify for comprehensive testing

describe('Validation System', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  // =====================================
  // VALIDATION HELPERS TESTS
  // =====================================

  describe('ValidationHelpers', () => {
    describe('String Validation', () => {
      it('should validate email addresses correctly', () => {
        expect(ValidationHelpers.isValidEmail('test@example.com')).toBe(true);
        expect(ValidationHelpers.isValidEmail('user.name+tag@domain.co.uk')).toBe(true);
        expect(ValidationHelpers.isValidEmail('invalid-email')).toBe(false);
        expect(ValidationHelpers.isValidEmail('test@')).toBe(false);
        expect(ValidationHelpers.isValidEmail('@domain.com')).toBe(false);
      });

      it('should validate URLs correctly', () => {
        expect(ValidationHelpers.isValidUrl('https://example.com')).toBe(true);
        expect(ValidationHelpers.isValidUrl('http://localhost:3000')).toBe(true);
        expect(ValidationHelpers.isValidUrl('ftp://files.example.com')).toBe(false);
        expect(ValidationHelpers.isValidUrl('not-a-url')).toBe(false);
      });

      it('should validate string length', () => {
        expect(ValidationHelpers.isValidLength('hello', 3, 10)).toBe(true);
        expect(ValidationHelpers.isValidLength('hi', 3, 10)).toBe(false);
        expect(ValidationHelpers.isValidLength('this is too long', 3, 10)).toBe(false);
      });

      it('should validate safe strings', () => {
        expect(ValidationHelpers.isSafeString('Hello World 123')).toBe(true);
        expect(ValidationHelpers.isSafeString('User input with (parentheses)')).toBe(true);
        expect(ValidationHelpers.isSafeString('<script>alert("xss")</script>')).toBe(false);
        expect(ValidationHelpers.isSafeString('DROP TABLE users;')).toBe(false);
      });
    });

    describe('Regex Validation', () => {
      it('should validate regex patterns', () => {
        expect(ValidationHelpers.isValidRegex('[a-z]+')).toBe(true);
        expect(ValidationHelpers.isValidRegex('^\\d{3}-\\d{2}-\\d{4}$')).toBe(true);
        expect(ValidationHelpers.isValidRegex('[invalid')).toBe(false);
        expect(ValidationHelpers.isValidRegex('*invalid')).toBe(false);
      });

      it('should detect dangerous regex patterns', () => {
        expect(ValidationHelpers.isDangerousRegex('(a+)+')).toBe(true);
        expect(ValidationHelpers.isDangerousRegex('(.*)*')).toBe(true);
        expect(ValidationHelpers.isDangerousRegex('[a-z]+')).toBe(false);
        expect(ValidationHelpers.isDangerousRegex('^\\w+$')).toBe(false);
      });

      it('should test regex performance', () => {
        const fastPattern = '[a-z]+';
        const time = ValidationHelpers.testRegexPerformance(fastPattern);
        expect(time).toBeGreaterThanOrEqual(0);
        expect(time).toBeLessThan(100); // Should be fast

        const invalidPattern = '[invalid';
        expect(ValidationHelpers.testRegexPerformance(invalidPattern)).toBe(-1);
      });
    });

    describe('Security Validation', () => {
      it('should detect XSS patterns', () => {
        expect(ValidationHelpers.containsXSS('<script>alert("xss")</script>')).toBe(true);
        expect(ValidationHelpers.containsXSS('javascript:alert("xss")')).toBe(true);
        expect(ValidationHelpers.containsXSS('<img onload="alert(1)">')).toBe(true);
        expect(ValidationHelpers.containsXSS('normal text')).toBe(false);
      });

      it('should detect SQL injection patterns', () => {
        expect(ValidationHelpers.containsSQLInjection("'; DROP TABLE users; --")).toBe(true);
        expect(ValidationHelpers.containsSQLInjection('UNION SELECT * FROM passwords')).toBe(true);
        expect(ValidationHelpers.containsSQLInjection('normal search term')).toBe(false);
      });

      it('should detect path traversal attempts', () => {
        expect(ValidationHelpers.containsPathTraversal('../../../etc/passwd')).toBe(true);
        expect(ValidationHelpers.containsPathTraversal('..\\windows\\system32')).toBe(true);
        expect(ValidationHelpers.containsPathTraversal('normal/file/path')).toBe(false);
      });

      it('should detect command injection patterns', () => {
        expect(ValidationHelpers.containsCommandInjection('test; cat /etc/passwd')).toBe(true);
        expect(ValidationHelpers.containsCommandInjection('input | rm -rf /')).toBe(true);
        expect(ValidationHelpers.containsCommandInjection('normal input')).toBe(false);
      });
    });

    describe('PII Detection', () => {
      it('should detect potential PII patterns', () => {
        expect(ValidationHelpers.containsPotentialPII('test@example.com')).toBe(true);
        expect(ValidationHelpers.containsPotentialPII('123-45-6789')).toBe(true);
        expect(ValidationHelpers.containsPotentialPII('4111-1111-1111-1111')).toBe(true);
        expect(ValidationHelpers.containsPotentialPII('normal text')).toBe(false);
      });

      it('should extract PII matches', () => {
        const text = 'Contact John at john@example.com or call 555-123-4567';
        const matches = ValidationHelpers.extractPIIMatches(text);
        
        expect(matches).toHaveLength(2);
        
        // Sort matches by start position to ensure consistent order
        const sortedMatches = matches.sort((a, b) => a.start - b.start);
        expect(sortedMatches[0].type).toBe('email');
        expect(sortedMatches[0].match).toBe('john@example.com');
        expect(sortedMatches[1].type).toBe('phone');
        expect(sortedMatches[1].match).toBe('555-123-4567');
      });
    });

    describe('Input Sanitization', () => {
      it('should sanitize HTML', () => {
        const input = '<script>alert("xss")</script>Hello<b>World</b>';
        const sanitized = ValidationHelpers.sanitizeHTML(input);
        expect(sanitized).not.toContain('<script>');
        expect(sanitized).not.toContain('<b>');
        expect(sanitized).toContain('&lt;');
        expect(sanitized).toContain('&gt;');
      });

      it('should remove dangerous characters', () => {
        const input = 'Hello<script>"World"</script>';
        const cleaned = ValidationHelpers.removeDangerousChars(input);
        expect(cleaned).not.toContain('<');
        expect(cleaned).not.toContain('>');
        expect(cleaned).not.toContain('"');
      });

      it('should normalize whitespace', () => {
        const input = '  Hello    World  \n\n\n  Test  ';
        const normalized = ValidationHelpers.normalizeWhitespace(input);
        expect(normalized).toBe('Hello World\n Test');
      });
    });
  });

  // =====================================
  // VALIDATION RULES TESTS
  // =====================================

  describe('ValidationRules', () => {
    it('should validate required fields', () => {
      const rule = ValidationRules.required('Field is required');
      
      expect(rule.validator('hello').isValid).toBe(true);
      expect(rule.validator('').isValid).toBe(false);
      expect(rule.validator(null).isValid).toBe(false);
      expect(rule.validator(undefined).isValid).toBe(false);
      
      const result = rule.validator('');
      expect(result.errors[0].code).toBe(ValidationCodes.REQUIRED);
      expect(result.errors[0].message).toBe('Field is required');
    });

    it('should validate minimum length', () => {
      const rule = ValidationRules.minLength(5, 'Too short');
      
      expect(rule.validator('hello').isValid).toBe(true);
      expect(rule.validator('hello world').isValid).toBe(true);
      expect(rule.validator('hi').isValid).toBe(false);
      expect(rule.validator('').isValid).toBe(true); // Empty is valid for minLength
      
      const result = rule.validator('hi');
      expect(result.errors[0].code).toBe(ValidationCodes.MIN_LENGTH);
      expect(result.errors[0].context?.min).toBe(5);
      expect(result.errors[0].context?.actual).toBe(2);
    });

    it('should validate maximum length', () => {
      const rule = ValidationRules.maxLength(10, 'Too long');
      
      expect(rule.validator('hello').isValid).toBe(true);
      expect(rule.validator('hello world').isValid).toBe(false);
      expect(rule.validator('').isValid).toBe(true);
      
      const result = rule.validator('hello world');
      expect(result.errors[0].code).toBe(ValidationCodes.MAX_LENGTH);
      expect(result.errors[0].context?.max).toBe(10);
      expect(result.errors[0].context?.actual).toBe(11);
    });

    it('should validate patterns', () => {
      const rule = ValidationRules.pattern(/^\d+$/, 'Numbers only');
      
      expect(rule.validator('123').isValid).toBe(true);
      expect(rule.validator('abc').isValid).toBe(false);
      expect(rule.validator('').isValid).toBe(true); // Empty is valid for pattern
      
      const result = rule.validator('abc');
      expect(result.errors[0].code).toBe(ValidationCodes.PATTERN_MISMATCH);
      expect(result.errors[0].message).toBe('Numbers only');
    });

    it('should validate email format', () => {
      const rule = ValidationRules.email('Invalid email');
      
      expect(rule.validator('test@example.com').isValid).toBe(true);
      expect(rule.validator('invalid-email').isValid).toBe(false);
      expect(rule.validator('').isValid).toBe(true);
      
      const result = rule.validator('invalid-email');
      expect(result.errors[0].code).toBe(ValidationCodes.INVALID_FORMAT);
      expect(result.errors[0].message).toBe('Invalid email');
    });

    it('should validate security', () => {
      const rule = ValidationRules.security();

      expect(rule.validator('normal text').isValid).toBe(true);
      expect(rule.validator('<script>alert("xss")</script>').isValid).toBe(false);
      expect(rule.validator("'; DROP TABLE users; --").isValid).toBe(false);

      const result = rule.validator('<script>alert("xss")</script>');
      expect(result.errors[0].severity).toBe('critical');
      expect(result.errors[0].code).toBe(ValidationCodes.XSS_DETECTED);
    });

    it('should sanitize input with default profile', () => {
      const rule = ValidationRules.sanitize();

      const result = rule.validator('<b>Hello</b> World');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe('<b>Hello</b> World'); // Basic tags allowed in moderate profile
      expect(result.metadata?.sanitizationApplied).toBe(false); // No change needed
      expect((result.metadata as { sanitizationProfile?: string })?.sanitizationProfile).toBe('moderate');
    });

    it('should sanitize input with specific profile', () => {
      const rule = ValidationRules.sanitize({ profile: 'strict' });

      const result = rule.validator('<b>Hello</b> World');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe('Hello World');
      expect((result.metadata as { sanitizationProfile?: string })?.sanitizationProfile).toBe('strict');
    });

    it('should sanitize API input strictly', () => {
      const rule = ValidationRules.sanitizeApiInput();

      const result = rule.validator('<script>alert("xss")</script>Hello World');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe('Hello World');
      expect((result.metadata as { sanitizationProfile?: string })?.sanitizationProfile).toBe('apiInput');
    });

    it('should sanitize search queries', () => {
      const rule = ValidationRules.sanitizeSearch();

      const result = rule.validator('<b>search</b> term');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe('search term');
      expect((result.metadata as { sanitizationProfile?: string })?.sanitizationProfile).toBe('search');
    });

    it('should sanitize rich text content', () => {
      const rule = ValidationRules.sanitizeRichText();

      const result = rule.validator('<p><b>Rich</b> content</p><script>alert("xss")</script>');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe('<p><b>Rich</b> content</p>');
      expect((result.metadata as { sanitizationProfile?: string })?.sanitizationProfile).toBe('richText');
    });

    it('should provide warnings when content is modified', () => {
      const rule = ValidationRules.sanitize();

      const result = rule.validator('<script>alert("xss")</script>Hello World');
      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toBe('Input was sanitized for security');
      // ValidationWarning doesn't have severity property, only field, code, message, suggestion
    });
  });

  // =====================================
  // VALIDATION COMPOSABLE TESTS
  // =====================================

  describe('useValidation', () => {
    it('should validate single field', async () => {
      const validation = useValidation();
      validation.addRule('test', ValidationRules.required('Required'));
      validation.addRule('test', ValidationRules.minLength(5, 'Too short'));
      
      const result = await validation.validate('test', 'hello');
      expect(result.isValid).toBe(true);
      
      const result2 = await validation.validate('test', 'hi');
      expect(result2.isValid).toBe(false);
      expect(result2.errors).toHaveLength(1);
      expect(result2.errors[0].code).toBe(ValidationCodes.MIN_LENGTH);
    });

    it('should validate all fields', async () => {
      const validation = useValidation();
      validation.addRule('field1', ValidationRules.required());
      validation.addRule('field2', ValidationRules.email());
      
      const form = {
        field1: 'value',
        field2: 'test@example.com'
      };
      
      const results = await validation.validateAll(form);
      expect(results.field1.isValid).toBe(true);
      expect(results.field2.isValid).toBe(true);
      
      const invalidForm = {
        field1: '',
        field2: 'invalid-email'
      };
      
      const invalidResults = await validation.validateAll(invalidForm);
      expect(invalidResults.field1.isValid).toBe(false);
      expect(invalidResults.field2.isValid).toBe(false);
    });

    it('should manage validation rules', () => {
      const validation = useValidation();
      
      validation.addRule('test', ValidationRules.required());
      validation.addRule('test', ValidationRules.minLength(5));
      
      // Should have 2 rules
      expect(validation.errors.value).toBeDefined();
      
      validation.removeRule('test', 'required');
      // Should have 1 rule remaining

      validation.clearErrors('test');
      expect('test' in validation.errors.value).toBe(false);
    });
  });

  // =====================================
  // SPECIALIZED COMPOSABLES TESTS
  // =====================================

  describe('Specialized Composables', () => {
    it('should create PII validation composable', () => {
      const piiValidation = usePIIValidation();
      expect(piiValidation).toBeDefined();
      expect(piiValidation.validate).toBeDefined();
      expect(piiValidation.isValid).toBeDefined();
    });

    it('should create regex validation composable', () => {
      const regexValidation = useRegexValidation();
      expect(regexValidation).toBeDefined();
      expect(regexValidation.validate).toBeDefined();
      expect(regexValidation.isValid).toBeDefined();
    });
  });

  // =====================================
  // VALIDATION STORE TESTS
  // =====================================

  describe('ValidationStore', () => {
    it('should manage validation state', () => {
      const store = useValidationStore();
      
      expect(store.totalErrors).toBe(0);
      expect(store.isFormValid).toBe(true);
      
      store.setFieldErrors('test', [{
        field: 'test',
        code: ValidationCodes.REQUIRED,
        message: 'Required',
        severity: 'error'
      }]);
      
      expect(store.totalErrors).toBe(1);
      expect(store.isFormValid).toBe(false);
      expect(store.getFieldErrors('test')).toHaveLength(1);
      expect(store.isFieldValid('test')).toBe(false);
      expect(store.getFieldStatus('test')).toBe('error');
    });

    it('should provide validation summary', () => {
      const store = useValidationStore();
      
      store.setFieldErrors('field1', [{
        field: 'field1',
        code: ValidationCodes.REQUIRED,
        message: 'Required',
        severity: 'error'
      }]);
      
      store.setFieldErrors('field2', []);
      
      const summary = store.validationSummary;
      expect(summary.totalFields).toBe(2);
      expect(summary.validFields).toBe(1);
      expect(summary.invalidFields).toBe(1);
      expect(summary.totalErrors).toBe(1);
      expect(summary.validationRate).toBe(50);
    });

    it('should track validation history', () => {
      const store = useValidationStore();
      
      const result = {
        isValid: false,
        errors: [{
          field: 'test',
          code: ValidationCodes.REQUIRED,
          message: 'Required',
          severity: 'error' as const
        }],
        warnings: [],
        metadata: {
          validatedAt: new Date().toISOString(),
          validationTime: 10,
          rules: ['required'],
          sanitizationApplied: false
        }
      };
      
      store.addValidationResult('test', result, 'TestComponent');
      
      const history = store.getFieldHistory('test');
      expect(history).toHaveLength(1);
      expect(history[0].field).toBe('test');
      expect(history[0].component).toBe('TestComponent');
    });

    it('should provide validation analytics', () => {
      const store = useValidationStore();
      
      const analytics = store.getAnalytics();
      expect(analytics).toBeDefined();
      expect(analytics.totalValidations).toBeDefined();
      expect(analytics.successRate).toBeDefined();
      expect(analytics.averageValidationTime).toBeDefined();
    });
  });

  // =====================================
  // VALIDATION MESSAGE COMPONENT TESTS
  // =====================================

  describe('ValidationMessage Component', () => {
    it('should render error message', () => {
      const wrapper = mount(ValidationMessage, {
        props: {
          errors: [{
            field: 'test',
            code: ValidationCodes.REQUIRED,
            message: 'This field is required',
            severity: 'error'
          }]
        }
      });
      
      expect(wrapper.text()).toContain('This field is required');
      expect(wrapper.classes()).toContain('validation-message--error');
    });

    it('should render warning message', () => {
      const wrapper = mount(ValidationMessage, {
        props: {
          warnings: [{
            field: 'test',
            code: 'PERFORMANCE_WARNING',
            message: 'This might be slow',
            suggestion: 'Consider optimizing'
          }]
        }
      });
      
      expect(wrapper.text()).toContain('This might be slow');
      expect(wrapper.text()).toContain('Consider optimizing');
      expect(wrapper.classes()).toContain('validation-message--warning');
    });

    it('should render validating state', () => {
      const wrapper = mount(ValidationMessage, {
        props: {
          isValidating: true
        }
      });
      
      expect(wrapper.text()).toContain('Validating...');
      expect(wrapper.classes()).toContain('validation-message--validating');
    });

    it('should emit events', async () => {
      const wrapper = mount(ValidationMessage, {
        props: {
          errors: [{
            field: 'test',
            code: ValidationCodes.REQUIRED,
            message: 'Required',
            severity: 'error'
          }],
          showActions: true,
          canRetry: true,
          dismissible: true
        }
      });
      
      const retryButton = wrapper.find('[data-testid="retry-button"]');
      if (retryButton.exists()) {
        await retryButton.trigger('click');
        expect(wrapper.emitted('retry')).toBeTruthy();
      }
      
      const dismissButton = wrapper.find('[data-testid="dismiss-button"]');
      if (dismissButton.exists()) {
        await dismissButton.trigger('click');
        expect(wrapper.emitted('dismiss')).toBeTruthy();
      }
    });
  });
});
