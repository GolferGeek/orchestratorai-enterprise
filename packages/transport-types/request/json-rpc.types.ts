/**
 * JSON-RPC 2.0 Base Types
 * Specification: https://www.jsonrpc.org/specification
 */

/**
 * JSON-RPC 2.0 Request
 * A remote procedure call request MUST contain these fields
 */
export interface JsonRpcRequest<TParams = any> {
  /**
   * A String specifying the version of the JSON-RPC protocol.
   * MUST be exactly "2.0"
   */
  jsonrpc: '2.0';

  /**
   * A String containing the name of the method to be invoked
   */
  method: string;

  /**
   * A Structured value that holds the parameter values to be used
   * during the invocation of the method
   */
  params: TParams;

  /**
   * An identifier established by the Client.
   * The Server MUST reply with the same value in the Response object if included.
   * Can be a String, Number, or NULL value if included by the Client.
   */
  id: string | number | null;
}

/**
 * JSON-RPC 2.0 Success Response
 */
export interface JsonRpcSuccessResponse<TResult = any> {
  /**
   * A String specifying the version of the JSON-RPC protocol.
   * MUST be exactly "2.0"
   */
  jsonrpc: '2.0';

  /**
   * This member MUST be included on success.
   * This member MUST NOT exist if there was an error invoking the method.
   */
  result: TResult;

  /**
   * This member is REQUIRED.
   * It MUST be the same as the value of the id member in the Request Object.
   */
  id: string | number | null;
}

/**
 * JSON-RPC 2.0 Error Object
 */
export interface JsonRpcError {
  /**
   * A Number that indicates the error type that occurred.
   * This MUST be an integer.
   */
  code: number;

  /**
   * A String providing a short description of the error.
   * The message SHOULD be limited to a concise single sentence.
   */
  message: string;

  /**
   * A Primitive or Structured value that contains additional information about the error.
   * This may be omitted.
   */
  data?: any;
}

/**
 * JSON-RPC 2.0 Error Response
 */
export interface JsonRpcErrorResponse {
  /**
   * A String specifying the version of the JSON-RPC protocol.
   * MUST be exactly "2.0"
   */
  jsonrpc: '2.0';

  /**
   * This member MUST be included on error.
   * This member MUST NOT exist if there was no error triggered during invocation.
   */
  error: JsonRpcError;

  /**
   * This member is REQUIRED.
   * It MUST be the same as the value of the id member in the Request Object.
   * If there was an error in detecting the id in the Request object, it MUST be null.
   */
  id: string | number | null;
}

/**
 * JSON-RPC 2.0 Response (Success or Error)
 */
export type JsonRpcResponse<TResult = any> =
  | JsonRpcSuccessResponse<TResult>
  | JsonRpcErrorResponse;
