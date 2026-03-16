import 'reflect-metadata';
import { TaskResponseDto } from './task-response.dto';
import { AgentTaskMode } from './task-request.dto';

describe('TaskResponseDto', () => {
  describe('success()', () => {
    it('should create a successful response', () => {
      const response = TaskResponseDto.success(AgentTaskMode.CONVERSE, {
        content: { message: 'Hello' },
        metadata: {
          provider: 'anthropic',
          model: 'claude',
          usage: {
            inputTokens: 10,
            outputTokens: 20,
            totalTokens: 30,
            cost: 0.01,
          },
        },
      });

      expect(response.success).toBe(true);
      expect(response.mode).toBe(AgentTaskMode.CONVERSE);
      expect(response.payload.content).toEqual({ message: 'Hello' });
      expect(response.humanResponse).toBeUndefined();
    });
  });

  describe('failure()', () => {
    it('should create a failure response', () => {
      const response = TaskResponseDto.failure(
        AgentTaskMode.BUILD,
        'Build failed due to validation error',
      );

      expect(response.success).toBe(false);
      expect(response.mode).toBe(AgentTaskMode.BUILD);
      expect(response.payload.metadata?.reason).toBe(
        'Build failed due to validation error',
      );
      expect(response.humanResponse).toBeUndefined();
    });
  });

  describe('human()', () => {
    it('should return mode as converse', () => {
      const response = TaskResponseDto.human(
        'Please review and approve this step',
      );

      expect(response.mode).toBe('converse');
    });

    it('should set success to false', () => {
      const response = TaskResponseDto.human(
        'Please review and approve this step',
      );

      expect(response.success).toBe(false);
    });

    it('should include action in content', () => {
      const response = TaskResponseDto.human(
        'Please review and approve this step',
      );

      expect(response.payload.content).toHaveProperty('action');
      const content = response.payload.content as { action?: string };
      expect(content.action).toBe('run_human_response');
    });

    it('should include message in content', () => {
      const message = 'Please review and approve this step';
      const response = TaskResponseDto.human(message);

      expect(response.payload.content).toHaveProperty('message');
      const content = response.payload.content as { message?: string };
      expect(content.message).toBe(message);
    });

    it('should include reason in content when provided as string', () => {
      const response = TaskResponseDto.human(
        'Please review',
        'Requires manager approval',
      );

      expect(response.payload.content).toHaveProperty('reason');
      const content = response.payload.content as { reason?: string };
      expect(content.reason).toBe('Requires manager approval');
    });

    it('should include reason in content when provided as third parameter', () => {
      const response = TaskResponseDto.human(
        'Please review',
        { stepId: 'step-1' },
        'High risk change',
      );

      expect(response.payload.content).toHaveProperty('reason');
      const content = response.payload.content as { reason?: string };
      expect(content.reason).toBe('High risk change');
    });

    it('should include metadata when provided as object', () => {
      const metadata = { stepId: 'step-1', priority: 'high' };
      const response = TaskResponseDto.human('Please review', metadata);

      expect(response.payload.metadata).toEqual(metadata);
    });

    it('should set humanResponse field with message and reason', () => {
      const message = 'Please review';
      const reason = 'Requires approval';
      const response = TaskResponseDto.human(message, reason);

      expect(response.humanResponse).toBeDefined();
      expect(response.humanResponse?.message).toBe(message);
      expect(response.humanResponse?.reason).toBe(reason);
    });

    it('should handle metadata object with reason parameter', () => {
      const metadata = { stepId: 'step-1' };
      const reason = 'Critical step';
      const response = TaskResponseDto.human('Please review', metadata, reason);

      expect(response.payload.metadata).toEqual(metadata);
      const content = response.payload.content as { reason?: string };
      expect(content.reason).toBe(reason);
      expect(response.humanResponse?.reason).toBe(reason);
    });

    it('should handle undefined reason', () => {
      const response = TaskResponseDto.human('Please review');

      const content = response.payload.content as { reason?: string };
      expect(content.reason).toBeUndefined();
      expect(response.humanResponse?.reason).toBeUndefined();
    });

    it('should use empty metadata object when none provided', () => {
      const response = TaskResponseDto.human('Please review');

      expect(response.payload.metadata).toEqual({});
    });
  });
});
