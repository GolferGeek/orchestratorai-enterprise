import { Injectable, Logger } from '@nestjs/common';
import { ToolRequestRepository } from '../repositories/tool-request.repository';
import {
  ToolRequest,
  CreateToolRequestData,
  UpdateToolRequestData,
  ToolRequestStatus,
  ToolSuggestion,
} from '../interfaces/tool-request.interface';
import { MissedOpportunity } from '../interfaces/missed-opportunity.interface';

/**
 * ToolRequestService - Manages tool/source requests from missed opportunity analysis
 *
 * When the system detects missed opportunities, it can suggest new tools
 * or sources that might help capture similar opportunities in the future.
 * This service manages the wishlist of requested tools.
 */
@Injectable()
export class ToolRequestService {
  private readonly logger = new Logger(ToolRequestService.name);

  constructor(private readonly toolRequestRepository: ToolRequestRepository) {}

  /**
   * Get all tool requests, optionally filtered by universe
   */
  async findAll(universeId?: string): Promise<ToolRequest[]> {
    return this.toolRequestRepository.findAll(universeId);
  }

  /**
   * Get a tool request by ID
   */
  async findById(id: string): Promise<ToolRequest | null> {
    return this.toolRequestRepository.findById(id);
  }

  /**
   * Get tool request by ID, throw if not found
   */
  async findByIdOrThrow(id: string): Promise<ToolRequest> {
    return this.toolRequestRepository.findByIdOrThrow(id);
  }

  /**
   * Get wishlist items (status = 'wishlist')
   */
  async getWishlist(universeId?: string): Promise<ToolRequest[]> {
    return this.toolRequestRepository.findWishlist(universeId);
  }

  /**
   * Get tool requests by status
   */
  async findByStatus(
    status: ToolRequestStatus,
    universeId?: string,
  ): Promise<ToolRequest[]> {
    return this.toolRequestRepository.findByStatus(status, universeId);
  }

  /**
   * Get tool requests generated from a missed opportunity
   */
  async findByMissedOpportunity(
    missedOpportunityId: string,
  ): Promise<ToolRequest[]> {
    return this.toolRequestRepository.findByMissedOpportunity(
      missedOpportunityId,
    );
  }

  /**
   * Create a tool request
   */
  async create(data: CreateToolRequestData): Promise<ToolRequest> {
    // Check for similar existing requests
    const existing = await this.findSimilar(data);
    if (existing) {
      this.logger.debug(`Similar tool request already exists: ${existing.id}`);
      // Could optionally bump priority or add a note
      return existing;
    }

    return this.toolRequestRepository.create(data);
  }

  /**
   * Create tool requests from suggestions (e.g., from missed opportunity analysis)
   */
  async createFromSuggestions(
    universeId: string,
    missedOpportunityId: string,
    suggestions: ToolSuggestion[],
  ): Promise<ToolRequest[]> {
    const created: ToolRequest[] = [];

    for (const suggestion of suggestions) {
      const request = await this.create({
        universe_id: universeId,
        missed_opportunity_id: missedOpportunityId,
        type: suggestion.type,
        name: suggestion.name,
        description: suggestion.description,
        rationale: suggestion.rationale,
        suggested_url: suggestion.suggested_url,
        suggested_config: suggestion.suggested_config,
        priority: suggestion.priority,
      });
      created.push(request);
    }

    this.logger.log(
      `Created ${created.length} tool requests from missed opportunity ${missedOpportunityId}`,
    );

    return created;
  }

  /**
   * Update a tool request
   */
  async update(id: string, data: UpdateToolRequestData): Promise<ToolRequest> {
    return this.toolRequestRepository.update(id, data);
  }

  /**
   * Update tool request status
   */
  async updateStatus(
    id: string,
    status: ToolRequestStatus,
    userId?: string,
    notes?: string,
  ): Promise<ToolRequest> {
    return this.toolRequestRepository.updateStatus(id, status, userId, notes);
  }

  /**
   * Mark a tool request as planned
   */
  async markPlanned(id: string, userId?: string): Promise<ToolRequest> {
    return this.updateStatus(id, 'planned', userId);
  }

  /**
   * Mark a tool request as in progress
   */
  async markInProgress(id: string, userId?: string): Promise<ToolRequest> {
    return this.updateStatus(id, 'in_progress', userId);
  }

