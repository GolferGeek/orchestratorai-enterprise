import { Injectable, Logger } from '@nestjs/common';
import { ObservabilityWebhookService } from '../../observability/observability-webhook.service';

export type CustomerServiceEventType =
  | 'widget_open'
  | 'conversation_start'
  | 'message_sent'
  | 'session_duration'
  | 'intent_classification'
  | 'save_click'
  | 'error';

export interface CustomerServiceAnalyticsEvent {
  eventType: CustomerServiceEventType;
  sessionId: string;
  userId?: string;
  conversationId?: string;
  mode?: 'voice' | 'text';
  metadata?: Record<string, unknown>;
}

/**
 * CustomerServiceAnalyticsService
 *
 * Tracks customer service widget events via the existing observability infrastructure.
 * All events are routed through ObservabilityWebhookService so they appear in the
 * observability stream alongside other agent execution events.
 */
@Injectable()
export class CustomerServiceAnalyticsService {
  private readonly logger = new Logger(CustomerServiceAnalyticsService.name);

  constructor(private readonly observability: ObservabilityWebhookService) {}

  async trackEvent(event: CustomerServiceAnalyticsEvent): Promise<void> {
    this.logger.log(
      `Analytics: ${event.eventType} sessionId=${event.sessionId} mode=${event.mode ?? 'n/a'}`,
    );

    await this.observability.sendEvent({
      source_app: 'customer-service-widget',
      session_id: event.sessionId,
      hook_event_type: `customer_service.${event.eventType}`,
      userId: event.userId,
      conversationId: event.conversationId,
      agentSlug: 'customer-service',
      mode: event.mode,
      payload: {
        eventType: event.eventType,
        mode: event.mode,
        ...event.metadata,
      },
    });
  }

  async trackWidgetOpen(sessionId: string): Promise<void> {
    await this.trackEvent({ eventType: 'widget_open', sessionId });
  }

  async trackConversationStart(
    sessionId: string,
    conversationId: string,
    mode: 'voice' | 'text',
    userId?: string,
  ): Promise<void> {
    await this.trackEvent({
      eventType: 'conversation_start',
      sessionId,
      conversationId,
      mode,
      userId,
    });
  }

  async trackMessageSent(
    sessionId: string,
    conversationId: string,
    mode: 'voice' | 'text',
    userId?: string,
  ): Promise<void> {
    await this.trackEvent({
      eventType: 'message_sent',
      sessionId,
      conversationId,
      mode,
      userId,
    });
  }

  async trackSessionDuration(
    sessionId: string,
    durationSeconds: number,
    mode: 'voice' | 'text',
  ): Promise<void> {
    await this.trackEvent({
      eventType: 'session_duration',
      sessionId,
      mode,
      metadata: { durationSeconds },
    });
  }

  async trackIntentClassification(
    sessionId: string,
    conversationId: string,
    intent: string,
  ): Promise<void> {
    await this.trackEvent({
      eventType: 'intent_classification',
      sessionId,
      conversationId,
      metadata: { intent },
    });
  }

  async trackSaveClick(
    sessionId: string,
    conversationId: string,
  ): Promise<void> {
    await this.trackEvent({
      eventType: 'save_click',
      sessionId,
      conversationId,
    });
  }

  async trackError(
    sessionId: string,
    errorType: string,
    errorMessage: string,
    mode?: 'voice' | 'text',
  ): Promise<void> {
    await this.trackEvent({
      eventType: 'error',
      sessionId,
      mode,
      metadata: { errorType, errorMessage },
    });
  }
}
