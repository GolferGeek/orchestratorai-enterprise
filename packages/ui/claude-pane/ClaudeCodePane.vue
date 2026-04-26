<template>
  <!-- Inline side panel — flexes alongside main content, not a modal -->
  <div
    v-if="isOpen"
    class="cp-pane"
    :style="{ width: paneWidth + 'px' }"
  >
        <!-- Resize handle (left edge) -->
        <div
          class="cp-resize-handle"
          @mousedown="startResize"
          @touchstart.prevent="startResize"
          title="Drag to resize"
        >
          <div class="cp-resize-indicator"></div>
        </div>

        <!-- Header -->
        <header class="cp-header">
          <div class="cp-header-left">
            <svg class="cp-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="4 17 10 11 4 5"/>
              <line x1="12" y1="19" x2="20" y2="19"/>
            </svg>
            <span class="cp-title">Claude Code</span>
            <span class="cp-product-badge">{{ product }}</span>
          </div>
          <div class="cp-header-right">
            <span
              class="cp-status"
              :class="{ 'cp-status--connected': isServerAvailable, 'cp-status--checking': isCheckingServer }"
              :title="statusTitle"
            >
              <span class="cp-status-dot"></span>
              <span class="cp-status-text">{{ statusText }}</span>
            </span>
            <button class="cp-close-btn" @click="closePane" title="Close pane">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </header>

        <!-- Pinned commands bar -->
        <div class="cp-pinned-bar">
          <span class="cp-pinned-label">Pinned</span>
          <div class="cp-pinned-list">
            <div
              v-for="cmd in quickCommands"
              :key="cmd.name"
              class="cp-pinned-item"
            >
              <button
                class="cp-pinned-btn"
                :disabled="!isServerAvailable || isExecuting"
                :title="cmd.description"
                @click="insertCommand(cmd.name)"
              >
                {{ cmd.name }}
              </button>
              <button
                class="cp-pin-remove-btn"
                title="Unpin"
                @click="unpinCommand(cmd.name)"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Output area -->
        <div ref="outputRef" class="cp-output">
          <div v-if="!hasOutput" class="cp-empty-state">
            <svg class="cp-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <polyline points="16 18 22 12 16 6"/>
              <polyline points="8 6 2 12 8 18"/>
            </svg>
            <p>Enter a command or describe what you want to do</p>
            <p class="cp-hint">Try: /test, /commit, /monitor, or ask in natural language</p>
          </div>

          <div v-else class="cp-output-entries">
            <div
              v-for="(entry, index) in output"
              :key="index"
              class="cp-entry"
              :class="`cp-entry--${entry.type}`"
            >
              <template v-if="entry.type === 'tool_use'">
                <span class="cp-tool-icon">{{ getToolIcon(entry.toolName) }}</span>
                <span class="cp-tool-name">{{ entry.toolName }}:</span>
                <span class="cp-tool-input">{{ entry.content }}</span>
              </template>
              <template v-else>
                <span v-if="getEntryPrefix(entry.type)" class="cp-entry-prefix">
                  {{ getEntryPrefix(entry.type) }}
                </span>
                <pre class="cp-entry-content">{{ entry.content }}</pre>
              </template>

              <!-- Undo button for assistant messages after file operations -->
              <div v-if="entry.type === 'assistant' && hasFileOperation(entry, index)" class="cp-entry-actions">
                <button class="cp-undo-btn" @click="handleGitRevert">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <polyline points="1 4 1 10 7 10"/>
                    <path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
                  </svg>
                  Undo last fix
                </button>
              </div>
            </div>

            <!-- Tool progress -->
            <div v-if="isExecuting && (currentToolVerb || activeTools.size > 0)" class="cp-tool-progress-wrapper">
              <ClaudePaneToolProgress :active-tools="activeTools" :current-verb="currentToolVerb" />
            </div>

            <!-- Streaming text -->
            <div v-if="currentAssistantMessage" class="cp-entry cp-entry--assistant cp-streaming">
              <span class="cp-entry-prefix">Claude:</span>
              <pre class="cp-entry-content">{{ currentAssistantMessage }}</pre>
              <span class="cp-cursor-blink">|</span>
            </div>
          </div>
        </div>

        <!-- Input area -->
        <div class="cp-input-area">
          <div class="cp-input-wrapper">
            <textarea
              ref="textareaRef"
              v-model="prompt"
              class="cp-textarea"
              :placeholder="inputPlaceholder"
              :disabled="!isServerAvailable || isExecuting"
              rows="3"
              @input="handleInput"
              @keydown="handleKeydown"
              @keydown.enter.meta.exact.prevent="execute()"
              @keydown.enter.ctrl.exact.prevent="execute()"
            ></textarea>

            <!-- Auto-complete dropdown -->
            <div
              v-if="showAutoComplete && filteredCommands.length > 0"
              class="cp-autocomplete"
            >
              <button
                v-for="(cmd, index) in filteredCommands"
                :key="cmd.name"
                class="cp-autocomplete-item"
                :class="{ 'cp-autocomplete-item--selected': index === autoCompleteIndex }"
                @click="selectCommand(cmd.name)"
                @mouseenter="autoCompleteIndex = index"
              >
                <div class="cp-cmd-info">
                  <span class="cp-cmd-name">{{ cmd.name }}</span>
                  <span class="cp-cmd-desc">{{ cmd.description }}</span>
                </div>
                <button
                  class="cp-autocomplete-pin-btn"
                  :class="{ 'cp-autocomplete-pin-btn--active': isCommandPinned(cmd.name) }"
                  :title="isCommandPinned(cmd.name) ? 'Unpin' : 'Pin'"
                  @click.stop="togglePin(cmd.name)"
                >
                  <svg viewBox="0 0 24 24" :fill="isCommandPinned(cmd.name) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                  </svg>
                </button>
              </button>
            </div>
          </div>

          <div class="cp-action-row">
            <div class="cp-action-left">
              <button
                v-if="hasOutput"
                class="cp-btn cp-btn--secondary"
                :disabled="isExecuting"
                title="Clear output"
                @click="clearOutput"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
                Clear
              </button>
            </div>
            <div class="cp-action-right">
              <button
                v-if="isExecuting"
                class="cp-btn cp-btn--danger"
                @click="cancel"
                title="Cancel execution"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                </svg>
                Cancel
              </button>
              <button
                v-else
                class="cp-btn cp-btn--primary"
                :disabled="!canExecute"
                title="Execute command (Cmd/Ctrl+Enter)"
                @click="execute()"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Execute
              </button>
            </div>
          </div>
        </div>

        <!-- Footer stats -->
        <footer v-if="totalCost > 0" class="cp-footer">
          <span class="cp-stat">Cost: ${{ totalCost.toFixed(4) }}</span>
          <span class="cp-stat">Tokens: {{ totalInputTokens + totalOutputTokens }}</span>
        </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useClaudePane, type OutputEntry } from './useClaudePane';
