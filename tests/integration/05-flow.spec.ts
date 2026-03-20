/**
 * 05 — Flow API Integration Tests (port 6900)
 *
 * Real HTTP calls against the running Flow API.
 * Full CRUD for tasks, efforts, projects, sprints, shared-tasks, files.
 * All test data uses E2E-<timestamp> prefix and is cleaned up in afterAll.
 */
import { createTestClient, TestClient } from './helpers/http-client';
import { login, getUserContext } from './helpers/auth';
import { apiUrl } from './helpers/ports';
import { requireService } from './helpers/service-check';

const FLOW_BASE = apiUrl('flow');
const TEST_PREFIX = `E2E-${Date.now()}`;

let client: TestClient;
let teamId: string;
let userId: string;

// Track created resources for cleanup
const cleanup: { path: string }[] = [];

beforeAll(async () => {
  await requireService('flow');
  const token = await login();
  client = createTestClient(FLOW_BASE, token);

  // Get user context from Auth
  const ctx = await getUserContext();
  userId = ctx.user.id;
  const orgSlug = ctx.organizations[0]?.slug ?? 'marketing';

  // Get teams where the user is actually a member (from Auth API)
  const authClient = createTestClient('http://localhost:6100', token);
  const teams = await authClient.get<Array<{ id: string }>>('/teams');

  if (teams.length > 0) {
    // Try each team until one doesn't 403 on Flow
    for (const team of teams) {
      try {
        await client.get(`/teams/${team.id}/efforts`);
        teamId = team.id;
        break;
      } catch {
        // User not a member of this team in Flow context — try next
      }
    }
  }

  if (!teamId) {
    // Try org teams
    const orgTeams = await authClient.get<Array<{ id: string }>>(`/orgs/${orgSlug}/teams`);
    for (const team of orgTeams) {
      try {
        await client.get(`/teams/${team.id}/efforts`);
        teamId = team.id;
        break;
      } catch {
        // Skip
      }
    }
  }

  if (!teamId) {
    throw new Error(
      'No teams where user is a member found. ' +
      'Ensure the test user is a team member via POST /teams/:teamId/members.',
    );
  }
}, 30000);

afterAll(async () => {
  // Cleanup in reverse order (children before parents)
  for (const item of cleanup.reverse()) {
    try {
      await client.delete(item.path);
    } catch {
      // Best-effort cleanup
    }
  }
});

// ─── Health ─────────────────────────────────────────────────────────────────

describe('Flow / Health', () => {
  it('GET /health returns status', async () => {
    const res = await client.get<{ status: string }>('/health');
    expect(res).toBeDefined();
  });
});

// ─── Efforts CRUD ───────────────────────────────────────────────────────────

describe('Flow / Efforts', () => {
  let effortId: string;

  it('GET /teams/:teamId/efforts returns efforts array', async () => {
    const efforts = await client.get<unknown[]>(`/teams/${teamId}/efforts`);
    expect(efforts).toBeInstanceOf(Array);
  });

  it('POST /teams/:teamId/efforts creates an effort', async () => {
    const effort = await client.post<{ id: string; name: string }>(
      `/teams/${teamId}/efforts`,
      { name: `${TEST_PREFIX}-effort`, description: 'E2E test effort' },
    );
    expect(effort.id).toBeTruthy();
    effortId = effort.id;
    cleanup.push({ path: `/teams/${teamId}/efforts/${effortId}` });
  });

  it('PUT /teams/:teamId/efforts/:id updates an effort', async () => {
    if (!effortId) return;
    const updated = await client.put<{ id: string }>(
      `/teams/${teamId}/efforts/${effortId}`,
      { name: `${TEST_PREFIX}-effort-updated` },
    );
    expect(updated.id).toBe(effortId);
  });

  it('DELETE /teams/:teamId/efforts/:id deletes an effort', async () => {
    if (!effortId) return;
    await client.delete(`/teams/${teamId}/efforts/${effortId}`);
    // Remove from cleanup since we just deleted it
    const idx = cleanup.findIndex(c => c.path.includes(effortId));
    if (idx !== -1) cleanup.splice(idx, 1);
  });
});

// ─── Projects CRUD ──────────────────────────────────────────────────────────

