import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './useAuth';
import { flowApiService, NotificationResponseDto, CreateNotificationDto } from '@/services/flowApiService';

export interface Notification {
  id: string;
  user_id: string | null;
  guest_name: string | null;
  type: string;
  task_id: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
}

// Map API response to Notification interface
function mapNotificationResponse(notif: NotificationResponseDto): Notification {
  return {
    id: notif.id,
    user_id: notif.userId,
    guest_name: notif.guestName,
    type: notif.type,
    task_id: notif.taskId,
    message: notif.message,
    is_read: notif.isRead,
    created_at: notif.createdAt,
  };
}

export function useNotifications(guestName?: string, teamId?: string | null) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const playNotificationSoundRef = useRef<() => void>(() => {});

  // Fetch notifications
  useEffect(() => {
    if (!teamId) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const fetchNotifications = async () => {
      try {
        const data = await flowApiService.getNotifications(teamId, guestName);
        const mapped = data.map(mapNotificationResponse);
        setNotifications(mapped);
        setUnreadCount(mapped.filter(n => !n.is_read).length);
      } catch (error) {
        console.error('Error fetching notifications:', error);
        setNotifications([]);
        setUnreadCount(0);
      }
    };

    fetchNotifications();

    // Poll for updates every 5 seconds (realtime subscriptions removed)
    const interval = setInterval(fetchNotifications, 5000);
    return () => clearInterval(interval);
  }, [user, guestName, teamId]);

  const createNotification = useCallback(async (type: string, message: string, taskId?: string) => {
    if (!teamId) {
      console.error('Cannot create notification: teamId is required');
      return;
    }

    const dto: CreateNotificationDto = {
      userId: user?.id,
      guestName: guestName,
      type,
      taskId: taskId || undefined,
      message,
    };

    try {
      const newNotif = await flowApiService.createNotification(teamId, dto);
      setNotifications(prev => [mapNotificationResponse(newNotif), ...prev]);
      setUnreadCount(prev => prev + 1);
      
      // Play notification sound
      if (playNotificationSoundRef.current) {
        playNotificationSoundRef.current();
      }
    } catch (error) {
      console.error('Error creating notification:', error);
    }
  }, [user, guestName, teamId]);

  const markAsRead = useCallback(async (id: string) => {
    if (!teamId) {
      console.error('Cannot mark notification as read: teamId is required');
      return;
    }

    try {
      await flowApiService.markNotificationsRead(teamId, [id], guestName);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }, [teamId, guestName]);

  const markAllAsRead = useCallback(async () => {
    if (!teamId) {
      console.error('Cannot mark notifications as read: teamId is required');
      return;
    }

    const ids = notifications.filter(n => !n.is_read).map(n => n.id);
    if (ids.length === 0) return;

    try {
      await flowApiService.markNotificationsRead(teamId, ids, guestName);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking notifications as read:', error);
    }
  }, [notifications, teamId, guestName]);

  const setPlayNotificationSound = useCallback((fn: () => void) => {
    playNotificationSoundRef.current = fn;
  }, []);

  return {
    notifications,
    unreadCount,
    createNotification,
    markAsRead,
    markAllAsRead,
    setPlayNotificationSound,
  };
}
