/**
 * JSON Schema validator for inter-agent message parameters.
 *
 * Schema enforcement is opt-in per method: if no schema has been registered
 * for a given method the message passes validation unconditionally.  This
 * allows gradual rollout — add schemas only for the methods whose params you
 * want to lock down.
 *
 * Schemas are compiled at construction time (using AJV) so that repeated
 * calls to `validate()` pay zero compilation overhead.
 *
 * AJV is used in strict mode by default to prevent schema ambiguities from
 * silently passing validation.
 */

import Ajv, { ValidateFunction, ErrorObject } from 'ajv';

export interface SchemaValidationResult {
  valid: true;
  errors?: never;
}

export interface SchemaValidationFailure {
  valid: false;
  errors: SchemaValidationError[];
}

export interface SchemaValidationError {
  /** JSON Pointer to the failing field, e.g. "/params/agentId" */
  instancePath: string;
  /** Human-readable description */
  message: string;
  /** AJV keyword that triggered the failure */
  keyword: string;
  /** Additional keyword-specific data */
  params: Record<string, unknown>;
}

export type SchemaValidationOutcome = SchemaValidationResult | SchemaValidationFailure;

/** A plain JSON Schema object (draft-07 subset that AJV supports). */
export type JsonSchema = Record<string, unknown>;

export class SchemaValidator {
  private readonly ajv: Ajv;
  /** Compiled validators, keyed by method name. */
  private readonly validators: Map<string, ValidateFunction> = new Map();

  /**
   * @param schemas A map of JSON-RPC method names to their JSON Schemas.
   *   Pass an empty map if no schemas are registered yet; call
   *   `registerSchema()` later as needed.
   */
  constructor(schemas: Map<string, JsonSchema> = new Map()) {
    this.ajv = new Ajv({
      allErrors: true,      // report ALL errors, not just the first
      strict: true,         // treat unknown keywords as errors
      coerceTypes: false,   // never silently coerce types
      useDefaults: false,   // do not mutate incoming data with defaults
    });

    for (const [method, schema] of schemas) {
      this.compileAndStore(method, schema);
    }
  }

  /**
   * Registers (or replaces) the schema for a given method.  The schema is
   * compiled immediately.  Throws if the schema is not valid JSON Schema.
   */
  registerSchema(method: string, schema: JsonSchema): void {
    this.compileAndStore(method, schema);
  }

  /**
   * Validates `params` against the registered schema for `method`.
   *
   * - If no schema is registered: returns `{ valid: true }` (opt-in model).
   * - If the schema is registered and params match: returns `{ valid: true }`.
   * - If the schema is registered and params don't match: returns
   *   `{ valid: false, errors: [...] }`.
   */
  validate(method: string, params: unknown): SchemaValidationOutcome {
    const validator = this.validators.get(method);

    if (!validator) {
      // No schema registered — pass through.
      return { valid: true };
    }

    const ok = validator(params) as boolean;

    if (ok) {
      return { valid: true };
    }

    const errors = this.mapErrors(validator.errors ?? []);
    return { valid: false, errors };
  }

  /** Returns true if a schema has been registered for the given method. */
  hasSchema(method: string): boolean {
    return this.validators.has(method);
  }

  private compileAndStore(method: string, schema: JsonSchema): void {
    // AJV compile throws synchronously on invalid schema — let it propagate.
    const compiled = this.ajv.compile(schema);
    this.validators.set(method, compiled);
  }

  private mapErrors(rawErrors: ErrorObject[]): SchemaValidationError[] {
    return rawErrors.map((e) => ({
      instancePath: e.instancePath,
      message: e.message ?? 'Validation failed',
      keyword: e.keyword,
      params: e.params as Record<string, unknown>,
    }));
  }
}