import { normalizeAdminApiBaseUrl } from './claudePaneService';
import ClaudePaneToolProgress from './ClaudePaneToolProgress.vue';

const props = withDefaults(
  defineProps<{
    /** Which product is embedding this pane (forge, compose, flow, admin, pulse, bridge) */
    product: string;
    /** Base URL for the Admin API (default: http://localhost:6150) */
    adminApiUrl?: string;
    /** Optional application context string injected into Claude's system prompt */
    applicationContext?: string;
  }>(),
  {
    adminApiUrl: (
      import.meta.env.VITE_ADMIN_API_URL ||
      (import.meta.env.DEV
        ? `http://localhost:${import.meta.env.VITE_ADMIN_API_PORT || '6150'}`
        : '/api/admin')
    ),
    applicationContext: undefined,
  },
);

const emit = defineEmits<{
  'pane-change': [state: { open: boolean; width: number }];
}>();

const {
  isServerAvailable,
  isCheckingServer,
  isExecuting,
  prompt,
  output,
  currentAssistantMessage,
  commands,
  totalCost,
  totalInputTokens,
  totalOutputTokens,
  activeTools,
  currentToolVerb,
  canExecute,
  hasOutput,
  execute: doExecute,
  cancel,
  clearOutput,
  insertCommand,
  navigateHistory,
  pinCommand,
  unpinCommand,
  pinnedCommands,
  gitRevert,
  loadPanelState,
  savePanelState,
} = useClaudePane(props.adminApiUrl, props.product);

