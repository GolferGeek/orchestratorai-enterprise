import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import type { RbacService } from '../rbac.service';
import { RbacGuard } from './rbac.guard';

/** A route on a controller that requires `admin:settings`, optionally marked @Public(). */
function routeContext(handlerPublic: boolean, user?: { id: string }): ExecutionContext {
  class AssetsLike {}
  const handler = () => undefined;
  Reflect.defineMetadata(PERMISSION_KEY, 'admin:settings', AssetsLike);
  if (handlerPublic) Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);
  return {
    getHandler: () => handler,
    getClass: () => AssetsLike,
    switchToHttp: () => ({ getRequest: () => ({ user, headers: {}, params: {}, query: {} }) }),
  } as unknown as ExecutionContext;
}

describe('RbacGuard', () => {
  const rbac = { isSuperAdmin: jest.fn(async () => false) };
  const guard = new RbacGuard(new Reflector(), rbac as unknown as RbacService);

  it('lets a @Public() route through on a controller that requires a permission', async () => {
    await expect(guard.canActivate(routeContext(true))).resolves.toBe(true);
    expect(rbac.isSuperAdmin).not.toHaveBeenCalled();
  });

  it('still refuses an anonymous request to the controller\'s other routes', async () => {
    await expect(guard.canActivate(routeContext(false))).rejects.toThrow(ForbiddenException);
  });
});
