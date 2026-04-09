import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Response } from 'express';
import { spawn, execSync, ChildProcess } from 'child_process';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';

interface CommandInfo {
  name: string;
  description: string;
}

interface SkillInfo {
  name: string;
  description: string;
}

interface ExecutionResult {
  sessionId?: string;
}

@Injectable()
export class ClaudePaneService implements OnModuleDestroy {
  private readonly logger = new Logger(ClaudePaneService.name);
  private readonly projectRoot: string;
  private readonly activeProcesses = new Map<string, ChildProcess>();
  private readonly claudeCliPath: string;

  constructor() {
    // Navigate from apps/admin/api to project root (three levels up)
    this.projectRoot = join(process.cwd(), '..', '..', '..');
    this.logger.log(`Project root set to: ${this.projectRoot}`);

    this.claudeCliPath = this.resolveGlobalClaudeCli();
    this.logger.log(`Claude CLI resolved to: ${this.claudeCliPath}`);
  }

  /**
   * Resolve the global Claude CLI binary path.
   * Strips npm-injected node_modules/.bin from PATH to avoid using a stale project-local copy.
   */
  private resolveGlobalClaudeCli(): string {
    try {
      const globalPath = execSync('which claude', {
        encoding: 'utf-8',
        timeout: 3000,
        env: {
          ...process.env,
          PATH: (process.env['PATH'] || '')
            .split(':')
            .filter((p) => !p.includes('node_modules/.bin'))
            .join(':'),
        },
      }).trim();
      if (globalPath && existsSync(globalPath)) {
        return globalPath;
      }
    } catch {
      // Fall through to candidates
    }

    const home = homedir();
    const candidates = [
      join(home, '.npm-global', 'bin', 'claude'),
      '/usr/local/bin/claude',
      '/usr/bin/claude',
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    this.logger.warn(
      'Could not resolve global Claude CLI path; falling back to PATH lookup',
    );
    return 'claude';
  }

  onModuleDestroy() {
    for (const [id, proc] of this.activeProcesses) {
      this.logger.warn(`Killing active Claude CLI process ${id}`);
      proc.kill('SIGTERM');
    }
    this.activeProcesses.clear();
  }

  /**
   * Check CLI availability and version
   */
  getCliInfo(): { available: boolean; version: string } {
    try {
      const output = execSync(`${this.claudeCliPath} --version`, {
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();
      return { available: true, version: output };
    } catch (error) {
      this.logger.error(
        `Claude CLI not available: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return { available: false, version: 'not installed' };
    }
  }

  /**
   * Build a clean environment for the Claude CLI child process.
   * Strips ANTHROPIC_API_KEY (so CLI uses Max subscription) and
   * all CLAUDE* vars (to avoid "nested session" rejection).
   */
  private buildCliEnv(): Record<string, string> {
    const cliEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (key === 'ANTHROPIC_API_KEY') continue;
      if (key.startsWith('CLAUDE')) continue;
      if (value !== undefined) cliEnv[key] = value;
    }
    return cliEnv;
  }

  /**
   * Load source context from .claude/contexts/{source}.md
   */
  private async loadSourceContext(
    sourceContext?: string,
  ): Promise<string | undefined> {
    const contextName = sourceContext || 'default';
    const contextFile = join(
      this.projectRoot,
      '.claude',
      'contexts',
      `${contextName}.md`,
    );

    if (existsSync(contextFile)) {
      try {
        const content = await readFile(contextFile, 'utf-8');
        this.logger.debug(`Loaded context: ${contextName}`);
        return content;
      } catch (error) {
        this.logger.warn(
          `Failed to load context ${contextName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    if (contextName !== 'default') {
      const defaultFile = join(
        this.projectRoot,
        '.claude',
        'contexts',
        'default.md',
      );
      if (existsSync(defaultFile)) {
        try {
          const content = await readFile(defaultFile, 'utf-8');
          this.logger.debug('Loaded default context as fallback');
          return content;
        } catch (error) {
          this.logger.warn(
            `Failed to load default context: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }
    }

    return undefined;
  }

  /**
   * Execute a prompt using Claude Code CLI and stream results via SSE.
   * Spawns `claude` with --output-format stream-json for structured streaming.
   */
  async executeWithStreaming(
    prompt: string,
    res: Response,
    sessionId?: string,
    sourceContext?: string,
    applicationContext?: string,
    product?: string,
  ): Promise<ExecutionResult> {
    this.logger.log(
      `Executing prompt: ${prompt}${sessionId ? ` (resuming session ${sessionId})` : ' (new session)'}${product ? ` (product: ${product})` : ''}`,
    );

    const contextContent = await this.loadSourceContext(sourceContext);
    const modeGuidance = `You are helping a developer work on the OrchestratorAI Enterprise codebase.
You have full access to read, write, and edit files, run bash commands, and use git.
You can make changes to the codebase, run builds, tests, and deploy code.${product ? `\nYou are currently operating in the context of the ${product} product.` : ''}`;

    let combinedSystemPrompt = contextContent
      ? `${modeGuidance}\n\n${contextContent}`
      : modeGuidance;

    if (applicationContext) {
      combinedSystemPrompt += `\n\n## Current Application Context\n\n${applicationContext}`;
    }

    const args = [
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--dangerously-skip-permissions',
      '--append-system-prompt',
      combinedSystemPrompt,
    ];

    if (sessionId) {
      args.push('--resume', sessionId);
    }

    this.logger.log(`Spawning ${this.claudeCliPath} with ${args.length} args`);

    const cliEnv = this.buildCliEnv();

    const child = spawn(this.claudeCliPath, args, {
      cwd: this.projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: cliEnv,
    });

    child.stdin.write(prompt);
    child.stdin.end();

    const processId = `claude-pane-${Date.now()}`;
    this.activeProcesses.set(processId, child);

    let capturedSessionId: string | undefined = sessionId;
    let lineBuffer = '';
    let stderrOutput = '';

    child.stdout.on('data', (chunk: Buffer) => {
      lineBuffer += chunk.toString();
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
          this.logger.debug(`CLI non-JSON: ${trimmed.slice(0, 200)}`);
          continue;
        }

        const msgType = parsed['type'] as string;

        if (msgType === 'system' && parsed['subtype'] === 'init') {
          capturedSessionId = parsed['session_id'] as string;
          this.logger.debug(`Session ID: ${capturedSessionId}`);
          res.write('event: session\n');
          res.write(
            `data: ${JSON.stringify({ sessionId: capturedSessionId })}\n\n`,
          );
          continue;
        }

        const eventType = msgType ?? 'message';
        res.write(`event: ${eventType}\n`);
        res.write(`data: ${trimmed}\n\n`);

        if (msgType === 'assistant') {
          this.logger.debug('Assistant message received');
        }
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderrOutput += text;
      this.logger.warn(`CLI stderr: ${text}`);
    });

    return new Promise<ExecutionResult>((resolve) => {
      child.on('close', (code) => {
        this.activeProcesses.delete(processId);

        if (lineBuffer.trim()) {
          try {
            const parsed = JSON.parse(lineBuffer.trim()) as Record<
              string,
              unknown
            >;
            const msgType = (parsed['type'] as string) ?? 'message';
            res.write(`event: ${msgType}\n`);
            res.write(`data: ${lineBuffer.trim()}\n\n`);
          } catch {
            // Not valid JSON, skip
          }
        }

        if (code !== 0 && code !== null) {
          this.logger.error(
            `CLI exited with code ${code}. stderr: ${stderrOutput}`,
          );
          res.write('event: error\n');
          res.write(
            `data: ${JSON.stringify({ error: `Claude CLI exited with code ${code}`, stderr: stderrOutput })}\n\n`,
          );
        }

        res.write('event: done\n');
        res.write(
          `data: ${JSON.stringify({ status: 'completed', sessionId: capturedSessionId })}\n\n`,
        );
        res.end();

        this.logger.log('Execution completed');
        resolve({ sessionId: capturedSessionId });
      });

      child.on('error', (err) => {
        this.activeProcesses.delete(processId);
        this.logger.error(`CLI spawn error: ${err.message}`);
        res.write('event: error\n');
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
        resolve({ sessionId: capturedSessionId });
      });

      res.on('close', () => {
        if (!child.killed) {
          this.logger.log('Client disconnected, killing CLI process');
          child.kill('SIGTERM');
          this.activeProcesses.delete(processId);
        }
      });
    });
  }

  /**
   * List available commands from .claude/commands/
   */
  async listCommands(): Promise<{ commands: CommandInfo[] }> {
    const commandsDir = join(this.projectRoot, '.claude', 'commands');
    this.logger.debug(`Looking for commands in: ${commandsDir}`);

    if (!existsSync(commandsDir)) {
      this.logger.warn(`Commands directory not found: ${commandsDir}`);
      return { commands: [] };
    }

    try {
      const files = await readdir(commandsDir);
      const commands: CommandInfo[] = [];

      for (const file of files) {
        if (!file.endsWith('.md')) continue;

        const name = '/' + file.replace('.md', '');
        let description = file.replace('.md', '').replace(/-/g, ' ');

        try {
          const content = await readFile(join(commandsDir, file), 'utf-8');
          const firstLine = content.split('\n')[0];
          if (firstLine && firstLine.startsWith('#')) {
            description = firstLine.replace(/^#+\s*/, '');
          }
        } catch {
          // Use default description
        }

        commands.push({ name, description });
      }

      this.logger.log(`Found ${commands.length} commands`);
      return { commands };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error listing commands: ${errorMessage}`);
      return { commands: [] };
    }
  }

  /**
   * List available skills from .claude/skills/
   */
  async listSkills(): Promise<{ skills: SkillInfo[] }> {
    const skillsDir = join(this.projectRoot, '.claude', 'skills');
    this.logger.debug(`Looking for skills in: ${skillsDir}`);

    if (!existsSync(skillsDir)) {
      this.logger.warn(`Skills directory not found: ${skillsDir}`);
      return { skills: [] };
    }

    try {
      const entries = await readdir(skillsDir, { withFileTypes: true });
      const skills: SkillInfo[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const name = entry.name;
        let description = name.replace(/-/g, ' ');

        try {
          const skillFile = join(skillsDir, name, 'SKILL.md');
          if (existsSync(skillFile)) {
            const content = await readFile(skillFile, 'utf-8');
            const firstLine = content.split('\n')[0];
            if (firstLine && firstLine.startsWith('#')) {
              description = firstLine.replace(/^#+\s*/, '');
            }
          }
        } catch {
          // Use default description
        }

        skills.push({ name, description });
      }

      this.logger.log(`Found ${skills.length} skills`);
      return { skills };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error listing skills: ${errorMessage}`);
      return { skills: [] };
    }
  }

  /**
   * Revert uncommitted changes in the working tree (git restore .).
   */
  revertGitWorkingTree(): { success: boolean; message: string } {
    try {
      const statusBefore = execSync('git status --porcelain', {
        cwd: this.projectRoot,
        encoding: 'utf-8',
      }).trim();

      if (!statusBefore) {
        return { success: true, message: 'No changes to undo' };
      }

      execSync('git restore .', { cwd: this.projectRoot, encoding: 'utf-8' });
      this.logger.log('Reverted working tree via git restore .');
      return { success: true, message: 'Changes reverted successfully' };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Git revert failed: ${errorMessage}`);
      return { success: false, message: `Failed to revert: ${errorMessage}` };
    }
  }
}
