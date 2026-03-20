import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { SupabaseAuthUserDto } from '@/auth/dto/auth.dto';
import { EntitlementsService, Entitlement, GrantEntitlementDto } from './entitlements.service';

@ApiTags('Entitlements')
@Controller('auth/admin/organizations/:orgSlug/entitlements')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EntitlementsController {
  constructor(private readonly entitlementsService: EntitlementsService) {}

  @Get()
  @ApiOperation({ summary: 'List entitlements for an organization' })
  @ApiParam({ name: 'orgSlug', description: 'Organization slug' })
  @ApiResponse({ status: 200, description: 'List of entitlements for the org' })
  async findByOrg(@Param('orgSlug') orgSlug: string): Promise<Entitlement[]> {
    return this.entitlementsService.findByOrg(orgSlug);
  }

  @Post()
  @ApiOperation({ summary: 'Grant a product entitlement to an organization' })
  @ApiParam({ name: 'orgSlug', description: 'Organization slug' })
  @ApiResponse({ status: 201, description: 'Entitlement granted' })
  @ApiResponse({ status: 400, description: 'Invalid product' })
  async grant(
    @Param('orgSlug') orgSlug: string,
    @Body() dto: GrantEntitlementDto,
    @CurrentUser() user: SupabaseAuthUserDto,
  ): Promise<Entitlement> {
    return this.entitlementsService.grant(orgSlug, dto, user.id);
  }

  @Delete(':product')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a product entitlement from an organization' })
  @ApiParam({ name: 'orgSlug', description: 'Organization slug' })
  @ApiParam({ name: 'product', description: 'Product to revoke' })
  @ApiResponse({ status: 204, description: 'Entitlement revoked' })
  @ApiResponse({ status: 400, description: 'Invalid product' })
  async revoke(
    @Param('orgSlug') orgSlug: string,
    @Param('product') product: string,
  ): Promise<void> {
    return this.entitlementsService.revoke(orgSlug, product);
  }
}
