import {
  A2AInvokeRequest,
  isExecutionContext,
} from '@orchestrator-ai/transport-types';

export type InvokeValidationResult =
  | { valid: true; request: A2AInvokeRequest }
  | {
      valid: false;
      id: string | number | null;
      message: string;
    };

export function validateA2AInvokeRequest(
  body: unknown,
  authenticatedUserId: string,
  authorizedOrganizationSlug?: string,
): InvokeValidationResult {
  const candidate =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const rawId = candidate['id'];
  const id =
    typeof rawId === 'string' || typeof rawId === 'number' || rawId === null
      ? rawId
      : null;

  if (
    candidate['jsonrpc'] !== '2.0' ||
    candidate['method'] !== 'invoke' ||
    !('id' in candidate) ||
    (typeof rawId !== 'string' &&
      typeof rawId !== 'number' &&
      rawId !== null)
  ) {
    return {
      valid: false,
      id,
      message:
        'Invalid JSON-RPC request: jsonrpc="2.0", method="invoke", and a valid id are required',
    };
  }

  if (!hasOnlyKeys(candidate, ['jsonrpc', 'id', 'method', 'params'])) {
    return {
      valid: false,
      id,
      message: 'JSON-RPC request contains unsupported fields',
    };
  }

  const params = candidate['params'];
  if (typeof params !== 'object' || params === null) {
    return { valid: false, id, message: 'params must be an object' };
  }

  const typedParams = params as Record<string, unknown>;
  if (!hasOnlyKeys(typedParams, ['context', 'data', 'metadata'])) {
    return { valid: false, id, message: 'params contains unsupported fields' };
  }

  const context = typedParams['context'];
  if (
    !isExecutionContext(context) ||
    (context as unknown as Record<string, unknown>)['sovereignMode'] !==
      undefined &&
      typeof (context as unknown as Record<string, unknown>)[
        'sovereignMode'
      ] !== 'boolean' ||
    Object.values(context).some(
      (value) => typeof value === 'string' && !value.trim(),
    )
  ) {
    return {
      valid: false,
      id,
      message: 'params.context is missing required identity fields',
    };
  }

  if (
    !hasOnlyKeys(context as unknown as Record<string, unknown>, [
      'orgSlug',
      'userId',
      'conversationId',
      'agentSlug',
      'agentType',
      'provider',
      'model',
      'sovereignMode',
    ])
  ) {
    return {
      valid: false,
      id,
      message: 'params.context contains unsupported fields',
    };
  }

  if (context.userId !== authenticatedUserId) {
    return {
      valid: false,
      id,
      message: 'params.context.userId must match the authenticated user',
    };
  }

  if (
    authorizedOrganizationSlug &&
    authorizedOrganizationSlug !== '*' &&
    context.orgSlug !== authorizedOrganizationSlug
  ) {
    return {
      valid: false,
      id,
      message:
        'params.context.orgSlug must match the authorized organization',
    };
  }

  const data = typedParams['data'];
  if (
    typeof data !== 'object' ||
    data === null ||
    !Object.prototype.hasOwnProperty.call(data, 'content')
  ) {
    return {
      valid: false,
      id,
      message: 'params.data.content is required',
    };
  }


  const typedData = data as Record<string, unknown>;
  if (!hasOnlyKeys(typedData, ['content', 'contentType'])) {
    return { valid: false, id, message: 'params.data contains unsupported fields' };
  }

  const contentType = typedData['contentType'];
  if (
    contentType !== undefined &&
    (typeof contentType !== 'string' ||
      !SUPPORTED_CONTENT_TYPES.has(contentType))
  ) {
    return {
      valid: false,
      id,
      message: 'params.data.contentType is not supported',
    };
  }

  const metadata = typedParams['metadata'];
  if (
    metadata !== undefined &&
    (typeof metadata !== 'object' ||
      metadata === null ||
      Array.isArray(metadata))
  ) {
    return {
      valid: false,
      id,
      message: 'params.metadata must be an object when provided',
    };
  }

  return { valid: true, request: body as A2AInvokeRequest };
}

const SUPPORTED_CONTENT_TYPES = new Set([
  'text',
  'markdown',
  'json',
  'arguments',
  'binary-ref',
]);

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}
