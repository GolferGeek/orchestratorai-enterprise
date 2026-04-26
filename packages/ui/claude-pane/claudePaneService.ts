/**
 * Claude Pane Service
 *
 * API client for the shared ClaudeCodePane component.
 * Connects to Admin API at /admin/claude-pane endpoints.
 * Handles SSE streaming, commands, skills, and git revert.
 */

export interface ClaudeCommand {
  name: string;
  description: string;
}

export interface ClaudeSkill {
  name: string;
  description: string;
}

export interface ClaudeHealthResponse {
  status: string;
  cliAvailable: boolean;
  cliVersion: string;
  nodeEnv: string;
}

export interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

export interface RawMessageStreamEvent {
  type: string;
  index?: number;
  content_block?: ContentBlock;
  delta?: {
    type: string;
    text?: string;
    partial_json?: string;
  };
  message?: {
    id?: string;
    type?: string;
    role?: string;
    content?: ContentBlock[];
    model?: string;
    stop_reason?: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
}

export interface ClaudeMessage {
  type:
    | 'system'
    | 'assistant'
    | 'user'
    | 'result'
    | 'stream_event'
    | 'error'
    | 'session'
    | 'tool_progress';
  message?: {
    content: string | ContentBlock[];
  };
  result?: unknown;
  total_cost_usd?: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  error?: string;
  sessionId?: string;
  tool_use_id?: string;
  tool_name?: string;
  elapsed_time_seconds?: number;
  parent_tool_use_id?: string | null;
  event?: RawMessageStreamEvent;
}

export interface ActiveTool {
  id: string;
  name: string;
  startTime: number;
  elapsedSeconds: number;
  status: 'running' | 'completed' | 'error';
}

export const TOOL_VERBS: Record<string, string[]> = {
  Read: ['Reading', 'Scanning', 'Examining', 'Perusing', 'Inspecting'],
  Write: ['Writing', 'Crafting', 'Composing', 'Creating', 'Generating'],
  Edit: ['Editing', 'Modifying', 'Tweaking', 'Refining', 'Adjusting'],
  Bash: ['Executing', 'Running', 'Processing', 'Computing', 'Operating'],
  Glob: ['Searching', 'Finding', 'Locating', 'Discovering', 'Scanning'],
  Grep: ['Searching', 'Hunting', 'Scanning', 'Probing', 'Investigating'],
  Task: ['Delegating', 'Spawning', 'Launching', 'Dispatching', 'Orchestrating'],
  WebFetch: ['Fetching', 'Retrieving', 'Downloading', 'Pulling', 'Grabbing'],
  WebSearch: ['Searching', 'Querying', 'Exploring', 'Investigating', 'Researching'],
  TodoWrite: ['Planning', 'Organizing', 'Tracking', 'Managing', 'Scheduling'],
  default: ['Processing', 'Working', 'Thinking', 'Computing', 'Analyzing'],
};

export function getToolVerb(toolName: string): string {
  const verbs = TOOL_VERBS[toolName] || TOOL_VERBS['default'];
  return verbs[Math.floor(Math.random() * verbs.length)];
}

export function normalizeAdminApiBaseUrl(adminApiUrl: string): string {
  return adminApiUrl.replace(/\/$/, '').replace(/\/admin$/, '');
}

const SHARED_AUTH_COOKIE_NAME = 'orch_auth_token';

function getSharedAuthCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${SHARED_AUTH_COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Get the auth token from the established browser auth stores.
 */
function getAuthToken(): string | null {
  return sessionStorage.getItem('authToken') || localStorage.getItem('authToken') || getSharedAuthCookie();
}

export class ClaudePaneApiService {
  private readonly baseUrl: string;

  constructor(adminApiUrl: string) {
    this.baseUrl = normalizeAdminApiBaseUrl(adminApiUrl);
  }

  /**
   * Check if the Claude Code CLI is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const token = getAuthToken();
      const response = await fetch(`${this.baseUrl}/admin/claude-pane/health`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) return false;
      const data = (await response.json()) as ClaudeHealthResponse;
      return data.status === 'ok' && data.cliAvailable === true;
    } catch {
      return false;
    }
  }

  /**
   * Get available commands
   */
  async getCommands(): Promise<ClaudeCommand[]> {
    try {
      const token = getAuthToken();
      const response = await fetch(`${this.baseUrl}/admin/claude-pane/commands`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) return [];
      const data = (await response.json()) as { commands: ClaudeCommand[] };
      return data.commands || [];
    } catch {
      return [];
    }
  }

  /**
   * Get available skills
   */
  async getSkills(): Promise<ClaudeSkill[]> {
    try {
      const token = getAuthToken();
      const response = await fetch(`${this.baseUrl}/admin/claude-pane/skills`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) return [];
      const data = (await response.json()) as { skills: ClaudeSkill[] };
      return data.skills || [];
    } catch {
      return [];
    }
  }

  /**
   * Execute a prompt and stream results via SSE
   */
  async execute(
    prompt: string,
    onMessage: (message: ClaudeMessage) => void,
    onError: (error: Error) => void,
    onComplete: (sessionId?: string) => void,
    sessionId?: string,
    sourceContext?: string,
    applicationContext?: string,
    product?: string,
  ): Promise<AbortController> {
    const abortController = new AbortController();
    const token = getAuthToken();

    let currentSessionId: string | undefined = sessionId;

    try {
      const response = await fetch(`${this.baseUrl}/admin/claude-pane/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ prompt, sessionId, sourceContext, applicationContext, product }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              onComplete(currentSessionId);
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            let currentEvent = '';

            for (const line of lines) {
              if (line.startsWith('event:')) {
                currentEvent = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                const data = line.slice(5).trim();
                if (data) {
                  try {
                    const parsed = JSON.parse(data) as Record<string, unknown>;

                    if (currentEvent === 'session' && parsed['sessionId']) {
                      currentSessionId = parsed['sessionId'] as string;
                      continue;
                    }

                    if (currentEvent === 'done') {
                      if (parsed['sessionId']) {
                        currentSessionId = parsed['sessionId'] as string;
                      }
                      onComplete(currentSessionId);
                      return;
                    }

                    if (currentEvent === 'error') {
                      const errorMessage = (parsed['error'] as string | undefined) || 'Unknown error';
                      const stderrMessage = (parsed['stderr'] as string | undefined)?.trim();
                      onError(new Error(stderrMessage ? `${errorMessage}: ${stderrMessage}` : errorMessage));
                      return;
                    }

                    onMessage({
                      type: (currentEvent as ClaudeMessage['type']) || 'system',
                      ...parsed,
                    } as ClaudeMessage);
                  } catch {
                    // Skip invalid JSON
                  }
                }
              }
            }
          }
        } catch (error) {
          if ((error as Error).name === 'AbortError') {
            console.log('[ClaudePane] Stream aborted by user');
          } else {
            onError(error as Error);
          }
        }
      };

      processStream();
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.log('[ClaudePane] Request aborted by user');
      } else {
        onError(error as Error);
      }
    }

    return abortController;
  }

  /**
   * Extract text content from a Claude message
   */
  extractContent(message: ClaudeMessage): string {
    if (!message.message?.content) return '';
    const content = message.message.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .filter((block) => block.type === 'text' && block.text)
        .map((block) => block.text)
        .join('\n');
    }
    return '';
  }

  /**
   * Revert uncommitted git changes
   */
  async gitRevert(): Promise<{ success: boolean; message: string }> {
    const token = getAuthToken();
    const response = await fetch(`${this.baseUrl}/admin/claude-pane/git/revert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    return response.json() as Promise<{ success: boolean; message: string }>;
  }
}
