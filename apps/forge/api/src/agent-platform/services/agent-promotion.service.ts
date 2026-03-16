import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { AgentsRepository } from '../repositories/agents.repository';
import { HumanApprovalsRepository } from '../repositories/human-approvals.repository';
import {
  AgentValidationService,
  ValidationIssue,
} from './agent-validation.service';
import { AgentPolicyService } from './agent-policy.service';
import type { AgentType, CreateAgentPayload } from '../schemas/agent-schemas';
import type { AgentRecord } from '../interfaces/agent.interface';
import type { JsonObject } from '@orchestrator-ai/transport-types';

export interface PromotionRequirements {
  requiresApproval: boolean;
  requiresValidation: boolean;
  requiresDryRun: boolean;
  customChecks?: Array<{ name: string; passed: boolean; message?: string }>;
}

export interface PromotionResult {
  success: boolean;
  agentId: string;
  previousStatus: string;
  newStatus: string;
  approvalId?: string;
  validationResults?: { ok: boolean; issues: ValidationIssue[] };
  error?: string;
  requiresApproval?: boolean;
}

@Injectable()
export class AgentPromotionService {
  private readonly logger = new Logger(AgentPromotionService.name);

  constructor(
    private readonly agents: AgentsRepository,
    private readonly approvals: HumanApprovalsRepository,
    private readonly validator: AgentValidationService,
    private readonly policy: AgentPolicyService,
  ) {}

  /**
   * Request promotion from draft → active with optional HITL approval
   */
  async requestPromotion(
    agentId: string,
    options?: {
      requireApproval?: boolean;
      requestedBy?: string;
      skipValidation?: boolean;
    },
  ): Promise<PromotionResult> {
    try {
      // 1. Fetch agent (agentId is now slug)
      const agent = await this.agents.findBySlug(null, agentId);
      if (!agent) {
        throw new BadRequestException(`Agent ${agentId} not found`);
      }

      const metadataObj = (agent.metadata as Record<string, unknown>) || {};
      const currentStatus = (metadataObj.status as string) || 'draft';

      // 2. Check current status
      if (currentStatus === 'active') {
        return {
          success: false,
          agentId,
          previousStatus: currentStatus,
          newStatus: currentStatus,
          error: 'Agent is already active',
        };
      }

      if (currentStatus !== 'draft') {
        throw new BadRequestException(
          `Cannot promote agent with status '${currentStatus}'. Only draft agents can be promoted.`,
        );
      }

      // 3. Validate agent (unless explicitly skipped)
      if (!options?.skipValidation) {
        const validation = this.validator.validateByType(
          agent.agent_type as AgentType,
          {
            agent_type: agent.agent_type as AgentType,
            slug: agent.slug,
            display_name: agent.name,
            mode_profile:
              (metadataObj.mode_profile as string) || 'conversation_only',
            description: agent.description,
            yaml: '', // No YAML in v2
            context: { markdown: agent.context } as JsonObject, // Wrap string as object
            config: metadataObj,
          } as CreateAgentPayload,
        );

        const policyIssues = this.policy.check({
          agent_type: agent.agent_type,
          config: metadataObj as unknown as Parameters<
            typeof this.policy.check
          >[0]['config'],
          context: {
            input_modes: metadataObj.input_modes || undefined,
            output_modes: metadataObj.output_modes || undefined,
            system_prompt: agent.context,
          },
        });

        if (!validation.ok || policyIssues.length > 0) {
          const allIssues = [...validation.issues, ...policyIssues];
          this.logger.warn(
            `Agent ${agentId} failed validation: ${allIssues.map((i) => i.message).join(', ')}`,
          );
          return {
            success: false,
            agentId,
            previousStatus: currentStatus,
            newStatus: currentStatus,
            error: `Validation failed: ${allIssues.map((i) => i.message).join(', ')}`,
            validationResults: { ok: false, issues: allIssues },
          };
        }
      }

      // 4. Determine if approval is required
      const requiresApproval =
        options?.requireApproval ?? this.requiresApproval(agent);

      if (requiresApproval) {
        // Create approval request
        const approval = await this.approvals.create({
          organizationSlug: agent.organization_slug.join(','),
          agentSlug: agent.slug,
          mode: 'agent_promotion',
          metadata: {
            agentId: agent.slug,
            agentType: agent.agent_type,
            displayName: agent.name,
            requestedBy: options?.requestedBy,
            requestedAt: new Date().toISOString(),
            fromStatus: 'draft',
            toStatus: 'active',
          },
        });

        this.logger.log(
          `Approval request created for agent ${agent.slug}: ${approval.id}`,
        );

        return {
          success: true,
          agentId,
          previousStatus: currentStatus,
          newStatus: currentStatus, // Status unchanged, pending approval
          approvalId: approval.id,
          requiresApproval: true,
        };
      }

      // 5. Auto-promote (no approval required)
      await this.agents.updateMetadata(agentId, {
        ...metadataObj,
        status: 'active',
      });
      this.logger.log(`Agent ${agent.slug} promoted to active (auto-approved)`);

      return {
        success: true,
        agentId,
        previousStatus: currentStatus,
        newStatus: 'active',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Promotion failed for agent ${agentId}: ${message}`);
      throw error;
    }
  }

  /**
   * Complete promotion after HITL approval
   */
  async completePromotionAfterApproval(
    approvalId: string,
  ): Promise<PromotionResult> {
    try {
      // 1. Fetch approval
      const approval = await this.approvals.get(approvalId);
      if (!approval) {
        throw new BadRequestException(`Approval ${approvalId} not found`);
      }

      // 2. Check approval status
      if (approval.status !== 'approved') {
        throw new ForbiddenException(
          `Cannot promote: approval status is '${approval.status}'`,
        );
      }

      // 3. Get agent ID from metadata
      const agentIdValue = approval.metadata?.agentId;
      const agentId =
        typeof agentIdValue === 'string' ? agentIdValue.trim() : '';
      if (!agentId) {
        throw new BadRequestException('Approval metadata missing agentId');
      }

      // 4. Fetch agent
      const agent = await this.agents.findBySlug(null, agentId);
      if (!agent) {
        throw new BadRequestException(`Agent ${agentId} not found`);
      }

      // 5. Verify still in draft status
      const metaStatus =
        ((agent.metadata as Record<string, unknown>)?.status as string) ||
        'draft';
      if (metaStatus !== 'draft') {
        throw new BadRequestException(
          `Agent status is '${metaStatus}', expected 'draft'`,
        );
      }

      // 6. Promote
      const metadataObj = (agent.metadata as Record<string, unknown>) || {};
      await this.agents.updateMetadata(agentId, {
        ...metadataObj,
        status: 'active',
      });

      this.logger.log(
        `Agent ${agent.slug} promoted to active via approval ${approvalId} by ${approval.approved_by}`,
      );

      return {
        success: true,
        agentId,
        previousStatus: 'draft',
        newStatus: 'active',
        approvalId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Approval-based promotion failed for approval ${approvalId}: ${message}`,
      );
      throw error;
    }
  }

