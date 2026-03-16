import type { JsonObject } from "@orchestrator-ai/transport-types";

export enum DeliverableType {
  DOCUMENT = "document",
  ANALYSIS = "analysis",
  REPORT = "report",
  PLAN = "plan",
  REQUIREMENTS = "requirements",
  IMAGE = "image",
  VIDEO = "video",
}
export enum DeliverableFormat {
  MARKDOWN = "markdown",
  TEXT = "text",
  JSON = "json",
  HTML = "html",
  IMAGE_PNG = "image/png",
  IMAGE_JPEG = "image/jpeg",
  IMAGE_WEBP = "image/webp",
  IMAGE_GIF = "image/gif",
  IMAGE_SVG = "image/svg+xml",
}
export enum DeliverableVersionCreationType {
  AI_RESPONSE = "ai_response",
  MANUAL_EDIT = "manual_edit",
  AI_ENHANCEMENT = "ai_enhancement",
  USER_REQUEST = "user_request",
}
export interface Deliverable {
  id: string;
  userId: string;
  conversationId?: string;
  projectStepId?: string;
  agentName?: string;
  title: string;
  description?: string;
  type?: DeliverableType;
  createdAt: string;
  updatedAt: string;
  currentVersion?: DeliverableVersion;
  versions?: DeliverableVersion[];
}
export interface DeliverableVersion {
  id: string;
  deliverableId: string;
  versionNumber: number;
  content?: string;
  format?: DeliverableFormat;
  isCurrentVersion: boolean;
  createdByType: DeliverableVersionCreationType;
  taskId?: string;
  metadata?: JsonObject;
  fileAttachments?: JsonObject;
  createdAt: string;
  updatedAt: string;
}
export interface CreateDeliverableDto {
  title: string;
  description?: string;
  type?: DeliverableType;
  conversationId?: string;
  projectStepId?: string;
  agentName?: string;
  initialContent?: string;
  initialFormat?: DeliverableFormat;
  initialCreationType?: DeliverableVersionCreationType;
  initialTaskId?: string;
  initialMetadata?: JsonObject;
  initialFileAttachments?: JsonObject;
}
export interface CreateVersionDto {
  content: string;
  format?: DeliverableFormat;
  createdByType?: DeliverableVersionCreationType;
  taskId?: string;
  metadata?: JsonObject;
  fileAttachments?: JsonObject;
}
export interface DeliverableFilters {
  type?: DeliverableType;
  format?: DeliverableFormat;
  search?: string;
  limit?: number;
  offset?: number;
  latestOnly?: boolean;
  standalone?: boolean;
  agentName?: string;
  createdAfter?: string;
}
export interface DeliverableSearchResult {
  id: string;
  userId: string;
  conversationId?: string;
  agentName?: string;
  title: string;
  description?: string;
  type?: DeliverableType;
  createdAt: string;
  updatedAt: string;
  format?: DeliverableFormat;
  content?: string;
  metadata?: JsonObject;
  versionNumber?: number;
  isCurrentVersion?: boolean;
  versionId?: string;
}
export interface DeliverableSearchResponse {
  items: DeliverableSearchResult[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
