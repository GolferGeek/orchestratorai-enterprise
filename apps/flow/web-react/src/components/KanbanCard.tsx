import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task } from '@/hooks/useSharedTasks';
import { cn } from '@/lib/utils';
import { getUserColorStyle, getUserColor } from '@/lib/userColors';
import { GripVertical, Trash2, ListTree, Users, UserCheck, ChevronRight, ChevronDown, Calendar } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { TaskProgressBadge } from '@/components/TaskProgressPanel';
import { format, isPast, isToday, isTomorrow } from 'date-fns';

interface KanbanCardProps {
  task: Task;
  onDelete: (id: string) => void;
  onToggle?: (id: string, isCompleted: boolean) => void;
  isOwnBoard?: boolean;
  isOverlay?: boolean;
  onClick?: () => void;
  onProgressClick?: (taskId: string, taskTitle: string) => void;
  subtaskCount?: number;
  collaboratorCount?: number;
  isCollaborated?: boolean;
  subtasks?: Task[];
}

export function KanbanCard({
  task,
  onDelete,
  onToggle,
  isOwnBoard = true,
  isOverlay,
  onClick,
  onProgressClick,
  subtaskCount = 0,
  collaboratorCount = 0,
  isCollaborated = false,
  subtasks = [],
}: KanbanCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    disabled: !isOwnBoard,
    data: {
      type: 'task',
      task,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...getUserColorStyle(task.user_id, task.assigned_to),
  };

  const userColor = getUserColor(task.user_id, task.assigned_to);
  const hasSubtasks = subtasks.length > 0;

  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) return;
    onClick?.();
  };

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const handleSubtaskToggle = (e: React.MouseEvent, subtaskId: string, isCompleted: boolean) => {
    e.stopPropagation();
    onToggle?.(subtaskId, isCompleted);
  };

  return (
    <div className="space-y-1">
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={handleClick}
        className={cn(
          'group bg-card border border-border rounded-lg p-3 transition-all touch-manipulation',
          'hover:shadow-md hover:border-primary/30',
          isDragging && 'opacity-50 shadow-lg scale-105 z-50',
          isOverlay && 'shadow-xl rotate-2 scale-105',
          task.status === 'done' && 'opacity-60',
          isOwnBoard ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
          isCollaborated && 'border-l-4 border-l-blue-500'
        )}
      >
        <div className="flex items-start gap-2">
          {isOwnBoard && (
            <div className="mt-0.5 text-muted-foreground">
              <GripVertical className="w-4 h-4" />
            </div>
          )}
          {hasSubtasks && (
            <button
              onClick={handleExpandClick}
              className="mt-0.5 p-0.5 hover:bg-secondary rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          )}
          <div className="flex-1 min-w-0">
            <p
              className={cn(
                'text-sm font-medium leading-tight',
                task.status === 'done' && 'line-through text-muted-foreground'
              )}
            >
              {task.title}
            </p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {task.assigned_to && (
                <span 
                  className="text-xs px-1.5 py-0.5 rounded-full text-white font-medium"
                  style={{ backgroundColor: userColor.bg }}
                >
                  {task.assigned_to}
                </span>
              )}
              {isCollaborated && (
                <span className="text-xs text-blue-500 flex items-center gap-0.5">
                  <UserCheck className="w-3 h-3" />
                </span>
              )}
              {collaboratorCount > 0 && (
                <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                  <Users className="w-3 h-3" />
                  {collaboratorCount + 1}
                </span>
              )}
              {hasSubtasks && !isExpanded && (
                <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                  <ListTree className="w-3 h-3" />
                  {subtasks.length}
                </span>
              )}
              {task.assigned_to === 'Claude' && (task.status === 'in_progress' || task.status === 'done') && (
                <TaskProgressBadge
                  taskId={task.id}
                  onClick={() => onProgressClick?.(task.id, task.title)}
                />
              )}
              {task.pomodoro_count > 0 && (
                <span className="text-xs text-red-500 flex items-center gap-0.5">
                  🍅 {task.pomodoro_count}
                </span>
              )}
              {task.due_date && (
                <span className={cn(
                  "text-xs flex items-center gap-0.5",
                  isPast(new Date(task.due_date)) && !task.is_completed ? "text-destructive" :
                  isToday(new Date(task.due_date)) ? "text-orange-500" :
                  isTomorrow(new Date(task.due_date)) ? "text-yellow-600" :
                  "text-muted-foreground"
                )}>
                  <Calendar className="w-3 h-3" />
                  {format(new Date(task.due_date), 'MMM d')}
                </span>
              )}
            </div>
          </div>
          {isOwnBoard && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(task.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 hover:text-destructive rounded transition-all"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      
      {/* Inline subtasks */}
      {hasSubtasks && isExpanded && (
        <div className="ml-6 space-y-1 border-l-2 border-muted pl-2">
          {subtasks.map(subtask => (
            <div
              key={subtask.id}
              className={cn(
                "flex items-center gap-2 p-2 rounded bg-background/50 border border-border/50 text-sm",
                subtask.is_completed && "opacity-60"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <Checkbox
                checked={subtask.is_completed}
                onCheckedChange={() => onToggle?.(subtask.id, subtask.is_completed)}
                className="h-3.5 w-3.5"
              />
              <span className={cn(
                "flex-1 truncate",
                subtask.is_completed && "line-through text-muted-foreground"
              )}>
                {subtask.title}
              </span>
              {subtask.pomodoro_count > 0 && (
                <span className="text-xs text-red-500">🍅{subtask.pomodoro_count}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
