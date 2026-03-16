/**
 * TaskProgressDialog
 *
 * Dialog wrapper around TaskProgressPanel for viewing live Claude Code
 * task progress. Opens when clicking a task's progress badge.
 * Closing the dialog does NOT stop Claude — it keeps working.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { TaskProgressPanel } from '@/components/TaskProgressPanel';
import { Cpu } from 'lucide-react';

interface TaskProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string | null;
  taskTitle: string | null;
}

export function TaskProgressDialog({
  open,
  onOpenChange,
  taskId,
  taskTitle,
}: TaskProgressDialogProps) {
  if (!taskId || !taskTitle) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-purple-500" />
            Claude Code Progress
          </DialogTitle>
          <DialogDescription>{taskTitle}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0">
          <TaskProgressPanel
            taskId={taskId}
            taskTitle={taskTitle}
            expanded
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
