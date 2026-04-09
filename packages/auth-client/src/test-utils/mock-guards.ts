import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { TestingModuleBuilder } from '@nestjs/testing';
import { InProcessJwtAuthGuard } from '../guards/in-process-jwt-auth.guard';
import { InProcessRbacGuard } from '../guards/in-process-rbac.guard';
import { RemoteJwtAuthGuard } from '../guards/remote-jwt-auth.guard';
import { RemoteRbacGuard } from '../guards/remote-rbac.guard';

export const mockJwtAuthGuard = { canActivate: jest.fn().mockReturnValue(true) };
export const mockRbacGuard = { canActivate: jest.fn().mockReturnValue(true) };

export function resetAuthMocks(): void {
  mockJwtAuthGuard.canActivate.mockReset().mockReturnValue(true);
  mockRbacGuard.canActivate.mockReset().mockReturnValue(true);
}

export function applyInProcessAuthOverrides(builder: TestingModuleBuilder): TestingModuleBuilder {
  return builder
    .overrideGuard(InProcessJwtAuthGuard).useValue(mockJwtAuthGuard)
    .overrideGuard(InProcessRbacGuard).useValue(mockRbacGuard);
}

export function applyRemoteAuthOverrides(builder: TestingModuleBuilder): TestingModuleBuilder {
  return builder
    .overrideGuard(RemoteJwtAuthGuard).useValue(mockJwtAuthGuard)
    .overrideGuard(RemoteRbacGuard).useValue(mockRbacGuard);
}

export function makeJwtGuardReject(): void {
  mockJwtAuthGuard.canActivate.mockImplementationOnce(() => { throw new UnauthorizedException('Missing token'); });
}

export function makeRbacGuardReject(): void {
  mockRbacGuard.canActivate.mockImplementationOnce(() => { throw new ForbiddenException('Permission denied'); });
}
