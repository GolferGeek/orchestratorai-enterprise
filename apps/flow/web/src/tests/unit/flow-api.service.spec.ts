/**
 * flow-api.service.spec.ts
 *
 * Unit tests for Phase 1 methods added to FlowApiService.
 * fetch is mocked globally — no real HTTP calls are made.
 *
 * Covered methods:
 *   updateTeamMember
 *   getNotifications (with optional guestName)
 *   createNotification
 *   markNotificationsRead (with optional guestName)
 *   getTimerState, createTimerState, updateTimerState
 *   getGlobalTimerState, createGlobalTimerState, updateGlobalTimerState
 *   getTaskCollaborators, createTaskCollaborator, deleteTaskCollaborator
 *   getTaskWatchers, createTaskWatcher, deleteTaskWatcher
 *   getTaskUpdateRequests, createTaskUpdateRequest, updateTaskUpdateRequest
 *   getChannels, createChannel, deleteChannel
 *   getChannelMessages, createChannelMessage
 *   getJourneyTemplates, getJourneyTemplateBySlug
 *   getLearningProgress, createOrUpdateLearningProgress
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flowApiService } from '@/services/flow-api.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates a minimal fetch mock that returns the given body as JSON with
 * status 200, and installs it on globalThis.
 */
function mockFetch(body: unknown, status = 200) {
  const responseText = JSON.stringify(body);
  const mockResponse = {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(responseText),
    json: vi.fn().mockResolvedValue(body),
  };
  const fetchSpy = vi.fn().mockResolvedValue(mockResponse);
  vi.stubGlobal('fetch', fetchSpy);
  return fetchSpy;
}

/** Returns the URL string passed to the most-recent fetch call. */
function lastUrl(spy: ReturnType<typeof vi.fn>): string {
  return spy.mock.calls[0][0] as string;
}

/** Returns the RequestInit object passed to the most-recent fetch call. */
function lastOptions(spy: ReturnType<typeof vi.fn>): RequestInit {
  return spy.mock.calls[0][1] as RequestInit;
}

