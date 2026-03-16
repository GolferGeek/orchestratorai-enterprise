/**
 * Output Entry Component
 *
 * Renders a single output entry in the Claude Code panel.
 */

import { cn } from '@/lib/utils';
import type { OutputEntry as OutputEntryType } from '@/types/claudeCode';

interface OutputEntryProps {
  entry: OutputEntryType;
}

function getEntryPrefix(entry: OutputEntryType): string {
  switch (entry.type) {
    case 'user':
      return 'You:';
    case 'assistant':
      return 'Claude:';
    case 'system':
      return 'System:';
    case 'error':
      return 'Error:';
    case 'info':
      return '';
    case 'tool':
      return entry.metadata?.verb
        ? `🔧 ${entry.metadata.verb}`
        : `🔧 Tool: ${entry.metadata?.toolName || 'Unknown'}`;
    case 'event':
      return `📡 Event: ${entry.metadata?.eventType || 'Unknown'}`;
    default:
      return '';
  }
}

export function OutputEntry({ entry }: OutputEntryProps) {
  const prefix = getEntryPrefix(entry);

  return (
    <div
      className={cn(
        'p-3 rounded-lg text-sm',
        entry.type === 'user' && 'bg-primary/10 border-l-4 border-primary',
        entry.type === 'assistant' && 'bg-muted border-l-4 border-green-500',
        entry.type === 'system' && 'bg-muted/50 border-l-4 border-muted-foreground text-xs',
        entry.type === 'error' && 'bg-destructive/10 border-l-4 border-destructive text-destructive',
        entry.type === 'info' && 'bg-transparent text-muted-foreground text-xs text-center py-1',
        entry.type === 'tool' && 'bg-blue-50 dark:bg-blue-950/20 border-l-4 border-blue-500 text-xs',
        entry.type === 'event' && 'bg-purple-50 dark:bg-purple-950/20 border-l-4 border-purple-500 text-xs'
      )}
    >
      {prefix && (
        <span className="font-semibold block mb-1">{prefix}</span>
      )}
      <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed m-0">
        {entry.content}
      </pre>
    </div>
  );
}
