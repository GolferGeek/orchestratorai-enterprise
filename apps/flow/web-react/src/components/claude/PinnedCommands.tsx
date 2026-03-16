/**
 * Pinned Commands Component
 *
 * Shows quick access buttons for pinned commands.
 */

import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ClaudeCommand } from '@/types/claudeCode';

interface PinnedCommandsProps {
  pinnedCommands: string[];
  commands: ClaudeCommand[];
  onSelect: (command: string) => void;
  onUnpin: (command: string) => void;
  disabled?: boolean;
}

export function PinnedCommands({
  pinnedCommands,
  commands,
  onSelect,
  onUnpin,
  disabled = false,
}: PinnedCommandsProps) {
  // Map pinned command names to command objects
  const quickCommands = pinnedCommands.map((name) => {
    const cmd = commands.find((c) => c.name === name);
    return cmd || { name, description: '' };
  });

  if (quickCommands.length === 0) {
    return null;
  }

  return (
    <div className="p-3 border-b">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Pinned Commands
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {quickCommands.map((cmd) => (
          <div key={cmd.name} className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-3 font-mono text-xs whitespace-nowrap"
              disabled={disabled}
              onClick={() => onSelect(cmd.name)}
              title={cmd.description}
            >
              {cmd.name}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-yellow-500 hover:text-yellow-600"
              onClick={() => onUnpin(cmd.name)}
              title="Unpin command"
            >
              <Star className="h-4 w-4 fill-current" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
