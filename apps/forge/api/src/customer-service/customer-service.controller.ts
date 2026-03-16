import {
  Controller,
  Post,
  Body,
  Logger,
  HttpCode,
  HttpStatus,
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
  UseGuards,
  Headers,
  Req,
  Inject,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { CustomerServiceService } from './customer-service.service';
import { RateLimitGuard } from './guards/rate-limit.guard';
import {
  AUTH_SERVICE,
  AuthServiceProvider,
} from '@orchestratorai/planes/auth/interfaces/auth-service.interface';
import { CustomerServiceService as CustomerServiceAgentService } from '../agents/customer-service/customer-service.service';
import {
  ExecutionContext,
  isExecutionContext,
} from '@orchestrator-ai/transport-types';
import { v4 as uuidv4 } from 'uuid';

interface SaveTranscriptBody {
  sessionToken?: string; // For guest sessions
  email: string;
  name?: string;
  company?: string;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ConverseBody {
  userMessage: string;
  messages?: ConversationMessage[];
  interactionMode?: 'text' | 'voice';
  /** Optional: when using Bearer auth, client may send context from store */
  context?: ExecutionContext;
  /** Optional: when using Bearer auth without context, used for ExecutionContext.conversationId */
  conversationId?: string;
}

@Controller('customer-service')
export class CustomerServiceController {
  private readonly logger = new Logger(CustomerServiceController.name);

  constructor(
    private readonly customerServiceService: CustomerServiceService,
    @Inject(AUTH_SERVICE) private readonly authService: AuthServiceProvider,
    private readonly customerServiceAgent: CustomerServiceAgentService,
  ) {}

  /**
   * Create an anonymous guest session for the landing page widget.
   * No authentication required — returns a signed session token.
   * POST /customer-service/session
   * RateLimitGuard enforces per-IP daily session creation limit.
   */
  @Public()
  @UseGuards(RateLimitGuard)
  @Post('session')
  @HttpCode(HttpStatus.CREATED)
  createSession(): { sessionToken: string; conversationId: string } {
    this.logger.log('POST /customer-service/session — creating guest session');
    return this.customerServiceService.createSession();
  }

  /**
   * Associate lead info (email, name, company) with an anonymous session.
   * Supports both guest sessions (sessionToken) and authenticated users (Bearer token).
   * POST /customer-service/save
   * RateLimitGuard counts save calls against the per-session message limit.
   */
  @Public()
  @UseGuards(RateLimitGuard)
  @Post('save')
  @HttpCode(HttpStatus.OK)
  async save(
    @Req() req: Request,
    @Headers('authorization') authHeader: string,
    @Body() body: SaveTranscriptBody,
  ): Promise<{ success: boolean }> {
    if (!body.email) {
      throw new BadRequestException('email is required');
    }

    // Try sessionToken from body first (guest sessions)
    let sessionToken = body.sessionToken;

    // If no sessionToken in body, try to extract from Authorization header (authenticated users)
    if (!sessionToken && authHeader) {
      if (authHeader.startsWith('GuestSession ')) {
        sessionToken = authHeader.slice('GuestSession '.length).trim();
      } else if (authHeader.startsWith('Bearer ')) {
        // Authenticated users: validate Bearer token via AUTH_SERVICE
        const token = authHeader.slice('Bearer '.length).trim();
        if (!token) {
          throw new BadRequestException('Bearer token is required');
        }
        const user = await this.authService.validateUser(token);
        if (!user) {
          this.logger.warn('Save Bearer validation failed: no user');
          throw new UnauthorizedException('Invalid or expired Bearer token');
        }
        this.logger.log(
          `POST /customer-service/save — email=${body.email} (authenticated userId=${user.id})`,
        );
        // TODO: persist to a leads table in a future migration
        return { success: true };
      }
    }

    if (!sessionToken) {
      throw new BadRequestException(
        'sessionToken or authorization token is required',
      );
    }

    this.logger.log(`POST /customer-service/save — email=${body.email}`);

    const result = this.customerServiceService.saveTranscript(
      sessionToken,
      body.email,
      body.name,
      body.company,
    );

    // Slot already reserved in RateLimitGuard
    return result;
  }

  /**
   * Process a chat message via the customer-service LangGraph agent.
   * Accepts either GuestSession (landing widget) or Bearer (authenticated Agent Pool) tokens.
   * Verifies the token, builds or uses ExecutionContext, and invokes the agent directly.
   * POST /customer-service/converse
   */
  @Public()
  @UseGuards(RateLimitGuard)
  @Post('converse')
  @HttpCode(HttpStatus.OK)
  async converse(
    @Req() req: Request,
    @Headers('authorization') authHeader: string,
    @Body() body: ConverseBody,
  ): Promise<Record<string, unknown>> {
    if (!body.userMessage) {
      throw new BadRequestException('userMessage is required');
    }

    if (!authHeader?.trim()) {
      throw new BadRequestException(
        'Authorization header with GuestSession or Bearer token is required',
      );
    }

    let executionContext: ExecutionContext;

    // --- GuestSession: landing widget flow ---
    if (authHeader.startsWith('GuestSession ')) {
      const token = authHeader.slice('GuestSession '.length).trim();
      if (!token) {
        throw new BadRequestException('GuestSession token is required');
      }
      const session = this.customerServiceService.verifySessionToken(token);
      if (!session) {
        throw new BadRequestException('Invalid or expired session token');
      }
      executionContext = session.executionContext;
      this.logger.log(
        `POST /customer-service/converse — guest userId=${session.sub}, mode=${body.interactionMode ?? 'text'}`,
      );
    } else if (authHeader.startsWith('Bearer ')) {
      // --- Bearer: authenticated Agent Pool / voice mode flow ---
      const token = authHeader.slice('Bearer '.length).trim();
      if (!token) {
        throw new BadRequestException('Bearer token is required');
      }
      const user = await this.authService.validateUser(token);
      if (!user) {
        this.logger.warn('Converse Bearer validation failed: no user');
        throw new UnauthorizedException('Invalid or expired Bearer token');
      }
      const userId = user.id;
      if (
        body.context &&
        isExecutionContext(body.context) &&
        body.context.userId === userId
      ) {
        executionContext = body.context;
      } else {
        const conversationId =
          typeof body.conversationId === 'string' && body.conversationId.trim()
            ? body.conversationId.trim()
            : uuidv4();
        const orgSlug =
          typeof body.context?.orgSlug === 'string'
            ? body.context.orgSlug.trim()
            : '';
        if (!orgSlug) {
          throw new BadRequestException(
            'context.orgSlug is required for authenticated customer-service converse. Provide context with orgSlug from the client store.',
          );
        }
        executionContext =
          this.customerServiceService.buildExecutionContextForAuthenticatedUser(
            userId,
            conversationId,
            orgSlug,
          );
      }
      this.logger.log(
        `POST /customer-service/converse — authenticated userId=${userId}, mode=${body.interactionMode ?? 'text'}`,
      );
    } else {
      throw new BadRequestException(
        'Authorization header must be GuestSession <token> or Bearer <token>',
      );
    }

    // Invoke the LangGraph customer-service agent directly (no HTTP round-trip)
    const result = await this.customerServiceAgent.process({
      context: executionContext,
      userMessage: body.userMessage,
      messages: body.messages || [],
      interactionMode: body.interactionMode ?? 'text',
    });

    if (result.status === 'failed') {
      this.logger.error(
        `Customer service agent failed: ${result.error ?? 'unknown error'}`,
      );
      throw new InternalServerErrorException(
        result.error || 'Customer service agent failed to respond',
      );
    }

    if (!result.response) {
      this.logger.error('Customer service agent returned no response');
      throw new InternalServerErrorException(
        'Customer service agent returned a response with no message.',
      );
    }

    return { message: result.response };
  }
}
