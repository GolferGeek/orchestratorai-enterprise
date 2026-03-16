/**
 * Claude Code Service
 *
 * API client for the Claude Code panel.
 * Connects to /super-admin endpoints for executing Claude Code commands.
 * Uses API authentication (token from localStorage) instead of direct Supabase calls.
 */
import type {
  ClaudeCommand,
  ClaudeSkill,
  ClaudeHealthResponse,
  ClaudeMessage,
} from '@/types/claudeCode';

class ClaudeCodeService {
  private readonly baseUrl: string;

  constructor() {
    // Use the API URL from environment - must be configured
    const apiUrl = import.meta.env.VITE_API_URL;
    if (!apiUrl) {
      throw new Error('VITE_API_URL environment variable is required');
    }
    this.baseUrl = apiUrl;
  }

  /**
   * Get the current auth token from localStorage (auth store)
   */
  private getAuthToken(): string | null {
    try {
      const authStorage = localStorage.getItem('auth-storage');
      if (!authStorage) {
        return null;
      }
      const { state } = JSON.parse(authStorage);
      return state?.token || null;
    } catch (error) {
      console.error('Error reading auth token from storage:', error);
      return null;
    }
  }

  /**
   * Check if the Claude Code server is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const token = this.getAuthToken();
      if (!token) return false;

      // Use the main API URL instead of localhost
      const apiUrl = import.meta.env.VITE_MAIN_API_URL || import.meta.env.VITE_API_URL || this.baseUrl;
      const healthUrl = apiUrl.replace(/\/$/, '') + '/super-admin/health';

      const response = await fetch(healthUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // 403 means endpoint exists but requires different permissions - treat as available
      // 404 means endpoint doesn't exist - treat as unavailable
      if (response.status === 404) return false;
      if (response.status === 403) {
        // Endpoint exists but user doesn't have permission - still consider it available
        // (the endpoint exists, just needs proper permissions)
        return true;
      }

      if (!response.ok) return false;

      const data = await response.json();
      return data.status === 'ok' && (data.cliAvailable === true || data.sdkAvailable === true);
    } catch {
      // Silently fail - network errors shouldn't prevent the app from working
      return false;
    }
  }

  /**
   * Get list of available commands
   */
  async getCommands(): Promise<ClaudeCommand[]> {
    try {
      const token = this.getAuthToken();
      if (!token) {
        // Silently return empty array if not authenticated
        return [];
      }

      // Use the main API URL instead of localhost
      const apiUrl = import.meta.env.VITE_MAIN_API_URL || import.meta.env.VITE_API_URL || this.baseUrl;
      const commandsUrl = apiUrl.replace(/\/$/, '') + '/super-admin/commands';

      const response = await fetch(commandsUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // 403 means endpoint exists but user doesn't have permission - treat as empty
      // 404 means endpoint doesn't exist - treat as empty
      if (response.status === 403 || response.status === 404) {
        return [];
      }

      if (!response.ok) {
        // Only log non-403/404 errors
        console.debug('Failed to fetch commands:', response.status, response.statusText);
        return [];
      }

      const data = await response.json();
      return data.commands || [];
    } catch (error) {
      // Only log unexpected errors (network issues, etc.)
      if (error instanceof TypeError && error.message.includes('fetch')) {
        // Network error - silently fail
        return [];
      }
      console.debug('Failed to fetch commands:', error);
      return [];
    }
  }

  /**
   * Get list of available skills
   */
  async getSkills(): Promise<ClaudeSkill[]> {
    try {
      const token = this.getAuthToken();
      if (!token) {
        // Silently return empty array if not authenticated
        return [];
      }

      // Use the main API URL instead of localhost
      const apiUrl = import.meta.env.VITE_MAIN_API_URL || import.meta.env.VITE_API_URL || this.baseUrl;
      const skillsUrl = apiUrl.replace(/\/$/, '') + '/super-admin/skills';

      const response = await fetch(skillsUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // 403 means endpoint exists but user doesn't have permission - treat as empty
      // 404 means endpoint doesn't exist - treat as empty
      if (response.status === 403 || response.status === 404) {
        return [];
      }

      if (!response.ok) {
        // Only log non-403/404 errors
        console.debug('Failed to fetch skills:', response.status, response.statusText);
        return [];
      }

      const data = await response.json();
      return data.skills || [];
    } catch (error) {
      // Only log unexpected errors (network issues, etc.)
      if (error instanceof TypeError && error.message.includes('fetch')) {
        // Network error - silently fail
        return [];
      }
      console.debug('Failed to fetch skills:', error);
      return [];
    }
  }

  /**
   * Execute a prompt/command and stream results
   * Returns an AbortController for cancellation
   * Supports session resumption for multi-turn conversations
   * Supports source context to provide app-specific guidance
   */
  async execute(
    prompt: string,
    onMessage: (message: ClaudeMessage) => void,
    onError: (error: Error) => void,
    onComplete: (sessionId?: string) => void,
    sessionId?: string,
    sourceContext?: 'web-app' | 'orch-flow' | 'default',
  ): Promise<AbortController> {
    const abortController = new AbortController();
    const token = this.getAuthToken();

    if (!token) {
      onError(new Error('Not authenticated'));
      return abortController;
    }

    // Track session ID from the response
    let currentSessionId: string | undefined = sessionId;

    try {
      // Use the main API URL instead of localhost
      const apiUrl = import.meta.env.VITE_MAIN_API_URL || import.meta.env.VITE_API_URL || this.baseUrl;
      const executeUrl = apiUrl.replace(/\/$/, '') + '/super-admin/execute';

      const response = await fetch(executeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt, sessionId, sourceContext }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      // Process the SSE stream
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

            // Process complete SSE events
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            let currentEvent = '';

            for (const line of lines) {
              if (line.startsWith('event:')) {
                currentEvent = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                const data = line.slice(5).trim();
                if (data) {
                  try {
                    const parsed = JSON.parse(data);

                    // Capture session ID from session or done events
                    if (currentEvent === 'session' && parsed.sessionId) {
                      currentSessionId = parsed.sessionId;
                      // Don't call onMessage for session events - just capture the ID
                      continue;
                    }

                    if (currentEvent === 'done') {
                      // Done event may include sessionId
                      if (parsed.sessionId) {
                        currentSessionId = parsed.sessionId;
                      }
                      onComplete(currentSessionId);
                      return;
                    }

                    if (currentEvent === 'error') {
                      onError(new Error(parsed.error || 'Unknown error'));
                      return;
                    }

                    onMessage({
                      type: (currentEvent as ClaudeMessage['type']) || 'assistant',
                      ...parsed,
                    });
                  } catch {
                    // Skip invalid JSON lines
                    console.debug('Skipping invalid JSON:', data);
                  }
                }
              }
            }
          }
        } catch (error) {
          if ((error as Error).name === 'AbortError') {
            console.log('Stream aborted by user');
          } else {
            onError(error as Error);
          }
        }
      };

      processStream();
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.log('Request aborted by user');
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
    if (!message.message?.content) {
      return '';
    }

    const content = message.message.content;

    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .filter((block) => block.type === 'text' && block.text)
        .map((block) => block.text)
        .join('\n');
    }

    return '';
  }
}

export const claudeCodeService = new ClaudeCodeService();
