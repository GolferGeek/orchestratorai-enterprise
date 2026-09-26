import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { ConversationOwnershipService } from '../../../common/conversations/conversation-ownership.service';
import { DecisionRiskController } from '../decision-risk.controller';
import type { DecisionRiskService } from '../decision-risk.service';
import type { DecisionRiskAssessDto } from '../dto/decision-risk-assess.dto';

function setup() {
  const service = {
    startAssessment: jest.fn(async () => ({ runId: 'c1', status: 'running' })),
  };
  const conversations = { ensure: jest.fn(async () => undefined) };
  const controller = new DecisionRiskController(
    service as unknown as DecisionRiskService,
    conversations as unknown as ConversationOwnershipService,
  );
  const dto = {
    context: createMockExecutionContext({
      orgSlug: 'corporate',
      userId: 'user-1',
      agentSlug: 'decision-risk',
      agentType: 'workflow',
    }),
    proposition: 'Open a second office',
  } as DecisionRiskAssessDto;
  return { controller, service, conversations, dto };
}

describe('DecisionRiskController.assess', () => {
  it('ensures the conversation, then starts the run with the context whole', async () => {
    const { controller, service, conversations, dto } = setup();
    await controller.assess(dto, { id: 'user-1' }, { organizationSlug: 'corporate' });
    expect(conversations.ensure).toHaveBeenCalledWith(dto.context);
    expect(service.startAssessment).toHaveBeenCalledWith(dto.context, dto.proposition, '');
  });

  it.each([
    ['another user', 'user-2', 'corporate'],
    ['another organization', 'user-1', 'legal'],
    ['no organization', 'user-1', undefined],
  ])('refuses a context for %s', async (_label, userId, org) => {
    const { controller, service, dto } = setup();
    await expect(
      controller.assess(dto, { id: userId }, { organizationSlug: org }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.startAssessment).not.toHaveBeenCalled();
  });

  it('refuses a conversation that belongs to someone else, without saying why', async () => {
    const { controller, service, conversations, dto } = setup();
    conversations.ensure.mockRejectedValueOnce(new Error('Conversation ownership mismatch'));
    const call = controller.assess(dto, { id: 'user-1' }, { organizationSlug: 'corporate' });
    await expect(call).rejects.toBeInstanceOf(BadRequestException);
    await expect(call).rejects.not.toThrow('mismatch');
    expect(service.startAssessment).not.toHaveBeenCalled();
  });
});
