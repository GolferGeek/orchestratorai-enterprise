/**
 * React Hook for Claude Code Panel state management
 *
 * Manages the state and logic for the Claude Code panel,
 * including SSE streaming, command execution, and output handling.
 * Persists conversation history and session ID to localStorage for
 * continuity across page refreshes.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { claudeCodeService } from '@/services/claudeCodeService';
import type {
  OutputEntry,
  ClaudeCommand,
  ClaudeSkill,
  ClaudeMessage,
  StoredStats,
  ActiveTool,
} from '@/types/claudeCode';
import { getToolVerb } from '@/types/claudeCode';

// LocalStorage keys
const STORAGE_KEYS = {
  SESSION_ID: 'claude-code-session-id',
  OUTPUT: 'claude-code-output',
  STATS: 'claude-code-stats',
  HISTORY: 'claude-code-history',
  PINNED: 'claude-code-pinned',
} as const;

// Default pinned commands
const DEFAULT_PINNED = ['/test', '/commit', '/create-pr', '/monitor'];

/**
 * Load session ID from localStorage
 */
function loadSessionId(): string | undefined {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.SESSION_ID);
    return stored || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Save session ID to localStorage
 */
function saveSessionId(sessionId: string | undefined): void {
  try {
    if (sessionId) {
      localStorage.setItem(STORAGE_KEYS.SESSION_ID, sessionId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.SESSION_ID);
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Load output history from localStorage
 */
function loadOutput(): OutputEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.OUTPUT);
    if (!stored) return [];

    const parsed = JSON.parse(stored) as Array<{
      type: OutputEntry['type'];
      content: string;
      timestamp: string;
    }>;

    // Convert timestamp strings back to Date objects
    return parsed.map((entry) => ({
      ...entry,
      timestamp: new Date(entry.timestamp),
    }));
  } catch {
    return [];
  }
}

/**
 * Save output history to localStorage
 */
function saveOutput(entries: OutputEntry[]): void {
  try {
    // Keep only the last 100 entries to prevent localStorage bloat
    const toSave = entries.slice(-100);
    localStorage.setItem(STORAGE_KEYS.OUTPUT, JSON.stringify(toSave));
  } catch {
    // Ignore storage errors (e.g., quota exceeded)
  }
}

/**
 * Load stats from localStorage
 */
function loadStats(): StoredStats {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.STATS);
    if (!stored) return { totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0 };
    return JSON.parse(stored) as StoredStats;
  } catch {
    return { totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0 };
  }
}

/**
 * Save stats to localStorage
 */
function saveStats(stats: StoredStats): void {
  try {
    localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(stats));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Load command history from localStorage
 */
function loadHistory(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.HISTORY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Save command history to localStorage
 */
function saveHistory(history: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Load pinned commands from localStorage
 */
function loadPinnedCommands(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.PINNED);
    return stored ? JSON.parse(stored) : DEFAULT_PINNED;
  } catch {
    return DEFAULT_PINNED;
  }
}

/**
 * Save pinned commands to localStorage
 */
function savePinnedCommands(pinned: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PINNED, JSON.stringify(pinned));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Clear all persisted state
 */
function clearPersistedState(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.SESSION_ID);
    localStorage.removeItem(STORAGE_KEYS.OUTPUT);
    localStorage.removeItem(STORAGE_KEYS.STATS);
    // Don't clear history and pinned commands on clear - they persist across sessions
  } catch {
    // Ignore storage errors
  }
}

