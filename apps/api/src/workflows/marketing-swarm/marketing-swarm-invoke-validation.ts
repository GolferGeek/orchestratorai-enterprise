import type {
  A2AInvokeRequest,
  ExecutionContext,
} from '@orchestrator-ai/transport-types';
import { validateA2AInvokeRequest } from '../../common/validation/a2a-invoke-validation';
import type { MarketingSwarmInput } from './marketing-swarm.service';

export type MarketingSwarmInvokeValidation =
  | {
      valid: true;
      id: string | number | null;
      context: ExecutionContext;
      input: MarketingSwarmInput;
    }
  | {
      valid: false;
      id: string | number | null;
      message: string;
    };

export function validateMarketingSwarmInvoke(
  body: unknown,
  authenticatedUserId: string,
  authorizedOrganizationSlug?: string,
): MarketingSwarmInvokeValidation {
  const envelope = validateA2AInvokeRequest(
    body,
    authenticatedUserId,
    authorizedOrganizationSlug,
  );
  if (!envelope.valid) {
    return envelope;
  }

  const request = envelope.request as A2AInvokeRequest;
  const { context, data, metadata } = request.params;
  if (
    context.agentSlug !== 'marketing-swarm' ||
    context.agentType !== 'workflow'
  ) {
    return invalid(
      request.id,
      'ExecutionContext must target marketing-swarm workflow',
    );
  }
  if (data.contentType !== 'json') {
    return invalid(request.id, 'Marketing Swarm data.contentType must be json');
  }
  if (metadata !== undefined) {
    return invalid(
      request.id,
      'Marketing Swarm does not accept invoke metadata',
    );
  }

  const content = asRecord(data.content);
  if (
    !content ||
    !hasOnlyKeys(content, ['contentTypeSlug', 'promptData', 'config'])
  ) {
    return invalid(request.id, 'Marketing Swarm content shape is invalid');
  }

  const contentTypeSlug = content['contentTypeSlug'];
  if (
    typeof contentTypeSlug !== 'string' ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(contentTypeSlug) ||
    contentTypeSlug.length > 100
  ) {
    return invalid(request.id, 'contentTypeSlug is invalid');
  }

  const promptData = validatePromptData(content['promptData']);
  if (!promptData) {
    return invalid(request.id, 'promptData is invalid');
  }
  const config = validateConfig(content['config']);
  if (!config) {
    return invalid(request.id, 'config is invalid');
  }

  return {
    valid: true,
    id: request.id,
    context,
    input: {
      context,
      taskId: context.conversationId,
      contentTypeSlug,
      promptData,
      config,
    },
  };
}

function validatePromptData(value: unknown): Record<string, unknown> | null {
  const prompt = asRecord(value);
  const allowed = [
    'topic',
    'audience',
    'goal',
    'keyPoints',
    'tone',
    'constraints',
    'examples',
    'additionalContext',
  ];
  if (!prompt || !hasOnlyKeys(prompt, allowed)) {
    return null;
  }
  for (const field of ['topic', 'audience', 'goal', 'tone']) {
    if (!isBoundedString(prompt[field], 1, 20_000)) {
      return null;
    }
  }
  const keyPoints = prompt['keyPoints'];
  if (
    !Array.isArray(keyPoints) ||
    keyPoints.length < 1 ||
    keyPoints.length > 20 ||
    !keyPoints.every((item) => isBoundedString(item, 1, 2_000))
  ) {
    return null;
  }
  for (const field of ['constraints', 'examples', 'additionalContext']) {
    if (
      prompt[field] !== undefined &&
      !isBoundedString(prompt[field], 0, 20_000)
    ) {
      return null;
    }
  }
  return prompt;
}

function validateConfig(value: unknown): MarketingSwarmInput['config'] | null {
  const config = asRecord(value);
  if (
    !config ||
    !hasOnlyKeys(config, ['writers', 'editors', 'evaluators', 'execution'])
  ) {
    return null;
  }
  const writers = validateSelections(config['writers']);
  const editors = validateSelections(config['editors']);
  const evaluators = validateSelections(config['evaluators']);
  const execution = asRecord(config['execution']);
  if (!writers || !editors || !evaluators || !execution) {
    return null;
  }
  if (
    !hasOnlyKeys(execution, [
      'maxLocalConcurrent',
      'maxCloudConcurrent',
      'maxEditCycles',
      'topNForFinalRanking',
      'topNForDeliverable',
    ]) ||
    !isIntegerInRange(execution['maxLocalConcurrent'], 1, 10) ||
    !isIntegerInRange(execution['maxCloudConcurrent'], 1, 20) ||
    !isIntegerInRange(execution['maxEditCycles'], 0, 10) ||
    !isIntegerInRange(execution['topNForFinalRanking'], 1, 20) ||
    (execution['topNForDeliverable'] !== undefined &&
      !isIntegerInRange(execution['topNForDeliverable'], 1, 20))
  ) {
    return null;
  }
  return {
    writers,
    editors,
    evaluators,
    execution,
  } as MarketingSwarmInput['config'];
}

function validateSelections(value: unknown): Array<{
  agentSlug: string;
  llmProvider: string;
  llmModel: string;
}> | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    return null;
  }
  const result = [];
  for (const candidate of value) {
    const selection = asRecord(candidate);
    if (
      !selection ||
      !hasOnlyKeys(selection, ['agentSlug', 'llmProvider', 'llmModel']) ||
      !isRouteValue(selection['agentSlug']) ||
      !isRouteValue(selection['llmProvider']) ||
      !isRouteValue(selection['llmModel'])
    ) {
      return null;
    }
    result.push({
      agentSlug: selection['agentSlug'],
      llmProvider: selection['llmProvider'],
      llmModel: selection['llmModel'],
    });
  }
  return result;
}

function invalid(
  id: string | number | null,
  message: string,
): MarketingSwarmInvokeValidation {
  return { valid: false, id, message };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isBoundedString(
  value: unknown,
  minimum: number,
  maximum: number,
): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length >= minimum &&
    value.length <= maximum
  );
}

function isRouteValue(value: unknown): value is string {
  return isBoundedString(value, 1, 200) && !/[\u0000-\u001f\u007f]/.test(value);
}

function isIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= maximum
  );
}
