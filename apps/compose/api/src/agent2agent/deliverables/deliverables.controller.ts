import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { SupabaseAuthUserDto } from '@/auth/dto/auth.dto';
import { DeliverablesService } from './deliverables.service';
import {
  CreateDeliverableDto,
  UpdateDeliverableDto,
  DeliverableFiltersDto,
  CreateEditingConversationDto,
} from './dto';
import {
  Deliverable,
  DeliverableSearchResult,
} from './entities/deliverable.entity';

@ApiTags('deliverables')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('deliverables')
export class DeliverablesController {
  private readonly logger = new Logger(DeliverablesController.name);

  constructor(private readonly deliverablesService: DeliverablesService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new deliverable',
    description: 'Creates a new deliverable for the authenticated user',
  })
  @ApiResponse({
    status: 201,
    description: 'Deliverable created successfully',
    type: Deliverable,
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async create(
    @Body() createDeliverableDto: CreateDeliverableDto,
    @CurrentUser() currentUser: SupabaseAuthUserDto,
  ): Promise<Deliverable> {
    return this.deliverablesService.create(
      createDeliverableDto,
      currentUser.id,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Get user deliverables',
    description:
      'Retrieves all deliverables for the authenticated user with optional filtering',
  })
  @ApiResponse({
    status: 200,
    description: 'Deliverables retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: { $ref: '#/components/schemas/DeliverableSearchResult' },
        },
        total: { type: 'number' },
        limit: { type: 'number' },
        offset: { type: 'number' },
        hasMore: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search term for title and content',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter by deliverable type',
  })
  @ApiQuery({
    name: 'format',
    required: false,
    description: 'Filter by format',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of results to return (1-100)',
    type: Number,
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Number of results to skip',
    type: Number,
  })
  @ApiQuery({
    name: 'latestOnly',
    required: false,
    description: 'Show only latest versions',
    type: Boolean,
  })
  @ApiQuery({
    name: 'standalone',
    required: false,
    description: 'Filter for standalone deliverables (without conversations)',
    type: Boolean,
  })
  async findAll(
    @Query() filters: DeliverableFiltersDto,
    @CurrentUser() currentUser: SupabaseAuthUserDto,
  ): Promise<{
    items: DeliverableSearchResult[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  }> {
    this.logger.log(
      `[DeliverablesController] findAll - userId: ${currentUser.id}, filters: ${JSON.stringify(filters)}`,
    );
    return this.deliverablesService.findAll(currentUser.id, filters);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get deliverable by ID',
    description: 'Retrieves a specific deliverable by its ID',
  })
  @ApiParam({ name: 'id', description: 'Deliverable UUID' })
  @ApiResponse({
    status: 200,
    description: 'Deliverable retrieved successfully',
    type: Deliverable,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Deliverable not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: SupabaseAuthUserDto,
  ): Promise<Deliverable> {
    return this.deliverablesService.findOne(id, currentUser.id);
  }

  @Get('debug/all')
  @ApiOperation({
    summary: '[DEBUG] Get all deliverables without user filtering',
    description: 'Debug endpoint to see all deliverables in the database',
  })
  async debugAllDeliverables(): Promise<Record<string, unknown>> {
    return this.deliverablesService.debugAllDeliverables();
  }

  @Get('conversation/:conversationId')
  @ApiOperation({
    summary: 'Get deliverables by conversation ID',
    description:
      'Retrieves all deliverables associated with a specific conversation',
  })
  @ApiParam({ name: 'conversationId', description: 'Conversation UUID' })
  @ApiResponse({
    status: 200,
    description: 'Deliverables retrieved successfully',
    type: [Deliverable],
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid conversation ID format',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findByConversation(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() currentUser: SupabaseAuthUserDto,
  ): Promise<Deliverable[]> {
    return this.deliverablesService.findByConversation(
      conversationId,
      currentUser.id,
    );
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update deliverable',
    description: 'Updates an existing deliverable',
  })
  @ApiParam({ name: 'id', description: 'Deliverable UUID' })
  @ApiResponse({
    status: 200,
    description: 'Deliverable updated successfully',
    type: Deliverable,
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Deliverable not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDeliverableDto: UpdateDeliverableDto,
    @CurrentUser() currentUser: SupabaseAuthUserDto,
  ): Promise<Deliverable> {
    return this.deliverablesService.update(
      id,
      updateDeliverableDto,
      currentUser.id,
    );
  }

  @Post(':id/conversations')
  @ApiOperation({
    summary: 'Create editing conversation for deliverable',
    description:
      'Creates a new conversation for editing a standalone deliverable',
  })
  @ApiParam({ name: 'id', description: 'Deliverable UUID' })
  @ApiResponse({
    status: 201,
    description: 'Editing conversation created successfully',
    schema: {
      type: 'object',
      properties: {
        conversationId: {
          type: 'string',
          description: 'ID of the created conversation',
        },
        message: {
          type: 'string',
          description: 'Initial context message for the conversation',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Deliverable not found' })
  async createEditingConversation(
    @Param('id', ParseUUIDPipe) deliverableId: string,
    @Body() createEditingConversationDto: CreateEditingConversationDto,
    @CurrentUser() currentUser: SupabaseAuthUserDto,
  ): Promise<{ conversationId: string; message: string }> {
    return this.deliverablesService.createEditingConversation(
      deliverableId,
      createEditingConversationDto,
      currentUser.id,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete deliverable',
    description: 'Deletes a deliverable and all its versions',
  })
  @ApiParam({ name: 'id', description: 'Deliverable UUID' })
  @ApiResponse({ status: 204, description: 'Deliverable deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Deliverable not found' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: SupabaseAuthUserDto,
  ): Promise<void> {
    return this.deliverablesService.remove(id, currentUser.id);
  }
}