// Pane open/close state — persisted via panel state
const isOpen = ref(false);
const paneWidth = ref(480);

onMounted(() => {
  const state = loadPanelState();
  isOpen.value = state.isOpen;
  if (state.width) paneWidth.value = state.width;
  // Notify parent of initial state so it can set --claude-pane-inset
  emit('pane-change', { open: isOpen.value, width: paneWidth.value });
});

function openPane() {
  isOpen.value = true;
  savePanelState({ isOpen: true, width: paneWidth.value, lastOpenedAt: new Date().toISOString() });
  emit('pane-change', { open: true, width: paneWidth.value });
}

function closePane() {
  isOpen.value = false;
  savePanelState({ isOpen: false, width: paneWidth.value });
  emit('pane-change', { open: false, width: paneWidth.value });
}

function togglePane() {
  if (isOpen.value) closePane();
  else openPane();
}

// Listen for global toggle event (fired by CrawlerBubble / top nav button)
onMounted(() => {
  window.addEventListener('oai:toggle-claude-pane', togglePane);
});
onUnmounted(() => {
  window.removeEventListener('oai:toggle-claude-pane', togglePane);
});

// Resize logic
const isResizing = ref(false);
const resizeStartX = ref(0);
const resizeStartWidth = ref(480);

function startResize(e: MouseEvent | TouchEvent) {
  isResizing.value = true;
  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
  resizeStartX.value = clientX;
  resizeStartWidth.value = paneWidth.value;

  document.addEventListener('mousemove', onResize);
  document.addEventListener('mouseup', stopResize);
  document.addEventListener('touchmove', onResize);
  document.addEventListener('touchend', stopResize);
}

function onResize(e: MouseEvent | TouchEvent) {
  if (!isResizing.value) return;
  const clientX = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
  const delta = resizeStartX.value - clientX;
  paneWidth.value = Math.max(320, Math.min(window.innerWidth * 0.9, resizeStartWidth.value + delta));
}

function stopResize() {
  isResizing.value = false;
  savePanelState({ isOpen: isOpen.value, width: paneWidth.value });
  emit('pane-change', { open: isOpen.value, width: paneWidth.value });
  document.removeEventListener('mousemove', onResize);
  document.removeEventListener('mouseup', stopResize);
  document.removeEventListener('touchmove', onResize);
  document.removeEventListener('touchend', stopResize);
}

// Output scrolling
const outputRef = ref<HTMLElement | null>(null);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

watch(
  [output, currentAssistantMessage],
  async () => {
    await nextTick();
    if (outputRef.value) {
      outputRef.value.scrollTop = outputRef.value.scrollHeight;
    }
  },
  { deep: true },
);

// Auto-complete
const showAutoComplete = ref(false);
const autoCompleteIndex = ref(0);
const autoCompleteFilter = ref('');

const filteredCommands = computed(() => {
  if (!autoCompleteFilter.value) return commands.value.slice(0, 10);
  const filter = autoCompleteFilter.value.toLowerCase();
  return commands.value.filter((cmd) => cmd.name.toLowerCase().includes(filter)).slice(0, 10);
});

const quickCommands = computed(() =>
  pinnedCommands.value.map((name) => {
    const cmd = commands.value.find((c) => c.name === name);
    return cmd || { name, description: '' };
  }),
);

function handleInput(e: Event) {
  const value = (e.target as HTMLTextAreaElement).value;
  const lastSlash = value.lastIndexOf('/');
  if (lastSlash !== -1 && lastSlash === value.length - 1) {
    showAutoComplete.value = true;
    autoCompleteFilter.value = '';
    autoCompleteIndex.value = 0;
  } else if (lastSlash !== -1 && !value.substring(lastSlash).includes(' ')) {
    showAutoComplete.value = true;
    autoCompleteFilter.value = value.substring(lastSlash);
    autoCompleteIndex.value = 0;
  } else {
    showAutoComplete.value = false;
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (showAutoComplete.value) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      autoCompleteIndex.value = Math.min(autoCompleteIndex.value + 1, filteredCommands.value.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      autoCompleteIndex.value = Math.max(autoCompleteIndex.value - 1, 0);
    } else if (e.key === 'Tab' || (e.key === 'Enter' && !e.metaKey && !e.ctrlKey)) {
      e.preventDefault();
      selectCommand(filteredCommands.value[autoCompleteIndex.value]?.name);
    } else if (e.key === 'Escape') {
      showAutoComplete.value = false;
    }
    return;
  }

  if (e.key === 'ArrowUp' && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    navigateHistory('up');
  } else if (e.key === 'ArrowDown' && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    navigateHistory('down');
  }
}

