/**
 * @orchestratorai/ui — Claude Code Pane
 *
 * Shared Claude Code Pane component and composable for all enterprise products.
 *
 * Usage:
 *   import { ClaudeCodePane, useClaudePane } from '@orchestratorai/ui/claude-pane'
 *
 * Or from the shared UI package root:
 *   import { ClaudeCodePane } from '@orchestratorai/ui'
 */

export { default as ClaudeCodePane } from './ClaudeCodePane.vue';
export { default as ClaudePaneToolProgress } from './ClaudePaneToolProgress.vue';
export { useClaudePane } from './useClaudePane';
export { ClaudePaneApiService, getToolVerb, TOOL_VERBS } from './claudePaneService';
export type { OutputEntry, PanelState } from './useClaudePane';
export type { ClaudeCommand, ClaudeSkill, ClaudeMessage, ActiveTool } from './claudePaneService';
