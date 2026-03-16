import { useState, useEffect, useCallback } from 'react';
import { flowApiService } from '@/services/flowApiService';
import { useAuth } from './useAuth';

export interface Collaborator {
  id: string;
  task_id: string;
  user_id: string | null;
  guest_name: string | null;
  joined_at: string;
}

export interface Watcher {
  id: string;
  task_id: string;
  user_id: string | null;
  guest_name: string | null;
  created_at: string;
}

export interface UpdateRequest {
  id: string;
  task_id: string;
  requested_by_user_id: string | null;
  requested_by_guest: string | null;
  message: string | null;
  created_at: string;
  is_resolved: boolean;
}

// Map API response to Collaborator interface
function mapCollaboratorResponse(api: {
  id: string;
  taskId: string;
  userId: string | null;
  guestName: string | null;
  joinedAt: string;
}): Collaborator {
  return {
    id: api.id,
    task_id: api.taskId,
    user_id: api.userId,
    guest_name: api.guestName,
    joined_at: api.joinedAt,
  };
}

// Map API response to Watcher interface
function mapWatcherResponse(api: {
  id: string;
  taskId: string;
  userId: string | null;
  guestName: string | null;
  createdAt: string;
}): Watcher {
  return {
    id: api.id,
    task_id: api.taskId,
    user_id: api.userId,
    guest_name: api.guestName,
    created_at: api.createdAt,
  };
}

// Map API response to UpdateRequest interface
function mapUpdateRequestResponse(api: {
  id: string;
  taskId: string;
  requestedByUserId: string | null;
  requestedByGuest: string | null;
  message: string | null;
  createdAt: string;
  isResolved: boolean;
}): UpdateRequest {
  return {
    id: api.id,
    task_id: api.taskId,
    requested_by_user_id: api.requestedByUserId,
    requested_by_guest: api.requestedByGuest,
    message: api.message,
    created_at: api.createdAt,
    is_resolved: api.isResolved,
  };
}

