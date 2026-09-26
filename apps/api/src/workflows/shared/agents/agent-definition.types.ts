/** An agent a workflow step invokes, resolved for one org. */
export interface AgentDefinition {
  slug: string;
  name: string;
  description: string;
  /** The org's override when it has one. */
  instructions: string;
  /** Resolved to a provider/model through the run's model profile. */
  modelRole: string;
  outputFormat: 'json' | 'text';
  inputSchema: Record<string, unknown>;
  /** Present exactly when outputFormat is json. */
  outputSchema: Record<string, unknown> | null;
  maxTokens: number;
  enabled: boolean;
  version: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Map and validate a workflows.agent_definitions row. Throws on anything malformed. */
export function toAgentDefinition(row: Record<string, unknown>): AgentDefinition {
  const text = (key: string): string => {
    const value = row[key];
    if (typeof value !== 'string' || value === '') {
      throw new Error(`workflows.agent_definitions.${key} is missing or not text`);
    }
    return value;
  };
  const format = row.output_format;
  if (format !== 'json' && format !== 'text') {
    throw new Error(`workflows.agent_definitions.output_format "${String(format)}" is not json or text`);
  }
  if (!isObject(row.input_schema)) {
    throw new Error('workflows.agent_definitions.input_schema is not an object');
  }
  const outputSchema = row.output_schema ?? null;
  if (outputSchema !== null && !isObject(outputSchema)) {
    throw new Error('workflows.agent_definitions.output_schema is not an object');
  }
  if ((format === 'json') !== (outputSchema !== null)) {
    throw new Error('workflows.agent_definitions: a json agent needs an output schema, a text agent none');
  }
  if (typeof row.max_tokens !== 'number' || typeof row.version !== 'number' || typeof row.enabled !== 'boolean') {
    throw new Error('workflows.agent_definitions row has a malformed max_tokens, version or enabled');
  }
  return {
    slug: text('slug'),
    name: text('name'),
    description: text('description'),
    instructions: text('instructions'),
    modelRole: text('model_role'),
    outputFormat: format,
    inputSchema: row.input_schema,
    outputSchema,
    maxTokens: row.max_tokens,
    enabled: row.enabled,
    version: row.version,
  };
}
