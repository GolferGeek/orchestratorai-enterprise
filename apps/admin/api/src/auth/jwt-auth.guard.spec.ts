import {
  ExecutionContext,
  UnauthorizedException,
  InternalServerErrorException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthClient, AuthorizeResult } from './auth-client.service';
import { PERMISSION_KEY } from './decorators/require-permission.decorator';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';

const goodResult: AuthorizeResult = {
  allowed: true,
  userId: 'user-1',
  email: 'a@b.c',
  orgSlug: '*',
  orgId: null,
  roles: ['admin'],
  permission: 'admin:settings',
};

function makeContext(
  headers: Record<string, string | undefined>,
  body: Record<string, unknown> = {},
  query: Record<string, unknown> = {},
): ExecutionContext {
  const req = { headers, body, query, user: undefined };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let reflector: Reflector;
  let authClient: { authorize: jest.Mock };
  let guard: JwtAuthGuard;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as Reflector;
    authClient = { authorize: jest.fn() };
    guard = new JwtAuthGuard(reflector, authClient as unknown as AuthClient);
  });

  it('returns true immediately when @Public() is set', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockImplementation(
      (key: string) => key === IS_PUBLIC_KEY,
    );
    const ctx = makeContext({ authorization: undefined });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(authClient.authorize).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when Authorization header is missing', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
    const ctx = makeContext({ authorization: undefined });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when header is malformed', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
    const ctx = makeContext({ authorization: 'NotBearer xxx' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('throws InternalServerErrorException when @RequirePermission is missing', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockImplementation(
      (key: string) => (key === PERMISSION_KEY ? undefined : undefined),
    );
    const ctx = makeContext({ authorization: 'Bearer tok' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('calls AuthClient and attaches request.user on success', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockImplementation(
      (key: string) => (key === PERMISSION_KEY ? 'admin:settings' : undefined),
    );
    authClient.authorize.mockResolvedValue(goodResult);
    const ctx = makeContext({ authorization: 'Bearer tok' });
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(authClient.authorize).toHaveBeenCalledWith(
      'tok',
      'admin:settings',
      '*',
    );
    const req = ctx.switchToHttp().getRequest<{ user?: AuthorizeResult }>();
    expect(req.user).toEqual(goodResult);
  });

  it('re-throws ForbiddenException from AuthClient', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockImplementation(
      (key: string) => (key === PERMISSION_KEY ? 'llm:admin' : undefined),
    );
    authClient.authorize.mockRejectedValue(new ForbiddenException());
    const ctx = makeContext({ authorization: 'Bearer tok' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  describe('org slug resolution priority', () => {
    beforeEach(() => {
      (reflector.getAllAndOverride as jest.Mock).mockImplementation(
        (key: string) =>
          key === PERMISSION_KEY ? 'admin:settings' : undefined,
      );
      authClient.authorize.mockResolvedValue(goodResult);
    });

    it('body > header > query', async () => {
      const ctx = makeContext(
        { authorization: 'Bearer tok', 'x-organization-slug': 'header-org' },
        { organizationSlug: 'body-org' },
        { organizationSlug: 'query-org' },
      );
      await guard.canActivate(ctx);
      expect(authClient.authorize).toHaveBeenCalledWith(
        'tok',
        'admin:settings',
        'body-org',
      );
    });

    it('header when body missing', async () => {
      const ctx = makeContext(
        { authorization: 'Bearer tok', 'x-organization-slug': 'header-org' },
        {},
        { organizationSlug: 'query-org' },
      );
      await guard.canActivate(ctx);
      expect(authClient.authorize).toHaveBeenCalledWith(
        'tok',
        'admin:settings',
        'header-org',
      );
    });

    it('query when body and header missing', async () => {
      const ctx = makeContext(
        { authorization: 'Bearer tok' },
        {},
        { organizationSlug: 'query-org' },
      );
      await guard.canActivate(ctx);
      expect(authClient.authorize).toHaveBeenCalledWith(
        'tok',
        'admin:settings',
        'query-org',
      );
    });

    it("defaults to '*' when none provided", async () => {
      const ctx = makeContext({ authorization: 'Bearer tok' });
      await guard.canActivate(ctx);
      expect(authClient.authorize).toHaveBeenCalledWith(
        'tok',
        'admin:settings',
        '*',
      );
    });
  });
});
