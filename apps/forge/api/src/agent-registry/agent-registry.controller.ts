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
  Put,
  Post,
  Body,
  Param,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { WorkflowPresentation } from '@orchestrator-ai/transport-types';
import {
  InProcessJwtAuthGuard as JwtAuthGuard,
  InProcessRbacGuard as RbacGuard,
  RequirePermission,
} from '@orchestratorai/auth-client';
import { AgentRegistryService } from './agent-registry.service';
import { LEGAL_DEPARTMENT_PRESENTATION } from '../agents/legal-department/legal-department.presentation';
import { ADVERSARIAL_BRIEF_PRESENTATION } from '../agents/legal-department/workflows/adversarial-brief/adversarial-brief.presentation';
import { MARKETING_SWARM_PRESENTATION } from '../agents/marketing-swarm/marketing-swarm.presentation';

/**
 * Compile-time registry of per-workflow presentation manifests. New
 * agents that ship a manifest add an entry here. Agents without a
 * manifest fall through to a 404 and the UI uses its raw-events fallback.
 */
const BRIEF_PATHS: Record<string, Record<string, string>> = {
  'legal-department': {
    'document-onboarding': path.join(
      process.cwd(),
      'src/agents/legal-department/workflows/document-onboarding/brief.md',
    ),
    'contract-review': path.join(
      process.cwd(),
      'src/agents/legal-department/workflows/contract-review/brief.md',
    ),
    'adversarial-brief': path.join(
      process.cwd(),
      'src/agents/legal-department/workflows/adversarial-brief/brief.md',
    ),
  },
};

const PRESENTATION_REGISTRY: Record<string, WorkflowPresentation> = {
  'legal-department': LEGAL_DEPARTMENT_PRESENTATION,
  'legal-department/adversarial-brief': ADVERSARIAL_BRIEF_PRESENTATION,
  'marketing-swarm': MARKETING_SWARM_PRESENTATION,
};

@Controller()
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
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
  getAgentPresentation(
    @Param('slug') slug: string,
    @Query('capability') capability?: string,
  ): WorkflowPresentation {
    // Try capability-scoped key first (e.g., "legal-department/adversarial-brief"),
    // then fall back to agent slug (e.g., "legal-department")
    const key = capability ? `${slug}/${capability}` : slug;
    const manifest = PRESENTATION_REGISTRY[key] ?? PRESENTATION_REGISTRY[slug];
    if (!manifest) {
      throw new NotFoundException(
        `No presentation manifest registered for agent '${slug}'${capability ? ` (capability: ${capability})` : ''}`,
      );
    }
    return manifest;
  }

  /**
   * GET /agents/:slug/brief/:capabilitySlug — Workflow brief markdown.
   *
   * Reads the brief.md file for a given agent + capability, parses YAML
   * frontmatter (title, video), and returns structured JSON.
   */
  @Get('agents/:slug/brief/:capabilitySlug')
  async getWorkflowBrief(
    @Param('slug') slug: string,
    @Param('capabilitySlug') capabilitySlug: string,
  ): Promise<{ title: string; video: string; markdown: string }> {
    const filePath = BRIEF_PATHS[slug]?.[capabilitySlug];
    if (!filePath) {
      throw new NotFoundException(
        `No brief registered for agent '${slug}' capability '${capabilitySlug}'`,
      );
    }

    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf-8');
    } catch {
      throw new NotFoundException(
        `Brief file not found for agent '${slug}' capability '${capabilitySlug}'`,
      );
    }

    return this.parseBrief(raw);
  }

  /**
   * PUT /agents/:slug/brief/:capabilitySlug — Update workflow brief.
   *
   * Accepts title, video, and markdown in the body, reconstructs the
   * frontmatter + markdown, and writes it back to the file.
   */
  @Put('agents/:slug/brief/:capabilitySlug')
  @RequirePermission('admin:settings')
  async updateWorkflowBrief(
    @Param('slug') slug: string,
    @Param('capabilitySlug') capabilitySlug: string,
    @Body() body: { title?: string; video?: string; markdown: string },
  ): Promise<{ success: true }> {
    const filePath = BRIEF_PATHS[slug]?.[capabilitySlug];
    if (!filePath) {
      throw new NotFoundException(
        `No brief registered for agent '${slug}' capability '${capabilitySlug}'`,
      );
    }

    const frontmatter = [
      '---',
      `title: ${body.title ?? ''}`,
      `video: ${body.video ?? ''}`,
      '---',
    ].join('\n');

    const content = `${frontmatter}\n\n${body.markdown}`;
    await fs.writeFile(filePath, content, 'utf-8');

    return { success: true };
  }

  /**
   * Parse a brief.md file with YAML frontmatter into structured data.
   */
  private parseBrief(raw: string): {
    title: string;
    video: string;
    markdown: string;
  } {
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n*/);
    let title = '';
    let video = '';
    let markdown = raw;

    if (fmMatch && fmMatch[1]) {
      const fmBlock = fmMatch[1];
      markdown = raw.slice(fmMatch[0]!.length);

      for (const line of fmBlock.split('\n')) {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;
        const key = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim();
        if (key === 'title') title = value;
        if (key === 'video') video = value;
      }
    }

    return { title, video, markdown };
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
