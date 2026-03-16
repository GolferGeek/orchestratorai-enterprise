import { AgentDryRunService } from './agent-dry-run.service';

describe('AgentDryRunService', () => {
  const svc = new AgentDryRunService();

  it('runs a simple exported handler', async () => {
    const code =
      "module.exports = async (input, ctx) => ({ ok: true, echo: input.msg || 'hi' })";
    const res = await svc.runFunction(code, { msg: 'hello' }, 500);
    expect(res.ok).toBe(true);
    expect(res.result).toEqual({ ok: true, echo: 'hello' });
  });

  it('times out long-running handler', async () => {
    const code = 'module.exports = async () => new Promise(() => {})';
    const res = await svc.runFunction(code, {}, 10);
    expect(res.ok).toBe(false);
    expect(String(res.error)).toContain('timeout');
  });
});
