/**
 * Message Type Definitions
 * Domain-specific types for conversation messages
 */

// =====================================
// MESSAGE METADATA
// =====================================

/**
 * Metadata for messages
 * Extensible structure for message-level information
 */
export interface MessageMetadata {
  /** Source of the message */
  source?: 'user' | 'agent' | 'system';

  /** Agent information (for assistant messages) */
  agent?: {
    id: string;
    type: string;
    name?: string;
    model?: string;
  };

  /** Message intent/category */
  intent?: {
    type: string;
    confidence?: number;
    categories?: string[];
  };

  /** Referenced entities */
  references?: {
    messageIds?: string[];
    taskIds?: string[];
    deliverableIds?: string[];
    fileIds?: string[];
    urls?: string[];
  };

  /** Generation metadata (for AI responses) */
  generation?: {
    model: string;
    provider: string;
    temperature?: number;
    maxTokens?: number;
    tokensUsed?: number;
    cost?: number;
    duration?: number;
    finishReason?: string;
  };

  /** Privacy/security flags */
  privacy?: {
    containsPII?: boolean;
    sanitized?: boolean;
    encrypted?: boolean;
    dataProtectionLevel?: 'none' | 'partial' | 'full';
  };

  /** User interaction tracking */
  interaction?: {
    edited?: boolean;
    editedAt?: string;
    deleted?: boolean;
    deletedAt?: string;
    reactions?: Array<{
      type: string;
      userId?: string;
      timestamp: string;
    }>;
    flagged?: boolean;
    flagReason?: string;
  };

  /** Quality assessment */
  quality?: {
    rating?: number;
    ratedBy?: string;
    ratedAt?: string;
    helpful?: boolean;
    accurate?: boolean;
    complete?: boolean;
  };

  // Marketing Swarm metadata (stored at message level for conversation restoration)
  /** Marketing Swarm task ID */
  marketingSwarmTaskId?: string;
  /** Whether Marketing Swarm execution is completed */
  marketingSwarmCompleted?: boolean;
  /** Task ID for the execution */
  taskId?: string;
  /** Number of outputs generated */
  outputCount?: number;
  /** Number of evaluations */
  evaluationCount?: number;
  /** Deliverable ID for completed swarm */
  deliverableId?: string;

  /** Custom metadata fields */
  custom?: Record<string, string | number | boolean>;

  /** RAG sources (for RAG agent responses) */
  sources?: Array<{
    document: string;
    documentId: string;
    score: number;
    excerpt: string;
    charOffset?: number;
    documentIdRef?: string;
    sectionPath?: string;
    matchType?: string;
    version?: string;
  }>;
}

// =====================================
// CONVERSATION METADATA
// =====================================

/**
 * Metadata for conversations
 * Tracks conversation-level information
 */
export interface ConversationMetadata {
  /** Conversation title */
  title?: string;

  /** Conversation description */
  description?: string;

  /** Conversation category/type */
  category?: string;

  /** Tags for organization */
  tags?: string[];

  /** Primary agent for this conversation */
  primaryAgent?: {
    id: string;
    type: string;
    name?: string;
  };

  /** Conversation mode */
  mode?: 'chat' | 'orchestration' | 'task' | 'evaluation';

  /** Project/deliverable association */
  associations?: {
    projectId?: string;
    deliverableId?: string;
    orchestrationId?: string;
  };

  /** Participant tracking */
  participants?: Array<{
    userId?: string;
    agentId?: string;
    role: 'owner' | 'participant' | 'observer';
    joinedAt: string;
  }>;

  /** Conversation state */
  state?: {
    isPinned?: boolean;
    isArchived?: boolean;
    isLocked?: boolean;
    isPublic?: boolean;
  };

  /** Statistics */
  stats?: {
    messageCount?: number;
    taskCount?: number;
    lastActivityAt?: string;
    totalDuration?: number;
    totalCost?: number;
    totalTokens?: number;
  };

  /** User preferences for this conversation */
  preferences?: {
    notificationsEnabled?: boolean;
    autoSave?: boolean;
    theme?: string;
    layout?: string;
  };

  /** Custom metadata fields */
  custom?: Record<string, string | number | boolean>;
}

// =====================================
// MESSAGE TYPES
// =====================================

export type MessageRole = 'user' | 'assistant' | 'system';

export type MessageStatus =
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'deleted';

// =====================================
// MAIN INTERFACES
// =====================================

/**
 * Message record
 */
export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  agentId?: string;
  taskId?: string;
  status?: MessageStatus;
  createdAt: string;
  updatedAt?: string;
  metadata?: MessageMetadata;
}

/**
 * Conversation record
 */
export interface Conversation {
  id: string;
  userId?: string;
  agentType?: string;
  title?: string;
  isActive: boolean;
  lastMessageAt?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: ConversationMetadata;
  messageCount?: number;
}

// =====================================
// CREATION PAYLOADS
// =====================================

/**
 * Payload for creating a new message
 */
export interface CreateMessagePayload {
  conversationId: string;
  role: MessageRole;
  content: string;
  agentId?: string;
  taskId?: string;
  metadata?: MessageMetadata;
}

/**
 * Payload for creating a new conversation
 */
export interface CreateConversationPayload {
  userId?: string;
  agentType?: string;
  title?: string;
  metadata?: ConversationMetadata;
}

/**
 * Payload for updating a message
 */
export interface UpdateMessagePayload {
  content?: string;
  status?: MessageStatus;
  metadata?: Partial<MessageMetadata>;
}

/**
 * Payload for updating a conversation
 */
export interface UpdateConversationPayload {
  title?: string;
  isActive?: boolean;
  metadata?: Partial<ConversationMetadata>;
}

// =====================================
// FILTERING & SORTING
// =====================================

/**
 * Filters for querying messages
 */
export interface MessageFilters {
  conversationId?: string;
  role?: MessageRole | MessageRole[];
  agentId?: string;
  taskId?: string;
  status?: MessageStatus | MessageStatus[];
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  containsPII?: boolean;
}

/**
 * Filters for querying conversations
 */
export interface ConversationFilters {
  userId?: string;
  agentType?: string | string[];
  isActive?: boolean;
  category?: string;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

/**
 * Sort options for messages
 */
export interface MessageSortOptions {
  field: 'createdAt' | 'updatedAt';
  direction: 'asc' | 'desc';
}

/**
 * Sort options for conversations
 */
export interface ConversationSortOptions {
  field: 'createdAt' | 'updatedAt' | 'lastMessageAt' | 'messageCount';
  direction: 'asc' | 'desc';
}

// =====================================
// AGGREGATIONS
// =====================================

/**
 * Message statistics
 */
export interface MessageStatistics {
  total: number;
  byRole: Record<MessageRole, number>;
  byAgent: Record<string, number>;
  averageLength: number;
  withPII: number;
  sanitized: number;
}

/**
 * Conversation statistics
 */
export interface ConversationStatistics {
  total: number;
  active: number;
  archived: number;
  byAgentType: Record<string, number>;
  averageMessages: number;
  totalMessages: number;
}
