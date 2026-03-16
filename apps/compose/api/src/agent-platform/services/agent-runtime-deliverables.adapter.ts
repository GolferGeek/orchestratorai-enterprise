import { Injectable, Logger } from '@nestjs/common';
import { DeliverablesService } from '@/agent2agent/deliverables/deliverables.service';
import { DeliverableVersionsService } from '@/agent2agent/deliverables/deliverable-versions.service';
import {
  CreateDeliverableDto,
  DeliverableFormat,
  DeliverableType,
  DeliverableVersionCreationType,
} from '@/agent2agent/deliverables/dto';
import {
  AgentTaskMode,
  TaskRequestDto,
} from '@agent2agent/dto/task-request.dto';
import { AssetsService } from '@/assets/assets.service';

export interface BuildDeliverableInput {
  organizationSlug: string | null;
  agentSlug: string;
  mode: AgentTaskMode;
  conversationId?: string;
  userId?: string | null;
  title?: string | null;
  content?: string | null;
  titleTemplate?: string | null;
  deliverableType?: DeliverableType | string | null;
  deliverableFormat?: DeliverableFormat | string | null;
}

interface ImageRecord {
  url?: string;
  mime?: string;
  contentType?: string;
  width?: number;
  height?: number;
  size?: number;
  thumbnailUrl?: string;
  altText?: string;
  hash?: string;
  assetId?: string;
  filename?: string;
  data?: string;
  [key: string]: unknown;
}

@Injectable()
export class AgentRuntimeDeliverablesAdapter {
  private readonly logger = new Logger(AgentRuntimeDeliverablesAdapter.name);

  constructor(
    private readonly deliverables: DeliverablesService,
    private readonly versions: DeliverableVersionsService,
    private readonly assets?: AssetsService,
  ) {}

