---
name: auth-integration-skill
description: How products integrate with the Auth service for authentication, token validation, permissions, and entitlements. Use when implementing auth in any product.
allowed-tools: Read, Grep, Glob
---

# Auth Integration Skill

## Purpose

This skill covers how OrchestratorAI Enterprise products integrate with the Auth service for authentication, token validation, permissions, and entitlements. Use when implementing or reviewing auth integration in any product.

## Core Principle: Auth is the Single Authority

**The Auth service is the ONLY authentication source in the platform.**

- Auth API runs at port **6101** (dev) / **7101** (prod)
- All products validate tokens by calling the Auth API
- No product runs its own auth logic except Auth itself
- Every JWT in the system was issued by Auth

## Auth API Endpoints

The Auth service exposes:

```
POST /auth/login           - Get JWT token with email/password
POST /auth/refresh         - Refresh expired token
POST /auth/logout          - Invalidate token
GET  /auth/validate        - Validate a JWT token
GET  /auth/entitlements    - Get org's product entitlements
GET  /auth/permissions     - Get user's permissions within org
```

## Token Validation Pattern

**Every product's API MUST validate incoming tokens by calling Auth API.**

### Pattern in NestJS Products

```typescript
// In product's auth guard
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authApiClient: AuthApiClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    // Call Auth API to validate - do NOT validate locally
    const validation = await this.authApiClient.validateToken(token);

    if (!validation.valid) {
      throw new UnauthorizedException('Invalid token');
    }

    // Attach user context to request
    request.user = validation.user;
    return true;
  }

  private extractToken(request: Request): string | null {
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return null;
    return auth.substring(7);
  }
}
```

### Auth API Client Service

Each product that needs auth validation should have an `AuthApiClient` service:

```typescript
@Injectable()
export class AuthApiClient {
  private readonly authBaseUrl: string;

  constructor(private readonly httpService: HttpService) {
    this.authBaseUrl = process.env.AUTH_API_URL || 'http://localhost:6101';
  }

  async validateToken(token: string): Promise<TokenValidationResult> {
    try {
      const response = await this.httpService.axiosRef.get(
        `${this.authBaseUrl}/auth/validate`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      return { valid: true, user: response.data.user };
    } catch {
      return { valid: false };
    }
  }

  async getEntitlements(orgSlug: string): Promise<ProductEntitlements> {
    const response = await this.httpService.axiosRef.get(
      `${this.authBaseUrl}/auth/entitlements?org=${orgSlug}`,
    );
    return response.data;
  }
}
```

## SSO: Single JWT Across Products

**SSO means one login grants access to all entitled products.**

- User logs in once via Auth web (port 6100 dev / 7100 prod)
- Auth issues a JWT valid for all products
- Same JWT is passed in `Authorization: Bearer <token>` headers to all product APIs
- Each product validates the JWT with Auth API independently
- No product stores or manages session state

### JWT Contents

The JWT issued by Auth contains:
```json
{
  "sub": "<userId>",
  "email": "<userEmail>",
  "orgSlug": "<orgSlug>",
  "orgId": "<orgId>",
  "roles": ["member", "admin"],
  "iat": 1234567890,
  "exp": 1234567890
}
```

**Products should NOT store users or sessions** — read user info from the validated token.

## Entitlements: Which Products an Org Can Access

**Auth manages product access per organization.**

- Each org has an entitlements record in Auth's database
- Entitlements specify which products the org has licensed
- Command shell calls Auth's entitlements API to know which products to show
- Products themselves also check entitlements to reject unauthorized access

### Entitlements Flow

```
User logs in → Command shell loads → Command calls Auth GET /auth/entitlements
→ Auth returns: { products: ['forge', 'compose', 'assistant'] }
→ Command shows only those products in navigation
→ User clicks Forge → Forge web loads
→ Forge API receives request → validates token with Auth
→ Forge API checks entitlements with Auth → org has 'forge' → allow
```

### Entitlements Check in Product API

```typescript
@Injectable()
export class EntitlementsGuard implements CanActivate {
  constructor(private readonly authApiClient: AuthApiClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const orgSlug = request.user?.orgSlug;
    const productName = 'forge'; // This product's name

    const entitlements = await this.authApiClient.getEntitlements(orgSlug);

    if (!entitlements.products.includes(productName)) {
      throw new ForbiddenException(`Org ${orgSlug} does not have access to ${productName}`);
    }

    return true;
  }
}
```

## Admin Web: The Auth Management UI

**Admin provides the UI for managing Auth's data.**

- Admin web (port 6200 dev) provides a UI to manage orgs, users, and entitlements
- Admin talks to Auth API to create/update/delete orgs and users
- Admin talks to Auth API to grant/revoke product entitlements
- Admin is itself a product — it validates tokens with Auth like all other products
- Only org admins and platform admins have access to Admin

## What Products Must NOT Do

**Strip all auth logic from products except token validation calls to Auth API:**

- DO NOT: Manage user records in the product's own database
- DO NOT: Issue JWT tokens from a product
- DO NOT: Store sessions or cookies in a product
- DO NOT: Run password hashing or verification in a product
- DO NOT: Implement OAuth flows in a product
- DO: Call Auth API to validate tokens
- DO: Call Auth API to check entitlements
- DO: Use `request.user` (populated by AuthGuard) for user context

## Integration Checklist

When implementing auth in a product:

- [ ] Auth API URL is configurable via `AUTH_API_URL` env var (default: `http://localhost:6101`)
- [ ] `AuthApiClient` service exists in product's API
- [ ] `AuthGuard` calls Auth API for token validation (not local validation)
- [ ] `EntitlementsGuard` checks org entitlements via Auth API
- [ ] Product's API controllers use `@UseGuards(AuthGuard)` on protected routes
- [ ] No local user management (no users table in product's schema)
- [ ] No JWT signing or verification in product code
- [ ] No session storage in product

## Related Skills

- **enterprise-architecture-skill** - Overall product structure and ports
- **api-architecture-skill** - NestJS API patterns
- **execution-context-skill** - ExecutionContext includes userId validated by Auth
- **transport-types-skill** - A2A requests include ExecutionContext with validated userId
