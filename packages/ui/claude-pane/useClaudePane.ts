/**
 * useClaudePane Composable
 *
 * Manages all state and logic for the ClaudeCodePane component.
 * Persists session, output, stats, command history, and pinned commands in localStorage.
 * Receives adminApiUrl and product as parameters (not from store, to stay self-contained).
 */

import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import {
  ClaudePaneApiService,
  getToolVerb,
  type ClaudeCommand,
  type ClaudeSkill,
  type ClaudeMessage,
  type ActiveTool,
} from './claudePaneService';

export interface OutputEntry {
  type: 'user' | 'assistant' | 'system' | 'error' | 'info' | 'tool_use' | 'tool_result';
  content: string;
  timestamp: Date;
  toolName?: string;
  toolInput?: unknown;
  isStreaming?: boolean;
}

export interface PanelState {
  isOpen: boolean;
  lastOpenedAt?: string;
  width?: number;
}

function makeStorageKeys(product: string) {
  const prefix = `claude-pane:${product}`;
  return {
    SESSION_ID: `${prefix}:session-id`,
    OUTPUT: `${prefix}:output`,
    STATS: `${prefix}:stats`,
    HISTORY: `${prefix}:history`,
    PINNED: `${prefix}:pinned`,
    PANEL_STATE: `${prefix}:panel-state`,
  };
}

interface StoredStats {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return defaultValue;
    return JSON.parse(stored) as T;
  } catch {
    return defaultValue;
  }
}

function saveToStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or unavailable — silently skip
  }
}

function removeFromStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore
  }
}