  /**
   * Mark a tool request as done
   */
  async markDone(
    id: string,
    userId?: string,
    notes?: string,
  ): Promise<ToolRequest> {
    return this.updateStatus(id, 'done', userId, notes);
  }

  /**
   * Reject a tool request
   */
  async reject(
    id: string,
    userId?: string,
    reason?: string,
  ): Promise<ToolRequest> {
    return this.updateStatus(id, 'rejected', userId, reason);
  }

  /**
   * Delete a tool request
   */
  async delete(id: string): Promise<void> {
    return this.toolRequestRepository.delete(id);
  }

  /**
   * Get statistics for tool requests
   */
  async getStats(universeId?: string): Promise<{
    total: number;
    by_status: Record<ToolRequestStatus, number>;
    by_priority: Record<string, number>;
  }> {
    return this.toolRequestRepository.getStats(universeId);
  }

  /**
   * Find similar existing tool requests
   * Used to prevent duplicate requests
   */
  private async findSimilar(
    data: CreateToolRequestData,
  ): Promise<ToolRequest | null> {
    // Get all non-rejected requests for this universe
    const existing = await this.toolRequestRepository.findAll(data.universe_id);

    // Filter to pending/planned/in_progress status
    const active = existing.filter(
      (r) =>
        r.status === 'wishlist' ||
        r.status === 'planned' ||
        r.status === 'in_progress',
    );

    // Check for similar names (case-insensitive, partial match)
    const normalizedName = data.name.toLowerCase().trim();
    const similar = active.find((r) => {
      const existingName = r.name.toLowerCase().trim();
      return (
        existingName === normalizedName ||
        existingName.includes(normalizedName) ||
        normalizedName.includes(existingName)
      );
    });

    return similar || null;
  }

  /**
   * Generate tool suggestions from a missed opportunity
   * This is called by MissedOpportunityAnalysisService
   */
  generateSuggestionsFromAnalysis(
    analysis: {
      discovered_drivers: string[];
      source_gaps: string[];
      had_relevant_signals: boolean;
    },
    missedOpp: MissedOpportunity,
  ): ToolSuggestion[] {
    const suggestions: ToolSuggestion[] = [];

    // Suggest sources for each gap
    for (const gap of analysis.source_gaps || []) {
      suggestions.push({
        type: 'source',
        name: `Source for: ${gap.substring(0, 50)}`,
        description: `Add a data source to monitor: ${gap}`,
        rationale: `This gap was identified in missed opportunity analysis for a ${Math.abs(missedOpp.move_percentage)}% move`,
        priority: Math.abs(missedOpp.move_percentage) > 10 ? 'high' : 'medium',
        confidence: 0.7,
      });
    }

    // Suggest API integrations for discovered drivers
    for (const driver of analysis.discovered_drivers || []) {
      // Check if driver suggests a specific data source
      if (driver.toLowerCase().includes('earnings')) {
        suggestions.push({
          type: 'api',
          name: 'Earnings Calendar Integration',
          description: 'Integrate earnings calendar API for advance notice',
          rationale: `Earnings was a driver in ${Math.abs(missedOpp.move_percentage)}% move`,
          priority: 'high',
          confidence: 0.8,
        });
      }

      if (
        driver.toLowerCase().includes('fed') ||
        driver.toLowerCase().includes('interest rate')
      ) {
        suggestions.push({
          type: 'api',
          name: 'Fed Calendar/Announcements',
          description: 'Track Fed announcements and interest rate decisions',
          rationale: `Fed policy was a driver in ${Math.abs(missedOpp.move_percentage)}% move`,
          priority: 'high',
          confidence: 0.85,
        });
      }
    }

    // Deduplicate suggestions
    const unique = suggestions.filter(
      (s, index, self) => index === self.findIndex((t) => t.name === s.name),
    );

    return unique;
  }

  /**
   * Get high-priority tool requests that need attention
   */
  async getActionRequired(universeId?: string): Promise<ToolRequest[]> {
    const [critical, high] = await Promise.all([
      this.toolRequestRepository.findByPriority('critical', universeId),
      this.toolRequestRepository.findByPriority('high', universeId),
    ]);

    return [...critical, ...high].filter(
      (r) => r.status === 'wishlist' || r.status === 'planned',
    );
  }
}
