export interface JsonRpcRequest<TParams = any> {
    jsonrpc: '2.0';
    method: string;
    params: TParams;
    id: string | number | null;
}
export interface JsonRpcSuccessResponse<TResult = any> {
    jsonrpc: '2.0';
    result: TResult;
    id: string | number | null;
}
export interface JsonRpcError {
    code: number;
    message: string;
    data?: any;
}
export interface JsonRpcErrorResponse {
    jsonrpc: '2.0';
    error: JsonRpcError;
    id: string | number | null;
}
export type JsonRpcResponse<TResult = any> = JsonRpcSuccessResponse<TResult> | JsonRpcErrorResponse;
