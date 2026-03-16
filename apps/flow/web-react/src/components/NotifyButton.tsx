import { useState } from 'react';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { Button } from '@/components/ui/button';
import { Bell, Check } from 'lucide-react';

export function NotifyButton() {
  const { broadcastNotification } = useNotificationSound();
  const [justNotified, setJustNotified] = useState(false);

  const handleNotify = async () => {
    await broadcastNotification();
    setJustNotified(true);
    setTimeout(() => setJustNotified(false), 2000);
  };

  return (
    <Button
      onClick={handleNotify}
      variant="outline"
      size="lg"
      className={`gap-2 h-14 px-6 text-base border-2 transition-all duration-300 ${
        justNotified
          ? 'border-success bg-success/10 text-success'
          : 'border-accent hover:border-accent hover:bg-accent/10 notify-pulse'
      }`}
      disabled={justNotified}
    >
      {justNotified ? (
        <>
          <Check className="w-5 h-5" />
          Notification Sent!
        </>
      ) : (
        <>
          <Bell className="w-5 h-5" />
          Notify Everyone
        </>
      )}
    </Button>
  );
}
