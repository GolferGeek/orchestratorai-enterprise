import { useState, useEffect, useCallback } from 'react';
import { Task } from '@/hooks/useSharedTasks';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, ListTodo, ChevronRight, ChevronLeft, User, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { flowApiService, SharedTaskResponseDto } from '@/services/flowApiService';

interface Profile {
  id: string;
  display_name: string;
}

// Map API response to Task interface for consistency
function mapResponseToTask(dto: SharedTaskResponseDto): Task {
  return {
    id: dto.id,
    title: dto.title,
    is_completed: dto.isCompleted,
    assigned_to: dto.assignedTo,
    user_id: dto.userId,
    status: dto.status as Task['status'],
    created_at: dto.createdAt,
    parent_task_id: dto.parentTaskId,
    pomodoro_count: dto.pomodoroCount,
    project_id: dto.projectId,
    sprint_id: dto.sprintId,
    due_date: dto.dueDate,
    team_id: dto.teamId,
  };
}

export function TaskPanel() {
  const { user, profile } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [isOpen, setIsOpen] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  // Fetch personal tasks across all teams (in_progress + today + done)
  const fetchMyTasks = useCallback(async () => {
    try {
      const data = await flowApiService.getMyTasks(['in_progress', 'today', 'done']);
      setTasks(data.map(mapResponseToTask));
    } catch (error) {
      console.error('Error fetching my tasks:', error);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMyTasks();
    const interval = setInterval(fetchMyTasks, 5000);
    return () => clearInterval(interval);
  }, [fetchMyTasks]);

  // Toggle task completion via its team
  const toggleTask = useCallback(async (id: string, isCompleted: boolean) => {
    const task = tasks.find(t => t.id === id);
    if (!task?.team_id) return;

    const newStatus = !isCompleted ? 'done' : 'today';
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === id ? { ...t, is_completed: !isCompleted, status: newStatus as Task['status'] } : t));

    try {
      await flowApiService.updateSharedTask(task.team_id, id, {
        isCompleted: !isCompleted,
        status: newStatus as SharedTaskResponseDto['status'],
      });
    } catch (error) {
      console.error('Error toggling task:', error);
      fetchMyTasks();
    }
  }, [tasks, fetchMyTasks]);

  // Delete task via its team
  const deleteTask = useCallback(async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task?.team_id) return;

    setTasks(prev => prev.filter(t => t.id !== id));
    try {
      await flowApiService.deleteSharedTask(task.team_id, id);
    } catch (error) {
      console.error('Error deleting task:', error);
      fetchMyTasks();
    }
  }, [tasks, fetchMyTasks]);

  // Fetch all profiles for displaying names via API
  useEffect(() => {
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
    const interval = setInterval(fetchProfiles, 30000);
    return () => clearInterval(interval);
  }, []);

  const getDisplayName = (task: Task) => {
    // First try to get from profiles using user_id
    if (task.user_id) {
      const taskProfile = profiles.find(p => p.id === task.user_id);
      if (taskProfile) return taskProfile.display_name;
    }
    // Fall back to assigned_to text
    return task.assigned_to;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTaskTitle.trim() && user) {
      const taskAssignedTo = assignedTo.trim() || profile?.display_name || undefined;
      // Add task to first available team - use getMyTasks to refresh after
      // For now, we just refresh tasks after adding via the global my-tasks endpoint
      // The add still needs a teamId, so we pick the first team_id from existing tasks or skip
      const teamId = tasks.find(t => t.team_id)?.team_id;
      if (teamId) {
        flowApiService.createSharedTask(teamId, {
          title: newTaskTitle.trim(),
          status: 'in_progress' as SharedTaskResponseDto['status'],
          assignedTo: taskAssignedTo,
          userId: user.id,
        }).then(() => {
          fetchMyTasks();
        }).catch((error) => {
          console.error('Error adding task:', error);
        });
      }
      setNewTaskTitle('');
      setAssignedTo('');
    }
  };

  const toggleExpanded = (taskId: string) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  // Get subtasks for a task
  const getSubtasks = (parentId: string) => tasks.filter(t => t.parent_task_id === parentId);

  // Show only root tasks (no parent) for main list
  const rootTasks = tasks.filter(t => !t.parent_task_id);
  const activeTasks = rootTasks.filter((t) => t.status === 'in_progress' || t.status === 'today');
  const completedTasks = rootTasks.filter((t) => t.status === 'done');

  return (
    <>
      {/* Toggle button when closed */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed right-0 top-1/2 -translate-y-1/2 bg-card hover:bg-secondary border border-border rounded-l-lg p-3 shadow-lg transition-all z-50"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}

      {/* Side panel */}
      <div
        className={cn(
          'fixed right-0 top-0 h-full w-80 sm:w-96 bg-card border-l border-border shadow-xl transition-transform duration-300 z-40 flex flex-col',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ListTodo className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">My Tasks</h2>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-secondary rounded"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Current user indicator */}
        {profile && (
          <div className="px-4 py-2 bg-primary/5 border-b border-border flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-primary" />
            <span className="text-muted-foreground">Logged in as</span>
            <span className="font-medium">{profile.display_name}</span>
          </div>
        )}

        {/* Add task form */}
        <form onSubmit={handleSubmit} className="p-4 border-b border-border space-y-3">
          <Input
            placeholder="What are you working on?"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            className="bg-background"
          />
          <div className="flex gap-2">
            <Input
              placeholder={profile ? `Assign to (default: ${profile.display_name})` : "Your name (optional)"}
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="bg-background flex-1"
            />
            <Button type="submit" size="icon" disabled={!newTaskTitle.trim()}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </form>

        {/* Tasks list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 bg-secondary rounded-lg animate-pulse"
                />
              ))}
            </div>
          ) : (
            <>
              {/* Active tasks */}
              {activeTasks.length > 0 && (
                <div className="p-4">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                    In Progress ({activeTasks.length})
                  </h3>
                  <div className="space-y-2">
                    {activeTasks.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        displayName={getDisplayName(task)}
                        onToggle={toggleTask}
                        onDelete={deleteTask}
                        subtasks={getSubtasks(task.id)}
                        allTasks={tasks}
                        isExpanded={expandedTasks.has(task.id)}
                        onToggleExpand={() => toggleExpanded(task.id)}
                        getDisplayName={getDisplayName}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Completed tasks */}
              {completedTasks.length > 0 && (
                <div className="p-4 border-t border-border">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                    Done ({completedTasks.length})
                  </h3>
                  <div className="space-y-2">
                    {completedTasks.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        displayName={getDisplayName(task)}
                        onToggle={toggleTask}
                        onDelete={deleteTask}
                        subtasks={getSubtasks(task.id)}
                        allTasks={tasks}
                        isExpanded={expandedTasks.has(task.id)}
                        onToggleExpand={() => toggleExpanded(task.id)}
                        getDisplayName={getDisplayName}
                      />
                    ))}
                  </div>
                </div>
              )}

              {activeTasks.length === 0 && completedTasks.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  <ListTodo className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No tasks yet</p>
                  <p className="text-sm">Add a task to get started</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function TaskItem({
  task,
  displayName,
  onToggle,
  onDelete,
  subtasks,
  allTasks,
  isExpanded,
  onToggleExpand,
  getDisplayName,
  depth = 0,
}: {
  task: Task;
  displayName: string | null;
  onToggle: (id: string, isCompleted: boolean) => void;
  onDelete: (id: string) => void;
  subtasks: Task[];
  allTasks: Task[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  getDisplayName: (task: Task) => string | null;
  depth?: number;
}) {
  const hasSubtasks = subtasks.length > 0;
  const getChildSubtasks = (parentId: string) => allTasks.filter(t => t.parent_task_id === parentId);

  return (
    <div className={cn(depth > 0 && "ml-4 border-l-2 border-muted pl-2")}>
      <div
        className={cn(
          'group flex items-start gap-2 p-2 rounded-lg bg-background border border-border transition-all',
          task.is_completed && 'opacity-60',
          depth === 0 && 'slide-in-right'
        )}
      >
        {hasSubtasks ? (
          <button
            onClick={onToggleExpand}
            className="p-0.5 hover:bg-secondary rounded mt-0.5"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        ) : (
          <div className="w-5" />
        )}
        <Checkbox
          checked={task.is_completed}
          onCheckedChange={() => onToggle(task.id, task.is_completed)}
          className="mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              'text-sm font-medium leading-tight',
              task.is_completed && 'line-through text-muted-foreground'
            )}
          >
            {task.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {displayName && (
              <span className="text-xs text-muted-foreground">
                {displayName}
              </span>
            )}
            {task.pomodoro_count > 0 && (
              <span className="text-xs text-red-500">
                {task.pomodoro_count}
              </span>
            )}
            {hasSubtasks && !isExpanded && (
              <span className="text-xs text-muted-foreground">
                ({subtasks.length} subtask{subtasks.length !== 1 ? 's' : ''})
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => onDelete(task.id)}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 hover:text-destructive rounded transition-all"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Subtasks */}
      {hasSubtasks && isExpanded && (
        <div className="mt-1 space-y-1">
          {subtasks.map(subtask => (
            <TaskItem
              key={subtask.id}
              task={subtask}
              displayName={getDisplayName(subtask)}
              onToggle={onToggle}
              onDelete={onDelete}
              subtasks={getChildSubtasks(subtask.id)}
              allTasks={allTasks}
              isExpanded={false}
              onToggleExpand={() => {}}
              getDisplayName={getDisplayName}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
