import { Test, TestingModule } from '@nestjs/testing';
import { SystemConfigService } from './system-config.service';
import { ProductClientService } from '../common/product-client.service';
import { HttpService } from '@nestjs/axios';

describe('SystemConfigService', () => {
  let service: SystemConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemConfigService,
        {
          provide: ProductClientService,
          useValue: {
            authGet: jest.fn().mockResolvedValue({ config: [] }),
            authPut: jest.fn().mockResolvedValue({}),
            ping: jest.fn().mockResolvedValue(true),
            getProductUrls: jest.fn().mockReturnValue({
              forge: 'http://localhost:6200',
              auth: 'http://localhost:6100',
            }),
          },
        },
        {
          provide: HttpService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<SystemConfigService>(SystemConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('getHealth should return products with apiStatus', async () => {
    const result = await service.getHealth();
    expect(result).toHaveProperty('overallStatus');
    expect(result).toHaveProperty('products');
    expect(result.products[0]).toHaveProperty('apiStatus');
    expect(result.products[0]).toHaveProperty('displayName');
  });
});
