import { AgentPolicyService } from './agent-policy.service';

describe('AgentPolicyService', () => {
  let service: AgentPolicyService;

  beforeEach(() => {
    service = new AgentPolicyService();
  });

  describe('IO contract validation', () => {
    it('should require input_modes', () => {
      const payload = {
        agent_type: 'function',
        output_modes: ['text/markdown'],
      };

      const issues = service.check(payload);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((i) => i.message.includes('input_modes'))).toBe(true);
    });

    it('should require output_modes', () => {
      const payload = {
        agent_type: 'function',
        input_modes: ['application/json'],
      };

      const issues = service.check(payload);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((i) => i.message.includes('output_modes'))).toBe(true);
    });

    it('should accept input_modes in YAML', () => {
      const payload = {
        agent_type: 'function',
        yaml: "input_modes: ['application/json']\noutput_modes: ['text/markdown']\n",
      };

      const issues = service.check(payload);

      const inputIssue = issues.find((i) => i.message.includes('input_modes'));
      const outputIssue = issues.find((i) =>
        i.message.includes('output_modes'),
      );

      expect(inputIssue).toBeUndefined();
      expect(outputIssue).toBeUndefined();
    });

    it('should accept modes in config', () => {
      const payload = {
        agent_type: 'function',
        config: {
          input_modes: ['application/json'],
          output_modes: ['text/markdown'],
        },
      };

      const issues = service.check(payload);

      const inputIssue = issues.find((i) => i.message.includes('input_modes'));
      const outputIssue = issues.find((i) =>
        i.message.includes('output_modes'),
      );

      expect(inputIssue).toBeUndefined();
      expect(outputIssue).toBeUndefined();
    });
  });

  describe('context agent validation', () => {
    it('should require system prompt for context agents', () => {
      const payload = {
        agent_type: 'context',
        input_modes: ['text/plain'],
        output_modes: ['text/markdown'],
      };

      const issues = service.check(payload);

      expect(issues.some((i) => i.message.includes('system prompt'))).toBe(
        true,
      );
    });

    it('should accept system prompt in context.system', () => {
      const payload = {
        agent_type: 'context',
        input_modes: ['text/plain'],
        output_modes: ['text/markdown'],
        context: {
          system: 'You are a helpful assistant',
        },
      };

      const issues = service.check(payload);

      expect(issues.some((i) => i.message.includes('system prompt'))).toBe(
        false,
      );
    });

    it('should accept system_prompt in YAML', () => {
      const payload = {
        agent_type: 'context',
        input_modes: ['text/plain'],
        output_modes: ['text/markdown'],
        yaml: 'system_prompt: "You are helpful"',
      };

      const issues = service.check(payload);

      expect(issues.some((i) => i.message.includes('system prompt'))).toBe(
        false,
      );
    });
  });

  describe('function agent validation', () => {
    it('should require timeout_ms for function agents', () => {
      const payload = {
        agent_type: 'function',
        input_modes: ['application/json'],
        output_modes: ['text/markdown'],
        config: {
          configuration: {
            function: {
              // code field is not in AgentPolicyPayload but may exist in actual payloads
              // TypeScript will allow this with the cast
            } as { timeout_ms?: number },
          },
        },
      };

      const issues = service.check(payload);

      expect(issues.some((i) => i.message.includes('timeout_ms'))).toBe(true);
    });

    it('should enforce timeout_ms <= 30000ms', () => {
      const payload = {
        agent_type: 'function',
        input_modes: ['application/json'],
        output_modes: ['text/markdown'],
        config: {
          configuration: {
            function: {
              timeout_ms: 60000,
              code: 'module.exports = async (input) => ({ ok: true });',
            },
          },
        },
      };

      const issues = service.check(payload);

      expect(issues.some((i) => i.message.includes('30000ms'))).toBe(true);
    });

    it('should accept valid timeout_ms', () => {
      const payload = {
        agent_type: 'function',
        input_modes: ['application/json'],
        output_modes: ['text/markdown'],
        config: {
          configuration: {
            function: {
              timeout_ms: 5000,
              code: 'module.exports = async (input) => ({ ok: true });',
            },
          },
        },
      };

      const issues = service.check(payload);

      expect(issues.some((i) => i.message.includes('timeout_ms'))).toBe(false);
    });
  });

  describe('API agent validation', () => {
    it('should require api_configuration for API agents', () => {
      const payload = {
        agent_type: 'api',
        input_modes: ['application/json'],
        output_modes: ['application/json'],
      };

      const issues = service.check(payload);

      expect(issues.some((i) => i.message.includes('api_configuration'))).toBe(
        true,
      );
    });

    it('should accept valid api_configuration', () => {
      const payload = {
        agent_type: 'api',
        input_modes: ['application/json'],
        output_modes: ['application/json'],
        config: {
          configuration: {
            api: {
              api_configuration: {
                endpoint: 'https://api.example.com',
                method: 'POST',
              },
            },
          },
        },
      };

      const issues = service.check(payload);

      expect(issues.some((i) => i.message.includes('api_configuration'))).toBe(
        false,
      );
    });
  });

  describe('comprehensive validation', () => {
    it('should return no issues for valid function agent', () => {
      const payload = {
        agent_type: 'function',
        yaml: "input_modes: ['application/json']\noutput_modes: ['text/markdown']\n",
        config: {
          configuration: {
            function: {
              timeout_ms: 5000,
              code: 'module.exports = async (input) => ({ ok: true });',
            },
          },
        },
      };

      const issues = service.check(payload);

      expect(issues).toHaveLength(0);
    });

    it('should return no issues for valid context agent', () => {
      const payload = {
        agent_type: 'context',
        input_modes: ['text/plain'],
        output_modes: ['text/markdown'],
        context: {
          system: 'You are a helpful assistant',
        },
      };

      const issues = service.check(payload);

      expect(issues).toHaveLength(0);
    });

    it('should accumulate multiple issues', () => {
      const payload = {
        agent_type: 'function',
        // Missing input_modes, output_modes, and timeout_ms
      };

      const issues = service.check(payload);

      expect(issues.length).toBeGreaterThanOrEqual(3);
      expect(issues.some((i) => i.message.includes('input_modes'))).toBe(true);
      expect(issues.some((i) => i.message.includes('output_modes'))).toBe(true);
      expect(issues.some((i) => i.message.includes('timeout_ms'))).toBe(true);
    });
  });
});
