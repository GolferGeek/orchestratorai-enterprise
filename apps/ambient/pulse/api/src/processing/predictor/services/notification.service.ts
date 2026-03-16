import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import {
  NotificationType,
  NotificationChannel,
  NotificationPriority,
  NotificationPayload,
  NotificationData,
  NotificationDeliveryResult,
  NotificationRecord,
  CreateNotificationOptions,
  UserNotificationConfig,
} from '../interfaces/notification.interface';
import { Prediction } from '../interfaces/prediction.interface';

/**
 * NotificationService
 *
 * Phase 9: Notifications & Streaming
 *
 * Centralized notification service for the prediction system.
 * Supports multiple delivery channels (push, SMS, email, SSE) with
 * configurable user preferences and priority-based routing.
 *
 * Key Features:
 * - Multi-channel delivery (push, sms, email, sse)
 * - Priority-based routing (critical, high, medium, low)
 * - User preference management
 * - Quiet hours support
 * - Notification type filtering
 *
 * Notification Types:
 * - urgent_prediction: Fast-path urgent prediction created
 * - new_prediction: New prediction generated
 * - prediction_resolved: Prediction outcome determined
 * - review_pending: Signal awaiting human review (HITL)
 * - learning_suggested: AI suggested a new learning
 * - missed_opportunity: Significant move without prediction
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  // Default priority mapping by notification type
  private readonly defaultPriorities: Record<
    NotificationType,
    NotificationPriority
  > = {
    urgent_prediction: 'critical',
    new_prediction: 'high',
    prediction_resolved: 'medium',
    review_pending: 'high',
    learning_suggested: 'medium',
    missed_opportunity: 'low',
  };

  // Default channels by priority
  private readonly channelsByPriority: Record<
    NotificationPriority,
    NotificationChannel[]
  > = {
    critical: ['push', 'sms', 'sse', 'slack'],
    high: ['push', 'sse', 'slack'],
    medium: ['sse', 'email'],
    low: ['sse'],
  };

  // In-memory user config cache (would be loaded from database in production)
  private readonly userConfigs = new Map<string, UserNotificationConfig>();

  // SSE subscribers (in-memory for now, would use Redis PubSub in production)
  private readonly sseSubscribers = new Map<
    string,
    Set<(notification: NotificationPayload) => void>
  >();

  constructor(private readonly configService: ConfigService) {}

  /**
   * Create and send a notification
   *
   * @param options - Notification creation options
   * @returns NotificationRecord with delivery results
   */
  async notify(
    options: CreateNotificationOptions,
  ): Promise<NotificationRecord> {
    const { type, userId, organizationSlug } = options;

    this.logger.log(`Creating ${type} notification for user ${userId}`);

    // Build notification payload
    const payload = this.buildPayload(options);

    // Determine channels based on priority and user preferences
    const channels = this.resolveChannels(
      userId,
      payload.priority,
      options.channelOverrides,
    );

    // Check quiet hours
    const activeChannels = this.filterByQuietHours(userId, channels);

    if (activeChannels.length === 0) {
      this.logger.log(
        `All channels filtered out for user ${userId} (quiet hours)`,
      );
    }

    // Deliver to each channel
    const deliveryResults = this.deliverToChannels(
      userId,
      payload,
      activeChannels,
    );

    // Determine overall status
    const successCount = deliveryResults.filter((r) => r.success).length;
    const status =
      successCount === activeChannels.length
        ? 'delivered'
        : successCount > 0
          ? 'partial'
          : activeChannels.length === 0
            ? 'pending'
            : 'failed';

    const record: NotificationRecord = {
      ...payload,
      userId,
      organizationSlug,
      deliveryResults,
      status,
    };

    this.logger.log(
      `Notification ${payload.id} delivered: ${status} (${successCount}/${activeChannels.length} channels)`,
    );

    return Promise.resolve(record);
  }

  /**
   * Send urgent prediction notification
   * Uses critical priority and all available channels
   */
  async notifyUrgentPrediction(
    userId: string,
    organizationSlug: string,
    prediction: Prediction,
    targetSymbol?: string,
  ): Promise<NotificationRecord> {
    return this.notify({
      type: 'urgent_prediction',
      userId,
      organizationSlug,
      prediction,
      context: {
        targetId: prediction.target_id,
        targetSymbol,
      },
      priorityOverride: 'critical',
    });
  }

  /**
   * Send new prediction notification
   */
  async notifyNewPrediction(
    userId: string,
    organizationSlug: string,
    prediction: Prediction,
    targetSymbol?: string,
  ): Promise<NotificationRecord> {
    return this.notify({
      type: 'new_prediction',
      userId,
      organizationSlug,
      prediction,
      context: {
        targetId: prediction.target_id,
        targetSymbol,
      },
    });
  }

  /**
   * Send prediction resolved notification
   */
  async notifyPredictionResolved(
    userId: string,
    organizationSlug: string,
    prediction: Prediction,
    targetSymbol?: string,
  ): Promise<NotificationRecord> {
    return this.notify({
      type: 'prediction_resolved',
      userId,
      organizationSlug,
      prediction,
      context: {
        targetId: prediction.target_id,
        targetSymbol,
      },
    });
  }

  /**
   * Send review pending notification (HITL)
   */
  async notifyReviewPending(
    userId: string,
    organizationSlug: string,
    reviewItem: NotificationData['reviewItem'],
  ): Promise<NotificationRecord> {
    return this.notify({
      type: 'review_pending',
      userId,
      organizationSlug,
      reviewItem,
    });
  }

  /**
   * Send learning suggested notification
   */
  async notifyLearningSuggested(
    userId: string,
    organizationSlug: string,
    learningSuggestion: NotificationData['learningSuggestion'],
  ): Promise<NotificationRecord> {
    return this.notify({
      type: 'learning_suggested',
      userId,
      organizationSlug,
      learningSuggestion,
    });
  }

  /**
   * Send missed opportunity notification
   */
  async notifyMissedOpportunity(
    userId: string,
    organizationSlug: string,
    missedOpportunity: NotificationData['missedOpportunity'],
  ): Promise<NotificationRecord> {
    return this.notify({
      type: 'missed_opportunity',
      userId,
      organizationSlug,
      missedOpportunity,
    });
  }

  /**
   * Subscribe to SSE notifications for a user
   *
   * @param userId - User ID to subscribe for
   * @param callback - Callback function for notifications
   * @returns Unsubscribe function
   */
  subscribeSSE(
    userId: string,
    callback: (notification: NotificationPayload) => void,
  ): () => void {
    if (!this.sseSubscribers.has(userId)) {
      this.sseSubscribers.set(userId, new Set());
    }

    this.sseSubscribers.get(userId)!.add(callback);
    this.logger.debug(`SSE subscriber added for user ${userId}`);

    return () => {
      this.sseSubscribers.get(userId)?.delete(callback);
      this.logger.debug(`SSE subscriber removed for user ${userId}`);
    };
  }

  /**
   * Update user notification preferences
   */
  updateUserConfig(config: UserNotificationConfig): void {
    this.userConfigs.set(config.userId, config);
    this.logger.log(`Updated notification config for user ${config.userId}`);
  }

  /**
   * Get user notification preferences
   */
  getUserConfig(userId: string): UserNotificationConfig | undefined {
    return this.userConfigs.get(userId);
  }

  /**
   * Build notification payload from options
   */
  private buildPayload(
    options: CreateNotificationOptions,
  ): NotificationPayload {
    const {
      type,
      prediction,
      reviewItem,
      learningSuggestion,
      missedOpportunity,
      context,
    } = options;

    const priority = options.priorityOverride || this.defaultPriorities[type];
    const { title, message } = this.generateTitleAndMessage(type, options);

    const data: NotificationData = {
      context,
      actionUrl: this.generateActionUrl(type, options),
    };

    if (prediction) {
      data.prediction = {
        id: prediction.id,
        targetId: prediction.target_id,
        targetSymbol: context?.targetSymbol,
        direction: prediction.direction,
        confidence: prediction.confidence,
        timeframeHours: prediction.timeframe_hours,
        status: prediction.status,
        outcomeValue: prediction.outcome_value ?? undefined,
      };
    }

    if (reviewItem) {
      data.reviewItem = reviewItem;
    }

    if (learningSuggestion) {
      data.learningSuggestion = learningSuggestion;
    }

    if (missedOpportunity) {
      data.missedOpportunity = missedOpportunity;
    }

    return {
      id: uuidv4(),
      type,
      priority,
      title,
      message: options.customMessage || message,
      data,
      createdAt: new Date().toISOString(),
      expiresAt:
        priority === 'critical'
          ? undefined
          : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  /**
   * Generate title and message based on notification type
   */
  private generateTitleAndMessage(
    type: NotificationType,
    options: CreateNotificationOptions,
  ): { title: string; message: string } {
    const symbol = options.context?.targetSymbol || 'asset';

    switch (type) {
      case 'urgent_prediction':
        return {
          title: 'Urgent Prediction',
          message: `Urgent ${options.prediction?.direction?.toUpperCase()} signal for ${symbol} (${Math.round((options.prediction?.confidence || 0) * 100)}% confidence)`,
        };

      case 'new_prediction':
        return {
          title: 'New Prediction',
          message: `New ${options.prediction?.direction?.toUpperCase()} prediction for ${symbol} (${Math.round((options.prediction?.confidence || 0) * 100)}% confidence)`,
        };

      case 'prediction_resolved': {
        const outcome = options.prediction?.outcome_value;
        const outcomeStr =
          outcome !== null && outcome !== undefined
            ? `${outcome >= 0 ? '+' : ''}${outcome.toFixed(2)}%`
            : 'N/A';
        return {
          title: 'Prediction Resolved',
          message: `${symbol} prediction resolved: ${outcomeStr}`,
        };
      }

      case 'review_pending':
        return {
          title: 'Review Required',
          message: `Signal awaiting review: ${options.reviewItem?.signalSummary || 'New signal'}`,
        };

      case 'learning_suggested':
        return {
          title: 'Learning Suggestion',
          message: `AI suggested: ${options.learningSuggestion?.content?.substring(0, 100) || 'New learning'}`,
        };

      case 'missed_opportunity': {
        const move = options.missedOpportunity?.movePercent;
        return {
          title: 'Missed Opportunity',
          message: `${symbol} moved ${move ? `${move >= 0 ? '+' : ''}${move.toFixed(2)}%` : 'significantly'} without prediction`,
        };
      }

      default:
        return {
          title: 'Notification',
          message: 'You have a new notification',
        };
    }
  }

  /**
   * Generate action URL for notification deep link
   */
  private generateActionUrl(
    type: NotificationType,
    options: CreateNotificationOptions,
  ): string {
    const baseUrl = '/predictions';

    switch (type) {
      case 'urgent_prediction':
      case 'new_prediction':
      case 'prediction_resolved':
        return `${baseUrl}/${options.prediction?.id}`;

      case 'review_pending':
        return `${baseUrl}/review-queue/${options.reviewItem?.id}`;

      case 'learning_suggested':
        return `${baseUrl}/learning-queue/${options.learningSuggestion?.id}`;

      case 'missed_opportunity':
        return `${baseUrl}/missed-opportunities/${options.missedOpportunity?.id}`;

      default:
        return baseUrl;
    }
  }

  /**
   * Resolve which channels to use based on priority and user preferences
   */
  private resolveChannels(
    userId: string,
    priority: NotificationPriority,
    overrides?: NotificationChannel[],
  ): NotificationChannel[] {
    if (overrides && overrides.length > 0) {
      return overrides;
    }

    const userConfig = this.userConfigs.get(userId);
    if (!userConfig) {
      return this.channelsByPriority[priority];
    }

    // Filter by user's enabled channels
    const enabledChannels: NotificationChannel[] = [];
    const defaultChannels = this.channelsByPriority[priority];

    for (const channel of defaultChannels) {
      const channelConfig = userConfig.channels[channel];
      if (channelConfig?.enabled !== false) {
        enabledChannels.push(channel);
      }
    }

    return enabledChannels;
  }

  /**
   * Filter channels by quiet hours
   */
  private filterByQuietHours(
    userId: string,
    channels: NotificationChannel[],
  ): NotificationChannel[] {
    const userConfig = this.userConfigs.get(userId);
    if (!userConfig) {
      return channels;
    }

    const now = new Date();
    const currentTime = now.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      timeZone: userConfig.timezone || 'UTC',
    });

    return channels.filter((channel) => {
      const channelConfig = userConfig.channels[channel];
      if (!channelConfig?.quietHoursStart || !channelConfig?.quietHoursEnd) {
        return true;
      }

      const { quietHoursStart, quietHoursEnd } = channelConfig;

      // Check if current time is within quiet hours
      if (quietHoursStart <= quietHoursEnd) {
        // Normal range (e.g., 22:00 - 07:00 next day)
        return currentTime < quietHoursStart || currentTime >= quietHoursEnd;
      } else {
        // Overnight range (e.g., 22:00 - 07:00)
        return currentTime < quietHoursStart && currentTime >= quietHoursEnd;
      }
    });
  }

  /**
   * Deliver notification to specified channels
   */
  private deliverToChannels(
    userId: string,
    payload: NotificationPayload,
    channels: NotificationChannel[],
  ): NotificationDeliveryResult[] {
    const results: NotificationDeliveryResult[] = [];

    for (const channel of channels) {
      try {
        const result = this.deliverToChannel(userId, payload, channel);
        results.push(result);
      } catch (error) {
        results.push({
          channel,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Deliver notification to a single channel
   */
  private deliverToChannel(
    userId: string,
    payload: NotificationPayload,
    channel: NotificationChannel,
  ): NotificationDeliveryResult {
    switch (channel) {
      case 'sse':
        return this.deliverSSE(userId, payload);

      case 'push':
        return this.deliverPush(userId, payload);

      case 'sms':
        return this.deliverSMS(userId, payload);

      case 'email':
        return this.deliverEmail(userId, payload);

      case 'slack':
        return this.deliverSlack(userId, payload);

      default:
        return {
          channel: channel as NotificationChannel,
          success: false,
          error: `Unknown channel: ${String(channel)}`,
        };
    }
  }

  /**
   * Deliver via SSE (in-memory subscribers)
   */
  private deliverSSE(
    userId: string,
    payload: NotificationPayload,
  ): NotificationDeliveryResult {
    const subscribers = this.sseSubscribers.get(userId);

    if (!subscribers || subscribers.size === 0) {
      this.logger.debug(`No SSE subscribers for user ${userId}`);
      return {
        channel: 'sse',
        success: true,
        deliveredAt: new Date().toISOString(),
        messageId: `sse-${payload.id}`,
      };
    }

    for (const callback of subscribers) {
      try {
        callback(payload);
      } catch (error) {
        this.logger.warn(
          `SSE callback error for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return {
      channel: 'sse',
      success: true,
      deliveredAt: new Date().toISOString(),
      messageId: `sse-${payload.id}`,
    };
  }

  /**
   * Deliver via push notification
   * TODO: Integrate with actual push service (Firebase, APNs, etc.)
   */
  private deliverPush(
    userId: string,
    payload: NotificationPayload,
  ): NotificationDeliveryResult {
    this.logger.log(
      `[PUSH] Would send to ${userId}: ${payload.title} - ${payload.message}`,
    );

    // Placeholder - would integrate with Firebase Cloud Messaging or similar
    return {
      channel: 'push',
      success: true,
      deliveredAt: new Date().toISOString(),
      messageId: `push-${payload.id}`,
    };
  }

  /**
   * Deliver via SMS
   * TODO: Integrate with actual SMS service (Twilio, etc.)
   */
  private deliverSMS(
    userId: string,
    payload: NotificationPayload,
  ): NotificationDeliveryResult {
    this.logger.log(`[SMS] Would send to ${userId}: ${payload.message}`);

    // Placeholder - would integrate with Twilio or similar
    return {
      channel: 'sms',
      success: true,
      deliveredAt: new Date().toISOString(),
      messageId: `sms-${payload.id}`,
    };
  }

  /**
   * Deliver via email
   * TODO: Integrate with actual email service (SendGrid, SES, etc.)
   */
  private deliverEmail(
    userId: string,
    payload: NotificationPayload,
  ): NotificationDeliveryResult {
    this.logger.log(`[EMAIL] Would send to ${userId}: ${payload.title}`);

    // Placeholder - would integrate with SendGrid or similar
    return {
      channel: 'email',
      success: true,
      deliveredAt: new Date().toISOString(),
      messageId: `email-${payload.id}`,
    };
  }

  /**
   * Deliver via Slack Incoming Webhook
   *
   * Sprint 4: Slack notification support
   *
   * Environment variable: PREDICTION_SLACK_WEBHOOK_URL
   * Configure a Slack Incoming Webhook URL to enable Slack notifications.
   */
  private deliverSlack(
    userId: string,
    payload: NotificationPayload,
  ): NotificationDeliveryResult {
    const webhookUrl = this.configService.get<string>(
      'PREDICTION_SLACK_WEBHOOK_URL',
    );

    if (!webhookUrl) {
      this.logger.debug('[SLACK] Webhook URL not configured, skipping');
      return {
        channel: 'slack',
        success: true,
        deliveredAt: new Date().toISOString(),
        messageId: `slack-${payload.id}`,
      };
    }

    // Determine color based on priority
    const colors: Record<NotificationPriority, string> = {
      critical: '#FF0000', // red
      high: '#FFA500', // orange
      medium: '#0000FF', // blue
      low: '#808080', // gray
    };

    const color = colors[payload.priority] || '#808080';

    // Format message for Slack
    const slackPayload = {
      attachments: [
        {
          color,
          title: payload.title,
          text: payload.message,
          footer: `Priority: ${payload.priority} | User: ${userId}`,
          ts: Math.floor(new Date(payload.createdAt).getTime() / 1000),
          actions: payload.data.actionUrl
            ? [
                {
                  type: 'button',
                  text: 'View Details',
                  url: payload.data.actionUrl,
                },
              ]
            : undefined,
        },
      ],
    };

    // Fire and forget - don't block on Slack delivery
    fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(slackPayload),
    })
      .then((response) => {
        if (!response.ok) {
          this.logger.warn(
            `[SLACK] Failed to send notification: ${response.statusText}`,
          );
        } else {
          this.logger.log(
            `[SLACK] Sent notification to channel: ${payload.title}`,
          );
        }
      })
      .catch((error) => {
        this.logger.error(
          `[SLACK] Error sending notification: ${error instanceof Error ? error.message : String(error)}`,
        );
      });

    return {
      channel: 'slack',
      success: true,
      deliveredAt: new Date().toISOString(),
      messageId: `slack-${payload.id}`,
    };
  }
}
