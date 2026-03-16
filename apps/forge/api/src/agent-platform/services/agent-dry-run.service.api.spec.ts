import { AgentDryRunService } from './agent-dry-run.service';

describe('AgentDryRunService (API transforms)', () => {
  const svc = new AgentDryRunService();

  it('renders custom request template and extracts response field', () => {
    const apiConfig = {
      request_transform: {
        format: 'custom',
        template: '{"sessionId": "{{sessionId}}", "prompt": "{{userMessage}}"}',
      },
      response_transform: {
        format: 'field_extraction',
        field: 'output',
      },
    };
    const input = { sessionId: 'abc', userMessage: 'hi there' };
    const mockResponse = { output: 'ok' };
    const res = svc.runApiTransform(apiConfig, input, mockResponse);
    expect(res.ok).toBe(true);
    expect(res.request?.body).toContain('"sessionId": "abc"');
    expect(res.request?.body).toContain('"prompt": "hi there"');
    expect(res.response?.extracted).toBe('ok');
  });
});
