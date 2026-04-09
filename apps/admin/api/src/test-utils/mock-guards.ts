import {
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { TestingModuleBuilder } from '@nestjs/testing';
import {
  AuthClient,
  type AuthorizeResult,
  JwtAuthGuard,
  RbacGuard,
} from '../auth';

/**
 * Shared test helpers for overriding admin-api's auth guards and client in jest.
 *
 * Every admin-api controller spec that mounts a guarded controller via
 * `Test.createTestingModule(...).compile()` must pipe the builder through
 * `applyAuthOverrides()` so that JwtAuthGuard, RbacGuard, and AuthClient are
 * replaced with stable mocks. Call `resetAuthMocks()` in `beforeEach` so that
 * per-test overrides don't leak.
 */

export const defaultAuthorizeResult: AuthorizeResult = {
  allowed: true,
  userId: 'test-user-id',
  email: 'test@example.com',
  orgSlug: '*',
  orgId: null,
  roles: ['admin'],
  permission: 'admin:settings',
};

export const mockJwtAuthGuard = {
  canActivate: jest.fn().mockReturnValue(true),
};

export const mockRbacGuard = {
  canActivate: jest.fn().mockReturnValue(true),
};

export const mockAuthClient = {
  authorize: jest.fn().mockResolvedValue(defaultAuthorizeResult),
};

export function resetAuthMocks(): void {
  mockJwtAuthGuard.canActivate.mockReset().mockReturnValue(true);
  mockRbacGuard.canActivate.mockReset().mockReturnValue(true);
  mockAuthClient.authorize.mockReset().mockResolvedValue(defaultAuthorizeResult);
}

export function applyAuthOverrides(
  builder: TestingModuleBuilder,
): TestingModuleBuilder {
  return builder
    .overrideGuard(JwtAuthGuard)
    .useValue(mockJwtAuthGuard)
    .overrideGuard(RbacGuard)
    .useValue(mockRbacGuard)
    .overrideProvider(AuthClient)
    .useValue(mockAuthClient);
}

export function makeJwtGuardReject(): void {
  mockJwtAuthGuard.canActivate.mockImplementationOnce(() => {
    throw new UnauthorizedException('Missing token');
  });
}

export function makeRbacGuardReject(): void {
  mockRbacGuard.canActivate.mockImplementationOnce(() => {
    throw new ForbiddenException('Permission denied');
  });
}
