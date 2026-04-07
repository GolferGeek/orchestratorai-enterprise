/**
 * Agent Registry Controller
 *
 * Provides the GET /agents and POST /agent-conversations endpoints
 * that the Forge frontend depends on for agent discovery and conversation
 * management.
 *
 * These endpoints were previously served by the removed agent-platform module.
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { WorkflowPresentation } from '@orchestrator-ai/transport-types';
import { AgentRegistryService } from './agent-registry.service';
import { LEGAL_DEPARTMENT_PRESENTATION } from '../agents/legal-department/legal-department.presentation';

/**
 * Compile-time registry of per-workflow presentation manifests. New
 * agents that ship a manifest add an entry here. Agents without a
 * manifest fall through to a 404 and the UI uses its raw-events fallback.
 */
const PRESENTATION_REGISTRY: Record<string, WorkflowPresentation> = {
  'legal-department': LEGAL_DEPARTMENT_PRESENTATION,
};

@Controller()
export class AgentRegistryController {
  private readonly logger = new Logger(AgentRegistryController.name);

  constructor(private readonly agentRegistryService: AgentRegistryService) {}

  /**
   * GET /agents — List all available agents
   * Used by the frontend to populate agent stores and resolve org slugs.
   */
  @Get('agents')
  async getAgents(@Headers('x-organization-slug') orgSlug?: string) {
    this.logger.log(`GET /agents${orgSlug ? ` (org: ${orgSlug})` : ''}`);
    return this.agentRegistryService.getAvailableAgents(orgSlug);
  }

  /**
   * GET /agents/:slug/presentation — Per-workflow stage manifest.
   *
   * Returns the WorkflowPresentation for the requested agent, used by
   * the UI's stage ladder + in-row ticker to map raw observability
   * events onto human-readable stages.
   *
   * No auth — manifests are compile-time constants, not user data.
   * Agents without a manifest get a 404 and the UI falls back to a
   * plain raw event list.
   */
  @Get('agents/:slug/presentation')
  getAgentPresentation(@Param('slug') slug: string): WorkflowPresentation {
    const manifest = PRESENTATION_REGISTRY[slug];
    if (!manifest) {
      throw new NotFoundException(
        `No presentation manifest registered for agent '${slug}'`,
      );
    }
    return manifest;
  }

  /**
   * POST /agent-conversations — Create a new conversation record
   * Used by LangGraph dashboards (legal-department, marketing-swarm, cad-agent)
   * to register a conversation before starting an analysis.
   */
  @Post('agent-conversations')
  @HttpCode(HttpStatus.CREATED)
  async createConversation(
    @Body()
    body: {
      agentName: string;
      agentType: string;
      organizationSlug: string;
      conversationId?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    this.logger.log(
      `POST /agent-conversations agent=${body.agentName} org=${body.organizationSlug}`,
    );
    return this.agentRegistryService.createConversation(body);
  }

  /**
   * GET /agent-conversations/:conversationId — Get a conversation by ID
   */
  @Get('agent-conversations/:conversationId')
  async getConversation(@Param('conversationId') conversationId: string) {
    const conversation =
      await this.agentRegistryService.getConversation(conversationId);
    if (!conversation) {
      throw new NotFoundException(`Conversation not found: ${conversationId}`);
    }
    return conversation;
  }

  /**
   * GET /agent-conversations — List conversations for an agent
   */
  @Get('agent-conversations')
  async listConversations(
    @Query('agentName') agentName: string,
    @Query('organizationSlug') organizationSlug: string,
  ) {
    return this.agentRegistryService.listConversations(
      agentName,
      organizationSlug,
    );
  }
}
