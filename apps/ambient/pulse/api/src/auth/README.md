# Authentication Module

This module provides Supabase-based authentication for the NestJS A2A Agent Framework, mirroring the FastAPI auth implementation.

## Features

- **User Registration** (`POST /auth/signup`)
- **User Login** (`POST /auth/login`)
- **User Logout** (`POST /auth/logout`)
- **Current User Profile** (`GET /auth/me`)
- **JWT Authentication** with Supabase verification
- **API Key Authentication** for testing (via `X-Test-Api-Key` header)
- **Swagger Documentation** with Bearer token support

## API Endpoints

### POST /auth/signup

Create a new user account.

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "display_name": "John Doe" // optional
}
```

**Response (201):**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

**Response (202):** Email confirmation required

```json
{
  "message": "User created successfully. Please check your email to confirm your account before logging in."
}
```

### POST /auth/login

Authenticate an existing user.

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (200):**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

### POST /auth/logout

Logout the current user (requires authentication).

**Headers:**

```
Authorization: Bearer <access_token>
```

**Response (204):** No content

### GET /auth/me

Get current user profile (requires authentication).

**Headers:**

```
Authorization: Bearer <access_token>
```

**Response (200):**

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "email": "user@example.com",
  "display_name": "John Doe"
}
```

## Usage in Controllers

### Protecting Routes

```typescript
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Get('protected')
async protectedRoute() {
  return { message: 'This is a protected route' };
}
```

### Accessing Current User

```typescript
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupabaseAuthUserDto } from '../auth/dto/auth.dto';

@UseGuards(JwtAuthGuard)
@Get('profile')
async getProfile(@CurrentUser() user: SupabaseAuthUserDto) {
  return { userId: user.id, email: user.email };
}
```

## Environment Variables

Required environment variables:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
TEST_API_SECRET_KEY=your-test-api-key  # Optional, for testing
```

## Testing

### API Key Authentication (for E2E tests)

For testing purposes, you can authenticate using an API key instead of JWT:

```bash
curl -H "X-Test-Api-Key: your-test-api-key" \
     http://localhost:4000/auth/me
```

### Running Tests

```bash
# Unit tests
pnpm test

# E2E tests
pnpm test:e2e

# Test coverage
pnpm test:cov
```

## Architecture

- **AuthModule**: Main module that configures authentication
- **AuthService**: Business logic for auth operations
- **AuthController**: HTTP endpoints for auth operations
- **JwtStrategy**: Passport strategy for JWT validation with Supabase
- **JwtAuthGuard**: Guard that protects routes requiring authentication
- **CurrentUser**: Decorator for easy access to authenticated user
- **DTOs**: Data transfer objects for request/response validation

## Integration with Supabase

This module integrates with Supabase Auth by:

1. Using Supabase client for signup/login operations
2. Validating JWT tokens directly with Supabase (not local verification)
3. Fetching user profile data from both auth.users and public.users tables
4. Supporting Supabase's email confirmation workflow

## Swagger Documentation

The auth endpoints are fully documented in Swagger. Access the documentation at:
`http://localhost:4000/api`

The Swagger UI includes a "Authorize" button where you can enter your JWT token for testing protected endpoints.
