import {
  UserCreateDto,
  UserLoginDto,
  TokenResponseDto,
  AuthenticatedUserResponseDto,
  SupabaseAuthUserDto,
  UserProfileDto,
} from '@/auth/dto/auth.dto';
import {
  CreateUserDto,
  CreateUserResponseDto,
} from '@/auth/dto/admin-user-management.dto';
import { AuthenticatedPrincipal } from './authenticated-principal.interface';

export const AUTH_SERVICE = Symbol('AUTH_SERVICE');

export interface AuthServiceProvider {
  // Session lifecycle (Supabase-only; external throws NOT_IMPLEMENTED)
  signup(dto: UserCreateDto): Promise<TokenResponseDto>;
  login(dto: UserLoginDto): Promise<TokenResponseDto>;
  logout(token: string): Promise<void>;
  refreshToken(refreshToken: string): Promise<TokenResponseDto>;
  initiatePasswordReset(
    email: string,
  ): Promise<{ success: boolean; message: string }>;

  // Token validation
  validateUser(token: string): Promise<SupabaseAuthUserDto>;

  // Identity resolution (called by JwtAuthGuard)
  resolveInternalUserId(principal: AuthenticatedPrincipal): Promise<string>;

  // User profile / RBAC
  getCurrentUser(
    authUser: SupabaseAuthUserDto,
    token: string,
  ): Promise<AuthenticatedUserResponseDto>;
  getUserProfile(userId: string): Promise<UserProfileDto | null>;
  getOrganizationAccessForUser(userId: string): Promise<string[]>;

  // Admin (Supabase-only; external throws NOT_IMPLEMENTED)
  createUser(
    dto: CreateUserDto,
    adminId: string,
  ): Promise<CreateUserResponseDto>;
  getAllUsers(adminId: string): Promise<unknown[]>;
  getUserById(userId: string, adminId: string): Promise<unknown>;
  deleteUser(
    userId: string,
    adminId: string,
  ): Promise<{ success: boolean; message: string }>;
  changeUserPassword(
    userId: string,
    pw: string,
    adminId: string,
  ): Promise<{ success: boolean; message: string }>;
}
