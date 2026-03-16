import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  UseGuards,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupabaseAuthUserDto } from '../auth/dto/auth.dto';
import { RbacService } from '../rbac/rbac.service';
import { SuperAdminService } from './super-admin.service';
import { ExecuteCommandDto } from './dto/execute-command.dto';

@ApiTags('Super Admin')
@ApiBearerAuth()
@Controller('super-admin')
@UseGuards(JwtAuthGuard)
export class SuperAdminController {
  private readonly logger = new Logger(SuperAdminController.name);

  constructor(
    private readonly rbacService: RbacService,
    private readonly superAdminService: SuperAdminService,
  ) {}

  /**
   * Validate that request is from a super admin in development mode
   */
  private async validateAccess(userId: string): Promise<void> {
    // Check dev mode
    if (process.env.NODE_ENV !== 'development') {
      throw new ForbiddenException(
        'Claude Code Panel is only available in development mode',
      );
    }

    // Check super admin
    const isSuperAdmin = await this.rbacService.isSuperAdmin(userId);
    if (!isSuperAdmin) {
      throw new ForbiddenException('Super admin access required');
    }
  }

  @Post('execute')
  @ApiOperation({
    summary: 'Execute a Claude Code command',
    description:
      'Executes a prompt or command using Claude Code CLI. Streams results via SSE. ' +
      'Supports session resumption - pass sessionId from previous execution to continue conversation. ' +
      'Dev mode + super admin only.',
  })
  async execute(
    @Body() dto: ExecuteCommandDto,
    @CurrentUser() user: SupabaseAuthUserDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.validateAccess(user.id);

    this.logger.log(
      `Super admin ${user.id} executing: ${dto.prompt}${dto.sessionId ? ` (session: ${dto.sessionId})` : ''}${dto.sourceContext ? ` (context: ${dto.sourceContext})` : ''}`,
    );

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Stream execution with optional session resumption, source context, and application context
    await this.superAdminService.executeWithStreaming(
      dto.prompt,
      res,
      dto.sessionId,
      dto.sourceContext,
      dto.applicationContext,
    );
  }

  @Get('commands')
  @ApiOperation({
    summary: 'List available commands',
    description:
      'Returns list of available Claude Code commands from .claude/commands/. Dev mode + super admin only.',
  })
  async getCommands(
    @CurrentUser() user: SupabaseAuthUserDto,
  ): Promise<{ commands: { name: string; description: string }[] }> {
    await this.validateAccess(user.id);
    return this.superAdminService.listCommands();
  }

  @Get('skills')
  @ApiOperation({
    summary: 'List available skills',
    description:
      'Returns list of available Claude Code skills from .claude/skills/. Dev mode + super admin only.',
  })
  async getSkills(
    @CurrentUser() user: SupabaseAuthUserDto,
  ): Promise<{ skills: { name: string; description: string }[] }> {
    await this.validateAccess(user.id);
    return this.superAdminService.listSkills();
  }

  @Post('git/revert')
  @ApiOperation({
    summary: 'Revert uncommitted git changes',
    description:
      'Runs git restore . in the project root. Dev mode + super admin only.',
  })
  async gitRevert(
    @CurrentUser() user: SupabaseAuthUserDto,
  ): Promise<{ success: boolean; message: string }> {
    await this.validateAccess(user.id);
    return this.superAdminService.revertGitWorkingTree();
  }

  @Get('health')
  @ApiOperation({
    summary: 'Check Claude Code CLI availability',
    description:
      'Returns health status and CLI availability. Dev mode + super admin only.',
  })
  async health(@CurrentUser() user: SupabaseAuthUserDto): Promise<{
    status: string;
    cliAvailable: boolean;
    cliVersion: string;
    nodeEnv: string;
  }> {
    await this.validateAccess(user.id);
    const cliInfo = this.superAdminService.getCliInfo();

    return {
      status: 'ok',
      cliAvailable: cliInfo.available,
      cliVersion: cliInfo.version,
      nodeEnv: process.env.NODE_ENV || 'unknown',
    };
  }
}
