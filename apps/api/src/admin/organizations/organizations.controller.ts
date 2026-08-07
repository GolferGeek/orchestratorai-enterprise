import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import {
  type CreateOrganizationDto,
  type Organization,
  OrganizationsService,
  type UpdateOrganizationDto,
} from './organizations.service';

@Controller('admin/organizations')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('admin:settings')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  async findAll(): Promise<Organization[]> {
    return this.organizationsService.findAll();
  }

  @Get('stats')
  async getStats(): Promise<{ total: number }> {
    return this.organizationsService.getStats();
  }

  @Get(':slug')
  async findOne(@Param('slug') slug: string): Promise<Organization> {
    const organization = await this.organizationsService.findOne(slug);
    if (!organization) {
      throw new HttpException('Organization not found', HttpStatus.NOT_FOUND);
    }
    return organization;
  }

  @Post()
  async create(@Body() dto: CreateOrganizationDto): Promise<Organization> {
    return this.organizationsService.create(dto);
  }

  @Put(':slug')
  async update(
    @Param('slug') slug: string,
    @Body() dto: UpdateOrganizationDto,
  ): Promise<Organization> {
    return this.organizationsService.update(slug, dto);
  }

  @Delete(':slug')
  async delete(@Param('slug') slug: string): Promise<{ message: string }> {
    await this.organizationsService.delete(slug);
    return { message: 'Organization deleted successfully' };
  }
}
