import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { FlowController, FlowGlobalController } from '../flow.controller';
import { FlowService } from '../flow.service';
import { SharedTaskStatus } from '../flow.dto';

describe('FlowController', () => {
  let controller: FlowController;
  let flowService: jest.Mocked<FlowService>;

  const TEAM_ID = 'team-uuid-001';
  const USER_ID = 'user-uuid-001';
  const mockRequest = { user: { id: USER_ID, email: 'test@example.com' } } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FlowController],
      providers: [
        {
          provide: FlowService,
          useValue: {
            getEfforts: jest.fn(),
            createEffort: jest.fn(),
            updateEffort: jest.fn(),
            deleteEffort: jest.fn(),
            getProjects: jest.fn(),
            createProject: jest.fn(),
            updateProject: jest.fn(),
            deleteProject: jest.fn(),
            getTasks: jest.fn(),
            createTask: jest.fn(),
            updateTask: jest.fn(),
            deleteTask: jest.fn(),
            getSprints: jest.fn(),
            createSprint: jest.fn(),
            updateSprint: jest.fn(),
            deleteSprint: jest.fn(),
            getSharedTasks: jest.fn(),
            createSharedTask: jest.fn(),
            updateSharedTask: jest.fn(),
            deleteSharedTask: jest.fn(),
            getNotifications: jest.fn(),
            createNotification: jest.fn(),
            markNotificationsRead: jest.fn(),
            getTimerState: jest.fn(),
            createTimerState: jest.fn(),
            updateTimerState: jest.fn(),
            getProfiles: jest.fn(),
            getProfile: jest.fn(),
            getTaskCollaborators: jest.fn(),
            createTaskCollaborator: jest.fn(),
            deleteTaskCollaborator: jest.fn(),
            getTaskWatchers: jest.fn(),
            createTaskWatcher: jest.fn(),
            deleteTaskWatcher: jest.fn(),
            getTaskUpdateRequests: jest.fn(),
            createTaskUpdateRequest: jest.fn(),
            updateTaskUpdateRequest: jest.fn(),
            getChannels: jest.fn(),
            createChannel: jest.fn(),
            deleteChannel: jest.fn(),
            getChannelMessages: jest.fn(),
            createChannelMessage: jest.fn(),
            getTeamFiles: jest.fn(),
            getTeamFile: jest.fn(),
            createTeamFile: jest.fn(),
            updateTeamFile: jest.fn(),
            deleteTeamFile: jest.fn(),
          },
        },
      ],
    })
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      .overrideGuard(require('@/auth/guards/jwt-auth.guard').JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<FlowController>(FlowController);
    flowService = module.get(FlowService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // Efforts
  // ==========================================================================

  describe('getEfforts', () => {
    it('should return efforts for a team', async () => {
      const mockEfforts = [{ id: 'eff-1', teamId: TEAM_ID, name: 'Phase 1' }] as any;
      flowService.getEfforts.mockResolvedValue(mockEfforts);

      const result = await controller.getEfforts(TEAM_ID, mockRequest);

      expect(result).toEqual(mockEfforts);
      expect(flowService.getEfforts).toHaveBeenCalledWith(TEAM_ID, USER_ID);
    });

    it('should return empty array when no efforts exist', async () => {
      flowService.getEfforts.mockResolvedValue([]);

      const result = await controller.getEfforts(TEAM_ID, mockRequest);

      expect(result).toEqual([]);
    });

    it('should propagate service errors', async () => {
      flowService.getEfforts.mockRejectedValue(new Error('DB error'));

      await expect(controller.getEfforts(TEAM_ID, mockRequest)).rejects.toThrow('DB error');
    });
  });

  describe('createEffort', () => {
    it('should create and return a new effort', async () => {
      const mockEffort = { id: 'eff-new', name: 'Phase 1' } as any;
      flowService.createEffort.mockResolvedValue(mockEffort);
      const dto = { name: 'Phase 1', description: 'First phase' } as any;

      const result = await controller.createEffort(TEAM_ID, dto, mockRequest);

      expect(result).toEqual(mockEffort);
      expect(flowService.createEffort).toHaveBeenCalledWith(TEAM_ID, USER_ID, dto);
    });
  });

  describe('updateEffort', () => {
    it('should update and return an effort', async () => {
      const mockEffort = { id: 'eff-1', name: 'Phase 1 Updated' } as any;
      flowService.updateEffort.mockResolvedValue(mockEffort);
      const dto = { name: 'Phase 1 Updated' } as any;

      const result = await controller.updateEffort(TEAM_ID, 'eff-1', dto, mockRequest);

      expect(result).toEqual(mockEffort);
      expect(flowService.updateEffort).toHaveBeenCalledWith(TEAM_ID, 'eff-1', USER_ID, dto);
    });
  });

  describe('deleteEffort', () => {
    it('should delete effort and return success message', async () => {
      flowService.deleteEffort.mockResolvedValue(undefined);

      const result = await controller.deleteEffort(TEAM_ID, 'eff-1', mockRequest);

      expect(result).toEqual({ message: 'Effort deleted successfully' });
      expect(flowService.deleteEffort).toHaveBeenCalledWith(TEAM_ID, 'eff-1', USER_ID);
    });
  });

  // ==========================================================================
  // Projects
  // ==========================================================================

  describe('getProjects', () => {
    it('should return projects for a team without effort filter', async () => {
      const mockProjects = [{ id: 'proj-1', name: 'Auth Module' }] as any;
      flowService.getProjects.mockResolvedValue(mockProjects);

      const result = await controller.getProjects(TEAM_ID, undefined, mockRequest);

      expect(result).toEqual(mockProjects);
      expect(flowService.getProjects).toHaveBeenCalledWith(TEAM_ID, undefined, USER_ID);
    });

    it('should pass effortId filter when provided', async () => {
      flowService.getProjects.mockResolvedValue([]);

      await controller.getProjects(TEAM_ID, 'eff-1', mockRequest);

      expect(flowService.getProjects).toHaveBeenCalledWith(TEAM_ID, 'eff-1', USER_ID);
    });
  });

  describe('createProject', () => {
    it('should create and return a new project', async () => {
      const mockProject = { id: 'proj-new', name: 'Auth Module' } as any;
      flowService.createProject.mockResolvedValue(mockProject);
      const dto = { name: 'Auth Module', effortId: 'eff-1' } as any;

      const result = await controller.createProject(TEAM_ID, dto, mockRequest);

      expect(result).toEqual(mockProject);
      expect(flowService.createProject).toHaveBeenCalledWith(TEAM_ID, USER_ID, dto);
    });
  });

  describe('updateProject', () => {
    it('should update and return a project', async () => {
      const mockProject = { id: 'proj-1', name: 'Updated Name' } as any;
      flowService.updateProject.mockResolvedValue(mockProject);
      const dto = { name: 'Updated Name' } as any;

      const result = await controller.updateProject(TEAM_ID, 'proj-1', dto, mockRequest);

      expect(result).toEqual(mockProject);
      expect(flowService.updateProject).toHaveBeenCalledWith(TEAM_ID, 'proj-1', USER_ID, dto);
    });
  });

  describe('deleteProject', () => {
    it('should delete project and return success message', async () => {
      flowService.deleteProject.mockResolvedValue(undefined);

      const result = await controller.deleteProject(TEAM_ID, 'proj-1', mockRequest);

      expect(result).toEqual({ message: 'Project deleted successfully' });
      expect(flowService.deleteProject).toHaveBeenCalledWith(TEAM_ID, 'proj-1', USER_ID);
    });
  });

  // ==========================================================================
  // Tasks
  // ==========================================================================

  describe('getTasks', () => {
    it('should return tasks for a team without project filter', async () => {
      const mockTasks = [{ id: 'task-1', title: 'Implement JWT' }] as any;
      flowService.getTasks.mockResolvedValue(mockTasks);

      const result = await controller.getTasks(TEAM_ID, undefined, mockRequest);

      expect(result).toEqual(mockTasks);
      expect(flowService.getTasks).toHaveBeenCalledWith(TEAM_ID, undefined, USER_ID);
    });

    it('should pass projectId filter when provided', async () => {
      flowService.getTasks.mockResolvedValue([]);

      await controller.getTasks(TEAM_ID, 'proj-1', mockRequest);

      expect(flowService.getTasks).toHaveBeenCalledWith(TEAM_ID, 'proj-1', USER_ID);
    });
  });

  describe('createTask', () => {
    it('should create and return a new task', async () => {
      const mockTask = { id: 'task-new', title: 'Implement JWT' } as any;
      flowService.createTask.mockResolvedValue(mockTask);
      const dto = { title: 'Implement JWT', projectId: 'proj-1' } as any;

      const result = await controller.createTask(TEAM_ID, dto, mockRequest);

      expect(result).toEqual(mockTask);
      expect(flowService.createTask).toHaveBeenCalledWith(TEAM_ID, USER_ID, dto);
    });
  });

  describe('updateTask', () => {
    it('should update and return a task', async () => {
      const mockTask = { id: 'task-1', status: 'done' } as any;
      flowService.updateTask.mockResolvedValue(mockTask);
      const dto = { status: 'done' } as any;

      const result = await controller.updateTask(TEAM_ID, 'task-1', dto, mockRequest);

      expect(result).toEqual(mockTask);
      expect(flowService.updateTask).toHaveBeenCalledWith(TEAM_ID, 'task-1', USER_ID, dto);
    });
  });

  describe('deleteTask', () => {
    it('should delete task and return success message', async () => {
      flowService.deleteTask.mockResolvedValue(undefined);

      const result = await controller.deleteTask(TEAM_ID, 'task-1', mockRequest);

      expect(result).toEqual({ message: 'Task deleted successfully' });
      expect(flowService.deleteTask).toHaveBeenCalledWith(TEAM_ID, 'task-1', USER_ID);
    });
  });

  // ==========================================================================
  // Sprints
  // ==========================================================================

  describe('getSprints', () => {
    it('should return sprints for a team', async () => {
      const mockSprints = [{ id: 'sprint-1', name: 'Sprint 1' }] as any;
      flowService.getSprints.mockResolvedValue(mockSprints);

      const result = await controller.getSprints(TEAM_ID, mockRequest);

      expect(result).toEqual(mockSprints);
      expect(flowService.getSprints).toHaveBeenCalledWith(TEAM_ID, USER_ID);
    });
  });

  describe('createSprint', () => {
    it('should create and return a new sprint', async () => {
      const mockSprint = { id: 'sprint-new', name: 'Sprint 1' } as any;
      flowService.createSprint.mockResolvedValue(mockSprint);
      const dto = { name: 'Sprint 1', goal: 'Complete auth' } as any;

      const result = await controller.createSprint(TEAM_ID, dto, mockRequest);

      expect(result).toEqual(mockSprint);
      expect(flowService.createSprint).toHaveBeenCalledWith(TEAM_ID, USER_ID, dto);
    });
  });

  describe('updateSprint', () => {
    it('should update and return a sprint', async () => {
      const mockSprint = { id: 'sprint-1', isActive: false } as any;
      flowService.updateSprint.mockResolvedValue(mockSprint);
      const dto = { isActive: false } as any;

      const result = await controller.updateSprint(TEAM_ID, 'sprint-1', dto, mockRequest);

      expect(result).toEqual(mockSprint);
      expect(flowService.updateSprint).toHaveBeenCalledWith(TEAM_ID, 'sprint-1', USER_ID, dto);
    });
  });

  describe('deleteSprint', () => {
    it('should delete sprint and return success message', async () => {
      flowService.deleteSprint.mockResolvedValue(undefined);

      const result = await controller.deleteSprint(TEAM_ID, 'sprint-1', mockRequest);

      expect(result).toEqual({ message: 'Sprint deleted successfully' });
      expect(flowService.deleteSprint).toHaveBeenCalledWith(TEAM_ID, 'sprint-1', USER_ID);
    });
  });

  // ==========================================================================
  // Shared Tasks
  // ==========================================================================

  describe('getSharedTasks', () => {
    it('should return shared tasks with default parameters', async () => {
      const mockTasks = [{ id: 'st-1', title: 'Fix bug' }] as any;
      flowService.getSharedTasks.mockResolvedValue(mockTasks);

      const result = await controller.getSharedTasks(
        TEAM_ID,
        undefined,
        undefined,
        undefined,
        mockRequest,
      );

      expect(result).toEqual(mockTasks);
      expect(flowService.getSharedTasks).toHaveBeenCalledWith(
        TEAM_ID,
        USER_ID,
        undefined,
        false,
        null,
      );
    });

    it('should pass includeCollaborated=true when query param is "true"', async () => {
      flowService.getSharedTasks.mockResolvedValue([]);

      await controller.getSharedTasks(TEAM_ID, undefined, 'true', undefined, mockRequest);

      expect(flowService.getSharedTasks).toHaveBeenCalledWith(
        TEAM_ID,
        USER_ID,
        undefined,
        true,
        null,
      );
    });

    it('should pass projectId filter when provided', async () => {
      flowService.getSharedTasks.mockResolvedValue([]);

      await controller.getSharedTasks(TEAM_ID, undefined, undefined, 'proj-1', mockRequest);

      expect(flowService.getSharedTasks).toHaveBeenCalledWith(
        TEAM_ID,
        USER_ID,
        undefined,
        false,
        'proj-1',
      );
    });

    it('should pass userId filter when provided', async () => {
      flowService.getSharedTasks.mockResolvedValue([]);

      await controller.getSharedTasks(TEAM_ID, 'other-user', undefined, undefined, mockRequest);

      expect(flowService.getSharedTasks).toHaveBeenCalledWith(
        TEAM_ID,
        USER_ID,
        'other-user',
        false,
        null,
      );
    });
  });

  describe('createSharedTask', () => {
    it('should create and return a shared task', async () => {
      const mockTask = { id: 'st-new', title: 'Shared task' } as any;
      flowService.createSharedTask.mockResolvedValue(mockTask);
      const dto = { title: 'Shared task', status: SharedTaskStatus.IN_PROGRESS } as any;

      const result = await controller.createSharedTask(TEAM_ID, dto, mockRequest);

      expect(result).toEqual(mockTask);
      expect(flowService.createSharedTask).toHaveBeenCalledWith(TEAM_ID, USER_ID, dto);
    });
  });

  describe('updateSharedTask', () => {
    it('should update and return a shared task', async () => {
      const mockTask = { id: 'st-1', title: 'Updated task' } as any;
      flowService.updateSharedTask.mockResolvedValue(mockTask);
      const dto = { title: 'Updated task' } as any;

      const result = await controller.updateSharedTask(TEAM_ID, 'st-1', dto, mockRequest);

      expect(result).toEqual(mockTask);
      expect(flowService.updateSharedTask).toHaveBeenCalledWith(TEAM_ID, 'st-1', USER_ID, dto);
    });
  });

  describe('deleteSharedTask', () => {
    it('should delete shared task and return success message', async () => {
      flowService.deleteSharedTask.mockResolvedValue(undefined);

      const result = await controller.deleteSharedTask('st-1', mockRequest);

      expect(result).toEqual({ message: 'Shared task deleted successfully' });
      expect(flowService.deleteSharedTask).toHaveBeenCalledWith('st-1', USER_ID);
    });
  });

  // ==========================================================================
  // Notifications
  // ==========================================================================

  describe('createNotification', () => {
    it('should set userId from request when not in dto', async () => {
      const mockNotification = { id: 'notif-1', userId: USER_ID, message: 'Hello' } as any;
      flowService.createNotification.mockResolvedValue(mockNotification);
      const dto = { type: 'info', message: 'Hello' } as any;

      const result = await controller.createNotification(dto, mockRequest);

      expect(result).toEqual(mockNotification);
      expect(dto.userId).toBe(USER_ID);
      expect(flowService.createNotification).toHaveBeenCalledWith(dto);
    });

    it('should not override userId if already set in dto', async () => {
      const mockNotification = { id: 'notif-1', userId: 'other-user', message: 'Hello' } as any;
      flowService.createNotification.mockResolvedValue(mockNotification);
      const dto = { type: 'info', message: 'Hello', userId: 'other-user' } as any;

      await controller.createNotification(dto, mockRequest);

      expect(dto.userId).toBe('other-user');
    });
  });

  describe('getNotifications', () => {
    it('should get notifications for current user', async () => {
      const mockNotifications = [{ id: 'notif-1', message: 'Hello', isRead: false }] as any;
      flowService.getNotifications.mockResolvedValue(mockNotifications);

      const result = await controller.getNotifications(undefined, mockRequest);

      expect(result).toEqual(mockNotifications);
      expect(flowService.getNotifications).toHaveBeenCalledWith(USER_ID, null);
    });

    it('should pass guestName when provided', async () => {
      flowService.getNotifications.mockResolvedValue([]);

      await controller.getNotifications('guest-alice', mockRequest);

      expect(flowService.getNotifications).toHaveBeenCalledWith(USER_ID, 'guest-alice');
    });
  });

  describe('markNotificationsRead', () => {
    it('should mark notifications as read', async () => {
      flowService.markNotificationsRead.mockResolvedValue(undefined);

      const result = await controller.markNotificationsRead(
        { notificationIds: ['notif-1', 'notif-2'] },
        mockRequest,
      );

      expect(result).toEqual({ message: 'Notifications marked as read' });
      expect(flowService.markNotificationsRead).toHaveBeenCalledWith(
        USER_ID,
        null,
        ['notif-1', 'notif-2'],
      );
    });

    it('should pass guestName when provided', async () => {
      flowService.markNotificationsRead.mockResolvedValue(undefined);

      await controller.markNotificationsRead(
        { notificationIds: ['notif-1'], guestName: 'alice' },
        mockRequest,
      );

      expect(flowService.markNotificationsRead).toHaveBeenCalledWith(USER_ID, 'alice', ['notif-1']);
    });
  });

  // ==========================================================================
  // Team Files
  // ==========================================================================

  describe('getTeamFiles', () => {
    it('should return files for a team', async () => {
      const mockFiles = [{ id: 'file-1', name: 'README.md', isFolder: false }] as any;
      flowService.getTeamFiles.mockResolvedValue(mockFiles);

      const result = await controller.getTeamFiles(TEAM_ID, mockRequest);

      expect(result).toEqual(mockFiles);
      expect(flowService.getTeamFiles).toHaveBeenCalledWith(TEAM_ID, USER_ID);
    });
  });

  describe('getTeamFile', () => {
    it('should return a single file with content', async () => {
      const mockFile = { id: 'file-1', name: 'README.md', content: '# README' } as any;
      flowService.getTeamFile.mockResolvedValue(mockFile);

      const result = await controller.getTeamFile(TEAM_ID, 'file-1', mockRequest);

      expect(result).toEqual(mockFile);
      expect(flowService.getTeamFile).toHaveBeenCalledWith(TEAM_ID, 'file-1', USER_ID);
    });
  });

  describe('createTeamFile', () => {
    it('should create and return a file', async () => {
      const mockFile = { id: 'file-new', name: 'README.md', isFolder: false } as any;
      flowService.createTeamFile.mockResolvedValue(mockFile);
      const dto = { name: 'README.md', fileType: 'markdown' } as any;

      const result = await controller.createTeamFile(TEAM_ID, dto, mockRequest);

      expect(result).toEqual(mockFile);
      expect(flowService.createTeamFile).toHaveBeenCalledWith(TEAM_ID, USER_ID, dto);
    });
  });

  describe('updateTeamFile', () => {
    it('should update and return a file', async () => {
      const mockFile = { id: 'file-1', name: 'UPDATED.md' } as any;
      flowService.updateTeamFile.mockResolvedValue(mockFile);
      const dto = { name: 'UPDATED.md' } as any;

      const result = await controller.updateTeamFile(TEAM_ID, 'file-1', dto, mockRequest);

      expect(result).toEqual(mockFile);
      expect(flowService.updateTeamFile).toHaveBeenCalledWith(TEAM_ID, 'file-1', USER_ID, dto);
    });
  });

  describe('deleteTeamFile', () => {
    it('should delete file and return success message', async () => {
      flowService.deleteTeamFile.mockResolvedValue(undefined);

      const result = await controller.deleteTeamFile(TEAM_ID, 'file-1', mockRequest);

      expect(result).toEqual({ message: 'File deleted successfully' });
      expect(flowService.deleteTeamFile).toHaveBeenCalledWith(TEAM_ID, 'file-1', USER_ID);
    });
  });

  // ==========================================================================
  // Profiles
  // ==========================================================================

  describe('getProfiles', () => {
    it('should return all profiles when no filter', async () => {
      const mockProfiles = [{ id: USER_ID, displayName: 'Test User' }] as any;
      flowService.getProfiles.mockResolvedValue(mockProfiles);

      const result = await controller.getProfiles(undefined, mockRequest);

      expect(result).toEqual(mockProfiles);
      expect(flowService.getProfiles).toHaveBeenCalledWith(undefined);
    });

    it('should split comma-separated userIds and pass as array', async () => {
      flowService.getProfiles.mockResolvedValue([]);

      await controller.getProfiles('user-1,user-2,user-3', mockRequest);

      expect(flowService.getProfiles).toHaveBeenCalledWith(['user-1', 'user-2', 'user-3']);
    });
  });

  describe('getProfile', () => {
    it('should return a single profile by userId', async () => {
      const mockProfile = { id: USER_ID, displayName: 'Test User' } as any;
      flowService.getProfile.mockResolvedValue(mockProfile);

      const result = await controller.getProfile(USER_ID, mockRequest);

      expect(result).toEqual(mockProfile);
      expect(flowService.getProfile).toHaveBeenCalledWith(USER_ID);
    });

    it('should return null when profile not found', async () => {
      flowService.getProfile.mockResolvedValue(null);

      const result = await controller.getProfile('nonexistent', mockRequest);

      expect(result).toBeNull();
    });
  });
});

