/**
 * Auto Complete Dropdown Component
 *
 * Shows command suggestions when typing / in the input.
 */

import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ClaudeCommand } from '@/types/claudeCode';

interface AutoCompleteDropdownProps {
  commands: ClaudeCommand[];
  selectedIndex: number;
  pinnedCommands: string[];
  onSelect: (command: string) => void;
  onHover: (index: number) => void;
  onTogglePin: (command: string) => void;
}

export function AutoCompleteDropdown({
  commands,
  selectedIndex,
  pinnedCommands,
  onSelect,
  onHover,
  onTogglePin,
}: AutoCompleteDropdownProps) {
  if (commands.length === 0) {
    return null;
  }

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 max-h-60 overflow-y-auto bg-background border rounded-lg shadow-lg z-10">
      {commands.map((cmd, index) => {
        const isPinned = pinnedCommands.includes(cmd.name);

        return (
          <button
            key={cmd.name}
            type="button"
            className={cn(
              'flex items-center justify-between w-full px-3 py-2 text-left transition-colors',
              index === selectedIndex && 'bg-primary/10'
            )}
            onClick={() => onSelect(cmd.name)}
            onMouseEnter={() => onHover(index)}
          >
            <div className="flex flex-col flex-1 min-w-0">
              <span className="font-mono font-semibold text-sm">
                {cmd.name}
              </span>
              <span className="text-xs text-muted-foreground truncate">
                {cmd.description}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-7 w-7 p-0 ml-2 flex-shrink-0',
                isPinned ? 'text-yellow-500' : 'text-muted-foreground hover:text-yellow-500'
              )}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(cmd.name);
              }}
              title={isPinned ? 'Unpin command' : 'Pin command'}
            >
              <Star className={cn('h-4 w-4', isPinned && 'fill-current')} />
            </Button>
          </button>
        );
      })}
    </div>
  );
}
