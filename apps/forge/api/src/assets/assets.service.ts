import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createReadStream, promises as fs } from 'fs';
import { join, resolve, dirname } from 'path';
import { AssetsRepository, AssetRecord } from './assets.repository';
import axios from 'axios';

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);
  private readonly backend = (process.env.ASSET_STORAGE_BACKEND || 'local') as
    | 'local'
    | 'supabase';
  private readonly baseDir = resolve(
    process.env.IMAGE_STORAGE_DIR || './storage/images',
  );
  private readonly fetchExternal =
    (process.env.ASSET_FETCH_EXTERNAL || 'false') === 'true';
  private readonly fetchMaxBytes = parseInt(
    process.env.ASSET_FETCH_MAX_BYTES || `${10 * 1024 * 1024}`,
    10,
  ); // 10MB default
  private readonly externalStrategy = (process.env.ASSET_EXTERNAL_STRATEGY ||
    'redirect') as 'redirect' | 'proxy';

  constructor(private readonly repo: AssetsRepository) {}

  async ensureBaseDir() {
    if (this.backend !== 'local') return;
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
    } catch (e) {
      this.logger.warn(
        `Failed to ensure image base dir: ${this.baseDir}: ${String(e)}`,
      );
    }
  }

  async getMetadata(id: string): Promise<AssetRecord> {
    const rec = await this.repo.get(id);
    if (!rec) throw new NotFoundException('Asset not found');
    return rec;
  }

  getReadStream(id: string) {
    // Only local streaming is implemented in MVP
    return (async () => {
      const rec = await this.getMetadata(id);
      if (rec.storage !== 'local') {
        throw new NotFoundException('Streaming not available for this backend');
      }
      const p = rec.path ? join(this.baseDir, rec.path) : null;
      if (!p) throw new NotFoundException('Asset path missing');
      return { stream: createReadStream(p), mime: rec.mime };
    })();
  }

  async saveBuffer(params: {
    organizationSlug?: string | null;
    conversationId?: string | null;
    userId?: string | null;
    mime: string;
    buffer: Buffer;
    filename?: string;
    subpath?: string; // optional additional subpath
  }): Promise<AssetRecord> {
    if (this.backend !== 'local') {
      // Placeholder for future supabase implementation
      throw new Error('Only local storage is implemented');
    }
    await this.ensureBaseDir();
    const org = (params.organizationSlug || 'global').toString();
    const convo = params.conversationId || 'unknown';
    const name = params.filename || `asset-${Date.now()}`;
    const rel = join(org, convo, params.subpath || '', name);
    const abs = join(this.baseDir, rel);
    await fs.mkdir(dirname(abs), { recursive: true });
    await fs.writeFile(abs, params.buffer);
    const rec = await this.repo.create({
      storage: 'local',
      path: rel,
      mime: params.mime,
      size: params.buffer.length,
      user_id: params.userId || null,
      conversation_id: convo,
    });
    return rec;
  }

  async registerLocalPath(params: {
    path: string; // relative to baseDir
    mime: string;
    size?: number;
    userId?: string | null;
    conversationId?: string | null;
  }): Promise<AssetRecord> {
    if (this.backend !== 'local') {
      throw new Error('Only local storage is implemented');
    }
    await this.ensureBaseDir();
    const rel = params.path.replace(/^\/+/, '');
    const abs = join(this.baseDir, rel);
    const stat = await fs.stat(abs);
    const size = params.size ?? stat.size;
    const rec = await this.repo.create({
      storage: 'local',
      path: rel,
      mime: params.mime,
      size,
      user_id: params.userId || null,
      conversation_id: params.conversationId || null,
    });
    return rec;
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
    if (this.backend !== 'local') {
      throw new Error('Only local storage is implemented');
    }
    await this.ensureBaseDir();
    const resp = await axios.get(params.url, {
      responseType: 'arraybuffer',
      maxContentLength: this.fetchMaxBytes,
    });
    const mime =
      (resp.headers['content-type'] as string) || 'application/octet-stream';
    const bufferData: Buffer = Buffer.from(resp.data as ArrayLike<number>);
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

  private deriveFilenameFromUrl(u: string, mime: string): string {
    try {
      const url = new URL(u);
      const last = url.pathname.split('/').filter(Boolean).pop();
      if (last && /\.[a-zA-Z0-9]+$/.test(last)) return last;
    } catch {
      // Non-URL input; fall back to generated name
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

  async registerExternal(params: {
    url: string;
    mime?: string;
    userId?: string | null;
    conversationId?: string | null;
  }): Promise<AssetRecord> {
    // Metadata-only record pointing to external source URL
    const rec = await this.repo.create({
      storage: 'supabase',
      source_url: params.url,
      mime: params.mime || 'application/octet-stream',
      user_id: params.userId || null,
      conversation_id: params.conversationId || null,
    });
    return rec;
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
    // local streaming
    const { stream, mime } = await this.getReadStream(id);
    res.setHeader('Content-Type', mime || 'application/octet-stream');
    stream.pipe(res);
  }
}
