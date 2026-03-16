export interface TaskResponsePayload {
    content: any;
    metadata: Record<string, any>;
}
export interface TaskResponse {
    success: boolean;
    mode: string;
    payload: TaskResponsePayload;
    humanResponse?: {
        message: string;
        [key: string]: any;
    };
    error?: {
        message: string;
        code?: string;
        [key: string]: any;
    };
}
export interface A2ATaskSuccessResponse {
    jsonrpc: '2.0';
    id: string | number | null;
    result: TaskResponse;
}
export interface A2ATaskErrorResponse {
    jsonrpc: '2.0';
    id: string | number | null;
    error: {
        code: number;
        message: string;
        data?: any;
    };
}
export type A2ATaskResponse = A2ATaskSuccessResponse | A2ATaskErrorResponse;
