/**
 * Work units against the real tables: real agent definitions, runtime,
 * repositories and trace reader, with a scripted model client in place of a
 * provider. Set WORKFLOW_RUNS_TEST_DATABASE_URL to run it (skipped
 * otherwise). Rows are removed through their conversation and agent slugs.
 */
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { createExecutionContext } from '@orchestrator-ai/transport-types';
import { PostgresqlDatabaseService } from '@orchestratorai/planes/database/postgresql-database.service';
import { AgentDefinitionsRepository, WorkflowAgentRuntime } from '../agents';
import type { RoleCallRequest, RunModelScope, WorkflowLlmClient } from '../models';
import type { HumanReviewService } from '../reviews';
import { WorkflowRunsRepository } from '../runs';
import { WorkUnitService } from './work-unit.service';
import { WorkUnitTraceReader } from './work-unit-trace.reader';
import { WorkUnitsRepository } from './work-units.repository';

const url = process.env.WORKFLOW_RUNS_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;

describeWithDb('work units against Postgres', () => {
  const tag = randomUUID().slice(0, 8);
  const agent = (name: string) => `it-${name}-${tag}`;
  const org = 'marketing';
  const conversationId = randomUUID();
  let db: PostgresqlDatabaseService;
  let service: WorkUnitService;
  let reader: WorkUnitTraceReader;
  let scope: RunModelScope;
  /** What each agent's model "answers", by caller name. */
  const script: Record<string, string> = {
    [`agent:${agent('optimist')}`]: '{"stance":"go","confidence":80}',
    [`agent:${agent('pessimist')}`]: '{"stance":"wait","confidence":"high"}',
    [`agent:${agent('judge')}`]: '{"stance":"go","confidence":60}',
  };

  async function sql(text: string, params: unknown[] = []) {
    const { data, error } = await db.rawQuery(text, params);
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>[];
  }

  beforeAll(async () => {
    db = new PostgresqlDatabaseService(new ConfigService({ POSTGRESQL_URL: url }));
    const stance = JSON.stringify({
      type: 'object',
      properties: { stance: { enum: ['go', 'wait'] }, confidence: { type: 'integer' } },
      required: ['stance', 'confidence'],
      additionalProperties: false,
    });
    for (const name of ['optimist', 'pessimist', 'judge']) {
      await sql(
        `INSERT INTO workflows.agent_definitions
           (slug, name, description, instructions, model_role, output_format, input_schema, output_schema, max_tokens)
         VALUES ($1, $2, 'Spec agent', 'Take a stance.', 'analyst', 'json', '{"type":"object"}', $3, 300)`,
        [agent(name), name, stance],
      );
    }
    const users = await sql(`SELECT id FROM auth.users ORDER BY created_at LIMIT 1`);
    const userId = String(users[0]?.id);
    await sql(
      `INSERT INTO public.conversations (id, user_id, agent_name, agent_type, organization_slug, started_at, created_at, updated_at)
       VALUES ($1, $2, 'it-work-units', 'workflow', $3, now(), now(), now())`,
      [conversationId, userId, org],
    );
    const executionContext = createExecutionContext({
      orgSlug: org,
      userId,
      conversationId,
      agentSlug: 'it-work-units',
      agentType: 'workflow',
      provider: 'openrouter',
      model: 'google/gemini-2.5-flash-lite',
    });
    const modelProfile = { analyst: { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' } };
    await new WorkflowRunsRepository(db).insertQueued({
      context: executionContext,
      input: {},
      documents: [],
      modelProfile,
      accessControl: { mode: 'owner' },
      maxAttempts: 1,
    });
    scope = { executionContext, modelProfile };

    let calls = 0;
    const llm = {
      callForRole: async (_scope: RunModelScope, _role: string, request: RoleCallRequest) => ({
        content: script[request.callerName] ?? '',
        provider: 'openrouter',
        model: 'google/gemini-2.5-flash-lite',
        requestId: `it-req-${tag}-${++calls}`,
        usage: { inputTokens: 10, outputTokens: 4 },
        thinking: null,
      }),
    } as unknown as WorkflowLlmClient;
    const runtime = new WorkflowAgentRuntime(new AgentDefinitionsRepository(db), llm);
    service = new WorkUnitService(new WorkUnitsRepository(db), runtime, {} as HumanReviewService);
    reader = new WorkUnitTraceReader(db);
  });

  afterAll(async () => {
    await sql(`DELETE FROM public.conversations WHERE id = $1`, [conversationId]);
    await sql(`DELETE FROM workflows.agent_definitions WHERE slug = ANY($1::text[])`, [
      ['optimist', 'pessimist', 'judge'].map(agent),
    ]);
  });

  it('records units in order, keeps a contract miss raw, and reads back as a trace', async () => {
    const panel = await service.runPanel(scope, {
      slug: 'first-take',
      panelists: [
        { agent: agent('optimist'), input: { q: 'expand?' } },
        { agent: agent('pessimist'), input: { q: 'expand?' } },
      ],
      maxConcurrent: 2,
      policy: { mode: 'allow_partial', minSuccess: 1 },
    });
    expect(panel.status).toBe('completed_partial');

    const decision = await service.runSolo(scope, { slug: 'decide', agent: agent('judge'), input: { panel } });
    expect(decision).toEqual({ stance: 'go', confidence: 60 });

    const units = await reader.units(conversationId);
    expect(units.map((u) => [u.slug, u.pattern, u.status])).toEqual([
      ['first-take', 'panel', 'completed_partial'],
      ['decide', 'solo', 'completed'],
    ]);
    const [optimist, pessimist] = units[0]!.participants;
    expect(optimist).toMatchObject({ position: 0, status: 'completed', agentVersion: 1, model: 'google/gemini-2.5-flash-lite' });
    expect(pessimist).toMatchObject({ position: 1, status: 'failed' });
    expect(pessimist!.error).toContain('/confidence must be integer');

    const detail = await reader.participant(conversationId, pessimist!.participantId);
    expect(detail).toMatchObject({
      rawOutput: '{"stance":"wait","confidence":"high"}',
      modelRole: 'analyst',
      input: { truncated: false, value: { q: 'expand?' } },
      output: null,
      usage: { llmRequestId: expect.stringMatching(/^it-req-/), inputTokens: null },
    });
    expect(await reader.participant(randomUUID(), pessimist!.participantId)).toBeNull();

    const stuck = await sql(
      `SELECT count(*)::int AS n FROM workflows.participant_runs WHERE run_id = $1 AND status = 'running'`,
      [conversationId],
    );
    expect(stuck[0]?.n).toBe(0);
  });
});
