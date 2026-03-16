/**
 * Notification interfaces for prediction system
 * Phase 9: Notifications & Streaming
 *
 * Defines types for configurable multi-channel notifications
 * including push, SMS, email, and SSE channels.
 */

import { Prediction } from './prediction.interface';

/**
 * Notification types for different prediction events
 */
export type NotificationType =
  | 'urgent_prediction' // Fast-path urgent prediction created
  | 'new_prediction' // New prediction generated
  | 'prediction_resolved' // Prediction outcome determined
  | 'review_pending' // Signal awaiting human review (HITL)
  | 'learning_suggested' // AI suggested a new learning
  | 'missed_opportunity'; // Significant move without prediction

/**
 * Delivery channels for notifications
 */
export type NotificationChannel = 'push' | 'sms' | 'email' | 'sse' | 'slack';

/**
 * Priority levels for notifications
 * - critical: Immediate delivery on all channels (urgent predictions)
 * - high: Near-immediate delivery (new predictions, review pending)
 * - medium: Standard delivery (resolved, learning suggested)
 * - low: Batched delivery (missed opportunities summary)
 */
export type NotificationPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * User notification preferences per channel
 */
export interface ChannelPreferences {
  enabled: boolean;
  notificationTypes?: NotificationType[];
  quietHoursStart?: string; // HH:mm format
  quietHoursEnd?: string; // HH:mm format
}

/**
 * User notification configuration
 */
export interface UserNotificationConfig {
  userId: string;
  channels: {
    push?: ChannelPreferences;
    sms?: ChannelPreferences;
    email?: ChannelPreferences;
    sse?: ChannelPreferences;
    slack?: ChannelPreferences;
  };
  /** Default: include all notification types */
  enabledTypes?: NotificationType[];
  /** Timezone for quiet hours (e.g., 'America/New_York') */
  timezone?: string;
}

/**
 * Notification payload sent to delivery channels
 */
export interface NotificationPayload {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  data: NotificationData;
  createdAt: string;
  expiresAt?: string;
}

/**
 * Data payload for different notification types
 */
export interface NotificationData {
  /** Prediction details (for prediction-related notifications) */
  prediction?: {
    id: string;
    targetId: string;
    targetSymbol?: string;
    direction: string;
    confidence: number;
    timeframeHours: number;
    status?: string;
    outcomeValue?: number;
  };
  /** Review queue item (for review_pending) */
  reviewItem?: {
    id: string;
    signalId: string;
    signalSummary: string;
    confidence: number;
  };
  /** Learning suggestion (for learning_suggested) */
  learningSuggestion?: {
    id: string;
    type: string;
    content: string;
    sourceType: string;
  };
  /** Missed opportunity (for missed_opportunity) */
  missedOpportunity?: {
    id: string;
    targetId: string;
    targetSymbol?: string;
    movePercent: number;
    direction: string;
    detectedAt: string;
  };
  /** Universe/target context */
  context?: {
    universeId?: string;
    universeName?: string;
    targetId?: string;
    targetSymbol?: string;
    domain?: string;
  };
  /** Deep link URL */
  actionUrl?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result of notification delivery attempt
 */
export interface NotificationDeliveryResult {
  channel: NotificationChannel;
  success: boolean;
  deliveredAt?: string;
  error?: string;
  messageId?: string;
}

/**
 * Complete notification record with delivery status
 */
export interface NotificationRecord extends NotificationPayload {
  userId: string;
  organizationSlug: string;
  deliveryResults: NotificationDeliveryResult[];
  status: 'pending' | 'delivered' | 'partial' | 'failed';
  readAt?: string;
  dismissedAt?: string;
}

/**
 * Options for creating notifications
 */
export interface CreateNotificationOptions {
  type: NotificationType;
  userId: string;
  organizationSlug: string;
  prediction?: Prediction;
  reviewItem?: NotificationData['reviewItem'];
  learningSuggestion?: NotificationData['learningSuggestion'];
  missedOpportunity?: NotificationData['missedOpportunity'];
  context?: NotificationData['context'];
  /** Override default channels for this notification */
  channelOverrides?: NotificationChannel[];
  /** Override default priority */
  priorityOverride?: NotificationPriority;
  /** Custom message (overrides auto-generated) */
  customMessage?: string;
}
