import {
  Injectable,
  CanActivate,
  ExecutionContext as NestExecutionContext,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  isA2AInvokeRequest,
  isExecutionContext,
} from '@orchestrator-ai/transport-types';

/**
 * Shared Validation Guard for A2A invoke requests
 *
 * Validates that incoming requests conform to the JSON-RPC 2.0 invoke
 * contract defined in transport-types.
 *
 * Usage:
 * @UseGuards(JwtAuthGuard, ValidationGuard)
 * @Post('invoke')
 * async invoke(@Body() body: A2AInvokeRequest) { ... }
 */
@Injectable()
export class ValidationGuard implements CanActivate {
  private readonly logger = new Logger(ValidationGuard.name);

  canActivate(
    context: NestExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest<{ body: unknown }>();
    const body = request.body;

    // Validate A2A request format if it looks like an A2A request
    if (this.isA2ARequest(body)) {
      this.validateA2ARequest(body);
    }

    return true;
  }

  /**
   * Check if request appears to be an A2A invoke request
   */
  private isA2ARequest(body: unknown): boolean {
    if (!body || typeof body !== 'object') {
      return false;
    }

    const bodyObj = body as Record<string, unknown>;
    // Check for JSON-RPC 2.0 structure or params.context
    return (
      bodyObj.jsonrpc === '2.0' ||
      !!(bodyObj.params && typeof bodyObj.params === 'object')
    );
  }

  /**
   * Validate A2A invoke request format
   */
  private validateA2ARequest(body: unknown): void {
    if (!isA2AInvokeRequest(body)) {
      this.logger.warn('Invalid A2A invoke request format received');
      throw new BadRequestException(
        'Invalid A2A request format - must follow JSON-RPC 2.0 and transport-types invoke spec',
      );
    }

    // Validate ExecutionContext if present
    const bodyObj = body as { params?: { context?: unknown } };
    const params = bodyObj.params;
    if (params && 'context' in params && !isExecutionContext(params.context)) {
      this.logger.warn('Invalid ExecutionContext in A2A invoke request');
      throw new BadRequestException(
        'Invalid ExecutionContext in request - must include all required fields',
      );
    }
  }
}

/**
 * Shared parameter validation utilities
 */
export class ParameterValidator {
  private static readonly logger = new Logger(ParameterValidator.name);

  /**
   * Validate conversation ID parameter
   */
  static validateConversationId(conversationId: string, userId: string): void {
    if (
      !conversationId ||
      conversationId === 'undefined' ||
      conversationId === 'null'
    ) {
      this.logger.warn(
        `Invalid conversation ID received: "${conversationId}" from user ${userId}`,
      );
      throw new BadRequestException('Invalid conversation ID provided');
    }
  }
}
