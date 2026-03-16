export interface ConverseModePayload {
    temperature?: number;
    maxTokens?: number;
    stop?: string[];
}
export interface ConverseRequestMetadata {
    source: string;
    userId: string;
    context?: string;
}
export interface ConverseResponseMetadata {
    provider: string;
    model: string;
    usage: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        cost: number;
    };
    routingDecision?: Record<string, any>;
    streamId?: string;
}
export interface ConverseResponseContent {
    message: string;
}
