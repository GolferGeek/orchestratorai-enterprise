import { useState, useRef, useEffect } from 'react';
import { useChannelMessages, ChannelMessage } from '@/hooks/useChannelMessages';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Hash, Plus, Send, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { getUserColor } from '@/lib/userColors';

interface MessagesTabProps {
  teamId?: string | null;
}

export const MessagesTab = ({ teamId }: MessagesTabProps) => {
  const { user, profile } = useAuth();
  const {
    channels,
    messages,
    activeChannelId,
    setActiveChannelId,
    loading,
    sendMessage,
    createChannel,
    deleteChannel,
  } = useChannelMessages(teamId);

  const [newMessage, setNewMessage] = useState('');
  const [guestName, setGuestName] = useState('');
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDescription, setNewChannelDescription] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    await sendMessage(newMessage, guestName || undefined);
    setNewMessage('');
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;

    const channel = await createChannel(newChannelName, newChannelDescription);
    if (channel) {
      setActiveChannelId(channel.id);
      setNewChannelName('');
      setNewChannelDescription('');
      setIsCreateDialogOpen(false);
    }
  };

  const activeChannel = channels.find((c) => c.id === activeChannelId);

  const getMessageSender = (message: ChannelMessage) => {
    if (message.profile?.display_name) return message.profile.display_name;
    if (message.guest_name) return message.guest_name;
    return 'Unknown';
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <div className="animate-pulse text-muted-foreground">Loading messages...</div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-200px)] border border-border rounded-lg overflow-hidden bg-card">
      {/* Channel Sidebar */}
      <div className="w-60 border-r border-border flex flex-col bg-muted/30">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm">Channels</h3>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Channel</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateChannel} className="space-y-4">
                <div>
                  <Input
                    placeholder="Channel name"
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                  />
                </div>
                <div>
                  <Input
                    placeholder="Description (optional)"
                    value={newChannelDescription}
                    onChange={(e) => setNewChannelDescription(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full">
                  Create Channel
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {channels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => setActiveChannelId(channel.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors group ${
                  activeChannelId === channel.id
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                <Hash className="h-4 w-4 flex-shrink-0" />
                <span className="truncate flex-1 text-left">{channel.name}</span>
                {channels.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteChannel(channel.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Messages Area */}
      <div className="flex-1 flex flex-col">
        {/* Channel Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Hash className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-semibold">{activeChannel?.name || 'Select a channel'}</h2>
          </div>
          {activeChannel?.description && (
            <p className="text-sm text-muted-foreground mt-1">{activeChannel.description}</p>
          )}
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <p>No messages yet.</p>
                <p className="text-sm">Be the first to say something!</p>
              </div>
            ) : (
              messages.map((message) => {
                const senderName = getMessageSender(message);
                const colorObj = getUserColor(message.user_id || null, message.guest_name || null);
                const isCurrentUser =
                  (user && message.user_id === user.id) ||
                  (!user && message.guest_name === guestName);

                return (
                  <div key={message.id} className="flex gap-3 group">
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarFallback
                        style={{ backgroundColor: colorObj.bg }}
                        className="text-white text-xs"
                      >
                        {getInitials(senderName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span
                          className="font-medium text-sm"
                          style={{ color: isCurrentUser ? undefined : colorObj.bg }}
                        >
                          {senderName}
                          {isCurrentUser && ' (you)'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(message.created_at), 'MMM d, h:mm a')}
                        </span>
                      </div>
                      <p className="text-sm mt-0.5 break-words">{message.content}</p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Message Input */}
        <form onSubmit={handleSendMessage} className="p-4 border-t border-border">
          {!user && !guestName && (
            <div className="mb-3">
              <Input
                placeholder="Enter your name to chat..."
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="text-sm"
              />
            </div>
          )}
          <div className="flex gap-2">
            <Input
              placeholder={`Message #${activeChannel?.name || 'channel'}...`}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              disabled={!user && !guestName}
              className="flex-1"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!newMessage.trim() || (!user && !guestName)}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
