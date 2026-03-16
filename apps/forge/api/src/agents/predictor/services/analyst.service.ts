import { Injectable, Logger } from '@nestjs/common';
import { AnalystRepository } from '../repositories/analyst.repository';
import { PortfolioRepository } from '../repositories/portfolio.repository';
import {
  Analyst,
  ActiveAnalyst,
  LlmTier,
} from '../interfaces/analyst.interface';
import { CreateAnalystDto, UpdateAnalystDto } from '../dto/analyst.dto';
import { AnalystPortfolio } from '../interfaces/portfolio.interface';

@Injectable()
export class AnalystService {
  private readonly logger = new Logger(AnalystService.name);

  constructor(
    private readonly analystRepository: AnalystRepository,
    private readonly portfolioRepository: PortfolioRepository,
  ) {}

  /**
   * Get active analysts for a target with effective weights/tiers
   * Uses database function to respect scope hierarchy and overrides
   */
  async getActiveAnalysts(
    targetId: string,
    tier?: LlmTier,
  ): Promise<ActiveAnalyst[]> {
    this.logger.log(
      `Getting active analysts for target: ${targetId}, tier: ${tier || 'default'}`,
    );
    return this.analystRepository.getActiveAnalysts(targetId, tier);
  }

  async findById(id: string): Promise<Analyst | null> {
    return this.analystRepository.findById(id);
  }

  async findByIdOrThrow(id: string): Promise<Analyst> {
    return this.analystRepository.findByIdOrThrow(id);
  }

  async findBySlug(
    slug: string,
    scopeLevel?: string,
    domain?: string,
  ): Promise<Analyst[]> {
    return this.analystRepository.findBySlug(slug, scopeLevel, domain);
  }

  /**
   * Create a new analyst with dual portfolios (user fork and ai fork)
   * Each fork starts with $1M initial balance for P&L tracking
   */
  async create(dto: CreateAnalystDto): Promise<Analyst> {
    this.logger.log(
      `Creating analyst: ${dto.slug} at scope ${dto.scope_level}`,
    );

    // Create the analyst first
    const analyst = await this.analystRepository.create(dto);

    // Create dual portfolios (user fork + ai fork) for P&L tracking
    try {
      const { userPortfolio, aiPortfolio } =
        await this.portfolioRepository.createAnalystPortfolios(analyst.id);

      this.logger.log(
        `Created dual portfolios for analyst ${analyst.slug}: user=${userPortfolio.id}, ai=${aiPortfolio.id}`,
      );
    } catch (error) {
      // Log but don't fail - analyst creation succeeded
      this.logger.error(
        `Failed to create portfolios for analyst ${analyst.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    return analyst;
  }

  /**
   * Create a new analyst without portfolios (for migration/testing)
   */
  async createWithoutPortfolios(dto: CreateAnalystDto): Promise<Analyst> {
    this.logger.log(
      `Creating analyst without portfolios: ${dto.slug} at scope ${dto.scope_level}`,
    );
    return this.analystRepository.create(dto);
  }

  /**
   * Get analyst portfolios (both user and ai forks)
   */
  async getAnalystPortfolios(analystId: string): Promise<{
    user: AnalystPortfolio | null;
    ai: AnalystPortfolio | null;
  }> {
    const userPortfolio = await this.portfolioRepository.getAnalystPortfolio(
      analystId,
      'user',
    );
    const aiPortfolio = await this.portfolioRepository.getAnalystPortfolio(
      analystId,
      'ai',
    );

    return { user: userPortfolio, ai: aiPortfolio };
  }

  /**
   * Ensure analyst has both portfolios (creates missing ones)
   * Useful for migrating existing analysts
   */
  async ensureAnalystPortfolios(analystId: string): Promise<{
    userPortfolio: AnalystPortfolio;
    aiPortfolio: AnalystPortfolio;
  }> {
    const existing = await this.getAnalystPortfolios(analystId);

    let userPortfolio = existing.user;
    let aiPortfolio = existing.ai;

    if (!userPortfolio) {
      userPortfolio = await this.portfolioRepository.createAnalystPortfolio(
        analystId,
        'user',
      );
      this.logger.log(
        `Created missing user portfolio for analyst ${analystId}`,
      );
    }

    if (!aiPortfolio) {
      aiPortfolio = await this.portfolioRepository.createAnalystPortfolio(
        analystId,
        'ai',
      );
      this.logger.log(`Created missing ai portfolio for analyst ${analystId}`);
    }

    return { userPortfolio, aiPortfolio };
  }

  async update(id: string, dto: UpdateAnalystDto): Promise<Analyst> {
    this.logger.log(`Updating analyst: ${id}`);
    return this.analystRepository.update(id, dto);
  }

  async delete(id: string): Promise<void> {
    this.logger.log(`Deleting analyst: ${id}`);
    return this.analystRepository.delete(id);
  }

  async findByDomain(domain: string): Promise<Analyst[]> {
    return this.analystRepository.findByDomain(domain);
  }

  async findRunnerLevel(): Promise<Analyst[]> {
    return this.analystRepository.findRunnerLevel();
  }

  /**
   * Get all enabled analysts regardless of scope level
   * Used by the Analyst Management dashboard
   */
  async findAll(): Promise<Analyst[]> {
    return this.analystRepository.getActive();
  }
}