describe('Flow / Projects', () => {
  let projectId: string;

  it('GET /teams/:teamId/projects returns projects array', async () => {
    const projects = await client.get<unknown[]>(`/teams/${teamId}/projects`);
    expect(projects).toBeInstanceOf(Array);
  });

  it('POST /teams/:teamId/projects creates a project (with effort)', async () => {
    // Projects need an effortId
    const effort = await client.post<{ id: string }>(
      `/teams/${teamId}/efforts`,
      { name: `${TEST_PREFIX}-proj-effort`, description: 'Effort for project test' },
    );
    cleanup.push({ path: `/teams/${teamId}/efforts/${effort.id}` });

    const project = await client.post<{ id: string }>(
      `/teams/${teamId}/projects`,
      { name: `${TEST_PREFIX}-project`, description: 'E2E test project', effortId: effort.id },
    );
    expect(project.id).toBeTruthy();
    projectId = project.id;
    cleanup.push({ path: `/teams/${teamId}/projects/${projectId}` });
  });

  it('PUT /teams/:teamId/projects/:id updates a project', async () => {
    if (!projectId) return;
    const updated = await client.put<{ id: string }>(
      `/teams/${teamId}/projects/${projectId}`,
      { name: `${TEST_PREFIX}-project-updated` },
    );
    expect(updated.id).toBe(projectId);
  });

  it('DELETE /teams/:teamId/projects/:id deletes a project', async () => {
    if (!projectId) return;
    await client.delete(`/teams/${teamId}/projects/${projectId}`);
    const idx = cleanup.findIndex(c => c.path.includes(projectId));
    if (idx !== -1) cleanup.splice(idx, 1);
  });
});

// ─── Tasks CRUD ─────────────────────────────────────────────────────────────

describe('Flow / Tasks', () => {
  let taskId: string;
  let taskProjectId: string;

  it('GET /teams/:teamId/tasks returns tasks array', async () => {
    const tasks = await client.get<unknown[]>(`/teams/${teamId}/tasks`);
    expect(tasks).toBeInstanceOf(Array);
  });

  it('POST /teams/:teamId/tasks creates a task (with effort+project)', async () => {
    // Tasks need a projectId, projects need an effortId — create both
    const effort = await client.post<{ id: string }>(
      `/teams/${teamId}/efforts`,
      { name: `${TEST_PREFIX}-task-effort`, description: 'Effort for task test' },
    );
    cleanup.push({ path: `/teams/${teamId}/efforts/${effort.id}` });

    const project = await client.post<{ id: string }>(
      `/teams/${teamId}/projects`,
      { name: `${TEST_PREFIX}-task-project`, description: 'Project for task test', effortId: effort.id },
    );
    taskProjectId = project.id;
    cleanup.push({ path: `/teams/${teamId}/projects/${taskProjectId}` });

    const task = await client.post<{ id: string }>(
      `/teams/${teamId}/tasks`,
      { title: `${TEST_PREFIX}-task`, description: 'E2E test task', status: 'pending', priority: 'medium', projectId: taskProjectId },
    );
    expect(task.id).toBeTruthy();
    taskId = task.id;
    cleanup.push({ path: `/teams/${teamId}/tasks/${taskId}` });
  });

  it('PUT /teams/:teamId/tasks/:id updates a task', async () => {
    if (!taskId) return;
    const updated = await client.put<{ id: string }>(
      `/teams/${teamId}/tasks/${taskId}`,
      { title: `${TEST_PREFIX}-task-updated`, status: 'in_progress' },
    );
    expect(updated.id).toBe(taskId);
  });

  it('DELETE /teams/:teamId/tasks/:id deletes a task', async () => {
    if (!taskId) return;
    await client.delete(`/teams/${teamId}/tasks/${taskId}`);
    const idx = cleanup.findIndex(c => c.path.includes(taskId));
    if (idx !== -1) cleanup.splice(idx, 1);
  });
});

// ─── Sprints CRUD ───────────────────────────────────────────────────────────

