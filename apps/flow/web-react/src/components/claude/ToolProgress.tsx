/**
 * Tool Progress Component
 *
 * Displays the current tool execution status with animated verbs
 * like "Reading...", "Writing...", "Searching..." similar to Claude Code CLI.
 */

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { ActiveTool } from '@/types/claudeCode';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

interface ToolProgressProps {
  activeTools: Map<string, ActiveTool>;
  currentVerb: string;
  className?: string;
}

/**
 * Format elapsed time for display
 */
function formatElapsed(seconds: number): string {
  if (seconds < 1) return '';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}m ${secs}s`;
}

/**
 * Get icon for tool status
 */
function StatusIcon({ status }: { status: ActiveTool['status'] }) {
  switch (status) {
    case 'running':
      return <Loader2 className="w-3 h-3 animate-spin text-primary" />;
    case 'completed':
      return <CheckCircle className="w-3 h-3 text-green-500" />;
    case 'error':
      return <XCircle className="w-3 h-3 text-destructive" />;
    default:
      return null;
  }
}

/**
 * Single tool progress indicator
 */
function ToolIndicator({ tool }: { tool: ActiveTool }) {
  const [elapsed, setElapsed] = useState(tool.elapsedSeconds);

  // Update elapsed time every second for running tools
  useEffect(() => {
    if (tool.status !== 'running') return;

    const interval = setInterval(() => {
      setElapsed((Date.now() - tool.startTime) / 1000);
    }, 1000);

    return () => clearInterval(interval);
  }, [tool.status, tool.startTime]);

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 text-xs px-2 py-1 rounded-full',
        tool.status === 'running' && 'bg-primary/10 text-primary',
        tool.status === 'completed' && 'bg-green-500/10 text-green-600',
        tool.status === 'error' && 'bg-destructive/10 text-destructive'
      )}
    >
      <StatusIcon status={tool.status} />
      <span className="font-medium">{tool.name}</span>
      {elapsed > 0 && (
        <span className="text-muted-foreground">{formatElapsed(elapsed)}</span>
      )}
    </div>
  );
}

/**
 * Main verb indicator with animation
 */
function VerbIndicator({ verb }: { verb: string }) {
  const [dots, setDots] = useState(0);

  // Animate dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev + 1) % 4);
    }, 400);
    return () => clearInterval(interval);
  }, []);

  // Remove trailing "..." from verb since we'll animate it
  const verbText = verb.replace(/\.+$/, '');
  const animatedDots = '.'.repeat(dots);

  return (
    <div className="flex items-center gap-2 text-sm text-primary font-medium">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span>
        {verbText}
        <span className="inline-block w-6">{animatedDots}</span>
      </span>
    </div>
  );
}

export function ToolProgress({ activeTools, currentVerb, className }: ToolProgressProps) {
  // Get running tools
  const runningTools = Array.from(activeTools.values()).filter(
    (t) => t.status === 'running'
  );

  // Nothing to show
  if (!currentVerb && runningTools.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Main verb indicator */}
      {currentVerb && <VerbIndicator verb={currentVerb} />}

      {/* Individual tool indicators (only show if multiple) */}
      {runningTools.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {runningTools.map((tool) => (
            <ToolIndicator key={tool.id} tool={tool} />
          ))}
        </div>
      )}
    </div>
  );
}
