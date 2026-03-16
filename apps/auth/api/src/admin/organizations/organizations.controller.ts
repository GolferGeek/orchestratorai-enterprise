import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import {
  OrganizationsService,
  Organization,
  CreateOrganizationDto,
  UpdateOrganizationDto,
} from './organizations.service';

@ApiTags('Organizations')
@Controller('admin/organizations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all organizations' })
  @ApiResponse({
    status: 200,
    description: 'List of all organizations',
  })
  async findAll(): Promise<Organization[]> {
    return this.organizationsService.findAll();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get organization statistics' })
  @ApiResponse({
    status: 200,
    description: 'Organization statistics',
  })
  async getStats(): Promise<{ total: number }> {
    return this.organizationsService.getStats();
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get a specific organization by slug' })
  @ApiParam({ name: 'slug', description: 'Organization slug' })
  @ApiResponse({
    status: 200,
    description: 'Organization details',
  })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async findOne(@Param('slug') slug: string): Promise<Organization> {
    const organization = await this.organizationsService.findOne(slug);
    if (!organization) {
      throw new HttpException('Organization not found', HttpStatus.NOT_FOUND);
    }
    return organization;
  }

  @Post()
  @ApiOperation({ summary: 'Create a new organization' })
  @ApiResponse({
    status: 201,
    description: 'Organization created successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 409, description: 'Organization slug already exists' })
  async create(@Body() dto: CreateOrganizationDto): Promise<Organization> {
    return this.organizationsService.create(dto);
  }

  @Put(':slug')
  @ApiOperation({ summary: 'Update an organization' })
  @ApiParam({ name: 'slug', description: 'Organization slug' })
  @ApiResponse({
    status: 200,
    description: 'Organization updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async update(
    @Param('slug') slug: string,
    @Body() dto: UpdateOrganizationDto,
  ): Promise<Organization> {
    return this.organizationsService.update(slug, dto);
  }

  @Delete(':slug')
  @ApiOperation({ summary: 'Delete an organization' })
  @ApiParam({ name: 'slug', description: 'Organization slug' })
  @ApiResponse({
    status: 200,
    description: 'Organization deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  @ApiResponse({
    status: 409,
    description: 'Cannot delete organization with assigned agents',
  })
  async delete(@Param('slug') slug: string): Promise<{ message: string }> {
    await this.organizationsService.delete(slug);
    return { message: 'Organization deleted successfully' };
  }
}
