import { firstValueFrom } from 'rxjs';
import { take, timeout } from 'rxjs/operators';
import { StreamingService } from './streaming.service';

describe('Ambient StreamingService tenant isolation', () => {
  it('delivers events only to subscribers in the same organization', async () => {
    const service = new StreamingService();
    const orgAEvent = firstValueFrom(
      service.eventsForOrganization('org-a').pipe(take(1), timeout(100)),
    );

    service.emitWorkflowCompleted('org-b', 'workflow-b', { ok: true });
    service.emitWorkflowCompleted('org-a', 'workflow-a', { ok: true });

    await expect(orgAEvent).resolves.toMatchObject({
      orgSlug: 'org-a',
      type: 'workflow.completed',
      data: {
        workflowId: 'workflow-a',
      },
    });
  });
});
