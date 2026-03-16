import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface KanbanColumnProps {
  id: string;
  title: string;
  taskCount: number;
  children: ReactNode;
}

export function KanbanColumn({ id, title, taskCount, children }: KanbanColumnProps) {
  const { setNodeRef, isOver, active } = useDroppable({
    id,
    data: {
      type: 'column',
      columnId: id,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-shrink-0 w-72 bg-secondary/30 rounded-lg p-3 flex flex-col transition-all duration-200',
        isOver && 'ring-2 ring-primary bg-primary/10 scale-[1.02]',
        active && !isOver && 'opacity-90'
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-sm">{title}</h3>
        <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
          {taskCount}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto min-h-[150px]">{children}</div>
    </div>
  );
}