function selectCommand(name: string) {
  if (!name) return;
  const lastSlash = prompt.value.lastIndexOf('/');
  if (lastSlash !== -1) {
    prompt.value = prompt.value.substring(0, lastSlash) + name + ' ';
  }
  showAutoComplete.value = false;
  autoCompleteIndex.value = 0;
  nextTick(() => textareaRef.value?.focus());
}

function isCommandPinned(commandName: string): boolean {
  return pinnedCommands.value.includes(commandName);
}

function togglePin(commandName: string) {
  if (isCommandPinned(commandName)) {
    unpinCommand(commandName);
  } else {
    pinCommand(commandName);
  }
}

function execute() {
  doExecute(props.applicationContext);
}

// Entry helpers
const statusText = computed(() => {
  if (isCheckingServer.value) return 'Checking...';
  if (isServerAvailable.value) return 'Connected';
  return 'Disconnected';
});

const statusTitle = computed(() => {
  if (isCheckingServer.value) return 'Checking server connection...';
  if (isServerAvailable.value) return 'Connected to Claude Code CLI via Admin API';
  return 'Cannot connect to Admin API. Make sure it is running on ' + normalizeAdminApiBaseUrl(props.adminApiUrl);
});

const inputPlaceholder = computed(() => {
  if (!isServerAvailable.value) return 'Server not available...';
  if (isExecuting.value) return 'Executing...';
  return 'Enter a command like /test or describe what you want... (Cmd/Ctrl+Enter to execute)';
});

function getEntryPrefix(type: OutputEntry['type']): string {
  switch (type) {
    case 'user': return 'You:';
    case 'assistant': return 'Claude:';
    case 'system': return 'System:';
    case 'error': return 'Error:';
    default: return '';
  }
}

function getToolIcon(toolName?: string): string {
  if (!toolName) return '[tool]';
  const icons: Record<string, string> = {
    Read: '[read]',
    Write: '[write]',
    Edit: '[edit]',
    Bash: '[bash]',
    Glob: '[glob]',
    Grep: '[grep]',
    Task: '[task]',
    WebFetch: '[fetch]',
    WebSearch: '[search]',
    TodoWrite: '[todo]',
  };
  return icons[toolName] || '[tool]';
}

function hasFileOperation(_entry: OutputEntry, index: number): boolean {
  for (let i = index - 1; i >= 0; i--) {
    const prev = output.value[i];
    if (prev.type === 'tool_use') {
      const name = (prev.toolName || '').toLowerCase();
      if (name === 'edit' || name === 'write' || name === 'notebookedit') return true;
    }
    if (prev.type === 'assistant') break;
  }
  return false;
}

async function handleGitRevert() {
  try {
    const result = await gitRevert();
    alert(result.message);
  } catch (error) {
    alert(`Failed to revert: ${(error as Error).message}`);
  }
}
</script>

<style scoped>
/* ================================================================
   All colors use --oai-* semantic CSS variables from the theme system.
   Light/dark mode is handled automatically — no separate dark block needed.
   ================================================================ */

/*
 * Fixed-position side panel on the right edge of the viewport.
 * Lives outside Ionic's DOM tree to avoid web component conflicts.
 * IonRouterOutlet's right edge is pushed inward via --claude-pane-inset
 * on the parent IonPage, so content doesn't overlap.
 */
.cp-pane {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 100;
  background: var(--oai-bg-surface);
  color: var(--oai-text-primary);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-left: 1px solid var(--oai-border);
  min-width: 320px;
  max-width: 60vw;
}

/* Resize handle */
.cp-resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: ew-resize;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cp-resize-indicator {
  width: 3px;
  height: 40px;
  background: var(--oai-border);
  border-radius: 2px;
  opacity: 0.6;
  transition: all 0.2s;
}

