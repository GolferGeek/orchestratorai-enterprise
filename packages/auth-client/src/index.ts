// Guards
export { RemoteJwtAuthGuard } from './guards/remote-jwt-auth.guard';
export { RemoteRbacGuard } from './guards/remote-rbac.guard';
export {
  InProcessJwtAuthGuard,
  AuthenticatedUser,
  IDENTITY_PROVIDER,
  AUTH_SERVICE,
  STREAM_TOKEN_SERVICE,
} from './guards/in-process-jwt-auth.guard';
export {
  InProcessRbacGuard,
  RbacServiceInterface,
  RBAC_SERVICE,
} from './guards/in-process-rbac.guard';
export { BridgeJwtAuthGuard } from './guards/bridge-jwt-auth.guard';

// Services
export { AuthClient, AuthorizeResult } from './services/auth-client.service';
export {
  StreamTokenService,
  StreamTokenClaims,
  IssueTokenUser,
} from './services/stream-token.service';
export {
  InternalIdentityLinkService,
  IdentityLinkDatabaseProvider,
  IdentityLinkPrincipal,
  IDENTITY_LINK_DATABASE_PROVIDER,
} from './services/internal-identity-link.service';

// Decorators
export { Public, IS_PUBLIC_KEY } from './decorators/public.decorator';
export {
  RequirePermission,
  PERMISSION_KEY,
  RESOURCE_PARAM_KEY,
  AdminOnly,
  RagRead,
  RagWrite,
  RagAdmin,
  AgentExecute,
  AgentManage,
  AgentAdmin,
  LlmUse,
  AuditAccess,
} from './decorators/require-permission.decorator';
export { CurrentUser } from './decorators/current-user.decorator';

// DatabaseProviderModule + related types
export { DatabaseProviderModule } from './data-pilot/database-provider.module';
export {
  DATABASE_PROVIDER,
  DatabaseProvider,
  IdentityLinkLookupInput,
  IdentityLinkUpsertInput,
  CreateAdoShadowTaskInput,
  CreatedAdoShadowTask,
} from './data-pilot/database-provider.interface';

// Test utilities
export {
  mockJwtAuthGuard,
  mockRbacGuard,
  resetAuthMocks,
  applyInProcessAuthOverrides,
  applyRemoteAuthOverrides,
  makeJwtGuardReject,
  makeRbacGuardReject,
} from './test-utils/mock-guards';
