import { Test, TestingModule } from '@nestjs/testing';
import { InternalIdentityLinkService } from './internal-identity-link.service';
import {
  DATABASE_PROVIDER,
  DatabaseProvider,
} from '../../data-pilot/database-provider.interface';

const mockDatabaseProvider: jest.Mocked<DatabaseProvider> = {
  findIdentityLinkUserId: jest.fn(),
  upsertIdentityLink: jest.fn(),
  createAdoShadowTask: jest.fn(),
  findAdoExternalTaskIdByInternalId: jest.fn(),
  updateAdoShadowTaskStatus: jest.fn(),
};

describe('InternalIdentityLinkService', () => {
  let service: InternalIdentityLinkService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InternalIdentityLinkService,
        {
          provide: DATABASE_PROVIDER,
          useValue: mockDatabaseProvider,
        },
      ],
    }).compile();

    service = module.get<InternalIdentityLinkService>(
      InternalIdentityLinkService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findInternalUserId should return user id when link exists', async () => {
    mockDatabaseProvider.findIdentityLinkUserId.mockResolvedValueOnce(
      'user-123',
    );

    const result = await service.findInternalUserId({
      id: 'external-id',
      issuer: 'https://issuer.example.com',
      subject: 'abc-123',
      rawClaims: {},
    });

    expect(result).toBe('user-123');
    expect(mockDatabaseProvider.findIdentityLinkUserId).toHaveBeenCalledWith({
      issuer: 'https://issuer.example.com',
      subject: 'abc-123',
    });
  });

  it('findInternalUserId should return null when link missing', async () => {
    mockDatabaseProvider.findIdentityLinkUserId.mockResolvedValueOnce(null);

    const result = await service.findInternalUserId({
      id: 'external-id',
      issuer: 'https://issuer.example.com',
      subject: 'abc-123',
      rawClaims: {},
    });

    expect(result).toBeNull();
  });

  it('upsertIdentityLink should call upsert with issuer+subject conflict target', async () => {
    await service.upsertIdentityLink('user-abc', {
      id: 'external-id',
      issuer: 'https://issuer.example.com',
      subject: 'subject-1',
      email: 'demo@example.com',
      rawClaims: { sub: 'subject-1' },
    });

    expect(mockDatabaseProvider.upsertIdentityLink).toHaveBeenCalledWith({
      userId: 'user-abc',
      issuer: 'https://issuer.example.com',
      subject: 'subject-1',
      email: 'demo@example.com',
      rawClaims: { sub: 'subject-1' },
    });
  });
});
