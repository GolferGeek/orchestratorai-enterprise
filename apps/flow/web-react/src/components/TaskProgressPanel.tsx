/**
 * TaskProgressPanel
 *
 * Shows real-time progress of tasks assigned to Claude Code CLI.
 * Connects to the dedicated Flow task events SSE stream.
 * Displays lifecycle events: started, running, completed, failed.
 */

import { useTaskProgress, TaskProgressEvent } from '@/hooks/useTaskProgress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Loader2, CheckCircle2, XCircle, Cpu, Radio, Brain, MessageSquare, Terminal, Wrench } from 'lucide-react';
import { format } from 'date-fns';

interface TaskProgressPanelProps {
  taskId: string;
  taskTitle: string;
  className?: string;
  expanded?: boolean;
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Cpu className="h-4 w-4 text-muted-foreground" />;
  }
}

function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'running':
      return 'default';
    case 'completed':
      return 'secondary';
    case 'failed':
      return 'destructive';
    default:
      return 'outline';
  }
}

/**
 * Get an icon based on the event type (what kind of event)
 * rather than the status (running/completed/failed).
 */
function getEventTypeIcon(eventType: string, isLatest: boolean) {
  switch (eventType) {
    case 'thinking':
      return isLatest
        ? <Brain className="h-4 w-4 animate-pulse text-purple-500" />
        : <Brain className="h-4 w-4 text-purple-400" />;
    case 'assistant':
      return <MessageSquare className="h-4 w-4 text-green-500" />;
    case 'tool_use':
      return isLatest
        ? <Terminal className="h-4 w-4 animate-spin text-blue-500" />
        : <Terminal className="h-4 w-4 text-blue-400" />;
    case 'tool_result':
      return <Wrench className="h-4 w-4 text-slate-500" />;
    default:
      return null; // Fall back to status-based icon
  }
}

function EventItem({ event, isLatest }: { event: TaskProgressEvent; isLatest: boolean }) {
  const time = format(new Date(event.timestamp), 'HH:mm:ss');
  const toolName = event.toolName;
  const eventType = event.eventType;

  // Only the latest event should spin. Prior "running" events are implicitly
  // complete because a newer event has arrived — show a check instead.
  const displayStatus =
    event.status === 'running' && !isLatest ? 'completed' : event.status;

  // Use event-type-specific icon when available, otherwise fall back to status
  const typeIcon = getEventTypeIcon(eventType, isLatest);

  return (
    <div className={cn(
      'flex items-start gap-2 py-1.5',
      eventType === 'thinking' && 'opacity-60',
    )}>
      <span className="text-[11px] text-muted-foreground font-mono mt-0.5 flex-shrink-0">
        {time}
      </span>
      {typeIcon || getStatusIcon(displayStatus)}
      {toolName && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0">
          {toolName}
        </Badge>
      )}
      <span className={cn(
        'text-sm flex-1',
        eventType === 'assistant' && 'text-muted-foreground',
        eventType === 'thinking' && 'text-muted-foreground italic text-xs',
      )}>
        {event.message || event.eventType}
      </span>
    </div>
  );
}

export function TaskProgressPanel({ taskId, taskTitle, className, expanded }: TaskProgressPanelProps) {
  const { events, isConnected, latestStatus, latestMessage } = useTaskProgress(taskId);

  const isTerminal = latestStatus === 'completed' || latestStatus === 'failed';

  return (
    <div className={cn('border border-border rounded-lg bg-card', className)}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Cpu className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-sm font-medium truncate">
            Claude Code: {taskTitle}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isConnected && !isTerminal && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Radio className="h-3 w-3 text-green-500 animate-pulse" />
              Live
            </span>
          )}
          {latestStatus && (
            <Badge variant={getStatusBadgeVariant(latestStatus)} className="text-xs">
              {latestStatus}
            </Badge>
          )}
        </div>
      </div>

      {/* Events List (newest first) */}
      {events.length === 0 ? (
        <div className="px-3 py-4 text-center text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
          Waiting for Claude Code to start...
        </div>
      ) : (
        <ScrollArea className={cn(expanded ? 'h-[50vh]' : 'max-h-40', 'px-3 py-1')}>
          {[...events].reverse().map((event, i) => (
            <EventItem key={events.length - 1 - i} event={event} isLatest={i === 0} />
          ))}
        </ScrollArea>
      )}
    </div>
  );
}

/**
 * Compact inline badge for showing Claude task status on a KanbanCard.
 * Shows a small status indicator without the full event log.
 */
export function TaskProgressBadge({ taskId, onClick }: { taskId: string; onClick?: (e: React.MouseEvent) => void }) {
  const { latestStatus, latestMessage } = useTaskProgress(taskId);

  const stopAll = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.(e);
  };

  if (!latestStatus) {
    return (
      <button
        onClick={handleClick}
        onPointerDown={stopAll}
        className="text-xs text-muted-foreground flex items-center gap-1 hover:opacity-80 cursor-pointer"
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        Starting...
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      onPointerDown={stopAll}
      className="text-xs flex items-center gap-1 hover:opacity-80 cursor-pointer"
      title={latestMessage || undefined}
    >
      {getStatusIcon(latestStatus)}
      <span className={cn(
        latestStatus === 'completed' && 'text-green-600',
        latestStatus === 'failed' && 'text-red-600',
        latestStatus === 'running' && 'text-blue-600',
      )}>
        {latestStatus === 'running' ? 'Working...' : latestStatus}
      </span>
    </button>
  );
}
