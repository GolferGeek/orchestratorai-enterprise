import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import {
  AUTH_SERVICE,
  AuthServiceProvider,
} from './interfaces/auth-service.interface';
import {
  IDENTITY_PROVIDER,
  IdentityProvider,
} from './interfaces/identity-provider.interface';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { RbacService } from '../rbac/rbac.service';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import {
  UserCreateDto,
  UserLoginDto,
  TokenResponseDto,
  AuthenticatedUserResponseDto,
  SupabaseAuthUserDto,
} from './dto/auth.dto';
import {
  UserListResponseDto,
  UpdateUserRolesDto,
  AddUserRoleDto,
  RemoveUserRoleDto,
  CreateUserDto,
  CreateUserResponseDto,
} from './dto/admin-user-management.dto';

// All products available in OrchestratorAI Enterprise
// webUrl defaults to local dev ports; override with PRODUCT_<SLUG>_WEB_URL env vars for gateway deployments.
const ALL_PRODUCTS = [
  { slug: 'forge', name: 'Forge', webUrl: process.env.PRODUCT_FORGE_WEB_URL || 'http://localhost:5201' },
  { slug: 'compose', name: 'Compose', webUrl: process.env.PRODUCT_COMPOSE_WEB_URL || 'http://localhost:5301' },
  { slug: 'pulse', name: 'Pulse', webUrl: process.env.PRODUCT_PULSE_WEB_URL || 'http://localhost:5501' },
  { slug: 'bridge', name: 'Bridge', webUrl: process.env.PRODUCT_BRIDGE_WEB_URL || 'http://localhost:5601' },
  { slug: 'protocol-lab', name: 'Protocol Lab', webUrl: process.env.PRODUCT_PROTOCOL_LAB_WEB_URL || 'http://localhost:5400' },
  { slug: 'assistant', name: 'Assistant', webUrl: process.env.PRODUCT_ASSISTANT_WEB_URL || 'http://localhost:5801' },
  { slug: 'admin', name: 'Admin', webUrl: process.env.PRODUCT_ADMIN_WEB_URL || 'http://localhost:5101' },
];

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    @Inject(AUTH_SERVICE)
    private readonly authService: AuthServiceProvider,
    @Inject(IDENTITY_PROVIDER)
    private readonly identityProvider: IdentityProvider,
    private readonly rbacService: RbacService,
    private readonly configService: ConfigService,
  ) {}

  @Post('google/token-exchange')
  @ApiOperation({
    summary:
      'Exchange Google OAuth authorization code for tokens (server-side)',
  })
  @ApiResponse({ status: 200, description: 'Token exchange successful' })
  @ApiResponse({ status: 400, description: 'Token exchange failed' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Authorization code from Google redirect',
        },
        redirectUri: {
          type: 'string',
          description: 'Redirect URI used in the original auth request',
        },
      },
      required: ['code', 'redirectUri'],
    },
  })
  @HttpCode(HttpStatus.OK)
  async googleTokenExchange(
    @Body('code') code: string,
    @Body('redirectUri') redirectUri: string,
  ): Promise<{ id_token: string; expires_in: number }> {
    if (!code || !redirectUri) {
      throw new BadRequestException('code and redirectUri are required');
    }

    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      this.logger.error(
        'GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured',
      );
      throw new BadRequestException('Google OIDC not configured on server');
    }

    this.logger.log(
      `[Google token exchange] redirect_uri=${redirectUri}, client_id=${clientId}, code_length=${code.length}, secret_length=${clientSecret.length}`,
    );

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `Google token exchange failed: ${response.status} ${errorBody}`,
      );
      throw new BadRequestException(
        `Google token exchange failed: ${errorBody}`,
      );
    }

    const tokenData = (await response.json()) as {
      id_token: string;
      access_token: string;
      expires_in: number;
      refresh_token?: string;
    };

    if (!tokenData.id_token) {
      throw new BadRequestException(
        'Google token exchange did not return an id_token',
      );
    }

    return {
      id_token: tokenData.id_token,
      expires_in: tokenData.expires_in,
    };
  }

  @Post('signup')
  @ApiOperation({ summary: 'Create new user and return session token' })
  @ApiResponse({
    status: 201,
    description: 'User created successfully with session token',
    type: TokenResponseDto,
  })
  @ApiResponse({
    status: 202,
    description: 'User created successfully. Email confirmation required.',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - User might already exist or invalid input',
  })
  @ApiBody({ type: UserCreateDto })
  @HttpCode(HttpStatus.CREATED)
  async signup(
    @Body() userCreateDto: UserCreateDto,
  ): Promise<TokenResponseDto> {
    return this.authService.signup(userCreateDto);
  }

  @Post('login')
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: TokenResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid credentials',
  })
  @ApiBody({ type: UserLoginDto })
  @HttpCode(HttpStatus.OK)
  async login(@Body() userLoginDto: UserLoginDto): Promise<TokenResponseDto> {
    return this.authService.login(userLoginDto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'User logout' })
  @ApiResponse({
    status: 204,
    description: 'Logout successful',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or expired token',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Request() req: Record<string, unknown>): Promise<void> {
    // Extract token from Authorization header
    const authHeader = (req.headers as Record<string, unknown> | undefined)
      ?.authorization as string | undefined;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      throw new Error('No token provided');
    }

    return this.authService.logout(token);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    type: TokenResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or expired refresh token',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        refreshToken: {
          type: 'string',
          description: 'Refresh token to exchange for new access token',
        },
      },
      required: ['refreshToken'],
    },
  })
  @HttpCode(HttpStatus.OK)
  async refreshToken(
    @Body('refreshToken') refreshToken: string,
  ): Promise<TokenResponseDto> {
    if (!refreshToken) {
      throw new Error('Refresh token is required');
    }
    return this.authService.refreshToken(refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user details' })
  @ApiResponse({
    status: 200,
    description: 'Current user profile',
    type: AuthenticatedUserResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or expired token',
  })
  async getCurrentUser(
    @CurrentUser() currentAuthUser: SupabaseAuthUserDto,
    @Request() req: Record<string, unknown>,
  ): Promise<AuthenticatedUserResponseDto> {
    // Extract token from Authorization header
    const authHeader = (req.headers as Record<string, unknown> | undefined)
      ?.authorization as string | undefined;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      throw new Error('No token provided');
    }

    return this.authService.getCurrentUser(currentAuthUser, token);
  }

  @Get('validate')
  @ApiOperation({
    summary: 'Validate a Bearer token and return its claims',
    description:
      'Called by other products to verify a user token. Accepts a Bearer token and returns userId, orgSlug, orgId, and roles.',
  })
  @ApiResponse({
    status: 200,
    description: 'Token is valid',
    schema: {
      type: 'object',
      properties: {
        valid: { type: 'boolean' },
        userId: { type: 'string' },
        email: { type: 'string' },
        orgSlug: { type: 'string' },
        orgId: { type: 'string' },
        roles: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Token is invalid or missing' })
  async validateToken(@Request() req: Record<string, unknown>): Promise<{
    valid: true;
    userId: string;
    email: string | undefined;
    orgSlug: string | undefined;
    orgId: string | undefined;
    roles: string[];
  }> {
    const authHeader = (req.headers as Record<string, unknown> | undefined)
      ?.authorization as string | undefined;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    const principal = await this.identityProvider.validateToken(token);
    const resolvedUserId =
      await this.authService.resolveInternalUserId(principal);

    const orgSlug = (principal.appMetadata?.organization_slug ??
      (
        principal.rawClaims?.user_metadata as
          | Record<string, unknown>
          | undefined
      )?.organization_slug ??
      (principal.rawClaims?.app_metadata as Record<string, unknown> | undefined)
        ?.organization_slug) as string | undefined;

    const orgId = (principal.appMetadata?.organization_id ??
      (principal.rawClaims?.app_metadata as Record<string, unknown> | undefined)
        ?.organization_id) as string | undefined;

    const rawRoles = (principal.appMetadata?.roles ??
      (principal.rawClaims?.app_metadata as Record<string, unknown> | undefined)
        ?.roles ??
      []) as string[];

    return {
      valid: true,
      userId: resolvedUserId,
      email: principal.email,
      orgSlug,
      orgId,
      roles: rawRoles,
    };
  }

  @Get('entitlements')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Get the current user's product entitlements",
    description:
      "Returns the list of products the user's organization is entitled to access. Command Web uses this to determine navigation options.",
  })
  @ApiQuery({
    name: 'orgSlug',
    required: false,
    description: 'Organization slug to check entitlements for (optional)',
  })
  @ApiResponse({
    status: 200,
    description: 'Product entitlements',
    schema: {
      type: 'object',
      properties: {
        products: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              slug: { type: 'string' },
              name: { type: 'string' },
              hasAccess: { type: 'boolean' },
              webUrl: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getEntitlements(
    @CurrentUser() _currentUser: SupabaseAuthUserDto,
    @Query('orgSlug') _orgSlug?: string,
  ): {
    products: Array<{
      slug: string;
      name: string;
      hasAccess: boolean;
      webUrl: string;
    }>;
  } {
    // All products are accessible — real entitlement checking will be added later
    // when the entitlements table and RBAC are fully wired
    const products = ALL_PRODUCTS.map((product) => ({
      ...product,
      hasAccess: true,
    }));

    return { products };
  }

  @Get('permissions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Get the current user's permissions",
    description:
      "Returns the current user's permissions in the specified organization. Requires the organizationSlug query parameter.",
  })
  @ApiQuery({
    name: 'organizationSlug',
    required: true,
    description: 'Organization slug to get permissions for',
  })
  @ApiResponse({
    status: 200,
    description: 'User permissions',
    schema: {
      type: 'object',
      properties: {
        permissions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              permission: { type: 'string' },
              resourceType: { type: 'string' },
              resourceId: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'organizationSlug is required' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getPermissions(
    @CurrentUser() currentUser: SupabaseAuthUserDto,
    @Query('organizationSlug') organizationSlug: string,
  ): Promise<{
    permissions: Array<{
      permission: string;
      resourceType?: string;
      resourceId?: string;
    }>;
  }> {
    if (!organizationSlug) {
      throw new BadRequestException(
        'organizationSlug query parameter is required',
      );
    }

    const permissions = await this.rbacService.getUserPermissions(
      currentUser.id,
      organizationSlug,
    );

    return { permissions };
  }

  // Admin User Management Endpoints

  @Post('admin/users')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('admin:users')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create new user (admin only)' })
  @ApiResponse({
    status: 201,
    description: 'User created successfully',
    type: CreateUserResponseDto,
  })
  async createUser(
    @Body() createUserDto: CreateUserDto,
    @CurrentUser() currentAuthUser: SupabaseAuthUserDto,
  ): Promise<CreateUserResponseDto> {
    return this.authService.createUser(createUserDto, currentAuthUser.id);
  }

  @Get('admin/users')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('admin:users')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all users (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'List of all users with their roles',
    type: [UserListResponseDto],
  })
  async getAllUsers(
    @CurrentUser() currentAuthUser: SupabaseAuthUserDto,
  ): Promise<UserListResponseDto[]> {
    return this.authService.getAllUsers(currentAuthUser.id) as Promise<
      UserListResponseDto[]
    >;
  }

  @Get('admin/users/:userId')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('admin:users')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user by ID (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'User details with roles',
    type: UserListResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async getUserById(
    @Param('userId') userId: string,
    @CurrentUser() currentAuthUser: SupabaseAuthUserDto,
  ): Promise<UserListResponseDto> {
    try {
      return this.authService.getUserById(
        userId,
        currentAuthUser.id,
      ) as Promise<UserListResponseDto>;
    } catch (error) {
      // If error message contains "not found" or Supabase single() error, return 404 instead of 500
      if (
        error instanceof Error &&
        (error.message.toLowerCase().includes('not found') ||
          error.message.includes(
            'Cannot coerce the result to a single JSON object',
          ))
      ) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }
      throw error;
    }
  }

  @Put('admin/users/:userId/roles')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('admin:users')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Set user roles (admin only) - use RBAC endpoints instead',
  })
  @ApiResponse({
    status: 200,
    description: 'User roles updated successfully',
  })
  async setUserRoles(
    @Param('userId') userId: string,
    @Body() updateUserRolesDto: UpdateUserRolesDto,
    @CurrentUser() currentAuthUser: SupabaseAuthUserDto,
  ): Promise<{ success: boolean; message: string }> {
    // Use RBAC service - requires organization context
    const orgSlug = updateUserRolesDto.organizationSlug || 'demo-org';
    for (const roleName of updateUserRolesDto.roles) {
      await this.rbacService.assignRole(
        userId,
        orgSlug,
        roleName,
        currentAuthUser.id,
      );
    }
    return {
      success: true,
      message: `User roles updated to: ${updateUserRolesDto.roles.join(', ')}`,
    };
  }

  @Post('admin/users/:userId/roles')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('admin:users')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Add role to user (admin only) - use RBAC endpoints instead',
  })
  @ApiResponse({
    status: 200,
    description: 'Role added successfully',
  })
  async addUserRole(
    @Param('userId') userId: string,
    @Body() addUserRoleDto: AddUserRoleDto,
    @CurrentUser() currentAuthUser: SupabaseAuthUserDto,
  ): Promise<{ success: boolean; message: string }> {
    const orgSlug = addUserRoleDto.organizationSlug || 'demo-org';
    await this.rbacService.assignRole(
      userId,
      orgSlug,
      addUserRoleDto.role,
      currentAuthUser.id,
    );
    return {
      success: true,
      message: `Role '${addUserRoleDto.role}' added to user`,
    };
  }

  @Delete('admin/users/:userId/roles/:role')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('admin:users')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Remove role from user (admin only) - use RBAC endpoints instead',
  })
  @ApiResponse({
    status: 200,
    description: 'Role removed successfully',
  })
  async removeUserRole(
    @Param('userId') userId: string,
    @Param('role') role: string,
    @Body() removeUserRoleDto: RemoveUserRoleDto,
    @CurrentUser() currentAuthUser: SupabaseAuthUserDto,
  ): Promise<{ success: boolean; message: string }> {
    const orgSlug = removeUserRoleDto.organizationSlug || 'demo-org';
    await this.rbacService.revokeRole(
      userId,
      orgSlug,
      role,
      currentAuthUser.id,
    );
    return {
      success: true,
      message: `Role '${role}' removed from user`,
    };
  }

  @Delete('admin/users/:userId')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('admin:users')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete user (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'User deleted successfully',
  })
  async deleteUser(
    @Param('userId') userId: string,
    @CurrentUser() currentAuthUser: SupabaseAuthUserDto,
  ): Promise<{ success: boolean; message: string }> {
    return this.authService.deleteUser(userId, currentAuthUser.id);
  }

  @Put('admin/users/:userId/password')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('admin:users')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change user password (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Password changed successfully',
  })
  async changeUserPassword(
    @Param('userId') userId: string,
    @Body('newPassword') newPassword: string,
    @CurrentUser() currentAuthUser: SupabaseAuthUserDto,
  ): Promise<{ success: boolean; message: string }> {
    if (!newPassword || newPassword.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }
    return this.authService.changeUserPassword(
      userId,
      newPassword,
      currentAuthUser.id,
    );
  }
}
