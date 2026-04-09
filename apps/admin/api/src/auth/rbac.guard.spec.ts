import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { RbacGuard } from './rbac.guard';

function makeCtx(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RbacGuard', () => {
  const guard = new RbacGuard();

  it('returns true when request.user is populated', () => {
    expect(guard.canActivate(makeCtx({ userId: 'u1' }))).toBe(true);
  });

  it('throws UnauthorizedException when request.user is missing', () => {
    expect(() => guard.canActivate(makeCtx(undefined))).toThrow(
      UnauthorizedException,
    );
  });
});
