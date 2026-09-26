import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

/** A schema that does not compile. Never validated permissively instead. */
export class AgentSchemaError extends Error {
  constructor(label: string, reason: string) {
    super(`${label} is not a valid JSON Schema: ${reason}`);
    this.name = 'AgentSchemaError';
  }
}

/**
 * Strict JSON Schema validation for agent inputs and outputs: strict mode
 * (unknown keywords are schema errors), all errors reported, and the value is
 * checked as given. No type coercion, no defaults filled, no properties
 * removed, no envelope unwrapping, no null stripping.
 */
export class AgentContract {
  private readonly ajv: Ajv;
  private readonly compiled = new Map<string, ValidateFunction>();

  constructor() {
    this.ajv = new Ajv({ strict: true, allErrors: true });
    addFormats(this.ajv);
  }

  /** Compile (once per key) or throw AgentSchemaError. */
  compile(key: string, label: string, schema: Record<string, unknown>): ValidateFunction {
    const cached = this.compiled.get(key);
    if (cached) return cached;
    let validate: ValidateFunction;
    try {
      validate = this.ajv.compile(schema);
    } catch (error) {
      throw new AgentSchemaError(label, error instanceof Error ? error.message : String(error));
    }
    this.compiled.set(key, validate);
    return validate;
  }

  /** Null when valid, else readable error lines. */
  static check(validate: ValidateFunction, value: unknown): string[] | null {
    if (validate(value)) return null;
    return (validate.errors ?? []).map(describe);
  }
}

function describe(error: ErrorObject): string {
  const at = error.instancePath === '' ? '(root)' : error.instancePath;
  const detail =
    error.keyword === 'additionalProperties'
      ? `: ${String((error.params as { additionalProperty: string }).additionalProperty)}`
      : '';
  return `${at} ${error.message ?? error.keyword}${detail}`;
}
