import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  NotFoundException,
  Post,
  Body,
  Logger,
  Inject,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AssetsService } from './assets.service';
import {
  MEDIA_STORAGE_PROVIDER,
  MediaStorageProvider,
} from '@orchestratorai/planes/storage';
import {
  RemoteJwtAuthGuard as JwtAuthGuard,
  RemoteRbacGuard as RbacGuard,
  RequirePermission,
  Public,
} from '@orchestratorai/auth-client';

// Class-level default: admin-only for registration endpoints.
// Two public exceptions: GET /assets/storage/:bucket/* and GET /assets/:id.
// Those must stay reachable without auth so browsers can render image/asset
// references embedded in AI-generated content (pages, messages, documents).
// TODO(forge-auth-remote-unification): add signed-URL support so public asset
// streams can be scoped to a specific user/session without requiring auth on
// every image load.
@Controller('assets')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('admin:settings')
export class AssetsController {
  private readonly logger = new Logger(AssetsController.name);

  constructor(
    private readonly assets: AssetsService,
    @Inject(MEDIA_STORAGE_PROVIDER)
    private readonly storageProvider: MediaStorageProvider,
  ) {}

  /**
   * Proxy endpoint for storage files.
   * Allows the browser to fetch storage files through the API instead of
   * directly hitting the storage provider (which may not be reachable from the browser).
   *
   * URL pattern: /assets/storage/:bucket/path/to/file.ext
   */
  @Public()
  @Get('storage/:bucket/*')
  async proxyStorage(
    @Param('bucket') bucket: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Extract the full path after /storage/:bucket/
    const fullUrl = req.originalUrl;
    const storagePrefix = `/assets/storage/${bucket}/`;
    const objectPath = fullUrl.substring(
      fullUrl.indexOf(storagePrefix) + storagePrefix.length,
    );

    if (!objectPath) {
      throw new NotFoundException('Storage path required');
    }

    this.logger.debug(`Storage proxy: bucket=${bucket}, path=${objectPath}`);

    const { data: buffer, contentType } = await this.storageProvider.download(
      bucket,
      objectPath,
    );

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  }

  @Public()
  @Get(':id')
  async stream(@Param('id') id: string, @Res() res: Response) {
    try {
      await this.assets.streamByIdOrRedirect(id, res);
    } catch {
      throw new NotFoundException('Asset not found');
    }
  }

  // Test/helper endpoint: register an external URL as metadata-only asset
  @Post('register-external')
  async registerExternal(@Body() body: { url: string; mime?: string }) {
    if (!body?.url) {
      throw new NotFoundException('url is required');
    }
    const rec = await this.assets.registerExternal({
      url: body.url,
      mime: body.mime,
    });
    return { success: true, id: rec.id, url: `/assets/${rec.id}` };
  }

  private inferMime(path: string): string {
    const p = path.toLowerCase();
    if (p.endsWith('.png')) return 'image/png';
    if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
    if (p.endsWith('.webp')) return 'image/webp';
    if (p.endsWith('.gif')) return 'image/gif';
    return 'application/octet-stream';
  }
}
