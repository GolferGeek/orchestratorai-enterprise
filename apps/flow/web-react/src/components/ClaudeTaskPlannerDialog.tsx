import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Bot, Loader2 } from 'lucide-react';
import { flowApiService } from '@/services/flowApiService';

interface ClaudeTaskPlannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  projectId?: string | null;
  sprintId?: string | null;
}

export function ClaudeTaskPlannerDialog({
  open,
  onOpenChange,
  teamId,
  projectId,
  sprintId,
}: ClaudeTaskPlannerDialogProps) {
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!description.trim()) return;

    setLoading(true);
    setError(null);

    try {
      await flowApiService.planClaudeTask(teamId, {
        description: description.trim(),
        projectId: projectId || undefined,
        sprintId: sprintId || undefined,
      });

      setDescription('');
      onOpenChange(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-purple-500" />
            Plan Task with Claude
          </DialogTitle>
          <DialogDescription>
            Describe what you want to accomplish. Claude will break it down into
            a task with subtasks and start working on it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Textarea
            placeholder="Describe what you want Claude to do... (e.g., 'I need to add a user settings page that lets users change their display name, email preferences, and notification settings...')"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={8}
            className="resize-y"
            disabled={loading}
          />

          {error && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              <p className="font-medium">Planning failed</p>
              <p>{error}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !description.trim()}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Claude is planning...
              </>
            ) : (
              <>
                <Bot className="mr-2 h-4 w-4" />
                Plan &amp; Create Task
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
