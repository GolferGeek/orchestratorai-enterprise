import { Test } from '@nestjs/testing';
import { AdminLookupService } from './admin-lookup.service';
import { DATABASE_SERVICE } from '@orchestrator-ai/transport-types';

function makeDb(rows: unknown[]) {
  return { rawQuery: jest.fn().mockResolvedValue({ data: rows, error: null }) };
}

async function makeService(db: ReturnType<typeof makeDb>) {
  const mod = await Test.createTestingModule({
    providers: [
      AdminLookupService,
      { provide: DATABASE_SERVICE, useValue: db },
    ],
  }).compile();
  return mod.get(AdminLookupService);
}

describe('AdminLookupService', () => {
  it('returns true when user has admin role', async () => {
    const db = makeDb([{ '?column?': 1 }]);
    const svc = await makeService(db);
    expect(await svc.isOrgAdmin('user-admin', 'legal')).toBe(true);
  });

  it('returns false when user is not admin', async () => {
    const db = makeDb([]);
    const svc = await makeService(db);
    expect(await svc.isOrgAdmin('user-regular', 'legal')).toBe(false);
  });

  it('returns true for super-admin (any org)', async () => {
    const db = makeDb([{ '?column?': 1 }]);
    const svc = await makeService(db);
    expect(await svc.isOrgAdmin('user-super', 'any-org')).toBe(true);
  });

  it('caches result so DB is called only once per key', async () => {
    const db = makeDb([{ '?column?': 1 }]);
    const svc = await makeService(db);
    await svc.isOrgAdmin('user-a', 'org-x');
    await svc.isOrgAdmin('user-a', 'org-x');
    expect(db.rawQuery).toHaveBeenCalledTimes(1);
  });

  it('propagates DB errors (no fallback)', async () => {
    const db = {
      rawQuery: jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'connection refused' },
      }),
    };
    const svc = await makeService(db);
    await expect(svc.isOrgAdmin('u', 'o')).rejects.toThrow(
      'connection refused',
    );
  });
});
