import {
  Controller,
  Get,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { AssetsService } from './assets.service';
import { Public } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';

// Asset URLs are opaque bearer capabilities embedded in generated content.
// Public reads are restricted to exact database-backed asset records; callers
// cannot use this controller as an arbitrary storage or external-URL proxy.
@Controller('assets')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('admin:settings')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  /**
   * Proxy endpoint for storage files.
   * Allows the browser to fetch storage files through the API instead of
   * directly hitting the storage provider (which may not be reachable from the browser).
   *
   * URL pattern: /assets/storage/:bucket/path/to/file.ext
   */
  @Public()
  @Get('storage/:bucket/*path')
  async proxyStorage(
    @Param('bucket') bucket: string,
    @Param('path') path: string | string[],
    @Res() res: Response,
  ) {
    const objectPath = Array.isArray(path) ? path.join('/') : path;
    await this.assets.streamStoredAsset(bucket, objectPath, res);
  }

  @Public()
  @Get(':id')
  async stream(@Param('id') id: string, @Res() res: Response) {
    await this.assets.streamStoredAssetById(id, res);
  }
}
