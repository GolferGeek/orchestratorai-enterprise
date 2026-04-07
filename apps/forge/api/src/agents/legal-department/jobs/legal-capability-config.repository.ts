/**
 * LegalCapabilityConfigRepository — reads/writes legal.capability_model_config.
 *
 * The settings UI hits this through GET/PUT endpoints; the worker hits it
 * before launching a job to pick the right (provider, model) for the
 * capability's workhorse role.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
} from '@orchestrator-ai/transport-types';

export type CapabilityRole = 'workhorse' | 'thinking' | 'image';

export interface CapabilityModelConfigRow {
  id: string;
  capability_slug: string;
  role: CapabilityRole;
  provider: string | null;
  model: string | null;
  updated_at: string;
}

const SCHEMA = 'legal';
const TABLE = 'capability_model_config';

@Injectable()
export class LegalCapabilityConfigRepository {
  private readonly logger = new Logger(LegalCapabilityConfigRepository.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async listForCapability(
    capabilitySlug: string,
  ): Promise<CapabilityModelConfigRow[]> {
    const { data, error } = (await this.db
      .from(SCHEMA, TABLE)
      .select('*')
      .eq('capability_slug', capabilitySlug)
      .order('role', { ascending: true })) as {
      data: CapabilityModelConfigRow[] | null;
      error: { message: string } | null;
    };
    if (error) {
      throw new Error(
        `listForCapability(${capabilitySlug}) failed: ${error.message}`,
      );
    }
    return data ?? [];
  }

  async findRow(
    capabilitySlug: string,
    role: CapabilityRole,
  ): Promise<CapabilityModelConfigRow | null> {
    const { data, error } = (await this.db
      .from(SCHEMA, TABLE)
      .select('*')
      .eq('capability_slug', capabilitySlug)
      .eq('role', role)
      .maybeSingle()) as {
      data: CapabilityModelConfigRow | null;
      error: { message: string } | null;
    };
    if (error) {
      throw new Error(
        `findRow(${capabilitySlug}, ${role}) failed: ${error.message}`,
      );
    }
    return data ?? null;
  }

  async upsert(
    capabilitySlug: string,
    role: CapabilityRole,
    provider: string | null,
    model: string | null,
  ): Promise<CapabilityModelConfigRow> {
    const { data, error } = (await this.db
      .from(SCHEMA, TABLE)
      .upsert(
        {
          capability_slug: capabilitySlug,
          role,
          provider,
          model,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'capability_slug,role' },
      )
      .select('*')
      .single()) as {
      data: CapabilityModelConfigRow | null;
      error: { message: string } | null;
    };
    if (error || !data) {
      throw new Error(
        `upsert(${capabilitySlug}, ${role}) failed: ${error?.message ?? 'unknown'}`,
      );
    }
    this.logger.log(
      `Updated ${capabilitySlug}/${role} → ${provider ?? '(null)'}:${model ?? '(null)'}`,
    );
    return data;
  }
}
