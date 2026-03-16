import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { SuperAdminService } from '../super-admin.service';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import { EventEmitter } from 'events';
import { ChildProcess, spawn, execSync } from 'child_process';

// Mock the fs modules
jest.mock('fs');
jest.mock('fs/promises');

// Mock child_process
jest.mock('child_process', () => ({
  spawn: jest.fn(),
  execSync: jest.fn().mockReturnValue('2.1.37 (Claude Code)'),
}));

/**
 * Create a mock ChildProcess that emits JSON lines on stdout and then closes.
 * When spawned from Node, CLI stream-json output goes to stdout.
 */
function createMockChild(
  stdoutJsonLines: string[],
  exitCode = 0,
): ChildProcess & { stdin: { write: jest.Mock; end: jest.Mock } } {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const stdin = { write: jest.fn(), end: jest.fn() };
  const proc = new EventEmitter() as ChildProcess & {
    stdin: { write: jest.Mock; end: jest.Mock };
  };

  Object.assign(proc, {
    stdout,
    stderr,
    stdin,
    killed: false,
    kill: jest.fn(),
    pid: 12345,
  });

  // Emit JSON lines on stdout and close
  setImmediate(() => {
    for (const line of stdoutJsonLines) {
      stdout.emit('data', Buffer.from(line + '\n'));
    }
    proc.emit('close', exitCode);
  });

  return proc;
}

