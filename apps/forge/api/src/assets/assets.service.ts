import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import { AssetsRepository, AssetRecord } from './assets.repository';
import {
  MEDIA_STORAGE_PROVIDER,
  MediaStorageProvider,
} from '@orchestratorai/planes/storage';
import axios from 'axios';

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);
  private readonly fetchExternal: boolean;
  private readonly fetchMaxBytes: number;
  private readonly externalStrategy: 'redirect' | 'proxy';

  constructor(
    private readonly repo: AssetsRepository,
    private readonly config: ConfigService,
    @Inject(MEDIA_STORAGE_PROVIDER)
    private readonly mediaStorage: MediaStorageProvider,
  ) {
    this.fetchExternal =
      this.config.getOrThrow<string>('ASSET_FETCH_EXTERNAL') === 'true';
    this.fetchMaxBytes = this.config.getOrThrow<number>('ASSET_FETCH_MAX_BYTES');
    this.externalStrategy = this.config.getOrThrow<string>(
      'ASSET_EXTERNAL_STRATEGY',
    ) as 'redirect' | 'proxy';
  }

  async getMetadata(id: string): Promise<AssetRecord> {
    const rec = await this.repo.get(id);
    if (!rec) throw new NotFoundException('Asset not found');
    return rec;
  }

  async saveBuffer(params: {
    organizationSlug?: string | null;
    conversationId?: string | null;
    userId?: string | null;
    mime: string;
    buffer: Buffer;
    filename?: string;
    subpath?: string;
  }): Promise<AssetRecord> {
    const bucket = this.config.getOrThrow<string>('MEDIA_STORAGE_BUCKET');
    const org = (params.organizationSlug || 'global').toString();
    const convo = params.conversationId || 'unknown';
    const name = params.filename || `asset-${Date.now()}`;
    const path = join(org, convo, params.subpath || '', name);

    await this.mediaStorage.upload(bucket, path, params.buffer, {
      contentType: params.mime,
    });

    return this.repo.create({
      storage: 'supabase',
      bucket,
      object_key: path,
      mime: params.mime,
      size: params.buffer.length,
      user_id: params.userId ?? null,
      conversation_id: convo,
    });
  }

  async saveFromUrl(params: {
    url: string;
    organizationSlug?: string | null;
    conversationId?: string | null;
    userId?: string | null;
    filename?: string;
    subpath?: string;
  }): Promise<AssetRecord> {
    if (!this.fetchExternal) {
      throw new Error(
        'External fetching disabled (set ASSET_FETCH_EXTERNAL=true)',
      );
    }
    const resp = await axios.get(params.url, {
      responseType: 'arraybuffer',
      maxContentLength: this.fetchMaxBytes,
    });
    const mime =
      (resp.headers['content-type'] as string) || 'application/octet-stream';
    const bufferData: Buffer = Buffer.from(resp.data as ArrayBuffer);
    if (bufferData.length > this.fetchMaxBytes) {
      throw new Error(
        `Asset exceeds max size (${bufferData.length} > ${this.fetchMaxBytes})`,
      );
    }
    const filename =
      params.filename || this.deriveFilenameFromUrl(params.url, mime);
    return this.saveBuffer({
      organizationSlug: params.organizationSlug ?? null,
      conversationId: params.conversationId ?? null,
      userId: params.userId ?? null,
      mime,
      buffer: bufferData,
      filename,
      subpath: params.subpath || 'images',
    });
  }

  async registerExternal(params: {
    url: string;
    mime?: string;
    userId?: string | null;
    conversationId?: string | null;
  }): Promise<AssetRecord> {
    return this.repo.create({
      storage: 'supabase',
      source_url: params.url,
      mime: params.mime || 'application/octet-stream',
      user_id: params.userId ?? null,
      conversation_id: params.conversationId ?? null,
    });
  }

  async streamByIdOrRedirect(id: string, res: import('express').Response) {
    const rec = await this.getMetadata(id);
    if ((rec.storage as string) === 'external') {
      const url = rec.source_url || '';
      if (!url) throw new NotFoundException('External asset URL missing');
      if (this.externalStrategy === 'redirect') {
        res.redirect(302, url);
        return;
      }
      // proxy
      const prox = await axios.get(url, { responseType: 'stream' });
      const mime =
        (prox.headers['content-type'] as string) || 'application/octet-stream';
      res.setHeader('Content-Type', mime);
      (prox.data as NodeJS.ReadableStream).pipe(res);
      return;
    }
    // plane-based download
    if (!rec.bucket || !rec.object_key) {
      throw new NotFoundException('Asset has no stored content');
    }
    const { data, contentType } = await this.mediaStorage.download(
      rec.bucket,
      rec.object_key,
    );
    res.setHeader('Content-Type', contentType || rec.mime || 'application/octet-stream');
    res.send(data);
  }

  private deriveFilenameFromUrl(u: string, mime: string): string {
    try {
      const url = new URL(u);
      const last = url.pathname.split('/').filter(Boolean).pop();
      if (last && /\.[a-zA-Z0-9]+$/.test(last)) return last;
    } catch {
      // Non-URL input; generate a name from mime
    }
    const ext = this.extFromMime(mime);
    return `image-${Date.now()}.${ext}`;
  }

  private extFromMime(mime: string): string {
    const m = (mime || '').toLowerCase();
    if (m.includes('png')) return 'png';
    if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
    if (m.includes('webp')) return 'webp';
    if (m.includes('gif')) return 'gif';
    return 'bin';
  }
}
