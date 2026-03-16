import { AgentValidationService } from './agent-validation.service';
import type { CreateAgentPayload } from '../schemas/agent-schemas';

describe('AgentValidationService', () => {
  const svc = new AgentValidationService();

  it('requires api_configuration for api agents', () => {
    const payload: Partial<CreateAgentPayload> = {
      slug: 'test-api',
      display_name: 'Test API',
      agent_type: 'api',
      mode_profile: 'draft',
      config: { configuration: { api: {} } },
    };
    const res = svc.validateByType('api', payload as never);
    expect(res.ok).toBe(false);
    expect(
      res.issues.some((i) => i.message.includes('api_configuration')),
    ).toBe(true);
  });

  it('accepts valid api agent payload', () => {
    const payload: Partial<CreateAgentPayload> = {
      slug: 'ok-api',
      display_name: 'OK API',
      agent_type: 'api',
      mode_profile: 'draft',
      config: {
        configuration: {
          api: { api_configuration: { url: 'https://example.com' } },
        },
      },
    };
    const res = svc.validateByType('api', payload as never);
    expect(res.ok).toBe(true);
  });
});
