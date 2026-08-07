const RUNNER_IDS = new Set(['context', 'rag', 'api', 'external', 'media']);
const MAX_PIPELINE_NAME_LENGTH = 120;
const MAX_RUNNERS = 5;
const MAX_CONFIG_BYTES = 32 * 1024;

export interface SavePipelineInput {
  name: string;
  runners: Array<{
    runnerId: 'context' | 'rag' | 'api' | 'external' | 'media';
    config?: Record<string, unknown>;
  }>;
}

export type PipelineInputValidation =
  { valid: true; input: SavePipelineInput } | { valid: false; message: string };

export function validateSavePipelineInput(
  content: unknown,
): PipelineInputValidation {
  if (!isRecord(content) || !hasOnlyKeys(content, ['name', 'runners'])) {
    return { valid: false, message: 'Pipeline content has an invalid shape' };
  }
  if (
    typeof content.name !== 'string' ||
    !content.name.trim() ||
    content.name.length > MAX_PIPELINE_NAME_LENGTH
  ) {
    return { valid: false, message: 'Pipeline name is invalid' };
  }
  if (
    !Array.isArray(content.runners) ||
    content.runners.length === 0 ||
    content.runners.length > MAX_RUNNERS
  ) {
    return {
      valid: false,
      message: `Pipeline must contain between 1 and ${MAX_RUNNERS} runners`,
    };
  }

  const seen = new Set<string>();
  const runners: SavePipelineInput['runners'] = [];
  for (const value of content.runners) {
    if (!isRecord(value) || !hasOnlyKeys(value, ['runnerId', 'config'])) {
      return { valid: false, message: 'Pipeline runner has an invalid shape' };
    }
    if (typeof value.runnerId !== 'string' || !RUNNER_IDS.has(value.runnerId)) {
      return { valid: false, message: 'Pipeline runner ID is invalid' };
    }
    if (seen.has(value.runnerId)) {
      return { valid: false, message: 'Pipeline runner IDs must be unique' };
    }
    seen.add(value.runnerId);

    let config: Record<string, unknown> | undefined;
    if (value.config !== undefined) {
      if (!isRecord(value.config)) {
        return { valid: false, message: 'Pipeline runner config is invalid' };
      }
      if (
        Buffer.byteLength(JSON.stringify(value.config), 'utf8') >
        MAX_CONFIG_BYTES
      ) {
        return { valid: false, message: 'Pipeline runner config is too large' };
      }
      config = value.config;
    }

    runners.push({
      runnerId:
        value.runnerId as SavePipelineInput['runners'][number]['runnerId'],
      ...(config === undefined ? {} : { config }),
    });
  }

  return {
    valid: true,
    input: { name: content.name.trim(), runners },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}
