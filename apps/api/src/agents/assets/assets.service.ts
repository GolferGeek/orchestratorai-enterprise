import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { AssetsRepository, AssetRecord } from './assets.repository';
import {
  MEDIA_STORAGE_PROVIDER,
  MediaStorageProvider,
} from '@orchestratorai/planes/storage';

const MAX_SERVED_ASSET_BYTES = 250 * 1024 * 1024;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PATH_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SAFE_INLINE_MIME_PATTERN = /^(image|audio|video)\/[A-Za-z0-9.+-]+$/;

@Injectable()
export class AssetsService {
  private readonly mediaBucket: string;

  constructor(
    private readonly repo: AssetsRepository,
    private readonly config: ConfigService,
    @Inject(MEDIA_STORAGE_PROVIDER)
    private readonly mediaStorage: MediaStorageProvider,
  ) {
    this.mediaBucket = this.config.getOrThrow<string>('MEDIA_STORAGE_BUCKET');
  }

  async getMetadata(id: string): Promise<AssetRecord> {
    const rec = await this.repo.get(id);
    if (!rec) throw new NotFoundException('Asset not found');
    return rec;
  }

  async saveBuffer(params: {
    organizationSlug: string;
    conversationId: string;
    userId: string;
    mime: string;
    buffer: Buffer;
    filename?: string;
    subpath?: string;
  }): Promise<AssetRecord> {
    const bucket = this.mediaBucket;
    if (!params.userId.trim()) {
      throw new Error('Asset user ID is required');
    }
    const mime = this.requireMime(params.mime);
    this.requireSafeSize(params.buffer.length);
    const org = this.requirePathSegment(params.organizationSlug, 'org slug');
    const conversation = this.requirePathSegment(
      params.conversationId,
      'conversation ID',
    );
    const subpath = params.subpath
      ? this.requirePath(params.subpath, 'asset subpath')
      : '';
    const name = this.requirePathSegment(
      params.filename ?? randomUUID(),
      'asset filename',
    );
    const path = [org, conversation, subpath, name].filter(Boolean).join('/');

    await this.mediaStorage.upload(bucket, path, params.buffer, {
      contentType: mime,
    });

    return this.repo.create({
      storage: this.mediaStorage.providerName,
      bucket,
      object_key: path,
      mime,
      size: params.buffer.length,
      user_id: params.userId,
      conversation_id: conversation,
    });
  }

  async streamStoredAssetById(
    id: string,
    res: import('express').Response,
  ): Promise<void> {
    if (!UUID_V4_PATTERN.test(id)) {
      throw new NotFoundException('Asset not found');
    }
    const rec = await this.getMetadata(id);
    await this.sendStoredRecord(rec, res);
  }

  async streamStoredAsset(
    bucket: string,
    objectPath: string,
    res: import('express').Response,
  ): Promise<void> {
    if (bucket !== this.mediaBucket) {
      throw new NotFoundException('Asset not found');
    }
    const safePath = this.requirePath(objectPath, 'asset path');
    const rec = await this.repo.getByStorageLocation(bucket, safePath);
    if (!rec) {
      throw new NotFoundException('Asset not found');
    }
    await this.sendStoredRecord(rec, res);
  }

  private async sendStoredRecord(
    rec: AssetRecord,
    res: import('express').Response,
  ): Promise<void> {
    if (rec.storage === 'external' || !rec.bucket || !rec.object_key) {
      throw new NotFoundException('Asset has no stored content');
    }
    if (rec.bucket !== this.mediaBucket) {
      throw new NotFoundException('Asset not found');
    }
    if (rec.size !== null && rec.size !== undefined) {
      this.requireSafeSize(rec.size);
    }

    const { data } = await this.mediaStorage.download(
      rec.bucket,
      rec.object_key,
    );
    this.requireSafeSize(data.length);

    const mime = this.requireMime(rec.mime);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', data.length);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    if (!SAFE_INLINE_MIME_PATTERN.test(mime)) {
      res.setHeader('Content-Disposition', 'attachment');
    }
    res.send(data);
  }

  private requirePath(value: string, label: string): string {
    if (!value || value.startsWith('/') || value.endsWith('/')) {
      throw new NotFoundException('Asset not found');
    }
    const segments = value.split('/');
    if (
      segments.length > 12 ||
      segments.some((segment) => !PATH_SEGMENT_PATTERN.test(segment))
    ) {
      throw new NotFoundException(`Invalid ${label}`);
    }
    return segments.join('/');
  }

  private requirePathSegment(value: string, label: string): string {
    if (!PATH_SEGMENT_PATTERN.test(value)) {
      throw new Error(`Invalid ${label}`);
    }
    return value;
  }

  private requireMime(mime: string): string {
    if (!/^[A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+$/.test(mime)) {
      throw new Error('Stored asset has an invalid MIME type');
    }
    return mime;
  }

  private requireSafeSize(size: number): void {
    if (
      !Number.isSafeInteger(size) ||
      size < 0 ||
      size > MAX_SERVED_ASSET_BYTES
    ) {
      throw new Error('Stored asset exceeds the permitted response size');
    }
  }
}
