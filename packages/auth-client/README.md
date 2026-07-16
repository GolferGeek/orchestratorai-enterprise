# @orchestratorai/auth-client

Shared JWT validation and RBAC guards for OrchestratorAI platform API modules.

## Pattern: Platform Auth

Platform API modules use the shared auth client pattern:

```typescript
// In auth.module.ts
import { Global, Module } from '@nestjs/common';
import { AuthClient, RemoteJwtAuthGuard, RemoteRbacGuard } from '@orchestratorai/auth-client';

@Global()
@Module({
  providers: [AuthClient, RemoteJwtAuthGuard, RemoteRbacGuard],
  exports: [AuthClient, RemoteJwtAuthGuard, RemoteRbacGuard],
})
export class AuthModule {}
```

Every guarded route must have `@RequirePermission`:

```typescript
import {
  RemoteJwtAuthGuard as JwtAuthGuard,
  RemoteRbacGuard as RbacGuard,
  RequirePermission,
  CurrentUser,
} from '@orchestratorai/auth-client';

@Get('resource')
@UseGuards(JwtAuthGuard)
@RequirePermission('agent:execute')
async getResource() { ... }
```

`RemoteJwtAuthGuard` calls `POST /auth/authorize` on the platform API auth module and throws `InternalServerErrorException` if `@RequirePermission` is missing on the handler or class.

## Environment Variables

| Var | Default | Description |
|-----|---------|-------------|
| `AUTH_API_URL` | — | URL of the platform API auth endpoint (e.g., `http://localhost:6700`) |
| `AUTH_API_TIMEOUT_MS` | 5000 | HTTP timeout for authorize calls |

## Testing

Use `applyRemoteAuthOverrides` in unit tests to bypass the remote HTTP call:

```typescript
import { applyRemoteAuthOverrides } from '@orchestratorai/auth-client/testing';

beforeEach(async () => {
  const module = await Test.createTestingModule({ ... }).compile();
  applyRemoteAuthOverrides(module);
});
```
