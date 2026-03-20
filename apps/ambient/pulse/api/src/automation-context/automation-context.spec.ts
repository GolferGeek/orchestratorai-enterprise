/**
 * Automation Context unit tests
 *
 * Tests createSystemTriggeredContext, isSystemTriggered, and
 * validateSystemContext for correct ExecutionContext shape and rules.
 */

import {
  createSystemTriggeredContext,
  isSystemTriggered,
  validateSystemContext,
} from './automation-context';
import { NIL_UUID } from '@orchestrator-ai/transport-types';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

describe('createSystemTriggeredContext', () => {
  it('creates ExecutionContext with NIL_UUID userId and agentType system', () => {
    const ctx = createSystemTriggeredContext({
      orgSlug: 'acme',
      agentSlug: 'predictor',
      provider: 'openai',
      model: 'gpt-4o',
    });

    expect(ctx.userId).toBe(NIL_UUID);
    expect(ctx.agentType).toBe('system');
    expect(ctx.orgSlug).toBe('acme');
    expect(ctx.agentSlug).toBe('predictor');
    expect(ctx.provider).toBe('openai');
    expect(ctx.model).toBe('gpt-4o');
  });

  it('uses NIL_UUID for conversationId when not provided', () => {
    const ctx = createSystemTriggeredContext({
      orgSlug: 'acme',
      agentSlug: 'risk-runner',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    });

    expect(ctx.conversationId).toBe(NIL_UUID);
  });

  it('uses provided conversationId when given', () => {
    const ctx = createSystemTriggeredContext({
      orgSlug: 'acme',
      agentSlug: 'predictor',
      provider: 'openai',
      model: 'gpt-4o',
      conversationId: 'trace-conv-1',
    });

    expect(ctx.conversationId).toBe('trace-conv-1');
  });
});

describe('isSystemTriggered', () => {
  it('returns true for a system-triggered context', () => {
    const ctx = createSystemTriggeredContext({
      orgSlug: 'acme',
      agentSlug: 'predictor',
      provider: 'openai',
      model: 'gpt-4o',
    });

    expect(isSystemTriggered(ctx)).toBe(true);
  });

  it('returns false for a user-originated context', () => {
    const ctx = createMockExecutionContext({ agentType: 'context' });

    expect(isSystemTriggered(ctx)).toBe(false);
  });

  it('returns false when only userId is NIL_UUID but agentType is not system', () => {
    const ctx = createMockExecutionContext({ userId: NIL_UUID, agentType: 'context' });

    expect(isSystemTriggered(ctx)).toBe(false);
  });
});

describe('validateSystemContext', () => {
  it('returns undefined for a valid system-triggered context', () => {
    const ctx = createSystemTriggeredContext({
      orgSlug: 'acme',
      agentSlug: 'predictor',
      provider: 'openai',
      model: 'gpt-4o',
    });

    expect(validateSystemContext(ctx)).toBeUndefined();
  });

  it('returns an error message when userId is not NIL_UUID', () => {
    const ctx = createMockExecutionContext({ agentType: 'system' });

    const error = validateSystemContext(ctx);

    expect(error).toContain('NIL_UUID');
  });

  it('returns an error message when agentType is not system', () => {
    const ctx = createMockExecutionContext({ userId: NIL_UUID, agentType: 'context' });

    const error = validateSystemContext(ctx);

    expect(error).toContain('system');
  });
});
