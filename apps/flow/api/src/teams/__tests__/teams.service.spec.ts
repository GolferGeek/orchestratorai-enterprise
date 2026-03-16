import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { TeamsService } from '../teams.service';
import { DATABASE_SERVICE } from '@/database';
import { RbacService } from '../../rbac/rbac.service';
import { TeamMemberRole } from '../teams.dto';

describe('TeamsService', () => {
  let service: TeamsService;
  let rbacService: jest.Mocked<RbacService>;
  let mockSupabaseClient: any;

  beforeEach(async () => {
    // Create fresh mock for each test
    // The supabase client has a complex chaining API where methods return 'this' for chaining
    // EXCEPT terminal methods (.single(), .then()) which return promises
    //
    // Common patterns:
    // 1. .from().select().eq().single() - get one row
    // 2. .from().select().eq() - count query (eq returns promise with count)
    // 3. .from().insert().select().single() - insert and return
    // 4. .from().update().eq().select().single() - update and return
    //
    // The challenge: when tests use mockResolvedValueOnce on .eq(), it breaks the chain
    // Solution: Always keep .eq() returning 'this', only mock .single() return values
    mockSupabaseClient = {
      from: jest.fn(function (this: any) {
        return this;
      }),
      select: jest.fn(function (this: any) {
        return this;
      }),
      insert: jest.fn(function (this: any) {
        return this;
      }),
      update: jest.fn(function (this: any) {
        return this;
      }),
      delete: jest.fn(function (this: any) {
        return this;
      }),
      eq: jest.fn(function (this: any) {
        return this;
      }),
      is: jest.fn(function (this: any) {
        return this;
      }),
      in: jest.fn(function (this: any) {
        return this;
      }),
      order: jest.fn(function (this: any) {
        return this;
      }),
      single: jest.fn(),
      rpc: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamsService,
        {
          provide: DATABASE_SERVICE,
          useValue: mockSupabaseClient,
        },
        {
          provide: RbacService,
          useValue: {
            isAdmin: jest.fn(),
            getUserOrganizations: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TeamsService>(TeamsService);
    rbacService = module.get(RbacService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUserContext', () => {
    it('should return user context with orgs and teams', async () => {
      const userId = 'user-123';
      const mockUserData = {
        id: userId,
        email: 'test@example.com',
        display_name: 'Test User',
      };
      const mockOrgs = [
        {
          organizationSlug: 'org-1',
          organizationName: 'Org One',
          roleName: 'admin',
          isGlobal: false,
        },
      ];
      const mockTeams = [
        {
          team_id: 'team-1',
          team_name: 'Team One',
          team_description: 'First team',
          org_slug: 'org-1',
          member_role: 'lead',
          joined_at: '2024-01-01T00:00:00Z',
        },
      ];

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockUserData,
        error: null,
      });
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: mockTeams,
        error: null,
      });
      rbacService.getUserOrganizations.mockResolvedValue(mockOrgs);

      const result = await service.getUserContext(userId);

      expect(result.user).toEqual({
        id: userId,
        email: 'test@example.com',
        displayName: 'Test User',
      });
      expect(result.organizations).toHaveLength(1);
      expect(result.organizations[0]?.slug).toBe('org-1');
      expect(result.teams).toHaveLength(1);
      expect(result.teams[0]?.id).toBe('team-1');
      expect(result.teams[0]?.role).toBe('lead');
    });

    it('should throw NotFoundException if user not found', async () => {
      const userId = 'nonexistent';

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'User not found' },
      });

      await expect(service.getUserContext(userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should handle missing display_name gracefully', async () => {
      const userId = 'user-123';
      const mockUserData = {
        id: userId,
        email: 'test@example.com',
        display_name: null,
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockUserData,
        error: null,
      });
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: [],
        error: null,
      });
      rbacService.getUserOrganizations.mockResolvedValue([]);

      const result = await service.getUserContext(userId);

      expect(result.user.displayName).toBeUndefined();
    });
  });

  describe('getGlobalTeams', () => {
    it('should return global teams with member counts', async () => {
      const mockTeams = [
        {
          id: 'team-1',
          org_slug: null,
          name: 'Global Team',
          description: 'A global team',
          created_by: 'user-123',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      // First call: get teams
      mockSupabaseClient.order.mockResolvedValueOnce({
        data: mockTeams,
        error: null,
      });

      // Member count query ends with .eq() not .single()
      mockSupabaseClient.eq.mockResolvedValue({
        data: null,
        error: null,
        count: 5,
      });

      const result = await service.getGlobalTeams();

      expect(result).toHaveLength(1);
      expect(result[0]?.orgSlug).toBeNull();
      expect(result[0]?.memberCount).toBe(5);
    });

    it('should throw error on database failure', async () => {
      mockSupabaseClient.order.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      });

      await expect(service.getGlobalTeams()).rejects.toThrow(
        'Failed to get global teams: Database error',
      );
    });
  });

  describe('getTeamsByOrg', () => {
    it('should return teams for an organization', async () => {
      const orgSlug = 'org-1';
      const mockTeams = [
        {
          id: 'team-1',
          org_slug: orgSlug,
          name: 'Org Team',
          description: 'An org team',
          created_by: 'user-123',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      // First query: .from('teams').select('*').eq('org_slug', orgSlug).order('name')
      // .eq() must return this for .order() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.order.mockResolvedValueOnce({
        data: mockTeams,
        error: null,
      });

      // Second query: member count - .eq() returns promise with count
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: null,
        error: null,
        count: 3,
      });

      const result = await service.getTeamsByOrg(orgSlug);

      expect(result).toHaveLength(1);
      expect(result[0]?.orgSlug).toBe(orgSlug);
      expect(result[0]?.memberCount).toBe(3);
    });

    it('should throw error on database failure', async () => {
      mockSupabaseClient.order.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      });

      await expect(service.getTeamsByOrg('org-1')).rejects.toThrow(
        'Failed to get teams: Database error',
      );
    });
  });

  describe('getTeamById', () => {
    it('should return team by ID with member count', async () => {
      const teamId = 'team-123';
      const mockTeam = {
        id: teamId,
        org_slug: 'org-1',
        name: 'Test Team',
        description: 'A test team',
        created_by: 'user-123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // First query: .from('teams').select('*').eq('id', teamId).single()
      // .eq() must return this for .single() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockTeam,
        error: null,
      });

      // Second query: .from('team_members').select(...).eq('team_id', teamId)
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: null,
        error: null,
        count: 7,
      });

      const result = await service.getTeamById(teamId);

      expect(result.id).toBe(teamId);
      expect(result.name).toBe('Test Team');
      expect(result.memberCount).toBe(7);
    });

    it('should throw NotFoundException if team not found', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' },
      });

      await expect(service.getTeamById('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createTeam', () => {
    it('should create an org-scoped team when admin', async () => {
      const orgSlug = 'org-1';
      const name = 'New Team';
      const description = 'Team description';
      const createdBy = 'user-123';
      const mockTeam = {
        id: 'team-new',
        org_slug: orgSlug,
        name,
        description,
        created_by: createdBy,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      rbacService.isAdmin.mockResolvedValue(true);
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockTeam,
        error: null,
      });

      const result = await service.createTeam(
        orgSlug,
        name,
        description,
        createdBy,
      );

      expect(result.id).toBe('team-new');
      expect(result.orgSlug).toBe(orgSlug);
      expect(result.memberCount).toBe(0);
      expect(rbacService.isAdmin).toHaveBeenCalledWith(createdBy, orgSlug);
    });

    it('should create a global team when admin', async () => {
      const name = 'Global Team';
      const description = 'Global team description';
      const createdBy = 'user-123';
      const mockTeam = {
        id: 'team-global',
        org_slug: null,
        name,
        description,
        created_by: createdBy,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      rbacService.isAdmin.mockResolvedValue(true);
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockTeam,
        error: null,
      });

      const result = await service.createTeam(
        null,
        name,
        description,
        createdBy,
      );

      expect(result.id).toBe('team-global');
      expect(result.orgSlug).toBeNull();
      expect(rbacService.isAdmin).toHaveBeenCalledWith(createdBy, '*');
    });

    it('should throw ForbiddenException when user is not admin for org team', async () => {
      rbacService.isAdmin.mockResolvedValue(false);

      await expect(
        service.createTeam('org-1', 'Team', 'Description', 'user-123'),
      ).rejects.toThrow('Only admins can create teams in this organization');
    });

    it('should throw ForbiddenException when user is not admin for global team', async () => {
      rbacService.isAdmin.mockResolvedValue(false);

      await expect(
        service.createTeam(null, 'Team', 'Description', 'user-123'),
      ).rejects.toThrow('Only admins can create global teams');
    });

    it('should throw ConflictException on duplicate name', async () => {
      rbacService.isAdmin.mockResolvedValue(true);
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: '23505', message: 'Duplicate key' },
      });

      await expect(
        service.createTeam('org-1', 'Duplicate', 'Description', 'user-123'),
      ).rejects.toThrow(
        'A team with this name already exists in this organization',
      );
    });

    it('should throw BadRequestException on foreign key violation', async () => {
      rbacService.isAdmin.mockResolvedValue(true);
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: '23503', message: 'Foreign key violation' },
      });

      await expect(
        service.createTeam('nonexistent', 'Team', 'Description', 'user-123'),
      ).rejects.toThrow("Organization 'nonexistent' does not exist");
    });

    it('should throw ForbiddenException on RLS policy violation', async () => {
      rbacService.isAdmin.mockResolvedValue(true);
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: '42501', message: 'permission denied' },
      });

      await expect(
        service.createTeam('org-1', 'Team', 'Description', 'user-123'),
      ).rejects.toThrow(
        'You do not have permission to create teams in this organization',
      );
    });

    it('should throw InternalServerErrorException on other database errors', async () => {
      rbacService.isAdmin.mockResolvedValue(true);
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: '99999', message: 'Unknown error' },
      });

      await expect(
        service.createTeam('org-1', 'Team', 'Description', 'user-123'),
      ).rejects.toThrow('Failed to create team: Unknown error');
    });

    it('should re-throw ForbiddenException from isAdmin check', async () => {
      rbacService.isAdmin.mockRejectedValue(
        new ForbiddenException('Not authorized'),
      );

      await expect(
        service.createTeam('org-1', 'Team', 'Description', 'user-123'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw InternalServerErrorException on other errors during admin check', async () => {
      rbacService.isAdmin.mockRejectedValue(
        new Error('Database connection failed'),
      );

      await expect(
        service.createTeam('org-1', 'Team', 'Description', 'user-123'),
      ).rejects.toThrow('Failed to verify admin permissions');
    });
  });

  describe('updateTeam', () => {
    it('should update team when user is admin', async () => {
      const teamId = 'team-123';
      const userId = 'user-123';
      const updates = { name: 'Updated Team', description: 'New description' };
      const mockTeam = {
        id: teamId,
        org_slug: 'org-1',
        name: 'Original Team',
        description: 'Original description',
        created_by: userId,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      const mockUpdatedTeam = {
        ...mockTeam,
        name: updates.name,
        description: updates.description,
      };

      // First query: getTeamById - .eq() must return this for .single() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockTeam,
        error: null,
      });
      // Second query: getTeamById - member count
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: null,
        error: null,
        count: 5,
      });
      rbacService.isAdmin.mockResolvedValue(true);
      // Third query: update - .eq() must return this for .select() and .single() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockUpdatedTeam,
        error: null,
      });

      const result = await service.updateTeam(teamId, userId, updates);

      expect(result.name).toBe('Updated Team');
      expect(result.description).toBe('New description');
      expect(rbacService.isAdmin).toHaveBeenCalledWith(userId, 'org-1');
    });

    it('should update global team when user is admin', async () => {
      const teamId = 'team-global';
      const userId = 'user-123';
      const updates = { name: 'Updated Global Team' };
      const mockTeam = {
        id: teamId,
        org_slug: null,
        name: 'Original Global Team',
        created_by: userId,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      const mockUpdatedTeam = {
        ...mockTeam,
        name: updates.name,
      };

      // First query: getTeamById - .eq() must return this for .single() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockTeam,
        error: null,
      });
      // Second query: getTeamById - member count
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: null,
        error: null,
        count: 2,
      });
      rbacService.isAdmin.mockResolvedValue(true);
      // Third query: update - .eq() must return this for .select() and .single() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockUpdatedTeam,
        error: null,
      });

      const result = await service.updateTeam(teamId, userId, updates);

      expect(result.name).toBe('Updated Global Team');
      expect(rbacService.isAdmin).toHaveBeenCalledWith(userId, '*');
    });

    it('should throw ForbiddenException when user is not admin', async () => {
      const mockTeam = {
        id: 'team-123',
        org_slug: 'org-1',
        name: 'Team',
        created_by: 'user-123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // First query: getTeamById - .eq() must return this for .single() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockTeam,
        error: null,
      });
      // Second query: getTeamById - member count
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: null,
        error: null,
        count: 0,
      });
      rbacService.isAdmin.mockResolvedValue(false);

      await expect(
        service.updateTeam('team-123', 'user-456', { name: 'New Name' }),
      ).rejects.toThrow('Only admins can update teams');
    });

    it('should throw ConflictException on duplicate name', async () => {
      const mockTeam = {
        id: 'team-123',
        org_slug: 'org-1',
        name: 'Team',
        created_by: 'user-123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // First query: getTeamById - .eq() must return this for .single() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockTeam,
        error: null,
      });
      // Second query: getTeamById - member count
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: null,
        error: null,
        count: 0,
      });
      rbacService.isAdmin.mockResolvedValue(true);
      // Third query: update - .eq() must return this for .select() and .single() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: '23505', message: 'Duplicate' },
      });

      await expect(
        service.updateTeam('team-123', 'user-123', { name: 'Duplicate' }),
      ).rejects.toThrow(
        'A team with this name already exists in this organization',
      );
    });
  });

  describe('deleteTeam', () => {
    it('should delete team when user is admin', async () => {
      const teamId = 'team-123';
      const userId = 'user-123';
      const mockTeam = {
        id: teamId,
        org_slug: 'org-1',
        name: 'Team',
        created_by: userId,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // First query: getTeamById - .eq() must return this for .single() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockTeam,
        error: null,
      });
      // Second query: getTeamById - member count
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: null,
        error: null,
        count: 0,
      });
      rbacService.isAdmin.mockResolvedValue(true);
      // Third query: delete - .eq() returns promise
      mockSupabaseClient.eq.mockResolvedValueOnce({ data: null, error: null });

      await service.deleteTeam(teamId, userId);

      expect(mockSupabaseClient.delete).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user is not admin', async () => {
      const mockTeam = {
        id: 'team-123',
        org_slug: 'org-1',
        name: 'Team',
        created_by: 'user-123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // First query: getTeamById - .eq() must return this for .single() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockTeam,
        error: null,
      });
      // Second query: getTeamById - member count
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: null,
        error: null,
        count: 0,
      });
      rbacService.isAdmin.mockResolvedValue(false);

      await expect(service.deleteTeam('team-123', 'user-456')).rejects.toThrow(
        'Only admins can delete teams',
      );
    });

    it('should throw error on database failure', async () => {
      const mockTeam = {
        id: 'team-123',
        org_slug: 'org-1',
        name: 'Team',
        created_by: 'user-123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // First query: getTeamById - .eq() must return this for .single() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockTeam,
        error: null,
      });
      // Second query: getTeamById - member count
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: null,
        error: null,
        count: 0,
      });
      rbacService.isAdmin.mockResolvedValue(true);
      // Third query: delete - .eq() returns promise with error
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: null,
        error: { message: 'Delete failed' },
      });

      await expect(service.deleteTeam('team-123', 'user-123')).rejects.toThrow(
        'Failed to delete team: Delete failed',
      );
    });
  });

  describe('getTeamMembers', () => {
    it('should return team members with user details', async () => {
      const teamId = 'team-123';
      const mockMembers = [
        {
          id: 'member-1',
          team_id: teamId,
          user_id: 'user-1',
          role: 'lead',
          joined_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'member-2',
          team_id: teamId,
          user_id: 'user-2',
          role: 'member',
          joined_at: '2024-01-02T00:00:00Z',
        },
      ];
      const mockUsers = [
        { id: 'user-1', email: 'user1@example.com', display_name: 'User One' },
        { id: 'user-2', email: 'user2@example.com', display_name: null },
      ];

      mockSupabaseClient.order.mockResolvedValueOnce({
        data: mockMembers,
        error: null,
      });
      mockSupabaseClient.in.mockResolvedValueOnce({
        data: mockUsers,
        error: null,
      });

      const result = await service.getTeamMembers(teamId);

      expect(result).toHaveLength(2);
      expect(result[0]?.userId).toBe('user-1');
      expect(result[0]?.email).toBe('user1@example.com');
      expect(result[0]?.displayName).toBe('User One');
      expect(result[0]?.role).toBe(TeamMemberRole.LEAD);
      expect(result[1]?.displayName).toBeUndefined();
    });

    it('should return empty array when no members', async () => {
      mockSupabaseClient.order.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const result = await service.getTeamMembers('team-123');

      expect(result).toEqual([]);
    });

    it('should throw error on database failure', async () => {
      mockSupabaseClient.order.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      });

      await expect(service.getTeamMembers('team-123')).rejects.toThrow(
        'Failed to get team members: Database error',
      );
    });

    it('should throw error on user fetch failure', async () => {
      const mockMembers = [
        {
          id: 'member-1',
          team_id: 'team-123',
          user_id: 'user-1',
          role: 'member',
          joined_at: '2024-01-01T00:00:00Z',
        },
      ];

      mockSupabaseClient.order.mockResolvedValueOnce({
        data: mockMembers,
        error: null,
      });
      mockSupabaseClient.in.mockResolvedValueOnce({
        data: null,
        error: { message: 'User fetch failed' },
      });

      await expect(service.getTeamMembers('team-123')).rejects.toThrow(
        'Failed to get user details: User fetch failed',
      );
    });
  });

  describe('addTeamMember', () => {
    it('should add member to org-scoped team when admin and user in org', async () => {
      const teamId = 'team-123';
      const userId = 'user-456';
      const role = TeamMemberRole.MEMBER;
      const addedBy = 'user-123';
      const mockTeam = {
        id: teamId,
        org_slug: 'org-1',
        name: 'Team',
        created_by: addedBy,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      const mockMember = {
        id: 'member-new',
        team_id: teamId,
        user_id: userId,
        role,
        joined_at: '2024-01-01T00:00:00Z',
      };
      const mockUser = {
        id: userId,
        email: 'user@example.com',
        display_name: 'User Name',
      };

      // First query: getTeamById - .eq() must return this for .single() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockTeam,
        error: null,
      });
      // Second query: getTeamById - member count
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: null,
        error: null,
        count: 1,
      });
      rbacService.isAdmin.mockResolvedValue(true);
      rbacService.getUserOrganizations.mockResolvedValue([
        {
          organizationSlug: 'org-1',
          organizationName: 'Org One',
          roleName: 'user',
          isGlobal: false,
        },
      ]);
      // Third query: insert member
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockMember,
        error: null,
      });
      // Fourth query: get user details - .eq() must return this for .single() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockUser,
        error: null,
      });

      const result = await service.addTeamMember(teamId, userId, role, addedBy);

      expect(result.userId).toBe(userId);
      expect(result.role).toBe(role);
      expect(result.email).toBe('user@example.com');
      expect(rbacService.getUserOrganizations).toHaveBeenCalledWith(userId);
    });

    it('should add member to global team without org check', async () => {
      const teamId = 'team-global';
      const userId = 'user-456';
      const role = TeamMemberRole.MEMBER;
      const addedBy = 'user-123';
      const mockTeam = {
        id: teamId,
        org_slug: null,
        name: 'Global Team',
        created_by: addedBy,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      const mockMember = {
        id: 'member-new',
        team_id: teamId,
        user_id: userId,
        role,
        joined_at: '2024-01-01T00:00:00Z',
      };
      const mockUser = {
        id: userId,
        email: 'user@example.com',
        display_name: 'User Name',
      };

      // First query: getTeamById - .eq() must return this for .single() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockTeam,
        error: null,
      });
      // Second query: getTeamById - member count
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: null,
        error: null,
        count: 1,
      });
      rbacService.isAdmin.mockResolvedValue(true);
      // Third query: insert member
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockMember,
        error: null,
      });
      // Fourth query: get user details - .eq() must return this for .single() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockUser,
        error: null,
      });

      const result = await service.addTeamMember(teamId, userId, role, addedBy);

      expect(result.userId).toBe(userId);
      expect(rbacService.getUserOrganizations).not.toHaveBeenCalled();
    });

    it('should allow global user to be added to org team', async () => {
      const teamId = 'team-123';
      const userId = 'user-456';
      const role = TeamMemberRole.MEMBER;
      const addedBy = 'user-123';
      const mockTeam = {
        id: teamId,
        org_slug: 'org-1',
        name: 'Team',
        created_by: addedBy,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      const mockMember = {
        id: 'member-new',
        team_id: teamId,
        user_id: userId,
        role,
        joined_at: '2024-01-01T00:00:00Z',
      };
      const mockUser = {
        id: userId,
        email: 'user@example.com',
        display_name: 'User Name',
      };

      // First query: getTeamById - .eq() must return this for .single() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockTeam,
        error: null,
      });
      // Second query: getTeamById - member count
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: null,
        error: null,
        count: 1,
      });
      rbacService.isAdmin.mockResolvedValue(true);
      rbacService.getUserOrganizations.mockResolvedValue([
        {
          organizationSlug: 'other-org',
          organizationName: 'Other Org',
          roleName: 'user',
          isGlobal: true, // Global role
        },
      ]);
      // Third query: insert member
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockMember,
        error: null,
      });
      // Fourth query: get user details - .eq() must return this for .single() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockUser,
        error: null,
      });

      const result = await service.addTeamMember(teamId, userId, role, addedBy);

      expect(result.userId).toBe(userId);
    });

    it('should throw ForbiddenException when user is not admin', async () => {
      const mockTeam = {
        id: 'team-123',
        org_slug: 'org-1',
        name: 'Team',
        created_by: 'user-123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // First query: getTeamById - .eq() must return this for .single() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockTeam,
        error: null,
      });
      // Second query: getTeamById - member count
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: null,
        error: null,
        count: 0,
      });
      rbacService.isAdmin.mockResolvedValue(false);

      await expect(
        service.addTeamMember(
          'team-123',
          'user-456',
          TeamMemberRole.MEMBER,
          'user-789',
        ),
      ).rejects.toThrow('Only admins can add team members');
    });

    it('should throw ForbiddenException when user not in org', async () => {
      const mockTeam = {
        id: 'team-123',
        org_slug: 'org-1',
        name: 'Team',
        created_by: 'user-123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // First query: getTeamById - .eq() must return this for .single() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockTeam,
        error: null,
      });
      // Second query: getTeamById - member count
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: null,
        error: null,
        count: 0,
      });
      rbacService.isAdmin.mockResolvedValue(true);
      rbacService.getUserOrganizations.mockResolvedValue([
        {
          organizationSlug: 'other-org',
          organizationName: 'Other Org',
          roleName: 'user',
          isGlobal: false,
        },
      ]);

      await expect(
        service.addTeamMember(
          'team-123',
          'user-456',
          TeamMemberRole.MEMBER,
          'user-123',
        ),
      ).rejects.toThrow('User must belong to the organization to join a team');
    });

    it('should throw ConflictException when user already member', async () => {
      const mockTeam = {
        id: 'team-123',
        org_slug: 'org-1',
        name: 'Team',
        created_by: 'user-123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // First query: getTeamById - .eq() must return this for .single() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockTeam,
        error: null,
      });
      // Second query: getTeamById - member count
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: null,
        error: null,
        count: 0,
      });
      rbacService.isAdmin.mockResolvedValue(true);
      rbacService.getUserOrganizations.mockResolvedValue([
        {
          organizationSlug: 'org-1',
          organizationName: 'Org One',
          roleName: 'user',
          isGlobal: false,
        },
      ]);
      // Third query: insert member - fails with duplicate error
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: '23505', message: 'Duplicate' },
      });

      await expect(
        service.addTeamMember(
          'team-123',
          'user-456',
          TeamMemberRole.MEMBER,
          'user-123',
        ),
      ).rejects.toThrow('User is already a member of this team');
    });
  });

  describe('updateTeamMember', () => {
    it('should update team member role when user is admin', async () => {
      const teamId = 'team-123';
      const userId = 'user-456';
      const newRole = TeamMemberRole.LEAD;
      const updatedBy = 'user-123';
      const mockTeam = {
        id: teamId,
        org_slug: 'org-1',
        name: 'Team',
        created_by: updatedBy,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      const mockMember = {
        id: 'member-1',
        team_id: teamId,
        user_id: userId,
        role: newRole,
        joined_at: '2024-01-01T00:00:00Z',
      };
      const mockUser = {
        id: userId,
        email: 'user@example.com',
        display_name: 'User Name',
      };

      // First query: getTeamById - .eq() must return this for .single() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockTeam,
        error: null,
      });
      // Second query: getTeamById - member count
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: null,
        error: null,
        count: 0,
      });
      rbacService.isAdmin.mockResolvedValue(true);
      // Third query: update - first .eq('team_id') must return this for second .eq('user_id') to chain
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      // Fourth query: update - second .eq('user_id') must return this for .select() and .single() to chain
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockMember,
        error: null,
      });
      // Fifth query: get user details - .eq() must return this for .single() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockUser,
        error: null,
      });

      const result = await service.updateTeamMember(
        teamId,
        userId,
        newRole,
        updatedBy,
      );

      expect(result.role).toBe(newRole);
      expect(result.userId).toBe(userId);
    });

    it('should throw ForbiddenException when user is not admin', async () => {
      const mockTeam = {
        id: 'team-123',
        org_slug: 'org-1',
        name: 'Team',
        created_by: 'user-123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // First query: getTeamById - .eq() must return this for .single() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockTeam,
        error: null,
      });
      // Second query: getTeamById - member count
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: null,
        error: null,
        count: 0,
      });
      rbacService.isAdmin.mockResolvedValue(false);

      await expect(
        service.updateTeamMember(
          'team-123',
          'user-456',
          TeamMemberRole.LEAD,
          'user-789',
        ),
      ).rejects.toThrow('Only admins can update team member roles');
    });

    it('should throw NotFoundException when member not found', async () => {
      const mockTeam = {
        id: 'team-123',
        org_slug: 'org-1',
        name: 'Team',
        created_by: 'user-123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // First query: getTeamById - .eq() must return this for .single() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockTeam,
        error: null,
      });
      // Second query: getTeamById - member count
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: null,
        error: null,
        count: 0,
      });
      rbacService.isAdmin.mockResolvedValue(true);
      // Third query: update - first .eq('team_id') must return this for second .eq('user_id') to chain
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      // Fourth query: update - second .eq('user_id') must return this for .select() and .single() to chain
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' },
      });

      await expect(
        service.updateTeamMember(
          'team-123',
          'user-456',
          TeamMemberRole.LEAD,
          'user-123',
        ),
      ).rejects.toThrow('Team member not found');
    });
  });

  describe('removeTeamMember', () => {
    it('should allow admin to remove member', async () => {
      const teamId = 'team-123';
      const userId = 'user-456';
      const removedBy = 'user-123';
      const mockTeam = {
        id: teamId,
        org_slug: 'org-1',
        name: 'Team',
        created_by: removedBy,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // First query: getTeamById - .eq() must return this for .single() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockTeam,
        error: null,
      });
      // Second query: getTeamById - member count
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: null,
        error: null,
        count: 0,
      });
      rbacService.isAdmin.mockResolvedValue(true);
      // Third query: delete - first .eq('team_id') must return this for second .eq('user_id') to chain
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      // Fourth query: delete - second .eq('user_id') returns promise
      mockSupabaseClient.eq.mockResolvedValueOnce({ data: null, error: null });

      await service.removeTeamMember(teamId, userId, removedBy);

      expect(mockSupabaseClient.delete).toHaveBeenCalled();
    });

    it('should allow user to remove themselves', async () => {
      const teamId = 'team-123';
      const userId = 'user-456';
      const mockTeam = {
        id: teamId,
        org_slug: 'org-1',
        name: 'Team',
        created_by: 'user-123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // First query: getTeamById - .eq() must return this for .single() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockTeam,
        error: null,
      });
      // Second query: getTeamById - member count
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: null,
        error: null,
        count: 0,
      });
      rbacService.isAdmin.mockResolvedValue(false);
      // Third query: delete - first .eq('team_id') must return this for second .eq('user_id') to chain
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      // Fourth query: delete - second .eq('user_id') returns promise
      mockSupabaseClient.eq.mockResolvedValueOnce({ data: null, error: null });

      await service.removeTeamMember(teamId, userId, userId);

      expect(mockSupabaseClient.delete).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when non-admin tries to remove other user', async () => {
      const mockTeam = {
        id: 'team-123',
        org_slug: 'org-1',
        name: 'Team',
        created_by: 'user-123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // First query: getTeamById - .eq() must return this for .single() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockTeam,
        error: null,
      });
      // Second query: getTeamById - member count
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: null,
        error: null,
        count: 0,
      });
      rbacService.isAdmin.mockResolvedValue(false);

      await expect(
        service.removeTeamMember('team-123', 'user-456', 'user-789'),
      ).rejects.toThrow('Only admins can remove other team members');
    });

    it('should throw error on database failure', async () => {
      const mockTeam = {
        id: 'team-123',
        org_slug: 'org-1',
        name: 'Team',
        created_by: 'user-123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // First query: getTeamById - .eq() must return this for .single() to work
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockTeam,
        error: null,
      });
      // Second query: getTeamById - member count
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: null,
        error: null,
        count: 0,
      });
      rbacService.isAdmin.mockResolvedValue(true);
      // Third query: delete - first .eq('team_id') must return this for second .eq('user_id') to chain
      mockSupabaseClient.eq.mockImplementationOnce(function (this: any) {
        return this;
      });
      // Fourth query: delete - second .eq('user_id') returns promise with error
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: null,
        error: { message: 'Delete failed' },
      });

      await expect(
        service.removeTeamMember('team-123', 'user-456', 'user-123'),
      ).rejects.toThrow('Failed to remove team member: Delete failed');
    });
  });

  describe('getUserTeams', () => {
    it('should return teams for a user', async () => {
      const userId = 'user-123';
      const mockTeams = [
        {
          team_id: 'team-1',
          team_name: 'Team One',
          team_description: 'First team',
          org_slug: 'org-1',
          member_role: 'lead',
          joined_at: '2024-01-01T00:00:00Z',
        },
        {
          team_id: 'team-2',
          team_name: 'Team Two',
          team_description: undefined,
          org_slug: null,
          member_role: 'member',
          joined_at: '2024-01-02T00:00:00Z',
        },
      ];

      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: mockTeams,
        error: null,
      });

      const result = await service.getUserTeams(userId);

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('team-1');
      expect(result[0]?.role).toBe('lead');
      expect(result[0]?.orgSlug).toBe('org-1');
      expect(result[1]?.description).toBeUndefined();
      expect(result[1]?.orgSlug).toBeNull();
    });

    it('should return empty array on error', async () => {
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      });

      await expect(service.getUserTeams('user-123')).rejects.toThrow(
        'Failed to get user teams: Database error',
      );
    });
  });
});
