import { AgentTaskMode } from '../shared/enums';
export interface TaskMessage {
    role: string;
    content: any;
}
export interface TaskRequestParams {
    mode: AgentTaskMode;
    conversationId: string;
    sessionId?: string;
    planId?: string;
    orchestrationId?: string;
    orchestrationRunId?: string;
    orchestrationSlug?: string;
    payload: {
        action: string;
        [key: string]: any;
    };
    promptParameters?: Record<string, any>;
    userMessage: string;
    messages?: TaskMessage[];
    metadata: Record<string, any>;
}
export interface A2ATaskRequest {
    jsonrpc: '2.0';
    id: string | number | null;
    method: string;
    params: TaskRequestParams;
}
