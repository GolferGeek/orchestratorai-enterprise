/**
 * Re-export shim — StreamTokenService lives in @orchestratorai/auth-client.
 * Compose API uses the shared implementation to avoid duplication.
 */
export {
  StreamTokenService,
  StreamTokenClaims,
  IssueTokenUser,
} from '@orchestratorai/auth-client';