export function useClaudeCodePanel() {
  // Server state
  const [isServerAvailable, setIsServerAvailable] = useState(false);
  const [isCheckingServer, setIsCheckingServer] = useState(false);

  // Execution state
  const [isExecuting, setIsExecuting] = useState(false);
  const [prompt, setPrompt] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  // Session state for multi-turn conversations - load from localStorage
  const [sessionId, setSessionId] = useState<string | undefined>(() => loadSessionId());

  // Output state - load from localStorage
  const [output, setOutput] = useState<OutputEntry[]>(() => loadOutput());
  const [currentAssistantMessage, setCurrentAssistantMessage] = useState('');

  // Tool progress state
  const [activeTools, setActiveTools] = useState<Map<string, ActiveTool>>(new Map());
  const [currentToolVerb, setCurrentToolVerb] = useState<string>('');
  const toolVerbsRef = useRef<Map<string, string>>(new Map()); // Cache verbs per tool ID

  // Available commands and skills
  const [commands, setCommands] = useState<ClaudeCommand[]>([]);
  const [skills, setSkills] = useState<ClaudeSkill[]>([]);

  // Stats - load from localStorage
  const [stats, setStats] = useState<StoredStats>(() => loadStats());

  // Command history - load from localStorage
  const [commandHistory, setCommandHistory] = useState<string[]>(() => loadHistory());
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isNavigatingHistoryRef = useRef(false);

  // Pinned commands - load from localStorage
  const [pinnedCommands, setPinnedCommands] = useState<string[]>(() => loadPinnedCommands());

  // Computed values
  const canExecute = useMemo(
    () => isServerAvailable && !isExecuting && prompt.trim() !== '',
    [isServerAvailable, isExecuting, prompt]
  );

  const hasOutput = useMemo(() => output.length > 0, [output]);

  /**
   * Check if the server is available
   */
  const checkServer = useCallback(async () => {
    setIsCheckingServer(true);
    try {
      const available = await claudeCodeService.isAvailable();
      setIsServerAvailable(available);
    } catch {
      setIsServerAvailable(false);
    } finally {
      setIsCheckingServer(false);
    }
  }, []);

  /**
   * Load available commands
   */
  const loadCommands = useCallback(async () => {
    try {
      const cmds = await claudeCodeService.getCommands();
      setCommands(cmds);
    } catch (error) {
      console.error('Failed to load commands:', error);
    }
  }, []);

  /**
   * Load available skills
   */
  const loadSkills = useCallback(async () => {
    try {
      const sk = await claudeCodeService.getSkills();
      setSkills(sk);
    } catch (error) {
      console.error('Failed to load skills:', error);
    }
  }, []);

  /**
   * Add entry to output
   */
  const addOutput = useCallback((
    type: OutputEntry['type'],
    content: string,
    metadata?: OutputEntry['metadata']
  ) => {
    setOutput((prev) => [
      ...prev,
      {
        type,
        content,
        timestamp: new Date(),
        ...(metadata && { metadata }),
      },
    ]);
  }, []);

  /**
   * Save command to history
   */
  const saveToHistory = useCallback((command: string) => {
    const trimmed = command.trim();
    if (!trimmed) return;

    setCommandHistory((prev) => {
      // Dedupe - don't add if it's the same as the last entry
      if (prev[0] === trimmed) return prev;

      const newHistory = [trimmed, ...prev].slice(0, 50);
      saveHistory(newHistory);
      return newHistory;
    });
  }, []);

  /**
   * Navigate command history (up/down arrows)
   */
  const navigateHistory = useCallback(
    (direction: 'up' | 'down') => {
      isNavigatingHistoryRef.current = true;

      if (direction === 'up' && historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setPrompt(commandHistory[newIndex]);
      } else if (direction === 'down' && historyIndex > -1) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setPrompt(newIndex === -1 ? '' : commandHistory[newIndex]);
      }

      // Reset flag after a short delay
      setTimeout(() => {
        isNavigatingHistoryRef.current = false;
      }, 10);
    },
    [historyIndex, commandHistory]
  );

  /**
   * Pin a command
   */
  const pinCommand = useCallback((command: string) => {
    setPinnedCommands((prev) => {
      if (prev.includes(command)) return prev;
      const newPinned = [...prev, command];
      savePinnedCommands(newPinned);
      return newPinned;
    });
  }, []);

  /**
   * Unpin a command
   */
  const unpinCommand = useCallback((command: string) => {
    setPinnedCommands((prev) => {
      const newPinned = prev.filter((c) => c !== command);
      savePinnedCommands(newPinned);
      return newPinned;
    });
  }, []);

  /**
   * Reorder pinned commands
   */
  const reorderPinnedCommands = useCallback((newOrder: string[]) => {
    setPinnedCommands(newOrder);
    savePinnedCommands(newOrder);
  }, []);

  /**
   * Handle tool progress - update active tools and verb
   */
  const handleToolProgress = useCallback((message: ClaudeMessage) => {
    const toolId = message.tool_use_id;
    const toolName = message.tool_name;
    const elapsed = message.elapsed_time_seconds || 0;

    if (!toolId || !toolName) return;

    // Get or create a verb for this tool
    if (!toolVerbsRef.current.has(toolId)) {
      toolVerbsRef.current.set(toolId, getToolVerb(toolName));
    }
    const verb = toolVerbsRef.current.get(toolId) || 'Processing';
    setCurrentToolVerb(`${verb}...`);

    // Update active tools
    setActiveTools((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(toolId);

      if (existing) {
        newMap.set(toolId, { ...existing, elapsedSeconds: elapsed });
      } else {
        newMap.set(toolId, {
          id: toolId,
          name: toolName,
          startTime: Date.now(),
          elapsedSeconds: elapsed,
          status: 'running',
        });

        // Add output entry for new tool execution
        addOutput('tool', `${toolName} (${verb})`, {
          eventType: 'tool_progress',
          toolName,
          toolId,
          verb,
        });
      }
      return newMap;
    });
  }, [addOutput]);

  /**
   * Handle stream event - detect tool_use blocks starting/completing
   */
  const handleStreamEvent = useCallback((message: ClaudeMessage) => {
    const event = message.event;
    if (!event) return;

    // Handle content_block_start for tool_use
    if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
      const toolId = event.content_block.id;
      const toolName = event.content_block.name;

      if (toolId && toolName) {
        // Generate and cache a verb for this tool
        const verb = getToolVerb(toolName);
        toolVerbsRef.current.set(toolId, verb);
        setCurrentToolVerb(`${verb}...`);

        // Add output entry for tool start event
        addOutput('event', `Tool started: ${toolName}`, {
          eventType: 'content_block_start',
          toolName,
          toolId,
          verb,
        });

        setActiveTools((prev) => {
          const newMap = new Map(prev);
          newMap.set(toolId, {
            id: toolId,
            name: toolName,
            startTime: Date.now(),
            elapsedSeconds: 0,
            status: 'running',
          });
          return newMap;
        });
      }
    }

    // Handle content_block_stop - tool finished
    if (event.type === 'content_block_stop' && event.index !== undefined) {
      // Mark tools as completed (we track by index correlation)
      setActiveTools((prev) => {
        const newMap = new Map(prev);
        // Mark most recent running tool as completed
        for (const [id, tool] of newMap.entries()) {
          if (tool.status === 'running') {
            newMap.set(id, { ...tool, status: 'completed' });

            // Add output entry for tool completion
            const verb = toolVerbsRef.current.get(id);
            addOutput('event', `Tool completed: ${tool.name}`, {
              eventType: 'content_block_stop',
              toolName: tool.name,
              toolId: id,
              verb,
            });

            // Clear verb after tool completes
            setTimeout(() => {
              setCurrentToolVerb('');
              toolVerbsRef.current.delete(id);
            }, 500);
            break;
          }
        }
        return newMap;
      });
    }
  }, [addOutput]);

  /**
   * Clear tool progress state
   */
  const clearToolProgress = useCallback(() => {
    setActiveTools(new Map());
    setCurrentToolVerb('');
    toolVerbsRef.current.clear();
  }, []);

  /**
   * Handle incoming message from stream
   */
  const handleMessage = useCallback((message: ClaudeMessage) => {
    // Debug logging to see what events we're receiving
    console.debug('[Claude SSE]', message.type, message);

    if (message.type === 'assistant') {
      const content = claudeCodeService.extractContent(message);
      if (content) {
        // Flush any existing message as a separate bubble before adding new content
        setCurrentAssistantMessage((prev) => {
          if (prev) {
            addOutput('assistant', prev);
          }
          return '';
        });
        // Add this message as a new bubble
        addOutput('assistant', content);
      }
    } else if (message.type === 'tool_progress') {
      // Handle tool progress events
      handleToolProgress(message);
    } else if (message.type === 'stream_event') {
      // Handle stream events for tool_use detection
      handleStreamEvent(message);
    } else if (message.type === 'result') {
      // Capture cost and usage stats
      setStats((prev) => {
        const newStats = { ...prev };
        if (message.total_cost_usd) {
          newStats.totalCost += message.total_cost_usd;
        }
        if (message.usage) {
          newStats.totalInputTokens += message.usage.input_tokens || 0;
          newStats.totalOutputTokens += message.usage.output_tokens || 0;
        }
        return newStats;
      });
      // Clear tool state on result
      clearToolProgress();
    } else if (message.type === 'system') {
      // Don't log all system messages, just important ones
      // addOutput('system', JSON.stringify(message, null, 2));
    }
  }, [addOutput, handleToolProgress, handleStreamEvent, clearToolProgress]);

  /**
   * Handle stream error
   */
  const handleError = useCallback(
    (error: Error) => {
      setIsExecuting(false);

      // Flush any pending assistant message
      setCurrentAssistantMessage((prev) => {
        if (prev) {
          addOutput('assistant', prev);
        }
        return '';
      });

      addOutput('error', `Error: ${error.message}`);
    },
    [addOutput]
  );

  /**
   * Handle stream completion
   */
  const handleComplete = useCallback(
    (newSessionId?: string) => {
      setIsExecuting(false);

      // Store session ID for next execution
      if (newSessionId) {
        setSessionId(newSessionId);
        saveSessionId(newSessionId);
      }

      // Clear any leftover streaming state (shouldn't be any now since we create bubbles immediately)
      setCurrentAssistantMessage('');
      clearToolProgress();

      addOutput('info', '✓ Execution completed');

      // Persist output and stats to localStorage
      setOutput((currentOutput) => {
        saveOutput(currentOutput);
        return currentOutput;
      });
      setStats((currentStats) => {
        saveStats(currentStats);
        return currentStats;
      });
    },
    [addOutput, clearToolProgress]
  );

  /**
   * Execute the current prompt
   */
  const execute = useCallback(async () => {
    if (!canExecute) return;

    const currentPrompt = prompt.trim();

    // Save to history before clearing
    saveToHistory(currentPrompt);

    setIsExecuting(true);
    setCurrentAssistantMessage('');

    // Add user input to output
    addOutput('user', currentPrompt);

    // Clear prompt after sending
    setPrompt('');

    // Reset history index
    setHistoryIndex(-1);

    try {
      abortControllerRef.current = await claudeCodeService.execute(
        currentPrompt,
        handleMessage,
        handleError,
        handleComplete,
        sessionId,
        'orch-flow' // Pass source context for app-specific guidance
      );
    } catch (error) {
      handleError(error as Error);
    }
  }, [canExecute, prompt, saveToHistory, addOutput, handleMessage, handleError, handleComplete, sessionId]);

  /**
   * Cancel current execution
   */
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsExecuting(false);
    clearToolProgress();
    addOutput('info', '⚠ Execution cancelled');
  }, [addOutput, clearToolProgress]);

  /**
   * Clear output history and start a new session
   */
  const clearOutput = useCallback(() => {
    setOutput([]);
    setCurrentAssistantMessage('');
    setSessionId(undefined);
    setStats({ totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0 });
    clearToolProgress();

    // Clear persisted state
    clearPersistedState();
  }, [clearToolProgress]);

  /**
   * Insert a command into the prompt
   */
  const insertCommand = useCallback((command: string) => {
    setPrompt(command);
  }, []);

  // Initialize on mount
  useEffect(() => {
    const init = async () => {
      await checkServer();
    };
    init();
  }, [checkServer]);

  // Load commands/skills when server becomes available
  useEffect(() => {
    if (isServerAvailable) {
      Promise.all([loadCommands(), loadSkills()]);
    }
  }, [isServerAvailable, loadCommands, loadSkills]);

  // Reset history index when prompt changes manually (not during navigation)
  useEffect(() => {
    if (!isNavigatingHistoryRef.current) {
      setHistoryIndex(-1);
    }
  }, [prompt]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    // State
    isServerAvailable,
    isCheckingServer,
    isExecuting,
    prompt,
    setPrompt,
    output,
    currentAssistantMessage,
    commands,
    skills,
    totalCost: stats.totalCost,
    totalInputTokens: stats.totalInputTokens,
    totalOutputTokens: stats.totalOutputTokens,
    sessionId,
    commandHistory,
    historyIndex,
    pinnedCommands,

    // Tool progress state
    activeTools,
    currentToolVerb,

    // Computed
    canExecute,
    hasOutput,

    // Actions
    checkServer,
    loadCommands,
    loadSkills,
    execute,
    cancel,
    clearOutput,
    insertCommand,
    navigateHistory,
    pinCommand,
    unpinCommand,
    reorderPinnedCommands,
  };
}
