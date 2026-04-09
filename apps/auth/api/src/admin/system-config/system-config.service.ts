import {
  Injectable,
  Inject,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';

export interface SystemConfig {
  key: string;
  value: unknown;
  description?: string;
  updatedAt: string;
}

interface SystemSettingsRow {
  key: string;
  value: unknown;
  description?: string;
  updated_at: string;
}

export interface UpdateSystemConfigDto {
  value: unknown;
}

@Injectable()
export class SystemConfigService {
  private readonly logger = new Logger(SystemConfigService.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Return all system_settings rows mapped to the SystemConfig shape.
   */
  async findAll(): Promise<SystemConfig[]> {
    const { data, error } = (await this.db
      .from(null, 'system_settings')
      .select('*')
      .order('key')) as QueryResult<unknown>;

    if (error) {
      this.logger.error(
        `Failed to fetch system config: ${(error as { message: string }).message}`,
      );
      throw new HttpException(
        `Failed to fetch system config: ${(error as { message: string }).message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return ((data || []) as SystemSettingsRow[]).map((row) => ({
      key: row.key,
      value: row.value,
      description: row.description,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Upsert a single system_settings entry by key.
   */
  async update(key: string, dto: UpdateSystemConfigDto): Promise<SystemConfig> {
    const result = await this.db
      .from(null, 'system_settings')
      .upsert(
        {
          key,
          value: dto.value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' },
      )
      .select()
      .single();

    const data = result.data as SystemSettingsRow | null;
    const error = result.error as { message?: string } | null;

    if (error) {
      this.logger.error(
        `Failed to update system config '${key}': ${error.message}`,
      );
      throw new HttpException(
        `Failed to update system config: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!data) {
      throw new HttpException(
        `System config key '${key}' could not be saved`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    this.logger.log(`Updated system config key: ${key}`);
    return {
      key: data.key,
      value: data.value,
      description: data.description,
      updatedAt: data.updated_at,
    };
  }
}
