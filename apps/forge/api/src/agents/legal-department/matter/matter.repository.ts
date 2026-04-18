import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
} from '@orchestrator-ai/transport-types';
import type {
  CreateMatterDto,
  MatterDocumentRow,
  MatterEntityRow,
  MatterRow,
  MatterStatus,
  MatterTimelineRow,
  UpdateMatterDto,
} from './matter.types';
import type { EntityType } from './matter.types';

const SCHEMA = 'legal';

@Injectable()
export class MatterRepository {
  private readonly logger = new Logger(MatterRepository.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async createMatter(dto: CreateMatterDto): Promise<MatterRow> {
    const { context, data } = dto;
    // Use rawQuery for TEXT[] columns — the QueryBuilder serializes JS arrays
    // in a way that Postgres rejects for array-typed columns.
    const sql = `
      INSERT INTO legal.matters
        (org_slug, created_by, name, client_name, matter_type, jurisdiction,
         opposing_parties, assigned_user_ids, description)
      VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8::text[], $9)
      RETURNING *
    `;
    const { data: rows, error } = (await this.db.rawQuery(sql, [
      context.orgSlug,
      context.userId,
      data.name,
      data.clientName,
      data.matterType,
      data.jurisdiction,
      data.opposingParties ?? [],
      data.assignedUserIds ?? [],
      data.description ?? null,
    ])) as { data: MatterRow[] | null; error: { message: string } | null };

    const inserted = rows?.[0] ?? null;
    if (error || !inserted) {
      throw new Error(
        `Failed to create matter: ${error?.message ?? 'unknown'}`,
      );
    }
    return inserted;
  }

  async listMatters(
    orgSlug: string,
    status?: MatterStatus,
  ): Promise<MatterRow[]> {
    let q = this.db
      .from(SCHEMA, 'matters')
      .select('*')
      .eq('org_slug', orgSlug)
      .order('opened_at', { ascending: false });

    if (status) {
      q = q.eq('status', status);
    }

    const { data, error } = (await q) as {
      data: MatterRow[] | null;
      error: { message: string } | null;
    };

    if (error) {
      throw new Error(
        `Failed to list matters for org ${orgSlug}: ${error.message}`,
      );
    }
    return data ?? [];
  }

  async getMatterById(id: string, orgSlug: string): Promise<MatterRow> {
    const { data, error } = (await this.db
      .from(SCHEMA, 'matters')
      .select('*')
      .eq('id', id)
      .eq('org_slug', orgSlug)
      .single()) as {
      data: MatterRow | null;
      error: { message: string } | null;
    };

    if (error || !data) {
      throw new NotFoundException(`Matter ${id} not found`);
    }
    return data;
  }

  async assertMatterOwnership(id: string, orgSlug: string): Promise<MatterRow> {
    const { data, error } = (await this.db
      .from(SCHEMA, 'matters')
      .select('*')
      .eq('id', id)
      .single()) as {
      data: MatterRow | null;
      error: { message: string } | null;
    };

    if (error || !data) {
      throw new NotFoundException(`Matter ${id} not found`);
    }
    if (data.org_slug !== orgSlug) {
      throw new ForbiddenException(
        `Matter ${id} does not belong to org ${orgSlug}`,
      );
    }
    return data;
  }

  async updateMatter(
    id: string,
    orgSlug: string,
    dto: UpdateMatterDto,
  ): Promise<MatterRow> {
    await this.assertMatterOwnership(id, orgSlug);

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    const { data: fields } = dto;
    if (fields.name !== undefined) updates.name = fields.name;
    if (fields.clientName !== undefined)
      updates.client_name = fields.clientName;
    if (fields.status !== undefined) updates.status = fields.status;
    if (fields.assignedUserIds !== undefined)
      updates.assigned_user_ids = fields.assignedUserIds;
    if (fields.description !== undefined)
      updates.description = fields.description;

    const { data: updated, error } = (await this.db
      .from(SCHEMA, 'matters')
      .update(updates)
      .eq('id', id)
      .eq('org_slug', orgSlug)
      .select('*')
      .single()) as {
      data: MatterRow | null;
      error: { message: string } | null;
    };

    if (error || !updated) {
      throw new Error(
        `Failed to update matter ${id}: ${error?.message ?? 'unknown'}`,
      );
    }
    return updated;
  }

  async insertDocument(params: {
    matterId: string;
    orgSlug: string;
    storagePath: string;
    originalName: string;
    uploadedBy: string;
  }): Promise<MatterDocumentRow> {
    const row = {
      matter_id: params.matterId,
      org_slug: params.orgSlug,
      storage_path: params.storagePath,
      original_name: params.originalName,
      uploaded_by: params.uploadedBy,
    };

    const { data: inserted, error } = (await this.db
      .from(SCHEMA, 'matter_documents')
      .insert(row)
      .select('*')
      .single()) as {
      data: MatterDocumentRow | null;
      error: { message: string } | null;
    };

    if (error || !inserted) {
      throw new Error(
        `Failed to insert matter document: ${error?.message ?? 'unknown'}`,
      );
    }
    return inserted;
  }

  async listDocuments(
    matterId: string,
    orgSlug: string,
  ): Promise<MatterDocumentRow[]> {
    const { data, error } = (await this.db
      .from(SCHEMA, 'matter_documents')
      .select('*')
      .eq('matter_id', matterId)
      .eq('org_slug', orgSlug)
      .order('uploaded_at', { ascending: false })) as {
      data: MatterDocumentRow[] | null;
      error: { message: string } | null;
    };

    if (error) {
      throw new Error(
        `Failed to list documents for matter ${matterId}: ${error.message}`,
      );
    }
    return data ?? [];
  }

  async listEntities(
    matterId: string,
    orgSlug: string,
    entityType?: EntityType,
  ): Promise<MatterEntityRow[]> {
    let q = this.db
      .from(SCHEMA, 'matter_entities')
      .select('*')
      .eq('matter_id', matterId)
      .eq('org_slug', orgSlug)
      .order('name', { ascending: true });

    if (entityType) {
      q = q.eq('entity_type', entityType);
    }

    const { data, error } = (await q) as {
      data: MatterEntityRow[] | null;
      error: { message: string } | null;
    };

    if (error) {
      throw new Error(
        `Failed to list entities for matter ${matterId}: ${error.message}`,
      );
    }
    return data ?? [];
  }

  async listTimeline(
    matterId: string,
    orgSlug: string,
  ): Promise<MatterTimelineRow[]> {
    const { data, error } = (await this.db
      .from(SCHEMA, 'matter_timeline')
      .select('*')
      .eq('matter_id', matterId)
      .eq('org_slug', orgSlug)
      .order('event_date', { ascending: true })) as {
      data: MatterTimelineRow[] | null;
      error: { message: string } | null;
    };

    if (error) {
      throw new Error(
        `Failed to list timeline for matter ${matterId}: ${error.message}`,
      );
    }
    return data ?? [];
  }

  async setFactsProcessed(documentId: string, matterId: string): Promise<void> {
    const { error } = (await this.db
      .from(SCHEMA, 'matter_documents')
      .update({ facts_processed: true })
      .eq('id', documentId)
      .eq('matter_id', matterId)) as { error: { message: string } | null };

    if (error) {
      this.logger.error(
        `Failed to set facts_processed for document ${documentId}: ${error.message}`,
      );
      throw new Error(error.message);
    }
  }

  async setDocsProcessed(documentId: string, matterId: string): Promise<void> {
    const { error } = (await this.db
      .from(SCHEMA, 'matter_documents')
      .update({ docs_processed: true })
      .eq('id', documentId)
      .eq('matter_id', matterId)) as { error: { message: string } | null };

    if (error) {
      this.logger.error(
        `Failed to set docs_processed for document ${documentId}: ${error.message}`,
      );
      throw new Error(error.message);
    }
  }

  async upsertEntity(params: {
    matterId: string;
    orgSlug: string;
    entityType: string;
    name: string;
    description: string | null;
    role: string | null;
    sourceDocumentId: string;
  }): Promise<MatterEntityRow> {
    const existing = await this.findEntityByName(
      params.matterId,
      params.entityType,
      params.name,
    );

    if (existing) {
      const sourceIds = Array.from(
        new Set([...existing.source_document_ids, params.sourceDocumentId]),
      );
      const updateSql = `
        UPDATE legal.matter_entities
        SET description = $1, role = $2, source_document_ids = $3::uuid[], updated_at = NOW()
        WHERE id = $4
        RETURNING *
      `;
      const { data: rows, error } = (await this.db.rawQuery(updateSql, [
        params.description ?? existing.description,
        params.role ?? existing.role,
        sourceIds,
        existing.id,
      ])) as {
        data: MatterEntityRow[] | null;
        error: { message: string } | null;
      };

      const updated = rows?.[0] ?? null;
      if (error || !updated) {
        throw new Error(
          `Failed to update entity: ${error?.message ?? 'unknown'}`,
        );
      }
      return updated;
    }

    const insertSql = `
      INSERT INTO legal.matter_entities
        (matter_id, org_slug, entity_type, name, description, role, source_document_ids)
      VALUES ($1, $2, $3, $4, $5, $6, ARRAY[$7::uuid])
      RETURNING *
    `;
    const { data: insertRows, error: insertError } = (await this.db.rawQuery(
      insertSql,
      [
        params.matterId,
        params.orgSlug,
        params.entityType,
        params.name,
        params.description,
        params.role,
        params.sourceDocumentId,
      ],
    )) as { data: MatterEntityRow[] | null; error: { message: string } | null };

    const inserted = insertRows?.[0] ?? null;
    if (insertError || !inserted) {
      throw new Error(
        `Failed to insert entity: ${insertError?.message ?? 'unknown'}`,
      );
    }
    return inserted;
  }

  private async findEntityByName(
    matterId: string,
    entityType: string,
    name: string,
  ): Promise<MatterEntityRow | null> {
    const { data, error } = (await this.db
      .from(SCHEMA, 'matter_entities')
      .select('*')
      .eq('matter_id', matterId)
      .eq('entity_type', entityType)
      .ilike('name', name)
      .maybeSingle()) as {
      data: MatterEntityRow | null;
      error: { message: string } | null;
    };

    if (error) {
      throw new Error(`Failed to find entity: ${error.message}`);
    }
    return data;
  }

  async insertTimelineEntry(params: {
    matterId: string;
    orgSlug: string;
    eventDateRaw: string;
    eventDate: string | null;
    eventType: string;
    description: string;
    significance: string | null;
    partiesInvolved: string[];
    sourceDocumentId: string;
  }): Promise<MatterTimelineRow> {
    const sql = `
      INSERT INTO legal.matter_timeline
        (matter_id, org_slug, event_date_raw, event_date, event_type,
         description, significance, parties_involved, source_document_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9::uuid)
      RETURNING *
    `;
    const { data: rows, error } = (await this.db.rawQuery(sql, [
      params.matterId,
      params.orgSlug,
      params.eventDateRaw,
      params.eventDate,
      params.eventType,
      params.description,
      params.significance,
      params.partiesInvolved,
      params.sourceDocumentId,
    ])) as {
      data: MatterTimelineRow[] | null;
      error: { message: string } | null;
    };

    const inserted = rows?.[0] ?? null;
    if (error || !inserted) {
      throw new Error(
        `Failed to insert timeline entry: ${error?.message ?? 'unknown'}`,
      );
    }
    return inserted;
  }

  async updateDocumentClassification(params: {
    documentId: string;
    matterId: string;
    documentClass: string | null;
    documentDate: string | null;
    summary: string | null;
    parties: string[];
    keyTerms: string[];
    metadata: Record<string, unknown>;
  }): Promise<void> {
    const sql = `
      UPDATE legal.matter_documents
      SET document_class = $1, document_date = $2, summary = $3,
          parties = $4::text[], key_terms = $5::text[], metadata = $6::jsonb
      WHERE id = $7 AND matter_id = $8
    `;
    const { error } = (await this.db.rawQuery(sql, [
      params.documentClass,
      params.documentDate,
      params.summary,
      params.parties,
      params.keyTerms,
      JSON.stringify(params.metadata),
      params.documentId,
      params.matterId,
    ])) as { data: unknown; error: { message: string } | null };

    if (error) {
      throw new Error(
        `Failed to update document classification: ${error.message}`,
      );
    }
  }
}
