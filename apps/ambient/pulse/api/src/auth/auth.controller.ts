import {
  Controller,
  Get,
  UseGuards,
  Request,
  Logger,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  AUTH_SERVICE,
  AuthServiceProvider,
} from './interfaces/auth-service.interface';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import {
  AuthenticatedUserResponseDto,
  SupabaseAuthUserDto,
} from './dto/auth.dto';

/**
 * Auth Controller — Forge API
 *
 * Forge only needs JWT token validation — all auth CRUD (login, signup, logout,
 * user management) is handled by the Auth API (port 6100).
 *
 * This controller exposes only the /auth/me endpoint used to enrich
 * ExecutionContext with the current authenticated user's profile.
 */
@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    @Inject(AUTH_SERVICE)
    private readonly authService: AuthServiceProvider,
  ) {}

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
    const authHeader = (req.headers as Record<string, unknown> | undefined)
      ?.authorization as string | undefined;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      throw new Error('No token provided');
    }

    return this.authService.getCurrentUser(currentAuthUser, token);
  }
}
