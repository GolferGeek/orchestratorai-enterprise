/**
 * Unit tests for BusinessAutomationAdvisorGraph
 *
 * Tests the LangGraph workflow for the Business Automation Advisor agent.
 * Mocks LLM calls and checkpointer to test graph logic in isolation.
 */

import { MemorySaver } from '@langchain/langgraph';
import { createBusinessAutomationAdvisorGraph } from './business-automation-advisor.graph';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

describe('BusinessAutomationAdvisorGraph', () => {
  let llmClient: jest.Mocked<LLMHttpClientService>;
  let observability: jest.Mocked<ObservabilityService>;
  let checkpointer: jest.Mocked<PostgresCheckpointerService>;
  let memorySaver: MemorySaver;

  // Thread counter to ensure unique thread IDs
  let threadCounter = 0;
  function nextThread(): string {
    return `test-thread-${++threadCounter}`;
  }

  const validRecommendations = [
    {
      name: 'Smart Appointment Scheduler',
      tagline: 'Automate booking, reminders, and calendar management',
      description: 'Handles appointment scheduling across multiple calendars',
      use_case_example: 'When a client requests an appointment via email',
      time_saved: '3-5 hours per week',
      wow_factor: 'Learns optimal scheduling patterns',
      category: 'Admin',
    },
    {
      name: 'Invoice Chaser Pro',
      tagline: 'Never manually follow up on unpaid invoices again',
      description: 'Automatically tracks invoice payment status',
      use_case_example: 'When an invoice is 7 days overdue',
      time_saved: '4-6 hours per week',
      wow_factor: 'Adjusts communication style',
      category: 'Finance',
    },
    {
      name: 'Lead Response Lightning',
      tagline: 'Engage new leads within 60 seconds automatically',
      description: 'Instantly responds to new lead inquiries',
      use_case_example: 'When someone fills out your contact form',
      time_saved: '10+ hours per week',
      wow_factor: 'Increases conversion rates by 30-40%',
      category: 'Sales',
    },
    {
      name: 'Meeting Notes Tracker',
      tagline: 'Turn every meeting into actionable next steps',
      description: 'Records meetings and generates summaries',
      use_case_example: 'After each client call',
      time_saved: '2-3 hours per week',
      wow_factor: 'Integrates with your project management tools',
      category: 'Operations',
    },
    {
      name: 'Social Media Content Recycler',
      tagline: 'Keep your social presence active without daily effort',
      description: 'Analyzes your best-performing content',
      use_case_example: 'When you publish a blog post',
      time_saved: '5-8 hours per week',
      wow_factor: 'Learns which content types perform best',
      category: 'Marketing',
    },
    {
      name: 'Customer Onboarding Autopilot',
      tagline: 'Welcome new customers with a flawless automated experience',
      description: 'Guides new customers through setup',
      use_case_example: 'When someone signs up',
      time_saved: '6-10 hours per week',
      wow_factor: 'Personalizes the journey based on customer type',
      category: 'Customer Service',
    },
    {
      name: 'Expense Report Auto-Processor',
      tagline: 'Turn receipt photos into categorized expense reports instantly',
      description: 'Scans receipts via photo or email',
      use_case_example: 'When you snap a photo of a receipt',
      time_saved: '2-4 hours per week',
      wow_factor: 'Flags policy violations before submission',
      category: 'Finance',
    },
    {
      name: 'Email Newsletter Auto-Curator',
      tagline: 'Generate engaging newsletters from your content library',
      description: 'Analyzes your blog posts and social media',
      use_case_example: 'Each month, scans your content',
      time_saved: '4-6 hours per month',
      wow_factor: 'A/B tests subject lines',
      category: 'Marketing',
    },
  ];

  beforeEach(() => {
    memorySaver = new MemorySaver();

    llmClient = {
      callLLM: jest.fn(),
    } as unknown as jest.Mocked<LLMHttpClientService>;

    observability = {
      emit: jest.fn().mockResolvedValue(undefined),
      emitStarted: jest.fn().mockResolvedValue(undefined),
      emitProgress: jest.fn().mockResolvedValue(undefined),
      emitCompleted: jest.fn().mockResolvedValue(undefined),
      emitFailed: jest.fn().mockResolvedValue(undefined),
      emitHitlWaiting: jest.fn().mockResolvedValue(undefined),
      emitHitlResumed: jest.fn().mockResolvedValue(undefined),
      emitToolCalling: jest.fn().mockResolvedValue(undefined),
      emitToolCompleted: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ObservabilityService>;

    checkpointer = {
      getSaver: jest.fn().mockResolvedValue(memorySaver),
    } as unknown as jest.Mocked<PostgresCheckpointerService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createBusinessAutomationAdvisorGraph', () => {
    it('should create a graph successfully', async () => {
      const graph = await createBusinessAutomationAdvisorGraph(
        llmClient,
        observability,
        checkpointer,
      );

      expect(graph).toBeDefined();
      expect(checkpointer.getSaver).toHaveBeenCalled();
    });

    it('should use the checkpointer saver', async () => {
      await createBusinessAutomationAdvisorGraph(
        llmClient,
        observability,
        checkpointer,
      );

      expect(checkpointer.getSaver).toHaveBeenCalled();
      expect(memorySaver).toBeDefined();
    });
  });

  describe('graph execution - normalizeIndustry node', () => {
    const mockContext = createMockExecutionContext({
      userId: 'user-456',
      conversationId: 'conv-789',
      orgSlug: 'org-abc',
      provider: 'openai',
      model: 'gpt-4o',
    });

    it('should complete graph execution with successful LLM response', async () => {
      // Mock normalize industry LLM call
      llmClient.callLLM
        .mockResolvedValueOnce({
          text: '{"normalized_industry": "Healthcare Technology", "description": "Digital health solutions", "common_business_types": "telemedicine, EHR systems"}',
          usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
        })
        // Mock generate ideas LLM call
        .mockResolvedValueOnce({
          text: JSON.stringify(validRecommendations),
          usage: { promptTokens: 200, completionTokens: 400, totalTokens: 600 },
        });

      const graph = await createBusinessAutomationAdvisorGraph(
        llmClient,
        observability,
        checkpointer,
      );

      const initialState = {
        executionContext: mockContext,
        industryInput: 'healthcare technology',
        status: 'started' as const,
        startedAt: Date.now(),
      };

      const config = {
        configurable: { thread_id: nextThread() },
      };

      const result = await graph.invoke(initialState, config);

      expect(result).toBeDefined();
      expect(result.status).toBe('completed');
      expect(result.recommendations).toHaveLength(8);
      expect(result.isFallback).toBe(false);
    });

    it('should emit observability events during execution', async () => {
      llmClient.callLLM
        .mockResolvedValueOnce({
          text: '{"normalized_industry": "Retail", "description": "Retail business", "common_business_types": "online, brick-and-mortar"}',
        })
        .mockResolvedValueOnce({
          text: JSON.stringify(validRecommendations),
        });

      const graph = await createBusinessAutomationAdvisorGraph(
        llmClient,
        observability,
        checkpointer,
      );

      await graph.invoke(
        {
          executionContext: mockContext,
          industryInput: 'retail',
          status: 'started' as const,
          startedAt: Date.now(),
        },
        { configurable: { thread_id: nextThread() } },
      );

      expect(observability.emitStarted).toHaveBeenCalled();
      expect(observability.emitProgress).toHaveBeenCalled();
      expect(observability.emitCompleted).toHaveBeenCalled();
    });

    it('should use fallback recommendations when LLM fails during normalization', async () => {
      llmClient.callLLM
        .mockRejectedValueOnce(new Error('LLM service unavailable'))
        .mockRejectedValueOnce(new Error('LLM service unavailable'));

      const graph = await createBusinessAutomationAdvisorGraph(
        llmClient,
        observability,
        checkpointer,
      );

      const result = await graph.invoke(
        {
          executionContext: mockContext,
          industryInput: 'dentistry',
          status: 'started' as const,
          startedAt: Date.now(),
        },
        { configurable: { thread_id: nextThread() } },
      );

      expect(result.status).toBe('completed');
      // The graph uses FALLBACK_RECOMMENDATIONS when LLM fails
      expect(result.isFallback).toBe(true);
      expect(result.recommendations).toHaveLength(8);
    });

    it('should use fallback when normalization returns non-JSON response', async () => {
      // First LLM call succeeds but returns non-JSON (normalization)
      llmClient.callLLM
        .mockResolvedValueOnce({
          text: 'Not valid JSON - just a plain text response',
        })
        // Second LLM call (generate ideas) fails
        .mockRejectedValueOnce(new Error('Generate failed'));

      const graph = await createBusinessAutomationAdvisorGraph(
        llmClient,
        observability,
        checkpointer,
      );

      const result = await graph.invoke(
        {
          executionContext: mockContext,
          industryInput: 'consulting',
          status: 'started' as const,
          startedAt: Date.now(),
        },
        { configurable: { thread_id: nextThread() } },
      );

      // Should complete even with fallback
      expect(result.status).toBe('completed');
      expect(result.isFallback).toBe(true);
    });

    it('should use fallback when generate ideas returns invalid JSON', async () => {
      llmClient.callLLM
        .mockResolvedValueOnce({
          text: '{"normalized_industry": "Legal", "description": "Law firms", "common_business_types": "law firms"}',
        })
        .mockResolvedValueOnce({
          text: 'Not a JSON array',
        });

      const graph = await createBusinessAutomationAdvisorGraph(
        llmClient,
        observability,
        checkpointer,
      );

      const result = await graph.invoke(
        {
          executionContext: mockContext,
          industryInput: 'legal',
          status: 'started' as const,
          startedAt: Date.now(),
        },
        { configurable: { thread_id: nextThread() } },
      );

      expect(result.status).toBe('completed');
      expect(result.isFallback).toBe(true);
      expect(result.recommendations).toHaveLength(8);
    });

    it('should use fallback when ideas array has wrong length', async () => {
      // Too few recommendations (less than 8)
      const tooFewIdeas = validRecommendations.slice(0, 3);

      llmClient.callLLM
        .mockResolvedValueOnce({
          text: '{"normalized_industry": "Manufacturing", "description": "Manufacturing", "common_business_types": "factories"}',
        })
        .mockResolvedValueOnce({
          text: JSON.stringify(tooFewIdeas),
        });

      const graph = await createBusinessAutomationAdvisorGraph(
        llmClient,
        observability,
        checkpointer,
      );

      const result = await graph.invoke(
        {
          executionContext: mockContext,
          industryInput: 'manufacturing',
          status: 'started' as const,
          startedAt: Date.now(),
        },
        { configurable: { thread_id: nextThread() } },
      );

      expect(result.status).toBe('completed');
      expect(result.isFallback).toBe(true);
    });

    it('should use fallback when ideas have missing required fields', async () => {
      // Ideas with missing required fields
      const invalidIdeas = [
        { name: 'Missing tagline' },
        { name: 'Also missing', tagline: 'has tagline but no description' },
      ];

      llmClient.callLLM
        .mockResolvedValueOnce({
          text: '{"normalized_industry": "Education", "description": "Educational services", "common_business_types": "schools, tutoring"}',
        })
        .mockResolvedValueOnce({
          text: JSON.stringify(invalidIdeas),
        });

      const graph = await createBusinessAutomationAdvisorGraph(
        llmClient,
        observability,
        checkpointer,
      );

      const result = await graph.invoke(
        {
          executionContext: mockContext,
          industryInput: 'education',
          status: 'started' as const,
          startedAt: Date.now(),
        },
        { configurable: { thread_id: nextThread() } },
      );

      // Should fall back since ideas don't have 8+ items and missing fields
      expect(result.status).toBe('completed');
      expect(result.isFallback).toBe(true);
    });

    it('should extract JSON array embedded in text response', async () => {
      const embeddedJson =
        'Here are some recommendations:\n' +
        JSON.stringify(validRecommendations) +
        '\nThese are great ideas!';

      llmClient.callLLM
        .mockResolvedValueOnce({
          text: '{"normalized_industry": "Healthcare", "description": "Healthcare", "common_business_types": "hospitals"}',
        })
        .mockResolvedValueOnce({
          text: embeddedJson,
        });

      const graph = await createBusinessAutomationAdvisorGraph(
        llmClient,
        observability,
        checkpointer,
      );

      const result = await graph.invoke(
        {
          executionContext: mockContext,
          industryInput: 'healthcare',
          status: 'started' as const,
          startedAt: Date.now(),
        },
        { configurable: { thread_id: nextThread() } },
      );

      expect(result.status).toBe('completed');
      expect(result.isFallback).toBe(false);
      expect(result.recommendations).toHaveLength(8);
    });

    it('should handle JSON in code block format', async () => {
      const codeBlockJson =
        '```json\n' + JSON.stringify(validRecommendations) + '\n```';

      llmClient.callLLM
        .mockResolvedValueOnce({
          text: '```json\n{"normalized_industry": "Finance", "description": "Financial services", "common_business_types": "banks"}\n```',
        })
        .mockResolvedValueOnce({
          text: codeBlockJson,
        });

      const graph = await createBusinessAutomationAdvisorGraph(
        llmClient,
        observability,
        checkpointer,
      );

      const result = await graph.invoke(
        {
          executionContext: mockContext,
          industryInput: 'finance',
          status: 'started' as const,
          startedAt: Date.now(),
        },
        { configurable: { thread_id: nextThread() } },
      );

      // JSON in code block for normalization may fail parsing and use raw input
      // For the ideas, code blocks are cleaned before parsing
      expect(result.status).toBe('completed');
    });

    it('should handle normalizeIndustry with JSON in code blocks', async () => {
      llmClient.callLLM
        .mockResolvedValueOnce({
          text: '```json\n{"normalized_industry": "Technology", "description": "Tech companies", "common_business_types": "software, hardware"}\n```',
        })
        .mockResolvedValueOnce({
          text: JSON.stringify(validRecommendations),
        });

      const graph = await createBusinessAutomationAdvisorGraph(
        llmClient,
        observability,
        checkpointer,
      );

      const result = await graph.invoke(
        {
          executionContext: mockContext,
          industryInput: 'technology',
          status: 'started' as const,
          startedAt: Date.now(),
        },
        { configurable: { thread_id: nextThread() } },
      );

      // Should succeed with cleaned JSON
      expect(result.status).toBe('completed');
    });
  });
});