.cp-resize-handle:hover .cp-resize-indicator {
  background: var(--oai-text-accent);
  opacity: 1;
}

/* Header */
.cp-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--oai-border);
  background: var(--oai-bg-surface-2);
  flex-shrink: 0;
}

.cp-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cp-header-icon {
  width: 20px;
  height: 20px;
  color: var(--oai-text-accent);
}

.cp-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--oai-text-primary);
}

.cp-product-badge {
  font-size: 11px;
  font-weight: 600;
  color: var(--oai-badge-primary-color);
  background: var(--oai-badge-primary-bg);
  border: 1px solid var(--oai-badge-primary-border);
  border-radius: 10px;
  padding: 2px 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.cp-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Status indicator */
.cp-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--oai-text-secondary);
}

.cp-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--oai-status-error);
  flex-shrink: 0;
}

.cp-status--connected .cp-status-dot {
  background: var(--oai-status-online);
}

.cp-status--checking .cp-status-dot {
  background: var(--oai-status-busy);
  animation: cp-pulse 1s infinite;
}

@keyframes cp-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.cp-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  color: var(--oai-text-primary);
  transition: background 0.2s;
}

.cp-close-btn:hover {
  background: var(--oai-bg-surface-3);
}

.cp-close-btn svg {
  width: 18px;
  height: 18px;
}

/* Pinned commands bar */
.cp-pinned-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--oai-border);
  flex-shrink: 0;
  overflow-x: auto;
}

.cp-pinned-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--oai-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
  flex-shrink: 0;
}

.cp-pinned-list {
  display: flex;
  gap: 6px;
  flex-wrap: nowrap;
}

.cp-pinned-item {
  display: flex;
  align-items: center;
  gap: 2px;
}

.cp-pinned-btn {
  padding: 4px 10px;
  border: 1px solid var(--oai-border);
  border-radius: 14px;
  background: transparent;
  color: var(--oai-text-primary);
  font-size: 12px;
  font-family: 'SF Mono', Monaco, Menlo, monospace;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.cp-pinned-btn:hover:not(:disabled) {
  background: var(--oai-btn-primary-bg);
  color: var(--oai-btn-primary-color);
  border-color: var(--oai-btn-primary-bg);
}

.cp-pinned-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cp-pin-remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--oai-badge-warning-color);
  cursor: pointer;
  padding: 0;
  transition: background 0.2s;
}

.cp-pin-remove-btn:hover {
  background: var(--oai-badge-warning-bg);
}

/* Output area */
.cp-output {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background: var(--oai-bg-page);
  min-height: 0;
}

.cp-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--oai-text-secondary);
  text-align: center;
  gap: 8px;
}

.cp-empty-icon {
  width: 48px;
  height: 48px;
  opacity: 0.5;
}

.cp-empty-state p {
  margin: 0;
  font-size: 14px;
}

.cp-hint {
  font-size: 12px;
  opacity: 0.9;
}

.cp-output-entries {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cp-entry {
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 14px;
  color: var(--oai-text-primary);
}

.cp-entry-prefix {
  display: block;
  font-weight: 600;
  margin-bottom: 4px;
  font-size: 12px;
}

.cp-entry-content {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'SF Mono', Monaco, Menlo, monospace;
  font-size: 13px;
  line-height: 1.5;
  color: var(--oai-text-primary);
}

.cp-entry--user {
  background: var(--oai-message-user-bg);
  border-left: 3px solid var(--oai-text-accent);
  color: var(--oai-text-accent);
}

.cp-entry--assistant {
  border-left: 3px solid var(--oai-status-online);
  background: var(--oai-badge-success-bg);
}

.cp-entry--system {
  background: var(--oai-bg-surface-3);
  border-left: 3px solid var(--oai-text-tertiary);
  font-size: 12px;
}

.cp-entry--error {
  background: var(--oai-badge-danger-bg);
  border-left: 3px solid var(--oai-status-error);
  color: var(--oai-badge-danger-color);
}

.cp-entry--info {
  background: transparent;
  color: var(--oai-text-tertiary);
  font-size: 12px;
  text-align: center;
  padding: 4px;
}

.cp-entry--tool_use {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border-left: 3px solid var(--oai-text-accent);
  padding: 6px 12px;
  background: var(--oai-bg-surface-2);
}

.cp-tool-icon {
  font-size: 12px;
  flex-shrink: 0;
  line-height: 1.5;
  color: var(--oai-text-secondary);
  font-family: monospace;
}

.cp-tool-name {
  font-weight: 600;
  font-size: 12px;
  flex-shrink: 0;
  line-height: 1.5;
  color: var(--oai-text-accent);
}

.cp-tool-input {
  font-family: 'SF Mono', Monaco, Menlo, monospace;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
  color: var(--oai-text-primary);
}

.cp-streaming .cp-cursor-blink {
  animation: cp-blink 1s infinite;
}

@keyframes cp-blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.cp-entry-actions {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--oai-border-subtle);
}