describe('SuperAdminService', () => {
  let service: SuperAdminService;
  let mockExistsSync: jest.MockedFunction<typeof fs.existsSync>;
  let mockReaddir: jest.MockedFunction<typeof fsPromises.readdir>;
  let mockReadFile: jest.MockedFunction<typeof fsPromises.readFile>;
  let mockSpawn: jest.MockedFunction<typeof spawn>;

  // Mock response object
  let mockResponse: Partial<Response>;
  let writtenEvents: string[];

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    writtenEvents = [];

    // Setup mock response
    mockResponse = {
      write: jest.fn((data: string) => {
        writtenEvents.push(data);
        return true;
      }),
      end: jest.fn(),
      on: jest.fn(),
    };

    // Setup fs mocks
    mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
    mockReaddir = fsPromises.readdir as jest.MockedFunction<
      typeof fsPromises.readdir
    >;
    mockReadFile = fsPromises.readFile as jest.MockedFunction<
      typeof fsPromises.readFile
    >;
    mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

    // Default mock implementations
    mockExistsSync.mockReturnValue(true);
    mockReaddir.mockResolvedValue([]);
    mockReadFile.mockResolvedValue('');

    const module: TestingModule = await Test.createTestingModule({
      providers: [SuperAdminService],
    }).compile();

    service = module.get<SuperAdminService>(SuperAdminService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCliInfo', () => {
    it('should return CLI version when claude is installed', () => {
      (execSync as jest.Mock).mockReturnValue('2.1.37 (Claude Code)');

      const result = service.getCliInfo();

      expect(result).toEqual({
        available: true,
        version: '2.1.37 (Claude Code)',
      });
    });

    it('should report not available when claude is not installed', () => {
      (execSync as jest.Mock).mockImplementation(() => {
        throw new Error('command not found: claude');
      });

      const result = service.getCliInfo();

      expect(result).toEqual({
        available: false,
        version: 'not installed',
      });
    });
  });

  describe('listCommands', () => {
    it('should return empty array when commands directory does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await service.listCommands();

      expect(result).toEqual({ commands: [] });
    });

    it('should return empty array when no markdown files found', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue(['file.txt' as any, 'document.pdf' as any]);

      const result = await service.listCommands();

      expect(result).toEqual({ commands: [] });
    });

    it('should list commands from markdown files', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue([
        'analyze-code.md' as any,
        'run-tests.md' as any,
        'deploy.md' as any,
      ]);
      mockReadFile.mockResolvedValue('# Analyze Code\nAnalyze the codebase');

      const result = await service.listCommands();

      expect(result.commands).toHaveLength(3);
      expect(result.commands).toEqual(
        expect.arrayContaining([
          { name: '/analyze-code', description: expect.any(String) },
          { name: '/run-tests', description: expect.any(String) },
          { name: '/deploy', description: expect.any(String) },
        ]),
      );
    });

    it('should extract description from first line of markdown file', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue(['analyze-code.md' as any]);
      mockReadFile.mockResolvedValue(
        '# Analyze Code Quality\nThis command analyzes code quality',
      );

      const result = await service.listCommands();

      expect(result.commands[0]).toBeDefined();
      expect(result.commands[0]).toEqual({
        name: '/analyze-code',
        description: 'Analyze Code Quality',
      });
    });

    it('should use filename as fallback description if file read fails', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue(['analyze-code.md' as any]);
      mockReadFile.mockRejectedValue(new Error('File read error'));

      const result = await service.listCommands();

      expect(result.commands[0]).toBeDefined();
      expect(result.commands[0]).toEqual({
        name: '/analyze-code',
        description: 'analyze code',
      });
    });

    it('should handle readdir errors gracefully', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockRejectedValue(new Error('Permission denied'));

      const result = await service.listCommands();

      expect(result).toEqual({ commands: [] });
    });

    it('should skip non-markdown files', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue([
        'command.md' as any,
        'readme.txt' as any,
        'config.json' as any,
      ]);

      const result = await service.listCommands();

      expect(result.commands).toHaveLength(1);
      expect(result.commands[0]?.name).toBe('/command');
    });
  });

  describe('listSkills', () => {
    it('should return empty array when skills directory does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await service.listSkills();

      expect(result).toEqual({ skills: [] });
    });

    it('should list skills from directories', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue([
        { name: 'database-query-skill', isDirectory: () => true } as any,
        { name: 'api-integration-skill', isDirectory: () => true } as any,
        { name: 'readme.md', isDirectory: () => false } as any,
      ]);
      mockReadFile.mockResolvedValue('# Database Query\nQuery database');

      const result = await service.listSkills();

      expect(result.skills).toHaveLength(2);
    });

    it('should extract description from SKILL.md file', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue([
        { name: 'database-query-skill', isDirectory: () => true } as any,
      ]);
      mockReadFile.mockResolvedValue(
        '# Database Query Skill\nExecute database queries',
      );

      const result = await service.listSkills();

      expect(result.skills[0]).toEqual({
        name: 'database-query-skill',
        description: 'Database Query Skill',
      });
    });

    it('should use directory name as fallback description', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.includes('SKILL.md')) {
          return false;
        }
        return true;
      });
      mockReaddir.mockResolvedValue([
        { name: 'database-query-skill', isDirectory: () => true } as any,
      ]);

      const result = await service.listSkills();

      expect(result.skills[0]).toEqual({
        name: 'database-query-skill',
        description: 'database query skill',
      });
    });

    it('should only process directories and skip files', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue([
        { name: 'skill-1', isDirectory: () => true } as any,
        { name: 'readme.md', isDirectory: () => false } as any,
        { name: 'skill-2', isDirectory: () => true } as any,
        { name: 'config.json', isDirectory: () => false } as any,
      ]);

      const result = await service.listSkills();

      expect(result.skills).toHaveLength(2);
      expect(result.skills.map((s) => s.name)).toEqual(['skill-1', 'skill-2']);
    });
  });

  describe('executeWithStreaming', () => {
    it('should spawn claude CLI with correct args', async () => {
      const mockChild = createMockChild([
        JSON.stringify({
          type: 'system',
          subtype: 'init',
          session_id: 'session-123',
        }),
      ]);
      mockSpawn.mockReturnValue(mockChild as any);
      mockExistsSync.mockReturnValue(false);

      await service.executeWithStreaming(
        'Test prompt',
        mockResponse as Response,
      );

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.stringContaining('claude'),
        expect.arrayContaining([
          '-p',
          '--output-format',
          'stream-json',
          '--verbose',
          '--append-system-prompt',
          expect.any(String),
        ]),
        expect.objectContaining({
          cwd: expect.any(String),
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      );
    });

    it('should strip ANTHROPIC_API_KEY from CLI environment', async () => {
      // Temporarily set the key in process.env
      const originalKey = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';

      const mockChild = createMockChild([
        JSON.stringify({
          type: 'system',
          subtype: 'init',
          session_id: 'session-env',
        }),
      ]);
      mockSpawn.mockReturnValue(mockChild as any);
      mockExistsSync.mockReturnValue(false);

      await service.executeWithStreaming(
        'Test prompt',
        mockResponse as Response,
      );

      const spawnEnv = mockSpawn.mock.calls[0]![2]?.env as
        | Record<string, string>
        | undefined;
      expect(spawnEnv).toBeDefined();
      expect(spawnEnv!.ANTHROPIC_API_KEY).toBeUndefined();

      // Restore
      if (originalKey !== undefined) {
        process.env.ANTHROPIC_API_KEY = originalKey;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
    });

    it('should write prompt to stdin', async () => {
      const mockChild = createMockChild([
        JSON.stringify({
          type: 'system',
          subtype: 'init',
          session_id: 'session-123',
        }),
      ]);
      mockSpawn.mockReturnValue(mockChild as any);
      mockExistsSync.mockReturnValue(false);

      await service.executeWithStreaming(
        'Test prompt',
        mockResponse as Response,
      );

      expect(mockChild.stdin.write).toHaveBeenCalledWith('Test prompt');
      expect(mockChild.stdin.end).toHaveBeenCalled();
    });

    it('should capture session ID from init message', async () => {
      const mockChild = createMockChild([
        JSON.stringify({
          type: 'system',
          subtype: 'init',
          session_id: 'session-abc',
        }),
      ]);
      mockSpawn.mockReturnValue(mockChild as any);
      mockExistsSync.mockReturnValue(false);

      const result = await service.executeWithStreaming(
        'Test',
        mockResponse as Response,
      );

      expect(result.sessionId).toBe('session-abc');

      const allEvents = writtenEvents.join('');
      expect(allEvents).toContain('event: session');
      expect(allEvents).toContain('session-abc');
    });

    it('should forward assistant messages as SSE events', async () => {
      const mockChild = createMockChild([
        JSON.stringify({
          type: 'system',
          subtype: 'init',
          session_id: 'session-123',
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: 'Hello!' },
        }),
      ]);
      mockSpawn.mockReturnValue(mockChild as any);
      mockExistsSync.mockReturnValue(false);

      await service.executeWithStreaming('Test', mockResponse as Response);

      const allEvents = writtenEvents.join('');
      expect(allEvents).toContain('event: assistant');
      expect(allEvents).toContain('Hello!');
    });

    it('should send done event after process closes', async () => {
      const mockChild = createMockChild([
        JSON.stringify({
          type: 'system',
          subtype: 'init',
          session_id: 'session-done',
        }),
      ]);
      mockSpawn.mockReturnValue(mockChild as any);
      mockExistsSync.mockReturnValue(false);

      await service.executeWithStreaming('Test', mockResponse as Response);

      const allEvents = writtenEvents.join('');
      expect(allEvents).toContain('event: done');
      expect(allEvents).toContain('session-done');
      expect(mockResponse.end).toHaveBeenCalled();
    });

    it('should include --resume when sessionId is provided', async () => {
      const mockChild = createMockChild([
        JSON.stringify({
          type: 'system',
          subtype: 'init',
          session_id: 'session-456',
        }),
      ]);
      mockSpawn.mockReturnValue(mockChild as any);
      mockExistsSync.mockReturnValue(false);

      await service.executeWithStreaming(
        'Continue',
        mockResponse as Response,
        'session-456',
      );

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.stringContaining('claude'),
        expect.arrayContaining(['--resume', 'session-456']),
        expect.any(Object),
      );
    });

    it('should not include --resume when no sessionId', async () => {
      const mockChild = createMockChild([
        JSON.stringify({
          type: 'system',
          subtype: 'init',
          session_id: 'session-new',
        }),
      ]);
      mockSpawn.mockReturnValue(mockChild as any);
      mockExistsSync.mockReturnValue(false);

      await service.executeWithStreaming('Test', mockResponse as Response);

      const args = mockSpawn.mock.calls[0]![1] as string[];
      expect(args).not.toContain('--resume');
    });

    it('should include source context in system prompt', async () => {
      const mockChild = createMockChild([
        JSON.stringify({
          type: 'system',
          subtype: 'init',
          session_id: 'session-ctx',
        }),
      ]);
      mockSpawn.mockReturnValue(mockChild as any);
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue('# Web App Context\nVue 3 instructions');

      await service.executeWithStreaming(
        'Test',
        mockResponse as Response,
        undefined,
        'web-app',
      );

      const args = mockSpawn.mock.calls[0]![1] as string[];
      const systemPromptIdx = args.indexOf('--append-system-prompt');
      const systemPrompt = args[systemPromptIdx + 1];
      expect(systemPrompt).toContain('Vue 3 instructions');
    });

    it('should include application context in system prompt', async () => {
      const mockChild = createMockChild([
        JSON.stringify({
          type: 'system',
          subtype: 'init',
          session_id: 'session-app',
        }),
      ]);
      mockSpawn.mockReturnValue(mockChild as any);
      mockExistsSync.mockReturnValue(false);

      await service.executeWithStreaming(
        'Test',
        mockResponse as Response,
        undefined,
        undefined,
        'Currently on PredictionDashboard page',
      );

      const args = mockSpawn.mock.calls[0]![1] as string[];
      const systemPromptIdx = args.indexOf('--append-system-prompt');
      const systemPrompt = args[systemPromptIdx + 1];
      expect(systemPrompt).toContain('Currently on PredictionDashboard page');
      expect(systemPrompt).toContain('Current Application Context');
    });

    it('should send error event on non-zero exit code', async () => {
      const mockChild = createMockChild([], 1);
      mockSpawn.mockReturnValue(mockChild as any);
      mockExistsSync.mockReturnValue(false);

      await service.executeWithStreaming('Test', mockResponse as Response);

      const allEvents = writtenEvents.join('');
      expect(allEvents).toContain('event: error');
      expect(allEvents).toContain('exited with code 1');
    });

    it('should send error event on spawn error', async () => {
      const stdout = new EventEmitter();
      const stderr = new EventEmitter();
      const stdin = { write: jest.fn(), end: jest.fn() };
      const proc = new EventEmitter() as any;
      Object.assign(proc, {
        stdout,
        stderr,
        stdin,
        killed: false,
        kill: jest.fn(),
        pid: 12345,
      });

      mockSpawn.mockReturnValue(proc);
      mockExistsSync.mockReturnValue(false);

      const resultPromise = service.executeWithStreaming(
        'Test',
        mockResponse as Response,
      );

      // Emit spawn error
      setImmediate(() => {
        proc.emit('error', new Error('spawn ENOENT'));
      });

      await resultPromise;

      const allEvents = writtenEvents.join('');
      expect(allEvents).toContain('event: error');
      expect(allEvents).toContain('spawn ENOENT');
      expect(mockResponse.end).toHaveBeenCalled();
    });

    it('should register close handler to kill process on disconnect', async () => {
      const mockChild = createMockChild([
        JSON.stringify({
          type: 'system',
          subtype: 'init',
          session_id: 'session-dc',
        }),
      ]);
      mockSpawn.mockReturnValue(mockChild as any);
      mockExistsSync.mockReturnValue(false);

      await service.executeWithStreaming('Test', mockResponse as Response);

      expect(mockResponse.on).toHaveBeenCalledWith(
        'close',
        expect.any(Function),
      );
    });

    it('should forward stream_event messages', async () => {
      const streamEvent = {
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: 'toolu_1', name: 'Read' },
        },
      };
      const mockChild = createMockChild([
        JSON.stringify({
          type: 'system',
          subtype: 'init',
          session_id: 'session-stream',
        }),
        JSON.stringify(streamEvent),
      ]);
      mockSpawn.mockReturnValue(mockChild as any);
      mockExistsSync.mockReturnValue(false);

      await service.executeWithStreaming('Test', mockResponse as Response);

      const allEvents = writtenEvents.join('');
      expect(allEvents).toContain('event: stream_event');
      expect(allEvents).toContain('content_block_start');
    });

    it('should handle non-JSON stdout lines gracefully', async () => {
      const stdout = new EventEmitter();
      const stderr = new EventEmitter();
      const stdin = { write: jest.fn(), end: jest.fn() };
      const proc = new EventEmitter() as any;
      Object.assign(proc, {
        stdout,
        stderr,
        stdin,
        killed: false,
        kill: jest.fn(),
        pid: 12345,
      });

      mockSpawn.mockReturnValue(proc);
      mockExistsSync.mockReturnValue(false);

      const resultPromise = service.executeWithStreaming(
        'Test',
        mockResponse as Response,
      );

      setImmediate(() => {
        stdout.emit(
          'data',
          Buffer.from(
            'not valid json\n' +
              JSON.stringify({
                type: 'system',
                subtype: 'init',
                session_id: 's1',
              }) +
              '\n',
          ),
        );
        proc.emit('close', 0);
      });

      await resultPromise;

      // Should not crash and should still process valid JSON
      const allEvents = writtenEvents.join('');
      expect(allEvents).toContain('event: session');
      expect(allEvents).toContain('event: done');
    });
  });
});
