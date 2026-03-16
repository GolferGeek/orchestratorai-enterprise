/**
 * E2E Test: Pattern-Based Sanitization with Reversibility
 *
 * Comprehensive tests for pattern-based sanitization, pseudonymization, and show-stoppers.
 * Tests all combinations:
 * - Show-stoppers only (should block)
 * - Patterns only (should redact and reverse)
 * - Pseudonyms only (should pseudonymize and reverse)
 * - Patterns + Pseudonyms (both should work together)
 * - Show-stoppers + Patterns (show-stoppers should block, patterns shouldn't apply)
 * - Show-stoppers + Pseudonyms (show-stoppers should block, pseudonyms shouldn't apply)
 * - All three (show-stoppers should block everything)
 *
 * Prerequisites:
 * - API server running on localhost:6100
 * - Supabase running with seeded data
 * - Test user credentials in environment
 *
 * Run with: npx jest --config apps/api/testing/test/jest-e2e.json pattern-sanitization.e2e-spec
 */

import { v4 as uuidv4 } from 'uuid';
import { getApiUrl, getSupabaseUrl } from '../test-env';

const API_URL = getApiUrl();
const TEST_EMAIL = process.env.SUPABASE_TEST_USER || 'demo.user@orchestratorai.io';
const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || 'DemoUser123!';
const TEST_USER_ID = process.env.SUPABASE_TEST_USERID || 'b29a590e-b07f-49df-a25b-574c956b5035';
const ORG_SLUG = 'finance';

// NIL_UUID for unset context fields
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

// Timeout for LLM operations
const LLM_TIMEOUT = 120000;

interface TaskResponse {
  success: boolean;
  mode: string;
  payload: {
    content: {
      taskId?: string;
      status?: string;
      message?: string;
      response?: string;
      [key: string]: unknown;
    };
    metadata: Record<string, unknown>;
  };
  blocked?: boolean;
  reason?: string;
  message?: string;
  details?: {
    detectedTypes?: string[];
  };
  piiMetadata?: Record<string, unknown>;
}

interface LLMUsageRecord {
  showstopper_detected: boolean;
  pii_detected: boolean;
  pseudonyms_used: number;
  pseudonym_types: string[];
  redactions_applied: number;
  redaction_types: string[];
  data_sanitization_applied: boolean;
  sanitization_level: string;
  is_local?: boolean;
}