  /**
   * Demote agent from active → draft (for fixes/updates)
   */
  async demote(agentId: string, reason?: string): Promise<PromotionResult> {
    try {
      const agent = await this.agents.findBySlug(null, agentId);
      if (!agent) {
        throw new BadRequestException(`Agent ${agentId} not found`);
      }

      const metaObj1 = (agent.metadata as Record<string, unknown>) || {};
      const currentStatus1 = (metaObj1.status as string) || 'unknown';

      if (currentStatus1 !== 'active') {
        return {
          success: false,
          agentId,
          previousStatus: currentStatus1,
          newStatus: currentStatus1,
          error: `Agent is not active (status: ${currentStatus1})`,
        };
      }

      await this.agents.updateMetadata(agentId, {
        ...metaObj1,
        status: 'draft',
      });

      this.logger.log(
        `Agent ${agent.slug} demoted to draft. Reason: ${reason || 'N/A'}`,
      );

      return {
        success: true,
        agentId,
        previousStatus: 'active',
        newStatus: 'draft',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Demotion failed for agent ${agentId}: ${message}`);
      throw error;
    }
  }

  /**
   * Archive agent (soft delete)
   */
  async archive(agentId: string, reason?: string): Promise<PromotionResult> {
    try {
      const agent = await this.agents.findBySlug(null, agentId);
      if (!agent) {
        throw new BadRequestException(`Agent ${agentId} not found`);
      }

      const metaObj2 = (agent.metadata as Record<string, unknown>) || {};
      const currentStatus2 = (metaObj2.status as string) || 'unknown';

      if (currentStatus2 === 'archived') {
        return {
          success: false,
          agentId,
          previousStatus: currentStatus2,
          newStatus: currentStatus2,
          error: 'Agent is already archived',
        };
      }

      const previousStatus = currentStatus2;
      await this.agents.updateMetadata(agentId, {
        ...metaObj2,
        status: 'archived',
      });

      this.logger.log(
        `Agent ${agent.slug} archived. Reason: ${reason || 'N/A'}`,
      );

      return {
        success: true,
        agentId,
        previousStatus,
        newStatus: 'archived',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Archival failed for agent ${agentId}: ${message}`);
      throw error;
    }
  }

  /**
   * Determine if agent requires approval based on type and configuration
   */
  private requiresApproval(agent: AgentRecord): boolean {
    // Function agents no longer exist in v2

    // API agents calling external endpoints require approval
    if (agent.agent_type === 'api') {
      return true;
    }

    // External agents require approval
    if (agent.agent_type === 'external') {
      return true;
    }

    // Orchestrators (agents with orchestrate capability) require approval
    if (agent.capabilities.includes('orchestrate')) {
      return true;
    }

    // Simple context agents can auto-promote
    return false;
  }

  /**
   * Get promotion requirements for an agent
   */
  async getPromotionRequirements(
    agentId: string,
  ): Promise<PromotionRequirements> {
    const agent = await this.agents.findBySlug(null, agentId);
    if (!agent) {
      throw new BadRequestException(`Agent ${agentId} not found`);
    }

    const requiresApproval = this.requiresApproval(agent);
    const requiresValidation = true; // Always validate
    const requiresDryRun = agent.agent_type === 'api'; // Function agents no longer exist

    return {
      requiresApproval,
      requiresValidation,
      requiresDryRun,
      customChecks: [],
    };
  }
}
