/**
 * Claude Code Button Component
 *
 * Floating trigger button to open the Claude Code panel.
 * Positioned in the bottom-right corner of the screen.
 */

import { Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ClaudeCodeButtonProps {
  onClick: () => void;
}

export function ClaudeCodeButton({ onClick }: ClaudeCodeButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="default"
          size="icon"
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50"
          onClick={onClick}
        >
          <Terminal className="h-6 w-6" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">
        <p>Open Claude Code Panel</p>
      </TooltipContent>
    </Tooltip>
  );
}
