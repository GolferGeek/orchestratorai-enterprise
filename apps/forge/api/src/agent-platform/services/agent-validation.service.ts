import { Injectable } from '@nestjs/common';
import * as AjvModule from 'ajv';
import type { ErrorObject } from 'ajv';
import {
  AgentType,
  schemaFor,
  CreateAgentPayload,
} from '../schemas/agent-schemas';

export type ValidationIssue = {
  message: string;
  instancePath?: string;
};

type AjvConstructor = new (options?: Record<string, unknown>) => {
  compile: (schema: unknown) => {
    (data: unknown): boolean;
    errors?: ErrorObject[];
  };
};

function resolveAjvConstructor(): AjvConstructor {
  if (typeof AjvModule === 'function') {
    return AjvModule as unknown as AjvConstructor;
  }

  const maybeDefault = (AjvModule as unknown as { default?: AjvConstructor })
    .default;
  if (typeof maybeDefault === 'function') {
    return maybeDefault;
  }

  throw new Error('Ajv constructor is unavailable in this runtime');
}

const Ajv = resolveAjvConstructor();

@Injectable()
export class AgentValidationService {
  private readonly ajv = new Ajv({ allErrors: true });

  validateByType(
    type: AgentType,
    payload: CreateAgentPayload,
  ): {
    ok: boolean;
    issues: ValidationIssue[];
  } {
    const schema = schemaFor(type);
    const validate = this.ajv.compile(schema);
    const valid = validate(payload);
    const issues = (validate.errors || []).map((err: ErrorObject) =>
      this.formatAjvError(err),
    );

    // Additional runtime checks per type
    if (type === 'api') {
      const payloadAny = payload as unknown as Record<string, unknown>;
      const api = (
        (
          (payloadAny?.config as Record<string, unknown>)
            ?.configuration as Record<string, unknown>
        )?.api as Record<string, unknown>
      )?.api_configuration as Record<string, unknown> | undefined;
      if (!api) {
        issues.push({
          message:
            'config.configuration.api.api_configuration is required for api agents',
        });
      } else {
        const rt = api.request_transform;
        const rstr = api.response_transform;
        if (rt && typeof rt !== 'object')
          issues.push({ message: 'api.request_transform must be an object' });
        if (rstr && typeof rstr !== 'object')
          issues.push({ message: 'api.response_transform must be an object' });
      }
    }

    return { ok: issues.length === 0 && !!valid, issues };
  }

  private formatAjvError(err: ErrorObject): ValidationIssue {
    const msg = err.message || 'validation error';
    const path = err as ErrorObject & {
      instancePath?: string;
      dataPath?: string;
    };
    const instancePath = path.instancePath || path.dataPath || undefined;
    return { message: msg, instancePath };
  }
}
