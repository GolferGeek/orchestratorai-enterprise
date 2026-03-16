import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosError, AxiosResponse } from 'axios';
import { ProductClientService } from './product-client.service';

const mockHttpService = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
};

function makeAxiosResponse<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: {} } as any,
  };
}

describe('ProductClientService', () => {
  let service: ProductClientService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductClientService,
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<ProductClientService>(ProductClientService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('forgeGet', () => {
    it('should call Forge API and return data', async () => {
      const data = [{ id: '1', name: 'test' }];
      mockHttpService.get.mockReturnValueOnce(of(makeAxiosResponse(data)));

      const result = await service.forgeGet<typeof data>('/test', 'token123');

      expect(result).toEqual(data);
      expect(mockHttpService.get).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer token123',
          }),
        }),
      );
    });

    it('should propagate Axios errors from Forge API', async () => {
      const axiosError = new AxiosError('Network error');
      axiosError.response = {
        status: 503,
        data: { message: 'Service unavailable' },
      } as any;
      mockHttpService.get.mockReturnValueOnce(throwError(() => axiosError));

      await expect(service.forgeGet('/test', 'token123')).rejects.toThrow(
        'Forge API error at /test (status 503): Service unavailable',
      );
    });
  });

  describe('composeGet', () => {
    it('should call Compose API and return data', async () => {
      const data = { collections: [] };
      mockHttpService.get.mockReturnValueOnce(of(makeAxiosResponse(data)));

      const result = await service.composeGet<typeof data>(
        '/admin/rag/collections',
        'token123',
      );

      expect(result).toEqual(data);
    });
  });

  describe('composePost', () => {
    it('should POST to Compose API with body and token', async () => {
      const body = { name: 'test-collection' };
      const responseData = { id: 'c1', name: 'test-collection' };
      mockHttpService.post.mockReturnValueOnce(
        of(makeAxiosResponse(responseData)),
      );

      const result = await service.composePost(
        '/admin/rag/collections',
        'token',
        body,
      );

      expect(result).toEqual(responseData);
      expect(mockHttpService.post).toHaveBeenCalledWith(
        expect.stringContaining('/admin/rag/collections'),
        body,
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer token' }),
        }),
      );
    });
  });

  describe('composeDelete', () => {
    it('should DELETE via Compose API', async () => {
      mockHttpService.delete.mockReturnValueOnce(
        of(makeAxiosResponse(undefined)),
      );

      await service.composeDelete('/admin/rag/collections/c1', 'token');

      expect(mockHttpService.delete).toHaveBeenCalledWith(
        expect.stringContaining('/admin/rag/collections/c1'),
        expect.any(Object),
      );
    });
  });

  describe('ping', () => {
    it('should return true when product health endpoint responds', async () => {
      mockHttpService.get.mockReturnValueOnce(
        of(makeAxiosResponse({ status: 'healthy' })),
      );

      const result = await service.ping('http://localhost:6200', 'Forge');

      expect(result).toBe(true);
    });

    it('should throw when product health endpoint is unreachable', async () => {
      mockHttpService.get.mockReturnValueOnce(
        throwError(() => new Error('ECONNREFUSED')),
      );

      await expect(
        service.ping('http://localhost:6200', 'Forge'),
      ).rejects.toThrow('Forge API is unreachable');
    });
  });

  describe('getProductUrls', () => {
    it('should return all product URLs', () => {
      const urls = service.getProductUrls();
      expect(urls).toHaveProperty('forge');
      expect(urls).toHaveProperty('compose');
      expect(urls).toHaveProperty('flow');
      expect(urls).toHaveProperty('pulse');
      expect(urls).toHaveProperty('bridge');
      expect(urls).toHaveProperty('auth');
    });
  });
});
