import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Timer } from '@/components/Timer';
import { TaskPanel } from '@/components/TaskPanel';
import { NotifyButton } from '@/components/NotifyButton';
import { KanbanBoard } from '@/components/KanbanBoard';
import { TeamSidebar } from '@/components/TeamSidebar';
import { NotificationBell } from '@/components/NotificationBell';
import { OnlineUsers } from '@/components/OnlineUsers';
import { MessagesTab } from '@/components/MessagesTab';
import { ClaudeCodeButton, ClaudeCodePanel } from '@/components/claude';
import { DocumentsTab } from '@/components/documents/DocumentsTab';
import { NotebookTab } from '@/components/notebook/NotebookTab';
import { useAuth } from '@/hooks/useAuth';
import { useTeamContext } from '@/contexts/TeamContext';
import { useClaudeCode } from '@/contexts/ClaudeCodeContext';
import { useSharedTasks } from '@/hooks/useSharedTasks';
import { usePartyFoul } from '@/hooks/usePartyFoul';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Clock, LogOut, LayoutGrid, Timer as TimerIcon, MessageSquare, FileText, Cpu, ExternalLink, AppWindow, BookOpen } from 'lucide-react';

const Index = () => {
  const { user, profile, loading, signOut } = useAuth();
  const { currentTeam, currentTeamMembers, teams, loading: teamsLoading } = useTeamContext();
  const { isOpen: claudePanelOpen, open: openClaudePanel, close: closeClaudePanel } = useClaudeCode();
  const { tasks, incrementPomodoro } = useSharedTasks(undefined, undefined, undefined, currentTeam?.id);
  const { checkForPartyFouls } = usePartyFoul(currentTeam?.id);
  const [activeTab, setActiveTab] = useState('timer');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [teamSidebarCollapsed, setTeamSidebarCollapsed] = useState(false);
  const navigate = useNavigate();

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [loading, user, navigate]);

  // Show message if no teams available (user is authenticated but has no teams)
  useEffect(() => {
    if (!loading && !teamsLoading && user && teams.length === 0 && currentTeam === null) {
      console.warn('User is authenticated but has no teams. Teams may not have loaded properly.');
    }
  }, [loading, teamsLoading, user, teams.length, currentTeam]);

  // Increment pomodoro count on all in-progress tasks when focus timer completes
  // Also check for party fouls (users with nothing in progress)
  const handleFocusComplete = useCallback(() => {
    const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
    inProgressTasks.forEach(task => {
      incrementPomodoro(task.id);
    });
    
    // Check for slackers after a brief delay to let task updates settle
    setTimeout(() => {
      checkForPartyFouls();
    }, 500);
  }, [tasks, incrementPomodoro, checkForPartyFouls]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  const selectedMember = currentTeamMembers.find((m) => m.user_id === selectedUserId);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 px-6 py-4 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold text-lg leading-tight">Orch-Flow</h1>
              <p className="text-xs text-muted-foreground">
                {currentTeam ? currentTeam.name : 'No team selected'}
              </p>
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="hidden md:block">
            <TabsList>
              <TabsTrigger value="timer" className="gap-2">
                <TimerIcon className="w-4 h-4" />
                Timer
              </TabsTrigger>
              <TabsTrigger value="kanban" className="gap-2">
                <LayoutGrid className="w-4 h-4" />
                Kanban
              </TabsTrigger>
              <TabsTrigger value="messages" className="gap-2">
                <MessageSquare className="w-4 h-4" />
                Messages
              </TabsTrigger>
              <TabsTrigger value="documents" className="gap-2">
                <FileText className="w-4 h-4" />
                Docs
              </TabsTrigger>
              <TabsTrigger value="notebook" className="gap-2">
                <BookOpen className="w-4 h-4" />
                Notebook
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Auth buttons */}
          <div className="flex items-center gap-4">
            {/* Cross-app navigation */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5">
                  <AppWindow className="w-4 h-4" />
                  <span className="hidden lg:inline text-xs">Apps</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <a href={import.meta.env.VITE_WEB_URL || 'https://app.orchestratorai.io'} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                    <Cpu className="w-4 h-4" />
                    Orchestrator AI
                    <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <OnlineUsers />
            <NotificationBell teamId={currentTeam?.id} />
            {profile && (
              <span className="text-sm text-muted-foreground hidden sm:block">
                {profile.display_name}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>

        {/* Mobile tabs */}
        <div className="md:hidden mt-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full grid grid-cols-5">
              <TabsTrigger value="timer" className="gap-1 text-xs">
                <TimerIcon className="w-3 h-3" />
                Timer
              </TabsTrigger>
              <TabsTrigger value="kanban" className="gap-1 text-xs">
                <LayoutGrid className="w-3 h-3" />
                Kanban
              </TabsTrigger>
              <TabsTrigger value="messages" className="gap-1 text-xs">
                <MessageSquare className="w-3 h-3" />
                Chat
              </TabsTrigger>
              <TabsTrigger value="documents" className="gap-1 text-xs">
                <FileText className="w-3 h-3" />
                Docs
              </TabsTrigger>
              <TabsTrigger value="notebook" className="gap-1 text-xs">
                <BookOpen className="w-3 h-3" />
                AI Q&A
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex">
        {activeTab === 'timer' && (
          <>
            <main className="flex-1 pt-8 pb-8 pr-0 sm:pr-96 flex flex-col items-center justify-center px-6">
              <div className="w-full max-w-md mx-auto flex flex-col items-center gap-10">
                <Timer onFocusComplete={handleFocusComplete} />
                <div className="w-full flex flex-col items-center gap-3">
                  <p className="text-sm text-muted-foreground text-center">
                    Call everyone back to Zoom
                  </p>
                  <NotifyButton />
                </div>
              </div>
            </main>
            <TaskPanel />
          </>
        )}

        {activeTab === 'kanban' && (
          <div className="flex-1 flex">
            <TeamSidebar
              selectedUserId={selectedUserId}
              onSelectUser={setSelectedUserId}
              collapsed={teamSidebarCollapsed}
              onToggleCollapse={() => setTeamSidebarCollapsed(!teamSidebarCollapsed)}
            />
            <main className="flex-1 p-6 overflow-hidden">
              <KanbanBoard
                userId={selectedUserId || undefined}
                userName={selectedMember?.display_name}
                teamId={currentTeam?.id}
              />
            </main>
          </div>
        )}

        {activeTab === 'messages' && (
          <main className="flex-1 p-6 overflow-hidden">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">{currentTeam?.name || 'Team'} Chat</h2>
              <p className="text-sm text-muted-foreground">
                Real-time messaging with your team across different channels
              </p>
            </div>
            <MessagesTab teamId={currentTeam?.id} />
          </main>
        )}

        {activeTab === 'documents' && (
          <main className="flex-1 overflow-hidden">
            <DocumentsTab teamId={currentTeam?.id} />
          </main>
        )}

        {activeTab === 'notebook' && (
          <main className="flex-1 overflow-hidden">
            <NotebookTab />
          </main>
        )}
      </div>

      {/* Claude Code Panel - AI Assistant */}
      <ClaudeCodeButton onClick={openClaudePanel} />
      <ClaudeCodePanel isOpen={claudePanelOpen} onClose={closeClaudePanel} />
    </div>
  );
};

export default Index;
