export declare enum AgentTaskMode {
    CONVERSE = "converse",
    PLAN = "plan",
    BUILD = "build",
    HUMAN_RESPONSE = "human_response",
    ORCHESTRATE_CREATE = "orchestrate_create",
    ORCHESTRATE_EXECUTE = "orchestrate_execute",
    ORCHESTRATE_CONTINUE = "orchestrate_continue",
    ORCHESTRATE_SAVE_RECIPE = "orchestrate_save_recipe",
    ORCHESTRATOR_PLAN_CREATE = "orchestrator_plan_create",
    ORCHESTRATOR_PLAN_UPDATE = "orchestrator_plan_update",
    ORCHESTRATOR_PLAN_REVIEW = "orchestrator_plan_review",
    ORCHESTRATOR_PLAN_APPROVE = "orchestrator_plan_approve",
    ORCHESTRATOR_PLAN_REJECT = "orchestrator_plan_reject",
    ORCHESTRATOR_PLAN_ARCHIVE = "orchestrator_plan_archive",
    ORCHESTRATOR_RUN_START = "orchestrator_run_start",
    ORCHESTRATOR_RUN_CONTINUE = "orchestrator_run_continue",
    ORCHESTRATOR_RUN_PAUSE = "orchestrator_run_pause",
    ORCHESTRATOR_RUN_RESUME = "orchestrator_run_resume",
    ORCHESTRATOR_RUN_HUMAN_RESPONSE = "orchestrator_run_human_response",
    ORCHESTRATOR_RUN_ROLLBACK_STEP = "orchestrator_run_rollback_step",
    ORCHESTRATOR_RUN_CANCEL = "orchestrator_run_cancel",
    ORCHESTRATOR_RUN_EVALUATE = "orchestrator_run_evaluate",
    ORCHESTRATOR_RECIPE_SAVE = "orchestrator_recipe_save",
    ORCHESTRATOR_RECIPE_UPDATE = "orchestrator_recipe_update",
    ORCHESTRATOR_RECIPE_VALIDATE = "orchestrator_recipe_validate",
    ORCHESTRATOR_RECIPE_DELETE = "orchestrator_recipe_delete",
    ORCHESTRATOR_RECIPE_LOAD = "orchestrator_recipe_load",
    ORCHESTRATOR_RECIPE_LIST = "orchestrator_recipe_list"
}
export type JsonRpcMethod = 'converse' | 'agent.converse' | 'tasks.converse' | 'plan' | 'agent.plan' | 'tasks.plan' | 'build' | 'agent.build' | 'tasks.build' | 'orchestrate.create' | 'orchestrate.execute' | 'orchestrate.continue' | string;
export declare enum JsonRpcErrorCode {
    PARSE_ERROR = -32700,
    INVALID_REQUEST = -32600,
    METHOD_NOT_FOUND = -32601,
    INVALID_PARAMS = -32602,
    INTERNAL_ERROR = -32603,
    SERVER_ERROR_START = -32099,
    SERVER_ERROR_END = -32000
}
export declare enum A2AErrorCode {
    UNAUTHORIZED = -32001,
    FORBIDDEN = -32003,
    NOT_FOUND = -32004,
    CONFLICT = -32009,
    RATE_LIMITED = -32042
}
