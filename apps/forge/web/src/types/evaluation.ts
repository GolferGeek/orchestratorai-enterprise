// Types for message evaluation system
// Simplified type to avoid infinite type instantiation with JsonObject
type SimpleJsonObject = Record<string, unknown>;
export type UserRatingScale = 1 | 2 | 3 | 4 | 5;
export interface MessageEvaluation {
  userRating?: UserRatingScale;
  speedRating?: UserRatingScale;
  accuracyRating?: UserRatingScale;
  userNotes?: string;
  evaluationDetails?: {
    additionalMetrics?: Record<string, number>;
    tags?: string[];
    feedback?: string;
    userContext?: string;
    modelConfidence?: number;
  };
}
export interface EvaluationRequest {
  userRating?: UserRatingScale;
  speedRating?: UserRatingScale;
  accuracyRating?: UserRatingScale;
  userNotes?: string;
  evaluationDetails?: {
    additionalMetrics?: Record<string, number>;
    tags?: string[];
    feedback?: string;
    userContext?: string;
    modelConfidence?: number;
  };
}
export interface EvaluationResponse {
  id: string;
  messageId: string;
  userId: string;
  userRating?: UserRatingScale;
  speedRating?: UserRatingScale;
  accuracyRating?: UserRatingScale;
  userNotes?: string;
  evaluationDetails?: SimpleJsonObject;
  createdAt: string;
  updatedAt: string;
}
export interface AllEvaluationsFilters {
  page?: number;
  limit?: number;
  minRating?: UserRatingScale;
  maxRating?: UserRatingScale;
  hasNotes?: boolean;
  agentName?: string;
  userEmail?: string;
  startDate?: string;
  endDate?: string;
  hasWorkflowSteps?: boolean;
  hasConstraints?: boolean;
  [key: string]: number | UserRatingScale | boolean | string | undefined;
}
export interface WorkflowSteps {
  completedSteps: number;
  totalSteps: number;
  failedSteps: number;
  progressPercent: number;
  stepDetails?: Array<{
    name: string;
    status: string;
    duration?: number;
    error?: string;
  }>;
}

export interface LLMConstraints {
  activeStateModifiers?: string[];
  responseModifiers?: string[];
  executedCommands?: string[];
  constraintEffectiveness?: {
    modifierCompliance: number;
    constraintImpact: string;
    overallEffectiveness?: number;
  };
}

export interface LLMInfo {
  provider: string;
  model: string;
  responseTimeMs: number;
  cost: number;
  tokenUsage: {
    input: number;
    output: number;
  };
  temperature?: number;
  maxTokens?: number;
}

export interface TaskInfo {
  id: string;
  agentName: string;
  method: string;
  prompt: string;
  status: string;
  createdAt: string;
  completedAt?: string;
  progress?: number;
  response?: string;
}

export interface UserInfo {
  id: string;
  email: string;
  name?: string;
  roles: string[];
}

export interface EvaluationInfo {
  userRating: UserRatingScale;
  speedRating?: UserRatingScale;
  accuracyRating?: UserRatingScale;
  userNotes?: string;
  evaluationTimestamp: string;
  evaluationDetails?: SimpleJsonObject;
}

export interface EvaluationWithMessage {
  id: string;
  content: string;
  role: string;
  sessionId: string;
  userId: string;
  timestamp: string;
  order: number;
  // Nested structures for admin views
  task: TaskInfo;
  user: UserInfo;
  evaluation: EvaluationInfo;
  llmInfo: LLMInfo;
  workflowSteps?: WorkflowSteps;
  llmConstraints?: LLMConstraints;
  // Evaluation fields (direct, not nested) - for backwards compatibility
  userRating?: UserRatingScale;
  speedRating?: UserRatingScale;
  accuracyRating?: UserRatingScale;
  userNotes?: string;
  evaluationTimestamp?: string;
  evaluationDetails?: SimpleJsonObject;
  // Metadata for task evaluations
  metadata?: (SimpleJsonObject & {
    agentName?: string;
    taskType?: string;
    status?: string;
    taskPrompt?: string;
    taskResponse?: string;
    responseMetadata?: SimpleJsonObject;
    llmMetadata?: SimpleJsonObject;
    taskMetadata?: SimpleJsonObject;
    deliverableType?: string;
    workflowStepsCompleted?: string[];
    userEmail?: string;
  });
  // Optional fields
  providerName?: string;
  modelName?: string;
  responseTimeMs?: number;
  cost?: number;
  provider?: {
    id: string;
    name: string;
    description?: string;
  };
  model?: {
    id: string;
    name: string;
    description?: string;
    providerName: string;
  };
}
export interface AllEvaluationsResponse {
  evaluations: EvaluationWithMessage[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AgentLLMRecommendation {
  providerId?: string;
  providerName: string;
  modelId?: string;
  modelName: string;
  averageRating: number;
  evaluationCount: number;
  lastEvaluatedAt?: string;
}
