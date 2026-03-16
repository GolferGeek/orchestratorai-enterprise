import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ClaudePaneService } from './claude-pane.service';
import { ExecuteCommandDto } from './dto/execute-command.dto';

/**
 * ClaudePaneController
 *
 * Exposes the Claude Code CLI via SSE streaming for the shared ClaudeCodePane
 * UI component used across all enterprise products.
 *
 * Endpoint prefix: /admin/claude-pane
 * Auth: Bearer token expected in Authorization header (validated by products' own guards
 *       or passed through by Admin API — currently open for dev-only usage).
 *
 * These endpoints are dev-only and should never be exposed in production without auth.
 */
@ApiTags('claude-pane')
@ApiBearerAuth()
@Controller('admin/claude-pane')
export class ClaudePaneController {
  private readonly logger = new Logger(ClaudePaneController.name);

  constructor(private readonly claudePaneService: ClaudePaneService) {}

  /**
   * GET /admin/claude-pane/health
   * Check if Claude CLI is available and return version info.
   */
  @Get('health')
  @ApiOperation({
    summary: 'Check Claude Code CLI availability',
    description: 'Returns health status and CLI availability. Development mode only.',
  })
  health(): { status: string; cliAvailable: boolean; cliVersion: string; nodeEnv: string } {
    const cliInfo = this.claudePaneService.getCliInfo();
    return {
      status: 'ok',
      cliAvailable: cliInfo.available,
      cliVersion: cliInfo.version,
      nodeEnv: process.env['NODE_ENV'] || 'unknown',
    };
  }

  /**
   * POST /admin/claude-pane/execute
   * Execute a Claude Code command and stream results via SSE.
   */
  @Post('execute')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Execute a Claude Code command',
    description:
      'Executes a prompt using Claude Code CLI. Streams results via SSE. ' +
      'Supports session resumption - pass sessionId from previous execution to continue conversation. ' +
      'Development mode only.',
  })
  async execute(
    @Body() dto: ExecuteCommandDto,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(
      `Executing: ${dto.prompt}${dto.sessionId ? ` (session: ${dto.sessionId})` : ''}${dto.product ? ` (product: ${dto.product})` : ''}`,
    );

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    await this.claudePaneService.executeWithStreaming(
      dto.prompt,
      res,
      dto.sessionId,
      dto.sourceContext,
      dto.applicationContext,
      dto.product,
    );
  }

  /**
   * GET /admin/claude-pane/commands
   * List available commands from .claude/commands/
   */
  @Get('commands')
  @ApiOperation({
    summary: 'List available Claude commands',
    description: 'Returns list of available Claude Code commands from .claude/commands/.',
  })
  async getCommands(): Promise<{ commands: { name: string; description: string }[] }> {
    return this.claudePaneService.listCommands();
  }

  /**
   * GET /admin/claude-pane/skills
   * List available skills from .claude/skills/
   */
  @Get('skills')
  @ApiOperation({
    summary: 'List available Claude skills',
    description: 'Returns list of available Claude Code skills from .claude/skills/.',
  })
  async getSkills(): Promise<{ skills: { name: string; description: string }[] }> {
    return this.claudePaneService.listSkills();
  }

  /**
   * POST /admin/claude-pane/git/revert
   * Revert uncommitted git changes (git restore .)
   */
  @Post('git/revert')
  @ApiOperation({
    summary: 'Revert uncommitted git changes',
    description: 'Runs git restore . in the project root. Development mode only.',
  })
  gitRevert(): { success: boolean; message: string } {
    return this.claudePaneService.revertGitWorkingTree();
  }
}
