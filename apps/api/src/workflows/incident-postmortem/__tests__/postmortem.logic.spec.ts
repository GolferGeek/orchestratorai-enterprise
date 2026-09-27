import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { WorkTaskSink } from '@orchestratorai/planes/work-routing';
import { WorkflowInputError } from '../../catalog/workflow.registry';
import { createSeverityNode } from '../nodes/severity.node';
import { applyItemDecisions } from '../nodes/review.node';
import { postmortemExporter } from '../postmortem.exporter';
import { parsePostmortemInput } from '../postmortem.input';
import { postmortemResult } from '../postmortem.result';
import type { ActionItem, PostmortemState } from '../postmortem.state';
import { PostmortemTasksService } from '../postmortem-tasks.service';
import { RunTasksService } from '../../shared/tasks';

const config = { configurable: { reportProgress: async () => undefined } };
const item = (key: string): ActionItem => ({ key, title: `Do ${key}`, owner: 'Platform', priority: 'high', due: '2 weeks', why: 'root cause', task: null });

describe('postmortem input', () => {
  it('needs a title and enough of an incident', () => {
    expect(parsePostmortemInput({ title: ' Outage ', incident: 'x'.repeat(50) }).title).toBe('Outage');
    expect(() => parsePostmortemInput({ title: 'Outage', incident: 'short' })).toThrow(WorkflowInputError);
  });
});

describe('severity', () => {
  it("maps Jev's decision to SEV1/2/3 and keeps the data answer", async () => {
    const units = { runCheck: jest.fn(async () => [{ decision: 'block', reason: 'SEV1', answers: { data_affected: { type: 'noul', noul: 0.02 } } }]) };
    const state = { title: 'T', incident: 'I', executionContext: createMockExecutionContext({ agentType: 'workflow' }), modelProfile: {}, runInstruction: null } as unknown as PostmortemState;
    expect(await createSeverityNode({ units: units as never })(state, config)).toEqual({ severity: { level: 'SEV1', dataAffected: 0.02 } });
    expect(units.runCheck).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ checks: [expect.objectContaining({ rubric: 'incident-severity' })] }));
  });
});

describe('action items', () => {
  it('keeps, drops and rewrites', () => {
    const out = applyItemDecisions([item('action-1'), item('action-2'), item('action-3')], [
      { itemId: 'action-2', decision: 'reject' },
      { itemId: 'action-3', decision: 'modify', replacement: ' Add a migration lock timeout of 5s ' },
    ]);
    expect(out.map((i) => [i.key, i.title])).toEqual([['action-1', 'Do action-1'], ['action-3', 'Add a migration lock timeout of 5s']]);
    expect(() => applyItemDecisions([item('action-1')], [{ itemId: 'action-9', decision: 'reject' }])).toThrow('No action item');
  });

  it('creates each task once: a retry finds the ones already created', async () => {
    const rows: Array<Record<string, string>> = [];
    const db = {
      from: () => ({
        select: () => ({ eq: async () => ({ data: rows, error: null }) }),
        insert: async (row: Record<string, string>) => {
          rows.push(row);
          return { error: null };
        },
      }),
    };
    let n = 0;
    const sink = { createTask: jest.fn(async () => ({ id: `task-${++n}`, title: 't', provider: 'flow' as const })) };
    const service = new PostmortemTasksService(new RunTasksService(db as never, sink as unknown as WorkTaskSink));
    const first = await service.create('engineering', 'run-1', 'Outage', [item('action-1'), item('action-2')], 'https://x');
    expect(first.map((i) => i.task)).toEqual([{ provider: 'flow', id: 'task-1' }, { provider: 'flow', id: 'task-2' }]);
    const retried = await service.create('engineering', 'run-1', 'Outage', [item('action-1'), item('action-2')], 'https://x');
    expect(sink.createTask).toHaveBeenCalledTimes(2);
    expect(retried.map((i) => i.task?.id)).toEqual(['task-1', 'task-2']);
    expect(sink.createTask).toHaveBeenCalledWith(expect.objectContaining({ title: '[HIGH] Do action-1', description: expect.stringContaining('https://x') }));
  });
});

describe('result, export and docs', () => {
  const postmortem = { summary: 'S', impact: 'I', timeline: [{ time: '14:02', event: 'Deploy' }], rootCause: 'R', contributingFactors: ['F'], whatWentWell: [], lessons: ['L'] };

  it('refuses an item without its task, and exports a complete postmortem', () => {
    const base = { title: 'Outage', severity: { level: 'SEV1', dataAffected: 0 }, postmortem } as unknown as PostmortemState;
    expect(() => postmortemResult({ ...base, actionItems: [item('action-1')] } as PostmortemState)).toThrow('no task');
    const result = postmortemResult({ ...base, actionItems: [{ ...item('action-1'), task: { provider: 'flow', id: 't1' } }] } as PostmortemState);
    const doc = postmortemExporter.build({ run: { id: 'r', result } as never, issues: {} as never, exportedAt: new Date() });
    expect(doc.sections.map((s) => s.heading)).toEqual(['Summary', 'Impact', 'Timeline', 'Root cause', 'Contributing factors', 'What went well', 'Lessons', 'Action items']);
  });

  it('has a brief, both docs and two examples its parser accepts', async () => {
    const { DEFAULT_WORKFLOW_DOCS_ROOT, WorkflowDocsService } = await import('../../shared/docs/workflow-docs.service');
    const brief = await new WorkflowDocsService(DEFAULT_WORKFLOW_DOCS_ROOT).brief('incident-postmortem', (i) => parsePostmortemInput(i));
    expect(brief.showcase).toHaveLength(2);
  });
});
