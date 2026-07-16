import { Injectable, Inject, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';

export interface AssetRecord {
  id: string;
  storage: 'local' | 'supabase';
  path?: string | null;
  bucket?: string | null;
  object_key?: string | null;
  source_url?: string | null;
  mime: string;
  size?: number | null;
  width?: number | null;
  height?: number | null;
  hash?: string | null;
  user_id?: string | null;
  conversation_id?: string | null;
  deliverable_version_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

@Injectable()
export class AssetsRepository {
  private readonly logger = new Logger(AssetsRepository.name);
  private readonly table = 'assets';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async get(id: string): Promise<AssetRecord | null> {
    const { data, error } = (await this.db
      .from(null, this.table)
      .select('*')
      .eq('id', id)
      .maybeSingle()) as {
      data: AssetRecord | null;
      error: { message: string } | null;
    };
    if (error) throw new Error(`Failed to fetch asset: ${error.message}`);
    return (data as AssetRecord) || null;
  }

  async create(
    input: Omit<AssetRecord, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<AssetRecord> {
    const { data, error } = (await this.db
      .from(null, this.table)
      .insert(input)
      .select('*')
      .single()) as {
      data: AssetRecord | null;
      error: { message: string } | null;
    };
    if (error) throw new Error(`Failed to create asset: ${error.message}`);
    return data as AssetRecord;
  }
}
