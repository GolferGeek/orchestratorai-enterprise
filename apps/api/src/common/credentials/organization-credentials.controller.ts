import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { JsonValue } from '@orchestrator-ai/transport-types';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { checkAddress, OrganizationCredentialsService, type CredentialListing } from './organization-credentials.service';
import type { CredentialAddress } from './credential-cipher';

interface RbacRequest {
  organizationSlug?: string;
}

/**
 * An organization admin manages its credentials (x-organization-slug names
 * the organization; the RBAC guard checks they administer it). Values go in
 * and never come back out: listings carry names and metadata only.
 */
@Controller('admin/credentials')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('admin:settings')
export class OrganizationCredentialsController {
  constructor(private readonly credentials: OrganizationCredentialsService) {}

  @Get()
  list(@Req() request: RbacRequest): Promise<CredentialListing[]> {
    return this.credentials.list(this.address(request, 'x', 'x').organizationSlug);
  }

  @Put(':type/:key')
  @HttpCode(204)
  async put(
    @Req() request: RbacRequest,
    @Param('type') type: string,
    @Param('key') key: string,
    @Body() body: { value?: unknown; metadata?: unknown },
  ): Promise<void> {
    if (typeof body?.value !== 'string' || body.value.length === 0) {
      throw new BadRequestException('value must be a non-empty string');
    }
    const metadata = body.metadata ?? {};
    if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
      throw new BadRequestException('metadata must be an object');
    }
    await this.credentials.put(this.address(request, type, key), body.value, metadata as JsonValue);
  }

  @Delete(':type/:key')
  @HttpCode(204)
  async remove(@Req() request: RbacRequest, @Param('type') type: string, @Param('key') key: string): Promise<void> {
    if (!(await this.credentials.remove(this.address(request, type, key)))) {
      throw new NotFoundException(`No ${type}/${key} credential`);
    }
  }

  private address(request: RbacRequest, type: string, key: string): CredentialAddress {
    const address = { organizationSlug: request.organizationSlug ?? '', type, key };
    try {
      checkAddress(address);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    return address;
  }
}
