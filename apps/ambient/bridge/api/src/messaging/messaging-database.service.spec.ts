import { Test, TestingModule } from '@nestjs/testing';
import { DATABASE_SERVICE } from '@orchestratorai/planes/database';
import { MessagingSupabaseDatabaseService } from './messaging-database.service';

describe('MessagingSupabaseDatabaseService', () => {
  let service: MessagingSupabaseDatabaseService;
  let mockDb: { from: jest.Mock };

  beforeEach(async () => {
    const mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
    };

    mockDb = {
      from: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingSupabaseDatabaseService,
        {
          provide: DATABASE_SERVICE,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<MessagingSupabaseDatabaseService>(
      MessagingSupabaseDatabaseService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should inject DATABASE_SERVICE — not construct a raw client', () => {
    // The service must receive DATABASE_SERVICE via @Inject — if it
    // constructed its own client, the mock db would never be called.
    const qb = service.from('ambient', 'messages');
    expect(mockDb.from).toHaveBeenCalledWith('ambient', 'messages');
    expect(qb).toBeDefined();
  });

  it('from() delegates schema and table to the injected db.from()', () => {
    service.from('public', 'conversations');
    expect(mockDb.from).toHaveBeenCalledWith('public', 'conversations');
  });

  it('from() passes null schema through to the database plane', () => {
    service.from(null, 'events');
    expect(mockDb.from).toHaveBeenCalledWith(null, 'events');
  });

  it('returns the QueryBuilder produced by the database plane unchanged', () => {
    const mockQb = { select: jest.fn() };
    mockDb.from.mockReturnValueOnce(mockQb);

    const result = service.from('ambient', 'messages');
    expect(result).toBe(mockQb);
  });
});
