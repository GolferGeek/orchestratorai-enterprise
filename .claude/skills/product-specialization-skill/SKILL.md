---
name: product-specialization-skill
description: Patterns for stripping monolith copies down to product-specific code during Phase 4 specialization. Use when specializing any product.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Product Specialization Skill

## Purpose

This skill guides the **Phase 4 specialization** process: taking a product that started as a full copy of the monolith and removing everything that doesn't belong, keeping only what the product needs.

## Why Specialization Exists

Each OrchestratorAI Enterprise product started as a copy of the original monolith API or web app. The copy has ALL features. Specialization removes the features and code that don't belong in this specific product, leaving only what that product is responsible for.

**Before specialization**: Product has all agents, all controllers, all stores — most of it irrelevant
**After specialization**: Product has only its own agents, controllers, stores

## Starting Point: Read CLAUDE.md

**ALWAYS start by reading the product's `CLAUDE.md`.**

The product's `CLAUDE.md` contains specific guidance on what to strip and what to keep. This is the authoritative source for specialization decisions.

```bash
# Read CLAUDE.md for the product being specialized
cat apps/<product>/CLAUDE.md
# or
cat apps/<product>/web/CLAUDE.md
cat apps/<product>/api/CLAUDE.md
```

**The CLAUDE.md will tell you:**
- What features/agents/routes to keep
- What to strip out
- Special considerations for this product
- Port numbers to use

## Specialization Process

### Step 1: Read Product CLAUDE.md

Before touching any code:
1. Read `apps/<product>/CLAUDE.md`
2. Read `apps/<product>/api/CLAUDE.md` (if separate)
3. Read `apps/<product>/web/CLAUDE.md` (if separate)
4. List what to keep and what to strip

### Step 2: Update Package Identity

Update `package.json` name and product-specific fields:

```json
// apps/forge/api/package.json
{
  "name": "@orchestratorai/forge-api",
  "version": "1.0.0",
  // ... rest of config
}
```

```json
// apps/forge/web/package.json
{
  "name": "@orchestratorai/forge-web",
  "version": "1.0.0"
}
```

### Step 3: Update Port References

Update all port references to this product's assigned ports. Check:
- `vite.config.ts` (web port)
- `main.ts` (API port)
- `nest-cli.json` or similar
- `.env.example`
- Any hardcoded port numbers

```typescript
// vite.config.ts - update to product's web port
server: {
  port: 6300, // forge web port
}

// main.ts - update to product's API port
await app.listen(6301); // forge API port
```

### Step 4: Update Shared Package Imports

Replace old monolith package imports with enterprise shared packages:

```typescript
// BEFORE (monolith pattern)
import { ExecutionContext } from '../../../transport-types/execution-context';
import { DATABASE_SERVICE } from '../planes/database';

// AFTER (enterprise pattern)
import { ExecutionContext } from '@orchestratorai/transport-types';
import { DATABASE_SERVICE } from '@orchestratorai/planes';
```

**Shared packages to use:**
- `@orchestratorai/transport-types` - for ExecutionContext, A2A types
- `@orchestratorai/planes` - for provider plane symbols
- `@orchestratorai/ui` - for shared Vue components

### Step 5: Strip Irrelevant Code

Based on CLAUDE.md guidance, remove code that doesn't belong:

**API stripping:**
- Remove controllers for features this product doesn't own
- Remove services for other products' domains
- Remove agent runners for agents not in this product
- Remove unused modules
- Remove unused dependencies from package.json

**Web stripping:**
- Remove views/pages for features not in this product
- Remove stores for state that doesn't apply
- Remove services for API calls to removed features
- Remove router routes for removed views
- Remove unused dependencies

**What to check after stripping:**
```bash
# Build to catch broken imports
npm run build

# Look for orphaned imports
grep -r "from.*removed-module" src/
```

### Step 6: Update Auth Integration

Strip all auth logic except token validation calls to Auth API. See `auth-integration-skill` for the pattern.

**Remove from product:**
- Any local JWT signing or verification
- Any user registration or password management
- Any OAuth flow implementations
- Any session storage

**Keep in product:**
- `AuthApiClient` that calls Auth API at `AUTH_API_URL`
- `AuthGuard` that calls `AuthApiClient.validateToken()`
- `EntitlementsGuard` that calls `AuthApiClient.getEntitlements()`

### Step 7: Verify the Build

```bash
# Verify compilation succeeds
cd apps/<product>/api && npm run build
cd apps/<product>/web && npm run build

# Verify it starts on the correct port
cd apps/<product>/api && npm run start:dev
# Should start on port 6X01

cd apps/<product>/web && npm run dev
# Should start on port 6X00
```

### Step 8: Verify No Port Conflicts

Check there are no port conflicts with other running products:

```bash
# Check what's on the expected port
lsof -i :6301

# Check all product ports
for port in 6001 6101 6201 6301 6401 6501 6601 6701 6801; do
  echo "Port $port: $(lsof -ti :$port | head -1 || echo 'free')"
done
```

## Auth Stripping Pattern

The most common and important stripping task is removing monolith auth logic:

**Find auth-related code:**
```bash
# Find auth modules, guards, services
grep -r "AuthModule\|JwtModule\|PassportModule\|jwt.sign\|bcrypt" src/ --include="*.ts"
```

**Replace with Auth API integration:**
```typescript
// BEFORE: Local JWT verification
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  async validate(payload: JwtPayload) {
    return { userId: payload.sub, email: payload.email };
  }
}

// AFTER: Call Auth API
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authApiClient: AuthApiClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const token = this.extractToken(context.switchToHttp().getRequest());
    const validation = await this.authApiClient.validateToken(token);
    if (!validation.valid) throw new UnauthorizedException();
    context.switchToHttp().getRequest().user = validation.user;
    return true;
  }
}
```

## Don't Touch Shared Packages

**Never modify shared packages during product specialization:**
- `packages/transport-types/` - Do NOT edit
- `packages/planes/` - Do NOT edit
- `packages/ui/` - Do NOT edit

If a shared package needs updating, that's a separate cross-cutting change that affects all products.

## Specialization Checklist

For each product being specialized:

- [ ] Read `apps/<product>/CLAUDE.md` and understand what to keep/strip
- [ ] Updated `package.json` name to `@orchestratorai/<product>-[web|api|langgraph]`
- [ ] Updated port references to product's assigned ports
- [ ] Updated imports to use `@orchestratorai/transport-types`, `@orchestratorai/planes`, `@orchestratorai/ui`
- [ ] Stripped controllers/services/agents not belonging to this product
- [ ] Stripped views/stores/services not belonging to this product
- [ ] Replaced local auth logic with Auth API calls (see auth-integration-skill)
- [ ] `npm run build` succeeds for API
- [ ] `npm run build` succeeds for web
- [ ] API starts on correct port (`6X01`)
- [ ] Web starts on correct port (`6X00`)
- [ ] No port conflicts with other products
- [ ] Shared packages (`packages/`) not modified

## Related Skills

- **enterprise-architecture-skill** - Product structure, port assignments, shared packages
- **auth-integration-skill** - Auth stripping pattern and Auth API integration
- **api-architecture-skill** - NestJS patterns for the API after specialization
- **web-architecture-skill** - Vue patterns for the web app after specialization
- **transport-types-skill** - A2A protocol types used from shared package
