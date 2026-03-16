import { Controller, Get, Headers, Logger } from '@nestjs/common';
import { Public } from '@/auth/decorators/public.decorator';
import { AgentRegistryService } from '../services/agent-registry.service';
import type { AgentRecord } from '../interfaces/agent.interface';

interface DepartmentAgent {
  id: string;
  slug: string;
  name: string;
  displayName: string;
  type: string;
  description: string;
  status: string;
  organization: string;
  tags: string[];
  capabilities: string[];
  execution_modes: string[];
  require_local_model: boolean;
  metadata: Record<string, unknown>;
}

interface DepartmentHierarchy {
  [department: string]: DepartmentAgent[];
}

@Controller('hierarchy')
export class HierarchyController {
  private readonly logger = new Logger(HierarchyController.name);

  constructor(private readonly agentRegistry: AgentRegistryService) {}

  /**
   * Test endpoint
   * Route: GET /hierarchy/test
   */
  @Get('test')
  @Public()
  testHierarchy() {
    return {
      message: 'Hierarchy controller working (department-based)',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get agent hierarchy grouped by department
   * Route: GET /hierarchy/agents
   * Also available at: GET /hierarchy/.well-known/hierarchy (for frontend compatibility)
   */
  @Get('agents')
  @Public()
  async getAgentHierarchy(@Headers('x-organization-slug') orgHeader?: string) {
    const header = orgHeader;
    const organizations = header
      ? header
          .split(',')
          .map((org) => org.trim())
          .filter(Boolean)
      : undefined;

    try {
      // Get agents from database registry
      const agents = organizations?.length
        ? await this.agentRegistry.listAgentsForOrganizations(
            organizations.map((org) => (org === 'global' ? null : org)),
          )
        : await this.agentRegistry.listAllAgents();

      // Build department-based hierarchy
      const hierarchy = this.buildDepartmentHierarchy(agents);
      const departments = Object.keys(hierarchy);
      const totalAgents = agents.length;

      return {
        success: true,
        data: hierarchy,
        metadata: {
          totalAgents,
          totalDepartments: departments.length,
          departments,
          organizations: organizations ?? 'all',
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger.error('Failed to build agent hierarchy', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: {},
        metadata: {
          totalAgents: 0,
          totalDepartments: 0,
          departments: [],
          organizations: organizations ?? 'all',
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Frontend compatibility endpoint
   * Route: GET /hierarchy/.well-known/hierarchy
   */
  @Get('.well-known/hierarchy')
  @Public()
  async getAgentHierarchyWellKnown(
    @Headers('x-organization-slug') orgHeader?: string,
  ) {
    return this.getAgentHierarchy(orgHeader);
  }

  /**
   * Build department-based hierarchy from flat agent list
   * Groups agents by their department field
   */
  private buildDepartmentHierarchy(agents: AgentRecord[]): DepartmentHierarchy {
    const hierarchy: DepartmentHierarchy = {};

    for (const agent of agents) {
      const department = agent.department || 'uncategorized';

      // Initialize department array if it doesn't exist
      if (!hierarchy[department]) {
        hierarchy[department] = [];
      }

      // Extract execution_modes from metadata
      const metadataObj = (agent.metadata as Record<string, unknown>) || {};
      let executionModes: string[] = ['immediate']; // default

      const modes = metadataObj.execution_modes;
      if (Array.isArray(modes) && modes.length > 0) {
        executionModes = modes.filter(
          (mode): mode is string => typeof mode === 'string',
        );
      }

      // Create agent entry
      const agentEntry: DepartmentAgent = {
        id: agent.slug,
        slug: agent.slug,
        name: agent.slug,
        displayName: agent.name,
        type: agent.agent_type,
        description: agent.description,
        status: (metadataObj.status as string) || 'active',
        organization: Array.isArray(agent.organization_slug)
          ? agent.organization_slug.join(',')
          : 'global',
        tags: agent.tags || [],
        capabilities: agent.capabilities || [],
        execution_modes: executionModes,
        require_local_model: agent.require_local_model ?? false,
        metadata: metadataObj,
      };

      hierarchy[department].push(agentEntry);
    }

    // Sort agents within each department by name
    for (const department in hierarchy) {
      if (hierarchy[department]) {
        hierarchy[department].sort((a, b) =>
          a.displayName.localeCompare(b.displayName),
        );
      }
    }

    return hierarchy;
  }
}