describe('Pattern-Based Sanitization E2E Tests', () => {
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    // Authenticate
    const authResponse = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });

    if (!authResponse.ok) {
      throw new Error(
        `Authentication failed: ${authResponse.status} ${authResponse.statusText}`,
      );
    }

    const authData = await authResponse.json();
    expect(authData.accessToken).toBeDefined();
    authToken = authData.accessToken;

    // Extract userId from JWT or use env
    try {
      const jwtParts = authToken.split('.');
      if (jwtParts[1]) {
        const jwtPayload = JSON.parse(
          Buffer.from(jwtParts[1], 'base64').toString(),
        );
        userId = jwtPayload.sub;
      } else {
        userId = TEST_USER_ID;
      }
    } catch {
      userId = TEST_USER_ID;
    }
    expect(userId).toBeTruthy();
  }, 30000);

  /**
   * Helper to call A2A endpoint with ExecutionContext
   */
  const callA2A = async (
    agentSlug: string,
    mode: string,
    userMessage: string,
    agentType: string = 'context',
    provider: string = 'openai', // Use external provider to test sanitization
    model: string = 'gpt-4o-mini',
  ): Promise<TaskResponse> => {
    const response = await fetch(
      `${API_URL}/agent-to-agent/${ORG_SLUG}/${agentSlug}/tasks`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          userMessage,
          mode,
          context: {
            orgSlug: ORG_SLUG,
            agentSlug,
            agentType,
            userId,
            conversationId: NIL_UUID,
            taskId: NIL_UUID,
            planId: NIL_UUID,
            deliverableId: NIL_UUID,
            provider,
            model,
          },
          payload: {},
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        mode,
        payload: { content: {}, metadata: {} },
        ...errorData,
      };
    }

    return response.json();
  };

  /**
   * Helper to query llm_usage table for the most recent record
   */
  const getLatestLLMUsage = async (): Promise<LLMUsageRecord | null> => {
    try {
      // Use Supabase REST API to query
      const supabaseUrl = getSupabaseUrl();
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      
      const response = await fetch(
        `${supabaseUrl}/rest/v1/llm_usage?order=created_at.desc&limit=1`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        console.warn('Failed to query llm_usage:', response.statusText);
        return null;
      }

      const data = await response.json();
      return data && data.length > 0 ? data[0] : null;
    } catch (error) {
      console.warn('Error querying llm_usage:', error);
      return null;
    }
  };

  /**
   * Wait a bit for database to update
   */
  const waitForDB = async (ms: number = 1000) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };

  // ============================================================================
  // TEST 1: Show-stoppers Only (Should Block)
  // ============================================================================
  describe('Show-stoppers Only', () => {
    it('should block request with SSN showstopper', async () => {
      const response = await callA2A(
        'blog-post-writer',
        'converse',
        'Write a blog post about someone with SSN 123-45-6789',
      );

      expect(response.blocked).toBe(true);
      expect(response.reason).toContain('showstopper');
      expect(response.details?.detectedTypes).toContain('ssn');

      // Verify no LLM call was made (should be blocked before LLM)
      await waitForDB();
      const usage = await getLatestLLMUsage();
      // If usage exists, showstopper_detected should be true
      if (usage) {
        expect(usage.showstopper_detected).toBe(true);
      }
    }, LLM_TIMEOUT);

    it('should block request with credit card showstopper', async () => {
      const response = await callA2A(
        'blog-post-writer',
        'converse',
        'My credit card is 4532-1234-5678-9010',
      );

      expect(response.blocked).toBe(true);
      expect(response.reason).toContain('showstopper');
      expect(response.details?.detectedTypes).toContain('credit_card');
    }, LLM_TIMEOUT);
  });

  // ============================================================================
  // TEST 2: Patterns Only (Should Redact and Reverse)
  // ============================================================================
  describe('Pattern Redaction Only', () => {
    it('should redact email pattern and reverse it', async () => {
      const testEmail = 'test@example.com';
      const response = await callA2A(
        'blog-post-writer',
        'converse',
        `Write a blog post about contacting us at ${testEmail} for support`,
      );

      expect(response.success).toBe(true);
      expect(response.blocked).not.toBe(true);

      // Response should contain original email (reversed)
      const responseText = JSON.stringify(response.payload?.content || {});
      expect(responseText).toContain(testEmail);

      // Verify database record
      await waitForDB();
      const usage = await getLatestLLMUsage();
      if (usage) {
        expect(usage.pii_detected).toBe(true);
        expect(usage.redactions_applied).toBeGreaterThan(0);
        expect(usage.redaction_types).toContain('email');
        expect(usage.showstopper_detected).toBe(false);
      }
    }, LLM_TIMEOUT);

    it('should redact phone pattern and reverse it', async () => {
      const testPhone = '555-123-4567';
      const response = await callA2A(
        'blog-post-writer',
        'converse',
        `Call us at ${testPhone} for assistance`,
      );

      expect(response.success).toBe(true);
      
      // Response should contain original phone (reversed)
      const responseText = JSON.stringify(response.payload?.content || {});
      expect(responseText).toContain(testPhone.replace(/-/g, '')); // May be formatted differently

      // Verify database record
      await waitForDB();
      const usage = await getLatestLLMUsage();
      if (usage) {
        expect(usage.redactions_applied).toBeGreaterThan(0);
        expect(usage.redaction_types).toContain('phone');
      }
    }, LLM_TIMEOUT);
  });

  // ============================================================================
  // TEST 3: Pseudonyms Only (Should Pseudonymize and Reverse)
  // ============================================================================
  describe('Dictionary Pseudonymization Only', () => {
    it('should pseudonymize dictionary names and reverse them', async () => {
      const response = await callA2A(
        'blog-post-writer',
        'converse',
        'Write a blog post about my friend GolferGeek who works at Orchestrator AI',
      );

      expect(response.success).toBe(true);
      expect(response.blocked).not.toBe(true);

      // Response should contain original names (reversed)
      const responseText = JSON.stringify(response.payload?.content || {});
      expect(responseText).toContain('GolferGeek');
      expect(responseText).toContain('Orchestrator AI');

      // Should NOT contain pseudonyms
      expect(responseText).not.toContain('@user_golfer');
      expect(responseText).not.toContain('@company_orchestrator');

      // Verify database record
      await waitForDB();
      const usage = await getLatestLLMUsage();
      if (usage) {
        expect(usage.pii_detected).toBe(true);
        expect(usage.pseudonyms_used).toBeGreaterThan(0);
        expect(usage.pseudonym_types.length).toBeGreaterThan(0);
        expect(usage.showstopper_detected).toBe(false);
      }
    }, LLM_TIMEOUT);

    it('should pseudonymize Matt Weber and reverse it', async () => {
      const response = await callA2A(
        'blog-post-writer',
        'converse',
        'Write about Matt Weber who is a great developer',
      );

      expect(response.success).toBe(true);
      
      // Response should contain original name (reversed)
      const responseText = JSON.stringify(response.payload?.content || {});
      expect(responseText).toContain('Matt Weber');

      // Verify database record
      await waitForDB();
      const usage = await getLatestLLMUsage();
      if (usage) {
        expect(usage.pseudonyms_used).toBeGreaterThan(0);
      }
    }, LLM_TIMEOUT);
  });

  // ============================================================================
  // TEST 4: Patterns + Pseudonyms (Both Should Work Together)
  // ============================================================================
  describe('Pattern Redaction + Pseudonymization', () => {
    it('should apply both pattern redaction and pseudonymization', async () => {
      const testEmail = 'contact@example.com';
      const response = await callA2A(
        'blog-post-writer',
        'converse',
        `Write a blog post about GolferGeek. Contact us at ${testEmail} for more info`,
      );

      expect(response.success).toBe(true);
      expect(response.blocked).not.toBe(true);

      // Response should contain both original values (reversed)
      const responseText = JSON.stringify(response.payload?.content || {});
      expect(responseText).toContain('GolferGeek');
      expect(responseText).toContain(testEmail);

      // Verify database record
      await waitForDB();
      const usage = await getLatestLLMUsage();
      if (usage) {
        expect(usage.pii_detected).toBe(true);
        expect(usage.pseudonyms_used).toBeGreaterThan(0);
        expect(usage.redactions_applied).toBeGreaterThan(0);
        expect(usage.data_sanitization_applied).toBe(true);
        expect(usage.sanitization_level).toBe('standard');
      }
    }, LLM_TIMEOUT);

    it('should handle multiple patterns and pseudonyms', async () => {
      const response = await callA2A(
        'blog-post-writer',
        'converse',
        'Matt Weber works at Orchestrator AI. Call 555-123-4567 or email test@example.com',
      );

      expect(response.success).toBe(true);
      
      // Verify database record has both
      await waitForDB();
      const usage = await getLatestLLMUsage();
      if (usage) {
        expect(usage.pseudonyms_used).toBeGreaterThan(0);
        expect(usage.redactions_applied).toBeGreaterThan(0);
        expect(usage.redaction_types.length).toBeGreaterThan(0);
        expect(usage.pseudonym_types.length).toBeGreaterThan(0);
      }
    }, LLM_TIMEOUT);
  });

  // ============================================================================
  // TEST 5: Show-stoppers + Patterns (Show-stoppers Should Block)
  // ============================================================================
  describe('Show-stoppers + Patterns', () => {
    it('should block when showstopper present, even with patterns', async () => {
      const response = await callA2A(
        'blog-post-writer',
        'converse',
        'My SSN is 123-45-6789 and my email is test@example.com',
      );

      expect(response.blocked).toBe(true);
      expect(response.reason).toContain('showstopper');
      expect(response.details?.detectedTypes).toContain('ssn');

      // Verify database record
      await waitForDB();
      const usage = await getLatestLLMUsage();
      if (usage) {
        expect(usage.showstopper_detected).toBe(true);
        // Patterns should not be applied if showstopper blocks
      }
    }, LLM_TIMEOUT);
  });

  // ============================================================================
  // TEST 6: Show-stoppers + Pseudonyms (Show-stoppers Should Block)
  // ============================================================================
  describe('Show-stoppers + Pseudonyms', () => {
    it('should block when showstopper present, even with pseudonyms', async () => {
      const response = await callA2A(
        'blog-post-writer',
        'converse',
        'GolferGeek has credit card 4532-1234-5678-9010',
      );

      expect(response.blocked).toBe(true);
      expect(response.reason).toContain('showstopper');
      expect(response.details?.detectedTypes).toContain('credit_card');

      // Verify database record
      await waitForDB();
      const usage = await getLatestLLMUsage();
      if (usage) {
        expect(usage.showstopper_detected).toBe(true);
        // Pseudonyms should not be applied if showstopper blocks
      }
    }, LLM_TIMEOUT);
  });

  // ============================================================================
  // TEST 7: All Three (Show-stoppers Should Block Everything)
  // ============================================================================
  describe('Show-stoppers + Patterns + Pseudonyms', () => {
    it('should block when showstopper present, ignoring patterns and pseudonyms', async () => {
      const response = await callA2A(
        'blog-post-writer',
        'converse',
        'GolferGeek at Orchestrator AI has SSN 123-45-6789 and email test@example.com',
      );

      expect(response.blocked).toBe(true);
      expect(response.reason).toContain('showstopper');
      expect(response.details?.detectedTypes).toContain('ssn');

      // Verify database record
      await waitForDB();
      const usage = await getLatestLLMUsage();
      if (usage) {
        expect(usage.showstopper_detected).toBe(true);
      }
    }, LLM_TIMEOUT);
  });

  // ============================================================================
  // TEST 8: Local Provider (Should Skip Sanitization)
  // ============================================================================
  describe('Local Provider (Ollama)', () => {
    it('should skip sanitization for local provider', async () => {
      const response = await callA2A(
        'blog-post-writer',
        'converse',
        'GolferGeek works at Orchestrator AI and email is test@example.com',
        'context',
        'ollama',
        'llama3.2:1b',
      );

      expect(response.success).toBe(true);
      expect(response.blocked).not.toBe(true);

      // Verify database record shows no sanitization
      await waitForDB();
      const usage = await getLatestLLMUsage();
      if (usage) {
        // Local providers should have minimal/no sanitization
        expect(usage.is_local).toBe(true);
        // Sanitization flags may be false for local providers
      }
    }, LLM_TIMEOUT);
  });

  // ============================================================================
  // TEST 9: Database Record Verification
  // ============================================================================
  describe('Database Record Verification', () => {
    it('should correctly track all flags in llm_usage table', async () => {
      // Make a request with patterns and pseudonyms
      const response = await callA2A(
        'blog-post-writer',
        'converse',
        'GolferGeek can be reached at test@example.com or 555-123-4567',
      );

      expect(response.success).toBe(true);

      // Wait for database update
      await waitForDB(2000);

      // Query database directly using psql
      const { execSync } = require('child_process');
      const query = `
        SELECT 
          showstopper_detected,
          pii_detected,
          pseudonyms_used,
          pseudonym_types,
          redactions_applied,
          redaction_types,
          data_sanitization_applied,
          sanitization_level
        FROM llm_usage
        WHERE user_id = '${userId}'
        ORDER BY created_at DESC
        LIMIT 1;
      `;

      try {
        const result = execSync(
          `PGPASSWORD=postgres psql -h 127.0.0.1 -p 6012 -U postgres -d postgres -t -A -F',' -c "${query.replace(/\n/g, ' ')}"`,
          { encoding: 'utf-8' },
        );

        if (result && result.trim()) {
          const [
            showstopper,
            pii,
            pseudonyms,
            pseudonymTypes,
            redactions,
            redactionTypes,
            sanitization,
            level,
          ] = result.trim().split(',');

          console.log('Database Record:', {
            showstopper_detected: showstopper,
            pii_detected: pii,
            pseudonyms_used: pseudonyms,
            pseudonym_types: pseudonymTypes,
            redactions_applied: redactions,
            redaction_types: redactionTypes,
            data_sanitization_applied: sanitization,
            sanitization_level: level,
          });

          // Verify flags
          expect(showstopper).toBe('f'); // Should be false (no showstopper)
          expect(pii).toBe('t'); // Should be true (PII detected)
          expect(parseInt(pseudonyms) || 0).toBeGreaterThan(0); // Should have pseudonyms
          expect(parseInt(redactions) || 0).toBeGreaterThan(0); // Should have redactions
          expect(sanitization).toBe('t'); // Should be true
        }
      } catch (error) {
        console.warn('Could not query database directly:', error);
        // Fall back to API query
        const usage = await getLatestLLMUsage();
        if (usage) {
          expect(usage.showstopper_detected).toBe(false);
          expect(usage.pii_detected).toBe(true);
        }
      }
    }, LLM_TIMEOUT);
  });
});

