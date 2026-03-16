/**
 * Claude Code Panel Component
 *
 * Main slide-out panel for Claude Code integration.
 * Provides a terminal-like interface for executing Claude commands.
 */

import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { Terminal, X, Code, Play, Square, Trash2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useClaudeCodePanel } from '@/hooks/useClaudeCodePanel';
import { useClaudeCode } from '@/contexts/ClaudeCodeContext';
import { OutputEntry } from './OutputEntry';
import { PinnedCommands } from './PinnedCommands';
import { AutoCompleteDropdown } from './AutoCompleteDropdown';
import { StatsFooter } from './StatsFooter';
import { ToolProgress } from './ToolProgress';

interface ClaudeCodePanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional initial prompt (e.g., from task context) */
  initialPrompt?: string;
  /** Callback when initial prompt has been applied */
  onInitialPromptApplied?: () => void;
}

export function ClaudeCodePanel({ isOpen, onClose }: ClaudeCodePanelProps) {
  const {
    isServerAvailable,
    isCheckingServer,
    isExecuting,
    prompt,
    setPrompt,
    output,
    currentAssistantMessage,
    commands,
    totalCost,
    totalInputTokens,
    totalOutputTokens,
    pinnedCommands,
    activeTools,
    currentToolVerb,
    canExecute,
    hasOutput,
    execute,
    cancel,
    clearOutput,
    insertCommand,
    navigateHistory,
    pinCommand,
    unpinCommand,
  } = useClaudeCodePanel();

  // Get context for initial prompt from task
  const { initialPrompt, clearInitialPrompt, contextTask } = useClaudeCode();

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Apply initial prompt when panel opens with task context
  useEffect(() => {
    if (isOpen && initialPrompt && !prompt) {
      setPrompt(initialPrompt);
      clearInitialPrompt();
      // Focus the textarea after a short delay
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [isOpen, initialPrompt, prompt, setPrompt, clearInitialPrompt]);

  // Auto-complete state
  const [showAutoComplete, setShowAutoComplete] = useState(false);
  const [autoCompleteSelectedIndex, setAutoCompleteSelectedIndex] = useState(0);
  const [autoCompleteFilter, setAutoCompleteFilter] = useState('');

  // Filtered commands for auto-complete
  const filteredCommands = useMemo(() => {
    if (!autoCompleteFilter) {
      return commands.slice(0, 10);
    }
    const filter = autoCompleteFilter.toLowerCase();
    return commands
      .filter((cmd) => cmd.name.toLowerCase().includes(filter))
      .slice(0, 10);
  }, [commands, autoCompleteFilter]);

  // Status display
  const statusText = useMemo(() => {
    if (isCheckingServer) return 'Checking...';
    if (isServerAvailable) return 'Connected';
    return 'Disconnected';
  }, [isCheckingServer, isServerAvailable]);

  const statusTitle = useMemo(() => {
    if (isCheckingServer) return 'Checking server connection...';
    if (isServerAvailable) return 'Connected to Claude Code server';
    return 'Cannot connect to server. Make sure the API is running in development mode.';
  }, [isCheckingServer, isServerAvailable]);

  const inputPlaceholder = useMemo(() => {
    if (!isServerAvailable) return 'Server not available...';
    if (isExecuting) return 'Executing...';
    return 'Enter a command like /test or describe what you want... (Cmd/Ctrl+Enter to execute)';
  }, [isServerAvailable, isExecuting]);

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [output, currentAssistantMessage]);

  // Handle input for auto-complete
  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setPrompt(value);

    const lastSlash = value.lastIndexOf('/');

    if (lastSlash !== -1 && lastSlash === value.length - 1) {
      // Just typed /
      setShowAutoComplete(true);
      setAutoCompleteFilter('');
      setAutoCompleteSelectedIndex(0);
    } else if (lastSlash !== -1 && !value.substring(lastSlash).includes(' ')) {
      // Typing after /
      setShowAutoComplete(true);
      setAutoCompleteFilter(value.substring(lastSlash));
      setAutoCompleteSelectedIndex(0);
    } else {
      setShowAutoComplete(false);
    }
  }, [setPrompt]);

  // Handle keydown for auto-complete and history
  const handleKeydown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle auto-complete navigation
    if (showAutoComplete) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAutoCompleteSelectedIndex((prev) =>
          Math.min(prev + 1, filteredCommands.length - 1)
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAutoCompleteSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Tab' || (e.key === 'Enter' && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault();
        selectCommand(filteredCommands[autoCompleteSelectedIndex]?.name);
      } else if (e.key === 'Escape') {
        setShowAutoComplete(false);
      }
      return;
    }

    // Handle execute shortcut
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      execute();
      return;
    }

    // Handle command history navigation
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigateHistory('up');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      navigateHistory('down');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectCommand is defined after this callback, using ref pattern would add complexity
  }, [showAutoComplete, filteredCommands, autoCompleteSelectedIndex, execute, navigateHistory]);

  // Select a command from auto-complete
  const selectCommand = useCallback((name: string) => {
    if (!name) return;

    const lastSlash = prompt.lastIndexOf('/');
    if (lastSlash !== -1) {
      setPrompt(prompt.substring(0, lastSlash) + name + ' ');
    }
    setShowAutoComplete(false);
    setAutoCompleteSelectedIndex(0);

    // Focus back on textarea
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, [prompt, setPrompt]);

  // Toggle pin for a command
  const togglePin = useCallback((commandName: string) => {
    if (pinnedCommands.includes(commandName)) {
      unpinCommand(commandName);
    } else {
      pinCommand(commandName);
    }
  }, [pinnedCommands, pinCommand, unpinCommand]);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[600px] max-w-full p-0 flex flex-col">
        {/* Header */}
        <SheetHeader className="px-4 py-3 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Terminal className="h-5 w-5 text-primary" />
              {contextTask ? (
                <span className="truncate max-w-[200px]" title={contextTask.title}>
                  Task: {contextTask.title}
                </span>
              ) : (
                'Claude Code Panel'
              )}
            </SheetTitle>
            <div className="flex items-center gap-3">
              <span
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
                title={statusTitle}
              >
                <span
                  className={cn(
                    'w-2 h-2 rounded-full',
                    isCheckingServer && 'bg-yellow-500 animate-pulse',
                    isServerAvailable && !isCheckingServer && 'bg-green-500',
                    !isServerAvailable && !isCheckingServer && 'bg-red-500'
                  )}
                />
                {statusText}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        {/* Pinned Commands */}
        <PinnedCommands
          pinnedCommands={pinnedCommands}
          commands={commands}
          onSelect={insertCommand}
          onUnpin={unpinCommand}
          disabled={!isServerAvailable || isExecuting}
        />

        {/* Output Area */}
        <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
          {!hasOutput ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-center py-12">
              <Code className="h-12 w-12 mb-4 opacity-50" />
              <p>Enter a command or describe what you want to do</p>
              <p className="text-sm mt-1 opacity-80">
                Try: /test, /commit, /monitor, or ask in natural language
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {output.map((entry, index) => (
                <OutputEntry key={index} entry={entry} />
              ))}

              {/* Tool progress indicator */}
              {isExecuting && (currentToolVerb || activeTools.size > 0) && (
                <ToolProgress
                  activeTools={activeTools}
                  currentVerb={currentToolVerb}
                  className="p-3 rounded-lg bg-muted/50 border border-border"
                />
              )}

              {/* Current streaming message */}
              {currentAssistantMessage && (
                <div className="p-3 rounded-lg text-sm bg-muted border-l-4 border-green-500">
                  <span className="font-semibold block mb-1">Claude:</span>
                  <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed m-0">
                    {currentAssistantMessage}
                    <span className="animate-pulse">|</span>
                  </pre>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Input Area */}
        <div className="p-4 border-t flex-shrink-0">
          <div className="relative mb-3">
            <Textarea
              ref={textareaRef}
              value={prompt}
              onChange={handleInput}
              onKeyDown={handleKeydown}
              placeholder={inputPlaceholder}
              disabled={!isServerAvailable || isExecuting}
              rows={3}
              className="resize-none font-mono text-sm"
            />

            {/* Auto-complete dropdown */}
            {showAutoComplete && filteredCommands.length > 0 && (
              <AutoCompleteDropdown
                commands={filteredCommands}
                selectedIndex={autoCompleteSelectedIndex}
                pinnedCommands={pinnedCommands}
                onSelect={selectCommand}
                onHover={setAutoCompleteSelectedIndex}
                onTogglePin={togglePin}
              />
            )}
          </div>

          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              {hasOutput && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={clearOutput}
                  disabled={isExecuting}
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Clear
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {isExecuting ? (
                <Button variant="destructive" size="sm" onClick={cancel}>
                  <Square className="h-4 w-4 mr-1.5" />
                  Cancel
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={execute}
                  disabled={!canExecute}
                  title="Execute command (Cmd/Ctrl+Enter)"
                >
                  <Play className="h-4 w-4 mr-1.5" />
                  Execute
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Footer Stats */}
        <StatsFooter
          totalCost={totalCost}
          totalInputTokens={totalInputTokens}
          totalOutputTokens={totalOutputTokens}
        />
      </SheetContent>
    </Sheet>
  );
}