.cp-undo-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--oai-badge-warning-border);
  border-radius: 6px;
  background: transparent;
  color: var(--oai-badge-warning-color);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.cp-undo-btn:hover {
  background: var(--oai-badge-warning-bg);
}

.cp-tool-progress-wrapper {
  padding: 12px;
  border-radius: 8px;
  background: var(--oai-bg-surface-3);
  border: 1px solid var(--oai-border);
}

/* Input area */
.cp-input-area {
  padding: 12px 16px;
  border-top: 1px solid var(--oai-border);
  background: var(--oai-bg-surface);
  flex-shrink: 0;
}

.cp-input-wrapper {
  position: relative;
  margin-bottom: 10px;
}

.cp-textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--oai-input-border);
  border-radius: 8px;
  background: var(--oai-input-bg);
  color: var(--oai-input-color);
  font-family: 'SF Mono', Monaco, Menlo, monospace;
  font-size: 13px;
  resize: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.cp-textarea:focus {
  outline: none;
  border-color: var(--oai-input-border-focus);
  box-shadow: var(--oai-input-shadow-focus);
}

.cp-textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background: var(--oai-bg-surface-3);
}

/* Autocomplete dropdown */
.cp-autocomplete {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  right: 0;
  max-height: 240px;
  overflow-y: auto;
  background: var(--oai-bg-surface);
  border: 1px solid var(--oai-border);
  border-radius: 8px;
  box-shadow: var(--oai-card-shadow);
  z-index: 10;
}

.cp-autocomplete-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
  gap: 8px;
}

.cp-autocomplete-item:hover,
.cp-autocomplete-item--selected {
  background: var(--oai-nav-active-bg);
}

.cp-cmd-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.cp-cmd-name {
  font-family: monospace;
  font-weight: 600;
  font-size: 13px;
  color: var(--oai-text-primary);
}

.cp-cmd-desc {
  color: var(--oai-text-secondary);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cp-autocomplete-pin-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--oai-border);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s;
}

.cp-autocomplete-pin-btn--active {
  color: var(--oai-badge-warning-color);
}

.cp-autocomplete-pin-btn:hover {
  background: var(--oai-bg-surface-3);
  color: var(--oai-badge-warning-color);
}

/* Action row */
.cp-action-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.cp-action-left,
.cp-action-right {
  display: flex;
  gap: 8px;
}

.cp-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: none;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.cp-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cp-btn--primary {
  background: var(--oai-btn-primary-bg);
  color: var(--oai-btn-primary-color);
  box-shadow: var(--oai-btn-primary-shadow);
}

.cp-btn--primary:hover:not(:disabled) {
  background: var(--oai-btn-primary-hover);
}

.cp-btn--secondary {
  background: var(--oai-bg-surface-3);
  color: var(--oai-text-primary);
  border: 1px solid var(--oai-border);
}

.cp-btn--secondary:hover:not(:disabled) {
  background: var(--oai-nav-hover-bg);
}

.cp-btn--danger {
  background: var(--oai-btn-danger-bg);
  color: var(--oai-btn-danger-color);
}

.cp-btn--danger:hover {
  background: var(--oai-btn-danger-hover);
}

/* Footer */
.cp-footer {
  display: flex;
  justify-content: flex-end;
  gap: 16px;
  padding: 6px 16px;
  border-top: 1px solid var(--oai-border);
  background: var(--oai-bg-surface-2);
  font-size: 11px;
  color: var(--oai-text-tertiary);
  flex-shrink: 0;
}

.cp-stat {
  font-family: monospace;
}
</style>
