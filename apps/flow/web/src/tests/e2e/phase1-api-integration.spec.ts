/**
 * Phase 1 E2E Integration Tests
 *
 * These tests hit the REAL Flow API (port 6900) with real auth.
 * No mocks. Verifies the service methods and store hydration work end-to-end.
 *
 * Requires: Flow API running on localhost:6900, Supabase on localhost:6012.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const API_BASE = 'http://localhost:6900';
let token: string;
let orgSlug: string;
let teamId: string;

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  if (res.status === 204) return null as T;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Login
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'golfergeek@orchestratorai.io', password: 'GolferGeek123!' }),
  });
  const loginData = await loginRes.json();
  token = loginData.accessToken;
  expect(token).toBeTruthy();

  // Get user context for orgSlug and userId
  const context = await apiRequest<{ user: { id: string }; organizations: Array<{ slug: string }> }>('/users/me/context');
  orgSlug = context.organizations[0]?.slug;
  const userId = context.user.id;
  expect(orgSlug).toBeTruthy();

  // Create a test team (or find one)
  const teams = await apiRequest<Array<{ id: string }>>(`/orgs/${orgSlug}/teams`);
  if (teams.length > 0) {
    teamId = teams[0].id;
  } else {
    const newTeam = await apiRequest<{ id: string }>(`/orgs/${orgSlug}/teams`, {
      method: 'POST',
      body: JSON.stringify({ name: 'E2E Test Team' }),
    });
    teamId = newTeam.id;
  }
  expect(teamId).toBeTruthy();

  // Ensure the current user is a member of the team
  const members = await apiRequest<Array<{ userId: string }>>(`/teams/${teamId}/members`);
  if (!members.some((m) => m.userId === userId)) {
    await apiRequest<unknown>(`/teams/${teamId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId, role: 'admin' }),
    });
  }
}, 15000);

// ─── Auth / User Context ─────────────────────────────────────────────────────

describe('Auth + User Context', () => {
  it('GET /users/me/context returns user, organizations, teams', async () => {
    const ctx = await apiRequest<{ user: { id: string; email: string }; organizations: unknown[]; teams: unknown[] }>('/users/me/context');
    expect(ctx.user.email).toBe('golfergeek@orchestratorai.io');
    expect(ctx.organizations.length).toBeGreaterThan(0);
  });
});

// ─── Teams ────────────────────────────────────────────────────────────────────

describe('Teams', () => {
  it('GET /orgs/:orgSlug/teams returns array', async () => {
    const teams = await apiRequest<unknown[]>(`/orgs/${orgSlug}/teams`);
    expect(Array.isArray(teams)).toBe(true);
  });

  it('GET /teams/:teamId returns a team object', async () => {
    const team = await apiRequest<{ id: string; name: string }>(`/teams/${teamId}`);
    expect(team.id).toBe(teamId);
    expect(team.name).toBeTruthy();
  });

  it('GET /teams/:teamId/members returns array', async () => {
    const members = await apiRequest<unknown[]>(`/teams/${teamId}/members`);
    expect(Array.isArray(members)).toBe(true);
  });
});

// ─── Efforts / Projects / Tasks (Hierarchy) ──────────────────────────────────

describe('Hierarchy CRUD', () => {
  let effortId: string;
  let projectId: string;
  let taskId: string;

  it('creates an effort', async () => {
    const effort = await apiRequest<{ id: string; name: string }>(`/teams/${teamId}/efforts`, {
      method: 'POST',
      body: JSON.stringify({ name: 'E2E Effort' }),
    });
    effortId = effort.id;
    expect(effort.name).toBe('E2E Effort');
  });

  it('lists efforts', async () => {
    const efforts = await apiRequest<Array<{ id: string }>>(`/teams/${teamId}/efforts`);
    expect(efforts.some((e) => e.id === effortId)).toBe(true);
  });

  it('creates a project under the effort', async () => {
    const project = await apiRequest<{ id: string; effortId: string }>(`/teams/${teamId}/projects`, {
      method: 'POST',
      body: JSON.stringify({ name: 'E2E Project', effortId }),
    });
    projectId = project.id;
    expect(project.effortId).toBe(effortId);
  });

  it('creates a task under the project', async () => {
    const task = await apiRequest<{ id: string; projectId: string }>(`/teams/${teamId}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ title: 'E2E Task', projectId }),
    });
    taskId = task.id;
    expect(task.projectId).toBe(projectId);
  });

  it('cleans up: deletes task, project, effort', async () => {
    await apiRequest<void>(`/teams/${teamId}/tasks/${taskId}`, { method: 'DELETE' });
    await apiRequest<void>(`/teams/${teamId}/projects/${projectId}`, { method: 'DELETE' });
    await apiRequest<void>(`/teams/${teamId}/efforts/${effortId}`, { method: 'DELETE' });
  });
});

// ─── Shared Tasks (Kanban) ───────────────────────────────────────────────────

describe('Shared Tasks', () => {
  let sharedTaskId: string;

  it('creates a shared task', async () => {
    const task = await apiRequest<{ id: string; title: string; status: string }>(`/teams/${teamId}/shared-tasks`, {
      method: 'POST',
      body: JSON.stringify({ title: 'E2E Shared Task', status: 'today', teamId }),
    });
    sharedTaskId = task.id;
    expect(task.title).toBe('E2E Shared Task');
    expect(task.status).toBe('today');
  });

  it('lists shared tasks', async () => {
    const tasks = await apiRequest<Array<{ id: string }>>(`/teams/${teamId}/shared-tasks`);
    expect(tasks.some((t) => t.id === sharedTaskId)).toBe(true);
  });

  it('updates a shared task status', async () => {
    const updated = await apiRequest<{ id: string; status: string }>(`/teams/${teamId}/shared-tasks/${sharedTaskId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'in_progress' }),
    });
    expect(updated.status).toBe('in_progress');
  });

  it('deletes the shared task', async () => {
    await apiRequest<void>(`/teams/${teamId}/shared-tasks/${sharedTaskId}`, { method: 'DELETE' });
    const tasks = await apiRequest<Array<{ id: string }>>(`/teams/${teamId}/shared-tasks`);
    expect(tasks.some((t) => t.id === sharedTaskId)).toBe(false);
  });
});

// ─── Sprints ──────────────────────────────────────────────────────────────────

describe('Sprints', () => {
  let sprintId: string;

  it('creates a sprint', async () => {
    const sprint = await apiRequest<{ id: string; name: string }>(`/teams/${teamId}/sprints`, {
      method: 'POST',
      body: JSON.stringify({ name: 'E2E Sprint', startDate: new Date().toISOString(), endDate: new Date(Date.now() + 7 * 86400000).toISOString() }),
    });
    sprintId = sprint.id;
    expect(sprint.name).toBe('E2E Sprint');
  });

  it('lists sprints', async () => {
    const sprints = await apiRequest<Array<{ id: string }>>(`/teams/${teamId}/sprints`);
    expect(sprints.some((s) => s.id === sprintId)).toBe(true);
  });

  it('deletes the sprint', async () => {
    await apiRequest<void>(`/teams/${teamId}/sprints/${sprintId}`, { method: 'DELETE' });
  });
});

// ─── Files ───────────────────────────────────────────────────────────────────

describe('Files', () => {
  let fileId: string;

  it('creates a file', async () => {
    const file = await apiRequest<{ id: string; name: string }>(`/teams/${teamId}/files`, {
      method: 'POST',
      body: JSON.stringify({ name: 'e2e-test.txt', isFolder: false, content: 'hello e2e', fileType: 'text/plain' }),
    });
    fileId = file.id;
    expect(file.name).toBe('e2e-test.txt');
  });

  it('reads the file back', async () => {
    const file = await apiRequest<{ id: string; content: string }>(`/teams/${teamId}/files/${fileId}`);
    expect(file.content).toBe('hello e2e');
  });

  it('deletes the file', async () => {
    await apiRequest<void>(`/teams/${teamId}/files/${fileId}`, { method: 'DELETE' });
  });
});

// ─── Notifications ───────────────────────────────────────────────────────────

describe('Notifications', () => {
  it('lists notifications (may be empty)', async () => {
    const notifications = await apiRequest<unknown[]>(`/teams/${teamId}/notifications`);
    expect(Array.isArray(notifications)).toBe(true);
  });

  it('creates a notification', async () => {
    const notification = await apiRequest<{ id: string; message: string }>(`/teams/${teamId}/notifications`, {
      method: 'POST',
      body: JSON.stringify({ type: 'info', message: 'E2E test notification' }),
    });
    expect(notification.message).toBe('E2E test notification');
  });
});

// ─── Presence ─────────────────────────────────────────────────────────────────

describe('Presence', () => {
  it('sends heartbeat', async () => {
    await apiRequest<void>('/flow/heartbeat', { method: 'POST' });
  });

  it('gets online users', async () => {
    const users = await apiRequest<unknown[]>('/flow/online');
    expect(Array.isArray(users)).toBe(true);
  });
});

// ─── Timer State ──────────────────────────────────────────────────────────────

describe('Timer State', () => {
  it('gets timer state (may be null)', async () => {
    const state = await apiRequest<unknown>(`/teams/${teamId}/timer-state`);
    // Can be null or an object
    expect(state === null || typeof state === 'object').toBe(true);
  });

  it('gets global timer state (may be null)', async () => {
    const state = await apiRequest<unknown>('/flow/global-timer');
    expect(state === null || typeof state === 'object').toBe(true);
  });
});

// ─── Profiles ─────────────────────────────────────────────────────────────────

describe('Profiles', () => {
  it('gets profiles list', async () => {
    const profiles = await apiRequest<unknown[]>('/flow/profiles');
    expect(Array.isArray(profiles)).toBe(true);
  });
});

// ─── Channels ─────────────────────────────────────────────────────────────────

describe('Channels', () => {
  let channelId: string;

  it('creates a channel', async () => {
    const channel = await apiRequest<{ id: string; name: string }>(`/teams/${teamId}/channels`, {
      method: 'POST',
      body: JSON.stringify({ name: 'e2e-channel', teamId }),
    });
    channelId = channel.id;
    expect(channel.name).toBe('e2e-channel');
  });

  it('lists channels', async () => {
    const channels = await apiRequest<Array<{ id: string }>>(`/teams/${teamId}/channels`);
    expect(channels.some((c) => c.id === channelId)).toBe(true);
  });

  it('creates a message in the channel', async () => {
    const msg = await apiRequest<{ id: string; content: string }>(`/teams/${teamId}/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: 'hello e2e', userId: null, guestName: 'E2E Bot' }),
    });
    expect(msg.content).toBe('hello e2e');
  });

  it('reads messages from the channel', async () => {
    const msgs = await apiRequest<Array<{ content: string }>>(`/teams/${teamId}/channels/${channelId}/messages`);
    expect(msgs.some((m) => m.content === 'hello e2e')).toBe(true);
  });

  it('deletes the channel', async () => {
    await apiRequest<void>(`/teams/${teamId}/channels/${channelId}`, { method: 'DELETE' });
  });
});

// ─── Journey Templates ───────────────────────────────────────────────────────

describe('Journey Templates', () => {
  it('lists journey templates', async () => {
    const templates = await apiRequest<unknown[]>('/flow/journey-templates');
    expect(Array.isArray(templates)).toBe(true);
  });
});

// ─── Learning Progress ───────────────────────────────────────────────────────

describe('Learning Progress', () => {
  it('lists learning progress', async () => {
    const progress = await apiRequest<unknown[]>('/flow/learning-progress');
    expect(Array.isArray(progress)).toBe(true);
  });
});

// ─── My Tasks (Global) ───────────────────────────────────────────────────────

describe('My Tasks', () => {
  it('lists my tasks across teams', async () => {
    const tasks = await apiRequest<unknown[]>('/flow/my-tasks');
    expect(Array.isArray(tasks)).toBe(true);
  });
});
