import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { TeamsService } from './teams.service';
import {
  CreateTeamDto,
  UpdateTeamDto,
  AddTeamMemberDto,
  UpdateTeamMemberDto,
  TeamResponseDto,
  TeamMemberResponseDto,
  UserContextResponseDto,
  TeamMemberRole,
} from './teams.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
  };
}

@ApiTags('Teams')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  // ============================================================================
  // User Context
  // ============================================================================

  @Get('users/me/context')
  @ApiOperation({
    summary: 'Get current user context',
    description:
      'Returns the current user info along with their organizations and teams',
  })
  @ApiResponse({
    status: 200,
    description: 'User context retrieved successfully',
  })
  async getUserContext(
    @Req() req: AuthenticatedRequest,
  ): Promise<UserContextResponseDto> {
    return this.teamsService.getUserContext(req.user.id);
  }

  // ============================================================================
  // Global Teams (no org)
  // ============================================================================

  @Get('teams')
  @ApiOperation({
    summary: 'Get global teams',
    description: 'Returns all global teams (teams without an organization)',
  })
  @ApiResponse({
    status: 200,
    description: 'Global teams retrieved successfully',
  })
  async getGlobalTeams(): Promise<TeamResponseDto[]> {
    return this.teamsService.getGlobalTeams();
  }

  @Post('teams')
  @ApiOperation({
    summary: 'Create global team',
    description:
      'Creates a new global team (no org) or org-scoped team if orgSlug provided (admin only)',
  })
  @ApiResponse({
    status: 201,
    description: 'Team created successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 409, description: 'Team name already exists' })
  async createGlobalTeam(
    @Body() dto: CreateTeamDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TeamResponseDto> {
    return this.teamsService.createTeam(
      dto.orgSlug ?? null,
      dto.name,
      dto.description,
      req.user.id,
    );
  }

  // ============================================================================
  // Organization Teams
  // ============================================================================

  @Get('orgs/:orgSlug/teams')
  @ApiOperation({
    summary: 'Get teams in organization',
    description: 'Returns all teams in the specified organization',
  })
  @ApiParam({ name: 'orgSlug', description: 'Organization slug' })
  @ApiResponse({
    status: 200,
    description: 'Teams retrieved successfully',
  })
  async getOrgTeams(
    @Param('orgSlug') orgSlug: string,
  ): Promise<TeamResponseDto[]> {
    return this.teamsService.getTeamsByOrg(orgSlug);
  }

  @Post('orgs/:orgSlug/teams')
  @ApiOperation({
    summary: 'Create team in organization',
    description:
      'Creates a new team in the specified organization (admin only)',
  })
  @ApiParam({ name: 'orgSlug', description: 'Organization slug' })
  @ApiResponse({
    status: 201,
    description: 'Team created successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 409, description: 'Team name already exists' })
  async createOrgTeam(
    @Param('orgSlug') orgSlug: string,
    @Body() dto: CreateTeamDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TeamResponseDto> {
    return this.teamsService.createTeam(
      orgSlug,
      dto.name,
      dto.description,
      req.user.id,
    );
  }

  // ============================================================================
  // Team CRUD
  // ============================================================================

  @Get('teams/:teamId')
  @ApiOperation({
    summary: 'Get team by ID',
    description: 'Returns a single team by its ID',
  })
  @ApiParam({ name: 'teamId', description: 'Team ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Team retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Team not found' })
  async getTeam(@Param('teamId') teamId: string): Promise<TeamResponseDto> {
    return this.teamsService.getTeamById(teamId);
  }

  @Put('teams/:teamId')
  @ApiOperation({
    summary: 'Update team',
    description: 'Updates a team (admin only)',
  })
  @ApiParam({ name: 'teamId', description: 'Team ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Team updated successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'Team not found' })
  async updateTeam(
    @Param('teamId') teamId: string,
    @Body() dto: UpdateTeamDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TeamResponseDto> {
    return this.teamsService.updateTeam(teamId, req.user.id, dto);
  }

  @Delete('teams/:teamId')
  @ApiOperation({
    summary: 'Delete team',
    description: 'Deletes a team (admin only)',
  })
  @ApiParam({ name: 'teamId', description: 'Team ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Team deleted successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'Team not found' })
  async deleteTeam(
    @Param('teamId') teamId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.teamsService.deleteTeam(teamId, req.user.id);
    return { message: 'Team deleted successfully' };
  }

  // ============================================================================
  // Team Members
  // ============================================================================

  @Get('teams/:teamId/members')
  @ApiOperation({
    summary: 'Get team members',
    description: 'Returns all members of a team',
  })
  @ApiParam({ name: 'teamId', description: 'Team ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Team members retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Team not found' })
  async getTeamMembers(
    @Param('teamId') teamId: string,
  ): Promise<TeamMemberResponseDto[]> {
    return this.teamsService.getTeamMembers(teamId);
  }

  @Post('teams/:teamId/members')
  @ApiOperation({
    summary: 'Add team member',
    description: 'Adds a user to a team (admin only)',
  })
  @ApiParam({ name: 'teamId', description: 'Team ID (UUID)' })
  @ApiResponse({
    status: 201,
    description: 'Member added successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'Team not found' })
  @ApiResponse({ status: 409, description: 'User is already a member' })
  async addTeamMember(
    @Param('teamId') teamId: string,
    @Body() dto: AddTeamMemberDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TeamMemberResponseDto> {
    return this.teamsService.addTeamMember(
      teamId,
      dto.userId,
      dto.role ?? TeamMemberRole.MEMBER,
      req.user.id,
    );
  }

  @Put('teams/:teamId/members/:userId')
  @ApiOperation({
    summary: 'Update team member role',
    description: 'Updates a team member role (admin only)',
  })
  @ApiParam({ name: 'teamId', description: 'Team ID (UUID)' })
  @ApiParam({ name: 'userId', description: 'User ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Member role updated successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'Team member not found' })
  async updateTeamMember(
    @Param('teamId') teamId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateTeamMemberDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TeamMemberResponseDto> {
    return this.teamsService.updateTeamMember(
      teamId,
      userId,
      dto.role,
      req.user.id,
    );
  }

  @Delete('teams/:teamId/members/:userId')
  @ApiOperation({
    summary: 'Remove team member',
    description:
      'Removes a user from a team (admin only, or user can remove themselves)',
  })
  @ApiParam({ name: 'teamId', description: 'Team ID (UUID)' })
  @ApiParam({ name: 'userId', description: 'User ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Member removed successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Team member not found' })
  async removeTeamMember(
    @Param('teamId') teamId: string,
    @Param('userId') userId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.teamsService.removeTeamMember(teamId, userId, req.user.id);
    return { message: 'Member removed successfully' };
  }
}
