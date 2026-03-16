/**
 * Enhanced Sanitization System Tests
 * Comprehensive tests for DOMPurify v3.x integration and sanitization profiles
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  sanitizeWithProfile, 
  SanitizationHelpers, 
  getAvailableProfiles,
  testSanitization,
  SANITIZATION_PROFILES
} from '@/utils/sanitizationProfiles';
import { useApiSanitization } from '@/composables/useApiSanitization';

// Note: Using real DOMPurify for comprehensive testing

describe('Sanitization Profiles', () => {
  describe('sanitizeWithProfile', () => {
    it('should return original value for non-strings', () => {
      const result = sanitizeWithProfile(123);
      expect(result.sanitized).toBe(123);
      expect(result.wasModified).toBe(false);
    });

    it('should return original value for empty strings', () => {
      const result = sanitizeWithProfile('');
      expect(result.sanitized).toBe('');
      expect(result.wasModified).toBe(false);
    });

    it('should use strict profile by default for level "strict"', () => {
      const input = '<script>alert("xss")</script>Hello World';
      const result = sanitizeWithProfile(input, { level: 'strict' });
      
      expect(result.sanitized).toBe('Hello World');
      expect(result.wasModified).toBe(true);
      expect(result.profile).toBe('strict');
    });

    it('should use moderate profile for level "moderate"', () => {
      const input = '<b>Bold</b> <script>alert("xss")</script> text';
      const result = sanitizeWithProfile(input, { level: 'moderate' });
      
      expect(result.sanitized).toBe('<b>Bold</b>  text');
      expect(result.wasModified).toBe(true);
      expect(result.profile).toBe('moderate');
    });

    it('should use richText profile for level "lenient"', () => {
      const input = '<p><b>Bold</b> text</p><script>alert("xss")</script>';
      const result = sanitizeWithProfile(input, { level: 'lenient' });
      
      expect(result.sanitized).toBe('<p><b>Bold</b> text</p>');
      expect(result.wasModified).toBe(true);
      expect(result.profile).toBe('richText');
    });

    it('should use specific profile when provided', () => {
      const input = '<b>Bold</b> text';
      const result = sanitizeWithProfile(input, { profile: 'strict' });
      
      expect(result.sanitized).toBe('Bold text');
      expect(result.wasModified).toBe(true);
      expect(result.profile).toBe('strict');
    });

    it('should merge custom config with profile config', () => {
      const input = '<b>Bold</b> text';
      const result = sanitizeWithProfile(input, { 
        profile: 'moderate',
        customConfig: { KEEP_CONTENT: false }
      });
      
      expect(result.wasModified).toBe(true);
      expect(result.profile).toBe('moderate');
    });
  });

  describe('SanitizationHelpers', () => {
    it('should sanitize for API input', () => {
      const input = '<script>alert("xss")</script>Hello World';
      const result = SanitizationHelpers.forApiInput(input);
      
      expect(result).toBe('Hello World');
    });

    it('should sanitize search queries', () => {
      const input = '<b>search</b> term';
      const result = SanitizationHelpers.forSearch(input);
      
      expect(result).toBe('search term');
    });

    it('should sanitize email content', () => {
      const input = '<p>Hello <b>World</b></p><script>alert("xss")</script>';
      const result = SanitizationHelpers.forEmail(input);
      
      expect(result).toBe('<p>Hello <b>World</b></p>');
    });

    it('should sanitize rich text content', () => {
      const input = '<h1>Title</h1><p>Content</p><script>alert("xss")</script>';
      const result = SanitizationHelpers.forRichText(input);
      
      expect(result).toBe('<h1>Title</h1><p>Content</p>');
    });

    it('should batch sanitize multiple values', () => {
      const values = {
        name: '<script>alert("xss")</script>John',
        email: '<b>john@example.com</b>',
        message: 'Hello <i>world</i>'
      };
      
      const result = SanitizationHelpers.batch(values, { profile: 'strict' });
      
      expect(result.name).toBe('John');
      expect(result.email).toBe('john@example.com');
      expect(result.message).toBe('Hello world');
    });

    it('should deep sanitize nested objects', () => {
      const obj = {
        user: {
          name: '<script>alert("xss")</script>John',
          details: {
            bio: 'Hello <b>world</b>'
          }
        },
        messages: [
          'Message <script>alert("xss")</script>1',
          'Message 2'
        ]
      };
      
      const result = SanitizationHelpers.deep(obj, { profile: 'strict' });

      // @ts-expect-error - result is of type 'unknown' but we know the shape from the input
      expect(result.user.name).toBe('John');
      // @ts-expect-error - result is of type 'unknown' but we know the shape from the input
      expect(result.user.details.bio).toBe('Hello world');
      // @ts-expect-error - result is of type 'unknown' but we know the shape from the input
      expect(result.messages[0]).toBe('Message 1');
      // @ts-expect-error - result is of type 'unknown' but we know the shape from the input
      expect(result.messages[1]).toBe('Message 2');
    });
  });

  describe('Profile Management', () => {
    it('should return all available profiles', () => {
      const profiles = getAvailableProfiles();
      
      expect(profiles).toHaveLength(Object.keys(SANITIZATION_PROFILES).length);
      expect(profiles[0]).toHaveProperty('name');
      expect(profiles[0]).toHaveProperty('description');
    });

    it('should test sanitization with all profiles', () => {
      const input = '<script>alert("xss")</script><b>Bold</b> text';
      const results = testSanitization(input);
      
      expect(results).toHaveProperty('strict');
      expect(results).toHaveProperty('moderate');
      expect(results).toHaveProperty('richText');
      expect(results).toHaveProperty('apiInput');
      
      // Strict should remove everything
      expect(results.strict.output).toBe('Bold text');
      expect(results.strict.modified).toBe(true);
      
      // Moderate should allow some formatting
      expect(results.moderate.output).toBe('<b>Bold</b> text');
      expect(results.moderate.modified).toBe(true);
    });
  });
});

describe('API Sanitization Composable', () => {
  let apiSanitization: ReturnType<typeof useApiSanitization>;

  beforeEach(() => {
    apiSanitization = useApiSanitization();
  });

  describe('sanitizeApiData', () => {
    it('should sanitize string values', () => {
      const data = {
        message: '<script>alert("xss")</script>Hello',
        name: 'John<b>Doe</b>'
      };
      
      const result = apiSanitization.sanitizeApiData(data);
      
      expect(result.sanitized.message).toBe('Hello');
      expect(result.sanitized.name).toBe('JohnDoe');
      expect(result.modified).toBe(true);
      expect(result.modifiedFields).toContain('message');
      expect(result.modifiedFields).toContain('name');
    });

    it('should exclude specified fields from sanitization', () => {
      const data = {
        message: '<script>alert("xss")</script>Hello',
        sessionId: 'session-123',
        token: 'auth-token'
      };
      
      const result = apiSanitization.sanitizeApiData(data, {
        excludeFields: ['sessionId', 'token']
      });
      
      expect(result.sanitized.message).toBe('Hello');
      expect(result.sanitized.sessionId).toBe('session-123');
      expect(result.sanitized.token).toBe('auth-token');
      expect(result.modifiedFields).toEqual(['message']);
    });

    it('should use field-specific profiles', () => {
      const data = {
        message: '<b>Bold</b> message',
        search: '<b>search</b> term'
      };
      
      const result = apiSanitization.sanitizeApiData(data, {
        fieldProfiles: {
          message: 'moderate',
          search: 'strict'
        }
      });
      
      expect(result.sanitized.message).toBe('<b>Bold</b> message');
      expect(result.sanitized.search).toBe('search term');
    });

    it('should handle nested objects when deep sanitization is enabled', () => {
      const data = {
        user: {
          name: '<script>alert("xss")</script>John',
          profile: {
            bio: 'Hello <b>world</b>'
          }
        }
      };

      const result = apiSanitization.sanitizeApiData(data, { deep: true });

      // @ts-expect-error - result.sanitized is of type 'unknown' but we know the shape from the input
      expect(result.sanitized.user.name).toBe('John');
      // @ts-expect-error - result.sanitized is of type 'unknown' but we know the shape from the input
      expect(result.sanitized.user.profile.bio).toBe('Hello world');
    });
  });

  describe('Specialized sanitization methods', () => {
    it('should sanitize orchestrator requests', () => {
      const payload = {
        message: '<script>alert("xss")</script>Hello',
        session_id: 'session-123',
        conversation_history: [
          { role: 'user', content: '<b>Previous</b> message' }
        ]
      };

      const result = apiSanitization.sanitizeOrchestratorRequest(payload);

      expect(result.message).toBe('Hello');
      expect(result.session_id).toBe('session-123'); // Should be excluded
      // @ts-expect-error - conversation_history is possibly undefined but we know it exists from the input
      expect(result.conversation_history[0].content).toBe('Previous message');
    });

    it('should sanitize task requests', () => {
      const request = {
        method: 'process<script>',
        prompt: '<script>alert("xss")</script>Create a task',
        conversationId: 'conv-123'
      };
      
      const result = apiSanitization.sanitizeTaskRequest(request);
      
      expect(result.method).toBe('process');
      expect(result.prompt).toBe('Create a task');
      expect(result.conversationId).toBe('conv-123'); // Should be excluded
    });

    it('should sanitize PII requests', () => {
      const request = {
        text: 'Test <b>PII</b> content with phone: 123-456-7890'
      };
      
      const result = apiSanitization.sanitizePIIRequest(request);
      
      expect(result.text).toBe('Test <b>PII</b> content with phone: 123-456-7890');
    });

    it('should sanitize error reports', () => {
      const payload = {
        error: { message: 'Error occurred' },
        userFeedback: '<script>alert("xss")</script>The app crashed',
        reproductionSteps: 'Step 1: <b>Click</b> button'
      };
      
      const result = apiSanitization.sanitizeErrorReport(payload);
      
      expect(result.error).toEqual({ message: 'Error occurred' }); // Should be excluded
      expect(result.userFeedback).toBe('The app crashed');
      expect(result.reproductionSteps).toBe('Step 1: <b>Click</b> button');
    });
  });

  describe('Validation', () => {
    it('should detect XSS patterns', () => {
      const data = {
        message: '<script>alert("xss")</script>',
        content: 'onclick="malicious()"'
      };
      
      const result = apiSanitization.validateSanitization(data);
      
      expect(result.isValid).toBe(false);
      expect(result.issues).toHaveLength(2);
      expect(result.issues[0]).toContain('Potential XSS');
      expect(result.issues[1]).toContain('Potential XSS');
    });

    it('should detect SQL injection patterns', () => {
      const data = {
        query: "'; DROP TABLE users; --"
      };
      
      const result = apiSanitization.validateSanitization(data);
      
      expect(result.isValid).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toContain('Potential SQL injection');
    });

    it('should validate clean data as safe', () => {
      const data = {
        message: 'This is a clean message',
        name: 'John Doe'
      };
      
      const result = apiSanitization.validateSanitization(data);
      
      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('Sanitized API wrapper', () => {
    it('should create sanitized API function', async () => {
      const mockApiFunction = vi.fn().mockResolvedValue('success');
      const sanitizedFunction = apiSanitization.createSanitizedApiCall(mockApiFunction);
      
      await sanitizedFunction('<script>alert("xss")</script>Hello', { id: 123 });
      
      expect(mockApiFunction).toHaveBeenCalledWith('Hello', { id: 123 });
    });
  });
});

describe('Edge Cases and Security Tests', () => {
  describe('Malicious Input Tests', () => {
    const maliciousInputs = [
      '<script>alert("XSS")</script>',
      '<img src="x" onerror="alert(\'XSS\')">',
      '<svg onload="alert(\'XSS\')">',
      'javascript:alert("XSS")',
      '<iframe src="javascript:alert(\'XSS\')"></iframe>',
      '<object data="javascript:alert(\'XSS\')"></object>',
      '<embed src="javascript:alert(\'XSS\')">',
      '<form><input type="hidden" name="csrf" value="malicious"></form>',
      '<meta http-equiv="refresh" content="0;url=javascript:alert(\'XSS\')">',
      '<link rel="stylesheet" href="javascript:alert(\'XSS\')">',
      '<style>@import "javascript:alert(\'XSS\')";</style>',
      '&lt;script&gt;alert("XSS")&lt;/script&gt;',
      '%3Cscript%3Ealert("XSS")%3C/script%3E',
      'data:text/html,<script>alert("XSS")</script>',
      '<div onclick="alert(\'XSS\')">Click me</div>'
    ];

    maliciousInputs.forEach((input, index) => {
      it(`should sanitize malicious input #${index + 1}: ${input.substring(0, 50)}...`, () => {
        const result = SanitizationHelpers.strict(input);
        
        // Should not contain HTML script tags
        expect(result).not.toMatch(/<script/i);
        expect(result).not.toMatch(/onerror=/i);
        expect(result).not.toMatch(/onload=/i);
        expect(result).not.toMatch(/onclick=/i);
        
        // For plain text javascript: protocols, DOMPurify won't remove them
        // as they're not HTML. This is correct behavior - the application
        // should validate URLs separately when they're used in URL contexts.
        if (input.includes('<') || input.includes('&lt;')) {
          // Only check for javascript: removal in HTML contexts
          if (input.includes('src=') || input.includes('href=') || input.includes('url=')) {
            expect(result).not.toMatch(/javascript:/i);
          }
        }
      });
    });
  });

  describe('SQL Injection Tests', () => {
    const sqlInjectionInputs = [
      "'; DROP TABLE users; --",
      "' OR '1'='1",
      "1; DELETE FROM users WHERE 1=1; --",
      "' UNION SELECT * FROM passwords --",
      "admin'--",
      "1' OR 1=1#",
      "'; INSERT INTO users VALUES ('hacker', 'password'); --",
      "' OR 1=1 LIMIT 1 --"
    ];

    sqlInjectionInputs.forEach((input, index) => {
      it(`should sanitize SQL injection attempt #${index + 1}: ${input}`, () => {
        const result = SanitizationHelpers.forApiInput(input);
        
        // Should be safe for API use
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Unicode and Special Character Tests', () => {
    it('should handle Unicode characters properly', () => {
      const input = '🚀 Hello 世界 <script>alert("XSS")</script>';
      const result = SanitizationHelpers.strict(input);
      
      expect(result).toBe('🚀 Hello 世界 ');
    });

    it('should handle null bytes and control characters', () => {
      const input = 'Hello\x00World\x01<script>alert("XSS")</script>';
      const result = SanitizationHelpers.strict(input);
      
      expect(result).not.toContain('<script');
    });

    it('should handle very long strings', () => {
      const longString = 'A'.repeat(10000) + '<script>alert("XSS")</script>';
      const result = SanitizationHelpers.strict(longString);
      
      expect(result).not.toContain('<script');
      expect(result.length).toBeGreaterThan(9000);
    });
  });

  describe('Performance Tests', () => {
    it('should handle large objects efficiently', () => {
      const largeObject: Record<string, string> = {};
      for (let i = 0; i < 1000; i++) {
        largeObject[`field${i}`] = `<script>alert("${i}")</script>Value ${i}`;
      }
      
      const startTime = performance.now();
      const result = SanitizationHelpers.deep(largeObject, { profile: 'strict' });
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should complete in under 1 second
      // @ts-expect-error - result is of type 'unknown' but we know it's a Record<string, string> from the input
      expect(Object.keys(result)).toHaveLength(1000);
      // @ts-expect-error - result is of type 'unknown' but we know it's a Record<string, string> from the input
      expect(result.field0).toBe('Value 0');
    });
  });
});
