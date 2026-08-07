import {
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  JsonRpcErrorCode,
  type A2AInvokeErrorResponse,
  type A2AInvokeSuccessResponse,
} from '@orchestrator-ai/transport-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { validateA2AInvokeRequest } from '../../common/validation/a2a-invoke-validation';
import { validateSavePipelineInput } from './pipeline-validation';
import { PipelinesService } from './pipelines.service';

interface AuthorizedRequest {
  organizationSlug?: string;
}

@Controller('pipelines')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class PipelinesController {
  private readonly logger = new Logger(PipelinesController.name);

  constructor(private readonly pipelines: PipelinesService) {}

  @Post('invoke')
  @HttpCode(200)
  async invoke(
    @Body() body: unknown,
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ): Promise<A2AInvokeSuccessResponse | A2AInvokeErrorResponse> {
    const validation = validateA2AInvokeRequest(
      body,
      user.id,
      request.organizationSlug,
    );
    if (!validation.valid) {
      return invalidParams(validation.id, validation.message);
    }
    const { id, params } = validation.request;
    if (
      params.context.agentSlug !== 'pipeline-builder' ||
      params.context.agentType !== 'pipeline' ||
      params.data.contentType !== 'json' ||
      params.metadata !== undefined
    ) {
      return invalidParams(id, 'Pipeline invoke target is invalid');
    }
    const inputValidation = validateSavePipelineInput(params.data.content);
    if (!inputValidation.valid) {
      return invalidParams(id, inputValidation.message);
    }

    try {
      const pipeline = await this.pipelines.save(
        params.context,
        inputValidation.input,
      );
      return {
        jsonrpc: '2.0',
        id,
        result: {
          success: true,
          output: { content: pipeline, outputType: 'json' },
          context: params.context,
        },
      };
    } catch {
      this.logger.error('Pipeline save failed');
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: JsonRpcErrorCode.INTERNAL_ERROR,
          message: 'Pipeline save failed',
        },
      };
    }
  }

  @Get()
  async list(
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ) {
    if (!request.organizationSlug) {
      throw new Error('RBAC did not bind an authorized organization');
    }
    return this.pipelines.list(user.id, request.organizationSlug);
  }
}

function invalidParams(
  id: string | number | null,
  message: string,
): A2AInvokeErrorResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: { code: JsonRpcErrorCode.INVALID_PARAMS, message },
  };
}
