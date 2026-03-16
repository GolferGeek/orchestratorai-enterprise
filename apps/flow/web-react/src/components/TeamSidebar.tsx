import { useState } from 'react';
import { useTeamContext } from '@/contexts/TeamContext';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { 
  User, 
  Users, 
  PanelLeftClose, 
  PanelLeft, 
  Plus, 
  ChevronDown, 
  ChevronRight,
  Settings,
  LogOut as LeaveIcon,
  Lock,
  Globe
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

interface TeamSidebarProps {
  selectedUserId: string | null;
  onSelectUser: (userId: string | null) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function TeamSidebar({ 
  selectedUserId, 
  onSelectUser, 
  collapsed = false, 
  onToggleCollapse 
}: TeamSidebarProps) {
  const { user } = useAuth();
  const { 
    teams, 
    availableTeams,
    currentTeam, 
    setCurrentTeamId,
    createTeam,
    joinTeam,
    leaveTeam,
    updateTeam,
    getTeamMembers,
  } = useTeamContext();

  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [showAvailableTeams, setShowAvailableTeams] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<{ id: string; name: string; is_public: boolean; join_passcode: string | null } | null>(null);
  const [teamToJoin, setTeamToJoin] = useState<{ id: string; name: string; is_public: boolean } | null>(null);
  const [passcode, setPasscode] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDescription, setNewTeamDescription] = useState('');
  const [settingsIsPublic, setSettingsIsPublic] = useState(true);
  const [settingsPasscode, setSettingsPasscode] = useState('');

  const toggleTeamExpanded = (teamId: string) => {
    setExpandedTeams(prev => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
  };

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;

    const { data, error } = await createTeam(newTeamName.trim(), newTeamDescription.trim());
    
    if (error) {
      toast.error('Failed to create team');
    } else if (data) {
      toast.success('Team created successfully');
      setCurrentTeamId(data.id);
      setNewTeamName('');
      setNewTeamDescription('');
      setCreateDialogOpen(false);
    }
  };

  const handleLeaveTeam = async (teamId: string) => {
    const { error } = await leaveTeam(teamId);
    if (error) {
      toast.error('Failed to leave team');
    } else {
      toast.success('Left team successfully');
      // If we left the current team, switch to another
      if (teamId === currentTeam?.id && teams.length > 1) {
        const otherTeam = teams.find(t => t.id !== teamId);
        if (otherTeam) {
          setCurrentTeamId(otherTeam.id);
        }
      }
    }
  };

  const handleJoinTeam = async () => {
    if (!teamToJoin) return;
    
    const { error } = await joinTeam(teamToJoin.id, passcode || undefined);
    if (error) {
      if (error.message === 'Invalid passcode') {
        toast.error('Invalid passcode');
      } else {
        toast.error('Failed to join team');
      }
    } else {
      toast.success('Joined team successfully');
      setCurrentTeamId(teamToJoin.id);
      setJoinDialogOpen(false);
      setTeamToJoin(null);
      setPasscode('');
    }
  };

  const openJoinDialog = (team: { id: string; name: string; is_public: boolean }) => {
    setTeamToJoin(team);
    setPasscode('');
    if (team.is_public) {
      // Public team - join immediately
      joinTeam(team.id).then(({ error }) => {
        if (error) {
          toast.error('Failed to join team');
        } else {
          toast.success('Joined team successfully');
          setCurrentTeamId(team.id);
        }
      });
    } else {
      // Private team - show passcode dialog
      setJoinDialogOpen(true);
    }
  };

  const openTeamSettings = (team: { id: string; name: string; is_public: boolean; join_passcode: string | null }) => {
    setEditingTeam(team);
    setSettingsIsPublic(team.is_public);
    setSettingsPasscode(team.join_passcode || '');
    setSettingsDialogOpen(true);
  };

  const handleSaveTeamSettings = async () => {
    if (!editingTeam) return;
    
    // If making private, require a passcode
    if (!settingsIsPublic && !settingsPasscode.trim()) {
      toast.error('Passcode required for private teams');
      return;
    }

    const { error } = await updateTeam(editingTeam.id, {
      is_public: settingsIsPublic,
      join_passcode: settingsIsPublic ? null : settingsPasscode.trim(),
    });

    if (error) {
      toast.error('Failed to update team settings');
    } else {
      toast.success('Team settings updated');
      setSettingsDialogOpen(false);
      setEditingTeam(null);
    }
  };

  // Online count for current team
  const currentTeamMembers = currentTeam ? getTeamMembers(currentTeam.id) : [];
  const onlineCount = currentTeamMembers.filter(m => m.is_online).length;

  if (collapsed) {
    return (
      <div className="w-12 border-r border-border bg-card/50 flex flex-col">
        <div className="p-2 border-b border-border flex justify-center">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleCollapse}>
            <PanelLeft className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-2 flex flex-col items-center gap-1">
          <div className="text-xs text-muted-foreground">{teams.length}</div>
          <Users className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 border-r border-border bg-card/50 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="font-semibold">Teams</h2>
        </div>
        <div className="flex items-center gap-1">
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Team</DialogTitle>
                <DialogDescription>
                  Create a new team to collaborate with others. You'll be the owner.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Team Name</Label>
                  <Input
                    id="name"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder="My Team"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea
                    id="description"
                    value={newTeamDescription}
                    onChange={(e) => setNewTeamDescription(e.target.value)}
                    placeholder="What is this team for?"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateTeam} disabled={!newTeamName.trim()}>
                  Create Team
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          {/* Join Team Dialog (for passcode entry) */}
          <Dialog open={joinDialogOpen} onOpenChange={(open) => {
            setJoinDialogOpen(open);
            if (!open) {
              setTeamToJoin(null);
              setPasscode('');
            }
          }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Join {teamToJoin?.name}</DialogTitle>
                <DialogDescription>
                  This team requires a passcode to join.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="passcode">Passcode</Label>
                  <Input
                    id="passcode"
                    type="password"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="Enter team passcode"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setJoinDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleJoinTeam} disabled={!passcode.trim()}>
                  Join Team
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          {/* Team Settings Dialog */}
          <Dialog open={settingsDialogOpen} onOpenChange={(open) => {
            setSettingsDialogOpen(open);
            if (!open) setEditingTeam(null);
          }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Team Settings</DialogTitle>
                <DialogDescription>
                  Control who can join your team.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Public Team</Label>
                    <p className="text-sm text-muted-foreground">Anyone can join without a passcode</p>
                  </div>
                  <Switch checked={settingsIsPublic} onCheckedChange={setSettingsIsPublic} />
                </div>
                {!settingsIsPublic && (
                  <div className="grid gap-2">
                    <Label htmlFor="settings-passcode">Join Passcode</Label>
                    <Input
                      id="settings-passcode"
                      value={settingsPasscode}
                      onChange={(e) => setSettingsPasscode(e.target.value)}
                      placeholder="Set a passcode for joining"
                    />
                    <p className="text-xs text-muted-foreground">Share this passcode with people you want to invite.</p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSettingsDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSaveTeamSettings}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleCollapse}>
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* No teams message */}
      {teams.length === 0 && (
        <div className="p-4 text-center text-muted-foreground text-sm">
          <p className="mb-2">You're not in any teams yet.</p>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setCreateDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Your First Team
          </Button>
        </div>
      )}

      {/* Teams list */}
      <div className="flex-1 overflow-y-auto p-2">
        {teams.map((team) => {
          const isExpanded = expandedTeams.has(team.id);
          const isCurrentTeam = currentTeam?.id === team.id;
          const members = getTeamMembers(team.id);
          const memberCount = members.length;

          return (
            <div key={team.id} className="mb-2">
              {/* Team header */}
              <div
                className={cn(
                  'flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors',
                  isCurrentTeam ? 'bg-primary/10 text-primary' : 'hover:bg-secondary'
                )}
              >
                <button
                  onClick={() => toggleTeamExpanded(team.id)}
                  className="p-0.5 hover:bg-secondary rounded"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() => {
                    setCurrentTeamId(team.id);
                    onSelectUser(null);
                  }}
                  className="flex-1 text-left"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-sm">{team.name}</span>
                      {!team.is_public && <Lock className="w-3 h-3 text-muted-foreground" />}
                    </div>
                    <span className="text-xs text-muted-foreground">{memberCount}</span>
                  </div>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <Settings className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => {
                      setCurrentTeamId(team.id);
                      onSelectUser(null);
                    }}>
                      View Team Board
                    </DropdownMenuItem>
                    {team.created_by_user_id === user?.id && (
                      <DropdownMenuItem onClick={() => openTeamSettings({
                        id: team.id,
                        name: team.name,
                        is_public: team.is_public,
                        join_passcode: team.join_passcode
                      })}>
                        <Settings className="h-4 w-4 mr-2" />
                        Team Settings
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => handleLeaveTeam(team.id)}
                    >
                      <LeaveIcon className="h-4 w-4 mr-2" />
                      Leave Team
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Team members (expanded) */}
              {isExpanded && (
                <div className="ml-6 mt-1 space-y-1">
                  {/* All Tasks option */}
                  <button
                    onClick={() => onSelectUser(null)}
                    className={cn(
                      'w-full flex items-center gap-2 p-2 rounded-lg text-left transition-colors text-sm',
                      selectedUserId === null ? 'bg-primary/10 text-primary' : 'hover:bg-secondary'
                    )}
                  >
                    <Users className="w-4 h-4" />
                    <span>All Team Tasks</span>
                  </button>

                  {/* Team members */}
                  {members.map((member) => (
                    <button
                      key={member.id}
                      onClick={() => onSelectUser(member.user_id)}
                      className={cn(
                        'w-full flex items-center gap-2 p-2 rounded-lg text-left transition-colors text-sm',
                        selectedUserId === member.user_id ? 'bg-primary/10 text-primary' : 'hover:bg-secondary'
                      )}
                    >
                      <div className="relative">
                        <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center">
                          <User className="w-3 h-3" />
                        </div>
                        <div
                          className={cn(
                            'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card',
                            member.is_online ? 'bg-green-500' : 'bg-muted'
                          )}
                        />
                      </div>
                      <span className="truncate flex-1">
                        {member.display_name}
                        {member.user_id === user?.id && (
                          <span className="text-muted-foreground"> (you)</span>
                        )}
                      </span>
                      {member.role === 'owner' && (
                        <span className="text-xs text-muted-foreground">owner</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Available Teams Section */}
        {availableTeams.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <button
              onClick={() => setShowAvailableTeams(!showAvailableTeams)}
              className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-secondary transition-colors"
            >
              {showAvailableTeams ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              <span className="text-sm font-medium text-muted-foreground">
                Available Teams ({availableTeams.length})
              </span>
            </button>
            
            {showAvailableTeams && (
              <div className="mt-1 space-y-1">
                {availableTeams.map((team) => (
                  <div
                    key={team.id}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-secondary transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block">{team.name}</span>
                      {team.description && (
                        <span className="text-xs text-muted-foreground truncate block">
                          {team.description}
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openJoinDialog({ id: team.id, name: team.name, is_public: team.is_public })}
                      className="ml-2 h-7 text-xs"
                    >
                      {team.is_public ? 'Join' : 'Request'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
