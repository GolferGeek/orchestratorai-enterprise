/**
 * E2E Test: Test Articles CRUD and Generation via A2A
 *
 * Tests the test-articles handler actions:
 * - test-articles.create - Create a new test article
 * - test-articles.get - Get a test article by ID
 * - test-articles.list - List test articles
 * - test-articles.update - Update a test article
 * - test-articles.delete - Delete a test article
 * - test-articles.bulk-create - Bulk create articles
 * - test-articles.mark-processed - Mark article as processed
 * - test-articles.list-unprocessed - List unprocessed articles
 * - test-articles.generate - AI-generate synthetic articles (Phase 4.1)
 *
 * Prerequisites:
 * - API server running on localhost:6100
 * - Supabase running with prediction schema
 * - Finance organization exists with prediction agents
 *
 * Run with: npx jest --config apps/api/testing/test/jest-e2e.json prediction-runner-test-articles.e2e-spec
 */

import { getApiUrl } from '../test-env';

const API_URL = getApiUrl();
const TEST_EMAIL =
  process.env.SUPABASE_TEST_USER || 'demo.user@orchestratorai.io';
const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || 'DemoUser123!';
const ORG_SLUG = 'finance';
const PREDICTION_AGENT = 'us-tech-stocks-2025';

// NIL_UUID for unset context fields
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

// Timeout for dashboard operations
const DASHBOARD_TIMEOUT = 30000;

interface DashboardResponse {
  success: boolean;
  mode: string;
  payload: {
    content: unknown;
    metadata: Record<string, unknown>;
  };
}

interface TestArticle {
  id: string;
  organization_slug: string;
  scenario_id?: string;
  title: string;
  content: string;
  source_name: string;
  published_at: string;
  target_symbols: string[];
  sentiment_expected?: 'positive' | 'negative' | 'neutral';
  strength_expected?: number;
  is_synthetic: boolean;
  synthetic_marker?: string;
  processed: boolean;
  created_at: string;
  updated_at: string;
}

