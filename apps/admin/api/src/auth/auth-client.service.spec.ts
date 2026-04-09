import {
  UnauthorizedException,
  ForbiddenException,
  ServiceUnavailableException,
  InternalServerErrorException,
} from '@nestjs/common';
import { AuthClient, AuthorizeResult } from './auth-client.service';

const validResult: AuthorizeResult = {
  allowed: true,
  userId: 'user-1',
  email: 'test@example.com',
  orgSlug: '*',
  orgId: null,
  roles: [],
  permission: 'admin:settings',
};

function mockFetchResponse(
  status: number,
  body: unknown = {},
): Partial<Response> {
  return {
    status,
    json: jest.fn().mockResolvedValue(body),
  };
}

describe('AuthClient', () => {
  const originalEnv = { ...process.env };
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...originalEnv, AUTH_API_URL: 'http://localhost:5100' };
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('throws when AUTH_API_URL is unset', () => {
      delete process.env['AUTH_API_URL'];
      expect(() => new AuthClient()).toThrow(/AUTH_API_URL/);
    });

    it('strips a trailing slash from AUTH_API_URL', () => {
      process.env['AUTH_API_URL'] = 'http://localhost:5100/';
      expect(() => new AuthClient()).not.toThrow();
    });
  });

  describe('authorize', () => {
    it('returns parsed AuthorizeResult on 200', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse(200, validResult));
      const client = new AuthClient();
      const result = await client.authorize('tok', 'admin:settings');
      expect(result).toEqual(validResult);
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:5100/auth/authorize',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer tok',
          }) as Record<string, string>,
        }),
      );
    });

    it('throws UnauthorizedException on 401', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse(401));
      const client = new AuthClient();
      await expect(client.authorize('tok', 'admin:settings')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws ForbiddenException on 403', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse(403));
      const client = new AuthClient();
      await expect(client.authorize('tok', 'admin:settings')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ServiceUnavailableException on 500', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse(500));
      const client = new AuthClient();
      await expect(client.authorize('tok', 'admin:settings')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('throws ServiceUnavailableException on network error', async () => {
      fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));
      const client = new AuthClient();
      await expect(client.authorize('tok', 'admin:settings')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('throws InternalServerErrorException on unexpected status', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse(418));
      const client = new AuthClient();
      await expect(client.authorize('tok', 'admin:settings')).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('throws InternalServerErrorException on malformed body', async () => {
      fetchSpy.mockResolvedValue(
        mockFetchResponse(200, { allowed: true /* missing userId */ }),
      );
      const client = new AuthClient();
      await expect(client.authorize('tok', 'admin:settings')).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('forwards organizationSlug and resource params in the body', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse(200, validResult));
      const client = new AuthClient();
      await client.authorize('tok', 'rag:admin', 'acme', 'document', 'doc-1');
      const call = fetchSpy.mock.calls[0];
      const init = call[1] as RequestInit;
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body).toEqual({
        permission: 'rag:admin',
        organizationSlug: 'acme',
        resourceType: 'document',
        resourceId: 'doc-1',
      });
    });
  });
});
