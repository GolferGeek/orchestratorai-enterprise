import { MarketingDbService } from './marketing-db.service';

describe('MarketingDbService failure propagation', () => {
  it('throws when a task status update fails', async () => {
    const db = {
      from: jest.fn().mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            error: { message: 'database unavailable' },
          }),
        }),
      }),
    };
    const service = new MarketingDbService(db as never);

    await expect(service.updateTaskStatus('task-1', 'running')).rejects.toThrow(
      'database unavailable',
    );
  });

  it('does not report an empty output set when the query failed', async () => {
    const db = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'read failed' },
            }),
          }),
        }),
      }),
    };
    const service = new MarketingDbService(db as never);

    await expect(service.getAllOutputs('task-1')).rejects.toThrow(
      'read failed',
    );
  });

  it('uses one cascade delete and propagates deletion failure', async () => {
    const eq = jest.fn().mockResolvedValue({
      error: { message: 'delete failed' },
    });
    const from = jest.fn().mockReturnValue({
      delete: jest.fn().mockReturnValue({ eq }),
    });
    const service = new MarketingDbService({ from } as never);

    await expect(service.deleteTaskData('task-1')).rejects.toThrow(
      'delete failed',
    );
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('marketing', 'swarm_tasks');
  });
});
