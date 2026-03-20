import { A2ATaskLifecycleOrchestrationProvider } from '../a2a-task-lifecycle.provider';

describe('A2ATaskLifecycleOrchestrationProvider', () => {
  it('tracks submitted → working → completed task states', async () => {
    const provider = new A2ATaskLifecycleOrchestrationProvider();
    const workflow = await provider.createWorkflow([
      {
        id: 'step-1',
        agentId: 'agent-a',
        task: 'Validate',
      },
    ]);

    expect(provider.getTaskState(workflow.id)).toBe('submitted');

    provider.transitionTask(workflow.id, 'working');
    expect(provider.getTaskState(workflow.id)).toBe('working');

    provider.transitionTask(workflow.id, 'completed');
    expect(provider.getTaskState(workflow.id)).toBe('completed');
  });

  it('records conversation turns for multi-turn tasks', async () => {
    const provider = new A2ATaskLifecycleOrchestrationProvider();
    const taskId = await provider.delegate('agent-a', 'Need extra input');
    provider.appendConversation(taskId, 'Please provide account number');
    provider.appendConversation(taskId, 'Account number provided');

    const events = provider.listTaskEvents(taskId);
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(provider.getTaskState(taskId)).toBe('working');
  });
});