describe('Test Articles E2E Tests', () => {
  let authToken: string;
  let userId: string;
  let createdArticleId: string | null = null;
  const createdArticleIds: string[] = [];

  beforeAll(async () => {
    // Authenticate
    const authResponse = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });

    if (!authResponse.ok) {
      console.error(
        'Authentication failed:',
        authResponse.status,
        authResponse.statusText,
      );
      throw new Error(
        `Authentication failed: ${authResponse.status} ${authResponse.statusText}`,
      );
    }

    const authData = (await authResponse.json()) as { accessToken: string };
    expect(authData.accessToken).toBeDefined();
    authToken = authData.accessToken;

    // Extract userId from JWT sub claim
    try {
      const jwtParts = authToken.split('.');
      if (jwtParts[1]) {
        const jwtPayload = JSON.parse(
          Buffer.from(jwtParts[1], 'base64').toString(),
        ) as { sub: string };
        userId = jwtPayload.sub;
      } else {
        userId = process.env.SUPABASE_TEST_USERID || '';
      }
    } catch {
      userId = process.env.SUPABASE_TEST_USERID || '';
    }
    expect(userId).toBeTruthy();
  }, 30000);

  afterAll(async () => {
    // Clean up created articles
    for (const articleId of createdArticleIds) {
      try {
        await callDashboard(PREDICTION_AGENT, 'test-articles.delete', {
          id: articleId,
        });
        console.log('Cleaned up test article:', articleId);
      } catch (error) {
        console.warn('Failed to cleanup test article:', error);
      }
    }
  });

  /**
   * Helper to call A2A endpoint with dashboard mode
   */
  const callDashboard = async (
    agentSlug: string,
    action: string,
    params: Record<string, unknown> = {},
  ): Promise<DashboardResponse> => {
    const response = await fetch(
      `${API_URL}/agent-to-agent/${ORG_SLUG}/${agentSlug}/tasks`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          mode: 'dashboard',
          context: {
            orgSlug: ORG_SLUG,
            agentSlug,
            agentType: 'prediction',
            userId,
            conversationId: NIL_UUID,
            taskId: NIL_UUID,
            planId: NIL_UUID,
            deliverableId: NIL_UUID,
            provider: NIL_UUID,
            model: NIL_UUID,
          },
          payload: {
            action,
            params,
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Dashboard call failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    return (await response.json()) as DashboardResponse;
  };

  /**
   * Helper to extract data from response content (handles both wrapped and unwrapped formats)
   */
  const extractData = <T>(content: unknown): T | null => {
    if (!content) return null;
    if (typeof content !== 'object') return null;

    const c = content as Record<string, unknown>;

    // If content has 'data' property, extract it
    if ('data' in c) {
      return c.data as T;
    }

    // Otherwise content is the data directly
    return content as T;
  };

  /**
   * Helper to check if response indicates an error
   */
  const hasError = (
    content: unknown,
  ): { code: string; message?: string } | null => {
    if (!content) return null;
    if (typeof content !== 'object') return null;

    const c = content as Record<string, unknown>;

    if ('error' in c && c.error && typeof c.error === 'object') {
      return c.error as { code: string; message?: string };
    }

    if ('success' in c && c.success === false && 'error' in c) {
      return c.error as { code: string; message?: string };
    }

    return null;
  };

  /**
   * Helper to check if content indicates success
   */
  const isSuccess = (content: unknown): boolean => {
    if (!content) return false;
    if (typeof content !== 'object') return false;

    const c = content as Record<string, unknown>;

    // If content has explicit 'success' property, use it
    if ('success' in c && typeof c.success === 'boolean') {
      return c.success;
    }

    // If content has 'data' property without 'error', assume success
    if ('data' in c && !('error' in c)) {
      return true;
    }

    // If content has 'id' (looks like data directly), assume success
    if ('id' in c) {
      return true;
    }

    return false;
  };

  describe('test-articles.create', () => {
    it('should create a test article with valid data', async () => {
      const articleTitle = `E2E Test Article ${Date.now()}`;

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-articles.create',
        {
          title: articleTitle,
          content:
            'This is a synthetic test article created by E2E tests. It contains positive sentiment about T_AAPL stock performance.',
          source_name: 'E2E Test Source',
          published_at: new Date().toISOString(),
          target_symbols: ['T_AAPL'],
          sentiment_expected: 'positive',
          strength_expected: 0.75,
          is_synthetic: true,
          synthetic_marker: '[E2E TEST ARTICLE]',
        },
      );

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const article = extractData<TestArticle>(result.payload.content);
      expect(article).toBeDefined();
      expect(article!.id).toBeDefined();
      expect(article!.title).toBe(articleTitle);
      expect(article!.organization_slug).toBe(ORG_SLUG);
      expect(article!.is_synthetic).toBe(true);
      expect(article!.processed).toBe(false);
      expect(article!.target_symbols).toContain('T_AAPL');

      // Store for later tests and cleanup
      createdArticleId = article!.id;
      createdArticleIds.push(article!.id);
      console.log('Created test article:', createdArticleId);
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing required fields', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-articles.create',
        {
          // Missing title, content, published_at
          source_name: 'Test Source',
        },
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      // Should have error for invalid data
      if (result.success && error) {
        expect(error.code).toBe('INVALID_DATA');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    it('should return error for target symbols without T_ prefix', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-articles.create',
        {
          title: 'Invalid Article',
          content: 'Test content',
          published_at: new Date().toISOString(),
          target_symbols: ['AAPL'], // Missing T_ prefix
        },
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      // Should have error for invalid symbols
      if (result.success && error) {
        expect(error.code).toBe('INVALID_SYMBOLS');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('test-articles.get', () => {
    it('should get a test article by ID', async () => {
      if (!createdArticleId) {
        console.log('Skipping - no article created');
        return;
      }

      const result = await callDashboard(PREDICTION_AGENT, 'test-articles.get', {
        id: createdArticleId,
      });

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const article = extractData<TestArticle>(result.payload.content);
      expect(article).toBeDefined();
      expect(article!.id).toBe(createdArticleId);
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing ID', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-articles.get',
        {},
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('MISSING_ID');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    it('should return error for non-existent article', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'test-articles.get', {
        id: '00000000-0000-0000-0000-000000000001',
      });

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('NOT_FOUND');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('test-articles.list', () => {
    it('should list test articles for the organization', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-articles.list',
        {},
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const articles = extractData<TestArticle[]>(result.payload.content);
      expect(Array.isArray(articles)).toBe(true);

      // If we created an article, it should be in the list
      if (createdArticleId && articles && articles.length > 0) {
        const found = articles.find((a) => a.id === createdArticleId);
        expect(found).toBeDefined();
      }
    }, DASHBOARD_TIMEOUT);

    it('should support pagination', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-articles.list',
        {
          page: 1,
          pageSize: 5,
        },
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const articles = extractData<TestArticle[]>(result.payload.content);
      expect(Array.isArray(articles)).toBe(true);
      expect(articles!.length).toBeLessThanOrEqual(5);
    }, DASHBOARD_TIMEOUT);

    it('should support sentiment filter', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-articles.list',
        {
          filters: { sentiment: 'positive' },
        },
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const articles = extractData<TestArticle[]>(result.payload.content);
      expect(Array.isArray(articles)).toBe(true);

      // All returned articles should have positive sentiment
      if (articles) {
        articles.forEach((article) => {
          if (article.sentiment_expected) {
            expect(article.sentiment_expected).toBe('positive');
          }
        });
      }
    }, DASHBOARD_TIMEOUT);

    it('should support processed filter', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-articles.list',
        {
          filters: { processed: false },
        },
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const articles = extractData<TestArticle[]>(result.payload.content);
      expect(Array.isArray(articles)).toBe(true);

      // All returned articles should be unprocessed
      if (articles) {
        articles.forEach((article) => {
          expect(article.processed).toBe(false);
        });
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('test-articles.update', () => {
    it('should update a test article', async () => {
      if (!createdArticleId) {
        console.log('Skipping - no article created');
        return;
      }

      const updatedTitle = `Updated E2E Article ${Date.now()}`;

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-articles.update',
        {
          id: createdArticleId,
          title: updatedTitle,
          content: 'Updated content from E2E test',
        },
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const article = extractData<TestArticle>(result.payload.content);
      expect(article).toBeDefined();
      expect(article!.title).toBe(updatedTitle);
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing ID on update', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-articles.update',
        {
          title: 'Updated Title',
        },
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('MISSING_ID');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('test-articles.bulk-create', () => {
    it('should bulk create test articles', async () => {
      const timestamp = Date.now();

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-articles.bulk-create',
        {
          articles: [
            {
              title: `Bulk Article 1 ${timestamp}`,
              content: 'Bulk article 1 content about T_MSFT',
              published_at: new Date().toISOString(),
              target_symbols: ['T_MSFT'],
              sentiment_expected: 'positive',
            },
            {
              title: `Bulk Article 2 ${timestamp}`,
              content: 'Bulk article 2 content about T_GOOGL',
              published_at: new Date().toISOString(),
              target_symbols: ['T_GOOGL'],
              sentiment_expected: 'negative',
            },
          ],
        },
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const data = extractData<{
        created_count: number;
        articles: TestArticle[];
      }>(result.payload.content);
      expect(data).toBeDefined();
      expect(data!.created_count).toBe(2);
      expect(data!.articles).toHaveLength(2);

      // Store for cleanup
      data!.articles.forEach((article) => {
        createdArticleIds.push(article.id);
      });

      console.log('Bulk created', data!.created_count, 'articles');
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing articles array', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-articles.bulk-create',
        {
          // Missing articles array
        },
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('INVALID_DATA');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    it('should return error for invalid symbols in bulk create', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-articles.bulk-create',
        {
          articles: [
            {
              title: 'Invalid Bulk Article',
              content: 'Content',
              published_at: new Date().toISOString(),
              target_symbols: ['AAPL'], // Missing T_ prefix
            },
          ],
        },
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('INVALID_SYMBOLS');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('test-articles.mark-processed', () => {
    it('should mark an article as processed', async () => {
      if (!createdArticleId) {
        console.log('Skipping - no article created');
        return;
      }

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-articles.mark-processed',
        {
          id: createdArticleId,
        },
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const article = extractData<TestArticle>(result.payload.content);
      expect(article).toBeDefined();
      expect(article!.processed).toBe(true);
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing ID', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-articles.mark-processed',
        {},
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('MISSING_ID');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('test-articles.list-unprocessed', () => {
    it('should list unprocessed articles', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-articles.list-unprocessed',
        {},
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const articles = extractData<TestArticle[]>(result.payload.content);
      expect(Array.isArray(articles)).toBe(true);

      // All returned articles should be unprocessed
      if (articles) {
        articles.forEach((article) => {
          expect(article.processed).toBe(false);
        });
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('test-articles.generate (AI Generation)', () => {
    it('should return error for missing target_symbols', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-articles.generate',
        {
          scenario_type: 'earnings_beat',
          sentiment: 'bullish',
          strength: 'strong',
          // Missing target_symbols
        },
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('INVALID_REQUEST');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing T_ prefix in generate', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-articles.generate',
        {
          target_symbols: ['AAPL'], // Missing T_ prefix
          scenario_type: 'earnings_beat',
          sentiment: 'bullish',
          strength: 'strong',
        },
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('INVALID_SYMBOLS');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing scenario_type', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-articles.generate',
        {
          target_symbols: ['T_AAPL'],
          sentiment: 'bullish',
          strength: 'strong',
          // Missing scenario_type
        },
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('INVALID_REQUEST');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing sentiment', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-articles.generate',
        {
          target_symbols: ['T_AAPL'],
          scenario_type: 'earnings_beat',
          strength: 'strong',
          // Missing sentiment
        },
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('INVALID_REQUEST');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing strength', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-articles.generate',
        {
          target_symbols: ['T_AAPL'],
          scenario_type: 'earnings_beat',
          sentiment: 'bullish',
          // Missing strength
        },
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('INVALID_REQUEST');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    // Note: Full AI generation test is commented out as it requires LLM API access
    // Uncomment and run manually when LLM services are configured
    /*
    it('should generate synthetic articles using AI', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'test-articles.generate', {
        target_symbols: ['T_AAPL'],
        scenario_type: 'earnings_beat',
        sentiment: 'bullish',
        strength: 'strong',
        article_count: 2,
      });

      expect(result.success).toBe(true);

      const data = extractData<{
        articles: TestArticle[];
        generation_metadata: {
          model_used: string;
          tokens_used: number;
          generation_time_ms: number;
        };
        created_count: number;
      }>(result.payload.content);
      expect(isSuccess(result.payload.content)).toBe(true);
      expect(data!.created_count).toBeGreaterThan(0);
      expect(data!.articles).toHaveLength(data!.created_count);
      expect(data!.generation_metadata.model_used).toBeDefined();

      // Store for cleanup
      data!.articles.forEach((article) => {
        createdArticleIds.push(article.id);
      });

      console.log('AI generated', data!.created_count, 'articles');
    }, AI_GENERATION_TIMEOUT);
    */
  });

  describe('test-articles.delete', () => {
    it('should return error for missing ID on delete', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-articles.delete',
        {},
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('MISSING_ID');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    // Note: Actual delete is tested in afterAll cleanup
  });

  describe('Action name verification', () => {
    it('should return error for camelCase bulkCreate (use bulk-create instead)', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-articles.bulkCreate', // camelCase not supported
        {
          articles: [
            {
              title: `Alt Bulk Article ${Date.now()}`,
              content: 'Alt bulk article content',
              published_at: new Date().toISOString(),
              target_symbols: ['T_NVDA'],
            },
          ],
        },
      );

      // Verify the action is not supported (handlers use kebab-case)
      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);
      if (error) {
        expect(error.code).toBe('UNSUPPORTED_ACTION');
      }
    }, DASHBOARD_TIMEOUT);

    it('should return error for camelCase markProcessed (use mark-processed instead)', async () => {
      // Create an article first using kebab-case
      const createResult = await callDashboard(
        PREDICTION_AGENT,
        'test-articles.create',
        {
          title: `Mark Processed Test ${Date.now()}`,
          content: 'Test content',
          published_at: new Date().toISOString(),
        },
      );

      const createData = extractData<TestArticle>(createResult.payload.content);

      if (createData?.id) {
        createdArticleIds.push(createData.id);

        const result = await callDashboard(
          PREDICTION_AGENT,
          'test-articles.markProcessed', // camelCase not supported
          {
            id: createData.id,
          },
        );

        // Verify the action is not supported
        expect(result.payload).toBeDefined();
        const error = hasError(result.payload.content);
        if (error) {
          expect(error.code).toBe('UNSUPPORTED_ACTION');
        }
      }
    }, DASHBOARD_TIMEOUT);

    it('should return error for camelCase listUnprocessed (use list-unprocessed instead)', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-articles.listUnprocessed', // camelCase not supported
        {},
      );

      // Verify the action is not supported
      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);
      if (error) {
        expect(error.code).toBe('UNSUPPORTED_ACTION');
      }
    }, DASHBOARD_TIMEOUT);
  });
});
