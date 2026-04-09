/**
 * Test utilities for auth-client.
 *
 * Import from '@orchestratorai/auth-client/testing' in test files.
 * These are NOT re-exported from the main index to avoid bundling
 * jest.fn() into production builds.
 */
export {
  mockJwtAuthGuard,
  mockRbacGuard,
  resetAuthMocks,
  applyInProcessAuthOverrides,
  applyRemoteAuthOverrides,
  makeJwtGuardReject,
  makeRbacGuardReject,
} from './test-utils/mock-guards';