// ==========================================================================
// FlowGlobalController
// ==========================================================================

describe('FlowGlobalController', () => {
  let controller: FlowGlobalController;
  let flowService: jest.Mocked<FlowService>;

  const USER_ID = 'user-uuid-001';
  const mockRequest = { user: { id: USER_ID, email: 'test@example.com' } } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FlowGlobalController],
      providers: [
        {
          provide: FlowService,
          useValue: {
            getProfiles: jest.fn(),
            getProfile: jest.fn(),
            getJourneyTemplates: jest.fn(),
            getJourneyTemplateBySlug: jest.fn(),
            getLearningProgress: jest.fn(),
            createOrUpdateLearningProgress: jest.fn(),
            sendPresenceHeartbeat: jest.fn(),
            getOnlineUsers: jest.fn(),
            getGlobalTimerState: jest.fn(),
            createGlobalTimerState: jest.fn(),
            updateTimerState: jest.fn(),
            getMyTasks: jest.fn(),
          },
        },
      ],
    })
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      .overrideGuard(require('@/auth/guards/jwt-auth.guard').JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<FlowGlobalController>(FlowGlobalController);
    flowService = module.get(FlowService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getProfiles', () => {
    it('should return all profiles when no filter', async () => {
      const mockProfiles = [{ id: USER_ID, displayName: 'Test User' }] as any;
      flowService.getProfiles.mockResolvedValue(mockProfiles);

      const result = await controller.getProfiles(undefined, mockRequest);

      expect(result).toEqual(mockProfiles);
      expect(flowService.getProfiles).toHaveBeenCalledWith(undefined);
    });

    it('should split comma-separated userIds', async () => {
      flowService.getProfiles.mockResolvedValue([]);

      await controller.getProfiles('user-1,user-2', mockRequest);

      expect(flowService.getProfiles).toHaveBeenCalledWith(['user-1', 'user-2']);
    });
  });

  describe('getProfile', () => {
    it('should return profile by userId', async () => {
      const mockProfile = { id: USER_ID, displayName: 'Test User' } as any;
      flowService.getProfile.mockResolvedValue(mockProfile);

      const result = await controller.getProfile(USER_ID, mockRequest);

      expect(result).toEqual(mockProfile);
      expect(flowService.getProfile).toHaveBeenCalledWith(USER_ID);
    });
  });

  describe('getJourneyTemplates', () => {
    it('should return all journey templates', async () => {
      const mockTemplates = [{ id: 'tmpl-1', slug: 'onboarding', name: 'Onboarding' }] as any;
      flowService.getJourneyTemplates.mockResolvedValue(mockTemplates);

      const result = await controller.getJourneyTemplates();

      expect(result).toEqual(mockTemplates);
      expect(flowService.getJourneyTemplates).toHaveBeenCalled();
    });

    it('should return empty array when no templates', async () => {
      flowService.getJourneyTemplates.mockResolvedValue([]);

      const result = await controller.getJourneyTemplates();

      expect(result).toEqual([]);
    });
  });

  describe('getJourneyTemplateBySlug', () => {
    it('should return template by slug', async () => {
      const mockTemplate = { id: 'tmpl-1', slug: 'onboarding' } as any;
      flowService.getJourneyTemplateBySlug.mockResolvedValue(mockTemplate);

      const result = await controller.getJourneyTemplateBySlug('onboarding');

      expect(result).toEqual(mockTemplate);
      expect(flowService.getJourneyTemplateBySlug).toHaveBeenCalledWith('onboarding');
    });
  });

  describe('getLearningProgress', () => {
    it('should return learning progress for current user', async () => {
      const mockProgress = [{ id: 'prog-1', templateSlug: 'onboarding' }] as any;
      flowService.getLearningProgress.mockResolvedValue(mockProgress);

      const result = await controller.getLearningProgress(mockRequest);

      expect(result).toEqual(mockProgress);
      expect(flowService.getLearningProgress).toHaveBeenCalledWith(USER_ID);
    });
  });

  describe('createOrUpdateLearningProgress', () => {
    it('should create or update learning progress', async () => {
      const mockProgress = { id: 'prog-1', templateSlug: 'onboarding', stepIndex: 1 } as any;
      flowService.createOrUpdateLearningProgress.mockResolvedValue(mockProgress);
      const dto = { templateSlug: 'onboarding', stepIndex: 1 } as any;

      const result = await controller.createOrUpdateLearningProgress(dto, mockRequest);

      expect(result).toEqual(mockProgress);
      expect(flowService.createOrUpdateLearningProgress).toHaveBeenCalledWith(USER_ID, dto);
    });
  });

  describe('sendHeartbeat', () => {
    it('should send presence heartbeat for current user', async () => {
      flowService.sendPresenceHeartbeat.mockResolvedValue(undefined);

      await controller.sendHeartbeat(mockRequest);

      expect(flowService.sendPresenceHeartbeat).toHaveBeenCalledWith(USER_ID);
    });
  });

  describe('getOnlineUsers', () => {
    it('should return list of online user IDs', async () => {
      const onlineUsers = ['user-1', 'user-2', 'user-3'];
      flowService.getOnlineUsers.mockResolvedValue(onlineUsers);

      const result = await controller.getOnlineUsers();

      expect(result).toEqual(onlineUsers);
      expect(flowService.getOnlineUsers).toHaveBeenCalled();
    });

    it('should return empty array when no users online', async () => {
      flowService.getOnlineUsers.mockResolvedValue([]);

      const result = await controller.getOnlineUsers();

      expect(result).toEqual([]);
    });
  });

  describe('getGlobalTimerState', () => {
    it('should return global timer state', async () => {
      const mockTimer = { id: 'timer-1', isRunning: true, durationSeconds: 1500 } as any;
      flowService.getGlobalTimerState.mockResolvedValue(mockTimer);

      const result = await controller.getGlobalTimerState();

      expect(result).toEqual(mockTimer);
      expect(flowService.getGlobalTimerState).toHaveBeenCalled();
    });

    it('should return null when no timer active', async () => {
      flowService.getGlobalTimerState.mockResolvedValue(null);

      const result = await controller.getGlobalTimerState();

      expect(result).toBeNull();
    });
  });

  describe('createGlobalTimerState', () => {
    it('should create global timer state', async () => {
      const mockTimer = { id: 'timer-new', isRunning: false, durationSeconds: 1500 } as any;
      flowService.createGlobalTimerState.mockResolvedValue(mockTimer);
      const dto = { durationSeconds: 1500 } as any;

      const result = await controller.createGlobalTimerState(dto);

      expect(result).toEqual(mockTimer);
      expect(flowService.createGlobalTimerState).toHaveBeenCalledWith(dto);
    });
  });

  describe('updateGlobalTimerState', () => {
    it('should update global timer state using updateTimerState', async () => {
      const mockTimer = { id: 'timer-1', isRunning: false } as any;
      flowService.updateTimerState.mockResolvedValue(mockTimer);
      const dto = { isRunning: false } as any;

      const result = await controller.updateGlobalTimerState('timer-1', dto, mockRequest);

      expect(result).toEqual(mockTimer);
      expect(flowService.updateTimerState).toHaveBeenCalledWith('timer-1', USER_ID, dto);
    });
  });

  describe('getMyTasks', () => {
    it('should return current user tasks across all teams with no filter', async () => {
      const mockTasks = [{ id: 'task-1', title: 'My task' }] as any;
      flowService.getMyTasks.mockResolvedValue(mockTasks);

      const result = await controller.getMyTasks(undefined, mockRequest);

      expect(result).toEqual(mockTasks);
      expect(flowService.getMyTasks).toHaveBeenCalledWith(USER_ID, []);
    });

    it('should parse comma-separated statuses filter', async () => {
      flowService.getMyTasks.mockResolvedValue([]);

      await controller.getMyTasks('in_progress,today', mockRequest);

      expect(flowService.getMyTasks).toHaveBeenCalledWith(USER_ID, ['in_progress', 'today']);
    });

    it('should return empty array when no tasks match filter', async () => {
      flowService.getMyTasks.mockResolvedValue([]);

      const result = await controller.getMyTasks('done', mockRequest);

      expect(result).toEqual([]);
    });
  });
});
