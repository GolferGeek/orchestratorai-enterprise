/* eslint-disable react-refresh/only-export-components -- context pattern exports both provider and hook */
/**
 * Claude Code Context
 *
 * Global state provider for Claude Code panel.
 * Enables opening the panel from anywhere in the app,
 * with optional task context for AI assistance.
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { Task } from '@/hooks/useSharedTasks';

interface ClaudeCodeContextType {
  /** Whether the panel is currently open */
  isOpen: boolean;
  /** Open the panel */
  open: () => void;
  /** Close the panel */
  close: () => void;
  /** Toggle panel open/closed */
  toggle: () => void;
  /** Current task context (if any) */
  contextTask: Task | null;
  /** Open panel with task context pre-filled */
  askAboutTask: (task: Task) => void;
  /** Clear task context */
  clearContext: () => void;
  /** Initial prompt to pre-fill (from task context) */
  initialPrompt: string;
  /** Clear the initial prompt after it's been used */
  clearInitialPrompt: () => void;
}

const ClaudeCodeContext = createContext<ClaudeCodeContextType | undefined>(undefined);

/**
 * Build a context-aware prompt for a task
 */
function buildTaskContextPrompt(task: Task): string {
  const lines = [
    `Help me with this task:`,
    ``,
    `**Title:** ${task.title}`,
    `**Status:** ${task.status.replace('_', ' ')}`,
    `**Completed:** ${task.is_completed ? 'Yes' : 'No'}`,
  ];

  if (task.pomodoro_count > 0) {
    lines.push(`**Pomodoros:** ${task.pomodoro_count}`);
  }

  if (task.due_date) {
    lines.push(`**Due:** ${new Date(task.due_date).toLocaleDateString()}`);
  }

  lines.push('', 'What would you like help with?');

  return lines.join('\n');
}

export function ClaudeCodeProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [contextTask, setContextTask] = useState<Task | null>(null);
  const [initialPrompt, setInitialPrompt] = useState('');

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const askAboutTask = useCallback((task: Task) => {
    setContextTask(task);
    setInitialPrompt(buildTaskContextPrompt(task));
    setIsOpen(true);
  }, []);

  const clearContext = useCallback(() => {
    setContextTask(null);
    setInitialPrompt('');
  }, []);

  const clearInitialPrompt = useCallback(() => {
    setInitialPrompt('');
  }, []);

  return (
    <ClaudeCodeContext.Provider
      value={{
        isOpen,
        open,
        close,
        toggle,
        contextTask,
        askAboutTask,
        clearContext,
        initialPrompt,
        clearInitialPrompt,
      }}
    >
      {children}
    </ClaudeCodeContext.Provider>
  );
}

export function useClaudeCode() {
  const context = useContext(ClaudeCodeContext);
  if (context === undefined) {
    throw new Error('useClaudeCode must be used within a ClaudeCodeProvider');
  }
  return context;
}
