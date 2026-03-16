import { useState, useEffect } from 'react';
import { Task, TaskStatus } from '@/hooks/useSharedTasks';
import { useTaskCollaboration } from '@/hooks/useTaskCollaboration';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuth } from '@/hooks/useAuth';
import { flowApiService } from '@/services/flowApiService';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Users,
  Eye,
  EyeOff,
  MessageSquare,
  Plus,
  Trash2,
  UserPlus,
  UserMinus,
  UserCheck,
  UserX,
  ChevronRight,
  ChevronDown,
  Check,
  Calendar,
  Terminal,
} from 'lucide-react';
import { useClaudeCode } from '@/contexts/ClaudeCodeContext';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';

interface Profile {
  id: string;
  display_name: string;
}

interface TaskDetailDialogProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddSubtask: (parentId: string, title: string) => void;
  onToggleTask: (id: string, isCompleted: boolean) => void;
  onDeleteTask: (id: string) => void;
  subtasks: Task[];
  guestName?: string;
  teamId?: string | null;
  onAssignTask?: (id: string, userId: string | null, assignedTo: string | null) => void;
  onUpdateDueDate?: (id: string, dueDate: string | null) => void;
}

export function TaskDetailDialog({
  task,
  open,
  onOpenChange,
  onAddSubtask,
  onToggleTask,
  onDeleteTask,
  subtasks,
  guestName,
  teamId,
  onAssignTask,
  onUpdateDueDate,
}: TaskDetailDialogProps) {
  const { user, profile } = useAuth();
  const {
    collaborators,
    watchers,
    updateRequests,
    toggleWatching,
    isWatching,
    requestUpdate,
    resolveRequest,
    joinTask,
    leaveTask,
    isCollaborator,
  } = useTaskCollaboration(task?.id, teamId);
  const { createNotification } = useNotifications(guestName, teamId);
  const { askAboutTask } = useClaudeCode();

  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [updateMessage, setUpdateMessage] = useState('');
  const [showUpdateInput, setShowUpdateInput] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [expandedSubtasks, setExpandedSubtasks] = useState<Set<string>>(new Set());

  // Fetch profiles for displaying names via API
  useEffect(() => {
    if (!teamId) return;
    
    const fetchProfiles = async () => {
      try {
        const data = await flowApiService.getProfiles();
        setProfiles(data.map(p => ({
          id: p.id,
          display_name: p.displayName,
        })));
      } catch (error) {
        console.error('Error fetching profiles:', error);
      }
    };
    fetchProfiles();
    
    // Poll for updates every 30 seconds
    const interval = setInterval(fetchProfiles, 30000);
    return () => clearInterval(interval);
  }, [teamId]);

  if (!task) return null;

  const getDisplayName = (userId: string | null, guestNameValue: string | null) => {
    if (userId) {
      const p = profiles.find(p => p.id === userId);
      return p?.display_name || 'Unknown';
    }
    return guestNameValue || 'Guest';
  };

  const handleAddSubtask = () => {
    if (newSubtaskTitle.trim()) {
      onAddSubtask(task.id, newSubtaskTitle.trim());
      setNewSubtaskTitle('');
      
      // Notify watchers
      watchers.forEach(w => {
        if (w.user_id !== user?.id && w.guest_name !== guestName) {
          createNotification(
            w.user_id,
            w.guest_name,
            'subtask_added',
            `New subtask added to "${task.title}"`,
            task.id
          );
        }
      });
    }
  };

  const handleRequestUpdate = () => {
    if (task.id) {
      requestUpdate(task.id, updateMessage || undefined, guestName);
      setUpdateMessage('');
      setShowUpdateInput(false);
      
      // Notify task owner
      if (task.user_id || task.assigned_to) {
        createNotification(
          task.user_id,
          !task.user_id ? task.assigned_to : null,
          'update_request',
          `${profile?.display_name || guestName || 'Someone'} requested an update on "${task.title}"`,
          task.id
        );
      }
    }
  };

  const handleJoinTask = () => {
    joinTask(task.id, guestName);
    
    // Notify task owner
    if (task.user_id || task.assigned_to) {
      createNotification(
        task.user_id,
        !task.user_id ? task.assigned_to : null,
        'collaborator_joined',
        `${profile?.display_name || guestName || 'Someone'} joined your task "${task.title}"`,
        task.id
      );
    }
  };

  const handleLeaveTask = () => {
    leaveTask(task.id, guestName);
  };

  const handleAssignToMe = () => {
    if (onAssignTask) {
      onAssignTask(task.id, user?.id || null, profile?.display_name || guestName || null);
    }
  };

  const handleUnassign = () => {
    if (onAssignTask) {
      onAssignTask(task.id, null, null);
    }
  };

  const toggleSubtaskExpanded = (id: string) => {
    setExpandedSubtasks(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const directSubtasks = subtasks.filter(s => s.parent_task_id === task.id);
  const watching = isWatching(guestName);
  const amCollaborator = isCollaborator(guestName);
  const isOwner = (user && task.user_id === user.id) || (!user && task.assigned_to === guestName);
  const isUnassigned = !task.user_id && !task.assigned_to;
  const hasOwner = task.user_id || task.assigned_to;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Checkbox
              checked={task.is_completed}
              onCheckedChange={() => {
                const wasCompleted = task.is_completed;
                onToggleTask(task.id, task.is_completed);
                
                // If completing the task, notify watchers
                if (!wasCompleted) {
                  watchers.forEach(w => {
                    if (w.user_id !== user?.id && w.guest_name !== guestName) {
                      createNotification(
                        w.user_id,
                        w.guest_name,
                        'task_completed',
                        `"${task.title}" has been completed`,
                        task.id
                      );
                    }
                  });
                }
              }}
            />
            <span className={cn(task.is_completed && 'line-through text-muted-foreground')}>
              {task.title}
            </span>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6 pb-4">
            {/* Task info */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{task.status.replace('_', ' ')}</Badge>
              {task.assigned_to && (
                <Badge variant="secondary">{task.assigned_to}</Badge>
              )}
              {isUnassigned && (
                <Badge variant="outline" className="text-amber-600 border-amber-600">Shared Pool</Badge>
              )}
              {task.pomodoro_count > 0 && (
                <Badge variant="outline" className="text-red-500 border-red-500">
                  🍅 {task.pomodoro_count} pomodoro{task.pomodoro_count !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>

            {/* Due Date */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">Due Date:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Calendar className="w-4 h-4" />
                    {task.due_date ? format(new Date(task.due_date), 'MMM d, yyyy') : 'Set due date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={task.due_date ? new Date(task.due_date) : undefined}
                    onSelect={(date) => {
                      if (onUpdateDueDate) {
                        onUpdateDueDate(task.id, date ? date.toISOString() : null);
                      }
                    }}
                    initialFocus
                  />
                  {task.due_date && (
                    <div className="p-2 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-destructive"
                        onClick={() => onUpdateDueDate?.(task.id, null)}
                      >
                        Clear due date
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant={watching ? "default" : "outline"}
                size="sm"
                onClick={() => toggleWatching(task.id, guestName)}
              >
                {watching ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                {watching ? 'Unwatch' : 'Watch'}
              </Button>

              {/* Show "Collaborate" when someone else owns the task */}
              {hasOwner && !isOwner && !amCollaborator && (
                <Button variant="outline" size="sm" onClick={handleJoinTask}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Collaborate
                </Button>
              )}

              {/* Show "Leave Task" when you're a collaborator but not the owner */}
              {amCollaborator && !isOwner && (
                <Button variant="outline" size="sm" onClick={handleLeaveTask}>
                  <UserMinus className="w-4 h-4 mr-2" />
                  Leave Task
                </Button>
              )}

              {/* Show "Assign to Me" only for unassigned (shared pool) tasks */}
              {isUnassigned && onAssignTask && (
                <Button variant="outline" size="sm" onClick={handleAssignToMe}>
                  <UserCheck className="w-4 h-4 mr-2" />
                  Assign to Me
                </Button>
              )}

              {/* Show "Unassign" (move to shared pool) when you own the task */}
              {isOwner && onAssignTask && (
                <Button variant="outline" size="sm" onClick={handleUnassign}>
                  <UserX className="w-4 h-4 mr-2" />
                  Unassign
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowUpdateInput(!showUpdateInput)}
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Request Update
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  askAboutTask(task);
                  onOpenChange(false); // Close dialog when opening Claude panel
                }}
              >
                <Terminal className="w-4 h-4 mr-2" />
                Ask Claude
              </Button>
            </div>

            {/* Update request input */}
            {showUpdateInput && (
              <div className="flex gap-2">
                <Textarea
                  placeholder="Add a message (optional)..."
                  value={updateMessage}
                  onChange={(e) => setUpdateMessage(e.target.value)}
                  className="min-h-[80px]"
                />
                <Button onClick={handleRequestUpdate} className="self-end">
                  Send
                </Button>
              </div>
            )}

            <Separator />

            {/* Collaborators */}
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Collaborators ({collaborators.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {collaborators.map((c) => (
                  <Badge key={c.id} variant="secondary">
                    {getDisplayName(c.user_id, c.guest_name)}
                  </Badge>
                ))}
                {collaborators.length === 0 && (
                  <span className="text-sm text-muted-foreground">No collaborators yet</span>
                )}
              </div>
            </div>

            {/* Watchers */}
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Watchers ({watchers.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {watchers.map((w) => (
                  <Badge key={w.id} variant="outline">
                    {getDisplayName(w.user_id, w.guest_name)}
                  </Badge>
                ))}
                {watchers.length === 0 && (
                  <span className="text-sm text-muted-foreground">No watchers yet</span>
                )}
              </div>
            </div>

            <Separator />

            {/* Update Requests */}
            {updateRequests.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Update Requests</h4>
                <div className="space-y-2">
                  {updateRequests.filter(r => !r.is_resolved).map((request) => (
                    <div
                      key={request.id}
                      className="p-3 bg-secondary/50 rounded-lg flex items-start justify-between gap-2"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {getDisplayName(request.requested_by_user_id, request.requested_by_guest)}
                        </p>
                        {request.message && (
                          <p className="text-sm text-muted-foreground">{request.message}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      {(isOwner || isCollaborator) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => resolveRequest(request.id)}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Subtasks */}
            <div>
              <h4 className="text-sm font-medium mb-3">Subtasks ({directSubtasks.length})</h4>
              
              {/* Add subtask input */}
              <div className="flex gap-2 mb-3">
                <Input
                  placeholder="Add a subtask..."
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddSubtask()}
                />
                <Button size="icon" onClick={handleAddSubtask} disabled={!newSubtaskTitle.trim()}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              {/* Subtask list */}
              <div className="space-y-1">
                {directSubtasks.map((subtask) => (
                  <SubtaskItem
                    key={subtask.id}
                    subtask={subtask}
                    allSubtasks={subtasks}
                    onToggle={onToggleTask}
                    onDelete={onDeleteTask}
                    onAddSubtask={onAddSubtask}
                    expanded={expandedSubtasks.has(subtask.id)}
                    onToggleExpand={() => toggleSubtaskExpanded(subtask.id)}
                    depth={0}
                  />
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

interface SubtaskItemProps {
  subtask: Task;
  allSubtasks: Task[];
  onToggle: (id: string, isCompleted: boolean) => void;
  onDelete: (id: string) => void;
  onAddSubtask: (parentId: string, title: string) => void;
  expanded: boolean;
  onToggleExpand: () => void;
  depth: number;
}

function SubtaskItem({
  subtask,
  allSubtasks,
  onToggle,
  onDelete,
  onAddSubtask,
  expanded,
  onToggleExpand,
  depth,
}: SubtaskItemProps) {
  const [showAddInput, setShowAddInput] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const children = allSubtasks.filter(s => s.parent_task_id === subtask.id);
  const hasChildren = children.length > 0;

  const handleAdd = () => {
    if (newTitle.trim()) {
      onAddSubtask(subtask.id, newTitle.trim());
      setNewTitle('');
      setShowAddInput(false);
    }
  };

  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div className="group flex items-center gap-2 py-1.5 px-2 rounded hover:bg-secondary/50">
        {hasChildren ? (
          <button onClick={onToggleExpand} className="p-0.5">
            {expanded ? (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )}
          </button>
        ) : (
          <div className="w-4" />
        )}
        
        <Checkbox
          checked={subtask.is_completed}
          onCheckedChange={() => onToggle(subtask.id, subtask.is_completed)}
          className="h-4 w-4"
        />
        
        <span className={cn(
          'flex-1 text-sm',
          subtask.is_completed && 'line-through text-muted-foreground'
        )}>
          {subtask.title}
        </span>
        
        <div className="opacity-0 group-hover:opacity-100 flex gap-1">
          <button
            onClick={() => setShowAddInput(!showAddInput)}
            className="p-1 hover:bg-secondary rounded"
          >
            <Plus className="w-3 h-3" />
          </button>
          <button
            onClick={() => onDelete(subtask.id)}
            className="p-1 hover:bg-destructive/10 hover:text-destructive rounded"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {showAddInput && (
        <div className="flex gap-2 mt-1" style={{ marginLeft: 24 }}>
          <Input
            placeholder="Add nested subtask..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="h-7 text-sm"
          />
          <Button size="sm" className="h-7" onClick={handleAdd}>Add</Button>
        </div>
      )}

      {expanded && children.map((child) => (
        <SubtaskItem
          key={child.id}
          subtask={child}
          allSubtasks={allSubtasks}
          onToggle={onToggle}
          onDelete={onDelete}
          onAddSubtask={onAddSubtask}
          expanded={false}
          onToggleExpand={() => {}}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}
