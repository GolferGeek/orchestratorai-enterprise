import { useState, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';
import type { Sprint } from '@/hooks/useSprints';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Calendar as CalendarIcon, Plus, List } from 'lucide-react';
import { format, differenceInDays, addDays } from 'date-fns';

interface SprintColumnProps {
  taskCount: number;
  children: ReactNode;
  onAddTask?: (title: string) => void;
  isOwnBoard?: boolean;
  teamId?: string | null;
  sprints: Sprint[];
  selectedSprint: Sprint | null;
  loadingSprints?: boolean;
  onSelectSprint: (sprintId: string) => void;
  onCreateSprint: (
    name: string,
    startDate: string,
    endDate: string,
  ) => Promise<Sprint | null> | Sprint | null;
  onUpdateSprint: (
    id: string,
    updates: Partial<Pick<Sprint, 'name' | 'start_date' | 'end_date'>>,
  ) => void;
}

export function SprintColumn({
  taskCount,
  children,
  onAddTask,
  isOwnBoard = true,
  teamId,
  sprints,
  selectedSprint,
  loadingSprints = false,
  onSelectSprint,
  onCreateSprint,
  onUpdateSprint,
}: SprintColumnProps) {
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [hasAutoCreated, setHasAutoCreated] = useState(false);
  const [showSprintModal, setShowSprintModal] = useState(false);
  const [newSprintName, setNewSprintName] = useState('');
  const [newSprintStart, setNewSprintStart] = useState('');
  const [newSprintEnd, setNewSprintEnd] = useState('');

  const { setNodeRef, isOver, active } = useDroppable({
    id: 'sprint',
    data: {
      type: 'column',
      columnId: 'sprint',
    },
  });

  // Auto-create a default sprint if none exists (after loading is complete)
  useEffect(() => {
    if (!teamId) return; // Don't auto-create if no teamId
    if (!loadingSprints && !selectedSprint && !hasAutoCreated) {
      setHasAutoCreated(true);
      const now = new Date();
      const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      onCreateSprint('Sprint', now.toISOString(), twoWeeksLater.toISOString());
    }
  }, [teamId, loadingSprints, selectedSprint, hasAutoCreated, onCreateSprint]);

  const daysRemaining = selectedSprint
    ? differenceInDays(new Date(selectedSprint.end_date), new Date())
    : 0;

  const handleAddTask = () => {
    if (newTaskTitle.trim() && onAddTask) {
      onAddTask(newTaskTitle.trim());
      setNewTaskTitle('');
    }
  };

  const handleCreateSprint = async () => {
    if (!newSprintName.trim() || !newSprintStart || !newSprintEnd) return;

    const created = await onCreateSprint(
      newSprintName.trim(),
      new Date(newSprintStart).toISOString(),
      new Date(newSprintEnd).toISOString(),
    );
    if (created) {
      onSelectSprint(created.id);
      setNewSprintName('');
      setNewSprintStart('');
      setNewSprintEnd('');
    }
  };

  const handleGenerateNextSprints = async () => {
    if (!selectedSprint?.end_date) return;

    let cursor = new Date(selectedSprint.end_date);
    const baseNumber = sprints.length;

    for (let i = 0; i < 4; i += 1) {
      const startDate = addDays(cursor, 1);
      const endDate = addDays(startDate, 13);
      const created = await onCreateSprint(
        `Sprint ${baseNumber + i + 1}`,
        startDate.toISOString(),
        endDate.toISOString(),
      );
      if (created && i === 0) {
        onSelectSprint(created.id);
      }
      cursor = endDate;
    }
  };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-shrink-0 w-72 bg-primary/5 border border-primary/20 rounded-lg p-3 flex flex-col transition-all duration-200',
        isOver && 'ring-2 ring-primary bg-primary/20 scale-[1.02]',
        active && !isOver && 'opacity-90'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-medium text-sm text-primary">Sprint</h3>
          <Select
            value={selectedSprint?.id}
            onValueChange={(value) => onSelectSprint(value)}
          >
            <SelectTrigger className="h-7 w-[170px] text-xs">
              <SelectValue placeholder="Select sprint" />
            </SelectTrigger>
            <SelectContent>
              {sprints.map((sprint) => (
                <SelectItem key={sprint.id} value={sprint.id}>
                  {sprint.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setShowSprintModal(true)}
            title="Manage sprints"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
        <span className="text-xs text-muted-foreground bg-primary/10 px-2 py-0.5 rounded-full">
          {taskCount}
        </span>
      </div>
      
      {/* Sprint dates - directly editable */}
      {selectedSprint && (
        <div className="mb-3 space-y-1">
          <div className="flex items-center gap-1">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1">
                  <CalendarIcon className="h-3 w-3" />
                  {format(new Date(selectedSprint.start_date), 'MMM d')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={new Date(selectedSprint.start_date)}
                  onSelect={(date) =>
                    date &&
                    onUpdateSprint(selectedSprint.id, {
                      start_date: date.toISOString(),
                    })
                  }
                />
              </PopoverContent>
            </Popover>
            <span className="text-xs text-muted-foreground">-</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1">
                  <CalendarIcon className="h-3 w-3" />
                  {format(new Date(selectedSprint.end_date), 'MMM d')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={new Date(selectedSprint.end_date)}
                  onSelect={(date) =>
                    date &&
                    onUpdateSprint(selectedSprint.id, {
                      end_date: date.toISOString(),
                    })
                  }
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className={cn(
            "text-xs font-medium",
            daysRemaining < 0 ? "text-destructive" :
            daysRemaining <= 2 ? "text-orange-500" :
            "text-muted-foreground"
          )}>
            {daysRemaining < 0 
              ? `${Math.abs(daysRemaining)} days overdue`
              : daysRemaining === 0 
                ? 'Ends today'
                : `${daysRemaining} days left`
            }
          </div>
        </div>
      )}

      {/* Add task input - before tasks */}
      {isOwnBoard && onAddTask && (
        <div className="mb-3 pb-3 border-b border-border">
          <div className="flex gap-2">
            <Input
              placeholder="Add task..."
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddTask();
                }
              }}
              className="h-8 text-sm"
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              onClick={handleAddTask}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Tasks */}
      <div className="flex-1 overflow-y-auto min-h-[150px]">{children}</div>

      <Dialog open={showSprintModal} onOpenChange={setShowSprintModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sprint Manager</DialogTitle>
            <DialogDescription>
              Create, select, and plan upcoming sprints.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium mb-2">Sprints</div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {sprints.map((sprint) => (
                  <button
                    key={sprint.id}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded border text-sm',
                      selectedSprint?.id === sprint.id
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:bg-muted',
                    )}
                    onClick={() => onSelectSprint(sprint.id)}
                  >
                    <div className="font-medium">{sprint.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {sprint.start_date
                        ? `${format(new Date(sprint.start_date), 'MMM d')} - ${format(
                            new Date(sprint.end_date),
                            'MMM d',
                          )}`
                        : 'No dates'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Create Sprint</div>
              <Input
                placeholder="Sprint name"
                value={newSprintName}
                onChange={(e) => setNewSprintName(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={newSprintStart}
                  onChange={(e) => setNewSprintStart(e.target.value)}
                />
                <Input
                  type="date"
                  value={newSprintEnd}
                  onChange={(e) => setNewSprintEnd(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreateSprint}>Create Sprint</Button>
                <Button
                  variant="outline"
                  onClick={handleGenerateNextSprints}
                  disabled={!selectedSprint}
                >
                  Generate Next 4
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
