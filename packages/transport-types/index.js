"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isStrictSuccessResponse = exports.isStrictErrorResponse = exports.isStrictConverseResponse = exports.isStrictBuildResponse = exports.isStrictPlanResponse = exports.A2AErrorCode = exports.JsonRpcErrorCode = exports.AgentTaskMode = void 0;
exports.isJsonRpcRequest = isJsonRpcRequest;
exports.isJsonRpcSuccessResponse = isJsonRpcSuccessResponse;
exports.isJsonRpcErrorResponse = isJsonRpcErrorResponse;
exports.isA2ATaskRequest = isA2ATaskRequest;
exports.isTaskResponse = isTaskResponse;
var enums_1 = require("./shared/enums");
Object.defineProperty(exports, "AgentTaskMode", { enumerable: true, get: function () { return enums_1.AgentTaskMode; } });
Object.defineProperty(exports, "JsonRpcErrorCode", { enumerable: true, get: function () { return enums_1.JsonRpcErrorCode; } });
Object.defineProperty(exports, "A2AErrorCode", { enumerable: true, get: function () { return enums_1.A2AErrorCode; } });
var strict_aliases_1 = require("./shared/strict-aliases");
Object.defineProperty(exports, "isStrictPlanResponse", { enumerable: true, get: function () { return strict_aliases_1.isStrictPlanResponse; } });
Object.defineProperty(exports, "isStrictBuildResponse", { enumerable: true, get: function () { return strict_aliases_1.isStrictBuildResponse; } });
Object.defineProperty(exports, "isStrictConverseResponse", { enumerable: true, get: function () { return strict_aliases_1.isStrictConverseResponse; } });
Object.defineProperty(exports, "isStrictErrorResponse", { enumerable: true, get: function () { return strict_aliases_1.isStrictErrorResponse; } });
Object.defineProperty(exports, "isStrictSuccessResponse", { enumerable: true, get: function () { return strict_aliases_1.isStrictSuccessResponse; } });
function isJsonRpcRequest(obj) {
    return (obj &&
        typeof obj === 'object' &&
        obj.jsonrpc === '2.0' &&
        typeof obj.method === 'string' &&
        ('id' in obj));
}
function isJsonRpcSuccessResponse(obj) {
    return (obj &&
        typeof obj === 'object' &&
        obj.jsonrpc === '2.0' &&
        'result' in obj &&
        ('id' in obj));
}
function isJsonRpcErrorResponse(obj) {
    return (obj &&
        typeof obj === 'object' &&
        obj.jsonrpc === '2.0' &&
        'error' in obj &&
        ('id' in obj));
}
function isA2ATaskRequest(obj) {
    return (isJsonRpcRequest(obj) &&
        obj.params &&
        typeof obj.params === 'object');
}
function isTaskResponse(obj) {
    return (obj &&
        typeof obj === 'object' &&
        typeof obj.success === 'boolean' &&
        typeof obj.mode === 'string');
}
//# sourceMappingURL=index.js.map