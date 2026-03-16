import { Injectable } from '@nestjs/common';

type Issue = { message: string; path?: string };

export interface AgentPolicyPayload {
  agent_type?: string;
  input_modes?: unknown;
  inputModes?: unknown;
  output_modes?: unknown;
  outputModes?: unknown;
  yaml?: string;
  config?: {
    input_modes?: unknown;
    output_modes?: unknown;
    configuration?: {
      function?: {
        timeout_ms?: number;
      };
      api?: {
        api_configuration?: unknown;
      };
    };
  };
  context?: {
    input_modes?: unknown;
    output_modes?: unknown;
    system?: string;
    system_prompt?: string;
  };
}

@Injectable()
export class AgentPolicyService {
  check(payload: AgentPolicyPayload): Issue[] {
    const issues: Issue[] = [];

    // Require IO contract: input_modes/output_modes present in YAML-like config or top-level
    const hasInputModes = !!(
      payload?.input_modes ||
      payload?.inputModes ||
      payload?.config?.input_modes ||
      payload?.context?.input_modes ||
      payload?.yaml?.includes('input_modes')
    );
    const hasOutputModes = !!(
      payload?.output_modes ||
      payload?.outputModes ||
      payload?.config?.output_modes ||
      payload?.context?.output_modes ||
      payload?.yaml?.includes('output_modes')
    );
    if (!hasInputModes)
      issues.push({
        message: 'Missing input_modes declaration (policy)',
        path: 'input_modes',
      });
    if (!hasOutputModes)
      issues.push({
        message: 'Missing output_modes declaration (policy)',
        path: 'output_modes',
      });

    // For context agents, require either context.system or YAML system_prompt
    if (payload?.agent_type === 'context') {
      const hasSystem = !!(
        payload?.context?.system ||
        payload?.context?.system_prompt ||
        (typeof payload?.yaml === 'string' &&
          payload.yaml.includes('system_prompt'))
      );
      if (!hasSystem)
        issues.push({
          message: 'Context agents should define a system prompt',
          path: 'context.system',
        });
    }

    // For function agents, recommend timeout <= 30s
    if (payload?.agent_type === 'function') {
      const timeout = Number(
        payload?.config?.configuration?.function?.timeout_ms || 0,
      );
      if (!timeout)
        issues.push({
          message: 'Function agents should set timeout_ms',
          path: 'config.configuration.function.timeout_ms',
        });
      if (timeout > 30000)
        issues.push({
          message: 'timeout_ms should be <= 30000ms per policy',
          path: 'config.configuration.function.timeout_ms',
        });
    }

    // For API agents, ensure api_configuration presence hint (detailed validation is in type checks)
    if (payload?.agent_type === 'api') {
      const api: unknown =
        payload?.config?.configuration?.api?.api_configuration;
      if (!api)
        issues.push({
          message:
            'API agents must include configuration.api.api_configuration',
          path: 'config.configuration.api.api_configuration',
        });
    }

    return issues;
  }
}
