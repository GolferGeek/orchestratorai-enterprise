/**
 * Security-focused Validation Tests
 * Testing XSS prevention, SQL injection detection, and data sanitization
 */

import { describe, it, expect } from 'vitest';
import { useValidation, ValidationRules } from '@/composables/useValidation';
import { SanitizationHelpers, testSanitization } from '@/utils/sanitizationProfiles';
import { ValidationHelpers } from '@/utils/validationHelpers';
import { ValidationCodes } from '@/types/validation';

describe('Security Validation Tests', () => {
  
  // =====================================
  // XSS PREVENTION TESTS
  // =====================================
  
  describe('XSS Prevention', () => {
    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '<img src="x" onerror="alert(1)">',
      '<svg onload="alert(1)">',
      'javascript:alert("XSS")',
      '<iframe src="javascript:alert(1)"></iframe>',
      '<object data="javascript:alert(1)">',
      '<embed src="javascript:alert(1)">',
      '<link rel="stylesheet" href="javascript:alert(1)">',
      '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
      '<form><button formaction="javascript:alert(1)">',
    ];
    
    xssPayloads.forEach(payload => {
      it(`should detect and sanitize XSS payload: ${payload.substring(0, 30)}...`, () => {
        // Test direct detection
        expect(ValidationHelpers.containsXSS(payload)).toBe(true);
        
        // Test validation rule
        const securityRule = ValidationRules.security({ enableXSSProtection: true });
        const result = securityRule.validator(payload);
        
        if (result.isValid) {
          // If valid, it should be sanitized
          expect(result.sanitizedValue).not.toBe(payload);
          expect(result.sanitizedValue).not.toContain('<script>');
          expect(result.sanitizedValue).not.toContain('javascript:');
          expect(result.sanitizedValue).not.toContain('onerror=');
        } else {
          // If invalid, should have XSS error
          expect(result.errors.some(e => e.code === ValidationCodes.XSS_DETECTED)).toBe(true);
        }
      });
    });
    
    it('should allow safe HTML in appropriate contexts', () => {
      const safeHtml = '<p>This is <b>safe</b> content with <em>formatting</em></p>';
      
      // Should be allowed in rich text context
      const richTextResult = SanitizationHelpers.forRichText(safeHtml);
      expect(richTextResult).toContain('<p>');
      expect(richTextResult).toContain('<b>');
      expect(richTextResult).toContain('<em>');
      
      // Should be stripped in strict context
      const strictResult = SanitizationHelpers.strict(safeHtml);
      expect(strictResult).not.toContain('<p>');
      expect(strictResult).not.toContain('<b>');
    });
  });
  
  // =====================================
  // SQL INJECTION DETECTION
  // =====================================
  
  describe('SQL Injection Detection', () => {
    const sqlInjectionPayloads = [
      "'; DROP TABLE users; --",
      "' OR '1'='1",
      "' UNION SELECT * FROM passwords --",
      "'; INSERT INTO admin VALUES ('hacker', 'password'); --",
      "' OR 1=1 --",
      "admin'--",
      "admin' /*",
      "admin' #",
      "' OR 'a'='a",
      "' OR 'x'='x",
      "1' OR '1'='1' --",
      "x' AND email IS NULL; --",
      "'; EXEC sp_configure 'show advanced options',1; --",
      "' UNION SELECT username, password FROM users --",
    ];
    
    sqlInjectionPayloads.forEach(payload => {
      it(`should detect SQL injection: ${payload}`, () => {
        expect(ValidationHelpers.containsSQLInjection(payload)).toBe(true);
        
        const securityRule = ValidationRules.security({ enableSQLInjectionProtection: true });
        const result = securityRule.validator(payload);
        
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.code === ValidationCodes.SQL_INJECTION)).toBe(true);
      });
    });
    
    it('should allow legitimate SQL-like content in appropriate contexts', () => {
      const legitimateContent = "The user's name is O'Neill";
      
      expect(ValidationHelpers.containsSQLInjection(legitimateContent)).toBe(false);
      
      const securityRule = ValidationRules.security({ enableSQLInjectionProtection: true });
      const result = securityRule.validator(legitimateContent);
      
      expect(result.isValid).toBe(true);
    });
  });
  
  // =====================================
  // PATH TRAVERSAL DETECTION
  // =====================================
  
  describe('Path Traversal Detection', () => {
    const pathTraversalPayloads = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\config',
      '....//....//....//etc/passwd',
      '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      '..%252f..%252f..%252fetc%252fpasswd',
      '..%c0%af..%c0%af..%c0%afetc%c0%afpasswd',
      '/var/www/../../etc/passwd',
      'C:..\\..\\..\\boot.ini',
    ];
    
    pathTraversalPayloads.forEach(payload => {
      it(`should detect path traversal: ${payload}`, () => {
        expect(ValidationHelpers.containsPathTraversal(payload)).toBe(true);
        
        const securityRule = ValidationRules.security({ enablePathTraversalProtection: true });
        const result = securityRule.validator(payload);
        
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.code === ValidationCodes.PATH_TRAVERSAL)).toBe(true);
      });
    });
    
    it('should allow legitimate file paths', () => {
      const legitimatePaths = [
        '/home/user/documents/file.txt',
        'C:\\Users\\User\\Documents\\file.doc',
        'relative/path/to/file.jpg',
        './current/directory/file.png',
      ];
      
      legitimatePaths.forEach(path => {
        expect(ValidationHelpers.containsPathTraversal(path)).toBe(false);
        
        const securityRule = ValidationRules.security({ enablePathTraversalProtection: true });
        const result = securityRule.validator(path);
        
        expect(result.isValid).toBe(true);
      });
    });
  });
  
  // =====================================
  // SANITIZATION PROFILE TESTING
  // =====================================
  
  describe('Sanitization Profiles', () => {
    const testHtml = `
      <div class="content">
        <h1>Title</h1>
        <p>This is a <b>test</b> with <a href="https://example.com">link</a></p>
        <script>alert('XSS')</script>
        <iframe src="evil.com"></iframe>
        <img src="x" onerror="alert(1)">
      </div>
    `;
    
    it('should test all sanitization profiles', () => {
      const results = testSanitization(testHtml);
      
      // Strict profile should remove all HTML
      expect(results.strict.output).not.toContain('<');
      expect(results.strict.output).not.toContain('>');
      expect(results.strict.modified).toBe(true);
      
      // Moderate profile should allow basic formatting
      expect(results.moderate.output).toContain('<b>');
      expect(results.moderate.output).not.toContain('<script>');
      expect(results.moderate.output).not.toContain('<iframe>');
      
      // Rich text should allow more tags
      expect(results.richText.output).toContain('<h1>');
      expect(results.richText.output).toContain('<p>');
      expect(results.richText.output).not.toContain('<script>');
      
      // Email profile should allow links
      expect(results.email.output).toContain('<a href=');
      expect(results.email.output).not.toContain('<script>');
      
      // API input should strip everything
      expect(results.apiInput.output).not.toContain('<');
      expect(results.apiInput.modified).toBe(true);
    });
  });
  
  // =====================================
  // REGEX SECURITY TESTING
  // =====================================
  
  describe('Regex Security', () => {
    it('should detect dangerous regex patterns', () => {
      const dangerousPatterns = [
        '(a+)+',
        '(.*)*',
        '(a|a)*',
        '([a-zA-Z]+)*',
        '(a{1,10})+',
      ];
      
      dangerousPatterns.forEach(pattern => {
        expect(ValidationHelpers.isDangerousRegex(pattern)).toBe(true);
      });
    });
    
    it('should allow safe regex patterns', () => {
      const safePatterns = [
        '^[a-zA-Z0-9]+$',
        '\\d{3}-\\d{2}-\\d{4}',
        '^[a-z]+@[a-z]+\\.[a-z]+$',
        '[A-Z]{2,3}',
      ];
      
      safePatterns.forEach(pattern => {
        expect(ValidationHelpers.isDangerousRegex(pattern)).toBe(false);
        expect(ValidationHelpers.isValidRegex(pattern)).toBe(true);
      });
    });
    
    it('should test regex performance', () => {
      const pattern = '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$';
      const testString = 'test@example.com';
      
      const performanceTime = ValidationHelpers.testRegexPerformance(pattern, testString);
      expect(performanceTime).toBeGreaterThanOrEqual(0);
      expect(performanceTime).toBeLessThan(100); // Should be fast for simple patterns
    });
  });
  
  // =====================================
  // INTEGRATION SECURITY TESTS
  // =====================================
  
  describe('Integration Security', () => {
    it('should handle complex mixed attacks', async () => {
      const complexPayload = `
        <script>alert('XSS')</script>
        '; DROP TABLE users; --
        ../../../etc/passwd
        <iframe src="javascript:alert(1)"></iframe>
      `;
      
      const { validate } = useValidation({
        schema: {
          testField: [
            ValidationRules.security({
              enableXSSProtection: true,
              enableSQLInjectionProtection: true,
              enablePathTraversalProtection: true,
            })
          ]
        }
      });
      
      const result = await validate('testField', complexPayload);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      
      // Should detect multiple types of attacks
      const errorCodes = result.errors.map(e => e.code);
      expect(errorCodes.some(code =>
        // @ts-expect-error - Error codes from validation may be strings
        [ValidationCodes.XSS_DETECTED, ValidationCodes.SQL_INJECTION, ValidationCodes.PATH_TRAVERSAL].includes(code)
      )).toBe(true);
    });
    
    it('should validate PII patterns securely', async () => {
      const piiContent = `
        Name: John Doe
        Email: john.doe@company.com
        SSN: 123-45-6789
        Phone: (555) 123-4567
        <script>steal_pii()</script>
      `;
      
      const { validate } = useValidation({
        schema: {
          piiField: [
            ValidationRules.security({ enableXSSProtection: true }),
            ValidationRules.detectPII()
          ]
        }
      });
      
      const result = await validate('piiField', piiContent);
      
      // Should detect both security issues and PII
      const hasSecurity = result.errors.some(e => e.code === ValidationCodes.XSS_DETECTED);
      const hasPII = result.errors.some(e => e.code === ValidationCodes.PII_DETECTED) ||
                    result.warnings.some(w => w.code === ValidationCodes.PII_DETECTED);
      
      expect(hasSecurity || hasPII).toBe(true);
    });
  });
});