/** Returns the parsed body of the most-recent fetch call. */
function lastBody(spy: ReturnType<typeof vi.fn>): unknown {
  const opts = lastOptions(spy);
  if (!opts?.body) return undefined;
  return JSON.parse(opts.body as string);
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Provide an auth token so the guard inside request() passes.
  vi.stubGlobal('localStorage', {
    getItem: vi.fn().mockReturnValue('test-token'),
    setItem: vi.fn(),
  });
  vi.stubGlobal('document', { cookie: '' });
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FlowApiService — Phase 1 additions', () => {

  // ─── updateTeamMember ──────────────────────────────────────────────────

  describe('updateTeamMember', () => {
    it('calls PUT /teams/:teamId/members/:userId with the role payload', async () => {
      const member = { id: 'm1', userId: 'u1', email: 'u1@test.com', role: 'lead', joinedAt: '' };
      const spy = mockFetch(member);

      const result = await flowApiService.updateTeamMember('team-1', 'u1', { role: 'lead' });

      expect(lastUrl(spy)).toBe('/api/teams/team-1/members/u1');
      expect(lastOptions(spy).method).toBe('PUT');
      expect(lastBody(spy)).toEqual({ role: 'lead' });
      expect(result).toEqual(member);
    });
  });

  // ─── Notifications ─────────────────────────────────────────────────────

  describe('getNotifications', () => {
    it('calls GET /teams/:teamId/notifications without params when no guestName', async () => {
      const spy = mockFetch([]);

      await flowApiService.getNotifications('team-1');

      expect(lastUrl(spy)).toBe('/api/teams/team-1/notifications');
      expect(lastOptions(spy).method).toBeUndefined(); // defaults to GET
    });

    it('appends guestName query param when provided', async () => {
      const spy = mockFetch([]);

      await flowApiService.getNotifications('team-1', 'Alice');

      expect(lastUrl(spy)).toBe('/api/teams/team-1/notifications?guestName=Alice');
    });

    it('returns the notification array from the API', async () => {
      const notifications = [{ id: 'n1', message: 'Hello', isRead: false }];
      mockFetch(notifications);

      const result = await flowApiService.getNotifications('team-1');

      expect(result).toEqual(notifications);
    });
  });

  describe('createNotification', () => {
    it('calls POST /teams/:teamId/notifications with the dto body', async () => {
      const created = { id: 'n1', message: 'New task', isRead: false };
      const spy = mockFetch(created);
      const dto = { message: 'New task', type: 'task_assigned' };

      const result = await flowApiService.createNotification('team-1', dto as never);

      expect(lastUrl(spy)).toBe('/api/teams/team-1/notifications');
      expect(lastOptions(spy).method).toBe('POST');
      expect(lastBody(spy)).toEqual(dto);
      expect(result).toEqual(created);
    });
  });

  describe('markNotificationsRead', () => {
    it('calls PUT /teams/:teamId/notifications/mark-read with ids and no guestName', async () => {
      const spy = mockFetch({ message: 'ok' });

      await flowApiService.markNotificationsRead('team-1', ['n1', 'n2']);

      expect(lastUrl(spy)).toBe('/api/teams/team-1/notifications/mark-read');
      expect(lastOptions(spy).method).toBe('PUT');
      expect(lastBody(spy)).toEqual({ notificationIds: ['n1', 'n2'], guestName: undefined });
    });

    it('includes guestName in the body when provided', async () => {
      const spy = mockFetch({ message: 'ok' });

      await flowApiService.markNotificationsRead('team-1', ['n1'], 'Alice');

      expect(lastBody(spy)).toEqual({ notificationIds: ['n1'], guestName: 'Alice' });
    });
  });

  // ─── Timer State (Team) ────────────────────────────────────────────────

  describe('getTimerState', () => {
    it('calls GET /teams/:teamId/timer-state', async () => {
      const timerState = { id: 'ts1', mode: 'work', remainingSeconds: 1500 };
      const spy = mockFetch(timerState);

      const result = await flowApiService.getTimerState('team-1');

      expect(lastUrl(spy)).toBe('/api/teams/team-1/timer-state');
      expect(result).toEqual(timerState);
    });
  });

  describe('createTimerState', () => {
    it('calls POST /teams/:teamId/timer-state with the dto body', async () => {
      const created = { id: 'ts1', mode: 'work', remainingSeconds: 1500 };
      const spy = mockFetch(created);
      const dto = { mode: 'work', remainingSeconds: 1500 };

      const result = await flowApiService.createTimerState('team-1', dto as never);

      expect(lastUrl(spy)).toBe('/api/teams/team-1/timer-state');
      expect(lastOptions(spy).method).toBe('POST');
      expect(lastBody(spy)).toEqual(dto);
      expect(result).toEqual(created);
    });
  });

  describe('updateTimerState', () => {
    it('calls PUT /teams/:teamId/timer-state/:timerId with the dto body', async () => {
      const updated = { id: 'ts1', mode: 'break', remainingSeconds: 300 };
      const spy = mockFetch(updated);
      const dto = { remainingSeconds: 300 };

      const result = await flowApiService.updateTimerState('team-1', 'ts1', dto as never);

      expect(lastUrl(spy)).toBe('/api/teams/team-1/timer-state/ts1');
      expect(lastOptions(spy).method).toBe('PUT');
      expect(lastBody(spy)).toEqual(dto);
      expect(result).toEqual(updated);
    });
  });

  // ─── Timer State (Global) ──────────────────────────────────────────────

  describe('getGlobalTimerState', () => {
    it('calls GET /flow/global-timer', async () => {
      const timerState = { id: 'gt1', mode: 'work', remainingSeconds: 1500 };
      const spy = mockFetch(timerState);

      const result = await flowApiService.getGlobalTimerState();

      expect(lastUrl(spy)).toBe('/api/flow/global-timer');
      expect(result).toEqual(timerState);
    });
  });

  describe('createGlobalTimerState', () => {
    it('calls POST /flow/global-timer with the dto body', async () => {
      const created = { id: 'gt1', mode: 'work', remainingSeconds: 1500 };
      const spy = mockFetch(created);
      const dto = { mode: 'work', remainingSeconds: 1500 };

      const result = await flowApiService.createGlobalTimerState(dto as never);

      expect(lastUrl(spy)).toBe('/api/flow/global-timer');
      expect(lastOptions(spy).method).toBe('POST');
      expect(lastBody(spy)).toEqual(dto);
      expect(result).toEqual(created);
    });
  });

  describe('updateGlobalTimerState', () => {
    it('calls PUT /flow/global-timer/:timerId with the dto body', async () => {
      const updated = { id: 'gt1', mode: 'break', remainingSeconds: 300 };
      const spy = mockFetch(updated);
      const dto = { remainingSeconds: 300 };

      const result = await flowApiService.updateGlobalTimerState('gt1', dto as never);

      expect(lastUrl(spy)).toBe('/api/flow/global-timer/gt1');
      expect(lastOptions(spy).method).toBe('PUT');
      expect(lastBody(spy)).toEqual(dto);
      expect(result).toEqual(updated);
    });
  });

  // ─── Task Collaborators ────────────────────────────────────────────────

  describe('getTaskCollaborators', () => {
    it('calls GET /teams/:teamId/tasks/:taskId/collaborators', async () => {
      const collaborators = [{ id: 'c1', userId: 'u1', taskId: 'task-1' }];
      const spy = mockFetch(collaborators);

      const result = await flowApiService.getTaskCollaborators('team-1', 'task-1');

      expect(lastUrl(spy)).toBe('/api/teams/team-1/tasks/task-1/collaborators');
      expect(result).toEqual(collaborators);
    });
  });

  describe('createTaskCollaborator', () => {
    it('calls POST /teams/:teamId/tasks/:taskId/collaborators with the dto body', async () => {
      const created = { id: 'c1', userId: 'u1', taskId: 'task-1' };
      const spy = mockFetch(created);
      const dto = { userId: 'u1' };

      const result = await flowApiService.createTaskCollaborator('team-1', 'task-1', dto as never);

      expect(lastUrl(spy)).toBe('/api/teams/team-1/tasks/task-1/collaborators');
      expect(lastOptions(spy).method).toBe('POST');
      expect(lastBody(spy)).toEqual(dto);
      expect(result).toEqual(created);
    });
  });

  describe('deleteTaskCollaborator', () => {
    it('calls DELETE /teams/:teamId/tasks/collaborators/:collaboratorId', async () => {
      const spy = mockFetch(null, 204);

      await flowApiService.deleteTaskCollaborator('team-1', 'c1');

      expect(lastUrl(spy)).toBe('/api/teams/team-1/tasks/collaborators/c1');
      expect(lastOptions(spy).method).toBe('DELETE');
    });
  });

  // ─── Task Watchers ─────────────────────────────────────────────────────

  describe('getTaskWatchers', () => {
    it('calls GET /teams/:teamId/tasks/:taskId/watchers', async () => {
      const watchers = [{ id: 'w1', userId: 'u1', taskId: 'task-1' }];
      const spy = mockFetch(watchers);

      const result = await flowApiService.getTaskWatchers('team-1', 'task-1');

      expect(lastUrl(spy)).toBe('/api/teams/team-1/tasks/task-1/watchers');
      expect(result).toEqual(watchers);
    });
  });

  describe('createTaskWatcher', () => {
    it('calls POST /teams/:teamId/tasks/:taskId/watchers with the dto body', async () => {
      const created = { id: 'w1', userId: 'u1', taskId: 'task-1' };
      const spy = mockFetch(created);
      const dto = { userId: 'u1' };

      const result = await flowApiService.createTaskWatcher('team-1', 'task-1', dto as never);

      expect(lastUrl(spy)).toBe('/api/teams/team-1/tasks/task-1/watchers');
      expect(lastOptions(spy).method).toBe('POST');
      expect(lastBody(spy)).toEqual(dto);
      expect(result).toEqual(created);
    });
  });

  describe('deleteTaskWatcher', () => {
    it('calls DELETE /teams/:teamId/tasks/watchers/:watcherId', async () => {
      const spy = mockFetch(null, 204);

      await flowApiService.deleteTaskWatcher('team-1', 'w1');

      expect(lastUrl(spy)).toBe('/api/teams/team-1/tasks/watchers/w1');
      expect(lastOptions(spy).method).toBe('DELETE');
    });
  });

  // ─── Task Update Requests ──────────────────────────────────────────────

  describe('getTaskUpdateRequests', () => {
    it('calls GET /teams/:teamId/tasks/:taskId/update-requests', async () => {
      const requests = [{ id: 'ur1', taskId: 'task-1', status: 'pending' }];
      const spy = mockFetch(requests);

      const result = await flowApiService.getTaskUpdateRequests('team-1', 'task-1');

      expect(lastUrl(spy)).toBe('/api/teams/team-1/tasks/task-1/update-requests');
      expect(result).toEqual(requests);
    });
  });

  describe('createTaskUpdateRequest', () => {
    it('calls POST /teams/:teamId/tasks/:taskId/update-requests with the dto body', async () => {
      const created = { id: 'ur1', taskId: 'task-1', status: 'pending' };
      const spy = mockFetch(created);
      const dto = { message: 'Please update status' };

      const result = await flowApiService.createTaskUpdateRequest('team-1', 'task-1', dto as never);

      expect(lastUrl(spy)).toBe('/api/teams/team-1/tasks/task-1/update-requests');
      expect(lastOptions(spy).method).toBe('POST');
      expect(lastBody(spy)).toEqual(dto);
      expect(result).toEqual(created);
    });
  });

  describe('updateTaskUpdateRequest', () => {
    it('calls PUT /teams/:teamId/tasks/update-requests/:requestId with the dto body', async () => {
      const updated = { id: 'ur1', taskId: 'task-1', status: 'resolved' };
      const spy = mockFetch(updated);
      const dto = { status: 'resolved' };

      const result = await flowApiService.updateTaskUpdateRequest('team-1', 'ur1', dto as never);

      expect(lastUrl(spy)).toBe('/api/teams/team-1/tasks/update-requests/ur1');
      expect(lastOptions(spy).method).toBe('PUT');
      expect(lastBody(spy)).toEqual(dto);
      expect(result).toEqual(updated);
    });
  });

  // ─── Channels ─────────────────────────────────────────────────────────

  describe('getChannels', () => {
    it('calls GET /teams/:teamId/channels', async () => {
      const channels = [{ id: 'ch1', name: 'general', teamId: 'team-1' }];
      const spy = mockFetch(channels);

      const result = await flowApiService.getChannels('team-1');

      expect(lastUrl(spy)).toBe('/api/teams/team-1/channels');
      expect(result).toEqual(channels);
    });
  });

  describe('createChannel', () => {
    it('calls POST /teams/:teamId/channels with dto merged with teamId', async () => {
      const created = { id: 'ch1', name: 'general', teamId: 'team-1' };
      const spy = mockFetch(created);
      const dto = { name: 'general' };

      const result = await flowApiService.createChannel('team-1', dto as never);

      expect(lastUrl(spy)).toBe('/api/teams/team-1/channels');
      expect(lastOptions(spy).method).toBe('POST');
      // The service merges teamId into the body
      expect((lastBody(spy) as Record<string, unknown>).name).toBe('general');
      expect((lastBody(spy) as Record<string, unknown>).teamId).toBe('team-1');
      expect(result).toEqual(created);
    });
  });

  describe('deleteChannel', () => {
    it('calls DELETE /teams/:teamId/channels/:channelId', async () => {
      const spy = mockFetch(null, 204);

      await flowApiService.deleteChannel('team-1', 'ch1');

      expect(lastUrl(spy)).toBe('/api/teams/team-1/channels/ch1');
      expect(lastOptions(spy).method).toBe('DELETE');
    });
  });

  // ─── Channel Messages ──────────────────────────────────────────────────

  describe('getChannelMessages', () => {
    it('calls GET /teams/:teamId/channels/:channelId/messages', async () => {
      const messages = [{ id: 'msg1', content: 'Hello', channelId: 'ch1' }];
      const spy = mockFetch(messages);

      const result = await flowApiService.getChannelMessages('team-1', 'ch1');

      expect(lastUrl(spy)).toBe('/api/teams/team-1/channels/ch1/messages');
      expect(result).toEqual(messages);
    });
  });

  describe('createChannelMessage', () => {
    it('calls POST /teams/:teamId/channels/:channelId/messages with the dto body', async () => {
      const created = { id: 'msg1', content: 'Hello', channelId: 'ch1' };
      const spy = mockFetch(created);
      const dto = { content: 'Hello' };

      const result = await flowApiService.createChannelMessage('team-1', 'ch1', dto as never);

      expect(lastUrl(spy)).toBe('/api/teams/team-1/channels/ch1/messages');
      expect(lastOptions(spy).method).toBe('POST');
      expect(lastBody(spy)).toEqual(dto);
      expect(result).toEqual(created);
    });
  });

  // ─── Journey Templates ─────────────────────────────────────────────────

  describe('getJourneyTemplates', () => {
    it('calls GET /flow/journey-templates', async () => {
      const templates = [{ id: 'jt1', slug: 'onboarding', name: 'Onboarding' }];
      const spy = mockFetch(templates);

      const result = await flowApiService.getJourneyTemplates();

      expect(lastUrl(spy)).toBe('/api/flow/journey-templates');
      expect(result).toEqual(templates);
    });
  });

  describe('getJourneyTemplateBySlug', () => {
    it('calls GET /flow/journey-templates/:slug', async () => {
      const template = { id: 'jt1', slug: 'onboarding', name: 'Onboarding' };
      const spy = mockFetch(template);

      const result = await flowApiService.getJourneyTemplateBySlug('onboarding');

      expect(lastUrl(spy)).toBe('/api/flow/journey-templates/onboarding');
      expect(result).toEqual(template);
    });
  });

  // ─── Learning Progress ─────────────────────────────────────────────────

  describe('getLearningProgress', () => {
    it('calls GET /flow/learning-progress', async () => {
      const progress = [{ id: 'lp1', slug: 'step-1', completed: true }];
      const spy = mockFetch(progress);

      const result = await flowApiService.getLearningProgress();

      expect(lastUrl(spy)).toBe('/api/flow/learning-progress');
      expect(result).toEqual(progress);
    });
  });

  describe('createOrUpdateLearningProgress', () => {
    it('calls POST /flow/learning-progress with the dto body', async () => {
      const saved = { id: 'lp1', slug: 'step-1', completed: true };
      const spy = mockFetch(saved);
      const dto = { slug: 'step-1', completed: true };

      const result = await flowApiService.createOrUpdateLearningProgress(dto as never);

      expect(lastUrl(spy)).toBe('/api/flow/learning-progress');
      expect(lastOptions(spy).method).toBe('POST');
      expect(lastBody(spy)).toEqual(dto);
      expect(result).toEqual(saved);
    });
  });

  // ─── Authorization header is sent ─────────────────────────────────────

  describe('Authorization header', () => {
    it('sends Bearer token on every request', async () => {
      const spy = mockFetch([]);

      await flowApiService.getJourneyTemplates();

      const headers = lastOptions(spy).headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-token');
    });
  });
});
