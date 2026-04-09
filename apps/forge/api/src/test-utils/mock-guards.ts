import {
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { TestingModuleBuilder } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';

/**
 * Shared test helpers for overriding forge-api's auth guards in jest.
 *
 * Every forge-api controller spec that mounts a guarded controller via
 * `Test.createTestingModule(...).compile()` must pipe the builder through
 * `applyAuthOverrides()` so JwtAuthGuard + RbacGuard are replaced with
 * stable pass-through mocks. Call `resetAuthMocks()` in `beforeEach` so
 * per-test overrides don't leak.
 *
 * This helper is forge-api-local. Admin-api has its own equivalent at
 * apps/admin/api/src/test-utils/mock-guards.ts. The two will be consolidated
 * into packages/auth-client/ during the remote-auth unification (Phase 2).
 */

export const mockJwtAuthGuard = {
  canActivate: jest.fn().mockReturnValue(true),
};

export const mockRbacGuard = {
  canActivate: jest.fn().mockReturnValue(true),
};

export function resetAuthMocks(): void {
  mockJwtAuthGuard.canActivate.mockReset().mockReturnValue(true);
  mockRbacGuard.canActivate.mockReset().mockReturnValue(true);
}

export function applyAuthOverrides(
  builder: TestingModuleBuilder,
): TestingModuleBuilder {
  return builder
    .overrideGuard(JwtAuthGuard)
    .useValue(mockJwtAuthGuard)
    .overrideGuard(RbacGuard)
    .useValue(mockRbacGuard);
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