export function useClaudePane(adminApiUrl: string, product: string) {
  const keys = makeStorageKeys(product);
  const api = new ClaudePaneApiService(adminApiUrl);

  // Server / connection state
  const isServerAvailable = ref(false);
  const isCheckingServer = ref(false);

  // Execution state
  const isExecuting = ref(false);
  const prompt = ref('');
  const abortController = ref<AbortController | null>(null);

  // Session — persisted
  const sessionId = ref<string | undefined>(loadFromStorage<string | undefined>(keys.SESSION_ID, undefined));

  // Output — persisted (last 100 entries)
  const rawOutput = loadFromStorage<Array<{ type: OutputEntry['type']; content: string; timestamp: string; toolName?: string; toolInput?: unknown }>>(keys.OUTPUT, []);
  const output = ref<OutputEntry[]>(
    rawOutput.map((e) => ({ ...e, timestamp: new Date(e.timestamp) })),
  );
  const currentAssistantMessage = ref('');

  // Tool progress
  const activeTools = ref<Map<string, ActiveTool>>(new Map());
  const currentToolVerb = ref('');
  const toolVerbsCache = new Map<string, string>();

  // Available commands and skills
  const commands = ref<ClaudeCommand[]>([]);
  const skills = ref<ClaudeSkill[]>([]);

  // Stats — persisted
  const storedStats = loadFromStorage<StoredStats>(keys.STATS, {
    totalCost: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
  });
  const totalCost = ref(storedStats.totalCost);
  const totalInputTokens = ref(storedStats.totalInputTokens);
  const totalOutputTokens = ref(storedStats.totalOutputTokens);

  // Command history — persisted
  const commandHistory = ref<string[]>(loadFromStorage<string[]>(keys.HISTORY, []));
  const historyIndex = ref(-1);
  const isNavigatingHistory = ref(false);

  // Pinned commands — persisted with defaults
  const pinnedCommands = ref<string[]>(
    loadFromStorage<string[]>(keys.PINNED, ['/test', '/commit', '/create-pr', '/monitor']),
  );

  // Computed
  const canExecute = computed(
    () => isServerAvailable.value && !isExecuting.value && prompt.value.trim() !== '',
  );
  const hasOutput = computed(() => output.value.length > 0);

  async function checkServer(): Promise<void> {
    isCheckingServer.value = true;
    try {
      isServerAvailable.value = await api.isAvailable();
    } catch {
      isServerAvailable.value = false;
    } finally {
      isCheckingServer.value = false;
    }
  }

  async function loadCommands(): Promise<void> {
    try {
      commands.value = await api.getCommands();
    } catch (error) {
      console.error('[ClaudePane] Failed to load commands:', error);
    }
  }

  async function loadSkills(): Promise<void> {
    try {
      skills.value = await api.getSkills();
    } catch (error) {
      console.error('[ClaudePane] Failed to load skills:', error);
    }
  }

  function addOutput(type: OutputEntry['type'], content: string): void {
    output.value.push({ type, content, timestamp: new Date() });
  }

  function saveToHistory(command: string): void {
    const trimmed = command.trim();
    if (!trimmed) return;
    if (commandHistory.value[0] !== trimmed) {
      commandHistory.value.unshift(trimmed);
      commandHistory.value = commandHistory.value.slice(0, 50);
      saveToStorage(keys.HISTORY, commandHistory.value);
    }
  }

  function navigateHistory(direction: 'up' | 'down'): void {
    isNavigatingHistory.value = true;
    if (direction === 'up' && historyIndex.value < commandHistory.value.length - 1) {
      historyIndex.value++;
      prompt.value = commandHistory.value[historyIndex.value];
    } else if (direction === 'down' && historyIndex.value > -1) {
      historyIndex.value--;
      prompt.value = historyIndex.value === -1 ? '' : commandHistory.value[historyIndex.value];
    }
    setTimeout(() => {
      isNavigatingHistory.value = false;
    }, 10);
  }

  function pinCommand(command: string): void {
    if (!pinnedCommands.value.includes(command)) {
      pinnedCommands.value.push(command);
      saveToStorage(keys.PINNED, pinnedCommands.value);
    }
  }

  function unpinCommand(command: string): void {
    pinnedCommands.value = pinnedCommands.value.filter((c) => c !== command);
    saveToStorage(keys.PINNED, pinnedCommands.value);
  }

  // Tool progress state helpers
  const toolInputBuffers = new Map<string, string>();
  const displayedTools = new Set<string>();

  function handleToolProgress(message: ClaudeMessage): void {
    const toolId = message.tool_use_id;
    const toolName = message.tool_name;
    const elapsed = message.elapsed_time_seconds || 0;
    if (!toolId || !toolName) return;

    if (!toolVerbsCache.has(toolId)) {
      toolVerbsCache.set(toolId, getToolVerb(toolName));
    }
    const verb = toolVerbsCache.get(toolId) || 'Processing';
    currentToolVerb.value = `${verb}...`;

    const existing = activeTools.value.get(toolId);
    if (existing) {
      activeTools.value.set(toolId, { ...existing, elapsedSeconds: elapsed });
    } else {
      activeTools.value.set(toolId, {
        id: toolId,
        name: toolName,
        startTime: Date.now(),
        elapsedSeconds: elapsed,
        status: 'running',
      });
    }
    activeTools.value = new Map(activeTools.value);
  }

  function formatToolCall(toolName: string, input: unknown): string {
    if (!input) return '(no input)';
    if (toolName === 'Read' && typeof input === 'object' && input !== null) {
      return (input as { file_path?: string }).file_path || JSON.stringify(input);
    }
    if (toolName === 'Glob' && typeof input === 'object' && input !== null) {
      const g = input as { pattern?: string; path?: string };
      return g.pattern ? `${g.pattern}${g.path ? ` in ${g.path}` : ''}` : JSON.stringify(input);
    }
    if (toolName === 'Grep' && typeof input === 'object' && input !== null) {
      const g = input as { pattern?: string; path?: string; glob?: string };
      let r = g.pattern || '';
      if (g.glob) r += ` (${g.glob})`;
      if (g.path) r += ` in ${g.path}`;
      return r || JSON.stringify(input);
    }
    if (toolName === 'Bash' && typeof input === 'object' && input !== null) {
      const b = input as { command?: string; description?: string };
      return b.description || b.command || JSON.stringify(input);
    }
    if ((toolName === 'Edit' || toolName === 'Write') && typeof input === 'object' && input !== null) {
      return (input as { file_path?: string }).file_path || JSON.stringify(input);
    }
    if (toolName === 'WebSearch' && typeof input === 'object' && input !== null) {
      return (input as { query?: string }).query || JSON.stringify(input);
    }
    if (toolName === 'WebFetch' && typeof input === 'object' && input !== null) {
      return (input as { url?: string }).url || JSON.stringify(input);
    }
    if (toolName === 'Task' && typeof input === 'object' && input !== null) {
      const t = input as { description?: string; subagent_type?: string };
      return t.description ? `${t.subagent_type || 'agent'}: ${t.description}` : JSON.stringify(input);
    }
    return typeof input === 'string' ? input : JSON.stringify(input, null, 2);
  }

  function handleStreamEvent(message: ClaudeMessage): void {
    const event = message.event;
    if (!event) return;

    if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
      const toolId = event.content_block.id;
      const toolName = event.content_block.name;
      const contentBlock = event.content_block as unknown as Record<string, unknown>;
      const toolInput = contentBlock['input'] || contentBlock['inputs'];

      if (toolId && toolName) {
        const verb = getToolVerb(toolName);
        toolVerbsCache.set(toolId, verb);
        currentToolVerb.value = `${verb}...`;

        const hasCompleteInput =
          toolInput && typeof toolInput === 'object' && Object.keys(toolInput).length > 0;

        if (hasCompleteInput) {
          displayedTools.add(toolId);
          output.value.push({
            type: 'tool_use',
            content: formatToolCall(toolName, toolInput),
            timestamp: new Date(),
            toolName,
            toolInput,
          });
          toolInputBuffers.set(toolId, '');
        } else {
          toolInputBuffers.set(toolId, '');
        }

        activeTools.value.set(toolId, {
          id: toolId,
          name: toolName,
          startTime: Date.now(),
          elapsedSeconds: 0,
          status: 'running',
        });
        activeTools.value = new Map(activeTools.value);
      }
    }

    if (event.type === 'content_block_delta' && event.delta) {
      if (event.delta.type === 'input_json_delta' && event.delta.partial_json) {
        let mostRecentRunningTool: { id: string; tool: ActiveTool } | null = null;
        for (const [toolId, tool] of activeTools.value.entries()) {
          if (tool.status === 'running') {
            if (!mostRecentRunningTool || tool.startTime > mostRecentRunningTool.tool.startTime) {
              mostRecentRunningTool = { id: toolId, tool };
            }
          }
        }
        if (mostRecentRunningTool) {
          const existingBuffer = toolInputBuffers.get(mostRecentRunningTool.id) || '';
          toolInputBuffers.set(
            mostRecentRunningTool.id,
            existingBuffer + event.delta.partial_json,
          );
        }
      }
      if (event.delta.type === 'text_delta' && event.delta.text) {
        currentAssistantMessage.value += event.delta.text;
      }
    }

    if (event.type === 'content_block_stop') {
      for (const [id, tool] of activeTools.value.entries()) {
        if (tool.status === 'running') {
          if (!displayedTools.has(id)) {
            displayedTools.add(id);
            const inputJson = toolInputBuffers.get(id) || '';
            let parsedInput: unknown = null;
            try {
              if (inputJson) parsedInput = JSON.parse(inputJson);
            } catch {
              parsedInput = inputJson;
            }
            output.value.push({
              type: 'tool_use',
              content: formatToolCall(tool.name, parsedInput),
              timestamp: new Date(),
              toolName: tool.name,
              toolInput: parsedInput,
            });
          }

          activeTools.value.set(id, { ...tool, status: 'completed' });
          activeTools.value = new Map(activeTools.value);
          setTimeout(() => {
            currentToolVerb.value = '';
            toolVerbsCache.delete(id);
            toolInputBuffers.delete(id);
          }, 500);
          break;
        }
      }
    }

    if (event.type === 'message_stop') {
      if (currentAssistantMessage.value) {
        addOutput('assistant', currentAssistantMessage.value);
        currentAssistantMessage.value = '';
      }
    }
  }

  function handleMessage(message: ClaudeMessage): void {
    if (message.type === 'assistant') {
      if (currentAssistantMessage.value) {
        addOutput('assistant', currentAssistantMessage.value);
        currentAssistantMessage.value = '';
      } else {
        const content = api.extractContent(message);
        if (content) addOutput('assistant', content);
      }
    } else if (message.type === 'tool_progress') {
      handleToolProgress(message);
    } else if (message.type === 'stream_event') {
      handleStreamEvent(message);
    } else if (message.type === 'result') {
      if (currentAssistantMessage.value) {
        addOutput('assistant', currentAssistantMessage.value);
        currentAssistantMessage.value = '';
      }
      if (message.total_cost_usd) totalCost.value += message.total_cost_usd;
      if (message.usage) {
        totalInputTokens.value += message.usage.input_tokens || 0;
        totalOutputTokens.value += message.usage.output_tokens || 0;
      }
      clearToolProgress();
    }
  }

  function handleError(error: Error): void {
    isExecuting.value = false;
    if (currentAssistantMessage.value) {
      addOutput('assistant', currentAssistantMessage.value);
      currentAssistantMessage.value = '';
    }
    addOutput('error', `Error: ${error.message}`);
  }

  function handleComplete(newSessionId?: string): void {
    isExecuting.value = false;
    if (newSessionId) {
      sessionId.value = newSessionId;
      saveToStorage(keys.SESSION_ID, newSessionId);
    }
    currentAssistantMessage.value = '';
    clearToolProgress();
    addOutput('info', 'Execution completed');

    // Persist output (last 100) and stats
    saveToStorage(keys.OUTPUT, output.value.slice(-100));
    saveToStorage(keys.STATS, {
      totalCost: totalCost.value,
      totalInputTokens: totalInputTokens.value,
      totalOutputTokens: totalOutputTokens.value,
    });
  }

  function clearToolProgress(): void {
    activeTools.value = new Map();
    currentToolVerb.value = '';
    toolVerbsCache.clear();
    toolInputBuffers.clear();
    displayedTools.clear();
  }

  async function execute(applicationContext?: string): Promise<void> {
    if (!canExecute.value) return;

    const currentPrompt = prompt.value.trim();
    saveToHistory(currentPrompt);

    isExecuting.value = true;
    currentAssistantMessage.value = '';
    addOutput('user', currentPrompt);
    prompt.value = '';
    historyIndex.value = -1;

    try {
      abortController.value = await api.execute(
        currentPrompt,
        handleMessage,
        handleError,
        handleComplete,
        sessionId.value,
        'web-app',
        applicationContext,
        product,
      );
    } catch (error) {
      handleError(error as Error);
    }
  }

  function cancel(): void {
    if (abortController.value) {
      abortController.value.abort();
      abortController.value = null;
    }
    isExecuting.value = false;
    clearToolProgress();
    addOutput('info', 'Execution cancelled');
  }

  function clearOutput(): void {
    output.value = [];
    currentAssistantMessage.value = '';
    sessionId.value = undefined;
    totalCost.value = 0;
    totalInputTokens.value = 0;
    totalOutputTokens.value = 0;
    clearToolProgress();

    removeFromStorage(keys.SESSION_ID);
    removeFromStorage(keys.OUTPUT);
    removeFromStorage(keys.STATS);
  }

  function insertCommand(command: string): void {
    prompt.value = command;
  }

  async function gitRevert(): Promise<{ success: boolean; message: string }> {
    return api.gitRevert();
  }

  // Panel state persistence
  function loadPanelState(): PanelState {
    return loadFromStorage<PanelState>(keys.PANEL_STATE, { isOpen: false });
  }

  function savePanelState(state: PanelState): void {
    saveToStorage(keys.PANEL_STATE, state);
  }

  onMounted(async () => {
    await checkServer();
    if (isServerAvailable.value) {
      await Promise.all([loadCommands(), loadSkills()]);
    }
  });

  watch(prompt, () => {
    if (!isNavigatingHistory.value) {
      historyIndex.value = -1;
    }
  });

  onUnmounted(() => {
    if (abortController.value) {
      abortController.value.abort();
    }
  });

  return {
    // State
    isServerAvailable,
    isCheckingServer,
    isExecuting,
    prompt,
    output,
    currentAssistantMessage,
    commands,
    skills,
    totalCost,
    totalInputTokens,
    totalOutputTokens,
    sessionId,
    commandHistory,
    historyIndex,
    pinnedCommands,
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
    gitRevert,
    loadPanelState,
    savePanelState,
  };
}
