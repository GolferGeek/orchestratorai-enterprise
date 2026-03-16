import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { TeamsController } from '../teams.controller';
import { TeamsService } from '../teams.service';
import {
  CreateTeamDto,
  UpdateTeamDto,
  AddTeamMemberDto,
  UpdateTeamMemberDto,
  TeamResponseDto,
  TeamMemberResponseDto,
  UserContextResponseDto,
  TeamMemberRole,
} from '../teams.dto';

describe('TeamsController', () => {
  let controller: TeamsController;
  let teamsService: jest.Mocked<TeamsService>;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
  };

  const mockTeamResponse: TeamResponseDto = {
    id: 'team-123',
    orgSlug: 'test-org',
    name: 'Test Team',
    description: 'A test team',
    memberCount: 5,
    createdBy: 'user-123',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockTeamMemberResponse: TeamMemberResponseDto = {
    id: 'member-123',
    userId: 'user-456',
    email: 'member@example.com',
    displayName: 'Test Member',
    role: TeamMemberRole.MEMBER,
    joinedAt: new Date('2024-01-01'),
  };

  const mockUserContext: UserContextResponseDto = {
    user: {
      id: 'user-123',
      email: 'test@example.com',
      displayName: 'Test User',
    },
    organizations: [
      {
        slug: 'test-org',
        name: 'Test Organization',
        role: 'admin',
        isGlobal: false,
      },
    ],
    teams: [
      {
        id: 'team-123',
        name: 'Test Team',
        description: 'A test team',
        orgSlug: 'test-org',
        role: 'member',
        joinedAt: new Date('2024-01-01'),
      },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TeamsController],
      providers: [
        {
          provide: TeamsService,
          useValue: {
            getUserContext: jest.fn(),
            getGlobalTeams: jest.fn(),
            getTeamsByOrg: jest.fn(),
            createTeam: jest.fn(),
            getTeamById: jest.fn(),
            updateTeam: jest.fn(),
            deleteTeam: jest.fn(),
            getTeamMembers: jest.fn(),
            addTeamMember: jest.fn(),
            updateTeamMember: jest.fn(),
            removeTeamMember: jest.fn(),
          },
        },
      ],
    })
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      .overrideGuard(require('@/auth/guards/jwt-auth.guard').JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TeamsController>(TeamsController);
    teamsService = module.get(TeamsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserContext', () => {
    it('should get user context successfully', async () => {
      teamsService.getUserContext.mockResolvedValue(mockUserContext);

      const result = await controller.getUserContext({
        user: mockUser,
      } as any);

      expect(result).toEqual(mockUserContext);
      expect(teamsService.getUserContext).toHaveBeenCalledWith('user-123');
    });

    it('should handle user not found error', async () => {
      teamsService.getUserContext.mockRejectedValue(
        new NotFoundException('User not found'),
      );

      await expect(
        controller.getUserContext({ user: mockUser } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getGlobalTeams', () => {
    it('should get all global teams', async () => {
      const mockTeams: TeamResponseDto[] = [
        { ...mockTeamResponse, orgSlug: null },
        { ...mockTeamResponse, id: 'team-456', orgSlug: null },
      ];

      teamsService.getGlobalTeams.mockResolvedValue(mockTeams);

      const result = await controller.getGlobalTeams();

      expect(result).toEqual(mockTeams);
      expect(teamsService.getGlobalTeams).toHaveBeenCalled();
    });

    it('should return empty array when no global teams exist', async () => {
      teamsService.getGlobalTeams.mockResolvedValue([]);

      const result = await controller.getGlobalTeams();

      expect(result).toEqual([]);
    });

    it('should handle service errors', async () => {
      teamsService.getGlobalTeams.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(controller.getGlobalTeams()).rejects.toThrow(
        'Database error',
      );
    });
  });

  describe('createGlobalTeam', () => {
    it('should create a global team successfully', async () => {
      const createDto: CreateTeamDto = {
        name: 'New Global Team',
        description: 'A new global team',
      };

      const mockCreatedTeam: TeamResponseDto = {
        ...mockTeamResponse,
        orgSlug: null,
        name: createDto.name,
        description: createDto.description,
      };

      teamsService.createTeam.mockResolvedValue(mockCreatedTeam);

      const result = await controller.createGlobalTeam(createDto, {
        user: mockUser,
      } as any);

      expect(result).toEqual(mockCreatedTeam);
      expect(teamsService.createTeam).toHaveBeenCalledWith(
        null,
        'New Global Team',
        'A new global team',
        'user-123',
      );
    });

    it('should create an org-scoped team when orgSlug provided', async () => {
      const createDto: CreateTeamDto = {
        name: 'New Org Team',
        description: 'A new org team',
        orgSlug: 'test-org',
      };

      teamsService.createTeam.mockResolvedValue(mockTeamResponse);

      const result = await controller.createGlobalTeam(createDto, {
        user: mockUser,
      } as any);

      expect(result).toEqual(mockTeamResponse);
      expect(teamsService.createTeam).toHaveBeenCalledWith(
        'test-org',
        'New Org Team',
        'A new org team',
        'user-123',
      );
    });

    it('should handle forbidden error for non-admin', async () => {
      const createDto: CreateTeamDto = {
        name: 'New Team',
      };

      teamsService.createTeam.mockRejectedValue(
        new ForbiddenException('Only admins can create global teams'),
      );

      await expect(
        controller.createGlobalTeam(createDto, { user: mockUser } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should handle conflict error for duplicate team name', async () => {
      const createDto: CreateTeamDto = {
        name: 'Existing Team',
      };

      teamsService.createTeam.mockRejectedValue(
        new ConflictException('A global team with this name already exists'),
      );

      await expect(
        controller.createGlobalTeam(createDto, { user: mockUser } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getOrgTeams', () => {
    it('should get teams for organization', async () => {
      const mockTeams: TeamResponseDto[] = [
        mockTeamResponse,
        { ...mockTeamResponse, id: 'team-456' },
      ];

      teamsService.getTeamsByOrg.mockResolvedValue(mockTeams);

      const result = await controller.getOrgTeams('test-org');

      expect(result).toEqual(mockTeams);
      expect(teamsService.getTeamsByOrg).toHaveBeenCalledWith('test-org');
    });

    it('should return empty array when org has no teams', async () => {
      teamsService.getTeamsByOrg.mockResolvedValue([]);

      const result = await controller.getOrgTeams('empty-org');

      expect(result).toEqual([]);
    });
  });

  describe('createOrgTeam', () => {
    it('should create team in organization', async () => {
      const createDto: CreateTeamDto = {
        name: 'New Team',
        description: 'Team description',
      };

      teamsService.createTeam.mockResolvedValue(mockTeamResponse);

      const result = await controller.createOrgTeam('test-org', createDto, {
        user: mockUser,
      } as any);

      expect(result).toEqual(mockTeamResponse);
      expect(teamsService.createTeam).toHaveBeenCalledWith(
        'test-org',
        'New Team',
        'Team description',
        'user-123',
      );
    });

    it('should handle forbidden error for non-admin', async () => {
      const createDto: CreateTeamDto = {
        name: 'New Team',
      };

      teamsService.createTeam.mockRejectedValue(
        new ForbiddenException(
          'Only admins can create teams in this organization',
        ),
      );

      await expect(
        controller.createOrgTeam('test-org', createDto, {
          user: mockUser,
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should handle conflict error for duplicate name in org', async () => {
      const createDto: CreateTeamDto = {
        name: 'Existing Team',
      };

      teamsService.createTeam.mockRejectedValue(
        new ConflictException(
          'A team with this name already exists in this organization',
        ),
      );

      await expect(
        controller.createOrgTeam('test-org', createDto, {
          user: mockUser,
        } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getTeam', () => {
    it('should get team by ID', async () => {
      teamsService.getTeamById.mockResolvedValue(mockTeamResponse);

      const result = await controller.getTeam('team-123');

      expect(result).toEqual(mockTeamResponse);
      expect(teamsService.getTeamById).toHaveBeenCalledWith('team-123');
    });

    it('should handle team not found', async () => {
      teamsService.getTeamById.mockRejectedValue(
        new NotFoundException('Team not found'),
      );

      await expect(controller.getTeam('nonexistent-team')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateTeam', () => {
    it('should update team successfully', async () => {
      const updateDto: UpdateTeamDto = {
        name: 'Updated Team',
        description: 'Updated description',
      };

      const updatedTeam: TeamResponseDto = {
        ...mockTeamResponse,
        name: 'Updated Team',
        description: 'Updated description',
      };

      teamsService.updateTeam.mockResolvedValue(updatedTeam);

      const result = await controller.updateTeam('team-123', updateDto, {
        user: mockUser,
      } as any);

      expect(result).toEqual(updatedTeam);
      expect(teamsService.updateTeam).toHaveBeenCalledWith(
        'team-123',
        'user-123',
        updateDto,
      );
    });

    it('should update only name', async () => {
      const updateDto: UpdateTeamDto = {
        name: 'New Name',
      };

      teamsService.updateTeam.mockResolvedValue({
        ...mockTeamResponse,
        name: 'New Name',
      });

      await controller.updateTeam('team-123', updateDto, {
        user: mockUser,
      } as any);

      expect(teamsService.updateTeam).toHaveBeenCalledWith(
        'team-123',
        'user-123',
        { name: 'New Name' },
      );
    });

    it('should update only description', async () => {
      const updateDto: UpdateTeamDto = {
        description: 'New description',
      };

      teamsService.updateTeam.mockResolvedValue({
        ...mockTeamResponse,
        description: 'New description',
      });

      await controller.updateTeam('team-123', updateDto, {
        user: mockUser,
      } as any);

      expect(teamsService.updateTeam).toHaveBeenCalledWith(
        'team-123',
        'user-123',
        { description: 'New description' },
      );
    });

    it('should handle forbidden error for non-admin', async () => {
      const updateDto: UpdateTeamDto = {
        name: 'New Name',
      };

      teamsService.updateTeam.mockRejectedValue(
        new ForbiddenException('Only admins can update teams'),
      );

      await expect(
        controller.updateTeam('team-123', updateDto, { user: mockUser } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should handle team not found', async () => {
      const updateDto: UpdateTeamDto = {
        name: 'New Name',
      };

      teamsService.updateTeam.mockRejectedValue(
        new NotFoundException('Team not found'),
      );

      await expect(
        controller.updateTeam('nonexistent', updateDto, {
          user: mockUser,
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle conflict error for duplicate name', async () => {
      const updateDto: UpdateTeamDto = {
        name: 'Existing Team Name',
      };

      teamsService.updateTeam.mockRejectedValue(
        new ConflictException(
          'A team with this name already exists in this organization',
        ),
      );

      await expect(
        controller.updateTeam('team-123', updateDto, { user: mockUser } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('deleteTeam', () => {
    it('should delete team successfully', async () => {
      teamsService.deleteTeam.mockResolvedValue(undefined);

      const result = await controller.deleteTeam('team-123', {
        user: mockUser,
      } as any);

      expect(result).toEqual({ message: 'Team deleted successfully' });
      expect(teamsService.deleteTeam).toHaveBeenCalledWith(
        'team-123',
        'user-123',
      );
    });

    it('should handle forbidden error for non-admin', async () => {
      teamsService.deleteTeam.mockRejectedValue(
        new ForbiddenException('Only admins can delete teams'),
      );

      await expect(
        controller.deleteTeam('team-123', { user: mockUser } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should handle team not found', async () => {
      teamsService.deleteTeam.mockRejectedValue(
        new NotFoundException('Team not found'),
      );

      await expect(
        controller.deleteTeam('nonexistent', { user: mockUser } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getTeamMembers', () => {
    it('should get team members', async () => {
      const mockMembers: TeamMemberResponseDto[] = [
        mockTeamMemberResponse,
        {
          ...mockTeamMemberResponse,
          id: 'member-456',
          userId: 'user-789',
          email: 'another@example.com',
        },
      ];

      teamsService.getTeamMembers.mockResolvedValue(mockMembers);

      const result = await controller.getTeamMembers('team-123');

      expect(result).toEqual(mockMembers);
      expect(teamsService.getTeamMembers).toHaveBeenCalledWith('team-123');
    });

    it('should return empty array when team has no members', async () => {
      teamsService.getTeamMembers.mockResolvedValue([]);

      const result = await controller.getTeamMembers('team-123');

      expect(result).toEqual([]);
    });

    it('should handle team not found', async () => {
      teamsService.getTeamMembers.mockRejectedValue(
        new NotFoundException('Team not found'),
      );

      await expect(controller.getTeamMembers('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('addTeamMember', () => {
    it('should add team member with specified role', async () => {
      const addDto: AddTeamMemberDto = {
        userId: 'user-456',
        role: TeamMemberRole.LEAD,
      };

      teamsService.addTeamMember.mockResolvedValue({
        ...mockTeamMemberResponse,
        role: TeamMemberRole.LEAD,
      });

      const result = await controller.addTeamMember('team-123', addDto, {
        user: mockUser,
      } as any);

      expect(result.role).toBe(TeamMemberRole.LEAD);
      expect(teamsService.addTeamMember).toHaveBeenCalledWith(
        'team-123',
        'user-456',
        TeamMemberRole.LEAD,
        'user-123',
      );
    });

    it('should add team member with default MEMBER role', async () => {
      const addDto: AddTeamMemberDto = {
        userId: 'user-456',
      };

      teamsService.addTeamMember.mockResolvedValue(mockTeamMemberResponse);

      await controller.addTeamMember('team-123', addDto, {
        user: mockUser,
      } as any);

      expect(teamsService.addTeamMember).toHaveBeenCalledWith(
        'team-123',
        'user-456',
        TeamMemberRole.MEMBER,
        'user-123',
      );
    });

    it('should handle forbidden error for non-admin', async () => {
      const addDto: AddTeamMemberDto = {
        userId: 'user-456',
      };

      teamsService.addTeamMember.mockRejectedValue(
        new ForbiddenException('Only admins can add team members'),
      );

      await expect(
        controller.addTeamMember('team-123', addDto, { user: mockUser } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should handle conflict error when user already a member', async () => {
      const addDto: AddTeamMemberDto = {
        userId: 'user-456',
      };

      teamsService.addTeamMember.mockRejectedValue(
        new ConflictException('User is already a member of this team'),
      );

      await expect(
        controller.addTeamMember('team-123', addDto, { user: mockUser } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('should handle team not found', async () => {
      const addDto: AddTeamMemberDto = {
        userId: 'user-456',
      };

      teamsService.addTeamMember.mockRejectedValue(
        new NotFoundException('Team not found'),
      );

      await expect(
        controller.addTeamMember('nonexistent', addDto, {
          user: mockUser,
        } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateTeamMember', () => {
    it('should update team member role', async () => {
      const updateDto: UpdateTeamMemberDto = {
        role: TeamMemberRole.ADMIN,
      };

      const updatedMember: TeamMemberResponseDto = {
        ...mockTeamMemberResponse,
        role: TeamMemberRole.ADMIN,
      };

      teamsService.updateTeamMember.mockResolvedValue(updatedMember);

      const result = await controller.updateTeamMember(
        'team-123',
        'user-456',
        updateDto,
        { user: mockUser } as any,
      );

      expect(result.role).toBe(TeamMemberRole.ADMIN);
      expect(teamsService.updateTeamMember).toHaveBeenCalledWith(
        'team-123',
        'user-456',
        TeamMemberRole.ADMIN,
        'user-123',
      );
    });

    it('should handle forbidden error for non-admin', async () => {
      const updateDto: UpdateTeamMemberDto = {
        role: TeamMemberRole.LEAD,
      };

      teamsService.updateTeamMember.mockRejectedValue(
        new ForbiddenException('Only admins can update team member roles'),
      );

      await expect(
        controller.updateTeamMember('team-123', 'user-456', updateDto, {
          user: mockUser,
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should handle team member not found', async () => {
      const updateDto: UpdateTeamMemberDto = {
        role: TeamMemberRole.LEAD,
      };

      teamsService.updateTeamMember.mockRejectedValue(
        new NotFoundException('Team member not found'),
      );

      await expect(
        controller.updateTeamMember('team-123', 'nonexistent', updateDto, {
          user: mockUser,
        } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeTeamMember', () => {
    it('should remove team member successfully', async () => {
      teamsService.removeTeamMember.mockResolvedValue(undefined);

      const result = await controller.removeTeamMember('team-123', 'user-456', {
        user: mockUser,
      } as any);

      expect(result).toEqual({ message: 'Member removed successfully' });
      expect(teamsService.removeTeamMember).toHaveBeenCalledWith(
        'team-123',
        'user-456',
        'user-123',
      );
    });

    it('should allow user to remove themselves', async () => {
      teamsService.removeTeamMember.mockResolvedValue(undefined);

      await controller.removeTeamMember('team-123', 'user-123', {
        user: mockUser,
      } as any);

      expect(teamsService.removeTeamMember).toHaveBeenCalledWith(
        'team-123',
        'user-123',
        'user-123',
      );
    });

    it('should handle forbidden error for non-admin removing others', async () => {
      teamsService.removeTeamMember.mockRejectedValue(
        new ForbiddenException('Only admins can remove other team members'),
      );

      await expect(
        controller.removeTeamMember('team-123', 'user-456', {
          user: mockUser,
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should handle team member not found', async () => {
      teamsService.removeTeamMember.mockRejectedValue(
        new NotFoundException('Team member not found'),
      );

      await expect(
        controller.removeTeamMember('team-123', 'nonexistent', {
          user: mockUser,
        } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Authentication and Authorization', () => {
    it('should use authenticated user ID for all operations', async () => {
      teamsService.createTeam.mockResolvedValue(mockTeamResponse);
      teamsService.updateTeam.mockResolvedValue(mockTeamResponse);
      teamsService.deleteTeam.mockResolvedValue(undefined);
      teamsService.addTeamMember.mockResolvedValue(mockTeamMemberResponse);

      const createDto: CreateTeamDto = { name: 'Test' };
      await controller.createGlobalTeam(createDto, { user: mockUser } as any);
      expect(teamsService.createTeam).toHaveBeenCalledWith(
        null,
        'Test',
        undefined,
        'user-123',
      );

      const updateDto: UpdateTeamDto = { name: 'Updated' };
      await controller.updateTeam('team-123', updateDto, {
        user: mockUser,
      } as any);
      expect(teamsService.updateTeam).toHaveBeenCalledWith(
        'team-123',
        'user-123',
        updateDto,
      );

      await controller.deleteTeam('team-123', { user: mockUser } as any);
      expect(teamsService.deleteTeam).toHaveBeenCalledWith(
        'team-123',
        'user-123',
      );

      const addDto: AddTeamMemberDto = { userId: 'user-456' };
      await controller.addTeamMember('team-123', addDto, {
        user: mockUser,
      } as any);
      expect(teamsService.addTeamMember).toHaveBeenCalledWith(
        'team-123',
        'user-456',
        TeamMemberRole.MEMBER,
        'user-123',
      );
    });
  });

  describe('Error Handling', () => {
    it('should propagate service errors', async () => {
      const serviceError = new Error('Service error');
      teamsService.getTeamById.mockRejectedValue(serviceError);

      await expect(controller.getTeam('team-123')).rejects.toThrow(
        'Service error',
      );
    });

    it('should handle database errors gracefully', async () => {
      teamsService.getGlobalTeams.mockRejectedValue(
        new Error('Database connection failed'),
      );

      await expect(controller.getGlobalTeams()).rejects.toThrow(
        'Database connection failed',
      );
    });
  });

  describe('Request/Response Handling', () => {
    it('should handle requests with all optional fields', async () => {
      const createDto: CreateTeamDto = {
        name: 'Team',
        description: 'Description',
        orgSlug: 'org',
      };

      teamsService.createTeam.mockResolvedValue(mockTeamResponse);

      await controller.createGlobalTeam(createDto, { user: mockUser } as any);

      expect(teamsService.createTeam).toHaveBeenCalledWith(
        'org',
        'Team',
        'Description',
        'user-123',
      );
    });

    it('should handle requests with only required fields', async () => {
      const createDto: CreateTeamDto = {
        name: 'Team',
      };

      teamsService.createTeam.mockResolvedValue(mockTeamResponse);

      await controller.createGlobalTeam(createDto, { user: mockUser } as any);

      expect(teamsService.createTeam).toHaveBeenCalledWith(
        null,
        'Team',
        undefined,
        'user-123',
      );
    });

    it('should return correct response structure for team operations', async () => {
      teamsService.getTeamById.mockResolvedValue(mockTeamResponse);

      const result = await controller.getTeam('team-123');

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('memberCount');
      expect(result).toHaveProperty('createdAt');
      expect(result).toHaveProperty('updatedAt');
    });

    it('should return correct response structure for member operations', async () => {
      teamsService.getTeamMembers.mockResolvedValue([mockTeamMemberResponse]);

      const result = await controller.getTeamMembers('team-123');

      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('userId');
      expect(result[0]).toHaveProperty('email');
      expect(result[0]).toHaveProperty('role');
      expect(result[0]).toHaveProperty('joinedAt');
    });
  });
});
