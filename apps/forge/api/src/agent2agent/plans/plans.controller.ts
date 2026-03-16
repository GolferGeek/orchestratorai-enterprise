import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PlansService } from './services/plans.service';
import { PlanVersionsService } from './services/plan-versions.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { SupabaseAuthUserDto } from '@/auth/dto/auth.dto';
import { ExecutionContext, NIL_UUID } from '@orchestrator-ai/transport-types';

@ApiTags('plans')
@ApiBearerAuth()
@Controller('plans')
@UseGuards(JwtAuthGuard)
export class PlansController {
  constructor(
    private readonly plansService: PlansService,
    private readonly planVersionsService: PlanVersionsService,
  ) {}

  @Get('conversation/:conversationId')
  @ApiOperation({
    summary: 'Get plans by conversation ID',
    description:
      'Retrieves plan and all versions associated with a specific conversation',
  })
  @ApiParam({ name: 'conversationId', description: 'Conversation UUID' })
  @ApiResponse({
    status: 200,
    description: 'Plan retrieved successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid conversation ID format',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findByConversation(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() currentUser: SupabaseAuthUserDto,
  ): Promise<unknown> {
    // Build a minimal ExecutionContext for plan lookup operations.
    // Only userId and conversationId are meaningful here; other fields are NIL_UUID
    // since this is a read operation that does not invoke LLM or task tracking.
    const context: ExecutionContext = {
      orgSlug: NIL_UUID,
      userId: currentUser.id,
      conversationId,
      taskId: NIL_UUID,
      planId: NIL_UUID,
      deliverableId: NIL_UUID,
      agentSlug: NIL_UUID,
      agentType: 'context',
      provider: NIL_UUID,
      model: NIL_UUID,
    };

    const plan = await this.plansService.findByConversationId(context);

    if (!plan) {
      return null;
    }

    // Update context with the planId
    const planContext: ExecutionContext = {
      ...context,
      planId: plan.id,
    };

    // Get all versions for the plan using ExecutionContext
    const versions =
      await this.planVersionsService.getVersionHistory(planContext);

    return {
      ...plan,
      versions,
    };
  }
}
