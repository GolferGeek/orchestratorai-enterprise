import { DatabaseService } from '@/database';
import {
  PseudonymDictionariesRepository,
  PseudonymDictionaryRecord,
} from './pseudonym-dictionaries.repository';

const createDbMock = () => {
  const fromMock = jest.fn();
  const db = { from: fromMock } as unknown as DatabaseService;
  return { fromMock, db };
};

describe('PseudonymDictionariesRepository', () => {
  afterEach(() => jest.resetAllMocks());

  const mockRecord: PseudonymDictionaryRecord = {
    id: 'dict-1',
    organization_slug: 'test-org',
    agent_slug: 'test-agent',
    data_type: 'name',
    original: 'John Doe',
    pseudonym: 'Person A',
    updated_at: new Date().toISOString(),
  };

  describe('listByOrganization', () => {
    it('should list pseudonym dictionaries for an organization', async () => {
      const { fromMock, db } = createDbMock();
      const records = [mockRecord, { ...mockRecord, id: 'dict-2' }];

      const order = jest.fn().mockResolvedValue({ data: records, error: null });
      const eq = jest.fn().mockReturnValue({ order });
      const select = jest.fn().mockReturnValue({ eq });
      fromMock.mockReturnValue({ select });

      const repo = new PseudonymDictionariesRepository(db);
      const result = await repo.listByOrganization('test-org');

      expect(fromMock).toHaveBeenCalledWith(null, 'pseudonym_dictionaries');
      expect(eq).toHaveBeenCalledWith('organization_slug', 'test-org');
      expect(order).toHaveBeenCalledWith('updated_at', {
        ascending: false,
      });
      expect(result).toEqual(records);
    });

    it('should list global pseudonym dictionaries when org slug is null', async () => {
      const { fromMock, db } = createDbMock();
      const globalRecords = [{ ...mockRecord, organization_slug: null }];

      const order = jest
        .fn()
        .mockResolvedValue({ data: globalRecords, error: null });
      const is = jest.fn().mockReturnValue({ order });
      const select = jest.fn().mockReturnValue({ is });
      fromMock.mockReturnValue({ select });

      const repo = new PseudonymDictionariesRepository(db);
      const result = await repo.listByOrganization(null);

      expect(is).toHaveBeenCalledWith('organization_slug', null);
      expect(result).toEqual(globalRecords);
    });

    it('should return empty array on error', async () => {
      const { fromMock, db } = createDbMock();

      const order = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });
      const eq = jest.fn().mockReturnValue({ order });
      const select = jest.fn().mockReturnValue({ eq });
      fromMock.mockReturnValue({ select });

      const repo = new PseudonymDictionariesRepository(db);
      const result = await repo.listByOrganization('test-org');

      expect(result).toEqual([]);
    });

    it('should return empty array when no data returned', async () => {
      const { fromMock, db } = createDbMock();

      const order = jest.fn().mockResolvedValue({ data: null, error: null });
      const eq = jest.fn().mockReturnValue({ order });
      const select = jest.fn().mockReturnValue({ eq });
      fromMock.mockReturnValue({ select });

      const repo = new PseudonymDictionariesRepository(db);
      const result = await repo.listByOrganization('empty-org');

      expect(result).toEqual([]);
    });
  });
});
