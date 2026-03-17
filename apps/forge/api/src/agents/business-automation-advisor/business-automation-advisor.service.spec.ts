/**
 * Unit tests for BusinessAutomationAdvisorService
 *
 * Tests the service that manages the Business Automation Advisor agent lifecycle.
 */

// Mock PostgresSaver before any imports that need it
jest.mock('@langchain/langgraph-checkpoint-postgres', () => ({
  PostgresSaver: {
    fromConnString: jest.fn(() => ({
      setup: jest.fn().mockResolvedValue(undefined),
      put: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
    })),
  },
}));

jest.mock('pg', () => ({
  Pool: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    }),
    end: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue({ rows: [] }),
  })),
}));

// Mock the graph module to avoid actual LangGraph compilation
jest.mock('./business-automation-advisor.graph', () => ({
  createBusinessAutomationAdvisorGraph: jest.fn(async () => ({
    invoke: jest.fn().mockResolvedValue({
      status: 'completed',
      normalizedIndustry: 'Healthcare Technology',
      industryDescription: 'Digital health solutions',
      recommendations: [
        {
          name: 'Smart Appointment Scheduler',
          tagline: 'Automate booking',
          description: 'Handles scheduling',
          use_case_example: 'When client requests',
          time_saved: '3-5 hours per week',
          wow_factor: 'Learns patterns',
          category: 'Admin',
        },
      ],
      isFallback: false,
    }),
    getState: jest.fn().mockResolvedValue({
      values: {
        status: 'completed',
        normalizedIndustry: 'Healthcare Technology',
      },
      next: [],
    }),
  })),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { BusinessAutomationAdvisorService } from './business-automation-advisor.service';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';
import { BusinessAutomationAdvisorDbService } from './business-automation-advisor-db.service';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

describe('BusinessAutomationAdvisorService', () => {
  let service: BusinessAutomationAdvisorService;
  let dbService: jest.Mocked<BusinessAutomationAdvisorDbService>;

  const mockSaver = {
    setup: jest.fn().mockResolvedValue(undefined),
    put: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    list: jest.fn().mockReturnValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessAutomationAdvisorService,
        {
          provide: LLMHttpClientService,
          useValue: {
            callLLM: jest.fn().mockResolvedValue({
              text: 'Mocked LLM response',
              usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
            }),
          },
        },
        {
          provide: ObservabilityService,
          useValue: {
            emit: jest.fn().mockResolvedValue(undefined),
            emitStarted: jest.fn().mockResolvedValue(undefined),
            emitProgress: jest.fn().mockResolvedValue(undefined),
            emitCompleted: jest.fn().mockResolvedValue(undefined),
            emitFailed: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: PostgresCheckpointerService,
          useValue: {
            getSaver: jest.fn().mockResolvedValue(mockSaver),
          },
        },
        {
          provide: BusinessAutomationAdvisorDbService,
          useValue: {
            submitInterest: jest.fn().mockResolvedValue({
              success: true,
              submissionId: 'sub-123',
              message: 'Interest submitted successfully',
            }),
          },
        },
      ],
    }).compile();

    service = module.get<BusinessAutomationAdvisorService>(
      BusinessAutomationAdvisorService,
    );
    dbService = module.get(BusinessAutomationAdvisorDbService);

    await service.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize the graph', async () => {
      // onModuleInit is called in beforeEach

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const baaGraphMod = require('./business-automation-advisor.graph');
      const { createBusinessAutomationAdvisorGraph } = baaGraphMod;
      expect(createBusinessAutomationAdvisorGraph).toHaveBeenCalled();
    });
  });

  describe('generate', () => {
    const validContext = createMockExecutionContext({
      userId: 'user-456',
      conversationId: 'conv-789',
      orgSlug: 'org-abc',
      provider: 'openai',
      model: 'gpt-4o',
    });

    it('should return success result for valid industry input', async () => {
      const result = await service.generate({
        context: validContext,
        industry: 'healthcare technology',
      });

      expect(result.status).toBe('success');
      expect(result.message).toContain(
        'Recommendations generated successfully',
      );
      expect(result.data).toBeDefined();
    });

    it('should return taskId from context', async () => {
      const result = await service.generate({
        context: validContext,
        industry: 'retail',
      });

      expect(result.data).toBeDefined();
      if (result.data) {
        expect(result.data.industry).toBe('Healthcare Technology');
        expect(result.data.recommendations).toHaveLength(1);
      }
    });

    it('should return error when industry is empty', async () => {
      const result = await service.generate({
        context: validContext,
        industry: '',
      });

      expect(result.status).toBe('error');
      expect(result.message).toContain('Missing required field: industry');
      expect(result.error).toContain('Industry input is required');
    });

    it('should return error when industry is only whitespace', async () => {
      const result = await service.generate({
        context: validContext,
        industry: '   ',
      });

      expect(result.status).toBe('error');
      expect(result.message).toContain('Missing required field: industry');
    });

    it('should return partial status when graph uses fallback', async () => {
      // Override graph to return isFallback: true

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const baaGraphMod1 = require('./business-automation-advisor.graph');
      const { createBusinessAutomationAdvisorGraph } = baaGraphMod1;
      createBusinessAutomationAdvisorGraph.mockResolvedValueOnce({
        invoke: jest.fn().mockResolvedValue({
          status: 'completed',
          normalizedIndustry: 'Consulting',
          industryDescription: 'Business consulting',
          recommendations: [
            {
              name: 'Fallback Rec',
              tagline: 'Fallback tagline',
              description: 'Fallback desc',
              use_case_example: 'Fallback use case',
              time_saved: '3 hours',
              wow_factor: 'Fallback wow',
              category: 'Admin',
            },
          ],
          isFallback: true,
        }),
      });

      await service.onModuleInit();

      const result = await service.generate({
        context: validContext,
        industry: 'consulting',
      });

      expect(result.status).toBe('partial');
      expect(result.message).toContain('AI generation failed');
      if (result.data) {
        expect(result.data.isFallback).toBe(true);
      }
    });

    it('should return error when graph returns failed status', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const baaGraphMod2 = require('./business-automation-advisor.graph');
      const { createBusinessAutomationAdvisorGraph } = baaGraphMod2;
      createBusinessAutomationAdvisorGraph.mockResolvedValueOnce({
        invoke: jest.fn().mockResolvedValue({
          status: 'failed',
          error: 'Graph execution failed',
          recommendations: [],
          normalizedIndustry: '',
          industryDescription: '',
          isFallback: false,
        }),
      });

      await service.onModuleInit();

      const result = await service.generate({
        context: validContext,
        industry: 'unknown-industry',
      });

      expect(result.status).toBe('error');
      expect(result.message).toBe('Graph execution failed');
    });

    it('should handle graph throwing an error', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const baaGraphMod3 = require('./business-automation-advisor.graph');
      const { createBusinessAutomationAdvisorGraph } = baaGraphMod3;
      createBusinessAutomationAdvisorGraph.mockResolvedValueOnce({
        invoke: jest.fn().mockRejectedValue(new Error('Graph crashed')),
      });

      await service.onModuleInit();

      const result = await service.generate({
        context: validContext,
        industry: 'legal',
      });

      expect(result.status).toBe('error');
      expect(result.message).toBe('Failed to generate recommendations');
      expect(result.error).toBe('Graph crashed');
    });

    it('should trim industry input before processing', async () => {
      const result = await service.generate({
        context: validContext,
        industry: '  healthcare  ',
      });

      // Should not be an error (whitespace trimmed)
      expect(result.status).toBe('success');
    });

    it('should include processing time in result data', async () => {
      const result = await service.generate({
        context: validContext,
        industry: 'technology',
      });

      if (result.data) {
        expect(result.data.processingTimeMs).toBeGreaterThanOrEqual(0);
        expect(typeof result.data.processingTimeMs).toBe('number');
      }
    });
  });

  describe('submitInterest', () => {
    const mockAgentRec = {
      name: 'Smart Appointment Scheduler',
      tagline: 'Automate booking',
      description: 'Handles scheduling',
      use_case_example: 'When client requests',
      time_saved: '3-5 hours per week',
      wow_factor: 'Learns patterns',
      category: 'Admin',
    };

    it('should delegate to dbService.submitInterest', async () => {
      const request = {
        email: 'test@example.com',
        industryInput: 'Healthcare',
        selectedAgents: [mockAgentRec],
      };

      const result = await service.submitInterest(request);

      expect(dbService.submitInterest).toHaveBeenCalledWith(request);
      expect(result.success).toBe(true);
    });

    it('should return response from dbService', async () => {
      dbService.submitInterest.mockResolvedValueOnce({
        success: false,
        submissionId: '',
        message: 'Database error',
      });

      const result = await service.submitInterest({
        email: 'user@example.com',
        industryInput: 'Retail',
        selectedAgents: [mockAgentRec],
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Database error');
    });
  });
});