  async maybeCreateFromBuild(
    ctx: BuildDeliverableInput,
    request: TaskRequestDto,
  ): Promise<
    | { kind: 'version'; deliverableId: string; version: unknown }
    | { kind: 'deliverable'; deliverable: unknown }
    | null
  > {
    try {
      if (ctx.mode !== AgentTaskMode.BUILD) return null;
      const userId = this.resolveUserId(request);
      const conversationId = ctx.conversationId;
      if (!userId || !conversationId) {
        return null;
      }

      const baseTitle = ctx.title || `Build output from ${ctx.agentSlug}`;
      const payload = request.payload;
      const content =
        ctx.content ||
        (typeof payload?.output === 'string' ? payload.output : '') ||
        '';
      const images = Array.isArray(payload?.images)
        ? (payload.images as unknown[]).filter(Boolean)
        : [];
      const storedImages = await this.maybePersistImages(images, {
        organizationSlug: ctx.organizationSlug,
        conversationId,
        userId,
      });
      const title = this.computeTitle(baseTitle, ctx);
      const hasImages = storedImages.length > 0;
      const imageFormat = this.resolveImageFormat(storedImages);

      // Enhancement path: if a target deliverableId is provided, create a new version instead
      const payloadMeta = payload?.metadata as
        | Record<string, unknown>
        | undefined;
      const targetDeliverableId: string | undefined =
        (typeof payload?.deliverableId === 'string'
          ? payload.deliverableId
          : undefined) ||
        (typeof payloadMeta?.deliverableId === 'string'
          ? payloadMeta.deliverableId
          : undefined);
      if (targetDeliverableId) {
        const executionContext = {
          orgSlug: ctx.organizationSlug || 'default',
          userId: userId,
          conversationId: conversationId,
          taskId:
            request.context?.taskId ?? '00000000-0000-0000-0000-000000000000',
          planId: '00000000-0000-0000-0000-000000000000',
          deliverableId: targetDeliverableId,
          agentSlug: ctx.agentSlug,
          agentType: 'context',
          provider: '00000000-0000-0000-0000-000000000000',
          model: '00000000-0000-0000-0000-000000000000',
        };
        const version = await this.versions.createVersion(
          {
            content:
              content || (hasImages ? this.describeImageSet(storedImages) : ''),
            format:
              (hasImages ? imageFormat : undefined) ??
              this.coerceDeliverableFormat(ctx.deliverableFormat) ??
              DeliverableFormat.TEXT,
            createdByType: DeliverableVersionCreationType.AI_ENHANCEMENT,
            taskId: request.context?.taskId ?? undefined,
            metadata: {
              organizationSlug: ctx.organizationSlug,
              agentSlug: ctx.agentSlug,
              mode: ctx.mode,
              ...(hasImages ? { imagesCount: storedImages.length } : {}),
            },
            fileAttachments: hasImages ? { images: storedImages } : undefined,
          },
          executionContext,
        );
        return { kind: 'version', deliverableId: targetDeliverableId, version };
      }
      const dto: CreateDeliverableDto = {
        title,
        type:
          this.coerceDeliverableType(ctx.deliverableType) ??
          (hasImages ? DeliverableType.IMAGE : DeliverableType.DOCUMENT),
        conversationId,
        agentName: ctx.agentSlug,
        initialContent:
          content ||
          (hasImages ? this.describeImageSet(storedImages) : undefined),
        initialFormat:
          (hasImages ? imageFormat : undefined) ??
          this.coerceDeliverableFormat(ctx.deliverableFormat) ??
          DeliverableFormat.TEXT,
        initialCreationType: DeliverableVersionCreationType.AI_RESPONSE,
        initialTaskId: request.context?.taskId ?? undefined,
        initialMetadata: {
          organizationSlug: ctx.organizationSlug,
          agentSlug: ctx.agentSlug,
          mode: ctx.mode,
          ...(hasImages ? { imagesCount: storedImages.length } : {}),
        },
        initialFileAttachments: hasImages
          ? {
              images: storedImages,
            }
          : undefined,
      };

      const deliverable = await this.deliverables.create(dto, userId);

      return { kind: 'deliverable', deliverable };
    } catch (error) {
      this.logger.warn(
        `Failed to auto-create deliverable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private resolveUserId(request: TaskRequestDto): string | null {
    // prefer top-level metadata, then payload.metadata
    const topMeta = request.metadata;
    const fromTop: string | undefined =
      (typeof topMeta?.userId === 'string' ? topMeta.userId : undefined) ||
      (typeof topMeta?.createdBy === 'string' ? topMeta.createdBy : undefined);
    const payloadMetadata = request.payload?.metadata as
      | Record<string, unknown>
      | undefined;
    const fromPayload: string | undefined =
      (typeof payloadMetadata?.userId === 'string'
        ? payloadMetadata.userId
        : undefined) ||
      (typeof payloadMetadata?.createdBy === 'string'
        ? payloadMetadata.createdBy
        : undefined);
    return fromTop || fromPayload || null;
  }

  private computeTitle(
    defaultTitle: string,
    ctx: BuildDeliverableInput,
  ): string {
    const template = ctx.titleTemplate?.trim();
    if (!template) {
      return defaultTitle;
    }
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return template
      .replaceAll('{agent}', ctx.agentSlug)
      .replaceAll('{date}', date)
      .replaceAll('{conversation}', String(ctx.conversationId ?? ''))
      .replaceAll('{title}', defaultTitle);
  }

  private coerceDeliverableType(
    value?: DeliverableType | string | null,
  ): DeliverableType | undefined {
    if (!value) return undefined;
    if (Object.values(DeliverableType).includes(value as DeliverableType))
      return value as DeliverableType;
    const s = String(value).toLowerCase();
    switch (s) {
      case 'document':
        return DeliverableType.DOCUMENT;
      case 'analysis':
        return DeliverableType.ANALYSIS;
      case 'report':
        return DeliverableType.REPORT;
      case 'plan':
        return DeliverableType.PLAN;
      case 'requirements':
        return DeliverableType.REQUIREMENTS;
      default:
        return undefined;
    }
  }

  private coerceDeliverableFormat(
    value?: DeliverableFormat | string | null,
  ): DeliverableFormat | undefined {
    if (!value) return undefined;
    if (Object.values(DeliverableFormat).includes(value as DeliverableFormat))
      return value as DeliverableFormat;
    const s = String(value).toLowerCase();
    switch (s) {
      case 'markdown':
        return DeliverableFormat.MARKDOWN;
      case 'text':
        return DeliverableFormat.TEXT;
      case 'json':
        return DeliverableFormat.JSON;
      case 'html':
        return DeliverableFormat.HTML;
      case 'image/png':
        return DeliverableFormat.IMAGE_PNG;
      case 'image/jpeg':
      case 'image/jpg':
        return DeliverableFormat.IMAGE_JPEG;
      case 'image/webp':
        return DeliverableFormat.IMAGE_WEBP;
      case 'image/gif':
        return DeliverableFormat.IMAGE_GIF;
      case 'image/svg+xml':
        return DeliverableFormat.IMAGE_SVG;
      default:
        return undefined;
    }
  }

  private resolveImageFormat(
    images: ImageRecord[],
  ): DeliverableFormat | undefined {
    if (!images.length) {
      return undefined;
    }

    const mime = String(images[0]?.mime || '').toLowerCase();
    if (!mime) {
      return undefined;
    }

    return (
      this.coerceDeliverableFormat(mime) ??
      (mime as unknown as DeliverableFormat)
    );
  }

  private describeImageSet(images: ImageRecord[]): string {
    if (!images.length) {
      return 'Image assets';
    }

    const lines = images.map((img, index) => {
      const label: string = img.mime ? String(img.mime) : 'image';
      const dims =
        img.width && img.height
          ? `${img.width}x${img.height}`
          : img.width || img.height
            ? `${img.width ?? img.height}px`
            : 'unknown size';
      return `- Image ${index + 1}: ${label} (${dims})`;
    });

    return ['Generated image set:', ...lines].join('\n');
  }

  private normalizeImageAttachment(input: unknown): ImageRecord {
    const obj: Record<string, unknown> =
      typeof input === 'object' && input
        ? (input as Record<string, unknown>)
        : {};
    const out: ImageRecord = {
      url:
        typeof obj.url === 'string'
          ? obj.url
          : typeof obj.href === 'string'
            ? obj.href
            : '',
      mime:
        typeof obj.mime === 'string'
          ? obj.mime
          : typeof obj.contentType === 'string'
            ? obj.contentType
            : undefined,
    };
    if (typeof obj.width === 'number') out.width = obj.width;
    if (typeof obj.height === 'number') out.height = obj.height;
    if (typeof obj.size === 'number') out.size = obj.size;
    if (typeof obj.thumbnailUrl === 'string')
      out.thumbnailUrl = obj.thumbnailUrl;
    if (typeof obj.altText === 'string') out.altText = obj.altText;
    if (typeof obj.hash === 'string') out.hash = obj.hash;
    return out;
  }

  private async maybePersistImages(
    images: unknown[],
    ctx: {
      organizationSlug: string | null;
      conversationId: string | null;
      userId: string | null;
    },
  ): Promise<ImageRecord[]> {
    if (!images || images.length === 0) return [];
    const results: ImageRecord[] = [];
    for (let i = 0; i < images.length; i++) {
      const img = images[i] || {};
      const hasData =
        typeof img === 'object' &&
        img !== null &&
        'data' in img &&
        typeof img.data === 'string' &&
        img.data.length > 0;
      if (hasData && this.assets) {
        try {
          const imgObj = img as Record<string, unknown>;
          let mime: string =
            (imgObj.mime as string) ||
            (imgObj.contentType as string) ||
            'image/png';
          let base64 = img.data as string;
          const match = /^data:([^;]+);base64,(.*)$/i.exec(base64);
          if (match) {
            mime = match[1] || mime;
            base64 = match[2] || '';
          }
          const buffer = Buffer.from(base64, 'base64');
          const filename =
            (imgObj.filename as string) ||
            `image-${Date.now()}-${i}.${this.extFromMime(mime)}`;
          const rec = await this.assets.saveBuffer({
            organizationSlug: ctx.organizationSlug,
            conversationId: ctx.conversationId,
            userId: ctx.userId,
            mime,
            buffer,
            filename,
            subpath: 'images',
          });
          results.push({
            assetId: rec.id,
            url: `/assets/${rec.id}`,
            mime,
            width: (imgObj.width as number) || undefined,
            height: (imgObj.height as number) || undefined,
            size: rec.size || undefined,
            thumbnailUrl: (imgObj.thumbnailUrl as string) || undefined,
            altText: (imgObj.altText as string) || undefined,
            hash: (imgObj.hash as string) || undefined,
          });
          continue;
        } catch (e) {
          this.logger.warn(`Failed to persist image asset: ${String(e)}`);
        }
      }
      // Optionally fetch-and-store external URLs
      const imgObj = img as Record<string, unknown>;
      const hasUrl =
        typeof imgObj.url === 'string' && /^https?:\/\//i.test(imgObj.url);
      if (hasUrl && this.assets) {
        try {
          const rec = await this.assets.saveFromUrl({
            url: imgObj.url as string,
            organizationSlug: ctx.organizationSlug,
            conversationId: ctx.conversationId,
            userId: ctx.userId,
            filename: imgObj.filename as string | undefined,
            subpath: 'images',
          });
          results.push({
            assetId: rec.id,
            url: `/assets/${rec.id}`,
            mime: rec.mime,
            width: (imgObj.width as number) || undefined,
            height: (imgObj.height as number) || undefined,
            size: rec.size || undefined,
            thumbnailUrl: (imgObj.thumbnailUrl as string) || undefined,
            altText: (imgObj.altText as string) || undefined,
            hash: (imgObj.hash as string) || undefined,
          });
          continue;
        } catch (e) {
          this.logger.warn(
            `Fetch-and-store disabled or failed, registering external: ${String(e)}`,
          );
          try {
            const rec = await this.assets.registerExternal({
              url: imgObj.url as string,
              mime: (imgObj.mime as string) || (imgObj.contentType as string),
            });
            results.push({
              assetId: rec.id,
              url: `/assets/${rec.id}`,
              mime:
                (imgObj.mime as string) ||
                (imgObj.contentType as string) ||
                'application/octet-stream',
              width: (imgObj.width as number) || undefined,
              height: (imgObj.height as number) || undefined,
              size: (imgObj.size as number) || undefined,
              thumbnailUrl: (imgObj.thumbnailUrl as string) || undefined,
              altText: (imgObj.altText as string) || undefined,
              hash: (imgObj.hash as string) || undefined,
            });
            continue;
          } catch (e2) {
            this.logger.warn(
              `Failed to register external reference: ${String(e2)}`,
            );
          }
        }
      }
      results.push(this.normalizeImageAttachment(img));
    }
    return results;
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
