import { IsString, IsOptional, IsUUID, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum TeamMemberRole {
  MEMBER = 'member',
  LEAD = 'lead',
  ADMIN = 'admin',
}

// ============================================================================
// Request DTOs (classes with validation)
// ============================================================================

export class CreateTeamDto {
  @ApiProperty({ description: 'Team name' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'Team description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Organization slug (optional - null for global teams)',
  })
  @IsOptional()
  @IsString()
  orgSlug?: string;
}

export class UpdateTeamDto {
  @ApiPropertyOptional({ description: 'Team name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Team description' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class AddTeamMemberDto {
  @ApiProperty({ description: 'User ID to add to team' })
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({
    description: 'Role in team',
    enum: TeamMemberRole,
    default: TeamMemberRole.MEMBER,
  })
  @IsOptional()
  @IsEnum(TeamMemberRole)
  role?: TeamMemberRole;
}

export class UpdateTeamMemberDto {
  @ApiProperty({ description: 'Role in team', enum: TeamMemberRole })
  @IsEnum(TeamMemberRole)
  role!: TeamMemberRole;
}

// ============================================================================
// Response Types (interfaces for type safety without initialization requirements)
// ============================================================================

export interface TeamResponseDto {
  id: string;
  orgSlug?: string | null; // Nullable for global teams
  name: string;
  description?: string;
  memberCount: number;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamMemberResponseDto {
  id: string;
  userId: string;
  email: string;
  displayName?: string;
  role: TeamMemberRole;
  joinedAt: Date;
}

export interface UserTeamResponseDto {
  id: string;
  name: string;
  description?: string;
  orgSlug?: string | null; // Nullable for global teams
  role: string;
  joinedAt: Date;
}

export interface UserOrganizationResponseDto {
  slug: string;
  name: string;
  role: string;
  isGlobal: boolean;
}

export interface UserContextResponseDto {
  user: {
    id: string;
    email: string;
    displayName?: string;
  };
  organizations: UserOrganizationResponseDto[];
  teams: UserTeamResponseDto[];
}