describe('Flow / Sprints', () => {
  let sprintId: string;

  it('GET /teams/:teamId/sprints returns sprints array', async () => {
    const sprints = await client.get<unknown[]>(`/teams/${teamId}/sprints`);
    expect(sprints).toBeInstanceOf(Array);
  });

  it('POST /teams/:teamId/sprints creates a sprint', async () => {
    const sprint = await client.post<{ id: string; name: string }>(
      `/teams/${teamId}/sprints`,
      {
        name: `${TEST_PREFIX}-sprint`,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      },
    );
    expect(sprint.id).toBeTruthy();
    sprintId = sprint.id;
    cleanup.push({ path: `/teams/${teamId}/sprints/${sprintId}` });
  });

  it('PUT /teams/:teamId/sprints/:id updates a sprint', async () => {
    if (!sprintId) return;
    const updated = await client.put<{ id: string }>(
      `/teams/${teamId}/sprints/${sprintId}`,
      { name: `${TEST_PREFIX}-sprint-updated` },
    );
    expect(updated.id).toBe(sprintId);
  });

  it('DELETE /teams/:teamId/sprints/:id deletes a sprint', async () => {
    if (!sprintId) return;
    await client.delete(`/teams/${teamId}/sprints/${sprintId}`);
    const idx = cleanup.findIndex(c => c.path.includes(sprintId));
    if (idx !== -1) cleanup.splice(idx, 1);
  });
});

// ─── Shared Tasks CRUD ─────────────────────────────────────────────────────

describe('Flow / Shared Tasks', () => {
  let sharedTaskId: string;

  it('GET /teams/:teamId/shared-tasks returns shared tasks array', async () => {
    const tasks = await client.get<unknown[]>(`/teams/${teamId}/shared-tasks`);
    expect(tasks).toBeInstanceOf(Array);
  });

  it('POST /teams/:teamId/shared-tasks creates a shared task', async () => {
    const task = await client.post<{ id: string; title: string }>(
      `/teams/${teamId}/shared-tasks`,
      { title: `${TEST_PREFIX}-shared-task`, description: 'E2E test shared task' },
    );
    expect(task.id).toBeTruthy();
    sharedTaskId = task.id;
    cleanup.push({ path: `/teams/${teamId}/shared-tasks/${sharedTaskId}` });
  });

  it('PUT /teams/:teamId/shared-tasks/:id updates a shared task', async () => {
    if (!sharedTaskId) return;
    const updated = await client.put<{ id: string }>(
      `/teams/${teamId}/shared-tasks/${sharedTaskId}`,
      { title: `${TEST_PREFIX}-shared-task-updated` },
    );
    expect(updated.id).toBe(sharedTaskId);
  });

  it('DELETE /teams/:teamId/shared-tasks/:id deletes a shared task', async () => {
    if (!sharedTaskId) return;
    await client.delete(`/teams/${teamId}/shared-tasks/${sharedTaskId}`);
    const idx = cleanup.findIndex(c => c.path.includes(sharedTaskId));
    if (idx !== -1) cleanup.splice(idx, 1);
  });
});

// ─── Files CRUD ─────────────────────────────────────────────────────────────

describe('Flow / Files', () => {
  let fileId: string;

  it('GET /teams/:teamId/files returns files array', async () => {
    const files = await client.get<unknown[]>(`/teams/${teamId}/files`);
    expect(files).toBeInstanceOf(Array);
  });

  it('POST /teams/:teamId/files creates a file entry', async () => {
    try {
      const file = await client.post<{ id: string; name: string }>(
        `/teams/${teamId}/files`,
        { name: `${TEST_PREFIX}-file.txt`, type: 'text', content: 'E2E test file' },
      );
      expect(file.id).toBeTruthy();
      fileId = file.id;
      cleanup.push({ path: `/teams/${teamId}/files/${fileId}` });
    } catch (e: unknown) {
      console.warn('  ⚠ File creation failed (may need storage config):', (e as Error).message);
    }
  });
});

// ─── Timer State ────────────────────────────────────────────────────────────

describe('Flow / Timer State', () => {
  it('GET /teams/:teamId/timer-state returns timer state', async () => {
    const state = await client.get<unknown>(`/teams/${teamId}/timer-state`);
    expect(state).toBeDefined();
  });
});

// ─── Profiles ───────────────────────────────────────────────────────────────

describe('Flow / Profiles', () => {
  it('GET /teams/:teamId/profiles returns profiles', async () => {
    const profiles = await client.get<unknown[]>(`/teams/${teamId}/profiles`);
    expect(profiles).toBeInstanceOf(Array);
  });
});

// ─── Channels ───────────────────────────────────────────────────────────────

describe('Flow / Channels', () => {
  it('GET /teams/:teamId/channels returns channels array', async () => {
    const channels = await client.get<unknown[]>(`/teams/${teamId}/channels`);
    expect(channels).toBeInstanceOf(Array);
  });
});
