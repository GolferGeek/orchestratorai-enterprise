import { useTeamPresence } from '@/hooks/useTeamPresence';
import { useTeamContext } from '@/contexts/TeamContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getUserColor } from '@/lib/userColors';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function OnlineUsers() {
  const { currentTeam } = useTeamContext();
  const { teamMembers } = useTeamPresence(currentTeam?.id);
  const onlineMembers = teamMembers.filter(m => m.is_online);

  if (onlineMembers.length === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground mr-1 hidden sm:block">Online:</span>
        <div className="flex -space-x-2">
          {onlineMembers.slice(0, 5).map((member) => {
            const color = getUserColor(member.id, null);
            const initials = member.display_name
              .split(' ')
              .map(n => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2);

            return (
              <Tooltip key={member.id}>
                <TooltipTrigger asChild>
                  <div className="relative">
                    <Avatar className="h-7 w-7 border-2 border-background">
                      <AvatarFallback
                        style={{ backgroundColor: color.bg }}
                        className="text-white text-xs font-medium"
                      >
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 border border-background rounded-full" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-sm">{member.display_name}</p>
                  <p className="text-xs text-muted-foreground">Online</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
          {onlineMembers.length > 5 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Avatar className="h-7 w-7 border-2 border-background">
                  <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                    +{onlineMembers.length - 5}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-sm">{onlineMembers.length - 5} more online</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