export function useTaskCollaboration(taskId?: string, teamId?: string | null) {
  const { user, profile } = useAuth();
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [watchers, setWatchers] = useState<Watcher[]>([]);
  const [updateRequests, setUpdateRequests] = useState<UpdateRequest[]>([]);

  // Fetch collaborators, watchers, and update requests
  useEffect(() => {
    if (!taskId || !teamId) {
      setCollaborators([]);
      setWatchers([]);
      setUpdateRequests([]);
      return;
    }

    const fetchData = async () => {
      try {
        const [collabData, watchData, requestData] = await Promise.all([
          flowApiService.getTaskCollaborators(teamId, taskId),
          flowApiService.getTaskWatchers(teamId, taskId),
          flowApiService.getTaskUpdateRequests(teamId, taskId),
        ]);

        setCollaborators(collabData.map(mapCollaboratorResponse));
        setWatchers(watchData.map(mapWatcherResponse));
        setUpdateRequests(requestData.map(mapUpdateRequestResponse));
      } catch (error) {
        console.error('Error fetching task collaboration data:', error);
      }
    };

    fetchData();

    // Poll for updates every 5 seconds (realtime subscriptions removed)
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [taskId, teamId]);

  const addCollaborator = useCallback(async (taskIdParam: string, userId?: string, guestName?: string) => {
    if (!teamId) {
      console.error('Cannot add collaborator: teamId is required');
      return;
    }
    try {
      await flowApiService.createTaskCollaborator(teamId, taskIdParam, {
        userId: userId || null,
        guestName: guestName || null,
      });
      // Refresh data
      const [collabData] = await Promise.all([
        flowApiService.getTaskCollaborators(teamId, taskIdParam),
      ]);
      setCollaborators(collabData.map(mapCollaboratorResponse));
    } catch (error) {
      console.error('Error adding collaborator:', error);
    }
  }, [teamId]);

  const removeCollaborator = useCallback(async (collaboratorId: string) => {
    if (!teamId) {
      console.error('Cannot remove collaborator: teamId is required');
      return;
    }
    try {
      await flowApiService.deleteTaskCollaborator(teamId, collaboratorId);
      // Refresh data
      if (taskId) {
        const [collabData] = await Promise.all([
          flowApiService.getTaskCollaborators(teamId, taskId),
        ]);
        setCollaborators(collabData.map(mapCollaboratorResponse));
      }
    } catch (error) {
      console.error('Error removing collaborator:', error);
    }
  }, [teamId, taskId]);

  const toggleWatching = useCallback(async (taskIdParam: string, guestName?: string) => {
    if (!teamId) {
      console.error('Cannot toggle watching: teamId is required');
      return;
    }
    try {
      // Check if already watching
      const currentWatchers = await flowApiService.getTaskWatchers(teamId, taskIdParam);
      const existingWatcher = currentWatchers.find(w => 
        (user && w.userId === user.id) || (!user && guestName && w.guestName === guestName)
      );

      if (existingWatcher) {
        await flowApiService.deleteTaskWatcher(teamId, existingWatcher.id);
      } else {
        await flowApiService.createTaskWatcher(teamId, taskIdParam, {
          userId: user?.id || null,
          guestName: !user ? guestName || null : null,
        });
      }
      // Refresh data
      const [watchData] = await Promise.all([
        flowApiService.getTaskWatchers(teamId, taskIdParam),
      ]);
      setWatchers(watchData.map(mapWatcherResponse));
    } catch (error) {
      console.error('Error toggling watching:', error);
    }
  }, [user, teamId]);

  const isWatching = useCallback((guestName?: string) => {
    return watchers.some(w => 
      (user && w.user_id === user.id) || (!user && guestName && w.guest_name === guestName)
    );
  }, [user, watchers]);

  const requestUpdate = useCallback(async (taskIdParam: string, message?: string, guestName?: string) => {
    if (!teamId) {
      console.error('Cannot request update: teamId is required');
      return;
    }
    try {
      await flowApiService.createTaskUpdateRequest(teamId, taskIdParam, {
        requestedByUserId: user?.id || null,
        requestedByGuest: !user ? guestName || null : null,
        message: message || null,
      });
      // Refresh data
      const [requestData] = await Promise.all([
        flowApiService.getTaskUpdateRequests(teamId, taskIdParam),
      ]);
      setUpdateRequests(requestData.map(mapUpdateRequestResponse));
    } catch (error) {
      console.error('Error requesting update:', error);
    }
  }, [user, teamId]);

  const resolveRequest = useCallback(async (requestId: string) => {
    if (!teamId || !taskId) {
      console.error('Cannot resolve request: teamId and taskId are required');
      return;
    }
    try {
      await flowApiService.updateTaskUpdateRequest(teamId, requestId, {
        isResolved: true,
      });
      // Refresh data
      const [requestData] = await Promise.all([
        flowApiService.getTaskUpdateRequests(teamId, taskId),
      ]);
      setUpdateRequests(requestData.map(mapUpdateRequestResponse));
    } catch (error) {
      console.error('Error resolving request:', error);
    }
  }, [teamId, taskId]);

  const joinTask = useCallback(async (taskIdParam: string, guestName?: string) => {
    await addCollaborator(taskIdParam, user?.id, !user ? guestName : undefined);
  }, [user, addCollaborator]);

  const leaveTask = useCallback(async (taskIdParam: string, guestName?: string) => {
    if (!teamId) {
      console.error('Cannot leave task: teamId is required');
      return;
    }
    try {
      const currentCollaborators = await flowApiService.getTaskCollaborators(teamId, taskIdParam);
      const myCollaboration = currentCollaborators.find(c => 
        (user && c.userId === user.id) || (!user && guestName && c.guestName === guestName)
      );

      if (myCollaboration) {
        await removeCollaborator(myCollaboration.id);
      }
    } catch (error) {
      console.error('Error leaving task:', error);
    }
  }, [user, removeCollaborator, teamId]);

  const isCollaborator = useCallback((guestName?: string) => {
    return collaborators.some(c => 
      (user && c.user_id === user.id) || (!user && guestName && c.guest_name === guestName)
    );
  }, [user, collaborators]);

  return {
    collaborators,
    watchers,
    updateRequests,
    addCollaborator,
    removeCollaborator,
    toggleWatching,
    isWatching,
    requestUpdate,
    resolveRequest,
    joinTask,
    leaveTask,
    isCollaborator,
  };
}
