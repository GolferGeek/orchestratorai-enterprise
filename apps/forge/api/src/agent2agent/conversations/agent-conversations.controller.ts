import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AgentConversationsService } from './agent-conversations.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { SupabaseAuthUserDto } from '@/auth/dto/auth.dto';
import {
  CreateAgentConversationDto,
  AgentConversationQueryParams,
} from '@/agent2agent/types/agent-conversations.types';

@Controller('agent-conversations')
@UseGuards(JwtAuthGuard)
export class AgentConversationsController {
  private readonly logger = new Logger(AgentConversationsController.name);

  constructor(
    private readonly agentConversationsService: AgentConversationsService,
  ) {}

  /**
   * List agent conversations for the current user
   * GET /agent-conversations
   */
  @Get()
  async listConversations(
    @Query() query: AgentConversationQueryParams,
    @CurrentUser() currentUser: SupabaseAuthUserDto,
  ) {
    // Ensure user can only see their own conversations
    const params = {
      ...query,
      userId: currentUser.id,
    };

    return this.agentConversationsService.listConversations(params);
  }

  /**
   * Get a specific conversation by ID
   * GET /agent-conversations/:id
   */
  @Get(':id')
  async getConversation(
    @Param('id') conversationId: string,
    @CurrentUser() currentUser: SupabaseAuthUserDto,
  ) {
    const conversation =
      await this.agentConversationsService.getConversationById(
        conversationId,
        currentUser.id,
      );

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    return conversation;
  }

  /**
   * Create a new agent conversation
   * POST /agent-conversations
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createConversation(
    @Body() dto: CreateAgentConversationDto,
    @CurrentUser() currentUser: SupabaseAuthUserDto,
  ) {
    return this.agentConversationsService.createConversation(
      currentUser.id,
      dto,
    );
  }

  /**
   * End a conversation
   * PUT /agent-conversations/:id/end
   */
  @Put(':id/end')
  @HttpCode(HttpStatus.OK)
  async endConversation(
    @Param('id') conversationId: string,
    @CurrentUser() currentUser: SupabaseAuthUserDto,
  ) {
    await this.agentConversationsService.endConversation(
      conversationId,
      currentUser.id,
    );

    return { success: true };
  }

  /**
   * Update conversation metadata
   * PUT /agent-conversations/:id/metadata
   */
  @Put(':id/metadata')
  @HttpCode(HttpStatus.OK)
  async updateMetadata(
    @Param('id') conversationId: string,
    @Body() metadata: Record<string, unknown>,
    @CurrentUser() currentUser: SupabaseAuthUserDto,
  ) {
    await this.agentConversationsService.updateConversationMetadata(
      conversationId,
      currentUser.id,
      metadata,
    );

    return { success: true };
  }

  /**
   * Delete a conversation
   * DELETE /agent-conversations/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConversation(
    @Param('id') conversationId: string,
    @CurrentUser() currentUser: SupabaseAuthUserDto,
  ) {
    await this.agentConversationsService.deleteConversation(
      conversationId,
      currentUser.id,
    );

    return { success: true };
  }

  /**
   * Get active conversations for the current user
   * GET /agent-conversations/active
   */
  @Get('active')
  async getActiveConversations(
    @CurrentUser() currentUser: SupabaseAuthUserDto,
  ) {
    return this.agentConversationsService.getActiveConversations(
      currentUser.id,
    );
  }
}
