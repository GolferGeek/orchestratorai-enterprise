/**
 * Unit tests for BusinessAutomationAdvisorController
 *
 * Tests the REST API endpoints for the Business Automation Advisor agent.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import {
  applyInProcessAuthOverrides as applyAuthOverrides,
  resetAuthMocks,
} from '@orchestratorai/auth-client/testing';
import { BusinessAutomationAdvisorController } from './business-automation-advisor.controller';
import { BusinessAutomationAdvisorService } from './business-automation-advisor.service';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

describe('BusinessAutomationAdvisorController', () => {
  let controller: BusinessAutomationAdvisorController;
  let service: jest.Mocked<BusinessAutomationAdvisorService>;

  const mockContext = createMockExecutionContext({
    userId: 'user-456',
    orgSlug: 'test-org',
    conversationId: 'conv-123',
    provider: 'openai',
    model: 'gpt-4o',
  });

  const mockAgentRec = {
    name: 'Smart Appointment Scheduler',
    tagline: 'Automate booking',
    description: 'Handles scheduling',
    use_case_example: 'When client requests',
    time_saved: '3-5 hours per week',
    wow_factor: 'Learns patterns',
    category: 'Admin',
  };

  beforeEach(async () => {
    resetAuthMocks();
    const module: TestingModule = await applyAuthOverrides(
      Test.createTestingModule({
        controllers: [BusinessAutomationAdvisorController],
        providers: [
          {
            provide: BusinessAutomationAdvisorService,
            useValue: {
              generate: jest.fn(),
              submitInterest: jest.fn(),
            },
          },
        ],
      }),
    ).compile();

    controller = module.get<BusinessAutomationAdvisorController>(
      BusinessAutomationAdvisorController,
    );
    service = module.get(BusinessAutomationAdvisorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /business-automation-advisor/generate', () => {
    const validRequest = {
      context: mockContext,
      industry: 'healthcare technology',
    };

    it('should return success result for valid industry input', async () => {
      const mockResult = {
        status: 'success' as const,
        message: 'Recommendations generated successfully',
        data: {
          industry: 'Healthcare Technology',
          industryDescription: 'Digital health solutions',
          recommendationCount: 8,
          isFallback: false,
          recommendations: [mockAgentRec],
          processingTimeMs: 1500,
        },
      };

      service.generate.mockResolvedValue(mockResult);

      const result = await controller.generate(validRequest);

      expect(result).toEqual(mockResult);
      expect(service.generate).toHaveBeenCalledWith({
        context: mockContext,
        industry: 'healthcare technology',
      });
    });

    it('should throw BadRequestException when context is missing', async () => {
      const invalidRequest = {
        industry: 'healthcare',
      } as any;

      await expect(controller.generate(invalidRequest)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.generate(invalidRequest)).rejects.toThrow(
        'ExecutionContext is required',
      );
    });

    it('should throw BadRequestException when industry is missing', async () => {
      const invalidRequest = {
        context: mockContext,
        industry: '',
      };

      await expect(controller.generate(invalidRequest)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.generate(invalidRequest)).rejects.toThrow(
        'Industry input is required',
      );
    });

    it('should throw BadRequestException when industry is only whitespace', async () => {
      const invalidRequest = {
        context: mockContext,
        industry: '   ',
      };

      await expect(controller.generate(invalidRequest)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return partial result when fallback is used', async () => {
      const mockResult = {
        status: 'partial' as const,
        message: 'AI generation failed, using fallback recommendations',
        data: {
          industry: 'Consulting',
          industryDescription: 'Business consulting',
          recommendationCount: 8,
          isFallback: true,
          recommendations: [mockAgentRec],
          processingTimeMs: 500,
        },
      };

      service.generate.mockResolvedValue(mockResult);

      const result = await controller.generate(validRequest);

      expect(result.status).toBe('partial');
    });

    it('should throw BadRequestException when service throws', async () => {
      service.generate.mockRejectedValue(new Error('Service error'));

      await expect(controller.generate(validRequest)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should pass industry trimmed from request', async () => {
      service.generate.mockResolvedValue({
        status: 'success',
        message: 'OK',
        data: {
          industry: 'Healthcare',
          industryDescription: '',
          recommendationCount: 0,
          isFallback: false,
          recommendations: [],
          processingTimeMs: 100,
        },
      });

      const request = {
        context: mockContext,
        industry: 'healthcare',
      };

      await controller.generate(request);

      expect(service.generate).toHaveBeenCalledWith({
        context: mockContext,
        industry: 'healthcare',
      });
    });
  });

  describe('POST /business-automation-advisor/submit', () => {
    const validSubmitRequest = {
      email: 'user@example.com',
      name: 'Test User',
      company: 'Test Corp',
      industryInput: 'Healthcare',
      selectedAgents: [mockAgentRec],
    };

    it('should submit interest successfully', async () => {
      service.submitInterest.mockResolvedValue({
        success: true,
        submissionId: 'sub-123',
        message: 'Interest submitted successfully',
      });

      const result = await controller.submit(validSubmitRequest as any);

      expect(result.success).toBe(true);
      expect(result.submissionId).toBe('sub-123');
      expect(service.submitInterest).toHaveBeenCalledWith(validSubmitRequest);
    });

    it('should throw BadRequestException when email is missing', async () => {
      const invalidRequest = {
        selectedAgents: [mockAgentRec],
        industryInput: 'Healthcare',
      } as any;

      await expect(controller.submit(invalidRequest)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.submit(invalidRequest)).rejects.toThrow(
        'Email is required',
      );
    });

    it('should throw BadRequestException when selectedAgents is empty', async () => {
      const invalidRequest = {
        email: 'user@example.com',
        selectedAgents: [],
        industryInput: 'Healthcare',
      } as any;

      await expect(controller.submit(invalidRequest)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.submit(invalidRequest)).rejects.toThrow(
        'At least one agent must be selected',
      );
    });

    it('should throw BadRequestException when selectedAgents is missing', async () => {
      const invalidRequest = {
        email: 'user@example.com',
        industryInput: 'Healthcare',
      } as any;

      await expect(controller.submit(invalidRequest)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when service throws', async () => {
      service.submitInterest.mockRejectedValue(new Error('DB error'));

      await expect(
        controller.submit(validSubmitRequest as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return response from service directly', async () => {
      service.submitInterest.mockResolvedValue({
        success: false,
        submissionId: '',
        message: 'Duplicate submission',
      });

      const result = await controller.submit(validSubmitRequest as any);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Duplicate submission');
    });
  });
});
